import { ArrowRight, BadgeCheck, BellRing, CheckCircle2, Gavel, IdCard, KeyRound, LogOut, Mail, Moon, Phone, Save, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, Sun, UserRound, type LucideIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, Card, FdrLink, StatTile, cx } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { isHeld } from '../lib/lifecycle';
import { initials, useSession, type Profile } from '../session';
import { DECISION_LABEL, useStore } from '../store';
import SettingsPanel from './Settings';

const FIELDS: { key: keyof Profile; label: string; icon: LucideIcon; type?: string }[] = [
  { key: 'name', label: 'Full name', icon: UserRound },
  { key: 'designation', label: 'Designation', icon: BadgeCheck },
  { key: 'employeeId', label: 'Employee ID', icon: IdCard },
  { key: 'office', label: 'Office / cell', icon: ShieldCheck },
  { key: 'email', label: 'Official email', icon: Mail, type: 'email' },
  { key: 'phone', label: 'Phone', icon: Phone, type: 'tel' },
];

export default function ProfilePage({ tab, section }: { tab: 'profile' | 'settings'; section?: string }) {
  const { profile, signOut, signedInAt } = useSession();
  const { decisions, alerts, fdrs, lifecycle } = useStore();
  const decisionList = Object.entries(decisions).sort((a, b) => b[1].at.localeCompare(a[1].at));
  const urgent = alerts.filter((a) => a.severity === 'critical' || a.severity === 'serious').length;
  const held = fdrs.filter((f) => isHeld(lifecycle.get(f.id)!.status)).length;

  return (
    <>
      <section className="relative mb-7 overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_1px_3px_rgba(20,26,51,0.05)]">
        <div className="hero-gradient relative h-32 overflow-hidden">
          <span className="float-slow pointer-events-none absolute -right-10 -top-16 size-60 rounded-full bg-white/15 blur-2xl" />
          <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]" aria-hidden>
            <defs><pattern id="profile-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="white" /></pattern></defs>
            <rect width="100%" height="100%" fill="url(#profile-dots)" />
          </svg>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 px-6 pb-6">
          <div className="flex flex-wrap items-end gap-5">
            <span className="brand-gradient relative z-10 -mt-12 grid size-24 shrink-0 place-items-center rounded-3xl text-[30px] font-extrabold text-white shadow-xl ring-4 ring-surface">{initials(profile.name)}</span>
            <div className="pt-4">
              <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink">{profile.name}</h1>
              <p className="text-[14px] text-ink-2">{profile.designation} · {profile.office}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-[12px] font-semibold text-accent-strong"><ShieldCheck size={13} /> FDR Cell officer</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-soft px-2.5 py-0.5 text-[12px] font-semibold text-violet"><IdCard size={13} /> {profile.employeeId}</span>
                {signedInAt && <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2.5 py-0.5 text-[12px] font-semibold text-teal"><CheckCircle2 size={13} /> Signed in {formatDateTime(signedInAt)}</span>}
              </div>
            </div>
          </div>
          <Button variant="danger" icon={LogOut} onClick={signOut}>Sign out</Button>
        </div>
        <nav aria-label="Profile sections" className="flex gap-1 border-t border-line px-4">
          {([['profile', 'Profile', UserRound], ['settings', 'Settings', SettingsIcon]] as const).map(([key, label, Icon]) => (
            <a key={key} href={`#/${key}`} aria-current={tab === key ? 'page' : undefined}
              className={cx('relative inline-flex items-center gap-2 px-4 py-3.5 text-[13.5px] font-semibold transition-colors', tab === key ? 'text-accent-strong' : 'text-ink-2 hover:text-ink')}>
              <Icon size={16} /> {label}
              {tab === key && <span className="brand-gradient absolute inset-x-3 -bottom-px h-[3px] rounded-full" />}
            </a>
          ))}
        </nav>
      </section>

      {tab === 'settings' ? <SettingsPanel section={section} /> : (<>

      <div className="stagger mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile hue="indigo" icon={Gavel} label="Decisions this session" value={decisionList.length} sub="Recorded in the audit trail" />
        <StatTile hue="rose" icon={BellRing} label="Alerts needing review" value={urgent} sub="Critical and serious" />
        <StatTile hue="teal" icon={ShieldCheck} label="Deposits in your scope" value={held} sub="Currently held by AICTE" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="stagger space-y-6 xl:col-span-2">
          <DetailsForm />
          <Card icon={Gavel} hue="indigo" title="Your recent decisions" subtitle="Decisions you made on FDR pages." bodyClassName="p-0">
            {decisionList.length === 0 ? (
              <p className="px-5 py-5 text-[13.5px] text-ink-2">No decisions yet this session. Open an FDR and choose a decision at the bottom of its page.</p>
            ) : (
              <ul className="divide-y divide-line">
                {decisionList.map(([fdrId, d]) => (
                  <li key={fdrId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[13px]">
                    <FdrLink id={fdrId} />
                    <span className="font-semibold text-ink">{DECISION_LABEL[d.kind]}</span>
                    {d.note && <span className="text-ink-2">“{d.note}”</span>}
                    <span className="tabular ml-auto text-muted">{formatDateTime(d.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="stagger space-y-6">
          <QuickSettings />
          <Card icon={KeyRound} hue="rose" title="Session & security">
            <ul className="space-y-2.5 text-[13px]">
              <li className="flex justify-between gap-3"><span className="text-muted">Signed in</span><span className="tabular text-right text-ink">{signedInAt ? formatDateTime(signedInAt) : '—'}</span></li>
              <li className="flex justify-between gap-3"><span className="text-muted">Role</span><span className="text-ink">Officer · read & decide</span></li>
              <li className="flex justify-between gap-3"><span className="text-muted">Sign-in method</span><span className="text-ink">Demo (no password)</span></li>
            </ul>
            <p className="mt-4 rounded-xl bg-subtle px-3 py-2 text-[12.5px] text-ink-2">In production this will use AICTE single sign-on with role-based access.</p>
            <div className="mt-4"><Button variant="danger" icon={LogOut} onClick={signOut}>Sign out</Button></div>
          </Card>
        </div>
      </div>
      </>)}
    </>
  );
}

function QuickSettings() {
  const { resolvedTheme, toggleTheme, settings } = useSession();
  return (
    <Card icon={SlidersHorizontal} hue="teal" title="Quick settings">
      <button type="button" onClick={toggleTheme} className="flex w-full items-center justify-between rounded-xl border border-line px-3 py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:border-line-strong">
        <span className="inline-flex items-center gap-2">{resolvedTheme === 'dark' ? <Moon size={16} className="text-violet" /> : <Sun size={16} className="text-amber" />}{resolvedTheme === 'dark' ? 'Dark theme' : 'Light theme'}</span>
        <span className="text-[12px] font-medium text-muted">Switch</span>
      </button>
      <ul className="mt-3 space-y-1.5 text-[13px]">
        <li className="flex justify-between gap-3"><span className="text-muted">Accent</span><span className="capitalize text-ink">{settings.accent}</span></li>
        <li className="flex justify-between gap-3"><span className="text-muted">Strong match at</span><span className="tabular text-ink">{Math.round(settings.rules.strong * 100)}%</span></li>
        <li className="flex justify-between gap-3"><span className="text-muted">Rows per page</span><span className="tabular text-ink">{settings.pageSize}</span></li>
      </ul>
      <a href="#/settings" className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline">All settings <ArrowRight size={14} /></a>
    </Card>
  );
}

function DetailsForm() {
  const { profile, saveProfile } = useSession();
  const [draft, setDraft] = useState<Profile>(profile);
  const [saved, setSaved] = useState(false);
  const errors: Partial<Record<keyof Profile, string>> = {};
  if (!draft.name.trim()) errors.name = 'Name is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) errors.email = 'Enter a valid email';
  const dirty = (Object.keys(draft) as (keyof Profile)[]).some((k) => draft[k] !== profile[k]);
  const valid = Object.keys(errors).length === 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !dirty) return;
    saveProfile(Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim()])) as unknown as Profile);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  return (
    <Card icon={UserRound} hue="sky" title="Personal details" subtitle="Shown on your decisions and in the audit trail. Saved in this browser.">
      <form onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map(({ key, label, icon: Icon, type }) => (
            <label key={key} className="block">
              <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-2">{label}</span>
              <span className="relative block">
                <Icon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input type={type ?? 'text'} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  aria-invalid={!!errors[key]}
                  className={cx('w-full rounded-xl border bg-subtle py-2.5 pl-9 pr-3 text-[13.5px] text-ink transition-shadow focus:bg-surface focus:outline-none focus:shadow-[0_0_0_4px_rgba(79,95,240,0.15)]',
                    errors[key] ? 'border-critical' : 'border-line focus:border-accent')} />
              </span>
              {errors[key] && <span className="mt-1 block text-[12px] text-critical">{errors[key]}</span>}
            </label>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" icon={Save} disabled={!dirty || !valid}>Save details</Button>
          {dirty && <Button variant="ghost" onClick={() => setDraft(profile)}>Discard changes</Button>}
          {saved && <span className="page-enter inline-flex items-center gap-1.5 text-[13px] font-semibold text-good"><CheckCircle2 size={16} /> Saved</span>}
        </div>
      </form>
    </Card>
  );
}

