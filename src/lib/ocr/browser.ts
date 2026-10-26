// Browser side of the reader: loads files into a canvas and runs the same two-pass pipeline the evaluation used,
// with the OCR engines served locally from /tesseract (no CDN needed at demo time).
import { createWorker, type Worker } from 'tesseract.js';
import type { CanvasFactory, CanvasLike } from '../fdrdoc/augment';
import { readFdrImage, type Engines, type OcrEngine, type ReadResult } from './pipeline';
import { wordsFromPage } from './tesseract-adapter';
import type { ExtractOptions } from './extract';

export const makeCanvas: CanvasFactory = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c as unknown as CanvasLike;
};

const BASE = `${import.meta.env.BASE_URL}tesseract`;
let enginesPromise: Promise<Engines> | null = null;
let loadListener: ((p: number) => void) | null = null;

function engineFor(worker: Worker): OcrEngine {
  return {
    async recognize(canvas, params) {
      await worker.setParameters({ tessedit_pageseg_mode: params.psm as never, tessedit_char_whitelist: params.whitelist ?? '', preserve_interword_spaces: '1', user_defined_dpi: '300' });
      const { data } = await worker.recognize(canvas as unknown as HTMLCanvasElement, {}, { blocks: true });
      return wordsFromPage(data as never);
    },
  };
}

/** Starts (once) the LSTM engine and the legacy engine used as an independent second opinion. */
export function loadEngines(onProgress?: (fraction: number) => void): Promise<Engines> {
  if (onProgress) loadListener = onProgress;
  if (!enginesPromise) {
    let lstmDone = 0, legacyDone = 0;
    const report = () => loadListener?.((lstmDone + legacyDone) / 2);
    const logger = (which: 'lstm' | 'legacy') => (m: { status: string; progress: number }) => {
      if (m.status.includes('loading') || m.status.includes('initializ')) {
        if (which === 'lstm') lstmDone = Math.max(lstmDone, m.progress); else legacyDone = Math.max(legacyDone, m.progress);
        report();
      }
    };
    const lstmOpts = { workerPath: `${BASE}/worker.min.js`, corePath: `${BASE}/core`, langPath: `${BASE}/lang/lstm`, gzip: true };
    enginesPromise = Promise.all([
      createWorker('eng', 1, { ...lstmOpts, logger: logger('lstm') }),
      createWorker('eng', 1, lstmOpts),
      createWorker('eng', 0, { workerPath: `${BASE}/worker.min.js`, corePath: `${BASE}/core`, langPath: `${BASE}/lang/legacy`, gzip: true, legacyCore: true, legacyLang: true, logger: logger('legacy') }),
    ]).then(([lstm, lstm2, legacy]) => { lstmDone = legacyDone = 1; report(); return { lstm: engineFor(lstm), lstm2: engineFor(lstm2), legacy: engineFor(legacy) }; })
      .catch((e) => { enginesPromise = null; throw e; });
  }
  return enginesPromise;
}

/** Image or PDF (first page) → canvas. */
export async function fileToCanvas(file: Blob & { type: string; name?: string }): Promise<CanvasLike> {
  if (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(4, 2000 / base.width) });
    const c = makeCanvas(viewport.width, viewport.height);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport, canvas: c as unknown as HTMLCanvasElement }).promise;
    return c;
  }
  const bmp = await createImageBitmap(file);
  const c = makeCanvas(bmp.width, bmp.height);
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close();
  return c;
}

export async function readDocument(file: Blob & { type: string; name?: string }, opts: ExtractOptions,
  onStage?: (stage: 'load' | 'prepare' | 'page' | 'reread' | 'done', detail?: string) => void): Promise<ReadResult & { original: CanvasLike }> {
  onStage?.('load');
  const [engines, original] = await Promise.all([loadEngines(), fileToCanvas(file)]);
  const res = await readFdrImage(original, engines, makeCanvas, opts, onStage);
  return { ...res, original };
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 64-bit difference hash: survives re-scans, resizing and JPEG; used by MTDI's image-similarity view. */
export function dHash(src: CanvasLike): string {
  const c = makeCanvas(9, 8);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src as unknown as CanvasImageSource, 0, 0, 9, 8);
  const d = ctx.getImageData(0, 0, 9, 8).data;
  const lum = (x: number, y: number) => { const i = (y * 9 + x) * 4; return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; };
  let bits = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits = (bits << 1n) | (lum(x, y) > lum(x + 1, y) ? 1n : 0n);
  return bits.toString(16).padStart(16, '0');
}

export function thumbnail(src: CanvasLike, maxW = 900, quality = 0.72): string {
  const s = Math.min(1, maxW / src.width);
  const c = makeCanvas(src.width * s, src.height * s);
  c.getContext('2d')!.drawImage(src as unknown as CanvasImageSource, 0, 0, c.width, c.height);
  return (c as unknown as HTMLCanvasElement).toDataURL('image/jpeg', quality);
}
