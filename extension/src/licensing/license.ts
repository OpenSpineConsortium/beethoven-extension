// Ashley licence keys, checked offline in the browser with WebCrypto. A port of grid/license.js
// from Ashley, kept byte-compatible so one issuing tool serves both products:
//
//   ASHLEY1.<base64url(JSON payload)>.<base64url(Ed25519 signature)>
//
// The signature covers the ASCII text "ASHLEY1.<payload part>", so there is no JSON
// canonicalisation to get wrong. Public keys are listed by key id in keys.json (raw 32-byte
// Ed25519 keys, base64); the private keys never leave the issuer's machine. A revocation list has
// the same shape with the prefix ASHLEYREV1; the kill-list (killlist.ts) rides on it.
//
// Nothing here touches the network or storage: the caller passes the keys, the clock and the
// identity, which is what makes the verifier testable with a key generated inside the test.
import bundledKeys from './keys.json';

export const PREFIX = 'ASHLEY1';
export const REV_PREFIX = 'ASHLEYREV1';
export const PRODUCT = 'ashley';
const DAY = 86400;
export const DEFAULT_GRACE_DAYS = 14;
export const KEY_PATTERN = /ASHLEY1\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}/;

export type KeyRing = Record<string, string>;
/** The public keys compiled into this build (k1 = issued keys, trial = the free edition). */
export const BUNDLED_KEYS: KeyRing = bundledKeys as KeyRing;

export interface LicensePayload {
  v: number;
  kid: string;
  lid: string;
  product: string;
  edition?: string;
  sub?: string;
  email?: string;
  domain?: string;
  name?: string;
  org?: string;
  iat: number;
  nbf?: number;
  exp: number;
  grace_days?: number;
  features?: string[];
  seats?: number;
}

export type LicenseStatus = 'valid' | 'grace' | 'expired' | 'not-yet-valid' | 'revoked' | 'wrong-product' | 'wrong-person' | 'unknown-key' | 'invalid' | 'missing';

export interface LicenseCheck {
  ok: boolean;
  status: LicenseStatus;
  detail: string;
  payload?: LicensePayload;
  daysLeft?: number;
  /** true = the key names this person; false = someone else; null = nothing to compare with yet */
  identity: boolean | null;
}

export interface Identity {
  accessId?: string;
  email?: string;
}

export function b64uEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(s: string): Uint8Array<ArrayBuffer> {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('not base64url');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64Decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(String(s));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const ascii = (s: string) => new TextEncoder().encode(s);

async function importPublicKey(rawB64: string): Promise<CryptoKey> {
  const raw = b64Decode(rawB64);
  if (raw.length !== 32) throw new Error('an Ed25519 public key is 32 bytes');
  return crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']);
}

interface Opened {
  payload?: Record<string, unknown>;
  error?: 'missing' | 'malformed' | 'unknown-key' | 'bad-signature';
}

/** Split and check a signed token; the signature is over "<prefix>.<payload part>" exactly as license.js signs it. */
export async function open(prefix: string, token: string, keys: KeyRing): Promise<Opened> {
  if (typeof token !== 'string') return { error: 'missing' };
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== prefix) return { error: 'malformed' };
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64uDecode(parts[1]!)));
  } catch {
    return { error: 'malformed' };
  }
  if (!payload || typeof payload !== 'object') return { error: 'malformed' };
  const kid = String(payload.kid ?? '');
  const raw = Object.prototype.hasOwnProperty.call(keys, kid) ? keys[kid] : undefined;
  if (!raw) return { error: 'unknown-key', payload };
  let ok = false;
  try {
    const key = await importPublicKey(raw);
    ok = await crypto.subtle.verify('Ed25519', key, b64uDecode(parts[2]!), ascii(`${parts[0]}.${parts[1]}`));
  } catch {
    ok = false;
  }
  return ok ? { payload } : { error: 'bad-signature', payload };
}

function normId(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}

/**
 * Does the licence belong to this person? A licence names a portal username (sub), an e-mail,
 * or a whole e-mail domain (site licence; subdomains count, look-alike domains do not).
 */
