import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Info, Lock, LockOpen, OctagonAlert, XCircle, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { BankVerification, LienStatus } from '../data/types';
import { riskBand, type Severity } from '../lib/alerts';
import { LIFECYCLE_LABEL, type LifecycleStatus } from '../lib/lifecycle';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export type Hue = 'indigo' | 'violet' | 'sky' | 'teal' | 'rose' | 'amber';

export const HUE: Record<Hue, { fg: string; soft: string; grad: string; glow: string }> = {
  indigo: { fg: 'var(--color-accent)', soft: 'var(--color-accent-soft)', grad: 'linear-gradient(135deg, #6d7bff, #3b45c9)', glow: 'rgba(79, 95, 240, 0.35)' },
  violet: { fg: 'var(--color-violet)', soft: 'var(--color-violet-soft)', grad: 'linear-gradient(135deg, #b197fc, #7c3aed)', glow: 'rgba(139, 92, 246, 0.35)' },
  sky: { fg: 'var(--color-sky)', soft: 'var(--color-sky-soft)', grad: 'linear-gradient(135deg, #5cc8fa, #0284c7)', glow: 'rgba(14, 165, 233, 0.35)' },
  teal: { fg: 'var(--color-teal)', soft: 'var(--color-teal-soft)', grad: 'linear-gradient(135deg, #4fd1b5, #0d9488)', glow: 'rgba(16, 179, 154, 0.35)' },
  rose: { fg: 'var(--color-rose)', soft: 'var(--color-rose-soft)', grad: 'linear-gradient(135deg, #ff7aa2, #e11d5c)', glow: 'rgba(240, 69, 122, 0.35)' },
  amber: { fg: 'var(--color-amber)', soft: 'var(--color-amber-soft)', grad: 'linear-gradient(135deg, #fcc94b, #ea8a0c)', glow: 'rgba(245, 158, 11, 0.35)' },
};

export function IconChip({ icon: Icon, hue = 'indigo', size = 'md' }: { icon: LucideIcon; hue?: Hue; size?: 'sm' | 'md' | 'lg' }) {
  const box = { sm: 'size-7 rounded-lg', md: 'size-9 rounded-xl', lg: 'size-11 rounded-2xl' }[size];
  const px = { sm: 14, md: 17, lg: 21 }[size];
  return (
    <span className={cx('grid shrink-0 place-items-center text-white', box)} style={{ background: HUE[hue].grad, boxShadow: `0 6px 14px -6px ${HUE[hue].glow}` }}>
      <Icon size={px} strokeWidth={2.2} />
    </span>
  );
}

