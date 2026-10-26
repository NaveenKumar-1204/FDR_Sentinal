import { CalendarClock } from 'lucide-react';
import { useMemo } from 'react';
import { Card, Empty, FdrLink, LienBadge, LifecycleBadge, PageHeader, cx } from '../components/ui';
import type { FDR } from '../data/types';
import { formatDate, formatINRShort } from '../lib/format';
import { LIFECYCLE_LABEL, type LifecycleStatus } from '../lib/lifecycle';
import { useStore } from '../store';

const ORDER: LifecycleStatus[] = ['closed', 'lapsed', 'maturing', 'release-requested', 'active', 'renewed', 'released'];

export default function LifecyclePage() {
  const { fdrs, lifecycle, institutionById, rules } = useStore();

  const groups = useMemo(() => {
    const g = new Map<LifecycleStatus, FDR[]>(ORDER.map((s) => [s, []]));
    for (const f of fdrs) g.get(lifecycle.get(f.id)!.status)!.push(f);
    for (const list of g.values()) list.sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));
    return g;
  }, [fdrs, lifecycle]);

  const table = (list: FDR[], showDays: boolean) => list.length === 0 ? <div className="p-5"><Empty>Nothing here.</Empty></div> : (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead className="tint-amber text-left text-[11.5px] font-bold uppercase tracking-wider text-warn-ink">
          <tr><th className="px-4 py-2.5 font-medium">FDR</th><th className="px-4 py-2.5 font-medium">Institution</th><th className="px-4 py-2.5 text-right font-medium">Amount</th><th className="px-4 py-2.5 font-medium">Maturity</th>{showDays && <th className="px-4 py-2.5 text-right font-medium">Days</th>}<th className="px-4 py-2.5 font-medium">Lien</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {list.map((f) => {
            const d = lifecycle.get(f.id)!.daysToMaturity;
            return (
              <tr key={f.id} className="hover:bg-subtle">
                <td className="px-4 py-2.5"><FdrLink id={f.id} /></td>
                <td className="max-w-72 truncate px-4 py-2.5 text-ink">{institutionById.get(f.institutionId)?.name}</td>
                <td className="tabular px-4 py-2.5 text-right font-medium">{formatINRShort(f.amount)}</td>
                <td className="tabular whitespace-nowrap px-4 py-2.5 text-ink-2">{formatDate(f.maturityDate)}</td>
                {showDays && <td className={cx('tabular px-4 py-2.5 text-right font-medium', d < 0 || d <= 30 ? 'text-ink' : 'text-ink-2')}>{d < 0 ? `${-d} overdue` : d}</td>}
                <td className="px-4 py-2.5"><LienBadge lien={f.lien} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <PageHeader icon={CalendarClock} hue="amber" title="Maturity dates" description="When each FDR matures. Overdue and soon-maturing ones come first, so you can remind institutions to renew." />

      <div className="stagger mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {ORDER.map((s) => (
          <button key={s} type="button" onClick={() => document.getElementById(`lc-${s}`)?.scrollIntoView({ behavior: 'smooth' })}
            className="lift rounded-2xl border border-line bg-surface p-4 text-left">
            <LifecycleBadge status={s} />
            <div className="tabular mt-2.5 text-[26px] font-extrabold text-ink">{groups.get(s)!.length}</div>
            <div className="tabular text-[12px] text-muted">{formatINRShort(groups.get(s)!.reduce((t, f) => t + f.amount, 0))}</div>
          </button>
        ))}
      </div>

      <div className="stagger space-y-6">
        {groups.get('closed')!.length > 0 && <div id="lc-closed"><Card title={LIFECYCLE_LABEL.closed} subtitle="Reported closed by the bank — AICTE is no longer secured by these." bodyClassName="p-0">{table(groups.get('closed')!, false)}</Card></div>}
        <div id="lc-lapsed"><Card title={LIFECYCLE_LABEL.lapsed} subtitle="Maturity passed with no renewal or release — AICTE may no longer be secured." bodyClassName="p-0">{table(groups.get('lapsed')!, true)}</Card></div>
        <div id="lc-maturing"><Card title={LIFECYCLE_LABEL.maturing} subtitle={`Maturing within 90 days. Warnings start ${rules.maturityWarnDays} days before maturity.`} bodyClassName="p-0">{table(groups.get('maturing')!, true)}</Card></div>
        <div id="lc-release-requested"><Card title={LIFECYCLE_LABEL['release-requested']} subtitle="See Release Readiness for the checklist." bodyClassName="p-0">{table(groups.get('release-requested')!, false)}</Card></div>
        <div id="lc-active"><Card title={LIFECYCLE_LABEL.active} bodyClassName="p-0">{table(groups.get('active')!, true)}</Card></div>
        <div id="lc-renewed"><Card title={LIFECYCLE_LABEL.renewed} subtitle="Superseded by a renewal FDR." bodyClassName="p-0">{table(groups.get('renewed')!, false)}</Card></div>
        <div id="lc-released"><Card title={LIFECYCLE_LABEL.released} bodyClassName="p-0">{table(groups.get('released')!, false)}</Card></div>
      </div>
    </>
  );
}
