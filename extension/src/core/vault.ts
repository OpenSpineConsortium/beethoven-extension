// The grid sign-in the student chose to save (19.0.0, "Beethoven signs in"): their AccessID and password,
// kept on this computer only as AES-GCM-256 ciphertext under a key derived (HKDF-SHA-256) from their
// passkey's PRF output. The PRF output is never written to disk: a page keeps it in storage.session for
// the browser session (SIGNIN_UNLOCK_KEY), and the background opens the record with it each time the grid
// asks. Saving is opt-in (the unticked "Remember" box); without it nothing here is used at all.
//
// Ported from 15.0.0's core/keyring.ts, which kept the ssh key behind the same passkey, with what this
// one changes:
// - a password is sealed with encrypt/decrypt, not a pkcs8 key with wrapKey, and the additional data binds
//   the portal's origin, the AccessID and the passkey's credential id, so a record opens only for the grid
//   and account it was saved for;
// - there is no default "device key" mode: a key kept beside the ciphertext would leave the password
//   readable to anyone with the profile's files, so the first write is already under the passkey;
// - user.id is derived from the origin and the AccessID instead of random, so saving again for the same
//   account replaces the earlier passkey (one per RP ID and user handle) instead of leaving another
//   "<AccessID> (grid)" in the student's passkey list;
// - a passkey whose create() reports prf.enabled false gets no second prompt: it can never give an output;
// - user verification is read from the authenticator data the browser hands back (byte 32, bit 0x04),
//   on create from getAuthenticatorData() and on get from authenticatorData, never from the attestation;
// - every error after a successful create() carries the new credential's id, so the page can tell the
//   passkey provider that passkey is unused (signalUnknownCredential, best-effort).
//
// WebAuthn needs a window (the side panel or an extension tab), never the service worker, so only the page
// side (ext/gridSignin.ts) makes, unlocks and seals; the background only opens a record and deletes it.
// This module is imported by both, so it reads no browser global when it loads: navigator.credentials and
// PublicKeyCredential are touched only inside browserPasskeys() and browserStatics(), and the ceremonies,
// the stores and the platform probe are all passed in, so the tests stand in for an authenticator.

/** the IndexedDB database on the extension's origin (the portal page's content script cannot reach it) */
export const SIGNIN_DB = 'beethoven-signin';
export const SIGNIN_STORE = 'records';
export const SIGNIN_RECORD_ID = 'grid';
/** how long a passkey prompt waits for the student before the browser gives up */
export const PASSKEY_TIMEOUT_MS = 60_000;

/** the one saved sign-in; every byte field is base64, cred base64url (as WebAuthn writes a credential id) */
export interface SigninRecord {
  v: 1;
  origin: string;
  username: string;
  cred: string;
  prfSalt: string;
  hkdfSalt: string;
  iv: string;
  ct: string;
  saved_at: string;
}

/** navigator.credentials, injected so the tests can stand in for an authenticator */
export type PasskeyApi = {
  create(o: CredentialCreationOptions): Promise<Credential | null>;
  get(o: CredentialRequestOptions): Promise<Credential | null>;
};

/** PublicKeyCredential's static probes: isUserVerifyingPlatformAuthenticatorAvailable, getClientCapabilities */
export type PasskeyStatics = { uvpaa(): Promise<boolean>; caps?(): Promise<Record<string, boolean>> };

/** where the record lives: IndexedDB in the browser, an object in the tests */
export type RecordStore = {
  get(): Promise<SigninRecord | undefined>;
  put(r: SigninRecord): Promise<void>;
  delete(): Promise<void>;
};

export type VaultCode = 'no-webauthn' | 'no-prf' | 'not-allowed' | 'no-uv' | 'mismatch' | 'corrupt';

/** what can go wrong, by a short code; the pages choose the words. A message never holds a secret */
export class VaultError extends Error {
  readonly code: VaultCode;
  /** the passkey makePasskey just made, which nothing will use (absent on every other error) */
  declare readonly cred?: string;
  constructor(code: VaultCode, message: string, cred?: string) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
    if (cred !== undefined) Object.defineProperty(this, 'cred', { value: cred, enumerable: true });
  }
}

