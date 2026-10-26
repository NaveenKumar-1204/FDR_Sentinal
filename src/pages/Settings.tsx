import { BellRing, CheckCircle2, Database, Download, LayoutDashboard, Monitor, Moon, Palette, RotateCcw, Save, ShieldAlert, Sun, Trash2, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Button, Card, Segmented, cx, type Hue } from '../components/ui';
import { buildAlerts, DEFAULT_RULES, SEVERITY_ORDER, type AlertRules } from '../lib/alerts';
import { formatDate, formatDateTime, formatINR, pct } from '../lib/format';
import { findMatches } from '../lib/mtdi';
import { DEFAULT_SETTINGS, useSession, type Accent, type LandingPage, type Prefs, type Settings, type ThemeChoice } from '../session';
import { DECISION_LABEL, useStore } from '../store';

const SECTIONS: { id: string; label: string; icon: LucideIcon; hue: Hue }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette, hue: 'violet' },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, hue: 'sky' },
  { id: 'rules', label: 'Alert rules', icon: ShieldAlert, hue: 'rose' },
  { id: 'notifications', label: 'Notifications', icon: BellRing, hue: 'amber' },
  { id: 'data', label: 'Data & privacy', icon: Database, hue: 'teal' },
];

export default function SettingsPanel({ section }: { section?: string }) {
  const [active, setActive] = useState(section && SECTIONS.some((s) => s.id === section) ? section : SECTIONS[0].id);
  // While a menu click is smooth-scrolling, ignore the scroll-spy so the highlight doesn't flicker through sections.
  const lockUntil = useRef(0);

  // Deep link (#/settings/rules): glide to that section once on open.
  useEffect(() => {
    if (!section) return;
    lockUntil.current = Date.now() + 900;
    document.getElementById(`settings-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Scroll-spy: highlight the section currently near the top of the viewport.
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(`settings-${s.id}`)).filter((e): e is HTMLElement => !!e);
    const visible = new Set<string>();
    const update = () => {
      if (Date.now() < lockUntil.current) return;
      // The last section is too short to reach the top band, so reaching the page bottom selects it.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) { setActive(SECTIONS[SECTIONS.length - 1].id); return; }
      const first = SECTIONS.find((s) => visible.has(s.id));
      if (first) setActive(first.id);
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const id = e.target.id.replace('settings-', '');
        if (e.isIntersecting) visible.add(id); else visible.delete(id);
      }
      update();
    }, { rootMargin: '-110px 0px -55% 0px' });
    els.forEach((el) => io.observe(el));
    window.addEventListener('scroll', update, { passive: true });
    return () => { io.disconnect(); window.removeEventListener('scroll', update); };
  }, []);

  const go = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setActive(id);
    lockUntil.current = Date.now() + 900;
    // Update the address without firing a route change (which would jump to the top first).
    history.replaceState(null, '', `#/settings/${id}`);
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto [scrollbar-width:none] lg:sticky lg:top-24 lg:flex-col lg:self-start">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <a key={id} href={`#/settings/${id}`} onClick={go(id)} aria-current={active === id ? 'location' : undefined}
            className={cx('flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition-colors duration-300',
              active === id ? 'bg-accent-soft text-accent-strong' : 'text-ink-2 hover:bg-subtle hover:text-ink')}>
            <Icon size={16} /> {label}
          </a>
        ))}
      </nav>
      <div className="stagger min-w-0 space-y-6">
        <Appearance />
        <DashboardPrefs />
        <AlertRulesCard />
        <Notifications />
        <DataPrivacy />
      </div>
    </div>
  );
}

