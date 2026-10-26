import { levenshtein } from '../similarity';
import { fixDigits } from './amount';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_FULL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function valid(y: number, m: number, d: number): boolean {
  if (y < 1990 || y > 2060 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function monthFromWord(w: string): number | null {
  const s = w.toLowerCase().replace(/[^a-z]/g, '');
  if (s.length < 3) return null;
  let i = MONTHS_FULL.indexOf(s);
  if (i >= 0) return i + 1;
  i = MONTHS.indexOf(s.slice(0, 3));
  if (i >= 0 && (s.length === 3 || MONTHS_FULL[i].startsWith(s))) return i + 1;
  let best = -1, bestD = 99;
  MONTHS_FULL.forEach((full, k) => {
    const d = Math.min(levenshtein(s, full), levenshtein(s, MONTHS[k]));
    if (d < bestD) { bestD = d; best = k; }
  });
  return bestD <= 1 ? best + 1 : null;
}

/** Finds the first date in text: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, "16 Aug 2026", "16-AUG-2026", "16 August 2026". */
export function parseDate(text: string): string | null {
  const t = text.replace(/[,]/g, ' ');
  const num = t.match(/([0-9OoIlSB]{1,2})\s*[/.\-]\s*([0-9OoIlSB]{1,2})\s*[/.\-]\s*([0-9OoIlSB]{4})/);
  if (num) {
    const [d, m, y] = [num[1], num[2], num[3]].map((x) => Number(fixDigits(x)));
    if (valid(y, m, d)) return iso(y, m, d);
  }
  const word = t.match(/([0-9OoIlSB]{1,2})\s*[\s\-.]\s*([A-Za-z]{3,10})\.?\s*[\s\-.,]\s*([0-9OoIlSB]{4})/);
  if (word) {
    const d = Number(fixDigits(word[1])), y = Number(fixDigits(word[3])), m = monthFromWord(word[2]);
    if (m && valid(y, m, d)) return iso(y, m, d);
  }
  return null;
}

export type DateStyle = 'slash' | 'dash' | 'dot' | 'short' | 'upper' | 'long';

export function formatDocDate(isoDate: string, style: DateStyle): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dd = String(d).padStart(2, '0'), mm = String(m).padStart(2, '0');
  switch (style) {
    case 'slash': return `${dd}/${mm}/${y}`;
    case 'dash': return `${dd}-${mm}-${y}`;
    case 'dot': return `${dd}.${mm}.${y}`;
    case 'short': return `${dd} ${MONTH_LABEL[m - 1]} ${y}`;
    case 'upper': return `${dd}-${MONTH_LABEL[m - 1].toUpperCase()}-${y}`;
    case 'long': return `${dd} ${MONTHS_FULL[m - 1][0].toUpperCase()}${MONTHS_FULL[m - 1].slice(1)} ${y}`;
  }
}

export interface Tenure { years: number; months: number; days: number }

/** "3 Years", "1095 Days", "18 Months", "2 Years 6 Months". */
export function parseTenure(text: string): Tenure | null {
  const t = text.toLowerCase();
  const grab = (re: RegExp) => { const m = t.match(re); return m ? Number(fixDigits(m[1])) : 0; };
  const years = grab(/([0-9oil]{1,2})\s*(?:years?|yrs?)\b/);
  const months = grab(/([0-9oil]{1,3})\s*(?:months?|mths?)\b/);
  const days = grab(/([0-9oil]{1,4})\s*(?:days?)\b/);
  if (!years && !months && !days) return null;
  return { years, months, days };
}

export function formatTenure(t: Tenure): string {
  const parts: string[] = [];
  if (t.years) parts.push(`${t.years} Year${t.years > 1 ? 's' : ''}`);
  if (t.months) parts.push(`${t.months} Month${t.months > 1 ? 's' : ''}`);
  if (t.days) parts.push(`${t.days} Day${t.days > 1 ? 's' : ''}`);
  return parts.join(' ');
}

export function addTenure(isoDate: string, t: Tenure, sign = 1): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y + sign * t.years, m - 1 + sign * t.months, d));
  dt.setUTCDate(dt.getUTCDate() + sign * t.days);
  return dt.toISOString().slice(0, 10);
}

export function tenureDays(issueIso: string, t: Tenure): number {
  return Math.round((Date.parse(addTenure(issueIso, t) + 'T00:00:00Z') - Date.parse(issueIso + 'T00:00:00Z')) / 86400000);
}

/** Maturity value with quarterly compounding — the usual Indian bank convention for term deposits. */
export function maturityValue(principal: number, ratePct: number, days: number): number {
  return Math.round(principal * (1 + ratePct / 400) ** (days / 91.25) * 100) / 100;
}
