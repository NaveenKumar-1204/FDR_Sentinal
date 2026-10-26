import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import auditData from './data/audit-events.json';
import fdrData from './data/fdrs.json';
import institutionData from './data/institutions.json';
import type { Acknowledgement, AuditEvent, BankEvent, BankEventKind, FDR, Institution } from './data/types';
import { signAck, KEY_ID, type AckPayload } from './lib/ack';
import { buildAlerts, DEFAULT_RULES, riskFor, type Alert, type AlertRules, type Risk } from './lib/alerts';
import { buildChain, type ChainedEvent } from './lib/audit';
import { todayISO } from './lib/format';
import { isHeld, lifecycleOf, type Lifecycle } from './lib/lifecycle';
import { findMatches, type Match } from './lib/mtdi';
import { newId, readShared, subscribeShared, writeShared } from './lib/shared';
import { textSimilarity } from './lib/similarity';
import { useSession } from './session';

const BASE_FDRS = fdrData as FDR[];
const INSTITUTIONS = institutionData as Institution[];
const BASE_EVENTS = auditData as AuditEvent[];

export type DecisionKind = 'accepted' | 'investigate' | 'documents-requested';
export const DECISION_LABEL: Record<DecisionKind, string> = {
  accepted: 'Accepted as genuine',
  investigate: 'Flagged for investigation',
  'documents-requested': 'Documents requested',
};
export interface Decision { kind: DecisionKind; note: string; at: string }

export const BANK_EVENT_LABEL: Record<BankEventKind, string> = {
  'request-verification': 'AICTE asked the bank to verify the FDR',
  'request-lien': 'AICTE asked the bank to lock the deposit (lien)',
  'request-lien-release': 'AICTE asked the bank to release the lock',
  verified: 'Bank confirmed the FDR is genuine',
  mismatch: 'Bank reported different details',
  'not-found': 'Bank has no record of this FDR',
  'lien-marked': 'Bank locked the deposit for AICTE',
  'lien-released': 'Bank released the lock',
  'closure-blocked': 'Early closure attempt blocked by the lien',
  closed: 'Bank closed the deposit and paid it out',
};

export interface BankState {
  /** Requests from AICTE the bank has not answered yet. */
  pending: { verification: boolean; lien: boolean; lienRelease: boolean };
}

