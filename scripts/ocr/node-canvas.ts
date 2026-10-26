// Node-side helpers shared by the dataset builder and the evaluator.
import { createCanvas } from '@napi-rs/canvas';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CanvasFactory, CanvasLike } from '../../src/lib/fdrdoc/augment';
import type { DocFields, Rng } from '../../src/lib/fdrdoc/fields';
import { docHeight, drawDocument, DOC_WIDTH, type DocStyle } from '../../src/lib/fdrdoc/render';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATASET_DIR = join(ROOT, 'ocr-dataset');
export const LANG_PATH = join(ROOT, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int');
/** Standard model, which also contains the legacy (non-LSTM) engine data. */
export const LEGACY_LANG_PATH = join(ROOT, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0');

export const make: CanvasFactory = (w, h) => createCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h))) as unknown as CanvasLike;

export function renderDoc(fields: DocFields, style: DocStyle, r: Rng): CanvasLike {
  const measure = make(10, 10).getContext('2d')!;
  const h = docHeight(measure, fields, style);
  const c = make(DOC_WIDTH, h);
  drawDocument(c.getContext('2d')!, fields, style, r);
  return c;
}

export function encodeJpeg(c: CanvasLike, quality: number): Buffer {
  return (c as unknown as { encodeSync(f: 'jpeg', q: number): Buffer }).encodeSync('jpeg', quality);
}

export function encodePng(c: CanvasLike): Buffer {
  return (c as unknown as { encodeSync(f: 'png'): Buffer }).encodeSync('png');
}
