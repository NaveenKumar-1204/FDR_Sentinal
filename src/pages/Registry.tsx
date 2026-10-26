import { ArrowRight, ChevronLeft, ChevronRight, Database, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Card, Empty, PageHeader, StatusBadge, cx, simpleStatus, type SimpleStatusKey } from '../components/ui';
import { formatDate, formatINRShort } from '../lib/format';
import { useSession } from '../session';
import { useStore } from '../store';

const ORDER: Record<SimpleStatusKey, number> = { action: 0, waiting: 1, safe: 2, other: 3 };
const FILTERS: { key: SimpleStatusKey | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'action', label: 'Needs action' },
  { key: 'waiting', label: 'Waiting for bank' },
  { key: 'safe', label: 'Safe' },
];

export default function RegistryPage({ query }: { query: URLSearchParams }) {
  const { fdrs, institutionById, lifecycle, risk } = useStore();
  const [q, setQ] = useState(query.get('q') ?? '');
  const [show, setShow] = useState<SimpleStatusKey | 'all'>('all');
  const { settings: { pageSize } } = useSession();
  const [pageState, setPage] = useState(0);

  const all = useMemo(() => fdrs.map((f) => {
    const r = risk.get(f.id)!.score;
    return { f, inst: institutionById.get(f.institutionId), r, s: simpleStatus(f, lifecycle.get(f.id)!.status, r) };
  }), [fdrs, institutionById, lifecycle, risk]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter(({ f, inst, s }) => {
        if (show !== 'all' && s.key !== show) return false;
        if (!needle) return true;
        return `${f.id} ${f.fdrNumber} ${f.bank} ${f.branch} ${f.ifsc} ${inst?.name} ${inst?.aicteId} ${f.accountHolder}`.toLowerCase().includes(needle);
      })
      // Problems first, then the riskiest, then the soonest to mature.
      .sort((a, b) => ORDER[a.s.key] - ORDER[b.s.key] || b.r - a.r || a.f.maturityDate.localeCompare(b.f.maturityDate));
  }, [all, q, show]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pageState, pages - 1);
  const visible = rows.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <>
      <PageHeader icon={Database} hue="sky" title="All FDRs" description="Every FDR on record. Click one to see its details and next step." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search by FDR number, institution or bank" aria-label="Search FDRs"
            className="w-full rounded-xl border border-line-strong bg-surface py-2 pl-9 pr-3 text-[13.5px] text-ink placeholder:text-muted focus:border-accent focus:outline-none" />
        </div>
        {FILTERS.map(({ key, label }) => {
          const n = key === 'all' ? all.length : all.filter((x) => x.s.key === key).length;
          return (
            <button key={key} type="button" onClick={() => { setShow(key); setPage(0); }} aria-pressed={show === key}
              className={cx('inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-all',
                show === key ? 'brand-gradient border-transparent text-white shadow-md' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink')}>
              {label} <span className={cx('tabular', show === key ? 'text-white/75' : 'text-muted')}>{n}</span>
            </button>
          );
        })}
      </div>

      <Card bodyClassName="p-0">
        {rows.length === 0 ? <div className="p-5"><Empty>No FDRs found.</Empty></div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13.5px]">
              <thead className="tint-cool text-left text-[11.5px] font-bold uppercase tracking-wider text-accent-strong">
                <tr>
                  {['FDR', 'Bank', 'Amount', 'Matures', 'Status', ''].map((h, i) => (
                    <th key={i} className={cx('px-4 py-2.5 font-medium', i === 2 && 'text-right')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map(({ f, inst, s }) => (
                  <tr key={f.id} onClick={() => { window.location.hash = `#/twin/${f.id}`; }} className="group cursor-pointer transition-colors hover:bg-accent-soft/60">
                    <td className="max-w-80 px-4 py-3">
                      <a href={`#/twin/${f.id}`} className="tabular font-semibold text-ink group-hover:text-accent" onClick={(e) => e.stopPropagation()}>{f.fdrNumber}</a>
                      {f.isTestCase && <span className="ml-2 rounded bg-warn-soft px-1.5 text-[11px] font-medium text-ink">Demo</span>}
                      <div className="truncate text-[12.5px] text-muted">{inst?.name}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{f.bank}</td>
                    <td className="tabular px-4 py-3 text-right font-semibold text-ink">{formatINRShort(f.amount)}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-ink-2">{formatDate(f.maturityDate)}</td>
                    <td className="px-4 py-3"><StatusBadge s={s} /></td>
                    <td className="px-4 py-3 text-right"><ArrowRight size={16} className="inline text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[12.5px] text-muted">
          <span>Showing <span className="tabular">{visible.length}</span> of <span className="tabular">{rows.length}</span></span>
          {pages > 1 && (
            <span className="flex items-center gap-2">
              <Button variant="ghost" icon={ChevronLeft} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="tabular">Page {page + 1} of {pages}</span>
              <Button variant="ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next <ChevronRight size={15} /></Button>
            </span>
          )}
        </div>
      </Card>
    </>
  );
}
