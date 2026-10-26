import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_RULES, type AlertRules } from './lib/alerts';
import { setFormatPrefs, type AmountFormat, type DateFormat } from './lib/format';
import { clearShared } from './lib/shared';

export type ThemeChoice = 'light' | 'dark' | 'system';

export interface Profile {
  name: string;
  designation: string;
  employeeId: string;
  office: string;
  email: string;
  phone: string;
}

export interface Prefs {
  criticalAlerts: boolean;
  maturityReminders: boolean;
  dailyDigest: boolean;
  quietHours: boolean;
  quietFrom: string;
  quietTo: string;
}

export type Accent = 'indigo' | 'teal' | 'rose' | 'amber';
export type LandingPage = '' | 'alerts' | 'registry';

export interface Settings {
  accent: Accent;
  density: 'comfortable' | 'compact';
  reduceMotion: boolean;
  landingPage: LandingPage;
  pageSize: 25 | 50 | 100;
  amountFormat: AmountFormat;
  dateFormat: DateFormat;
  rules: AlertRules;
}

export const DEFAULT_SETTINGS: Settings = {
  accent: 'indigo', density: 'comfortable', reduceMotion: false, landingPage: '', pageSize: 50,
  amountFormat: 'short', dateFormat: 'medium', rules: DEFAULT_RULES,
};

// Placeholder identity for the prototype — replace with the signed-in user from SSO.
const DEFAULT_PROFILE: Profile = {
  name: 'Demo Officer',
  designation: 'Assistant Director',
  employeeId: 'DEMO-0417',
  office: 'FDR Cell · Headquarters',
  email: 'officer@example.org',
  phone: '+91 00000 00000',
};
const DEFAULT_PREFS: Prefs = { criticalAlerts: true, maturityReminders: true, dailyDigest: false, quietHours: false, quietFrom: '20:00', quietTo: '08:00' };

const KEYS = { session: 'fdrx.session', profile: 'fdrx.profile', prefs: 'fdrx.prefs', theme: 'fdrx.theme', settings: 'fdrx.settings' };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function readString<T extends string>(key: string, fallback: T): T {
  try { return (localStorage.getItem(key) as T) || fallback; } catch { return fallback; }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch { /* storage unavailable — state still works for this tab */ }
}

const systemDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

interface Session {
  signedIn: boolean;
  signedInAt: string | null;
  profile: Profile;
  prefs: Prefs;
  theme: ThemeChoice;
  resolvedTheme: 'light' | 'dark';
  signIn: () => void;
  signOut: () => void;
  saveProfile: (p: Profile) => void;
  savePrefs: (p: Prefs) => void;
  setTheme: (t: ThemeChoice) => void;
  toggleTheme: () => void;
  settings: Settings;
  saveSettings: (patch: Partial<Settings>) => void;
  clearLocalData: () => void;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(() => read<{ signedInAt: string | null }>(KEYS.session, { signedInAt: new Date().toISOString() }));
  const [profile, setProfile] = useState(() => read(KEYS.profile, DEFAULT_PROFILE));
  const [prefs, setPrefs] = useState(() => read(KEYS.prefs, DEFAULT_PREFS));
  const [theme, setThemeState] = useState<ThemeChoice>(() => readString<ThemeChoice>(KEYS.theme, 'system'));
  const [osDark, setOsDark] = useState(systemDark);
  const [settings, setSettings] = useState<Settings>(() => {
    const s = read(KEYS.settings, DEFAULT_SETTINGS);
    return { ...s, rules: { ...DEFAULT_RULES, ...s.rules } };
  });
  // Formatters are plain functions, so they read the preference from module state.
  setFormatPrefs(settings.amountFormat, settings.dateFormat);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.accent = settings.accent;
    root.dataset.density = settings.density;
    if (settings.reduceMotion) root.dataset.motion = 'reduce';
    else delete root.dataset.motion;
  }, [settings.accent, settings.density, settings.reduceMotion]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setOsDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const resolvedTheme = theme === 'system' ? (osDark ? 'dark' : 'light') : theme;
  const firstApply = useRef(true);
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.theme === resolvedTheme && firstApply.current) { firstApply.current = false; return; }
    firstApply.current = false;
    root.classList.add('theme-transition');
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
    const t = window.setTimeout(() => root.classList.remove('theme-transition'), 400);
    return () => window.clearTimeout(t);
  }, [resolvedTheme]);

  const signIn = useCallback(() => {
    const s = { signedInAt: new Date().toISOString() };
    setSession(s);
    write(KEYS.session, s);
    window.location.hash = `#/${settings.landingPage}`;
  }, [settings.landingPage]);
  const signOut = useCallback(() => {
    setSession({ signedInAt: null });
    write(KEYS.session, { signedInAt: null });
  }, []);
  const saveProfile = useCallback((p: Profile) => { setProfile(p); write(KEYS.profile, p); }, []);
  const savePrefs = useCallback((p: Prefs) => { setPrefs(p); write(KEYS.prefs, p); }, []);
  const setTheme = useCallback((t: ThemeChoice) => { setThemeState(t); write(KEYS.theme, t); }, []);
  const saveSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      write(KEYS.settings, next);
      return next;
    });
  }, []);
  const clearLocalData = useCallback(() => {
    for (const k of Object.values(KEYS)) write(k, null);
    clearShared();
    window.location.hash = '#/';
    window.location.reload();
  }, []);
  const toggleTheme = useCallback(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'), [resolvedTheme, setTheme]);

  return (
    <Ctx.Provider value={{
      signedIn: !!session.signedInAt, signedInAt: session.signedInAt, profile, prefs, theme, resolvedTheme,
      signIn, signOut, saveProfile, savePrefs, setTheme, toggleTheme, settings, saveSettings, clearLocalData,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession must be used inside SessionProvider');
  return s;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}
