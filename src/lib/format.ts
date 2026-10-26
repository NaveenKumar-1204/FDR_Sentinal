const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export type AmountFormat = 'short' | 'full';
export type DateFormat = 'medium' | 'numeric';
const prefs: { amount: AmountFormat; date: DateFormat } = { amount: 'short', date: 'medium' };

/** Set from the user's Settings; formatters below read it on every call. */
export function setFormatPrefs(amount: AmountFormat, date: DateFormat) {
  prefs.amount = amount;
  prefs.date = date;
}

export function formatINR(amount: number): string {
  return `₹${inr.format(amount)}`;
}

/** Indian short form (₹50 L, ₹1.25 Cr), or the full figure when the user prefers it. */
export function formatINRShort(amount: number): string {
  if (prefs.amount === 'full') return formatINR(Math.round(amount));
  if (amount >= 1e7) return `₹${trim(amount / 1e7)} Cr`;
  if (amount >= 1e5) return `₹${trim(amount / 1e5)} L`;
  return formatINR(amount);
}

function trim(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '');
}

const dateOpts = (): Intl.DateTimeFormatOptions =>
  prefs.date === 'numeric' ? { day: '2-digit', month: '2-digit', year: 'numeric' } : { day: '2-digit', month: 'short', year: 'numeric' };

export function formatDate(iso: string): string {
  return new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-IN', dateOpts());
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { ...dateOpts(), hour: '2-digit', minute: '2-digit' });
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10));
  const b = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
