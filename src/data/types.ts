export interface Institution {
  id: string;
  name: string;
  aicteId: string;
  state: string;
  city: string;
  /** Registered trust/society name — the FDR should be held in this name. */
  trustName: string;
}

export type LienStatus = 'confirmed' | 'pending' | 'not-marked';
/** Prototype bank responses are SIMULATED. */
export type BankVerification = 'verified' | 'pending' | 'mismatch' | 'not-found';

export type OcrField = 'fdrNumber' | 'bank' | 'branch' | 'ifsc' | 'accountHolder' | 'amount' | 'issueDate' | 'maturityDate';

export interface ReleaseRequest {
  requestedAt: string;
  reason: string;
  checklist: { item: string; done: boolean }[];
  releasedAt?: string;
}

export interface FDR {
  id: string;
  fdrNumber: string;
  institutionId: string;
  bank: string;
  branch: string;
  ifsc: string;
  accountHolder: string;
  /** Principal in INR. */
  amount: number;
  /** ISO date (YYYY-MM-DD). */
  issueDate: string;
  maturityDate: string;
  interestRate: number;
  lien: LienStatus;
  bankVerification: BankVerification;
  /** 0–1 confidence per extracted field. */
  ocrConfidence: Record<OcrField, number>;
  /** SHA-256 of the uploaded file. */
  fileHash?: string;
  /** 64-bit perceptual image hash as 16 hex chars (survives re-scans). */
  imageHash?: string;
  uploadedAt: string;
  renewedFromId?: string;
  release?: ReleaseRequest;
  /** True for records injected by Stress Test mode. */
  isTestCase?: boolean;
  /** Created from an uploaded scan (OCR) rather than the seeded registry. */
  isUploaded?: boolean;
  /** Set when the bank reports the deposit was closed / paid out. */
  closedAt?: string;
  /** Early-closure attempts the bank blocked because of AICTE's lien. */
  closureAttempts?: number;
}

export type BankEventKind =
  | 'request-verification' | 'request-lien' | 'request-lien-release'
  | 'verified' | 'mismatch' | 'not-found' | 'lien-marked' | 'lien-released' | 'closure-blocked' | 'closed';

/** One message on the AICTE ↔ bank channel (simulated bank gateway). */
export interface BankEvent {
  id: string;
  at: string;
  fdrId: string;
  kind: BankEventKind;
  source: 'aicte' | 'bank';
  note?: string;
}

export interface Acknowledgement {
  id: string;
  fdrId: string;
  token: string;
  issuedAt: string;
  issuedBy: string;
}

export interface AuditEvent {
  at: string;
  actor: string;
  action: string;
  fdrId?: string;
  detail: string;
}
