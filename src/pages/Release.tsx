import { CheckCircle2, Circle, ClipboardCheck, OctagonAlert } from 'lucide-react';
import { Badge, Card, Empty, FdrLink, PageHeader, SeverityBadge } from '../components/ui';
import { formatDate, formatINRShort } from '../lib/format';
import { useStore } from '../store';

export default function ReleasePage() {
  const { fdrs, institutionById, alerts } = useStore();
  const requests = fdrs.filter((f) => f.release).sort((a, b) => (a.release!.releasedAt ? 1 : 0) - (b.release!.releasedAt ? 1 : 0));

  return (
    <>
      <PageHeader icon={ClipboardCheck} hue="teal" title="Return a deposit" description="Before an FDR is given back to an institution, every document must be in and no urgent problem may be open." />
      <p className="-mt-3 mb-6 text-[12.5px] text-muted">Checklist items are a sample — replace them with the official list from the AICTE Approval Process Handbook.</p>

      {requests.length === 0 ? <Empty>No release requests.</Empty> : (
        <div className="stagger grid grid-cols-1 gap-6 lg:grid-cols-2">
          {requests.map((f) => {
            const rel = f.release!;
            const done = rel.checklist.filter((c) => c.done).length;
            const blockers = alerts.filter((a) => a.fdrId === f.id && (a.severity === 'critical' || a.severity === 'serious'));
            const ready = done === rel.checklist.length && blockers.length === 0;
            const inst = institutionById.get(f.institutionId);
            return (
              <Card key={f.id} className="lift"
                title={<span className="flex flex-wrap items-center gap-2"><FdrLink id={f.id} /> <span className="font-normal text-ink-2">{inst?.name}</span></span>}
                subtitle={`${formatINRShort(f.amount)} · requested ${formatDate(rel.requestedAt.slice(0, 10))} · ${rel.reason}`}
                actions={rel.releasedAt ? <Badge tone="info" icon={CheckCircle2}>Released</Badge> : ready ? <Badge tone="good" icon={CheckCircle2}>Ready to release</Badge> : <Badge tone="serious" icon={OctagonAlert}>Blocked</Badge>}>
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                    <div className="width-grow h-full rounded-full" style={{ background: 'linear-gradient(90deg, #4fd1b5, #0d9488)', width: `${(done / rel.checklist.length) * 100}%` }} />
                  </div>
                  <span className="tabular text-[12.5px] font-medium text-ink">{done}/{rel.checklist.length}</span>
                </div>
                <ul className="space-y-1.5 text-[13px]">
                  {rel.checklist.map((c) => (
                    <li key={c.item} className="flex items-start gap-2">
                      {c.done ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-good" aria-label="Done" /> : <Circle size={16} className="mt-0.5 shrink-0 text-line-strong" aria-label="Missing" />}
                      <span className={c.done ? 'text-ink-2' : 'font-medium text-ink'}>{c.item}{!c.done && <span className="ml-1.5 text-[12px] font-normal text-muted">missing</span>}</span>
                    </li>
                  ))}
                </ul>
                {blockers.length > 0 && !rel.releasedAt && (
                  <div className="mt-4 border-t border-line pt-3">
                    <div className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Open alerts blocking release</div>
                    <ul className="space-y-1.5">
                      {blockers.map((a) => <li key={a.id} className="flex flex-wrap items-center gap-2 text-[13px]"><SeverityBadge severity={a.severity} /><span className="text-ink">{a.title}</span></li>)}
                    </ul>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