export function Card({ title, subtitle, actions, children, className, bodyClassName, icon, hue = 'indigo' }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; icon?: LucideIcon; hue?: Hue;
}) {
  return (
    <section className={cx('rounded-2xl border border-line bg-surface shadow-[0_1px_3px_rgba(20,26,51,0.05)]', className)}>
      {(title || actions) && (
        <header className="card-head flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && <IconChip icon={icon} hue={hue} size="sm" />}
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-bold text-ink">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName ?? 'card-pad p-5'}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions, icon, hue = 'indigo', eyebrow }: {
  title: string; description?: string; actions?: ReactNode; icon?: LucideIcon; hue?: Hue; eyebrow?: string;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-start gap-4">
        {icon && <IconChip icon={icon} hue={hue} size="lg" />}
        <div>
          {eyebrow && <div className="mb-1 text-[11.5px] font-bold uppercase tracking-[0.14em]" style={{ color: HUE[hue].fg }}>{eyebrow}</div>}
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-ink-2">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Animates a number from 0 to its value when it first appears or changes. */
export function useCountUp(target: number, duration = 800): number {
  const [n, setN] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce') { setN(target); from.current = target; return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      setN(a + (target - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return n;
}

export function StatTile({ label, value, format = (n) => String(Math.round(n)), sub, icon, hue = 'indigo', className }: {
  label: string; value: number; format?: (n: number) => string; sub?: ReactNode; icon: LucideIcon; hue?: Hue; className?: string;
}) {
  const n = useCountUp(value);
  return (
    <div className={cx('stat-tile lift relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_3px_rgba(20,26,51,0.05)]', className)}>
      <span className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full opacity-60 blur-2xl" style={{ background: HUE[hue].soft }} />
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: HUE[hue].grad }} />
      <div className="relative flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink-2">{label}</span>
        <IconChip icon={icon} hue={hue} size="sm" />
      </div>
      <div className="tabular relative mt-3 whitespace-nowrap text-[30px] font-extrabold leading-none tracking-tight text-ink">{format(n)}</div>
      {sub && <div className="relative mt-2.5 text-[12.5px] text-muted">{sub}</div>}
    </div>
  );
}

type Tone = 'good' | 'warn' | 'serious' | 'critical' | 'info' | 'accent';
const TONE_CLASS: Record<Tone, string> = {
  good: 'bg-good-soft text-ink [&_svg]:text-good',
  warn: 'bg-warn-soft text-ink [&_svg]:text-warn-ink',
  serious: 'bg-serious-soft text-ink [&_svg]:text-serious',
  critical: 'bg-critical-soft text-ink [&_svg]:text-critical',
  info: 'bg-info-soft text-ink-2 [&_svg]:text-info',
  accent: 'bg-accent-soft text-accent-strong [&_svg]:text-accent',
};

export function Badge({ tone, icon: Icon, children, className }: { tone: Tone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold', TONE_CLASS[tone], className)}>
      {Icon && <Icon size={13} strokeWidth={2.25} />}
      {children}
    </span>
  );
}

export const SEVERITY_META: Record<Severity, { label: string; tone: Tone; icon: LucideIcon; color: string }> = {
  critical: { label: 'Critical', tone: 'critical', icon: OctagonAlert, color: 'var(--color-critical)' },
  serious: { label: 'Serious', tone: 'serious', icon: AlertTriangle, color: 'var(--color-serious)' },
  warning: { label: 'Warning', tone: 'warn', icon: AlertCircle, color: 'var(--color-warn)' },
  info: { label: 'Info', tone: 'info', icon: Info, color: 'var(--color-info)' },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const m = SEVERITY_META[severity];
  return <Badge tone={m.tone} icon={m.icon}>{m.label}</Badge>;
}

const LIFECYCLE_TONE: Record<LifecycleStatus, { tone: Tone; icon: LucideIcon }> = {
  active: { tone: 'good', icon: CheckCircle2 },
  maturing: { tone: 'warn', icon: Clock },
  lapsed: { tone: 'serious', icon: AlertTriangle },
  renewed: { tone: 'info', icon: CheckCircle2 },
  'release-requested': { tone: 'accent', icon: Clock },
  released: { tone: 'info', icon: LockOpen },
  closed: { tone: 'critical', icon: XCircle },
};

export function LifecycleBadge({ status }: { status: LifecycleStatus }) {
  const m = LIFECYCLE_TONE[status];
  return <Badge tone={m.tone} icon={m.icon}>{LIFECYCLE_LABEL[status]}</Badge>;
}

export function LienBadge({ lien }: { lien: LienStatus }) {
  if (lien === 'confirmed') return <Badge tone="good" icon={Lock}>Locked</Badge>;
  if (lien === 'pending') return <Badge tone="warn" icon={Clock}>Lock pending</Badge>;
  return <Badge tone="serious" icon={LockOpen}>Not locked</Badge>;
}

export function BankBadge({ status }: { status: BankVerification }) {
  if (status === 'verified') return <Badge tone="good" icon={CheckCircle2}>Verified</Badge>;
  if (status === 'pending') return <Badge tone="info" icon={Clock}>Pending</Badge>;
  if (status === 'mismatch') return <Badge tone="critical" icon={XCircle}>Mismatch</Badge>;
  return <Badge tone="critical" icon={XCircle}>Not found</Badge>;
}

export type SimpleStatusKey = 'action' | 'waiting' | 'safe' | 'other';

/** One plain-language status per FDR, so a list row needs a single badge instead of four. */
export function simpleStatus(f: { lien: LienStatus; bankVerification: BankVerification }, lc: LifecycleStatus, riskScore: number): { key: SimpleStatusKey; label: string; tone: Tone; icon: LucideIcon } {
  if (lc === 'closed') return { key: 'action', label: 'Closed at bank', tone: 'critical', icon: XCircle };
  if (f.bankVerification === 'mismatch' || f.bankVerification === 'not-found') return { key: 'action', label: 'Bank problem', tone: 'critical', icon: XCircle };
  if (lc === 'released') return { key: 'other', label: 'Returned', tone: 'info', icon: LockOpen };
  if (riskScore >= 20 || lc === 'lapsed') return { key: 'action', label: 'Needs action', tone: 'serious', icon: AlertTriangle };
  if (f.bankVerification !== 'verified' || f.lien !== 'confirmed') return { key: 'waiting', label: 'Waiting for bank', tone: 'info', icon: Clock };
  if (lc === 'maturing') return { key: 'safe', label: 'Safe · matures soon', tone: 'warn', icon: Clock };
  return { key: 'safe', label: 'Safe', tone: 'good', icon: CheckCircle2 };
}

export function StatusBadge({ s }: { s: ReturnType<typeof simpleStatus> }) {
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}

export function RiskPill({ score }: { score: number }) {
  const band = riskBand(score);
  const meta = {
    high: { tone: 'critical' as Tone, icon: OctagonAlert, label: 'High' },
    medium: { tone: 'serious' as Tone, icon: AlertTriangle, label: 'Medium' },
    low: { tone: 'warn' as Tone, icon: AlertCircle, label: 'Low' },
    clear: { tone: 'good' as Tone, icon: CheckCircle2, label: 'Clear' },
  }[band];
  return <Badge tone={meta.tone} icon={meta.icon}><span className="tabular">{score}</span> · {meta.label}</Badge>;
}

export function Button({ children, onClick, variant = 'secondary', icon: Icon, disabled, type = 'button' }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: LucideIcon; disabled?: boolean; type?: 'button' | 'submit';
}) {
  const styles = {
    primary: 'brand-gradient text-white border-transparent shadow-[0_6px_16px_-6px_rgba(79,95,240,0.6)] hover:brightness-110',
    secondary: 'bg-surface text-ink border-line-strong hover:bg-subtle',
    ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-subtle',
    danger: 'bg-surface text-critical border-critical/40 hover:bg-critical-soft',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={cx('inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50', styles)}>
      {Icon && <Icon size={15} />}
      {children}
    </button>
  );
}

export function FdrLink({ id, children }: { id: string; children?: ReactNode }) {
  return <a href={`#/twin/${id}`} className="font-medium text-accent hover:underline">{children ?? id}</a>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line-strong bg-subtle px-4 py-8 text-center text-sm text-muted">{children}</div>;
}

/** Thin horizontal meter for 0–1 values, with the number shown beside it. */
export function Meter({ value, color = 'linear-gradient(90deg, var(--brand-a), var(--brand-b))', label }: { value: number; color?: string; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="width-grow h-full rounded-full" style={{ width: `${Math.max(2, value * 100)}%`, background: color }} />
      </div>
      <span className="tabular w-10 text-right text-[12px] text-ink-2">{Math.round(value * 100)}%</span>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={cx('rounded-md px-2.5 py-1 text-[12.5px] font-semibold transition-colors', value === o.value ? 'brand-gradient text-white shadow-sm' : 'text-ink-2 hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
