// Runs the real two-pass reader on the labelled dataset and scores every field.
//   npx tsx scripts/ocr/evaluate.ts dev            → tune on dev
//   npx tsx scripts/ocr/evaluate.ts test --write   → final held-out score, saved to src/data/ocr-eval.json
import { loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorker, type Worker } from 'tesseract.js';
import type { Institution } from '../../src/data/types';
import { readFdrImage, type Engines, type OcrEngine } from '../../src/lib/ocr/pipeline';
import { wordsFromPage } from '../../src/lib/ocr/tesseract-adapter';
import { FIELD_KEYS, type FieldKey } from '../../src/lib/ocr/types';
import type { LabelRow } from './build-dataset';
import { DATASET_DIR, encodePng, LANG_PATH, LEGACY_LANG_PATH, make, ROOT } from './node-canvas';

const split = (process.argv[2] ?? 'dev') as 'dev' | 'test' | 'all';
const write = process.argv.includes('--write');
const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? Infinity);
const WORKERS = 4;
const qualityFilter = process.argv.find((a) => a.startsWith('--quality='))?.split('=')[1];
const layoutFilter = process.argv.find((a) => a.startsWith('--layout='))?.split('=')[1];
const USE_LEGACY = !process.argv.includes('--no-legacy');

const rows = (JSON.parse(readFileSync(join(DATASET_DIR, 'labels.json'), 'utf8')) as LabelRow[]).filter((r) => split === 'all' || r.split === split)
  .filter((r) => !qualityFilter || r.quality === qualityFilter).filter((r) => !layoutFilter || r.template === layoutFilter).slice(0, limit);
const trusts = (JSON.parse(readFileSync(join(ROOT, 'src/data/institutions.json'), 'utf8')) as Institution[]).map((i) => i.trustName);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function correct(k: FieldKey, got: string | null, want: string): boolean {
  if (got === null) return false;
  if (k === 'amount' || k === 'interestRate') return Math.abs(Number(got) - Number(want)) < 0.005;
  if (k === 'accountHolder' || k === 'branch') return norm(got) === norm(want);
  return got.toUpperCase() === want.toUpperCase();
}

function engineFor(worker: Worker): OcrEngine {
  return {
    async recognize(canvas, params) {
      await worker.setParameters({ tessedit_pageseg_mode: params.psm as never, tessedit_char_whitelist: params.whitelist ?? '', preserve_interword_spaces: '1', user_defined_dpi: '300' });
      const { data } = await worker.recognize(encodePng(canvas), {}, { blocks: true });
      return wordsFromPage(data as never);
    },
  };
}

interface Outcome { row: LabelRow; fields: Record<FieldKey, { ok: boolean; flagged: boolean; got: string | null; conf: number; source: string }>; ms: number; rereads: number; textPx: number }

const workers = await Promise.all(Array.from({ length: WORKERS }, () => createWorker('eng', 1, { langPath: LANG_PATH, gzip: true, cachePath: join(DATASET_DIR, '.tess-cache') })));
const legacyWorkers = USE_LEGACY ? await Promise.all(Array.from({ length: WORKERS }, () => createWorker('eng', 0, { langPath: LEGACY_LANG_PATH, gzip: true, legacyCore: true, legacyLang: true, cachePath: join(DATASET_DIR, '.tess-cache-legacy') }))) : [];
const outcomes: Outcome[] = [];
let next = 0, done = 0;
const t0 = Date.now();
await Promise.all(workers.map(async (w, wi) => {
  const engine: Engines = { lstm: engineFor(w), legacy: legacyWorkers[wi] ? engineFor(legacyWorkers[wi]) : undefined };
  while (next < rows.length) {
    const row = rows[next++];
    const img = await loadImage(readFileSync(join(DATASET_DIR, row.file)));
    const c = make(img.width, img.height);
    c.getContext('2d')!.drawImage(img as never, 0, 0);
    const res = await readFdrImage(c, engine, make, { knownHolders: trusts });
    const fields = {} as Outcome['fields'];
    for (const k of FIELD_KEYS) {
      const f = res.result.fields[k];
      fields[k] = { ok: correct(k, f.value, row.truth[k]), flagged: f.flagged, got: f.value, conf: f.confidence, source: f.source };
    }
    outcomes.push({ row, fields, ms: res.ms, rereads: res.reread.length, textPx: res.textPx });
    if (++done % 20 === 0) process.stdout.write(`  ${done}/${rows.length} (${Math.round((Date.now() - t0) / 1000)}s)\n`);
  }
}));
await Promise.all([...workers, ...legacyWorkers].map((w) => w.terminate()));

