// State shared between browser tabs of this app (the AICTE dashboard and the bank simulator):
// stored in localStorage and announced over a BroadcastChannel so other tabs update instantly.

export type SharedKey = 'uploads' | 'bank' | 'acks' | 'audit' | 'scans';

const PREFIX = 'fdrx.shared.';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('fdr-sentinel-x') : null;

export function readShared<T>(key: SharedKey, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeShared(key: SharedKey, value: unknown): void {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* quota or blocked storage — this tab still works */ }
  channel?.postMessage({ key });
}

export function clearShared(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch { /* ignore */ }
}

/** Calls back when another tab changed a shared key. */
export function subscribeShared(cb: (key: SharedKey) => void): () => void {
  const onMsg = (e: MessageEvent) => { if (e.data?.key) cb(e.data.key as SharedKey); };
  const onStorage = (e: StorageEvent) => { if (e.key?.startsWith(PREFIX)) cb(e.key.slice(PREFIX.length) as SharedKey); };
  channel?.addEventListener('message', onMsg);
  window.addEventListener('storage', onStorage);
  return () => { channel?.removeEventListener('message', onMsg); window.removeEventListener('storage', onStorage); };
}

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0')}`;