function Section({ id, title, subtitle, actions, children }: { id: string; title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  const meta = SECTIONS.find((s) => s.id === id)!;
  return (
    <div id={`settings-${id}`} className="scroll-mt-24">
      <Card icon={meta.icon} hue={meta.hue} title={title} subtitle={subtitle} actions={actions}>{children}</Card>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line py-4 first:pt-0 last:border-b-0 last:pb-0 xl:flex-row xl:items-start xl:justify-between xl:gap-8">
      <div className="xl:max-w-[15rem] xl:shrink-0">
        <div className="text-[13.5px] font-bold text-ink">{label}</div>
        {hint && <div className="mt-0.5 text-[12.5px] text-muted">{hint}</div>}
      </div>
      <div className="min-w-0 xl:flex xl:flex-1 xl:justify-end">{children}</div>
    </div>
  );
}

function SavedNote({ show }: { show: boolean }) {
  return show ? <span className="page-enter inline-flex items-center gap-1.5 text-[13px] font-semibold text-good"><CheckCircle2 size={16} /> Saved</span> : null;
}

function useFlash(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  return [on, () => { setOn(true); window.setTimeout(() => setOn(false), 2200); }];
}

// ── 1. Appearance (applies instantly) ─────────────────────────────

const THEMES: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

const ACCENTS: { value: Accent; label: string; swatch: string }[] = [
  { value: 'indigo', label: 'Indigo', swatch: 'linear-gradient(135deg, #4f5ff0, #7c5cf6, #c056e0)' },
  { value: 'teal', label: 'Teal', swatch: 'linear-gradient(135deg, #0d9488, #14b8a6, #0ea5e9)' },
  { value: 'rose', label: 'Rose', swatch: 'linear-gradient(135deg, #e11d5c, #f0457a, #fb923c)' },
  { value: 'amber', label: 'Amber', swatch: 'linear-gradient(135deg, #b45309, #d97706, #f59e0b)' },
];

function Appearance() {
  const { theme, setTheme, settings, saveSettings } = useSession();
  return (
    <Section id="appearance" title="Appearance" subtitle="Changes apply instantly and are remembered in this browser.">
      <Field label="Theme" hint="System follows your device's light or dark setting.">
        <div role="radiogroup" aria-label="Theme" className="grid w-full max-w-[360px] grid-cols-3 gap-2.5">
          {THEMES.map(({ value, label, icon: Icon }) => {
            const on = theme === value;
            return (
              <button key={value} type="button" role="radio" aria-checked={on} onClick={() => setTheme(value)}
                className={cx('rounded-2xl border-2 p-2 text-left transition-all hover:-translate-y-0.5', on ? 'border-accent shadow-[0_8px_20px_-10px_var(--brand-a)]' : 'border-line hover:border-line-strong')}>
                <ThemePreview kind={value} />
                <span className="mt-2 flex items-center gap-1.5 px-0.5 text-[12.5px] font-semibold text-ink"><Icon size={14} className={on ? 'text-accent' : 'text-muted'} />{label}</span>
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Accent colour" hint="Used for buttons, highlights, the active menu item and charts.">
        <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-3">
          {ACCENTS.map(({ value, label, swatch }) => {
            const on = settings.accent === value;
            return (
              <button key={value} type="button" role="radio" aria-checked={on} onClick={() => saveSettings({ accent: value })}
                className="group flex flex-col items-center gap-1.5">
                <span className={cx('grid size-11 place-items-center rounded-2xl text-white ring-offset-2 ring-offset-surface transition-all group-hover:scale-105', on ? 'ring-2 ring-ink' : '')} style={{ background: swatch }}>
                  {on && <CheckCircle2 size={18} />}
                </span>
                <span className={cx('text-[12px] font-semibold', on ? 'text-ink' : 'text-muted')}>{label}</span>
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Density" hint="Compact fits more rows on screen.">
        <Segmented value={settings.density} onChange={(v) => saveSettings({ density: v })}
          options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
      </Field>
      <Field label="Reduce motion" hint="Turns off page transitions and animated charts. Also follows your device setting automatically.">
        <Switch checked={settings.reduceMotion} label="Reduce motion" onChange={(v) => saveSettings({ reduceMotion: v })} />
      </Field>
    </Section>
  );
}

function ThemePreview({ kind }: { kind: ThemeChoice }) {
  const light = { bg: '#f4f6fd', card: '#ffffff', line: '#e6e9f5' };
  const dark = { bg: '#0c0f1d', card: '#141932', line: '#262d4f' };
  const half = (c: typeof light) => (
    <div className="flex h-full gap-1 p-1.5" style={{ background: c.bg }}>
      <div className="w-1/4 rounded-[4px]" style={{ background: c.card }} />
      <div className="flex flex-1 flex-col gap-1">
        <div className="brand-gradient h-2.5 rounded-[3px]" />
        <div className="flex-1 rounded-[4px]" style={{ background: c.card, border: `1px solid ${c.line}` }} />
      </div>
    </div>
  );
  if (kind !== 'system') return <div className="h-14 overflow-hidden rounded-lg">{half(kind === 'light' ? light : dark)}</div>;
  return (
    <div className="relative h-14 overflow-hidden rounded-lg">
      {half(light)}
      <div className="absolute inset-0" style={{ clipPath: 'polygon(55% 0, 100% 0, 100% 100%, 35% 100%)' }}>{half(dark)}</div>
    </div>
  );
}

// ── 2. Dashboard preferences (saved with a button) ────────────────

type DashDraft = Pick<Settings, 'landingPage' | 'pageSize' | 'amountFormat' | 'dateFormat'>;
const SAMPLE_AMOUNT = 21850000;
const SAMPLE_DATE = '2026-10-23';

function DashboardPrefs() {
  const { settings, saveSettings } = useSession();
  const pick = (s: Settings): DashDraft => ({ landingPage: s.landingPage, pageSize: s.pageSize, amountFormat: s.amountFormat, dateFormat: s.dateFormat });
  const [draft, setDraft] = useState<DashDraft>(() => pick(settings));
  const [saved, flash] = useFlash();
  const current = pick(settings);
  const dirty = (Object.keys(draft) as (keyof DashDraft)[]).some((k) => draft[k] !== current[k]);
  const shortAmount = `₹${(SAMPLE_AMOUNT / 1e7).toFixed(2)} Cr`;

  return (
    <Section id="dashboard" title="Dashboard" subtitle="How pages open and how numbers and dates are shown."
      actions={<>
        <SavedNote show={saved} />
        {dirty && <Button variant="ghost" onClick={() => setDraft(current)}>Discard</Button>}
        <Button variant="primary" icon={Save} disabled={!dirty} onClick={() => { saveSettings(draft); flash(); }}>Save</Button>
      </>}>
      <Field label="Start page" hint="The page that opens after you sign in.">
        <Segmented value={draft.landingPage} onChange={(v: LandingPage) => setDraft((d) => ({ ...d, landingPage: v }))}
          options={[{ value: '', label: 'Home' }, { value: 'alerts', label: 'Needs attention' }, { value: 'registry', label: 'All FDRs' }]} />
      </Field>
      <Field label="Rows per page" hint="Applies to All FDRs and the Activity log.">
        <Segmented value={String(draft.pageSize) as '25' | '50' | '100'} onChange={(v) => setDraft((d) => ({ ...d, pageSize: Number(v) as Settings['pageSize'] }))}
          options={[{ value: '25', label: '25' }, { value: '50', label: '50' }, { value: '100', label: '100' }]} />
      </Field>
      <Field label="Amount format" hint="Indian short form is easier to scan; full shows every rupee.">
        <Choice value={draft.amountFormat} onChange={(v) => setDraft((d) => ({ ...d, amountFormat: v }))}
          options={[{ value: 'short', label: 'Short', example: shortAmount }, { value: 'full', label: 'Full', example: formatINR(SAMPLE_AMOUNT) }]} />
      </Field>
      <Field label="Date format">
        <Choice value={draft.dateFormat} onChange={(v) => setDraft((d) => ({ ...d, dateFormat: v }))}
          options={[
            { value: 'medium', label: 'Day month year', example: new Date(SAMPLE_DATE).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
            { value: 'numeric', label: 'Numeric', example: new Date(SAMPLE_DATE).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) },
          ]} />
      </Field>
    </Section>
  );
}

function Choice<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; example: string }[] }) {
  return (
    <div role="radiogroup" className="grid w-full max-w-[340px] grid-cols-2 gap-2.5">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={cx('rounded-xl border-2 px-3 py-2.5 text-left transition-colors', on ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong')}>
            <span className="block text-[12px] font-semibold text-muted">{o.label}</span>
            <span className="tabular block truncate text-[14px] font-bold text-ink">{o.example}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── 3. Alert rules (live preview, then apply) ─────────────────────

function AlertRulesCard() {
  const { settings, saveSettings } = useSession();
  const { fdrs, institutionById, lifecycle } = useStore();
  const [draft, setDraft] = useState<AlertRules>(settings.rules);
  const [saved, flash] = useFlash();
  const applied = settings.rules;
  const dirty = (Object.keys(draft) as (keyof AlertRules)[]).some((k) => draft[k] !== applied[k]);
  const isDefault = (Object.keys(draft) as (keyof AlertRules)[]).every((k) => draft[k] === DEFAULT_RULES[k]);

  const summarise = (rules: AlertRules) => {
    const matches = findMatches(fdrs, rules);
    const alerts = buildAlerts({ fdrs, institutions: institutionById, lifecycle, matches, rules });
    return {
      strong: matches.filter((m) => m.level === 'strong').length,
      possible: matches.filter((m) => m.level === 'possible').length,
      total: alerts.length,
      bySeverity: Object.fromEntries(SEVERITY_ORDER.map((s) => [s, alerts.filter((a) => a.severity === s).length])) as Record<string, number>,
    };
  };
  const now = useMemo(() => summarise(applied), [applied, fdrs, institutionById, lifecycle]);
  const next = useMemo(() => summarise(draft), [draft, fdrs, institutionById, lifecycle]);

  return (
    <Section id="rules" title="Alert rules" subtitle="Tune when the system raises alerts. The preview shows the effect before you apply it."
      actions={<>
        <SavedNote show={saved} />
        <Button variant="ghost" icon={RotateCcw} disabled={isDefault} onClick={() => setDraft(DEFAULT_RULES)}>Reset to recommended</Button>
        <Button variant="primary" icon={Save} disabled={!dirty} onClick={() => { saveSettings({ rules: draft }); flash(); }}>Apply</Button>
      </>}>
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <Field label="Strong match from" hint="How similar two FDRs must be to count as the same deposit (urgent alert).">
            <Slider value={draft.strong} min={Math.max(0.6, draft.possible + 0.05)} max={0.95}
              onChange={(v) => setDraft((d) => ({ ...d, strong: v }))} label="Strong match threshold" recommended={DEFAULT_RULES.strong} />
          </Field>
          <Field label="Possible match from" hint="Below this score, similar FDRs are ignored.">
            <Slider value={draft.possible} min={0.3} max={draft.strong - 0.05}
              onChange={(v) => setDraft((d) => ({ ...d, possible: v }))} label="Possible match threshold" recommended={DEFAULT_RULES.possible} />
          </Field>
          <Field label="OCR “check manually” below" hint="Extracted fields under this confidence are flagged for a human to confirm.">
            <Slider value={draft.ocrLow} min={0.5} max={0.95}
              onChange={(v) => setDraft((d) => ({ ...d, ocrLow: v }))} label="OCR confidence threshold" recommended={DEFAULT_RULES.ocrLow} />
          </Field>
          <Field label="Maturity warning" hint="Deposits maturing within this window raise a warning instead of an info notice.">
            <Segmented value={String(draft.maturityWarnDays) as '30' | '60' | '90'} onChange={(v) => setDraft((d) => ({ ...d, maturityWarnDays: Number(v) }))}
              options={[{ value: '30', label: '30 days' }, { value: '60', label: '60 days' }, { value: '90', label: '90 days' }]} />
          </Field>
        </div>

        <aside className="tint-cool self-start rounded-2xl border border-line p-4" aria-live="polite">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-accent-strong">Live preview</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="tabular text-[34px] font-extrabold leading-none text-ink">{next.total}</span>
            <span className="text-[13px] text-ink-2">alerts</span>
            <Delta a={now.total} b={next.total} />
          </div>
          <ul className="mt-4 space-y-2 text-[13px]">
            <PreviewRow label="Strong matches" a={now.strong} b={next.strong} />
            <PreviewRow label="Possible matches" a={now.possible} b={next.possible} />
            {SEVERITY_ORDER.map((s) => <PreviewRow key={s} label={s[0].toUpperCase() + s.slice(1)} a={now.bySeverity[s]} b={next.bySeverity[s]} />)}
          </ul>
          <p className="mt-4 text-[12px] leading-relaxed text-muted">{dirty ? 'Not applied yet. Apply to update every page.' : 'These are the rules in use now.'}</p>
        </aside>
      </div>
    </Section>
  );
}

function Slider({ value, min, max, onChange, label, recommended }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; recommended: number }) {
  return (
    <div className="w-full max-w-[340px]">
      <div className="flex items-center gap-3">
        <input type="range" min={Math.round(min * 100)} max={Math.round(max * 100)} step={1} value={Math.round(value * 100)} aria-label={label}
          onChange={(e) => onChange(Number(e.target.value) / 100)} className="h-2 flex-1 cursor-pointer" style={{ accentColor: 'var(--color-accent)' }} />
        <span className="tabular w-12 rounded-lg bg-accent-soft px-2 py-1 text-center text-[13px] font-bold text-accent-strong">{pct(value)}</span>
      </div>
      <div className="mt-1 text-[11.5px] text-muted">Recommended {pct(recommended)}</div>
    </div>
  );
}

function PreviewRow({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-ink-2">{label}</span>
      <span className="flex items-center gap-2"><span className="tabular font-bold text-ink">{b}</span><Delta a={a} b={b} /></span>
    </li>
  );
}

function Delta({ a, b }: { a: number; b: number }) {
  if (a === b) return <span className="w-9 text-right text-[11.5px] text-muted">—</span>;
  const up = b > a;
  return <span className={cx('tabular w-9 rounded-md px-1 text-right text-[11.5px] font-bold', up ? 'bg-critical-soft text-critical' : 'bg-good-soft text-good')}>{up ? '+' : '−'}{Math.abs(b - a)}</span>;
}

// ── 4. Notifications (applies instantly) ──────────────────────────

const PREF_ROWS: { key: 'criticalAlerts' | 'maturityReminders' | 'dailyDigest'; label: string; text: string }[] = [
  { key: 'criticalAlerts', label: 'Critical alerts', text: 'Notify me when a duplicate claim or bank mismatch is found.' },
  { key: 'maturityReminders', label: 'Maturity reminders', text: 'Remind me before a deposit matures (uses the maturity warning window).' },
  { key: 'dailyDigest', label: 'Daily digest', text: 'One summary every morning.' },
];

function Notifications() {
  const { prefs, savePrefs } = useSession();
  const set = (patch: Partial<Prefs>) => savePrefs({ ...prefs, ...patch });
  return (
    <Section id="notifications" title="Notifications" subtitle="Preferences are saved, but delivery is not connected in the prototype.">
      {PREF_ROWS.map(({ key, label, text }) => (
        <Field key={key} label={label} hint={text}>
          <Switch checked={prefs[key]} label={label} onChange={(v) => set({ [key]: v })} />
        </Field>
      ))}
      <Field label="Quiet hours" hint="Hold non-critical notifications during these hours. Critical alerts still come through.">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className={cx('flex items-center gap-2 transition-opacity', !prefs.quietHours && 'pointer-events-none opacity-40')}>
            <input type="time" value={prefs.quietFrom} onChange={(e) => set({ quietFrom: e.target.value })} aria-label="Quiet hours start" disabled={!prefs.quietHours}
              className="tabular rounded-lg border border-line bg-subtle px-2.5 py-1.5 text-[13px] text-ink focus:border-accent focus:outline-none" />
            <span className="text-[12.5px] text-muted">to</span>
            <input type="time" value={prefs.quietTo} onChange={(e) => set({ quietTo: e.target.value })} aria-label="Quiet hours end" disabled={!prefs.quietHours}
              className="tabular rounded-lg border border-line bg-subtle px-2.5 py-1.5 text-[13px] text-ink focus:border-accent focus:outline-none" />
          </div>
          <Switch checked={prefs.quietHours} label="Quiet hours" onChange={(v) => set({ quietHours: v })} />
        </div>
      </Field>
    </Section>
  );
}

// ── 6. Data & privacy ─────────────────────────────────────────────

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function DataPrivacy() {
  const { clearLocalData, settings } = useSession();
  const { decisions, fdrById, institutionById } = useStore();
  const [confirming, setConfirming] = useState(false);
  const rows = Object.entries(decisions).sort((a, b) => a[1].at.localeCompare(b[1].at));

  const exportCsv = () => {
    const header = ['FDR id', 'FDR number', 'Institution', 'Decision', 'Note', 'Decided at'];
    const lines = rows.map(([id, d]) => {
      const f = fdrById.get(id);
      return [id, f?.fdrNumber ?? '', institutionById.get(f?.institutionId ?? '')?.name ?? '', DECISION_LABEL[d.kind], d.note, d.at].map(csvCell).join(',');
    });
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `fdr-decisions-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const changed = (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).filter((k) => JSON.stringify(settings[k]) !== JSON.stringify(DEFAULT_SETTINGS[k])).length;

  return (
    <Section id="data" title="Data & privacy" subtitle="Everything in this prototype is stored only in this browser.">
      <Field label="Export my decisions" hint={rows.length ? `${rows.length} decision${rows.length > 1 ? 's' : ''} this session, as a CSV file for Excel.` : 'No decisions recorded yet this session.'}>
        <Button icon={Download} disabled={!rows.length} onClick={exportCsv}>Download CSV</Button>
      </Field>
      <Field label="What is stored here" hint="Nothing is sent to a server in the prototype.">
        <ul className="space-y-1 text-[13px] text-ink-2 xl:text-right">
          <li>Profile details and sign-in state</li>
          <li>Theme, notification preferences and {changed} changed setting{changed === 1 ? '' : 's'}</li>
          {rows.length > 0 && <li>Last decision {formatDateTime(rows[rows.length - 1][1].at)}</li>}
          <li className="text-muted">Data as of {formatDate(new Date().toISOString().slice(0, 10))}</li>
        </ul>
      </Field>
      <Field label="Clear local data" hint="Resets your profile, settings, decisions and stress-test records in this browser. The page will reload.">
        {confirming ? (
          <div className="page-enter flex flex-wrap items-center justify-end gap-2">
            <span className="text-[13px] font-semibold text-critical">This cannot be undone.</span>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="danger" icon={Trash2} onClick={clearLocalData}>Yes, clear everything</Button>
          </div>
        ) : (
          <Button variant="danger" icon={Trash2} onClick={() => setConfirming(true)}>Clear local data</Button>
        )}
      </Field>
    </Section>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'brand-gradient' : 'bg-line-strong')}>
      <span className={cx('absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  );
}
