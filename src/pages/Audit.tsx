import { CheckCircle2, Hammer, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Card, FdrLink, PageHeader, cx } from '../components/ui';
import { verifyChain } from '../lib/audit';
import { formatDateTime } from '../lib/format';
import { useSession } from '../session';
import { useStore } from '../store';

export default function AuditPage({ query }: { query: URLSearchParams }) {
  const { chain, tamperEvent, rebuildChain } = useStore();
  const [result, setResult] = useState<{ broken: number; at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState(query.get('fdr') ?? '');
  const { settings: { pageSize: PAGE } } = useSession();
  const [limit, setLimit] = useState<number>(PAGE);
  const [tampered, setTampered] = useState<number | null>(null);

  const rows = useMemo(() => {
    if (!chain) return [];
    const f = filter.trim().toLowerCase();
    return [...chain].reverse().filter((e) => !f || `${e.fdrId} ${e.action} ${e.actor}`.toLowerCase().includes(f));
  }, [chain, filter]);

  const verify = async () => {
    if (!chain) return;
    setBusy(true);
    const broken = await verifyChain(chain);
    setResult({ broken, at: new Date().toISOString() });
    setBusy(false);
  };

  const tamper = () => {
    if (!chain) return;
    const i = Math.floor(chain.length * 0.4);
    tamperEvent(i);
    setTampered(i);
    setResult(null);
  };

  const restore = async () => {
    await rebuildChain();
    setTampered(null);
    setResult(null);
  };

  return (
    <>
      <PageHeader icon={ShieldCheck} hue="indigo" title="Activity log" description="Every upload, check and decision, in order. Each entry is chained to the one before it, so any later edit is caught."
        actions={<>
          <Button variant="primary" icon={ShieldCheck} onClick={verify} disabled={!chain || busy}>{busy ? 'Checking…' : 'Check nothing was changed'}</Button>
          <Button icon={Hammer} onClick={tamper} disabled={!chain}>Simulate tampering</Button>
          {tampered !== null && <Button variant="ghost" icon={RotateCcw} onClick={restore}>Restore</Button>}
        </>} />

      {result && (
        <div className={cx('mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-[13.5px]', result.broken === -1 ? 'border-good/40 bg-good-soft' : 'border-critical/40 bg-critical-soft')} role="status">
          {result.broken === -1 ? <CheckCircle2 className="mt-0.5 shrink-0 text-good" size={18} /> : <XCircle className="mt-0.5 shrink-0 text-critical" size={18} />}
          <div className="text-ink">
            {result.broken === -1
              ? <><strong>Chain intact.</strong> All <span className="tabular">{chain?.length}</span> events match their hashes.</>
              : <><strong>Chain broken at event #{result.broken}.</strong> This event was changed after it was recorded — its contents no longer match its stored hash.</>}
            <div className="mt-0.5 text-[12px] text-ink-2">Checked {formatDateTime(result.at)}. Note: the chain proves our records weren't altered; it does not prove an uploaded document was genuine.</div>
          </div>
        </div>
      )}

      <Card bodyClassName="p-0" title="Events" subtitle={chain ? `${chain.length} events, newest first` : 'Building chain…'}
        actions={<input value={filter} onChange={(e) => { setFilter(e.target.value); setLimit(PAGE); }} placeholder="Filter by FDR, action, actor" aria-label="Filter events"
          className="w-56 rounded-lg border border-line-strong px-3 py-1.5 text-[13px] placeholder:text-muted focus:border-accent focus:outline-none" />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead className="tint-cool text-left text-[11.5px] font-bold uppercase tracking-wider text-accent-strong">
              <tr><th className="px-4 py-2.5 font-medium">#</th><th className="px-4 py-2.5 font-medium">Time</th><th className="px-4 py-2.5 font-medium">Event</th><th className="px-4 py-2.5 font-medium">FDR</th><th className="px-4 py-2.5 font-medium">Prev hash</th><th className="px-4 py-2.5 font-medium">Hash</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.slice(0, limit).map((e) => (
                <tr key={e.index} className={cx(e.index === tampered && 'bg-critical-soft')}>
                  <td className="tabular px-4 py-2.5 text-muted">{e.index}</td>
                  <td className="tabular whitespace-nowrap px-4 py-2.5 text-ink-2">{formatDateTime(e.at)}</td>
                  <td className="px-4 py-2.5"><div className="font-medium text-ink">{e.action}</div><div className="text-[12px] text-muted">{e.actor} · {e.detail}</div></td>
                  <td className="px-4 py-2.5">{e.fdrId ? <FdrLink id={e.fdrId} /> : '—'}</td>
                  <td className="px-4 py-2.5"><code className="font-mono text-[11.5px] text-muted" title={e.prevHash}>{e.prevHash.slice(0, 10)}…</code></td>
                  <td className="px-4 py-2.5"><code className="font-mono text-[11.5px] text-ink-2" title={e.hash}>{e.hash.slice(0, 10)}…</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > limit && (
          <div className="border-t border-line px-4 py-3 text-center">
            <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>Show more ({rows.length - limit} remaining)</Button>
          </div>
        )}
      </Card>
    </>
  );
}
