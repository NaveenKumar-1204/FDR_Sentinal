// Two-pass FDR reader shared by the browser upload and the Node evaluation.
//   Pass 1: whole page → words → fields + cross-checks.
//   Pass 2: each key value is cropped and read again by an ensemble — the LSTM engine at two scales (one sharpened)
//           and, when available, Tesseract's legacy engine, whose mistakes are unrelated to the LSTM's. The extractor
//           then votes: a value is accepted only when independent reads agree.
import type { CanvasFactory, CanvasLike } from '../fdrdoc/augment';
import { extractFields, REREAD_GROUPS, type ExtractOptions, type LabelField, type ReadAlt, type Rereads } from './extract';
import { prepareForOcr } from './preprocess';
import { FIELD_KEYS, type Bbox, type ExtractResult, type OcrWord } from './types';

export interface RecognizeParams {
  /** Tesseract page segmentation mode: '3' auto page, '6' block, '7' single line. */
  psm: '3' | '6' | '7' | '11';
  whitelist?: string;
}

export interface OcrEngine {
  recognize(canvas: CanvasLike, params: RecognizeParams): Promise<OcrWord[]>;
}

export interface Engines {
  lstm: OcrEngine;
  /** Optional second LSTM worker so the two LSTM re-reads run in parallel. */
  lstm2?: OcrEngine;
  /** Tesseract's pre-LSTM engine — optional second opinion with independent failure modes. */
  legacy?: OcrEngine;
}

export interface ReadResult {
  result: ExtractResult;
  prepared: CanvasLike;
  skew: number;
  firstPass: ExtractResult;
  reread: LabelField[];
  cropReads: number;
  /** Median word height in the ORIGINAL image, in pixels — a proxy for resolution. */
  textPx: number;
  ms: number;
}

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/** Values that are always re-read and voted on, because no arithmetic check can catch a misread digit in them. */
const ALWAYS: LabelField[] = ['fdrNumber', 'ifsc', 'issueDate', 'maturityDate', 'tenure', 'branch', 'accountHolder'];
const TEXT_FIELDS: LabelField[] = ['accountHolder', 'branch', 'amountWords'];
/** Below this text height (original pixels) printed digits are never auto-accepted. */
export const MIN_TEXT_PX = 11;

function paramsFor(field: LabelField, box: Bbox, lineH: number, firstText: string, numericFdr: boolean): RecognizeParams {
  const multiLine = box.y1 - box.y0 > lineH * 1.9;
  switch (field) {
    case 'ifsc': return { psm: '7', whitelist: ALNUM };
    case 'fdrNumber': return { psm: '7', whitelist: numericFdr ? '0123456789' : ALNUM };
    case 'amount': case 'maturityValue': return { psm: '7', whitelist: '0123456789,.RsINR' };
    case 'interestRate': return { psm: '7', whitelist: '0123456789.%pa' };
    case 'issueDate': case 'maturityDate': return /[A-Za-z]{3}/.test(firstText) ? { psm: '7' } : { psm: '7', whitelist: '0123456789/-.' };
    default: return { psm: multiLine ? '6' : '7' };
  }
}

function sharpen(img: ImageData) {
  const { data, width: w, height: h } = img;
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; p < w * h; i += 4, p++) g[p] = data[i];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x;
    const v = 5 * g[p] - g[p - 1] - g[p + 1] - g[p - w] - g[p + w];
    const i = p * 4;
    data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, v));
  }
}

function crop(src: CanvasLike, box: Bbox, lineH: number, make: CanvasFactory, capPx: number, doSharpen: boolean, right: number): CanvasLike {
  // Tight padding: wide crops pick up the label's colon or the neighbouring column, which a restricted
  // character set then forces into wrong characters.
  const padX = lineH * 0.45, padY = lineH * 0.35;
  const b = { x0: Math.max(0, box.x0 - padX), y0: Math.max(0, box.y0 - padY), x1: Math.min(src.width, Math.max(box.x1 + padX, right)), y1: Math.min(src.height, box.y1 + padY) };
  const w = Math.max(1, b.x1 - b.x0), h = Math.max(1, b.y1 - b.y0);
  const scale = Math.min(3, Math.max(1, capPx / lineH));
  const margin = 20;
  const out = make(w * scale + margin * 2, h * scale + margin * 2);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src as unknown as CanvasImageSource, b.x0, b.y0, w, h, margin, margin, w * scale, h * scale);
  if (doSharpen) {
    const img = ctx.getImageData(0, 0, out.width, out.height);
    sharpen(img);
    ctx.putImageData(img, 0, 0);
  }
  return out;
}

