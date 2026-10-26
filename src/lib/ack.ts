// Signed acknowledgements: AICTE's receipt for an accepted FDR, verifiable from its QR code.
// The QR carries the receipt details plus an ECDSA P-256 signature over them. Changing any detail breaks the
// signature, so a verifier can tell a genuine receipt from an edited one without contacting anyone.
//
// PROTOTYPE KEY: the demo signing key ships inside the app so the prototype works without a server. In production
// the private key lives in AICTE's server (ideally an HSM) and only the public key below ships to browsers.

const PUBLIC_JWK: JsonWebKey = { kty: 'EC', crv: 'P-256', x: '6qMKDSE1j8gWWmWIgSpgKntllQ69kzuqrYIdQ02bGTw', y: 'LXkBXpws-hrozIBWDazlo1oZtJkWn013P8TbIgDjSZs' };
const DEMO_PRIVATE_JWK: JsonWebKey = { ...PUBLIC_JWK, d: 'g4WFHv3xHoHDLRSTasVuSompJs5GQBwb6f9CHJ8JnwA' };

export const KEY_ID = 'aicte-fdr-demo-2026';

export interface AckPayload {
  v: 1;
  /** Acknowledgement number. */
  ack: string;
  fdr: string;
  no: string;
  bank: string;
  ifsc: string;
  holder: string;
  inst: string;
  aicteId: string;
  amt: number;
  mat: string;
  /** ISO timestamp of issue. */
  iat: string;
  by: string;
  kid: string;
}

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIG = { name: 'ECDSA', hash: 'SHA-256' } as const;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const utf8 = (s: string) => new TextEncoder().encode(s);

let pub: Promise<CryptoKey> | null = null;
let priv: Promise<CryptoKey> | null = null;
const publicKey = () => (pub ??= crypto.subtle.importKey('jwk', PUBLIC_JWK, ALG, false, ['verify']));
const privateKey = () => (priv ??= crypto.subtle.importKey('jwk', DEMO_PRIVATE_JWK, ALG, false, ['sign']));

/** Token = base64url(JSON payload) + "." + base64url(signature). */
export async function signAck(payload: AckPayload): Promise<string> {
  const body = b64url(utf8(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign(SIG, await privateKey(), utf8(body)));
  return `${body}.${b64url(sig)}`;
}

export type VerifyResult =
  | { status: 'valid'; payload: AckPayload }
  | { status: 'tampered'; payload: AckPayload | null }
  | { status: 'malformed' };

export async function verifyAck(token: string): Promise<VerifyResult> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return { status: 'malformed' };
  let payload: AckPayload | null = null;
  try { payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as AckPayload; } catch { return { status: 'malformed' }; }
  try {
    const ok = await crypto.subtle.verify(SIG, await publicKey(), fromB64url(sig), utf8(body));
    return ok ? { status: 'valid', payload } : { status: 'tampered', payload };
  } catch {
    return { status: 'tampered', payload };
  }
}

/** Builds a copy of a token with one detail changed but the original signature — for the "tampered receipt" demo. */
export function tamperToken(token: string, change: (p: AckPayload) => AckPayload): string {
  const [body, sig] = token.split('.');
  const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as AckPayload;
  return `${b64url(utf8(JSON.stringify(change(p))))}.${sig}`;
}

export function verifyUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}#/verify/${token}`;
}

/** Pulls a token out of a scanned QR (full URL) or pasted text. */
export function extractToken(text: string): string | null {
  const m = text.trim().match(/#\/verify\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/) ?? text.trim().match(/^([A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,})$/);
  return m ? m[1] : null;
}
