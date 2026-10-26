import type { AuditEvent } from '../data/types';

export interface ChainedEvent extends AuditEvent {
  index: number;
  prevHash: string;
  hash: string;
}

export const GENESIS = '0'.repeat(64);

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const payload = (e: AuditEvent) => JSON.stringify([e.at, e.actor, e.action, e.fdrId ?? '', e.detail]);

/** Each event's hash covers the previous hash, so editing any past event breaks every link after it. */
export async function buildChain(events: AuditEvent[]): Promise<ChainedEvent[]> {
  const out: ChainedEvent[] = [];
  let prev = GENESIS;
  for (const [index, e] of events.entries()) {
    const hash = await sha256(prev + payload(e));
    out.push({ ...e, index, prevHash: prev, hash });
    prev = hash;
  }
  return out;
}

/** Returns the index of the first event whose stored hash no longer matches its contents, or -1. */
export async function verifyChain(chain: ChainedEvent[]): Promise<number> {
  let prev = GENESIS;
  for (const e of chain) {
    if (e.prevHash !== prev || (await sha256(prev + payload(e))) !== e.hash) return e.index;
    prev = e.hash;
  }
  return -1;
}