/** Which labelled values to re-read: the always-voted ones, plus everything behind an unconfirmed field. */
function rereadTargets(r: ExtractResult): LabelField[] {
  const set = new Set<LabelField>(ALWAYS);
  for (const k of FIELD_KEYS) {
    const f = r.fields[k];
    if (f.flagged || f.confidence < 0.97) REREAD_GROUPS[k].forEach((x) => set.add(x));
  }
  if (r.fields.accountHolder.source === 'dictionary' && !r.fields.accountHolder.flagged) set.delete('accountHolder');
  return [...set].filter((f) => r.valueBoxes[f]);
}

function asEngines(e: Engines | OcrEngine): Engines {
  return 'lstm' in e ? e : { lstm: e };
}

export async function readFdrImage(src: CanvasLike, engines: Engines | OcrEngine, make: CanvasFactory, opts: ExtractOptions = {},
  onStage?: (stage: 'prepare' | 'page' | 'reread' | 'done', detail?: string) => void): Promise<ReadResult> {
  const { lstm, lstm2, legacy } = asEngines(engines);
  const t0 = Date.now();
  onStage?.('prepare');
  const prep = prepareForOcr(src, make);
  onStage?.('page');
  const words = await lstm.recognize(prep.canvas, { psm: '3' });
  const first = extractFields(words, opts);

  const targets = rereadTargets(first);
  const numericFdr = !first.fields.fdrNumber.value || /^\d+$/.test(first.fields.fdrNumber.value);
  const rereads: Rereads = {};
  let cropReads = 0;
  const variants: { engine: OcrEngine; cap: number; sharp: boolean }[] = [
    { engine: lstm, cap: 48, sharp: false },
    { engine: lstm2 ?? lstm, cap: 34, sharp: true },
    ...(legacy ? [{ engine: legacy, cap: 44, sharp: false }] : []),
  ];
  const jobs = targets.map((f) => {
    const box = first.valueBoxes[f]!;
    const firstText = words.filter((w) => w.bbox.x0 >= box.x0 - 1 && w.bbox.x1 <= box.x1 + 1 && w.bbox.y0 >= box.y0 - 1 && w.bbox.y1 <= box.y1 + 1).map((w) => w.text).join(' ');
    // Text values may have lost a trailing word in pass 1, so look further right (up to the next column).
    const reach = TEXT_FIELDS.includes(f) ? 12 : 2.5;
    return { f, box, params: paramsFor(f, box, first.lineHeight, firstText, numericFdr), right: Math.min(first.valueRight[f] ?? Infinity, box.x1 + first.lineHeight * reach) };
  });
  // Each engine works through its own queue; different engines run in parallel. (One engine must not interleave
  // jobs, because its character whitelist is a per-worker setting.)
  const slots: (ReadAlt | null)[][] = jobs.map(() => variants.map(() => null));
  const byEngine = new Map<OcrEngine, number[]>();
  variants.forEach((v, i) => byEngine.set(v.engine, [...(byEngine.get(v.engine) ?? []), i]));
  let done = 0;
  await Promise.all([...byEngine.entries()].map(async ([engine, vIdx]) => {
    for (const [j, job] of jobs.entries()) {
      for (const vi of vIdx) {
        const v = variants[vi];
        const got = (await engine.recognize(crop(prep.canvas, job.box, first.lineHeight, make, v.cap, v.sharp, job.right), job.params))
          .filter((w) => /[A-Za-z0-9]/.test(w.text))
          .map((w) => ({ ...w, text: w.text.replace(/^[^A-Za-z0-9₹(]+/, '') }));
        cropReads++;
        onStage?.('reread', `${++done} of ${jobs.length * variants.length}`);
        const text = got.map((w) => w.text).join(' ').trim();
        if (text) slots[j][vi] = { text, conf: Math.min(...got.map((w) => w.conf)), box: job.box };
      }
    }
  }));
  jobs.forEach((job, j) => { const list = slots[j].filter((x): x is ReadAlt => !!x); if (list.length) rereads[job.f] = list; });
  const textPx = first.lineHeight / prep.scale;
  const result = extractFields(words, { ...opts, lowResolution: textPx < MIN_TEXT_PX, textPx }, rereads);
  onStage?.('done');
  return { result, prepared: prep.canvas, skew: prep.skew, firstPass: first, reread: targets, cropReads, textPx, ms: Date.now() - t0 };
}
