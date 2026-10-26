// Copies the OCR engine (worker, WebAssembly cores, English models) into public/tesseract so the app reads
// documents fully offline — no CDN at demo time. Runs automatically before `dev` and `build`.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'tesseract');

const copies = [
  [join(nm, 'tesseract.js', 'dist', 'worker.min.js'), join(out, 'worker.min.js')],
  [join(nm, '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'), join(out, 'lang', 'lstm', 'eng.traineddata.gz')],
  [join(nm, '@tesseract.js-data', 'eng', '4.0.0', 'eng.traineddata.gz'), join(out, 'lang', 'legacy', 'eng.traineddata.gz')],
  ...readdirSync(join(nm, 'tesseract.js-core')).filter((f) => f.endsWith('.wasm.js')).map((f) => [join(nm, 'tesseract.js-core', f), join(out, 'core', f)]),
];

let copied = 0;
for (const [from, to] of copies) {
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  copied++;
}
console.log(`OCR assets ready in public/tesseract (${copied} updated, ${copies.length} total)`);