// ---- bytes -----------------------------------------------------------------------------------------------

const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const B64URL = /^[A-Za-z0-9_-]*$/;

export function base64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** strict: padded, no whitespace, no other alphabet (atob alone accepts all three) */
export function unbase64(s: string): Uint8Array<ArrayBuffer> {
  if (typeof s !== 'string' || !B64.test(s)) throw new Error('not base64');
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64url(b: Uint8Array): string {
  return base64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unbase64url(s: string): Uint8Array<ArrayBuffer> {
  if (typeof s !== 'string' || !B64URL.test(s) || s.length % 4 === 1) throw new Error('not base64url');
  return unbase64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
}

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const rand = (n: number): Uint8Array<ArrayBuffer> => globalThis.crypto.getRandomValues(new Uint8Array(n));
const utf8 = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
/** WebCrypto takes no view over a SharedArrayBuffer; ours never is one, so this copies nothing in practice */
const own = (u: Uint8Array): Uint8Array<ArrayBuffer> => (u.buffer instanceof ArrayBuffer ? (u as Uint8Array<ArrayBuffer>) : new Uint8Array(u));

/** a view (not a copy) of what WebAuthn hands back, so zeroing the PRF output zeroes the browser's buffer too */
function view(x: unknown): Uint8Array | undefined {
  if (Object.prototype.toString.call(x) === '[object ArrayBuffer]') return new Uint8Array(x as ArrayBuffer);
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  return undefined;
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

// ---- the browser -----------------------------------------------------------------------------------------

/** WebAuthn on this page, or undefined where there is none (the service worker, a browser without it) */
export function browserPasskeys(): PasskeyApi | undefined {
  const g = globalThis as { navigator?: { credentials?: CredentialsContainer }; PublicKeyCredential?: unknown };
  const c = g.navigator?.credentials;
  if (!c || typeof c.create !== 'function' || typeof c.get !== 'function' || typeof g.PublicKeyCredential !== 'function') return undefined;
  // called on the container itself: the browser refuses the methods on any other `this`
  return { create: (o) => c.create(o), get: (o) => c.get(o) };
}

/** the platform probes, or undefined where WebAuthn is absent */
export function browserStatics(): PasskeyStatics | undefined {
  type Statics = { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>; getClientCapabilities?: () => Promise<Record<string, boolean>> };
  const P = (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential as (Statics & ((...a: never[]) => unknown)) | undefined;
  if (typeof P !== 'function' || typeof P.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return undefined;
  const uvpaa = P.isUserVerifyingPlatformAuthenticatorAvailable;
  const caps = P.getClientCapabilities;
  return { uvpaa: () => uvpaa.call(P), ...(typeof caps === 'function' ? { caps: () => caps.call(P) } : {}) };
}

/**
 * Can this computer lock a saved password? A hint only: the real test is a PRF output from the passkey,
 * and 'unknown' is offered like 'yes'. isUserVerifyingPlatformAuthenticatorAvailable is true on computers
 * whose authenticator has no PRF, and extension:prf only says the browser implements PRF, not that the
 * authenticator has it, which is why makePasskey still stops on prf.enabled false.
 */
export async function passkeySupport(api?: PasskeyApi, statics?: PasskeyStatics): Promise<'yes' | 'no' | 'unknown'> {
  if (!api) return 'no';
  if (!statics) return 'unknown';
  try {
    if (!(await statics.uvpaa())) return 'no';
  } catch {
    return 'no';
  }
  let prf: boolean | undefined;
  try {
    prf = (await statics.caps?.())?.['extension:prf'];
  } catch {
    prf = undefined;
  }
  return prf === false ? 'no' : prf === true ? 'yes' : 'unknown';
}

// ---- the passkey -----------------------------------------------------------------------------------------

/** the user name the passkey lists show, and the texts name ("delete it only after Forget") */
const passkeyName = (username: string): string => `${username} (grid)`;
const PASSKEY_DISPLAY_NAME = 'Beethoven grid sign-in';
const UV = 0x04;

/**
 * The user handle for one account at one grid: the same every time, so a passkey made again for it
 * replaces the earlier one. It names nothing secret, and the AccessID is in the passkey's user name anyway.
 */
export async function userIdFor(origin: string, username: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await subtle().digest('SHA-256', utf8(`beethoven-grid|${origin}|${username}`))).slice(0, 16);
}

interface Answer {
  rawId: Uint8Array;
  response: { getAuthenticatorData?: () => unknown; authenticatorData?: unknown };
  prf?: { enabled?: unknown; results?: { first?: unknown } };
}

/** the browser's error, by name: a cancelled prompt, an abort and a timeout are all "not allowed" */
function ceremonyError(e: unknown): VaultError {
  if (e instanceof VaultError) return e;
  const name = (e as { name?: unknown } | null | undefined)?.name;
  if (name === 'NotSupportedError' || name === 'SecurityError' || name === 'TypeError') return new VaultError('no-webauthn', `passkeys are not available here (${name})`);
  return new VaultError('not-allowed', `the passkey step did not complete (${typeof name === 'string' ? name : 'no answer'})`);
}

async function ceremony(run: () => Promise<Credential | null>): Promise<Answer> {
  let c: Credential | null;
  try {
    c = await run();
  } catch (e) {
    throw ceremonyError(e);
  }
  const x = c as unknown as { type?: unknown; rawId?: unknown; response?: Answer['response']; getClientExtensionResults?: () => { prf?: Answer['prf'] } } | null;
  const rawId = view(x?.rawId);
  if (!x || x.type !== 'public-key' || !rawId?.length || !x.response || typeof x.getClientExtensionResults !== 'function') throw new VaultError('no-webauthn', 'the browser answered without a passkey');
  let prf: Answer['prf'];
  try {
    prf = x.getClientExtensionResults()?.prf;
  } catch {
    prf = undefined;
  }
  return { rawId, response: x.response, ...(prf ? { prf } : {}) };
}

const verified = (authData: Uint8Array | undefined): boolean => !!authData && authData.length > 32 && (authData[32]! & UV) !== 0;

/** the 32-byte output, when the answer carries one; a result of another size is no PRF at all */
function prfOutput(a: Answer): Uint8Array | undefined {
  const first = view(a.prf?.results?.first);
  if (!first) return undefined;
  if (first.length !== 32) throw new VaultError('no-prf', 'the passkey gave an output of the wrong size');
  return first;
}

function assertionRequest(id: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, o: { timeout?: number; signal?: AbortSignal }): CredentialRequestOptions {
  return {
    publicKey: {
      challenge: rand(32),
      allowCredentials: [{ type: 'public-key', id }],
      userVerification: 'required',
      timeout: o.timeout ?? PASSKEY_TIMEOUT_MS,
      extensions: { prf: { eval: { first: salt } } },
    },
    ...(o.signal ? { signal: o.signal } : {}),
  };
}

/** one assertion's PRF output, refused unless the passkey asked for answered and the student was verified */
function outputOf(a: Answer, id: Uint8Array): Uint8Array {
  if (!sameBytes(a.rawId, id)) throw new VaultError('mismatch', 'another passkey answered');
  if (!verified(view(a.response.authenticatorData))) throw new VaultError('no-uv', 'the passkey answered without verifying the student');
  const out = prfOutput(a);
  if (!out) throw new VaultError('no-prf', 'the passkey answered without an output');
  return out;
}

/**
 * Inside the student's click, on a page: a new passkey for this account and its PRF output. One prompt
 * when the authenticator evaluates PRF at creation, two when it only reports that it can (one get()), and
 * one when it reports it cannot (no-prf at once). The only await before create() is a digest.
 */
export async function makePasskey(api: PasskeyApi, o: { origin: string; username: string; timeout?: number; signal?: AbortSignal }): Promise<{ cred: string; prfSalt: string; prf: Uint8Array }> {
  const salt = rand(32);
  const userId = await userIdFor(o.origin, o.username);
  const made = await ceremony(() =>
    api.create({
      publicKey: {
        // no rp.id: on the extension's own page the browser fills in the extension's id
        rp: { name: 'Beethoven' },
        user: { id: userId, name: passkeyName(o.username), displayName: PASSKEY_DISPLAY_NAME },
        challenge: rand(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -8 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
        attestation: 'none',
        timeout: o.timeout ?? PASSKEY_TIMEOUT_MS,
        extensions: { prf: { eval: { first: salt } } },
      },
      ...(o.signal ? { signal: o.signal } : {}),
    }),
  );
  const id = own(made.rawId);
  const cred = base64url(id);
  try {
    const authData = typeof made.response.getAuthenticatorData === 'function' ? view(made.response.getAuthenticatorData()) : undefined;
    if (!verified(authData)) throw new VaultError('no-uv', 'the passkey was made without verifying the student');
    if (made.prf?.enabled === false) throw new VaultError('no-prf', 'this passkey cannot lock a password');
    const prf = prfOutput(made) ?? outputOf(await ceremony(() => api.get(assertionRequest(id, salt, o))), id);
    return { cred, prfSalt: base64(salt), prf };
  } catch (e) {
    const v = ceremonyError(e);
    throw new VaultError(v.code, v.message, cred);
  }
}

/**
 * Inside the student's click, on a page: the saved passkey's PRF output, one prompt. Its errors carry no
 * credential id: this passkey holds a saved sign-in, and the page must never call it unused.
 */
export async function unlockPasskey(api: PasskeyApi, o: { cred: string; prfSalt: string; timeout?: number; signal?: AbortSignal }): Promise<Uint8Array> {
  let id: Uint8Array<ArrayBuffer>;
  let salt: Uint8Array<ArrayBuffer>;
  try {
    id = unbase64url(o.cred);
    salt = unbase64(o.prfSalt);
  } catch {
    throw new VaultError('corrupt', 'the saved sign-in names no passkey');
  }
  if (!id.length || !salt.length) throw new VaultError('corrupt', 'the saved sign-in names no passkey');
  return outputOf(await ceremony(() => api.get(assertionRequest(id, salt, o))), id);
}

// ---- the seal --------------------------------------------------------------------------------------------

const HKDF_INFO = 'Beethoven grid sign-in v1';
const aadFor = (r: { origin: string; username: string; cred: string }): Uint8Array<ArrayBuffer> => utf8(`beethoven-signin|v1|${r.origin}|${r.username}|${r.cred}`);

/** non-extractable, and allowed only the one use the caller needs */
async function keyFrom(prf: Uint8Array, salt: Uint8Array<ArrayBuffer>, use: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const ikm = await subtle().importKey('raw', own(prf), 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8(HKDF_INFO) }, ikm, { name: 'AES-GCM', length: 256 }, false, [use]);
}

/** a record this version reads: every field present, the byte fields in their alphabets */
export function isSigninRecord(r: unknown): r is SigninRecord {
  const x = r as Partial<Record<keyof SigninRecord, unknown>> | null | undefined;
  if (!x || typeof x !== 'object' || x.v !== 1) return false;
  if (![x.origin, x.username, x.saved_at].every((s) => typeof s === 'string')) return false;
  if (typeof x.cred !== 'string' || !x.cred || !B64URL.test(x.cred)) return false;
  return [x.prfSalt, x.hkdfSalt, x.iv, x.ct].every((s) => typeof s === 'string' && s !== '' && B64.test(s));
}

/**
 * The password sealed under the passkey's output: a fresh HKDF salt and a fresh 96-bit IV every time. The
 * record is opened once, with a key derived again, before it is handed back, so a record that would not
 * open is never kept.
 */
export async function sealPassword(prf: Uint8Array, o: { origin: string; username: string; cred: string; prfSalt: string; password: string; savedAt: string }): Promise<SigninRecord> {
  if (prf.length !== 32) throw new VaultError('no-prf', 'a passkey output is 32 bytes');
  const hkdfSalt = rand(32);
  const iv = rand(12);
  const key = await keyFrom(prf, hkdfSalt, 'encrypt');
  const plain = utf8(o.password);
  let ct: ArrayBuffer;
  try {
    ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aadFor(o) }, key, plain);
  } finally {
    plain.fill(0);
  }
  const rec: SigninRecord = { v: 1, origin: o.origin, username: o.username, cred: o.cred, prfSalt: o.prfSalt, hkdfSalt: base64(hkdfSalt), iv: base64(iv), ct: base64(new Uint8Array(ct)), saved_at: o.savedAt };
  const back = await openPassword(prf, rec, { origin: o.origin, username: o.username });
  if (back.password !== o.password) throw new VaultError('corrupt', 'the sealed sign-in did not open to what was sealed');
  return rec;
}

/** the AccessID and password, for the grid and account the record was saved for only */
export async function openPassword(prf: Uint8Array, rec: SigninRecord, expect: { origin: string; username?: string }): Promise<{ username: string; password: string }> {
  if (!isSigninRecord(rec)) throw new VaultError('corrupt', 'the saved sign-in is not in a form this version reads');
  if (rec.origin !== expect.origin || (expect.username !== undefined && rec.username !== expect.username)) throw new VaultError('mismatch', 'the saved sign-in is for another grid or account');
  let plain: Uint8Array | undefined;
  try {
    const iv = unbase64(rec.iv);
    if (iv.length !== 12) throw new Error('iv');
    const key = await keyFrom(prf, unbase64(rec.hkdfSalt), 'decrypt');
    plain = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: aadFor(rec) }, key, unbase64(rec.ct)));
    return { username: rec.username, password: new TextDecoder('utf-8', { fatal: true }).decode(plain) };
  } catch {
    throw new VaultError('corrupt', 'the saved sign-in did not open (another passkey, or the record was altered)');
  } finally {
    plain?.fill(0);
  }
}

