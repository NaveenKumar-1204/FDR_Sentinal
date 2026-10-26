import { ArrowRight, Fingerprint, KeyRound, LogOut, Network, ScrollText, ShieldCheck } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import { initials, useSession } from '../session';

const FEATURES = [
  { icon: Fingerprint, title: 'Catch duplicate claims', text: 'Every FDR is compared across all institutions in several ways at once.' },
  { icon: Network, title: 'One record per deposit', text: 'Details, bank checks, lifecycle and decisions in a single Digital Twin.' },
  { icon: ScrollText, title: 'Tamper-evident history', text: 'Every action is hash-linked, so edits to the past are detectable.' },
];

export default function SignInPage() {
  const { signIn, profile } = useSession();

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="hero-gradient relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col">
        <span className="float-slow pointer-events-none absolute -left-20 top-1/3 size-80 rounded-full bg-white/10 blur-3xl" />
        <span className="float-slow pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-sky/30 blur-3xl" style={{ animationDelay: '-5s' }} />
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.1]" aria-hidden>
          <defs><pattern id="signin-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="white" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#signin-dots)" />
        </svg>

        <div className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur"><ShieldCheck size={23} /></span>
          <div className="leading-tight">
            <div className="text-[18px] font-extrabold tracking-tight">FDR Sentinel X</div>
            <div className="text-[12.5px] text-white/75">AICTE · Deposit integrity</div>
          </div>
        </div>

        <div className="relative my-auto max-w-lg">
          <h1 className="text-[40px] font-extrabold leading-[1.1] tracking-tight">One FDR. One Digital Twin.<br />Complete evidence.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/85">Explainable checks that help officers verify security deposits faster — the final decision always stays with the officer.</p>
          <ul className="stagger mt-10 space-y-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/20"><Icon size={18} /></span>
                <span><span className="block text-[14px] font-bold">{title}</span><span className="block text-[13px] text-white/80">{text}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[12px] text-white/60">Prototype for SIH26265 · synthetic data only</p>
      </section>

      <section className="relative flex items-center justify-center px-5 py-12">
        <div className="absolute right-5 top-5"><ThemeToggle /></div>
        <div className="page-enter w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="brand-gradient grid size-10 place-items-center rounded-2xl text-white"><ShieldCheck size={21} /></span>
            <div className="text-[17px] font-extrabold tracking-tight text-ink">FDR Sentinel <span className="text-gradient">X</span></div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-soft px-3 py-1 text-[12px] font-semibold text-rose"><LogOut size={13} /> You are signed out</span>
          <h2 className="mt-4 text-[28px] font-extrabold tracking-tight text-ink">Welcome back</h2>
          <p className="mt-1.5 text-[14px] text-ink-2">Sign in to review deposits, alerts and release requests.</p>

          <div className="mt-8 rounded-2xl border border-line bg-surface p-4 shadow-[0_12px_30px_-18px_rgba(59,69,201,0.45)]">
            <div className="flex items-center gap-3">
              <span className="brand-gradient grid size-11 place-items-center rounded-full text-[14px] font-bold text-white">{initials(profile.name)}</span>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[14.5px] font-bold text-ink">{profile.name}</div>
                <div className="truncate text-[12.5px] text-muted">{profile.designation} · {profile.office}</div>
              </div>
            </div>
            <button type="button" onClick={signIn}
              className="brand-gradient mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(79,95,240,0.8)] transition-all hover:brightness-110 active:scale-[0.98]">
              Continue as {profile.name} <ArrowRight size={17} />
            </button>
          </div>

          <div className="my-6 flex items-center gap-3 text-[11.5px] font-semibold uppercase tracking-wider text-muted">
            <span className="h-px flex-1 bg-line" /> After integration <span className="h-px flex-1 bg-line" />
          </div>
          <button type="button" disabled
            className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-3 text-[13.5px] font-semibold text-muted">
            <KeyRound size={16} /> Sign in with AICTE single sign-on
          </button>
          <p className="mt-6 text-center text-[12px] leading-relaxed text-muted">Prototype: no password is used and all data is synthetic.</p>
        </div>
      </section>
    </div>
  );
}
