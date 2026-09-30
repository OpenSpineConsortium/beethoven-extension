// Signed tokens, checked offline in the browser with WebCrypto: the one verifier the kill-list
// (killlist.ts) rides on. A port of the check in grid/license.js of the vendor's VS Code extension,
// kept byte-compatible so one issuing tool serves both products:
//
//   <prefix>.<base64url(JSON payload)>.<base64url(Ed25519 signature)>
//
// The signature covers the ASCII text "<prefix>.<payload part>", so there is no JSON
// canonicalisation to get wrong. Public keys are listed by key id in keys.json (raw 32-byte
// Ed25519 keys, base64); the private keys never leave the issuer's machine. Beethoven accepts
// no token of any other kind: access is decided by Licensor's access service (access.ts).
//
// Nothing here touches the network or storage: the caller passes the token and the keys, which is
// what makes the verifier testable with a key generated inside the test.
import bundledKeys from './keys.json';

/** the prefix of the VS Code extension's revocation list and of the kill-list's signature (a format tag the issuing tool checks) */
export const REV_PREFIX = 'ASHLEYREV1';

export type KeyRing = Record<string, string>;
/** the public key compiled into this build (k1: the release key the kill-list is signed with) */
export const BUNDLED_KEYS: KeyRing = bundledKeys as KeyRing;

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

export interface Opened {
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
