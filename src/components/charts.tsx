import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from './ui';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export interface ColumnDatum {
  key: string;
  label: string;
  value: number;
  tooltip: ReactNode;
}

/** Single-series column chart. Hover shows a tooltip; the whole column is the hit target. */
export function ColumnChart({ data, height = 220, ariaLabel }: { data: ColumnDatum[]; height?: number; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 12, right: 8, bottom: 26, left: 30 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = Math.max(1, niceStep(max));
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const slot = data.length ? innerW / data.length : 0;
  const barW = Math.max(4, Math.min(28, slot - 8));
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="col-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--brand-b)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--brand-a)' }} />
            </linearGradient>
            <linearGradient id="col-grad-dim" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--color-dim-a)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--color-dim-b)' }} />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--color-line-strong)' : 'var(--color-line)'} strokeWidth={1} />
              <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular" fontSize={11} fill="var(--color-muted)">{t}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx0 = pad.left + slot * i + slot / 2;
            const h = Math.max(0, y(0) - y(d.value));
            const r = Math.min(4, barW / 2, h);
            const x0 = cx0 - barW / 2, y0 = y(d.value);
            const path = h > 0
              ? `M${x0},${y(0)} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + barW - r} Q${x0 + barW},${y0} ${x0 + barW},${y0 + r} V${y(0)} Z`
              : '';
            return (
              <g key={d.key} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${d.label}: ${d.value}`}>
                <rect x={pad.left + slot * i} y={pad.top} width={slot} height={innerH} rx={8} fill={hover === i ? 'var(--color-accent-soft)' : 'transparent'} />
                {path && <path d={path} className="bar-grow" style={{ animationDelay: `${i * 45}ms`, transition: 'fill 0.2s' }}
                  fill={hover === null || hover === i ? 'url(#col-grad)' : 'url(#col-grad-dim)'} />}
                <text x={cx0} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--color-muted)">{d.label}</text>
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 rounded-xl border border-line bg-surface/95 px-3 py-2 text-[12.5px] shadow-[0_12px_30px_-10px_rgba(59,69,201,0.35)] backdrop-blur"
          style={{ left: Math.min(Math.max(pad.left + slot * hover + slot / 2, 80), width - 80), top: Math.max(0, y(data[hover].value) - 70) }}>
          {data[hover].tooltip}
        </div>
      )}
    </div>
  );
}

function niceStep(max: number) {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

export interface BarDatum {
  key: string;
  label: ReactNode;
  value: number;
  display: string;
  color?: string;
  href?: string;
}

/** Horizontal bars, each directly labelled with its value. */
export function BarList({ data, emptyText = 'No data' }: { data: BarDatum[]; emptyText?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <ul className="space-y-3">
      {data.map((d) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-ink">{d.label}</span>
              <span className="tabular shrink-0 font-medium text-ink">{d.display}</span>
            </div>
            <div className="mt-1.5 h-2.5 rounded-full bg-track">
              <div className="width-grow h-full rounded-full" style={{ width: `${Math.max(1.5, (d.value / max) * 100)}%`, background: d.color ?? 'linear-gradient(90deg, var(--brand-a), var(--brand-b))' }} />
            </div>
          </>
        );
        return (
          <li key={d.key}>
            {d.href
              ? <a href={d.href} className={cx('-mx-2 block rounded-lg px-2 py-1 hover:bg-subtle')}>{body}</a>
              : <div className="py-1">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}
