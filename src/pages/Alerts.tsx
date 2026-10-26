import { ArrowRight, Bell, Lightbulb } from 'lucide-react';
import { useState } from 'react';
import { Card, Empty, PageHeader, SEVERITY_META, SeverityBadge, cx } from '../components/ui';
import { SEVERITY_ORDER, type AlertType, type Severity } from '../lib/alerts';
import { useStore } from '../store';

const TYPE_LABEL: Record<AlertType, string> = {
  'cross-duplicate': 'Duplicate across institutions',
  'conflicting-resubmission': 'Conflicting resubmission',
  'possible-match': 'Possible match',
  'bank-mismatch': 'Bank mismatch',
  'bank-not-found': 'Not found at bank',
  'bank-pending': 'Bank confirmation pending',
  'lien-not-marked': 'Not locked (no lien)',
  'lien-pending': 'Lien pending',
  lapsed: 'Matured, not renewed',
  maturing: 'Maturing soon',
  'holder-mismatch': 'Holder name mismatch',
  'low-ocr': 'Low OCR confidence',
  'release-incomplete': 'Release blocked',
  'closed-at-bank': 'Closed at the bank',
  'closure-attempt': 'Early closure attempt',
};

export default function AlertsPage({ query }: { query: URLSearchParams }) {
  const { alerts, fdrById, institutionById } = useStore();
  const initial = query.get('severity') as Severity | null;
  const [severity, setSeverity] = useState<Severity | 'all'>(initial && SEVERITY_ORDER.includes(initial) ? initial : 'all');
  const [q, setQ] = useState('');

  const filtered = alerts.filter((a) => {
    if (severity !== 'all' && a.severity !== severity) return false;
    if (q) {
      const f = fdrById.get(a.fdrId);
      const hay = `${a.title} ${a.fdrId} ${f?.fdrNumber} ${institutionById.get(f?.institutionId ?? '')?.name}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <>
      <PageHeader icon={Bell} hue="rose" title="Needs attention" description="Problems we found, most urgent first. Each one says what to do. You make the final decision." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip active={severity === 'all'} onClick={() => setSeverity('all')}>All <span className="tabular text-muted">{alerts.length}</span></Chip>
        {SEVERITY_ORDER.map((s) => {
          const M = SEVERITY_META[s];
          return (
            <Chip key={s} active={severity === s} onClick={() => setSeverity(s)}>
              <M.icon size={14} style={{ color: M.color }} /> {M.label} <span className="tabular text-muted">{alerts.filter((a) => a.severity === s).length}</span>
            </Chip>
          );
        })}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by FDR or institution" aria-label="Search"
          className="min-w-52 flex-1 rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none sm:flex-none" />
      </div>

      {filtered.length === 0 ? <Empty>Nothing here.</Empty> : (
        <Card key={severity} bodyClassName="p-0">
          <ul className="stagger divide-y divide-line">
            {filtered.map((a) => {
              const f = fdrById.get(a.fdrId);
              const inst = f && institutionById.get(f.institutionId);
              return (
                <li key={a.id} className="relative flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4 pl-6">
                  <span className="absolute inset-y-3 left-0 w-1.5 rounded-r-full" style={{ background: SEVERITY_META[a.severity].color }} />
                  <div className="min-w-0 flex-1 basis-80">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={a.severity} />
                      <h3 className="text-[14.5px] font-semibold text-ink">{a.title}</h3>
                      {f?.isTestCase && <span className="rounded bg-warn-soft px-1.5 text-[11px] font-medium text-ink">Demo</span>}
                    </div>
                    <p className="mt-1 text-[12.5px] text-muted">{inst?.name} · {f?.bank} · FDR {f?.fdrNumber} · {TYPE_LABEL[a.type]}</p>
                    <p className="mt-2 flex items-start gap-2 text-[13px] text-ink"><Lightbulb size={15} className="mt-0.5 shrink-0 text-accent" /><span><strong>What to do:</strong> {a.action}</span></p>
                  </div>
                  <a href={`#/twin/${a.fdrId}`} className="inline-flex shrink-0 items-center gap-1 self-center rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-accent hover:text-accent">
                    Open FDR <ArrowRight size={14} />
                  </a>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cx('inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-all',
        active ? 'brand-gradient border-transparent text-white shadow-md [&_span]:text-white/75 [&_svg]:!text-white' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink')}>
      {children}
    </button>
  );
}
