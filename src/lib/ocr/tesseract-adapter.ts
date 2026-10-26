import type { OcrWord } from './types';

interface TWord { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }
interface TPage { blocks: { paragraphs: { lines: { words: TWord[] }[] }[] }[] | null }

/** Flattens a tesseract.js page (requested with `{ blocks: true }`) into words with 0–1 confidence. */
export function wordsFromPage(page: TPage): OcrWord[] {
  const out: OcrWord[] = [];
  for (const b of page.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) {
    const text = w.text.trim();
    if (text) out.push({ text, conf: Math.max(0, Math.min(1, w.confidence / 100)), bbox: w.bbox });
  }
  return out;
}
