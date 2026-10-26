import { Bell, CalendarClock, ChevronDown, ClipboardCheck, Database, ExternalLink, FlaskConical, Landmark, LayoutDashboard, LogOut, Moon, Network, QrCode, ScanLine, Search, Settings as SettingsIcon, ShieldCheck, Sun, UserRound, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { HUE, cx, type Hue } from './components/ui';
import AlertsPage from './pages/Alerts';
import AuditPage from './pages/Audit';
import GraphPage from './pages/Graph';
import LifecyclePage from './pages/Lifecycle';
import OverviewPage from './pages/Overview';
import RegistryPage from './pages/Registry';
import ReleasePage from './pages/Release';
import StressTestPage from './pages/StressTest';
import AckReceipt from './pages/AckReceipt';
import BankPortal from './pages/BankPortal';
import ProfilePage from './pages/Profile';
import UploadPage from './pages/Upload';
import VerifyPage from './pages/Verify';
import BankToasts from './components/Toasts';
import SignInPage from './pages/SignIn';
import TwinPage from './pages/Twin';
import ThemeToggle from './components/ThemeToggle';
import { initials, useSession } from './session';
import { useStore } from './store';

interface Route { path: string[]; query: URLSearchParams }

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [p, q = ''] = raw.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = (e: HashChangeEvent) => {
      const next = parseHash();
      setRoute(next);
      // Moving between sections of the same Settings page should glide, not jump to the top.
      const fromSettings = new URL(e.oldURL).hash.startsWith('#/settings');
      if (!(fromSettings && next.path[0] === 'settings')) window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

type NavItem = { key: string; label: string; icon: LucideIcon; hue: Hue };

// The four everyday tasks stay in view; specialist pages live under "More tools" so the menu stays short.
const NAV: NavItem[] = [
  { key: '', label: 'Home', icon: LayoutDashboard, hue: 'indigo' },
  { key: 'upload', label: 'Add an FDR', icon: ScanLine, hue: 'sky' },
  { key: 'alerts', label: 'Needs attention', icon: Bell, hue: 'rose' },
  { key: 'registry', label: 'All FDRs', icon: Database, hue: 'sky' },
];
const MORE: NavItem[] = [
  { key: 'lifecycle', label: 'Maturity dates', icon: CalendarClock, hue: 'amber' },
  { key: 'release', label: 'Return a deposit', icon: ClipboardCheck, hue: 'teal' },
  { key: 'graph', label: 'Duplicate map', icon: Network, hue: 'violet' },
  { key: 'audit', label: 'Activity log', icon: ShieldCheck, hue: 'indigo' },
  { key: 'stress', label: 'Demo test cases', icon: FlaskConical, hue: 'violet' },
];

export default function App() {
  const route = useRoute();
  const { alerts } = useStore();
  const { signedIn, settings } = useSession();

  // Opening the app with no page in the URL goes to the officer's chosen landing page.
  useEffect(() => {
    if (!window.location.hash && settings.landingPage) window.location.replace(`#/${settings.landingPage}`);
  }, []);
  const section = route.path[0] ?? '';
  const urgent = alerts.filter((a) => a.severity === 'critical' || a.severity === 'serious').length;
  const active = section === 'twin' || section === 'ack' ? 'registry' : section === 'settings' ? 'profile' : section;
  const inMore = MORE.some((n) => n.key === active);

  let page;
  switch (section) {
    case '': page = <OverviewPage />; break;
    case 'alerts': page = <AlertsPage key={route.query.toString()} query={route.query} />; break;
    case 'registry': page = <RegistryPage key={route.query.toString()} query={route.query} />; break;
    case 'twin': page = <TwinPage id={route.path[1] ?? ''} />; break;
    case 'graph': page = <GraphPage />; break;
    case 'lifecycle': page = <LifecyclePage />; break;
    case 'release': page = <ReleasePage />; break;
    case 'audit': page = <AuditPage key={route.query.toString()} query={route.query} />; break;
    case 'stress': page = <StressTestPage />; break;
    case 'upload': page = <UploadPage />; break;
    case 'ack': page = <AckReceipt id={route.path[1] ?? ''} />; break;
    case 'profile': page = <ProfilePage tab="profile" />; break;
    case 'settings': page = <ProfilePage tab="settings" section={route.path[1]} />; break;
    default: page = <p className="text-ink-2">Page not found. <a className="text-accent" href="#/">Go home</a></p>;
  }

  // The bank's side and the public verification page are separate parties: no AICTE sign-in.
  if (section === 'bank') return <BankPortal query={route.query} />;
  if (section === 'verify') return <VerifyPage token={route.path[1]} />;
  if (!signedIn) return <SignInPage />;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <BankToasts from="bank" linkToTwin />
      <aside className="border-b border-line bg-surface/85 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-5 py-4 lg:py-6">
          <span className="brand-gradient grid size-10 place-items-center rounded-2xl text-white shadow-[0_8px_20px_-8px_rgba(79,95,240,0.7)]"><ShieldCheck size={21} strokeWidth={2.3} /></span>
          <div className="leading-tight">
            <div className="text-[16px] font-extrabold tracking-tight text-ink">FDR Sentinel <span className="text-gradient">X</span></div>
            <div className="text-[11.5px] font-medium text-muted">AICTE · Deposit integrity</div>
          </div>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 [scrollbar-width:none] lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map((n) => <NavLink key={n.key} item={n} on={active === n.key} badge={n.key === 'alerts' ? urgent : 0} />)}
          {/* Phones get one scrolling row with everything; desktop folds the extras below. */}
          {MORE.map((n) => <span key={n.key} className="contents lg:hidden"><NavLink item={n} on={active === n.key} /></span>)}
        </nav>
        <details open={inMore} className="group mt-4 hidden px-3 lg:block">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-bold text-muted transition-colors hover:bg-subtle hover:text-ink [&::-webkit-details-marker]:hidden">
            More tools <ChevronDown size={15} className="ml-auto transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-1 flex flex-col gap-1">
            {MORE.map((n) => <NavLink key={n.key} item={n} on={active === n.key} small />)}
            {([['#/bank', 'fdrx-bank', 'Bank view (demo)', Landmark], ['#/verify', 'fdrx-verify', 'Check a receipt', QrCode]] as const).map(([href, target, label, Icon]) => (
              <a key={href} href={href} target={target} rel="noopener" className="group/x flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-accent-soft/70 hover:text-ink">
                <span className="grid size-6 place-items-center rounded-lg bg-teal-soft text-teal"><Icon size={14} /></span>
                {label}
                <ExternalLink size={13} className="ml-auto text-muted opacity-0 transition-opacity group-hover/x:opacity-100" />
              </a>
            ))}
          </div>
        </details>
        <p className="mx-6 mt-auto hidden pb-5 pt-6 text-[11.5px] leading-relaxed text-muted lg:block">Prototype · all data is made up.</p>
      </aside>

      <div className="min-w-0">
        <TopBar />
        <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-7 sm:px-6 lg:px-8">
          <div key={`${route.path[0] ?? ''}/${route.path[0] === 'settings' ? '' : route.path.slice(1).join('/')}|${settings.amountFormat}|${settings.dateFormat}`} className="page-enter">{page}</div>
        </main>
      </div>
    </div>
  );
}

