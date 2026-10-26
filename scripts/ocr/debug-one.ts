// Debug a single dataset image: npx tsx scripts/ocr/debug-one.ts dev/0003-modern-phone.jpg
import { loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorker } from 'tesseract.js';
import type { Institution } from '../../src/data/types';
import { readFdrImage } from '../../src/lib/ocr/pipeline';
import { wordsFromPage } from '../../src/lib/ocr/tesseract-adapter';
import { FIELD_KEYS } from '../../src/lib/ocr/types';
import type { LabelRow } from './build-dataset';
import { DATASET_DIR, encodePng, LANG_PATH, LEGACY_LANG_PATH, make, ROOT } from './node-canvas';

const file = process.argv[2];
const row = (JSON.parse(readFileSync(join(DATASET_DIR, 'labels.json'), 'utf8')) as LabelRow[]).find((r) => r.file === file) ?? { truth: {} as LabelRow['truth'] };
const path = file.includes(':') || file.startsWith('public') ? file : join(DATASET_DIR, file);
const trusts = (JSON.parse(readFileSync(join(ROOT, 'src/data/institutions.json'), 'utf8')) as Institution[]).map((i) => i.trustName);
const worker = await createWorker('eng', 1, { langPath: LANG_PATH, gzip: true, cachePath: join(DATASET_DIR, '.tess-cache') });
const legacyWorker = await createWorker('eng', 0, { langPath: LEGACY_LANG_PATH, gzip: true, legacyCore: true, legacyLang: true, cachePath: join(DATASET_DIR, '.tess-cache-legacy') });
const mk = (worker: typeof legacyWorker) => ({
  async recognize(canvas: never, params: { psm: string; whitelist?: string }) {
    await worker.setParameters({ tessedit_pageseg_mode: params.psm as never, tessedit_char_whitelist: params.whitelist ?? '', preserve_interword_spaces: '1', user_defined_dpi: '300' });
    const { data } = await worker.recognize(encodePng(canvas), {}, { blocks: true });
    return wordsFromPage(data as never);
  },
});
const engine = { lstm: mk(worker), legacy: mk(legacyWorker) };
const img = await loadImage(readFileSync(path));
const c = make(img.width, img.height);
c.getContext('2d')!.drawImage(img as never, 0, 0);
const res = await readFdrImage(c, engine as never, make, { knownHolders: trusts });
writeFileSync(join(DATASET_DIR, 'debug-prepared.png'), encodePng(res.prepared));
console.log(`skew ${res.skew}  words ${res.firstPass.wordCount}  meanConf ${res.firstPass.meanConfidence.toFixed(2)}  reread: ${res.reread.join(', ')}`);
console.log('--- text (pass 1) ---\n' + res.firstPass.text);
console.log('--- fields ---');
for (const k of FIELD_KEYS) {
  const f = res.result.fields[k];
  console.log(`${String(f.value) === String(row.truth[k]) || (f.value && Number(f.value) === Number(row.truth[k])) ? 'OK' : 'XX'} ${f.flagged ? 'F' : ' '} ${k.padEnd(13)} ${String(f.value).padEnd(34)} want ${row.truth[k]}  ${f.source} ${f.confidence.toFixed(2)}  ${f.checks.map((x) => (x.ok ? '✓ ' : '✗ ') + x.text).join(' | ')}`);
}
await worker.terminate();
await legacyWorker.terminate();
