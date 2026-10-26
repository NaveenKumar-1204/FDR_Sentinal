export interface Bbox { x0: number; y0: number; x1: number; y1: number }

export interface OcrWord {
  text: string;
  /** 0–1 */
  conf: number;
  bbox: Bbox;
}

export type FieldKey = 'fdrNumber' | 'bank' | 'branch' | 'ifsc' | 'accountHolder' | 'amount' | 'issueDate' | 'maturityDate' | 'interestRate';

export const FIELD_KEYS: FieldKey[] = ['fdrNumber', 'bank', 'branch', 'ifsc', 'accountHolder', 'amount', 'issueDate', 'maturityDate', 'interestRate'];

export const FIELD_LABEL: Record<FieldKey, string> = {
  fdrNumber: 'FDR number', bank: 'Bank', branch: 'Branch', ifsc: 'IFSC', accountHolder: 'Account holder',
  amount: 'Principal amount', issueDate: 'Date of deposit', maturityDate: 'Maturity date', interestRate: 'Interest rate',
};

export type FieldSource = 'label' | 'below' | 'pattern' | 'header' | 'derived' | 'words' | 'dictionary' | 'reread' | 'none';

export interface Check { ok: boolean; text: string }

export interface FieldResult {
  /** Canonical value: ISO dates, plain numbers ("5000000.00"), uppercase codes, or null when not found. */
  value: string | null;
  display: string;
  /** 0–1, after cross-checks. */
  confidence: number;
  /** Needs a human to confirm before it is trusted. */
  flagged: boolean;
  source: FieldSource;
  checks: Check[];
  bbox: Bbox | null;
}

export interface ExtractResult {
  fields: Record<FieldKey, FieldResult>;
  tenureText: string | null;
  maturityValue: number | null;
  text: string;
  wordCount: number;
  meanConfidence: number;
  /** Where each labelled value was read (prepared-image pixels), used for the second-pass re-read and the overlay. */
  valueBoxes: Partial<Record<string, Bbox>>;
  /** Right-hand limit for each value (next column or page edge). */
  valueRight: Partial<Record<string, number>>;
  lineHeight: number;
}