export function identityMatches(p: LicensePayload, identity: Identity | undefined): boolean | null {
  const accessId = normId(identity?.accessId);
  const email = normId(identity?.email);
  if (!accessId && !email) return null;
  if (p.sub && accessId && normId(p.sub) === accessId) return true;
  if (p.email && email && normId(p.email) === email) return true;
  if (p.domain && email) {
    const dom = normId(p.domain).replace(/^@/, '');
    const host = email.split('@')[1] || '';
    if (host === dom || host.endsWith(`.${dom}`)) return true;
  }
  return false;
}

/** Never let the clock run backwards: the latest time already seen wins. */
export function effectiveNow(nowSec: number, lastSeenSec: number): number {
  return Math.max(Math.floor(Number(nowSec) || 0), Math.floor(Number(lastSeenSec) || 0));
}

export interface VerifyOpts {
  keys?: KeyRing;
  /** unix seconds */
  now?: number;
  identity?: Identity;
  revoked?: Iterable<string>;
}

const iso = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);

/** Check a licence key. Statuses and wording follow grid/license.js so the two products agree. */
export async function verifyLicense(key: string | undefined, opts: VerifyOpts = {}): Promise<LicenseCheck> {
  const now = Math.floor(opts.now != null ? opts.now : Date.now() / 1000);
  if (!key || !String(key).trim()) return { ok: false, status: 'missing', detail: 'no licence key has been entered', identity: null };
  const opened = await open(PREFIX, String(key), opts.keys ?? BUNDLED_KEYS);
  const seen = opened.payload as LicensePayload | undefined;
  if (opened.error === 'unknown-key') return { ok: false, status: 'unknown-key', detail: 'this key was signed by a key this version of Ashley Bridge does not know (a newer or an older release?)', payload: seen, identity: null };
  if (opened.error) return { ok: false, status: opened.error === 'missing' ? 'missing' : 'invalid', detail: opened.error === 'bad-signature' ? 'the key has been altered or was not issued for Ashley' : 'this is not an Ashley licence key', identity: null };
  const p = opened.payload as unknown as LicensePayload;
  if (p.v !== 1 || p.product !== PRODUCT) return { ok: false, status: 'wrong-product', detail: 'this key is not for Ashley', payload: p, identity: null };
  if (typeof p.exp !== 'number' || typeof p.iat !== 'number' || !p.lid) return { ok: false, status: 'invalid', detail: 'the key lacks its dates or its id', payload: p, identity: null };
  const revoked = new Set(opts.revoked ?? []);
  if (revoked.has(p.lid)) return { ok: false, status: 'revoked', detail: `licence ${p.lid} has been withdrawn`, payload: p, identity: null };
  if (typeof p.nbf === 'number' && now < p.nbf - DAY) return { ok: false, status: 'not-yet-valid', detail: `the licence starts on ${iso(p.nbf)}`, payload: p, identity: null };
  const who = identityMatches(p, opts.identity);
  if (who === false) {
    const forWho = p.sub || p.email || (p.domain ? `accounts at ${p.domain}` : 'someone else');
    return { ok: false, status: 'wrong-person', detail: `this licence is for ${forWho}, not for ${opts.identity?.accessId || opts.identity?.email}`, payload: p, identity: false };
  }
  const graceDays = typeof p.grace_days === 'number' && p.grace_days >= 0 ? p.grace_days : DEFAULT_GRACE_DAYS;
  const daysLeft = Math.floor((p.exp - now) / DAY);
  if (now > p.exp + graceDays * DAY) return { ok: false, status: 'expired', detail: `the licence ended on ${iso(p.exp)}`, payload: p, daysLeft, identity: who };
  if (now > p.exp) return { ok: true, status: 'grace', detail: `the licence ended on ${iso(p.exp)}; Ashley Bridge keeps working until ${iso(p.exp + graceDays * DAY)}`, payload: p, daysLeft, identity: who };
  return { ok: true, status: 'valid', detail: `licensed to ${p.name || p.sub || p.email || p.domain} until ${iso(p.exp)}`, payload: p, daysLeft, identity: who };
}

/** Pick the first licence key in a text (a pasted e-mail, a file). */
export function findKey(text: string): string | null {
  const m = KEY_PATTERN.exec(String(text ?? ''));
  return m ? m[0] : null;
}

/** Read the payload without trusting it (for display of a rejected key). */
export function peek(key: string): LicensePayload | null {
  try {
    return JSON.parse(new TextDecoder().decode(b64uDecode(String(key).trim().split('.')[1] ?? ''))) as LicensePayload;
  } catch {
    return null;
  }
}
