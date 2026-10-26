import type { FDR, Institution, OcrField } from '../data/types';
import { formatDate, formatINRShort, pct } from './format';
import { isHeld, type Lifecycle } from './lifecycle';
import type { Match } from './mtdi';
import { textSimilarity } from './similarity';

export type Severity = 'critical' | 'serious' | 'warning' | 'info';

export type AlertType =
  | 'cross-duplicate' | 'conflicting-resubmission' | 'possible-match'
  | 'bank-mismatch' | 'bank-not-found' | 'bank-pending'
  | 'lien-not-marked' | 'lien-pending'
  | 'lapsed' | 'maturing'
  | 'holder-mismatch' | 'low-ocr' | 'release-incomplete' | 'closed-at-bank' | 'closure-attempt';

export interface Alert {
  id: string;
  fdrId: string;
  relatedFdrId?: string;
  severity: Severity;
  type: AlertType;
  title: string;
  /** Plain-language evidence for the officer. */
  why: string[];
  action: string;
}

export const SEVERITY_ORDER: Severity[] = ['critical', 'serious', 'warning', 'info'];
const SEVERITY_POINTS: Record<Severity, number> = { critical: 45, serious: 25, warning: 10, info: 3 };

/** Officer-tunable rules (Settings → Alert rules). */
export interface AlertRules {
  strong: number;
  possible: number;
  ocrLow: number;
  maturityWarnDays: number;
}
export const DEFAULT_RULES: AlertRules = { strong: 0.75, possible: 0.5, ocrLow: 0.7, maturityWarnDays: 30 };
const HOLDER_MIN_SIMILARITY = 0.6;

const OCR_FIELD_LABEL: Record<OcrField, string> = {
  fdrNumber: 'FDR number', bank: 'Bank', branch: 'Branch', ifsc: 'IFSC', accountHolder: 'Account holder',
  amount: 'Amount', issueDate: 'Issue date', maturityDate: 'Maturity date',
};

interface Ctx {
  fdrs: FDR[];
  institutions: Map<string, Institution>;
  lifecycle: Map<string, Lifecycle>;
  matches: Match[];
  rules?: AlertRules;
}