// ── scoring ──
type Tally = { total: number; correct: number; flagged: number; silent: number; caught: number; autoAccepted: number };
const blank = (): Tally => ({ total: 0, correct: 0, flagged: 0, silent: 0, caught: 0, autoAccepted: 0 });
const byField = Object.fromEntries(FIELD_KEYS.map((k) => [k, blank()])) as Record<FieldKey, Tally>;
const byQuality: Record<string, Tally & { docs: number; docsPerfect: number; docsNoFlags: number }> = {};
const byTemplate: Record<string, Tally> = {};
const silentList: string[] = [];
for (const o of outcomes) {
  const q = (byQuality[o.row.quality] ??= { ...blank(), docs: 0, docsPerfect: 0, docsNoFlags: 0 });
  const t = (byTemplate[o.row.template] ??= blank());
  q.docs++;
  if (FIELD_KEYS.every((k) => o.fields[k].ok)) q.docsPerfect++;
  if (FIELD_KEYS.every((k) => !o.fields[k].flagged)) q.docsNoFlags++;
  for (const k of FIELD_KEYS) {
    const f = o.fields[k];
    for (const tl of [byField[k], q, t]) {
      tl.total++;
      if (f.ok) tl.correct++;
      if (f.flagged) tl.flagged++;
      if (!f.flagged) tl.autoAccepted++;
      if (!f.ok && !f.flagged) tl.silent++;
      if (!f.ok && f.flagged) tl.caught++;
    }
    if (!f.ok && !f.flagged) silentList.push(`${o.row.file} ${k}: got "${f.got}" want "${o.row.truth[k]}" (conf ${f.conf.toFixed(2)}, ${f.source})`);
  }
}
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
const line = (name: string, t: Tally) => `${name.padEnd(14)} acc ${pct(t.correct, t.total).padStart(6)}   flagged ${pct(t.flagged, t.total).padStart(6)}   silent errors ${String(t.silent).padStart(3)}   auto-accepted precision ${pct(t.autoAccepted - t.silent, t.autoAccepted).padStart(6)}`;

console.log(`\n=== ${split.toUpperCase()} · ${outcomes.length} documents · ${outcomes.length * FIELD_KEYS.length} fields · ${Math.round((Date.now() - t0) / 1000)}s ===`);
console.log('\nBy field');
for (const k of FIELD_KEYS) console.log('  ' + line(k, byField[k]));
console.log('\nBy quality');
for (const [q, t] of Object.entries(byQuality)) console.log('  ' + line(q, t) + `   docs perfect ${pct(t.docsPerfect, t.docs)}   docs with no flags ${pct(t.docsNoFlags, t.docs)}`);
const quals = [...new Set(outcomes.map((o) => o.row.quality))];
console.log('\nText height in original pixels (min / median / max)');
for (const q of quals) {
  const v = outcomes.filter((o) => o.row.quality === q).map((o) => o.textPx).sort((a, b) => a - b);
  console.log('  ' + q.padEnd(10) + [v[0], v[Math.floor(v.length / 2)], v[v.length - 1]].map((x) => x.toFixed(1).padStart(7)).join(''));
}
console.log('\nAccuracy by field × quality');
console.log('  ' + ''.padEnd(14) + quals.map((q) => q.padStart(9)).join(''));
for (const k of FIELD_KEYS) {
  console.log('  ' + k.padEnd(14) + quals.map((q) => {
    const os = outcomes.filter((o) => o.row.quality === q);
    return pct(os.filter((o) => o.fields[k].ok).length, os.length).padStart(9);
  }).join(''));
}
console.log('\nBy layout');
for (const [k, t] of Object.entries(byTemplate)) console.log('  ' + line(k, t));
const all = Object.values(byField).reduce((a, t) => ({ total: a.total + t.total, correct: a.correct + t.correct, flagged: a.flagged + t.flagged, silent: a.silent + t.silent, caught: a.caught + t.caught, autoAccepted: a.autoAccepted + t.autoAccepted }), blank());
console.log('\n  ' + line('ALL FIELDS', all));
console.log(`  mean time per document ${Math.round(outcomes.reduce((a, o) => a + o.ms, 0) / outcomes.length)}ms (Node, 1 worker each)`);
if (silentList.length) { console.log(`\nSILENT ERRORS (${silentList.length}):`); silentList.slice(0, 40).forEach((s) => console.log('  ' + s)); }

if (process.argv.includes('--wrong')) {
  console.log('\nCAUGHT (wrong but flagged), first 40:');
  outcomes.flatMap((o) => FIELD_KEYS.filter((k) => !o.fields[k].ok && o.fields[k].flagged).map((k) => `${o.row.file} ${k}: got "${o.fields[k].got}" want "${o.row.truth[k]}" (${o.fields[k].source})`)).slice(0, 40).forEach((s) => console.log('  ' + s));
  console.log('\nCORRECT BUT FLAGGED, first 40:');
  outcomes.flatMap((o) => FIELD_KEYS.filter((k) => o.fields[k].ok && o.fields[k].flagged).map((k) => `${o.row.file} ${k}: "${o.fields[k].got}" conf ${o.fields[k].conf.toFixed(2)} (${o.fields[k].source})`)).slice(0, 40).forEach((s) => console.log('  ' + s));
}

if (write) {
  const summary = (t: Tally) => ({ fields: t.total, correct: t.correct, flagged: t.flagged, silentErrors: t.silent, accuracy: t.correct / t.total, flagRate: t.flagged / t.total, autoAcceptPrecision: t.autoAccepted ? (t.autoAccepted - t.silent) / t.autoAccepted : 1 });
  const report = {
    generatedAt: new Date().toISOString(),
    split, documents: outcomes.length,
    engine: 'Tesseract 5 LSTM (tesseract.js 7, eng best_int) + FDR Sentinel two-pass extractor',
    overall: summary(all),
    byField: Object.fromEntries(FIELD_KEYS.map((k) => [k, summary(byField[k])])),
    byQuality: Object.fromEntries(Object.entries(byQuality).map(([q, t]) => [q, { ...summary(t), documents: t.docs, documentsPerfect: t.docsPerfect, documentsNoFlags: t.docsNoFlags }])),
    byTemplate: Object.fromEntries(Object.entries(byTemplate).map(([k, t]) => [k, summary(t)])),
    meanMsPerDocument: Math.round(outcomes.reduce((a, o) => a + o.ms, 0) / outcomes.length),
  };
  writeFileSync(join(ROOT, 'src/data/ocr-eval.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('\nSaved src/data/ocr-eval.json');
}
