import { levenshtein } from '../similarity';

export interface BankInfo {
  name: string;
  /** First four characters of every IFSC issued by this bank (RBI-assigned). */
  code: string;
  /**
   * Digits in this bank's deposit (FDR) account numbers. Approximates each bank's account-number length;
   * the table is configuration — confirm with each bank before production use.
   */
  fdrDigits: number;
}

export const BANKS: BankInfo[] = [
  { name: 'State Bank of India', code: 'SBIN', fdrDigits: 11 },
  { name: 'Canara Bank', code: 'CNRB', fdrDigits: 13 },
  { name: 'Indian Bank', code: 'IDIB', fdrDigits: 10 },
  { name: 'Bank of Baroda', code: 'BARB', fdrDigits: 14 },
  { name: 'Punjab National Bank', code: 'PUNB', fdrDigits: 16 },
  { name: 'Union Bank of India', code: 'UBIN', fdrDigits: 15 },
  { name: 'HDFC Bank', code: 'HDFC', fdrDigits: 14 },
  { name: 'ICICI Bank', code: 'ICIC', fdrDigits: 12 },
  { name: 'Axis Bank', code: 'UTIB', fdrDigits: 15 },
  { name: 'Kotak Mahindra Bank', code: 'KKBK', fdrDigits: 14 },
  { name: 'Bank of India', code: 'BKID', fdrDigits: 15 },
  { name: 'Central Bank of India', code: 'CBIN', fdrDigits: 10 },
  { name: 'Indian Overseas Bank', code: 'IOBA', fdrDigits: 15 },
  { name: 'UCO Bank', code: 'UCBA', fdrDigits: 14 },
  { name: 'IDBI Bank', code: 'IBKL', fdrDigits: 16 },
];

export const BANK_BY_CODE = new Map(BANKS.map((b) => [b.code, b]));
export const BANK_BY_NAME = new Map(BANKS.map((b) => [b.name, b]));

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Finds the bank named in a line of text. Longer names win so "State Bank of India"
 * is not mistaken for "Bank of India". Tolerates one OCR slip per word.
 */
export function findBankInText(text: string): { bank: BankInfo; exact: boolean } | null {
  const words = norm(text).split(' ').filter(Boolean);
  let best: { bank: BankInfo; exact: boolean; len: number } | null = null;
  for (const bank of BANKS) {
    const target = norm(bank.name).split(' ');
    for (let i = 0; i + target.length <= words.length; i++) {
      let edits = 0, ok = true;
      for (let j = 0; j < target.length; j++) {
        const a = words[i + j], b = target[j];
        if (a === b) continue;
        const d = b.length >= 4 ? levenshtein(a, b) : 99;
        if (d > 1) { ok = false; break; }
        edits += d;
      }
      if (!ok) continue;
      // A bare "Bank of India" inside "State/Union/Central Bank of India" is the longer bank.
      const prev = words[i - 1];
      if (bank.code === 'BKID' && prev && ['state', 'union', 'central'].includes(prev)) continue;
      if (bank.code === 'IDIB' && prev === 'south') continue;
      const len = target.join(' ').length;
      if (!best || len > best.len || (len === best.len && edits === 0)) best = { bank, exact: edits === 0, len };
    }
  }
  return best && { bank: best.bank, exact: best.exact };
}
