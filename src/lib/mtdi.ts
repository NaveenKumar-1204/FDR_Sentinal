// MTDI — Multi-View Temporal Deposit Integrity matching.
// Compares FDRs across several independent "views" and combines them into one score.
import type { FDR } from '../data/types';
import { hammingHex, identifierSimilarity, textSimilarity } from './similarity';

export type View = 'identifier' | 'fields' | 'text' | 'hash' | 'image';

/** Initial weights — tune these on the synthetic evaluation set and report the final values. */
export const WEIGHTS: Record<View, number> = { identifier: 0.35, fields: 0.25, text: 0.1, hash: 0.15, image: 0.15 };
export interface MatchThresholds { strong: number; possible: number }
export const THRESHOLDS: MatchThresholds = { strong: 0.75, possible: 0.5 };
/** Perceptual hashes this close (out of 64 bits) are treated as the same image. */
const IMAGE_MAX_HAMMING = 10;
const IDENTIFIER_MIN = 0.8;

export const VIEW_LABEL: Record<View, string> = {
  identifier: 'FDR number',
  fields: 'Bank & deposit fields',
  text: 'Holder & branch text',
  hash: 'Identical file',
  image: 'Image similarity',
};

const FIELD_CHECKS: { key: keyof FDR; label: string }[] = [
  { key: 'bank', label: 'Bank' },
  { key: 'branch', label: 'Branch' },
  { key: 'ifsc', label: 'IFSC' },
  { key: 'amount', label: 'Amount' },
  { key: 'issueDate', label: 'Issue date' },
  { key: 'maturityDate', label: 'Maturity date' },
];

export type MatchLevel = 'strong' | 'possible';

export interface Match {
  a: string;
  b: string;
  score: number;
  level: MatchLevel;
  /** Only views that contributed evidence. Hash and image count only when they indicate a match. */
  views: Partial<Record<View, number>>;
  matched: string[];
  conflicts: string[];
  crossInstitution: boolean;
}

export function compare(a: FDR, b: FDR): Omit<Match, 'level'> {
  const views: Partial<Record<View, number>> = {};
  // Unrelated numeric IDs already look ~40% alike by chance, so only near-identical numbers count as evidence.
  const idSim = identifierSimilarity(a.fdrNumber, b.fdrNumber);
  views.identifier = idSim >= IDENTIFIER_MIN ? idSim : 0;

  const matched: string[] = [];
  const conflicts: string[] = [];
  for (const { key, label } of FIELD_CHECKS) (a[key] === b[key] ? matched : conflicts).push(label);
  views.fields = matched.length / FIELD_CHECKS.length;
  views.text = textSimilarity(`${a.accountHolder} ${a.branch}`, `${b.accountHolder} ${b.branch}`);

  if (a.fileHash && a.fileHash === b.fileHash) views.hash = 1;
  if (a.imageHash && b.imageHash) {
    const d = hammingHex(a.imageHash, b.imageHash);
    if (d <= IMAGE_MAX_HAMMING) views.image = 1 - d / 32;
  }

  let num = 0, den = 0;
  for (const [v, s] of Object.entries(views) as [View, number][]) { num += WEIGHTS[v] * s; den += WEIGHTS[v]; }
  if (views.identifier >= 0.999) matched.unshift('FDR number');
  else if (views.identifier >= 0.85) matched.unshift('FDR number (near-identical)');

  return { a: a.id, b: b.id, score: den ? num / den : 0, views, matched, conflicts, crossInstitution: a.institutionId !== b.institutionId };
}

/**
 * Compares only candidate pairs that share a block (same bank, same amount, or same
 * FDR-number prefix) instead of all pairs — keeps matching fast as the registry grows.
 */
export function findMatches(fdrs: FDR[], thresholds: MatchThresholds = THRESHOLDS): Match[] {
  const blocks = new Map<string, FDR[]>();
  const add = (k: string, f: FDR) => { const arr = blocks.get(k); if (arr) arr.push(f); else blocks.set(k, [f]); };
  for (const f of fdrs) {
    add(`bank:${f.bank}`, f);
    add(`amt:${f.amount}`, f);
    add(`num:${f.fdrNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6)}`, f);
  }

  const seen = new Set<string>();
  const out: Match[] = [];
  for (const group of blocks.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [x, y] = group[i].id < group[j].id ? [group[i], group[j]] : [group[j], group[i]];
        const key = `${x.id}|${y.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (x.renewedFromId === y.id || y.renewedFromId === x.id) continue;
        const r = compare(x, y);
        if (r.score >= thresholds.possible) out.push({ ...r, level: r.score >= thresholds.strong ? 'strong' : 'possible' });
      }
    }
  }
  return out.sort((m, n) => n.score - m.score);
}