// ---- where the record lives ------------------------------------------------------------------------------

/**
 * IndexedDB on the extension's origin (the default factory is the page's or the worker's own, looked up at
 * each call). Where there is no IndexedDB at all nothing can have been kept: get finds nothing and delete has
 * nothing to do, and only put fails. A stored value this version cannot read counts as no record.
 */
export function indexedDbRecords(idb?: IDBFactory): RecordStore {
  const factory = (): IDBFactory | undefined => idb ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  const open = (f: IDBFactory): Promise<IDBDatabase> =>
    new Promise((res, rej) => {
      const r = f.open(SIGNIN_DB, 1);
      // version 1 is the only one, so an upgrade means the database was just made
      r.onupgradeneeded = () => r.result.createObjectStore(SIGNIN_STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  const run = async (f: IDBFactory, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<unknown> => {
    const db = await open(f);
    try {
      return await new Promise<unknown>((res, rej) => {
        const t = db.transaction(SIGNIN_STORE, mode);
        const q = fn(t.objectStore(SIGNIN_STORE));
        t.oncomplete = () => res(q.result);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    async get() {
      const f = factory();
      if (!f) return undefined;
      const r = await run(f, 'readonly', (s) => s.get(SIGNIN_RECORD_ID));
      return isSigninRecord(r) ? r : undefined;
    },
    async put(r) {
      const f = factory();
      if (!f) throw new Error('no IndexedDB here to keep the sign-in in');
      await run(f, 'readwrite', (s) => s.put(r, SIGNIN_RECORD_ID));
    },
    async delete() {
      const f = factory();
      if (!f) return;
      await run(f, 'readwrite', (s) => s.delete(SIGNIN_RECORD_ID));
    },
  };
}

/** the same, in memory: a copy goes in and a copy comes out, as IndexedDB's structured clone does */
export function memoryRecords(): RecordStore & { record?: SigninRecord } {
  const m: RecordStore & { record?: SigninRecord } = {
    get: async () => (isSigninRecord(m.record) ? structuredClone(m.record) : undefined),
    put: async (r) => void (m.record = structuredClone(r)),
    delete: async () => void delete m.record,
  };
  return m;
}
