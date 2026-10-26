import { ArrowRight, BarChart3, Bell, CalendarClock, CheckCircle2, ChevronDown, Eye, Landmark, Lock, QrCode, ScanLine, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { BarList, ColumnChart, type ColumnDatum } from '../components/charts';
import { Card, SEVERITY_META, StatTile } from '../components/ui';
import { formatINRShort } from '../lib/format';
import { isHeld } from '../lib/lifecycle';
import { useStore } from '../store';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function OverviewPage() {
  const { fdrs, lifecycle, alerts, institutionById, fdrById, risk, acks, today } = useStore();

  const held = useMemo(() => fdrs.filter((f) => isHeld(lifecycle.get(f.id)!.status)), [fdrs, lifecycle]);
  const heldValue = held.reduce((s, f) => s + f.amount, 0);
  const urgent = alerts.filter((a) => a.severity === 'critical' || a.severity === 'serious');
  const maturing = held.filter((f) => lifecycle.get(f.id)!.status === 'maturing');
  const waitingBank = held.filter((f) => f.bankVerification === 'pending' || f.lien === 'pending').length;
  const safe = held.filter((f) => f.lien === 'confirmed' && f.bankVerification === 'verified').length;
  const uploaded = fdrs.filter((f) => f.isUploaded).length;

  const maturity: ColumnDatum[] = useMemo(() => {
    const y0 = +today.slice(0, 4), m0 = +today.slice(5, 7) - 1;
    return Array.from({ length: 12 }, (_, i) => {
      const y = y0 + Math.floor((m0 + i) / 12), m = (m0 + i) % 12;
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      const items = held.filter((f) => f.maturityDate.startsWith(key) && lifecycle.get(f.id)!.status !== 'lapsed');
      return {
        key, label: MONTHS[m], value: items.length,
        tooltip: (
          <>
            <div className="font-semibold text-ink">{MONTHS[m]} {y}</div>
            <div className="text-ink-2"><span className="tabular font-medium text-ink">{items.length}</span> FDR{items.length === 1 ? '' : 's'} · {formatINRShort(items.reduce((s, f) => s + f.amount, 0))}</div>
          </>
        ),
      };
    });
  }, [held, lifecycle, today]);

  const instRisk = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of fdrs) m.set(f.institutionId, (m.get(f.institutionId) ?? 0) + (risk.get(f.id)?.score ?? 0));
    return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, v]) => {
      const inst = institutionById.get(id);
      return { key: id, value: v, display: String(v), href: `#/registry?q=${encodeURIComponent(inst?.name ?? id)}`, label: inst?.name ?? id };
    });
  }, [fdrs, risk, institutionById]);

  const steps = [
    { icon: ScanLine, title: 'Add the FDR', text: 'Upload a scan or a phone photo. We read the details for you.', stat: `${uploaded} uploaded so far`, href: '#/upload' },
    { icon: Lock, title: 'Bank confirms and locks it', text: 'The bank checks it is real and locks it, so nobody can close it early.', stat: waitingBank ? `${waitingBank} waiting for the bank` : 'Nothing waiting', href: '#/registry' },
    { icon: QrCode, title: 'Give a QR receipt', text: 'Anyone can scan the receipt to check it is genuine.', stat: `${acks.length} receipt${acks.length === 1 ? '' : 's'} given`, href: '#/registry' },
  ];

  return (
    <>
      <section className="hero-gradient relative mb-6 overflow-hidden rounded-3xl px-6 py-6 text-white shadow-[0_20px_45px_-20px_rgba(79,95,240,0.7)] sm:px-8">
        <span className="float-slow pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-white/15 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/85"><Sparkles size={14} /> {greeting()}</div>
            <h1 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">
              {urgent.length ? `${urgent.length} FDR${urgent.length === 1 ? '' : 's'} need your attention` : 'All clear today'}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="#/upload" className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-[13.5px] font-bold text-[var(--brand-deep)] shadow-lg transition-transform hover:-translate-y-0.5">
              <ScanLine size={16} /> Add an FDR
            </a>
            <a href="#/alerts" className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-4 py-2.5 text-[13.5px] font-bold text-white ring-1 ring-white/30 backdrop-blur transition-transform hover:-translate-y-0.5">
              <Bell size={16} /> See what needs attention
            </a>
          </div>
        </div>
      </section>

      <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile hue="teal" icon={Landmark} label="FDRs held" value={held.length} sub={<>Worth {formatINRShort(heldValue)} · <span className="tabular">{safe}</span> confirmed and locked</>} />
        <StatTile hue="rose" icon={Bell} label="Need your action" value={urgent.length} sub="Duplicates, bank problems, unlocked FDRs" />
        <StatTile hue="amber" icon={CalendarClock} label="Mature in 90 days" value={maturing.length} sub="Remind the institution to renew" />
      </div>

      <div className="stagger mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3" icon={Bell} hue="rose" title="Your to-do list" subtitle="Most urgent first. Click one to fix it."
          actions={<a href="#/alerts" className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline">See all <ArrowRight size={14} /></a>}
          bodyClassName="p-0">
          {urgent.length === 0 ? (
            <p className="flex items-center gap-2 px-5 py-6 text-[14px] text-ink-2"><CheckCircle2 size={18} className="text-good" /> Nothing urgent right now.</p>
          ) : (
            <ul className="divide-y divide-line">
              {urgent.slice(0, 6).map((a) => {
                const f = fdrById.get(a.fdrId);
                const M = SEVERITY_META[a.severity];
                return (
                  <li key={a.id}>
                    <a href={`#/twin/${a.fdrId}`} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-subtle">
                      <M.icon size={18} className="shrink-0" style={{ color: M.color }} aria-label={M.label} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink">{a.title}</span>
                        <span className="block truncate text-[12.5px] text-muted">{institutionById.get(f?.institutionId ?? '')?.name} · {f?.bank}</span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-accent">Open <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" /></span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="xl:col-span-2" icon={CheckCircle2} hue="teal" title="How it works" subtitle="Every FDR goes through three steps.">
          <ol className="space-y-4">
            {steps.map((s, i) => (
              <li key={s.title}>
                <a href={s.href} className="group flex gap-3">
                  <span className="brand-gradient grid size-9 shrink-0 place-items-center rounded-xl text-[14px] font-extrabold text-white">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[14px] font-bold text-ink"><s.icon size={15} className="text-accent" /> {s.title}</span>
                    <span className="block text-[13px] leading-snug text-ink-2">{s.text}</span>
                    <span className="mt-0.5 block text-[12px] font-semibold text-muted group-hover:text-accent">{s.stat}</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <details className="group mt-6">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-xl px-3 py-2 text-[13.5px] font-semibold text-ink-2 transition-colors hover:bg-subtle hover:text-ink [&::-webkit-details-marker]:hidden">
          <BarChart3 size={16} className="text-accent" /> More numbers <ChevronDown size={15} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card icon={CalendarClock} hue="amber" className="xl:col-span-2" title="FDRs maturing each month" subtitle="Next 12 months. Hover a bar for the value.">
            <ColumnChart data={maturity} ariaLabel="FDRs maturing per month over the next 12 months" />
          </Card>
          <Card icon={Eye} hue="amber" title="Institutions to watch" subtitle="Most warning signs first.">
            <BarList data={instRisk} emptyText="No institution has warning signs." />
          </Card>
        </div>
      </details>
    </>
  );
}