function NavLink({ item: { key, label, icon: Icon, hue }, on, badge = 0, small }: { item: NavItem; on: boolean; badge?: number; small?: boolean }) {
  return (
    <a href={`#/${key}`} aria-current={on ? 'page' : undefined}
      className={cx('group flex shrink-0 items-center gap-3 rounded-xl px-3 font-semibold transition-all duration-200', small ? 'py-2 text-[13px]' : 'py-2.5 text-[14px]',
        on ? 'brand-gradient text-white shadow-[0_8px_20px_-8px_rgba(79,95,240,0.75)]' : 'text-ink-2 hover:translate-x-0.5 hover:bg-accent-soft/70 hover:text-ink')}>
      <span className={cx('grid place-items-center rounded-lg transition-colors', small ? 'size-6' : 'size-7', on ? 'bg-white/20' : '')}
        style={on ? undefined : { background: HUE[hue].soft, color: HUE[hue].fg }}>
        <Icon size={small ? 14 : 16} strokeWidth={2.2} />
      </span>
      <span>{label}</span>
      {badge > 0 && (
        <span className={cx('tabular ml-auto rounded-full px-2 text-[11.5px] font-bold', on ? 'bg-white text-critical' : 'bg-critical text-white')}>{badge}</span>
      )}
    </a>
  );
}

function TopBar() {
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    window.location.hash = `#/registry?q=${encodeURIComponent(q.trim())}`;
  };
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-surface/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6 lg:px-8">
        <form onSubmit={submit} className="relative w-full max-w-md" role="search">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-accent" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search FDR number, institution, bank…" aria-label="Search FDRs"
            className="w-full rounded-xl border border-line bg-subtle py-2.5 pl-10 pr-3 text-[13.5px] text-ink transition-shadow placeholder:text-muted focus:border-accent focus:bg-surface focus:shadow-[0_0_0_4px_rgba(79,95,240,0.15)] focus:outline-none" />
        </form>
        <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-amber-soft px-3 py-1.5 text-[12px] font-semibold text-ink xl:inline-flex">
          <FlaskConical size={13} className="text-amber" /> Synthetic data
        </span>
        <ThemeToggle className="ml-auto xl:ml-0" />
        <UserMenu />
      </div>
    </div>
  );
}

function UserMenu() {
  const { profile, signOut, resolvedTheme, toggleTheme } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onHash = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', onHash);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onHash);
    };
  }, [open]);

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium text-ink-2 transition-colors hover:bg-subtle hover:text-ink';
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="flex items-center gap-2 rounded-xl border border-transparent p-1 pr-1.5 transition-colors hover:border-line hover:bg-surface md:pr-2.5">
        <span className="brand-gradient grid size-8 place-items-center rounded-full text-[12px] font-bold text-white">{initials(profile.name)}</span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-36 truncate text-[13px] font-semibold text-ink">{profile.name}</span>
          <span className="block max-w-36 truncate text-[11.5px] text-muted">{profile.designation}</span>
        </span>
        <ChevronDown size={15} className={cx('text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" className="pop-in absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-[0_20px_40px_-16px_rgba(20,26,51,0.35)]">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="brand-gradient grid size-10 place-items-center rounded-full text-[13px] font-bold text-white">{initials(profile.name)}</span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13.5px] font-bold text-ink">{profile.name}</div>
              <div className="truncate text-[12px] text-muted">{profile.email}</div>
            </div>
          </div>
          <div className="my-1 h-px bg-line" />
          <a role="menuitem" href="#/profile" className={item}><UserRound size={16} className="text-accent" /> My profile</a>
          <a role="menuitem" href="#/settings" className={item}><SettingsIcon size={16} className="text-teal" /> Settings</a>
          <button role="menuitem" type="button" onClick={toggleTheme} className={item}>
            {resolvedTheme === 'dark' ? <Sun size={16} className="text-amber" /> : <Moon size={16} className="text-violet" />}
            {resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" type="button" onClick={signOut} className={cx(item, 'text-rose hover:bg-rose-soft hover:text-rose')}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
