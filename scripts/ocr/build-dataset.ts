// Builds the labelled synthetic FDR dataset: dev (for tuning) and test (held out, never tuned on).
//   npx tsx scripts/ocr/build-dataset.ts            → 240 dev + 240 test documents
//   npx tsx scripts/ocr/build-dataset.ts 40         → smaller run
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FDR, Institution } from '../../src/data/types';
import { degrade, JPEG_QUALITY, QUALITIES, type Quality } from '../../src/lib/fdrdoc/augment';
import { fieldsFromRecord, mulberry32, randomFields, type DocFields } from '../../src/lib/fdrdoc/fields';
import { randomStyle, type TemplateId } from '../../src/lib/fdrdoc/render';
import { DATASET_DIR, encodeJpeg, make, renderDoc, ROOT } from './node-canvas';

export interface LabelRow {
  file: string;
  split: 'dev' | 'test';
  template: TemplateId;
  quality: Quality;
  truth: { fdrNumber: string; bank: string; branch: string; ifsc: string; accountHolder: string; amount: string; issueDate: string; maturityDate: string; interestRate: string };
}

const perSplit = Number(process.argv[2] ?? 240);
// The test split's seed is changed whenever the reader has been tuned after looking at test errors,
// so the reported score is always on documents it has never seen. History: 2_000_000 → 3_000_000 → 4_000_000.
const TEST_SEED = 4_000_000;
const institutions = JSON.parse(readFileSync(join(ROOT, 'src/data/institutions.json'), 'utf8')) as Institution[];
const fdrs = JSON.parse(readFileSync(join(ROOT, 'src/data/fdrs.json'), 'utf8')) as FDR[];
const trusts = institutions.map((i) => i.trustName);
const TEMPLATES: TemplateId[] = ['ledger', 'certificate', 'modern', 'typewriter'];
// Mix per split: 25% clean, 25% scan, 30% phone, 20% low-res.
const QUALITY_PLAN: Quality[] = ['clean', 'scan', 'phone', 'phone', 'clean', 'scan', 'phone', 'lowres', 'scan', 'clean', 'phone', 'lowres', 'clean', 'scan', 'phone', 'lowres', 'clean', 'scan', 'phone', 'lowres'];

rmSync(DATASET_DIR, { recursive: true, force: true });
const rows: LabelRow[] = [];
for (const split of ['dev', 'test'] as const) {
  mkdirSync(join(DATASET_DIR, split), { recursive: true });
  for (let i = 0; i < perSplit; i++) {
    const r = mulberry32((split === 'dev' ? 1_000_000 : TEST_SEED) + i * 7919);
    const template = TEMPLATES[i % TEMPLATES.length];
    // Advance quality every 4 documents so each layout meets every quality tier.
    const quality = QUALITY_PLAN[Math.floor(i / TEMPLATES.length) % QUALITY_PLAN.length];
    let f: DocFields;
    if (r() < 0.3) {
      const rec = fdrs[Math.floor(r() * fdrs.length)];
      f = fieldsFromRecord(rec, institutions.find((x) => x.id === rec.institutionId), r);
    } else f = randomFields(r, trusts);
    const style = randomStyle(r, template);
    const img = degrade(renderDoc(f, style, r), quality, r, make);
    const file = `${split}/${String(i + 1).padStart(4, '0')}-${template}-${quality}.jpg`;
    writeFileSync(join(DATASET_DIR, file), encodeJpeg(img, JPEG_QUALITY[quality]));
    rows.push({
      file, split, template, quality,
      truth: {
        fdrNumber: f.fdrNumber, bank: f.bank, branch: f.branch, ifsc: f.ifsc, accountHolder: f.accountHolder, amount: f.amount.toFixed(2),
        issueDate: f.issueDate, maturityDate: f.maturityDate, interestRate: f.interestRate.toFixed(2),
      },
    });
  }
  console.log(`${split}: ${perSplit} documents`);
}
writeFileSync(join(DATASET_DIR, 'labels.json'), JSON.stringify(rows, null, 1));
console.log(`Wrote ${rows.length} labelled documents to ocr-dataset/ (qualities: ${QUALITIES.join(', ')})`);
