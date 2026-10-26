// Indian-system amounts: figures (12,34,567.00) and words (Twelve Lakh Thirty Four Thousand ...).
import { levenshtein } from '../similarity';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below100(n: number): string {
  return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '');
}
function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? below100(r) : ''].filter(Boolean).join(' ');
}
function integerWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${integerWords(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return parts.join(' ');
}

/** "Rupees Fifty Lakh Only", "Rupees Twelve Lakh Thirty Four Thousand and Fifty Paise Only". */
export function rupeesInWords(amount: number): string {
  const paiseTotal = Math.round(amount * 100);
  const rupees = Math.floor(paiseTotal / 100), paise = paiseTotal % 100;
  return `Rupees ${integerWords(rupees)}${paise ? ` and ${below100(paise)} Paise` : ''} Only`;
}

/** 5000000 → "50,00,000.00" (Indian digit grouping). */
export function formatIndian(amount: number, decimals = true): string {
  const fixed = amount.toFixed(2);
  const [int, frac] = fixed.split('.');
  const last3 = int.slice(-3), rest = int.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return decimals ? `${grouped}.${frac}` : grouped;
}

const VALUES: Record<string, number> = {};
ONES.forEach((w, i) => { if (w) VALUES[w.toLowerCase()] = i; });
TENS.forEach((w, i) => { if (w) VALUES[w.toLowerCase()] = i * 10; });
const SCALES: Record<string, number> = { hundred: 100, thousand: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, crore: 1e7, crores: 1e7 };
const VOCAB = [...Object.keys(VALUES), ...Object.keys(SCALES), 'rupees', 'rupee', 'and', 'paise', 'only'];

function snapWord(w: string): string | null {
  if (VALUES[w] !== undefined || SCALES[w] !== undefined || VOCAB.includes(w)) return w;
  if (w.length < 4) return null;
  let best: string | null = null, bestD = 99;
  for (const v of VOCAB) {
    const d = levenshtein(w, v);
    if (d < bestD) { bestD = d; best = v; }
  }
  return bestD <= (w.length >= 7 ? 2 : 1) ? best : null;
}

/**
 * Parses "Rupees Twelve Lakh Thirty Four Thousand Five Hundred and Fifty Paise Only".
 * Returns null if any word can't be understood, so a garbled line never yields a wrong number.
 */
export function parseAmountWords(text: string): number | null {
  // "Only" must be present: a line cut short (e.g. a wrapped second line not read) must not parse as a smaller amount.
  const lower = text.toLowerCase().replace(/[-–]/g, ' ');
  const starts = [...lower.matchAll(/rupees?\b/g)].map((x) => x.index!);
  const m = starts.map((s) => lower.slice(s).match(/^rupees?\b(.*?)\bonly\b/)).find((x) => x && /^[a-z\s.,']+$/.test(x[1]));
  if (!m) return null;
  const tokens = m[1].replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const words: string[] = [];
  for (const raw of tokens) {
    const w = snapWord(raw);
    if (!w) return null;
    words.push(w);
  }
  // "and" separates rupees from paise only when the line actually mentions paise.
  const paiseAt = words.indexOf('paise');
  const andAt = paiseAt >= 0 ? words.lastIndexOf('and', paiseAt) : -1;
  const rupeeWords = andAt >= 0 ? words.slice(0, andAt) : paiseAt >= 0 ? [] : words;
  const paiseWords = andAt >= 0 ? words.slice(andAt + 1, paiseAt) : paiseAt >= 0 ? words.slice(0, paiseAt) : [];

  const evaluate = (ws: string[]): number | null => {
    let total = 0, current = 0, seen = false;
    for (const w of ws) {
      if (['and', 'rupees', 'rupee', 'only', 'paise'].includes(w)) continue;
      if (VALUES[w] !== undefined) { current += VALUES[w]; seen = true; continue; }
      const scale = SCALES[w];
      if (scale === undefined) return null;
      if (scale === 100) current = (current || 1) * 100;
      else { total += (current || 1) * scale; current = 0; }
      seen = true;
    }
    return seen ? total + current : null;
  };
  const rupees = rupeeWords.length ? evaluate(rupeeWords) : 0;
  const paise = paiseWords.length ? evaluate(paiseWords) : 0;
  if (rupees === null || paise === null || paise >= 100 || (rupees === 0 && paise === 0)) return null;
  return rupees + paise / 100;
}

/** Fixes digits OCR commonly confuses, inside a number-like token. */
export function fixDigits(s: string): string {
  return s.replace(/[Oo]/g, '0').replace(/[Il|!]/g, '1').replace(/[Ss]/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
}

/** Parses "Rs. 50,00,000.00" / "₹ 12,34,567" / "INR 5000000". Returns grouping validity too. */
export function parseAmountFigures(text: string): { value: number; wellGrouped: boolean } | null {
  // A dot followed by 2–3 digits and a comma is a misread comma ("9.72,30,830.00" → "9,72,30,830.00").
  const cleaned = text.replace(/(rs\.?|inr|₹|\/-)/gi, ' ').replace(/(\d)\.(?=\d{2,3},)/g, '$1,');
  // The rupee sign is often read as a stray "2" before the figure, so take the longest numeric run, not the first.
  const runs = cleaned.match(/[0-9OoIlSB][0-9OoIlSB,]*(?:\.[0-9OoIl]{1,2})?/g);
  if (!runs) return null;
  const digitCount = (s: string) => (fixDigits(s).match(/\d/g) ?? []).length;
  const m = [runs.reduce((a, b) => (digitCount(b) > digitCount(a) ? b : a))];
  const token = fixDigits(m[0]).replace(/,+$/, '');
  if (!/\d/.test(token)) return null;
  const value = Number(token.replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0) return null;
  const wellGrouped = /^\d{1,2}(,\d{2})*,\d{3}(\.\d{2})?$/.test(token) || /^\d{1,3}(\.\d{2})?$/.test(token);
  return { value, wellGrouped };
}
