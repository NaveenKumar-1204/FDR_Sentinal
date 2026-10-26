import { ArrowLeft, ArrowRight, BadgeCheck, Building2, CalendarClock, CheckCircle2, ChevronDown, Clock, ExternalLink, FileImage, FileSearch, Fingerprint, Gauge, Gavel, GitCompare, Layers, Lightbulb, Lock, LockOpen, OctagonAlert, QrCode, ScanText, ScrollText, ShieldAlert, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { BankBadge, Badge, Button, Card, Empty, FdrLink, LienBadge, LifecycleBadge, Meter, PageHeader, SEVERITY_META, SeverityBadge, cx } from '../components/ui';
import type { FDR, OcrField } from '../data/types';
import { formatDate, formatDateTime, formatINR, formatINRShort, pct } from '../lib/format';
import { VIEW_LABEL, WEIGHTS, type View } from '../lib/mtdi';
import { textSimilarity } from '../lib/similarity';
import { BANKS } from '../lib/ocr/banks';
import { useSession } from '../session';
import { ackEligibility, DECISION_LABEL, useStore, type DecisionKind } from '../store';

const FIELDS: { key: OcrField; label: string; render: (f: FDR) => string }[] = [
  { key: 'fdrNumber', label: 'FDR number', render: (f) => f.fdrNumber },
  { key: 'bank', label: 'Bank', render: (f) => f.bank },
  { key: 'branch', label: 'Branch', render: (f) => f.branch },
  { key: 'ifsc', label: 'IFSC', render: (f) => f.ifsc },
  { key: 'accountHolder', label: 'Account holder', render: (f) => f.accountHolder },
  { key: 'amount', label: 'Amount', render: (f) => formatINR(f.amount) },
  { key: 'issueDate', label: 'Issue date', render: (f) => formatDate(f.issueDate) },
  { key: 'maturityDate', label: 'Maturity date', render: (f) => formatDate(f.maturityDate) },
];

const linkBtn = 'inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition-all active:scale-[0.97]';

export default function TwinPage({ id }: { id: string }) {
  const { fdrById, institutionById, lifecycle, matches, alerts, risk, chain, decisions, rules, scanFor } = useStore();
  const f = fdrById.get(id);
  if (!f) return <Empty>No FDR with id “{id}”. <a href="#/registry" className="text-accent">Back to all FDRs</a></Empty>;

  const inst = institutionById.get(f.institutionId);
  const lc = lifecycle.get(f.id)!;
  const r = risk.get(f.id)!;
  const myAlerts = alerts.filter((a) => a.fdrId === f.id);
  const myMatches = matches.filter((m) => m.a === f.id || m.b === f.id);
  const events = chain?.filter((e) => e.fdrId === f.id) ?? [];
  const holderOk = inst ? textSimilarity(f.accountHolder, inst.trustName) >= 0.6 : true;
  const renewedFrom = f.renewedFromId ? fdrById.get(f.renewedFromId) : undefined;
  const decision = decisions[f.id];
  const scan = scanFor(f.id);

  return (
    <>
      <a href="#/registry" className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink"><ArrowLeft size={15} /> All FDRs</a>
      <PageHeader icon={Layers} hue="violet" eyebrow={f.id} title={`FDR ${f.fdrNumber}`}
        description={`${inst?.name ?? f.institutionId} · ${f.bank} · ${formatINR(f.amount)}`}
        actions={<>
          {f.isTestCase && <Badge tone="warn">Demo test case</Badge>}
          <LifecycleBadge status={lc.status} />
        </>} />

      <StatusCard fdrId={f.id} />

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="stagger space-y-6 xl:col-span-2">
          {myAlerts.length > 0 && (
            <Card icon={ShieldAlert} hue="rose" title={`Problems found (${myAlerts.length})`} subtitle="What is wrong, and what to do about it.">
              <ul className="space-y-3">
                {myAlerts.map((a) => (
                  <li key={a.id} className="rounded-xl border border-line p-3.5">
                    <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={a.severity} /><span className="text-[14px] font-semibold text-ink">{a.title}</span></div>
                    <p className="mt-1.5 text-[13px] text-ink-2">{a.why[0]}{a.relatedFdrId && <> · see <FdrLink id={a.relatedFdrId} /></>}</p>
                    <p className="tint-cool mt-2.5 flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] text-ink"><Lightbulb size={15} className="mt-0.5 shrink-0 text-accent" /><span><strong>What to do:</strong> {a.action}</span></p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card icon={ScanText} hue="sky" title="FDR details" subtitle="Read from the uploaded document.">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              {FIELDS.map(({ key, label, render }) => {
                const low = f.ocrConfidence[key] < rules.ocrLow;
                return (
                  <div key={key} className={cx('rounded-lg px-3 py-2', low ? 'bg-warn-soft ring-1 ring-warn' : 'bg-subtle')}>
                    <dt className="flex items-center justify-between text-[12px] text-muted">{label}{low && <span className="font-semibold text-ink">Please check</span>}</dt>
                    <dd className="tabular mt-0.5 text-[14px] font-semibold text-ink">{render(f)}</dd>
                  </div>
                );
              })}
              <div className="rounded-lg bg-subtle px-3 py-2">
                <dt className="text-[12px] text-muted">Interest rate</dt>
                <dd className="tabular mt-0.5 text-[14px] font-semibold text-ink">{f.interestRate.toFixed(2)}% a year</dd>
              </div>
              <div className="rounded-lg bg-subtle px-3 py-2">
                <dt className="text-[12px] text-muted">Institution</dt>
                <dd className="mt-0.5 text-[14px] font-semibold text-ink">{inst?.name ?? '—'}</dd>
              </div>
            </dl>
          </Card>
        </div>

        <div className="stagger space-y-6">
          {scan && (
            <Card icon={FileImage} hue="violet" title="Uploaded scan" bodyClassName="p-3">
              <a href={scan} target="_blank" rel="noopener"><img src={scan} alt={`Scan of ${f.fdrNumber}`} className="max-h-[360px] w-full rounded-xl border border-line object-contain" /></a>
            </Card>
          )}
          <DecisionCard fdrId={f.id} current={decision ? `${DECISION_LABEL[decision.kind]} · ${formatDateTime(decision.at)}` : undefined} />
        </div>
      </div>

      <details className="group mt-8">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-xl px-3 py-2 text-[13.5px] font-semibold text-ink-2 transition-colors hover:bg-subtle hover:text-ink [&::-webkit-details-marker]:hidden">
          <Fingerprint size={16} className="text-accent" /> Advanced details (for audits) <ChevronDown size={15} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card icon={GitCompare} hue="violet" title="Similar FDRs" subtitle="Other records that look like the same deposit, and why.">
              {myMatches.length === 0 ? <p className="text-sm text-ink-2">No similar FDRs found.</p> : (
                <div className="space-y-5">
                  {myMatches.map((m) => {
                    const other = fdrById.get(m.a === f.id ? m.b : m.a)!;
                    const otherInst = institutionById.get(other.institutionId);
                    return (
                      <div key={`${m.a}-${m.b}`} className="rounded-lg border border-line p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={m.level === 'strong' ? 'critical' : 'warn'} icon={m.level === 'strong' ? SEVERITY_META.critical.icon : SEVERITY_META.warning.icon}>
                            {m.level === 'strong' ? 'Very similar' : 'Somewhat similar'} · <span className="tabular">{pct(m.score)}</span>
                          </Badge>
                          <FdrLink id={other.id} />
                          <span className="text-[13px] text-ink-2">{otherInst?.name}{m.crossInstitution ? '' : ' (same institution)'}</span>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
                          <div>
                            <h4 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Why they match</h4>
                            <ul className="space-y-2">
                              {(Object.keys(WEIGHTS) as View[]).map((v) => {
                                const s = m.views[v];
                                return (
                                  <li key={v} className="text-[13px]">
                                    <div className="text-ink-2">{VIEW_LABEL[v]}</div>
                                    {s === undefined ? <div className="text-[12px] text-muted">Not compared</div> : <Meter value={s} label={VIEW_LABEL[v]} />}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                          <div className="overflow-x-auto">
                            <h4 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Side by side</h4>
                            <table className="w-full text-[12.5px]">
                              <thead className="text-left text-muted"><tr><th className="py-1 font-medium">Field</th><th className="py-1 font-medium">{f.id}</th><th className="py-1 font-medium">{other.id}</th></tr></thead>
                              <tbody>
                                {FIELDS.map(({ key, label, render }) => {
                                  const same = render(f) === render(other);
                                  return (
                                    <tr key={key} className="border-t border-line">
                                      <td className="py-1.5 pr-2 text-muted">{label}</td>
                                      <td className={cx('tabular py-1.5 pr-2', !same && 'font-semibold text-ink')}>{render(f)}</td>
                                      <td className={cx('tabular py-1.5', !same && 'font-semibold text-ink')}>
                                        <span className="inline-flex items-center gap-1">
                                          {same ? <CheckCircle2 size={13} className="shrink-0 text-good" aria-label="Same" /> : <XCircle size={13} className="shrink-0 text-critical" aria-label="Different" />}
                                          {render(other)}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card icon={ScrollText} hue="indigo" title="History" subtitle="Every recorded step. Each entry is chained to the one before, so edits would show." bodyClassName="p-0">
              {events.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No events yet.</p> : (
                <ol className="divide-y divide-line">
                  {events.map((e) => (
                    <li key={e.index} className="grid grid-cols-1 gap-1 px-5 py-3 text-[13px] sm:grid-cols-[150px_1fr_auto] sm:gap-4">
                      <span className="tabular text-muted">{formatDateTime(e.at)}</span>
                      <span><span className="font-medium text-ink">{e.action}</span> <span className="text-ink-2">· {e.actor}</span><br /><span className="text-[12.5px] text-muted">{e.detail}</span></span>
                      <code className="font-mono text-[11.5px] text-muted" title={e.hash}>#{e.index} {e.hash.slice(0, 10)}…</code>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card icon={Gauge} hue="amber" title="Risk score" subtitle="0 is clean. Each problem adds points.">
              <div className="flex items-center gap-4">
                <RiskRing score={r.score} />
                <p className="text-[13px] text-ink-2">{r.score === 0 ? 'No warning signs.' : `${r.contributors.length} warning sign${r.contributors.length > 1 ? 's' : ''}.`}</p>
              </div>
              {r.contributors.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {r.contributors.map((c, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 text-[13px]">
                      <span className="text-ink-2">{c.title}</span>
                      <span className="tabular shrink-0 font-medium text-ink">+{c.points}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card icon={BadgeCheck} hue="teal" title="Bank checks">
              <ul className="space-y-3 text-[13px]">
                <Row label="Bank says it is genuine"><BankBadge status={f.bankVerification} /></Row>
                <Row label="Locked for AICTE"><LienBadge lien={f.lien} /></Row>
                <Row label="In the trust's name" hint={inst?.trustName}>
                  {holderOk ? <Badge tone="good" icon={CheckCircle2}>Matches</Badge> : <Badge tone="serious" icon={XCircle}>Different</Badge>}
                </Row>
                <Row label="File fingerprint" hint="SHA-256">
                  <code className="font-mono text-[11.5px] text-ink-2" title={f.fileHash}>{f.fileHash ? f.fileHash.slice(0, 12) + '…' : '—'}</code>
                </Row>
                <Row label="Image fingerprint" hint="Spots re-scans of the same paper">
                  <code className="font-mono text-[11.5px] text-ink-2">{f.imageHash ?? '—'}</code>
                </Row>
              </ul>
              <BankActions fdrId={f.id} />
            </Card>

            <Card icon={CalendarClock} hue="amber" title="Timeline">
              <ol className="relative space-y-4 border-l border-line pl-5 text-[13px]">
                {renewedFrom && <Step done label="Renewed from" value={<FdrLink id={renewedFrom.id} />} />}
                <Step done label="Issued by bank" value={formatDate(f.issueDate)} />
                <Step done label="Added here" value={formatDateTime(f.uploadedAt)} />
                <Step done={f.lien === 'confirmed'} label="Locked for AICTE" value={f.lien === 'confirmed' ? 'Yes' : 'Not yet'} />
                <Step done={lc.daysToMaturity < 0} label="Matures" value={`${formatDate(f.maturityDate)} · ${lc.daysToMaturity >= 0 ? `in ${lc.daysToMaturity} days` : `${-lc.daysToMaturity} days ago`}`} />
                {lc.renewedById && <Step done label="Renewed as" value={<FdrLink id={lc.renewedById} />} />}
                {f.release && <Step done={!!f.release.releasedAt} label={f.release.releasedAt ? 'Returned' : 'Return requested'} value={formatDate((f.release.releasedAt ?? f.release.requestedAt).slice(0, 10))} />}
              </ol>
              <div className="mt-4 text-[12.5px] text-muted">{formatINRShort(f.amount)} at {f.interestRate.toFixed(2)}%</div>
            </Card>
          </div>
        </div>
      </details>
    </>
  );
}

type StepState = 'done' | 'now' | 'todo' | 'bad';

/** The one place an officer needs to look: how far this FDR has got, and the single next thing to do. */
function StatusCard({ fdrId }: { fdrId: string }) {
  const { fdrById, lifecycle, alerts, acks, issueAck, bankState, sendBankEvent } = useStore();
  const { profile } = useSession();
  const [busy, setBusy] = useState(false);
  const f = fdrById.get(fdrId)!;
  const lc = lifecycle.get(fdrId)!;
  const mine = acks.filter((a) => a.fdrId === fdrId);
  // Includes alerts raised on another record that point at this one (e.g. someone else claiming the same deposit).
  const elig = ackEligibility(f, lc, alerts.filter((a) => a.fdrId === fdrId || a.relatedFdrId === fdrId));
  const p = bankState.get(fdrId)?.pending ?? { verification: false, lien: false, lienRelease: false };
  const code = BANKS.find((b) => b.name === f.bank)?.code ?? '';
  const verified = f.bankVerification === 'verified', locked = f.lien === 'confirmed';
  const bankBad = f.bankVerification === 'mismatch' || f.bankVerification === 'not-found';

  const raw: { label: string; done: boolean; bad?: boolean }[] = [
    { label: 'Added', done: true },
    { label: 'Bank confirmed', done: verified, bad: bankBad },
    { label: 'Locked for AICTE', done: locked },
    { label: 'QR receipt given', done: mine.length > 0 },
  ];
  const firstOpen = raw.findIndex((s) => !s.done);
  const steps = raw.map((s, i): { label: string; state: StepState } => ({ label: s.label, state: s.done ? 'done' : s.bad ? 'bad' : i === firstOpen ? 'now' : 'todo' }));

  const issue = async () => {
    setBusy(true);
    const a = await issueAck(fdrId, `${profile.name}, ${profile.designation}`);
    setBusy(false);
    window.location.hash = `#/ack/${a.id}`;
  };

  let next: { tone: 'good' | 'warn' | 'bad' | 'info'; text: ReactNode; action?: ReactNode };
  if (lc.status === 'closed') {
    next = { tone: 'bad', text: 'The bank says this FDR has been closed. The money is no longer held for AICTE. Contact the institution.' };
  } else if (bankBad) {
    next = { tone: 'bad', text: f.bankVerification === 'mismatch' ? "The bank's records don't match this FDR. Check it with the institution." : 'The bank could not find this FDR. It may be fake. Investigate.' };
  } else if (!verified || !locked) {
    const askVerify = !verified && !p.verification, askLock = !locked && !p.lien;
    next = askVerify || askLock
      ? { tone: 'info', text: 'Next: ask the bank to confirm this FDR and lock it for AICTE.',
          action: <Button variant="primary" icon={Building2} onClick={() => { if (askVerify) sendBankEvent(fdrId, 'request-verification', 'aicte'); if (askLock) sendBankEvent(fdrId, 'request-lien', 'aicte'); }}>Ask the bank</Button> }
      : { tone: 'info', text: 'Request sent. Waiting for the bank to reply.',
          action: <a href={`#/bank?bank=${code}`} target="fdrx-bank" rel="noopener" className={cx(linkBtn, 'border-line-strong bg-surface text-ink hover:bg-subtle')}>Open bank view (demo) <ExternalLink size={14} /></a> };
  } else if (!elig.ok) {
    next = { tone: 'warn', text: <>Not ready for a receipt yet. Still needed: {elig.reasons.filter((r) => !r.ok).map((r) => r.text.toLowerCase()).join('; ')}. See the problems below.</> };
  } else if (!mine.length) {
    next = { tone: 'good', text: 'All checks passed. You can now give the institution a QR receipt.',
      action: <Button variant="primary" icon={QrCode} disabled={busy} onClick={() => void issue()}>{busy ? 'Signing…' : 'Give QR receipt'}</Button> };
  } else {
    next = { tone: 'good', text: 'Done. This FDR is confirmed, locked and has a receipt.',
      action: <a href={`#/ack/${mine[mine.length - 1].id}`} className={cx(linkBtn, 'brand-gradient border-transparent text-white')}>View receipt <ArrowRight size={14} /></a> };
  }

  const TONE = {
    good: { cls: 'tint-good', icon: CheckCircle2, ic: 'text-good' },
    warn: { cls: 'bg-warn-soft', icon: ShieldAlert, ic: 'text-warn-ink' },
    bad: { cls: 'tint-bad', icon: OctagonAlert, ic: 'text-critical' },
    info: { cls: 'tint-cool', icon: Clock, ic: 'text-accent' },
  }[next.tone];

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_3px_rgba(20,26,51,0.05)]">
      <ol className="grid grid-cols-4 gap-2" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s.label} className="relative flex flex-col items-center text-center">
            {i > 0 && <span className={cx('absolute right-1/2 top-[15px] h-[3px] w-[calc(100%+0.5rem)]', s.state === 'done' ? 'bg-good' : 'bg-line')} aria-hidden />}
            <span className={cx('relative grid size-8 place-items-center rounded-full text-[13px] font-bold ring-4 ring-surface',
              s.state === 'done' ? 'bg-good text-white' : s.state === 'bad' ? 'bg-critical text-white' : s.state === 'now' ? 'brand-gradient text-white' : 'bg-subtle text-muted')}>
              {s.state === 'done' ? <CheckCircle2 size={17} /> : s.state === 'bad' ? <XCircle size={17} /> : i + 1}
            </span>
            <span className={cx('mt-2 text-[12.5px] font-semibold leading-tight', s.state === 'todo' ? 'text-muted' : 'text-ink')}>{s.label}</span>
          </li>
        ))}
      </ol>
      <div className={cx('mt-5 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3', TONE.cls)}>
        <TONE.icon size={20} className={cx('shrink-0', TONE.ic)} />
        <p className="min-w-0 flex-1 text-[14px] font-medium text-ink">{next.text}</p>
        {next.action}
      </div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-3">
      <span><span className="text-ink">{label}</span>{hint && <span className="block text-[12px] text-muted">{hint}</span>}</span>
      <span className="shrink-0">{children}</span>
    </li>
  );
}

function Step({ done, label, value }: { done: boolean; label: string; value: React.ReactNode }) {
  return (
    <li>
      <span className={cx('absolute -left-[5px] mt-1 size-2.5 rounded-full ring-2 ring-surface', done ? 'bg-accent' : 'bg-line-strong')} />
      <div className="text-muted">{label}</div>
      <div className="tabular font-medium text-ink">{value}</div>
    </li>
  );
}

function RiskRing({ score }: { score: number }) {
  const color = score >= 45 ? 'var(--color-critical)' : score >= 20 ? 'var(--color-serious)' : score > 0 ? 'var(--color-warn)' : 'var(--color-good)';
  const c = 2 * Math.PI * 26;
  return (
    <svg width={68} height={68} viewBox="0 0 68 68" role="img" aria-label={`Risk score ${score} of 100`}>
      <circle cx={34} cy={34} r={26} fill="none" stroke="var(--color-line)" strokeWidth={6} />
      <circle cx={34} cy={34} r={26} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 34 34)" />
      <text x={34} y={34} dy="0.35em" textAnchor="middle" fontSize={17} fontWeight={600} fill="var(--color-ink)">{score}</text>
    </svg>
  );
}

function DecisionCard({ fdrId, current }: { fdrId: string; current?: string }) {
  const { recordDecision } = useStore();
  const [note, setNote] = useState('');
  const act = (k: DecisionKind) => { recordDecision(fdrId, k, note.trim()); setNote(''); };
  return (
    <Card icon={Gavel} hue="indigo" title="Your decision" subtitle="Saved in the history. The system never decides for you.">
      {current && <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-ink"><Gavel size={14} className="text-accent" />{current}</p>}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note (optional)" aria-label="Decision note"
        className="w-full resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" icon={CheckCircle2} onClick={() => act('accepted')}>Looks genuine</Button>
        <Button icon={FileSearch} onClick={() => act('documents-requested')}>Ask for documents</Button>
        <Button variant="danger" icon={Fingerprint} onClick={() => act('investigate')}>Investigate</Button>
      </div>
    </Card>
  );
}

function BankActions({ fdrId }: { fdrId: string }) {
  const { fdrById, bankState, sendBankEvent, lifecycle } = useStore();
  const f = fdrById.get(fdrId)!;
  const p = bankState.get(fdrId)?.pending ?? { verification: false, lien: false, lienRelease: false };
  const closed = lifecycle.get(fdrId)?.status === 'closed';
  const code = BANKS.find((b) => b.name === f.bank)?.code ?? '';
  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold uppercase tracking-wider text-muted">Requests to bank</span>
        <a href={`#/bank?bank=${code}`} target="fdrx-bank" rel="noopener" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline">Bank view (demo) <ExternalLink size={13} /></a>
      </div>
      {(p.verification || p.lien || p.lienRelease) && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {p.verification && <Badge tone="info" icon={Clock}>Asked to confirm</Badge>}
          {p.lien && <Badge tone="info" icon={Clock}>Asked to lock</Badge>}
          {p.lienRelease && <Badge tone="info" icon={Clock}>Asked to unlock</Badge>}
        </div>
      )}
      {!closed && (
        <div className="flex flex-wrap gap-2">
          {f.bankVerification !== 'verified' && !p.verification && <Button icon={Building2} onClick={() => sendBankEvent(fdrId, 'request-verification', 'aicte')}>Ask to confirm</Button>}
          {f.lien !== 'confirmed' && !p.lien && <Button icon={Lock} onClick={() => sendBankEvent(fdrId, 'request-lien', 'aicte')}>Ask to lock</Button>}
          {f.lien === 'confirmed' && !p.lienRelease && f.release && <Button icon={LockOpen} onClick={() => sendBankEvent(fdrId, 'request-lien-release', 'aicte')}>Ask to unlock</Button>}
        </div>
      )}
    </div>
  );
}
