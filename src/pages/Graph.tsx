import { Network, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Card, Empty, FdrLink, PageHeader, RiskPill } from '../components/ui';
import { riskBand } from '../lib/alerts';
import { formatINRShort, pct } from '../lib/format';
import type { Match } from '../lib/mtdi';
import { useStore } from '../store';

const CELL_W = 280, CELL_H = 230, NODE_R = 20;
const BAND_COLOR = { high: 'var(--color-critical)', medium: 'var(--color-serious)', low: 'var(--color-warn)', clear: 'var(--color-good)' };

interface Node { id: string; x: number; y: number }

function components(matches: Match[]): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  for (const m of matches) { parent.set(find(m.a), find(m.b)); }
  const groups = new Map<string, string[]>();
  for (const id of new Set(matches.flatMap((m) => [m.a, m.b]))) {
    const r = find(id);
    groups.set(r, [...(groups.get(r) ?? []), id]);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

export default function GraphPage() {
  const { matches, fdrById, institutionById, risk } = useStore();
  const [hover, setHover] = useState<string | null>(null);
  const comps = useMemo(() => components(matches), [matches]);
  const cols = Math.min(3, Math.max(1, comps.length));
  const rows = Math.ceil(comps.length / cols);

  const nodes = useMemo(() => {
    const out = new Map<string, Node>();
    comps.forEach((ids, ci) => {
      const cx = (ci % cols) * CELL_W + CELL_W / 2, cy = Math.floor(ci / cols) * CELL_H + CELL_H / 2 - 10;
      const rad = ids.length === 2 ? 70 : 62;
      ids.forEach((id, i) => {
        const ang = ids.length === 2 ? Math.PI * i : (2 * Math.PI * i) / ids.length - Math.PI / 2;
        out.set(id, { id, x: cx + rad * Math.cos(ang), y: cy + rad * Math.sin(ang) });
      });
    });
    return out;
  }, [comps, cols]);

  const hf = hover ? fdrById.get(hover) : undefined;

  return (
    <>
      <PageHeader icon={Network} hue="violet" title="Duplicate map" description="FDRs that look like the same deposit used twice. Each circle is an FDR; a line means they match. Click a circle to open it." />

      {comps.length === 0 ? <Empty>No related FDR claims found.</Empty> : (
        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1fr_300px]">
          <Card bodyClassName="p-3">
            <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 px-2 text-[12.5px] text-ink-2">
              <span className="inline-flex items-center gap-2"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--color-critical)" strokeWidth="2.5" /></svg>Strong match</span>
              <span className="inline-flex items-center gap-2"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--color-warn-ink)" strokeWidth="2" strokeDasharray="5 4" /></svg>Possible match</span>
              <span className="text-muted">Circle outline = FDR risk level</span>
            </div>
            <svg viewBox={`0 0 ${cols * CELL_W} ${rows * CELL_H}`} className="mx-auto block h-auto w-full" style={{ maxWidth: cols * CELL_W * 1.25 }} role="img" aria-label="Graph of related FDR claims">
              <defs>
                <linearGradient id="cluster-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" style={{ stopColor: 'var(--color-violet-soft)' }} /><stop offset="100%" style={{ stopColor: 'var(--color-sky-soft)' }} /></linearGradient>
                <radialGradient id="node-fill"><stop offset="0%" style={{ stopColor: 'var(--color-surface)' }} /><stop offset="100%" style={{ stopColor: 'var(--color-subtle)' }} /></radialGradient>
              </defs>
              {comps.map((_, ci) => (
                <rect key={ci} x={(ci % cols) * CELL_W + 6} y={Math.floor(ci / cols) * CELL_H + 6} width={CELL_W - 12} height={CELL_H - 12} rx={12}
                  fill="url(#cluster-bg)" stroke="var(--color-line)" />
              ))}
              {matches.map((m) => {
                const a = nodes.get(m.a)!, b = nodes.get(m.b)!;
                const strong = m.level === 'strong';
                const dim = hover && hover !== m.a && hover !== m.b;
                return (
                  <g key={`${m.a}-${m.b}`} opacity={dim ? 0.25 : 1}>
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={strong ? 'var(--color-critical)' : 'var(--color-warn-ink)'} strokeWidth={strong ? 2.5 : 2} strokeDasharray={strong ? undefined : '6 5'} strokeLinecap="round" className={strong ? undefined : 'edge-flow'} />
                    {strong && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="white" strokeOpacity={0.85} strokeWidth={1.5} strokeDasharray="3 19" strokeLinecap="round" className="edge-flow" />}
                    <rect x={(a.x + b.x) / 2 - 20} y={(a.y + b.y) / 2 - 10} width={40} height={20} rx={10} fill="var(--color-surface)" stroke="var(--color-line-strong)" />
                    <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} dy="0.35em" textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-ink)">{pct(m.score)}</text>
                  </g>
                );
              })}
              {[...nodes.values()].map((n) => {
                const f = fdrById.get(n.id)!;
                const score = risk.get(n.id)?.score ?? 0;
                const inst = institutionById.get(f.institutionId);
                return (
                  <a key={n.id} href={`#/twin/${n.id}`} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
                    aria-label={`${n.id}, ${inst?.name}, risk ${score}`}>
                    <circle cx={n.x} cy={n.y} r={NODE_R + 8} fill="transparent" />
                    <circle cx={n.x} cy={n.y} r={NODE_R} fill="url(#node-fill)" style={{ transition: 'stroke-width 0.2s' }} stroke={BAND_COLOR[riskBand(score)]} strokeWidth={hover === n.id ? 4 : 3} />
                    <text x={n.x} y={n.y} dy="0.35em" textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-ink)">{n.id.startsWith('TEST') ? `T${n.id.split('-').pop()}` : n.id.replace('FDR-', '')}</text>
                    <text x={n.x} y={n.y + NODE_R + 15} textAnchor="middle" fontSize={11} fill="var(--color-ink-2)">{(inst?.name ?? '').split(' ').slice(0, 2).join(' ')}</text>
                  </a>
                );
              })}
            </svg>
          </Card>

          <Card icon={Sparkles} hue="violet" title={hf ? hf.id : 'Details'} subtitle={hf ? institutionById.get(hf.institutionId)?.name : 'Hover a circle to see details.'}>
            {hf ? (
              <dl className="space-y-2 text-[13px]">
                <div className="flex justify-between gap-3"><dt className="text-muted">FDR number</dt><dd className="tabular text-ink">{hf.fdrNumber}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Bank</dt><dd className="text-right text-ink">{hf.bank}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Amount</dt><dd className="tabular text-ink">{formatINRShort(hf.amount)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Holder</dt><dd className="text-right text-ink">{hf.accountHolder}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Risk</dt><dd><RiskPill score={risk.get(hf.id)?.score ?? 0} /></dd></div>
              </dl>
            ) : <p className="text-[13px] text-ink-2"><span className="tabular font-medium text-ink">{comps.length}</span> cluster{comps.length > 1 ? 's' : ''} of related claims, <span className="tabular font-medium text-ink">{matches.length}</span> link{matches.length > 1 ? 's' : ''} in total.</p>}
          </Card>
        </div>
      )}

      {matches.length > 0 && (
        <Card icon={Network} hue="indigo" className="mt-6" title="All links" subtitle="Table view of the graph." bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-subtle text-left text-[12px] uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-2.5 font-medium">FDR A</th><th className="px-4 py-2.5 font-medium">FDR B</th><th className="px-4 py-2.5 font-medium">Score</th><th className="px-4 py-2.5 font-medium">Across institutions</th><th className="px-4 py-2.5 font-medium">Matching</th><th className="px-4 py-2.5 font-medium">Different</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {matches.map((m) => (
                  <tr key={`${m.a}-${m.b}`}>
                    <td className="px-4 py-2.5"><FdrLink id={m.a} /></td>
                    <td className="px-4 py-2.5"><FdrLink id={m.b} /></td>
                    <td className="tabular px-4 py-2.5 font-medium">{pct(m.score)} · {m.level}</td>
                    <td className="px-4 py-2.5">{m.crossInstitution ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-2.5 text-ink-2">{m.matched.join(', ') || '—'}</td>
                    <td className="px-4 py-2.5 text-ink-2">{m.conflicts.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
