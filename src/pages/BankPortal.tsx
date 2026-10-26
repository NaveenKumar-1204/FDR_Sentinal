// Simulated bank gateway — stands in for the bank's side of the integration so the full flow can be shown live:
// AICTE asks the bank to verify and lock a deposit; the bank answers; an early-closure attempt is blocked or not.
import { ArrowLeft, Building2, CheckCircle2, Clock, Inbox, Landmark, Lock, LockOpen, OctagonAlert, ShieldAlert, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import ThemeToggle from '../components/ThemeToggle';
import BankToasts from '../components/Toasts';
import { BankBadge, Badge, Button, Card, Empty, LienBadge, LifecycleBadge, cx } from '../components/ui';
import { formatDate, formatDateTime, formatINRShort } from '../lib/format';
import { BANKS } from '../lib/ocr/banks';
import { BANK_EVENT_LABEL, useStore } from '../store';

export default function BankPortal({ query }: { query: URLSearchParams }) {
  const { fdrs, bankState, bankEvents, sendBankEvent, institutionById, lifecycle } = useStore();
  const real = fdrs.filter((f) => !f.isTestCase);
  const banksHere = useMemo(() => BANKS.filter((b) => real.some((f) => f.bank === b.name)), [real]);
  const pendingCount = (bank: string) => real.filter((f) => f.bank === bank && Object.values(bankState.get(f.id)?.pending ?? {}).some(Boolean)).length;
  const defaultBank = query.get('bank') && banksHere.some((b) => b.code === query.get('bank'))
    ? banksHere.find((b) => b.code === query.get('bank'))!.name
    : [...banksHere].sort((a, b) => pendingCount(b.name) - pendingCount(a.name))[0]?.name ?? BANKS[0].name;
  const [bank, setBank] = useState(defaultBank);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const deposits = real.filter((f) => f.bank === bank);
  const requests = deposits.filter((f) => Object.values(bankState.get(f.id)?.pending ?? {}).some(Boolean));
  const log = bankEvents.filter((e) => deposits.some((f) => f.id === e.fdrId)).slice(-14).reverse();

  const closeEarly = (id: string) => {
    const f = deposits.find((x) => x.id === id)!;
    if (f.lien === 'confirmed') {
      sendBankEvent(id, 'closure-blocked', 'bank', 'Customer asked for premature closure — refused, lien held for AICTE');
      setNotice({ ok: true, text: `Closure of ${f.fdrNumber} refused: the deposit is locked in favour of AICTE. AICTE has been told.` });
    } else {
      sendBankEvent(id, 'closed', 'bank', 'Premature closure processed — no lien on the deposit');
      setNotice({ ok: false, text: `${f.fdrNumber} closed and paid out — there was no lien, so nothing stopped it. AICTE has been alerted.` });
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, var(--color-teal-soft), transparent 320px), var(--color-page)' }}>
      <BankToasts from="aicte" linkToTwin={false} />
      <header className="border-b border-line bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <span className="grid size-10 place-items-center rounded-2xl text-white" style={{ background: 'linear-gradient(135deg, #0d9488, #0b5f58)' }}><Landmark size={20} /></span>
          <div className="leading-tight">
            <div className="text-[16px] font-extrabold tracking-tight text-ink">Bank Gateway <span className="text-teal">Simulator</span></div>
            <div className="text-[11.5px] font-medium text-muted">The bank's side of the AICTE deposit integration</div>
          </div>
          <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-amber-soft px-3 py-1.5 text-[12px] font-semibold text-ink sm:inline-flex"><ShieldAlert size={13} className="text-amber" /> Demo only — not connected to any real bank</span>
          <a href="#/" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-accent hover:text-accent"><ArrowLeft size={15} /> Back to dashboard</a>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-teal">Signed in as branch operations</div>
            <h1 className="text-[26px] font-extrabold tracking-tight text-ink">{bank}</h1>
            <p className="mt-1 text-[14px] text-ink-2">Answer AICTE's requests and see what happens when a college tries to break its deposit early.</p>
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-ink-2">Bank</span>
            <select value={bank} onChange={(e) => { setBank(e.target.value); setNotice(null); }} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-[13.5px] font-semibold text-ink">
              {banksHere.map((b) => <option key={b.code} value={b.name}>{b.name}{pendingCount(b.name) ? ` (${pendingCount(b.name)} pending)` : ''}</option>)}
            </select>
          </label>
        </div>

        {notice && (
          <div className={cx('page-enter mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3 text-[13.5px] text-ink', notice.ok ? 'tint-good border-good/30' : 'tint-bad border-critical/30')}>
            {notice.ok ? <Lock size={18} className="mt-0.5 shrink-0 text-good" /> : <OctagonAlert size={18} className="mt-0.5 shrink-0 text-critical" />}
            {notice.text}
          </div>
        )}

        <div className="stagger grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card icon={Inbox} hue="teal" title="Requests from AICTE" subtitle={requests.length ? `${requests.length} waiting for the bank` : 'Nothing waiting'}>
              {requests.length === 0 ? <Empty>No pending requests for {bank}. Upload an FDR in the AICTE dashboard to create one.</Empty> : (
                <ul className="space-y-3">
                  {requests.map((f) => {
                    const p = bankState.get(f.id)!.pending;
                    const inst = institutionById.get(f.institutionId);
                    return (
                      <li key={f.id} className="rounded-2xl border border-line p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tabular text-[15px] font-bold text-ink">{f.fdrNumber}</span>
                          <span className="text-[12.5px] text-muted">{f.id}</span>
                          {f.isUploaded && <Badge tone="accent">New upload</Badge>}
                        </div>
                        <div className="mt-1 text-[13px] text-ink-2">{f.accountHolder} · {formatINRShort(f.amount)} · matures {formatDate(f.maturityDate)} · {inst?.name}</div>
                        {p.verification && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Badge tone="info" icon={Clock}>Verify this FDR</Badge>
                            <Button variant="primary" icon={CheckCircle2} onClick={() => sendBankEvent(f.id, 'verified', 'bank', 'Matches bank records')}>Genuine</Button>
                            <Button icon={XCircle} onClick={() => sendBankEvent(f.id, 'mismatch', 'bank', 'Amount / dates differ from bank records')}>Details differ</Button>
                            <Button variant="danger" icon={XCircle} onClick={() => sendBankEvent(f.id, 'not-found', 'bank', 'No such deposit at this bank')}>Not found</Button>
                          </div>
                        )}
                        {p.lien && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Badge tone="info" icon={Lock}>Lock for AICTE</Badge>
                            <Button variant="primary" icon={Lock} onClick={() => sendBankEvent(f.id, 'lien-marked', 'bank', 'Lien marked in favour of AICTE')}>Mark lien</Button>
                          </div>
                        )}
                        {p.lienRelease && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Badge tone="info" icon={LockOpen}>Release the lock</Badge>
                            <Button icon={LockOpen} onClick={() => sendBankEvent(f.id, 'lien-released', 'bank', 'Lien released on AICTE instruction')}>Release lien</Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card icon={Building2} hue="sky" title="Deposits at this bank" subtitle="“Customer asks to close early” shows what the lien protects against." bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-[13px]">
                  <thead className="tint-cool text-left text-[11.5px] font-bold uppercase tracking-wider text-accent-strong">
                    <tr>{['FDR', 'Holder', 'Amount', 'Status', 'Lien', 'Verified', ''].map((h) => <th key={h} className="px-4 py-2.5">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {deposits.map((f) => {
                      const lc = lifecycle.get(f.id)!;
                      return (
                        <tr key={f.id} className="hover:bg-subtle">
                          <td className="px-4 py-2.5"><div className="tabular font-semibold text-ink">{f.fdrNumber}</div><div className="text-[11.5px] text-muted">{f.id}</div></td>
                          <td className="max-w-52 truncate px-4 py-2.5 text-ink-2">{f.accountHolder}</td>
                          <td className="tabular px-4 py-2.5 font-semibold">{formatINRShort(f.amount)}</td>
                          <td className="px-4 py-2.5"><LifecycleBadge status={lc.status} /></td>
                          <td className="px-4 py-2.5"><LienBadge lien={f.lien} /></td>
                          <td className="px-4 py-2.5"><BankBadge status={f.bankVerification} /></td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">
                            {lc.status !== 'closed' && lc.status !== 'released' && (
                              <span className="inline-flex gap-1.5">
                                {f.lien !== 'confirmed'
                                  ? <Button icon={Lock} onClick={() => sendBankEvent(f.id, 'lien-marked', 'bank', 'Lien marked in favour of AICTE')}>Mark lien</Button>
                                  : null}
                                <Button variant="danger" icon={OctagonAlert} onClick={() => closeEarly(f.id)}>Customer asks to close early</Button>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card icon={Clock} hue="amber" title="Gateway log" subtitle="Messages exchanged with AICTE">
            {log.length === 0 ? <p className="text-[13px] text-muted">No messages yet.</p> : (
              <ol className="relative space-y-3 border-l border-line pl-4">
                {log.map((e) => (
                  <li key={e.id} className="text-[12.5px]">
                    <span className={cx('absolute -left-[5px] mt-1.5 size-2.5 rounded-full', e.source === 'bank' ? 'bg-teal' : 'bg-accent')} />
                    <div className="font-semibold text-ink">{BANK_EVENT_LABEL[e.kind]}</div>
                    <div className="text-muted">{e.source === 'bank' ? 'Bank → AICTE' : 'AICTE → Bank'} · {formatDateTime(e.at)} · {e.fdrId}</div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