interface Store {
  today: string;
  institutions: Institution[];
  institutionById: Map<string, Institution>;
  fdrs: FDR[];
  fdrById: Map<string, FDR>;
  lifecycle: Map<string, Lifecycle>;
  matches: Match[];
  alerts: Alert[];
  risk: Map<string, Risk>;
  rules: AlertRules;
  chain: ChainedEvent[] | null;
  testCaseIds: string[];
  decisions: Record<string, Decision>;
  bankEvents: BankEvent[];
  bankState: Map<string, BankState>;
  acks: Acknowledgement[];
  scanFor: (fdrId: string) => string | undefined;
  recordDecision: (fdrId: string, decision: DecisionKind, note: string) => void;
  addUpload: (fdr: FDR, scanThumb: string | undefined, audit: { detail: string }[]) => void;
  sendBankEvent: (fdrId: string, kind: BankEventKind, source: 'aicte' | 'bank', note?: string) => void;
  issueAck: (fdrId: string, by: string) => Promise<Acknowledgement>;
  injectTestCases: () => Promise<FDR[]>;
  clearTestCases: () => void;
  tamperEvent: (index: number) => void;
  rebuildChain: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

/** Folds the bank event log into per-FDR status overrides. */
function applyBankEvents(fdr: FDR, events: BankEvent[]): FDR {
  if (!events.length) return fdr;
  const f = { ...fdr };
  for (const e of events) {
    switch (e.kind) {
      case 'verified': f.bankVerification = 'verified'; break;
      case 'mismatch': f.bankVerification = 'mismatch'; break;
      case 'not-found': f.bankVerification = 'not-found'; break;
      case 'lien-marked': f.lien = 'confirmed'; break;
      case 'lien-released': f.lien = 'not-marked'; break;
      case 'closure-blocked': f.closureAttempts = (f.closureAttempts ?? 0) + 1; break;
      case 'closed': f.closedAt = e.at; break;
      case 'request-lien': if (f.lien === 'not-marked') f.lien = 'pending'; break;
      default: break;
    }
  }
  return f;
}

function pendingFrom(events: BankEvent[]): BankState['pending'] {
  const p = { verification: false, lien: false, lienRelease: false };
  for (const e of events) {
    if (e.kind === 'request-verification') p.verification = true;
    if (e.kind === 'request-lien') p.lien = true;
    if (e.kind === 'request-lien-release') p.lienRelease = true;
    if (['verified', 'mismatch', 'not-found'].includes(e.kind)) p.verification = false;
    if (e.kind === 'lien-marked') p.lien = false;
    if (e.kind === 'lien-released') p.lienRelease = false;
  }
  return p;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [testCases, setTestCases] = useState<FDR[]>([]);
  const [uploads, setUploads] = useState<FDR[]>(() => readShared('uploads', []));
  const [bankEvents, setBankEvents] = useState<BankEvent[]>(() => readShared('bank', []));
  const [acks, setAcks] = useState<Acknowledgement[]>(() => readShared('acks', []));
  const [scans, setScans] = useState<Record<string, string>>(() => readShared('scans', {}));
  const [sharedAudit, setSharedAudit] = useState<AuditEvent[]>(() => readShared('audit', []));
  const [localAudit, setLocalAudit] = useState<AuditEvent[]>([]);
  const [chain, setChain] = useState<ChainedEvent[] | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const today = todayISO();
  const { settings: { rules } } = useSession();

  // Another tab (e.g. the bank simulator) changed shared state → reload it.
  useEffect(() => subscribeShared((key) => {
    if (key === 'uploads') setUploads(readShared('uploads', []));
    if (key === 'bank') setBankEvents(readShared('bank', []));
    if (key === 'acks') setAcks(readShared('acks', []));
    if (key === 'scans') setScans(readShared('scans', {}));
    if (key === 'audit') setSharedAudit(readShared('audit', []));
  }), []);

  const logShared = useCallback((events: AuditEvent[]) => {
    setSharedAudit((prev) => { const next = [...prev, ...events]; writeShared('audit', next); return next; });
  }, []);

  const recordDecision = useCallback((fdrId: string, kind: DecisionKind, note: string) => {
    const at = new Date().toISOString();
    setDecisions((d) => ({ ...d, [fdrId]: { kind, note, at } }));
    logShared([{ at, actor: 'Officer · FDR Cell', action: DECISION_LABEL[kind], fdrId, detail: note || '—' }]);
  }, [logShared]);

  const eventsByFdr = useMemo(() => {
    const m = new Map<string, BankEvent[]>();
    for (const e of bankEvents) { const list = m.get(e.fdrId); if (list) list.push(e); else m.set(e.fdrId, [e]); }
    return m;
  }, [bankEvents]);

  const fdrs = useMemo(() => [...BASE_FDRS, ...uploads, ...testCases].map((f) => applyBankEvents(f, eventsByFdr.get(f.id) ?? [])), [uploads, testCases, eventsByFdr]);
  const bankState = useMemo(() => new Map(fdrs.map((f) => [f.id, { pending: pendingFrom(eventsByFdr.get(f.id) ?? []) }])), [fdrs, eventsByFdr]);
  const fdrById = useMemo(() => new Map(fdrs.map((f) => [f.id, f])), [fdrs]);
  const institutionById = useMemo(() => new Map(INSTITUTIONS.map((i) => [i.id, i])), []);
  const lifecycle = useMemo(() => new Map(fdrs.map((f) => [f.id, lifecycleOf(f, fdrs, today)])), [fdrs, today]);
  const matches = useMemo(() => findMatches(fdrs, rules), [fdrs, rules]);
  const alerts = useMemo(() => buildAlerts({ fdrs, institutions: institutionById, lifecycle, matches, rules }), [fdrs, institutionById, lifecycle, matches, rules]);
  const risk = useMemo(() => new Map(fdrs.map((f) => [f.id, riskFor(f.id, alerts)])), [fdrs, alerts]);

  const extraEvents = useMemo(() => [...sharedAudit, ...localAudit].sort((a, b) => a.at.localeCompare(b.at)), [sharedAudit, localAudit]);
  const rebuildChain = useCallback(async () => {
    setChain(await buildChain([...BASE_EVENTS, ...extraEvents]));
  }, [extraEvents]);
  useEffect(() => { void rebuildChain(); }, [rebuildChain]);

  const addUpload = useCallback((fdr: FDR, scanThumb: string | undefined, audit: { detail: string }[]) => {
    const now = new Date().toISOString();
    setUploads((prev) => { const next = [...prev, fdr]; writeShared('uploads', next); return next; });
    if (scanThumb) setScans((prev) => { const next = { ...prev, [fdr.id]: scanThumb }; writeShared('scans', next); return next; });
    // Every new FDR goes to its bank for verification and a lien, like the real process.
    const requests: BankEvent[] = (['request-verification', 'request-lien'] as const).map((kind) => ({ id: newId('BE'), at: now, fdrId: fdr.id, kind, source: 'aicte' }));
    setBankEvents((prev) => { const next = [...prev, ...requests]; writeShared('bank', next); return next; });
    logShared([
      ...audit.map((a, i) => ({ at: new Date(Date.parse(now) + i).toISOString(), actor: i === 0 ? 'Officer upload' : 'System · OCR', action: i === 0 ? 'FDR uploaded' : 'Fields extracted', fdrId: fdr.id, detail: a.detail })),
      ...requests.map((r, i) => ({ at: new Date(Date.parse(now) + 10 + i).toISOString(), actor: 'Officer · FDR Cell', action: BANK_EVENT_LABEL[r.kind], fdrId: fdr.id, detail: 'Sent to bank gateway (simulated)' })),
    ]);
  }, [logShared]);

  const sendBankEvent = useCallback((fdrId: string, kind: BankEventKind, source: 'aicte' | 'bank', note?: string) => {
    const e: BankEvent = { id: newId('BE'), at: new Date().toISOString(), fdrId, kind, source, note };
    setBankEvents((prev) => { const next = [...prev, e]; writeShared('bank', next); return next; });
    logShared([{ at: e.at, actor: source === 'bank' ? 'Bank gateway (simulated)' : 'Officer · FDR Cell', action: BANK_EVENT_LABEL[kind], fdrId, detail: note || (source === 'bank' ? 'Received from bank' : 'Sent to bank') }]);
  }, [logShared]);

  const issueAck = useCallback(async (fdrId: string, by: string) => {
    const f = fdrById.get(fdrId)!;
    const inst = institutionById.get(f.institutionId);
    const seq = String(acks.length + 1).padStart(4, '0');
    const id = `ACK-${new Date().getFullYear()}-${seq}-${Math.floor(Math.random() * 900 + 100)}`;
    const payload: AckPayload = {
      v: 1, ack: id, fdr: f.id, no: f.fdrNumber, bank: f.bank, ifsc: f.ifsc, holder: f.accountHolder,
      inst: inst?.name ?? f.institutionId, aicteId: inst?.aicteId ?? '', amt: f.amount, mat: f.maturityDate,
      iat: new Date().toISOString(), by, kid: KEY_ID,
    };
    const ack: Acknowledgement = { id, fdrId, token: await signAck(payload), issuedAt: payload.iat, issuedBy: by };
    setAcks((prev) => { const next = [...prev, ack]; writeShared('acks', next); return next; });
    logShared([{ at: payload.iat, actor: 'Officer · FDR Cell', action: 'Acknowledgement issued', fdrId, detail: `${id} · signed (ECDSA P-256, key ${KEY_ID})` }]);
    return ack;
  }, [acks.length, fdrById, institutionById, logShared]);

  const injectTestCases = useCallback(async () => {
    const stamp = Date.now().toString(36).toUpperCase();
    const now = new Date().toISOString();
    // Copy only clean records so each test case triggers exactly the problem it injects.
    const matched = new Set(findMatches(BASE_FDRS).flatMap((m) => [m.a, m.b]));
    const freshNumber = (src: FDR) => String(1 + Math.floor(Math.random() * 9)) + Array.from({ length: src.fdrNumber.length - 1 }, () => Math.floor(Math.random() * 10)).join('');
    const held = BASE_FDRS.filter((f) => {
      if (matched.has(f.id)) return false;
      const inst = INSTITUTIONS.find((i) => i.id === f.institutionId);
      return lifecycleOf(f, BASE_FDRS, today).status === 'active' && f.lien === 'confirmed' && f.bankVerification === 'verified'
        && !f.release && Math.min(...Object.values(f.ocrConfidence)) >= DEFAULT_RULES.ocrLow
        && !!inst && textSimilarity(f.accountHolder, inst.trustName) >= 0.6;
    });
    const at = (frac: number) => held[Math.floor(held.length * frac)];
    const [src1, src2, src3, src4] = [at(0.1), at(0.35), at(0.6), at(0.85)];
    const other = (instId: string) => INSTITUTIONS.find((i) => i.id !== instId)!;
    const tag = (n: number) => `TEST-${stamp}-${n}`;
    const shiftDays = (d: number) => { const t = new Date(); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };

    const cases: FDR[] = [
      // Duplicate: another institution submits an exact copy of an existing FDR.
      { ...src1, id: tag(1), institutionId: other(src1.institutionId).id, uploadedAt: now, release: undefined, renewedFromId: undefined, isTestCase: true },
      // Altered: same institution resubmits its FDR with the amount inflated.
      { ...src2, id: tag(2), amount: src2.amount + 2500000, fileHash: undefined, uploadedAt: now, release: undefined, renewedFromId: undefined, isTestCase: true },
      // Overdue: matured 20 days ago, never renewed.
      { ...src3, id: tag(3), fdrNumber: freshNumber(src3), fileHash: undefined, imageHash: undefined,
        amount: src3.amount + 500000, ifsc: src3.ifsc.slice(0, -3) + '901',
        issueDate: shiftDays(-3 * 365 - 20), maturityDate: shiftDays(-20), uploadedAt: now, release: undefined, renewedFromId: undefined, isTestCase: true },
      // Incomplete: release requested with most documents missing, and no lien.
      { ...src4, id: tag(4), fdrNumber: freshNumber(src4), fileHash: undefined, imageHash: undefined,
        amount: src4.amount + 700000, ifsc: src4.ifsc.slice(0, -3) + '902', issueDate: shiftDays(-400), maturityDate: shiftDays(330),
        lien: 'not-marked', uploadedAt: now, renewedFromId: undefined, isTestCase: true,
        release: { requestedAt: now, reason: 'Stress test', checklist: [
          { item: 'Release request on institution letterhead', done: true },
          { item: 'Original FDR submitted to AICTE', done: false },
          { item: 'No-dues certificate from AICTE accounts', done: false },
          { item: 'No pending complaints / show-cause notices', done: false },
          { item: 'Compliance clearance from Regional Office', done: false },
          { item: 'Bank lien-release letter draft', done: false },
        ] } },
    ];
    setTestCases((prev) => [...prev, ...cases]);
    setLocalAudit((prev) => [...prev, ...cases.map((c) => ({ at: now, actor: 'Stress Test mode', action: 'Test case injected', fdrId: c.id, detail: 'Synthetic record for integrity testing' }))]);
    return cases;
  }, [today]);

  const clearTestCases = useCallback(() => {
    const ids = new Set(testCases.map((c) => c.id));
    setTestCases([]);
    setLocalAudit((prev) => prev.filter((e) => !e.fdrId || !ids.has(e.fdrId)));
  }, [testCases]);

  const tamperEvent = useCallback((index: number) => {
    setChain((c) => c && c.map((e) => (e.index === index ? { ...e, detail: e.detail + ' [edited]' } : e)));
  }, []);

  const value: Store = {
    today, institutions: INSTITUTIONS, institutionById, fdrs, fdrById, lifecycle, matches, alerts, risk, rules, chain,
    testCaseIds: testCases.map((t) => t.id), decisions, bankEvents, bankState, acks, scanFor: (id) => scans[id],
    recordDecision, addUpload, sendBankEvent, issueAck, injectTestCases, clearTestCases, tamperEvent, rebuildChain,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}

/** Why an acknowledgement can or cannot be issued for this FDR right now. */
export function ackEligibility(f: FDR, lc: Lifecycle, fdrAlerts: Alert[]): { ok: boolean; reasons: { ok: boolean; text: string }[] } {
  const reasons = [
    { ok: f.bankVerification === 'verified', text: 'Bank has confirmed the FDR is genuine' },
    { ok: f.lien === 'confirmed', text: 'Bank has locked it for AICTE' },
    { ok: isHeld(lc.status) && lc.status !== 'lapsed', text: 'FDR is still active (not closed or matured)' },
    { ok: !fdrAlerts.some((a) => a.severity === 'critical' || a.severity === 'serious'), text: 'No urgent problems open (such as a duplicate claim)' },
  ];
  return { ok: reasons.every((r) => r.ok), reasons };
}