export function buildAlerts({ fdrs, institutions, lifecycle, matches, rules = DEFAULT_RULES }: Ctx): Alert[] {
  const alerts: Alert[] = [];
  const byId = new Map(fdrs.map((f) => [f.id, f]));
  const instName = (f: FDR) => institutions.get(f.institutionId)?.name ?? f.institutionId;

  for (const m of matches) {
    const a = byId.get(m.a)!, b = byId.get(m.b)!;
    // The later upload is the one under question.
    const [orig, dup] = a.uploadedAt <= b.uploadedAt ? [a, b] : [b, a];
    const evidence = [
      `MTDI score ${pct(m.score)} (${m.level === 'strong' ? 'strong' : 'possible'} match)`,
      m.matched.length ? `Matching: ${m.matched.join(', ')}` : 'No exact field matches',
      ...(m.views.hash ? ['Uploaded file is byte-for-byte identical'] : []),
      ...(m.views.image !== undefined && !m.views.hash ? [`Scanned images ${pct(m.views.image)} similar (likely a re-scan)`] : []),
      ...(m.conflicts.length ? [`Different: ${m.conflicts.join(', ')}`] : []),
    ];
    if (m.crossInstitution && m.level === 'strong') {
      alerts.push({
        id: `dup:${dup.id}:${orig.id}`, fdrId: dup.id, relatedFdrId: orig.id, severity: 'critical', type: 'cross-duplicate',
        title: `Same deposit claimed by two institutions`,
        why: [`${instName(dup)} submitted an FDR matching one already held for ${instName(orig)} (${orig.id}).`, ...evidence],
        action: 'Hold both records. Ask the bank to confirm which institution the deposit belongs to.',
      });
    } else if (!m.crossInstitution && m.conflicts.length) {
      alerts.push({
        id: `conf:${dup.id}:${orig.id}`, fdrId: dup.id, relatedFdrId: orig.id, severity: m.conflicts.includes('Amount') ? 'critical' : 'serious',
        type: 'conflicting-resubmission',
        title: `Resubmitted FDR with changed ${m.conflicts.join(' & ').toLowerCase()}`,
        why: [`${instName(dup)} uploaded this FDR again (${orig.id}) but some details differ.`, ...evidence,
          ...(m.conflicts.includes('Amount') ? [`Amount ${formatINRShort(orig.amount)} → ${formatINRShort(dup.amount)}`] : [])],
        action: 'Compare both scans side by side and confirm the correct values with the bank.',
      });
    } else {
      alerts.push({
        id: `pm:${dup.id}:${orig.id}`, fdrId: dup.id, relatedFdrId: orig.id, severity: m.level === 'strong' ? 'serious' : 'warning', type: 'possible-match',
        title: m.crossInstitution ? 'Possible match with another institution' : 'Possible duplicate upload',
        why: evidence,
        action: 'Review the related record; mark as unrelated if this is a genuine separate deposit.',
      });
    }
  }

  for (const f of fdrs) {
    const lc = lifecycle.get(f.id)!;
    const inst = institutions.get(f.institutionId);
    if (lc.status === 'closed') alerts.push({
      id: `closed:${f.id}`, fdrId: f.id, severity: 'critical', type: 'closed-at-bank', title: 'Deposit closed at the bank — no longer secured',
      why: [`The bank reported this FDR closed on ${formatDate(f.closedAt!.slice(0, 10))}.`, f.lien === 'confirmed' ? 'It was locked for AICTE — ask the bank how it was released.' : 'It was not locked for AICTE, so the institution could withdraw it.'],
      action: 'Issue a show-cause notice and require a replacement deposit.',
    });
    if (!isHeld(lc.status)) continue;
    if (f.closureAttempts) alerts.push({
      id: `attempt:${f.id}`, fdrId: f.id, severity: 'serious', type: 'closure-attempt',
      title: `Early closure attempt blocked${f.closureAttempts > 1 ? ` (${f.closureAttempts}×)` : ''}`,
      why: ['The institution asked the bank to close this deposit before maturity.', 'The bank refused because the deposit is locked (lien) in favour of AICTE.'],
      action: 'Ask the institution why it tried to withdraw its security deposit.',
    });

    if (f.bankVerification === 'mismatch') alerts.push({
      id: `bank:${f.id}`, fdrId: f.id, severity: 'critical', type: 'bank-mismatch', title: 'Bank records do not match this FDR',
      why: ['The bank (simulated gateway) returned different details for this FDR number.'],
      action: 'Request the bank\'s confirmation letter and compare amount, dates and holder.',
    });
    if (f.bankVerification === 'not-found') alerts.push({
      id: `bank:${f.id}`, fdrId: f.id, severity: 'critical', type: 'bank-not-found', title: 'Bank has no record of this FDR',
      why: ['The bank (simulated gateway) could not find this FDR number at the stated branch.'],
      action: 'Treat as unverified. Ask the institution for a bank-certified copy.',
    });
    if (f.bankVerification === 'pending') alerts.push({
      id: `bank:${f.id}`, fdrId: f.id, severity: 'info', type: 'bank-pending', title: 'Waiting for bank confirmation',
      why: ['Verification request sent; no response yet.'], action: 'Follow up if no response within 7 days.',
    });

    if (f.lien === 'not-marked') alerts.push({
      id: `lien:${f.id}`, fdrId: f.id, severity: 'serious', type: 'lien-not-marked', title: 'Deposit is not locked for AICTE',
      why: ['No lien is marked, so the institution could close the deposit and withdraw the money while AICTE still holds the receipt.'],
      action: 'Ask the bank to mark a lien in favour of AICTE.',
    });
    if (f.lien === 'pending') alerts.push({
      id: `lien:${f.id}`, fdrId: f.id, severity: 'warning', type: 'lien-pending', title: 'Lock (lien) confirmation pending',
      why: ['Lien requested but the bank has not confirmed it yet.'], action: 'Follow up with the bank branch.',
    });

    if (lc.status === 'lapsed') alerts.push({
      id: `life:${f.id}`, fdrId: f.id, severity: 'serious', type: 'lapsed', title: `Matured ${-lc.daysToMaturity} days ago — not renewed`,
      why: [`Maturity date ${formatDate(f.maturityDate)} has passed with no renewal or release on record.`],
      action: 'Ask the institution to renew the deposit and upload the new FDR.',
    });
    if (lc.status === 'maturing' && lc.daysToMaturity <= rules.maturityWarnDays) alerts.push({
      id: `life:${f.id}`, fdrId: f.id, severity: 'warning', type: 'maturing', title: `Matures in ${lc.daysToMaturity} days`,
      why: [`Maturity date ${formatDate(f.maturityDate)}. No renewal uploaded yet.`],
      action: 'Send a renewal reminder to the institution.',
    });
    if (lc.status === 'maturing' && lc.daysToMaturity > rules.maturityWarnDays) alerts.push({
      id: `life:${f.id}`, fdrId: f.id, severity: 'info', type: 'maturing', title: `Matures in ${lc.daysToMaturity} days`,
      why: [`Maturity date ${formatDate(f.maturityDate)}.`], action: `No action yet — reminder will be sent ${rules.maturityWarnDays} days before.`,
    });

    if (inst && textSimilarity(f.accountHolder, inst.trustName) < HOLDER_MIN_SIMILARITY) alerts.push({
      id: `holder:${f.id}`, fdrId: f.id, severity: 'serious', type: 'holder-mismatch', title: 'Deposit is not in the institution\'s trust name',
      why: [`FDR holder: "${f.accountHolder}"`, `Registered trust: "${inst.trustName}"`],
      action: 'The deposit must be held by the registered trust/society. Ask for a corrected FDR.',
    });

    const low = (Object.entries(f.ocrConfidence) as [OcrField, number][]).filter(([, c]) => c < rules.ocrLow);
    if (low.length) alerts.push({
      id: `ocr:${f.id}`, fdrId: f.id, severity: 'warning', type: 'low-ocr', title: 'Some fields need manual checking',
      why: low.map(([k, c]) => `${OCR_FIELD_LABEL[k]}: OCR confidence ${pct(c)}`),
      action: 'Open the scan and confirm the highlighted fields.',
    });
  }

  for (const f of fdrs) {
    if (!f.release || f.release.releasedAt) continue;
    const missing = f.release.checklist.filter((c) => !c.done);
    if (missing.length) alerts.push({
      id: `rel:${f.id}`, fdrId: f.id, severity: 'info', type: 'release-incomplete',
      title: `Release blocked — ${missing.length} item${missing.length > 1 ? 's' : ''} missing`,
      why: missing.map((c) => c.item), action: 'Notify the institution of the missing items.',
    });
  }

  return alerts.sort((x, y) => SEVERITY_ORDER.indexOf(x.severity) - SEVERITY_ORDER.indexOf(y.severity));
}

export interface Risk {
  score: number;
  contributors: { title: string; severity: Severity; points: number }[];
}

/** 0–100 explainable risk: each alert adds fixed points by severity, capped at 100. */
export function riskFor(fdrId: string, alerts: Alert[]): Risk {
  const contributors = alerts
    .filter((a) => a.fdrId === fdrId || a.relatedFdrId === fdrId)
    .map((a) => ({ title: a.title, severity: a.severity, points: a.fdrId === fdrId ? SEVERITY_POINTS[a.severity] : Math.round(SEVERITY_POINTS[a.severity] / 2) }));
  return { score: Math.min(100, contributors.reduce((s, c) => s + c.points, 0)), contributors };
}

export type RiskBand = 'high' | 'medium' | 'low' | 'clear';
export function riskBand(score: number): RiskBand {
  if (score >= 45) return 'high';
  if (score >= 20) return 'medium';
  if (score > 0) return 'low';
  return 'clear';
}
