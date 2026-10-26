import { Building2, CheckCircle2, Lock, LockOpen, OctagonAlert, ShieldAlert, X, XCircle, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BankEvent, BankEventKind } from '../data/types';
import { BANK_EVENT_LABEL, useStore } from '../store';
import { cx } from './ui';

const TONE: Record<BankEventKind, { icon: LucideIcon; tone: 'good' | 'bad' | 'warn' | 'info' }> = {
  'request-verification': { icon: Building2, tone: 'info' },
  'request-lien': { icon: Lock, tone: 'info' },
  'request-lien-release': { icon: LockOpen, tone: 'info' },
  verified: { icon: CheckCircle2, tone: 'good' },
  mismatch: { icon: XCircle, tone: 'bad' },
  'not-found': { icon: XCircle, tone: 'bad' },
  'lien-marked': { icon: Lock, tone: 'good' },
  'lien-released': { icon: LockOpen, tone: 'info' },
  'closure-blocked': { icon: ShieldAlert, tone: 'warn' },
  closed: { icon: OctagonAlert, tone: 'bad' },
};
const TONE_CLASS = {
  good: 'border-good/40 [&_.ic]:bg-good-soft [&_.ic]:text-good',
  bad: 'border-critical/40 [&_.ic]:bg-critical-soft [&_.ic]:text-critical',
  warn: 'border-serious/40 [&_.ic]:bg-serious-soft [&_.ic]:text-serious',
  info: 'border-accent/30 [&_.ic]:bg-accent-soft [&_.ic]:text-accent',
};

/** Pops a toast for every new bank-channel event coming from the other side. */
export default function BankToasts({ from, linkToTwin }: { from: 'bank' | 'aicte'; linkToTwin: boolean }) {
  const { bankEvents, fdrById } = useStore();
  const seen = useRef<Set<string> | null>(null);
  const [toasts, setToasts] = useState<BankEvent[]>([]);

  useEffect(() => {
    if (!seen.current) { seen.current = new Set(bankEvents.map((e) => e.id)); return; }
    const fresh = bankEvents.filter((e) => !seen.current!.has(e.id));
    fresh.forEach((e) => seen.current!.add(e.id));
    const shown = fresh.filter((e) => e.source === from);
    if (!shown.length) return;
    setToasts((t) => [...t, ...shown].slice(-4));
    const ids = shown.map((e) => e.id);
    // Not cleared on re-run: a second event arriving must not cancel the first toast's dismissal.
    window.setTimeout(() => setToasts((t) => t.filter((x) => !ids.includes(x.id))), 8000);
  }, [bankEvents, from]);

  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-20 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((e) => {
        const { icon: Icon, tone } = TONE[e.kind];
        const f = fdrById.get(e.fdrId);
        const body = (
          <>
            <span className="ic grid size-9 shrink-0 place-items-center rounded-xl"><Icon size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-muted">{from === 'bank' ? 'From bank gateway' : 'From AICTE'}</span>
              <span className="block text-[13.5px] font-bold leading-snug text-ink">{BANK_EVENT_LABEL[e.kind]}</span>
              <span className="block truncate text-[12px] text-ink-2">{e.fdrId}{f ? ` · ${f.fdrNumber} · ${f.bank}` : ''}</span>
            </span>
          </>
        );
        return (
          <div key={e.id} className={cx('page-enter pointer-events-auto flex items-start gap-3 rounded-2xl border bg-surface p-3 shadow-[0_16px_40px_-16px_rgba(20,26,51,0.45)]', TONE_CLASS[tone])}>
            {linkToTwin ? <a href={`#/twin/${e.fdrId}`} className="flex min-w-0 flex-1 items-start gap-3">{body}</a> : <div className="flex min-w-0 flex-1 items-start gap-3">{body}</div>}
            <button type="button" aria-label="Dismiss" onClick={() => setToasts((t) => t.filter((x) => x.id !== e.id))} className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-subtle hover:text-ink"><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}
