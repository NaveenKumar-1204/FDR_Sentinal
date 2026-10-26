// Sample scans for the "Try a sample" buttons on the Upload page (public/samples).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FDR, Institution } from '../../src/data/types';
import { degrade, JPEG_QUALITY, type Quality } from '../../src/lib/fdrdoc/augment';
import { fieldsFromRecord, mulberry32, randomFields, type DocFields } from '../../src/lib/fdrdoc/fields';
import { randomStyle, type TemplateId } from '../../src/lib/fdrdoc/render';
import { encodeJpeg, make, renderDoc, ROOT } from './node-canvas';

const institutions = JSON.parse(readFileSync(join(ROOT, 'src/data/institutions.json'), 'utf8')) as Institution[];
const fdrs = JSON.parse(readFileSync(join(ROOT, 'src/data/fdrs.json'), 'utf8')) as FDR[];
const trusts = institutions.map((i) => i.trustName);
const out = join(ROOT, 'public', 'samples');
mkdirSync(out, { recursive: true });

// A healthy registry record to "re-scan" — uploading it should be caught as a duplicate.
const original = fdrs.find((f) => f.lien === 'confirmed' && f.bankVerification === 'verified' && !f.release && f.maturityDate > '2027-06-01' && !fdrs.some((g) => g.renewedFromId === f.id))!;

const specs: { file: string; title: string; note: string; template: TemplateId; quality: Quality; seed: number; fields?: DocFields }[] = [
  { file: 'clean-ledger.jpg', title: 'Clear PDF', note: 'Easy to read', template: 'ledger', quality: 'clean', seed: 11 },
  { file: 'phone-certificate.jpg', title: 'Phone photo', note: 'Tilted with shadows', template: 'certificate', quality: 'phone', seed: 23 },
  { file: 'scan-modern.jpg', title: 'Office scan', note: 'Scanned in an office', template: 'modern', quality: 'scan', seed: 37 },
  { file: 'typewriter.jpg', title: 'Typewriter style', note: 'Older bank format', template: 'typewriter', quality: 'scan', seed: 41 },
  { file: 'duplicate.jpg', title: 'Duplicate (try this!)', note: `Same FDR as ${original.id}, should be caught`, template: 'modern', quality: 'phone', seed: 59 },
];

const manifest = specs.map((s) => {
  const r = mulberry32(5000 + s.seed);
  // Demo samples should be live deposits (maturing after today) so they can go all the way to an acknowledgement.
  let f = s.file === 'duplicate.jpg' ? fieldsFromRecord(original, institutions.find((i) => i.id === original.institutionId), r) : randomFields(r, trusts);
  while (s.file !== 'duplicate.jpg' && f.maturityDate < '2027-06-01') f = randomFields(r, trusts);
  const img = degrade(renderDoc(f, randomStyle(r, s.template), r), s.quality, r, make);
  writeFileSync(join(out, s.file), encodeJpeg(img, JPEG_QUALITY[s.quality]));
  return { file: s.file, title: s.title, note: s.note, quality: s.quality, template: s.template, duplicateOf: s.file === 'duplicate.jpg' ? original.id : undefined };
});
writeFileSync(join(out, 'samples.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${manifest.length} samples to public/samples (duplicate of ${original.id})`);
