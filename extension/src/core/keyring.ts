// This computer's ssh key for the grid (12.0.0, docs/V12_CONTRACT.md "The key", decision D2).
//
// BY DEFAULT there is no biometric step. The key pair (Ed25519 where the browser's WebCrypto has it, else
// ECDSA P-256) is made once; its private half is wrapped (AES-256-GCM, WebCrypto wrapKey) under a
// browser key that is itself NON-EXTRACTABLE and lives beside it in IndexedDB; the key that signs is
// always unwrapped as a NON-EXTRACTABLE CryptoKey, in memory only. The private key is never written
// anywhere in the clear, never leaves the browser, and is never sent anywhere: the grid gets the public
// half, once, in the student's own signed-in session (core/signin.ts).
//
// OPT-IN, never by default: "Protect my key with Windows Hello / Touch ID". Then the same key is wrapped
// instead under a key derived from the student's passkey (WebAuthn's PRF extension, HKDF-SHA-256), and the
// browser key is deleted: the copy on disk opens only with the fingerprint, face or PIN. It is unlocked
// once per browser session: the passkey's output is kept in storage.session (memory only, cleared when
// the browser closes, never readable by a page script) so the background can open the key when it wakes.
// Turning it on or off moves the SAME key from one wrap to the other (no new key, nothing to change on
// the grid): it is unwrapped as an extractable key in memory only for the moment of re-wrapping, and the
// clear key is never written anywhere. WebAuthn needs a page, so protectKey, unprotectKey, unlockKey and
// createProtectedKey run in the panel or Settings, inside the student's click; the background only reads.
//
// Passkey wrapping ported from the spike (v12/iwa/passkey/lib/pkwrap.js): PRF output -> HKDF-SHA-256
// (random salt, info "beethoven/ssh-key-wrap/v1") -> AES-256-GCM key-encryption key; the GCM additional
// data binds the record's version, kind, algorithm, credential id and public key. On the extension's own
// page WebAuthn works with the default relying party (the extension's id): no web frame is needed.
//
// "Forget this computer" deletes the record and the session's unlock; the background first sends
// `forget` through the gate so the grid's line goes too (core/sshChannel.ts).
import { ab, base64, concat, unbase64, utf8, Writer } from '../ssh/bytes';
import { ALGS, generateKeyPair, hasEd25519, keysMatch, SshIdentity, type KeyAlg } from '../ssh/identity';

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const rand = (n: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(n));

export const KEY_DB = 'beethoven-key';
export const KEY_STORE = 'keys';
const RECORD_ID = 'current';
export const RECORD_VERSION = 1;
const HKDF_INFO = utf8('beethoven/ssh-key-wrap/v1');

interface RecordBase {
  v: 1;
  alg: KeyAlg;
  /** the raw public key */
  pub: Uint8Array;
  iv: Uint8Array;
  /** the private key, pkcs8, AES-256-GCM-wrapped */
  wrapped: Uint8Array;
  created: string;
  /** set once the grid took the key and a second connection with it worked (signin.ts) */
  enrolled_at?: string;
  /** the account it was enrolled for */
  account?: string;
}

/** the default: wrapped under a non-extractable browser key kept beside it */
export interface DeviceRecord extends RecordBase {
  kind: 'device';
  kek: CryptoKey;
}

/** the opt-in: wrapped under the student's passkey */
export interface PasskeyRecord extends RecordBase {
  kind: 'prf';
  credId: Uint8Array;
  prfSalt: Uint8Array;
  kdfSalt: Uint8Array;
}

export type KeyRecord = DeviceRecord | PasskeyRecord;

/** where the record lives (IndexedDB in the browser; a Map in the tests) */
export interface KeyStore {
  get(): Promise<KeyRecord | undefined>;
  put(r: KeyRecord): Promise<void>;
  delete(): Promise<void>;
}

/** the unlocked passkey's output for this browser session (storage.session in the browser) */
export interface UnlockStore {
  get(): Promise<{ secret: string; cred: string } | undefined>;
  set(v: { secret: string; cred: string }): Promise<void>;
  remove(): Promise<void>;
}

/** WebAuthn, injected so the tests can stand in for an authenticator */
export interface PasskeyApi {
  /** make a passkey with the PRF extension; its PRF output when the authenticator gives it at creation */
  create(o: { prfSalt: Uint8Array; userName: string }): Promise<{ credId: Uint8Array; prfEnabled: boolean; prfFirst?: Uint8Array }>;
  /** one assertion with user verification: the 32-byte PRF output for prfSalt */
  get(o: { credId: Uint8Array; prfSalt: Uint8Array }): Promise<Uint8Array>;
}

/** what can go wrong, by a short code; the pages map codes to plain words (model.ts WORDS.direct.protectKey) */
export class KeyringError extends Error {
  constructor(
    readonly code: 'no-key' | 'locked' | 'no-webauthn' | 'no-prf' | 'not-allowed' | 'wrong-key' | 'bad-record' | 'already',
    message: string,
  ) {
    super(message);
    this.name = 'KeyringError';
  }
}

export interface KeyState {
  present: boolean;
  /** protected by a passkey (opt-in) */
  wrapped: boolean;
  /** protected and not unlocked this browser session */
  locked: boolean;
  alg?: KeyAlg;
  keyType?: string;
  fingerprint?: string;
  enrolled: boolean;
  enrolledAt?: string;
  account?: string;
  created?: string;
}

// ---- storage -------------------------------------------------------------------------------------------

export function indexedDbStore(name = KEY_DB): KeyStore {
  const open = (): Promise<IDBDatabase> =>
    new Promise((res, rej) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(KEY_STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | undefined): Promise<T | undefined> => {
    const db = await open();
    try {
      return await new Promise<T | undefined>((res, rej) => {
        const t = db.transaction(KEY_STORE, mode);
        const q = fn(t.objectStore(KEY_STORE));
        t.oncomplete = () => res(q?.result as T | undefined);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    get: () => tx<KeyRecord>('readonly', (s) => s.get(RECORD_ID)),
    put: async (r) => void (await tx('readwrite', (s) => s.put(r, RECORD_ID))),
    delete: async () => void (await tx('readwrite', (s) => s.delete(RECORD_ID))),
  };
}

export function memoryKeyStore(): KeyStore & { record?: KeyRecord } {
  const m: KeyStore & { record?: KeyRecord } = {
    get: async () => m.record,
    put: async (r) => void (m.record = r),
    delete: async () => void delete m.record,
  };
  return m;
}

export function memoryUnlockStore(): UnlockStore & { value?: { secret: string; cred: string } } {
  const m: UnlockStore & { value?: { secret: string; cred: string } } = {
    get: async () => m.value,
    set: async (v) => void (m.value = v),
    remove: async () => void delete m.value,
  };
  return m;
}

/** WebAuthn on this page (the extension's own origin: the default relying party is the extension's id) */
export function browserPasskeys(timeoutMs = 120_000): PasskeyApi {
  const mapError = (e: unknown): KeyringError => {
    const n = (e as { name?: string })?.name;
    if (n === 'NotSupportedError' || n === 'TypeError' || n === 'SecurityError') return new KeyringError('no-webauthn', `passkeys unavailable here (${n})`);
    return new KeyringError('not-allowed', `the passkey step did not complete (${n ?? 'Error'})`);
  };
  return {
    async create({ prfSalt, userName }) {
      if (typeof globalThis.PublicKeyCredential !== 'function') throw new KeyringError('no-webauthn', 'no WebAuthn on this page');
      let cred: PublicKeyCredential;
      try {
        cred = (await navigator.credentials.create({
          publicKey: {
            rp: { name: 'Beethoven' },
            user: { id: ab(rand(16)), name: userName || 'beethoven', displayName: 'Beethoven on this computer' },
            challenge: ab(rand(32)),
            pubKeyCredParams: [
              { type: 'public-key', alg: -7 },
              { type: 'public-key', alg: -8 },
              { type: 'public-key', alg: -257 },
            ],
            authenticatorSelection: { residentKey: 'preferred', userVerification: 'required', authenticatorAttachment: 'platform' },
            attestation: 'none',
            timeout: timeoutMs,
            extensions: { prf: { eval: { first: ab(prfSalt) } } } as AuthenticationExtensionsClientInputs,
          },
        })) as PublicKeyCredential;
      } catch (e) {
        throw mapError(e);
      }
      const ext = cred.getClientExtensionResults() as { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };
      const first = ext.prf?.results?.first;
      return { credId: new Uint8Array(cred.rawId), prfEnabled: !!ext.prf?.enabled || !!first, ...(first ? { prfFirst: new Uint8Array(first) } : {}) };
    },
    async get({ credId, prfSalt }) {
      if (typeof globalThis.PublicKeyCredential !== 'function') throw new KeyringError('no-webauthn', 'no WebAuthn on this page');
      let cred: PublicKeyCredential;
      try {
        cred = (await navigator.credentials.get({
          publicKey: {
            challenge: ab(rand(32)),
            allowCredentials: [{ type: 'public-key', id: ab(credId) }],
            userVerification: 'required',
            timeout: timeoutMs,
            extensions: { prf: { eval: { first: ab(prfSalt) } } } as AuthenticationExtensionsClientInputs,
          },
        })) as PublicKeyCredential;
      } catch (e) {
        throw mapError(e);
      }
      const ext = cred.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
      const first = ext.prf?.results?.first;
      if (!first || first.byteLength !== 32) throw new KeyringError('no-prf', 'the passkey answered without a PRF output');
      return new Uint8Array(first);
    },
  };
}

/** what this page's browser says it can do (a hint only: the real test is a PRF output from the passkey) */
export async function passkeySupport(): Promise<{ available: boolean; detail: string }> {
  if (typeof globalThis.PublicKeyCredential !== 'function') return { available: false, detail: 'no WebAuthn' };
  try {
    const platform = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    const caps = (PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> }).getClientCapabilities;
    const prf = caps ? (await caps.call(PublicKeyCredential))['extension:prf'] : undefined;
    if (prf === false) return { available: false, detail: 'this browser has no PRF extension' };
    return { available: platform, detail: platform ? 'a platform authenticator (Windows Hello / Touch ID) is there' : 'no platform authenticator' };
  } catch (e) {
    return { available: false, detail: (e as Error).message };
  }
}

// ---- the wrap ------------------------------------------------------------------------------------------

function aadFor(r: Pick<KeyRecord, 'kind' | 'alg' | 'pub'> & { credId?: Uint8Array }): Uint8Array {
  return concat(utf8(`beethoven-keyring/v${RECORD_VERSION}`), new Writer().string(r.kind).string(r.alg).string(r.credId ?? new Uint8Array(0)).string(r.pub).bytes());
}

async function newDeviceKek(): Promise<CryptoKey> {
  return (await subtle().generateKey({ name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey'])) as CryptoKey;
}

async function kekFromPrf(prf: Uint8Array, kdfSalt: Uint8Array): Promise<CryptoKey> {
  const ikm = await subtle().importKey('raw', ab(prf), 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: ab(kdfSalt), info: ab(HKDF_INFO) }, ikm, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

async function wrapUnder(kek: CryptoKey, priv: CryptoKey, meta: Pick<KeyRecord, 'kind' | 'alg' | 'pub'> & { credId?: Uint8Array }): Promise<{ iv: Uint8Array; wrapped: Uint8Array }> {
  const iv = rand(12);
  const wrapped = new Uint8Array(await subtle().wrapKey('pkcs8', priv, kek, { name: 'AES-GCM', iv: ab(iv), additionalData: ab(aadFor(meta)) }));
  return { iv, wrapped };
}

async function unwrapFrom(kek: CryptoKey, r: KeyRecord, extractable: boolean): Promise<CryptoKey> {
  try {
    return await subtle().unwrapKey('pkcs8', ab(r.wrapped), kek, { name: 'AES-GCM', iv: ab(r.iv), additionalData: ab(aadFor({ kind: r.kind, alg: r.alg, pub: r.pub, ...(r.kind === 'prf' ? { credId: r.credId } : {}) })) }, ALGS[r.alg].imp, extractable, ['sign']);
  } catch {
    throw new KeyringError('wrong-key', 'the stored key did not open (another passkey, or the record was altered)');
  }
}

function checkRecord(r: unknown): r is KeyRecord {
  const x = r as KeyRecord | undefined;
  if (!x || x.v !== RECORD_VERSION || !(x.alg in ALGS) || !x.pub || !x.iv || !x.wrapped) return false;
  if (x.kind === 'device') return !!x.kek;
  if (x.kind === 'prf') return !!x.credId && !!x.prfSalt && !!x.kdfSalt;
  return false;
}

async function preferredAlg(): Promise<KeyAlg> {
  return (await hasEd25519()) ? 'ed25519' : 'ecdsa-p256';
}

async function identityFrom(r: KeyRecord, priv: CryptoKey): Promise<SshIdentity> {
  if (!(await keysMatch(r.alg, priv, r.pub))) throw new KeyringError('wrong-key', 'the stored key does not match its public key');
  return new SshIdentity(r.alg, priv, r.pub);
}

// ---- what the background and the pages call -----------------------------------------------------------

export interface Keyring {
  store: KeyStore;
  unlock: UnlockStore;
}

/** the key's state, without opening it */
export async function keyState(k: Keyring): Promise<KeyState> {
  const r = await k.store.get().catch(() => undefined);
  if (!checkRecord(r)) return { present: false, wrapped: false, locked: false, enrolled: false };
  const id = new SshIdentity(r.alg, undefined as unknown as CryptoKey, r.pub);
  const unlocked = r.kind === 'prf' ? (await k.unlock.get().catch(() => undefined))?.cred === base64(r.credId) : true;
  return {
    present: true,
    wrapped: r.kind === 'prf',
    locked: r.kind === 'prf' && !unlocked,
    alg: r.alg,
    keyType: id.keyType,
    fingerprint: await id.fingerprint(),
    enrolled: !!r.enrolled_at,
    ...(r.enrolled_at ? { enrolledAt: r.enrolled_at } : {}),
    ...(r.account ? { account: r.account } : {}),
    created: r.created,
  };
}

/** the default key (no biometric step), made when there is none; the existing one otherwise */
export async function ensureKey(k: Keyring, o: { alg?: KeyAlg } = {}): Promise<SshIdentity> {
  const cur = await k.store.get().catch(() => undefined);
  if (checkRecord(cur)) return loadIdentity(k);
  const alg = o.alg ?? (await preferredAlg());
  const pair = await generateKeyPair(alg, true); // extractable only to be wrapped, once, here
  const pub = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
  const kek = await newDeviceKek();
  const meta = { kind: 'device' as const, alg, pub };
  const { iv, wrapped } = await wrapUnder(kek, pair.privateKey, meta);
  const record: DeviceRecord = { v: RECORD_VERSION, ...meta, kek, iv, wrapped, created: new Date().toISOString() };
  await k.store.put(record);
  // what signs from here on is the non-extractable copy, which also proves the stored blob opens
  return identityFrom(record, await unwrapFrom(kek, record, false));
}

/** the identity that signs: a non-extractable key, in memory. Throws KeyringError "locked" when protected and not unlocked this session */
export async function loadIdentity(k: Keyring): Promise<SshIdentity> {
  const r = await k.store.get();
  if (!checkRecord(r)) throw new KeyringError('no-key', 'no key on this computer');
  if (r.kind === 'device') return identityFrom(r, await unwrapFrom(r.kek, r, false));
  const u = await k.unlock.get().catch(() => undefined);
  if (!u || u.cred !== base64(r.credId)) throw new KeyringError('locked', 'the protected key is not unlocked this browser session');
  return identityFrom(r, await unwrapFrom(await kekFromPrf(unbase64(u.secret), r.kdfSalt), r, false));
}

/** after the grid took the key: when and for whom */
export async function markEnrolled(k: Keyring, account: string, at = new Date().toISOString()): Promise<void> {
  const r = await k.store.get();
  if (!checkRecord(r)) throw new KeyringError('no-key', 'no key on this computer');
  await k.store.put({ ...r, enrolled_at: at, account });
}

/** a passkey and its PRF output (one prompt when the authenticator evaluates PRF at creation, two when not) */
async function newPasskey(api: PasskeyApi, userName: string): Promise<{ credId: Uint8Array; prfSalt: Uint8Array; prf: Uint8Array; prompts: number }> {
  const prfSalt = rand(32);
  const pk = await api.create({ prfSalt, userName });
  if (!pk.prfEnabled) throw new KeyringError('no-prf', 'this passkey provider cannot protect a key (no PRF)');
  let prf = pk.prfFirst;
  let prompts = 1;
  if (!prf) {
    prf = await api.get({ credId: pk.credId, prfSalt });
    prompts = 2;
  }
  if (prf.length !== 32) throw new KeyringError('no-prf', 'the passkey gave a PRF output of the wrong size');
  return { credId: pk.credId, prfSalt, prf, prompts };
}

/**
 * OPT-IN, in a page, inside the click: the first key, made protected (the student ticked the switch
 * before the first sign-in). Refuses when a key already exists (protectKey moves an existing one).
 */
export async function createProtectedKey(k: Keyring, api: PasskeyApi, o: { userName?: string; alg?: KeyAlg } = {}): Promise<{ identity: SshIdentity; prompts: number }> {
  if (checkRecord(await k.store.get().catch(() => undefined))) throw new KeyringError('already', 'a key is already on this computer');
  const pk = await newPasskey(api, o.userName ?? 'beethoven');
  const alg = o.alg ?? (await preferredAlg());
  const pair = await generateKeyPair(alg, true);
  const pub = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
  const kdfSalt = rand(32);
  const meta = { kind: 'prf' as const, alg, pub, credId: pk.credId };
  const { iv, wrapped } = await wrapUnder(await kekFromPrf(pk.prf, kdfSalt), pair.privateKey, meta);
  const record: PasskeyRecord = { v: RECORD_VERSION, ...meta, prfSalt: pk.prfSalt, kdfSalt, iv, wrapped, created: new Date().toISOString() };
  await k.store.put(record);
  await k.unlock.set({ secret: base64(pk.prf), cred: base64(pk.credId) });
  pk.prf.fill(0);
  return { identity: await loadIdentity(k), prompts: pk.prompts };
}

/**
 * OPT-IN, in a page, inside the click: protect the key this computer already has. The SAME key is
 * re-wrapped under the passkey (nothing changes on the grid); the browser key that wrapped it is dropped.
 */
export async function protectKey(k: Keyring, api: PasskeyApi, o: { userName?: string } = {}): Promise<{ prompts: number }> {
  const r = await k.store.get();
  if (!checkRecord(r)) throw new KeyringError('no-key', 'no key on this computer');
  if (r.kind === 'prf') throw new KeyringError('already', 'the key is already protected');
  const pk = await newPasskey(api, o.userName ?? r.account ?? 'beethoven');
  const kdfSalt = rand(32);
  // in memory only, for the moment of re-wrapping: the clear key is never written anywhere
  const extractable = await unwrapFrom(r.kek, r, true);
  const meta = { kind: 'prf' as const, alg: r.alg, pub: r.pub, credId: pk.credId };
  const { iv, wrapped } = await wrapUnder(await kekFromPrf(pk.prf, kdfSalt), extractable, meta);
  const next: PasskeyRecord = { v: RECORD_VERSION, ...meta, prfSalt: pk.prfSalt, kdfSalt, iv, wrapped, created: r.created, ...(r.enrolled_at ? { enrolled_at: r.enrolled_at } : {}), ...(r.account ? { account: r.account } : {}) };
  // the new wrap must open before the old one goes
  await identityFrom(next, await unwrapFrom(await kekFromPrf(pk.prf, kdfSalt), next, false));
  await k.store.put(next);
  await k.unlock.set({ secret: base64(pk.prf), cred: base64(pk.credId) });
  pk.prf.fill(0);
  return { prompts: pk.prompts };
}

/** in a page, inside the click: turn the protection off. One prompt; the same key goes back under a browser key */
export async function unprotectKey(k: Keyring, api: PasskeyApi): Promise<void> {
  const r = await k.store.get();
  if (!checkRecord(r)) throw new KeyringError('no-key', 'no key on this computer');
  if (r.kind === 'device') return;
  const prf = await api.get({ credId: r.credId, prfSalt: r.prfSalt });
  const extractable = await unwrapFrom(await kekFromPrf(prf, r.kdfSalt), r, true);
  prf.fill(0);
  const kek = await newDeviceKek();
  const meta = { kind: 'device' as const, alg: r.alg, pub: r.pub };
  const { iv, wrapped } = await wrapUnder(kek, extractable, meta);
  const next: DeviceRecord = { v: RECORD_VERSION, ...meta, kek, iv, wrapped, created: r.created, ...(r.enrolled_at ? { enrolled_at: r.enrolled_at } : {}), ...(r.account ? { account: r.account } : {}) };
  await identityFrom(next, await unwrapFrom(kek, next, false));
  await k.store.put(next);
  await k.unlock.remove();
  await signalUnknown(r.credId);
}

/** in a page, inside the click on "Unlock": once per browser session */
export async function unlockKey(k: Keyring, api: PasskeyApi): Promise<void> {
  const r = await k.store.get();
  if (!checkRecord(r)) throw new KeyringError('no-key', 'no key on this computer');
  if (r.kind === 'device') return;
  const prf = await api.get({ credId: r.credId, prfSalt: r.prfSalt });
  // proves it opens before anything is kept
  await identityFrom(r, await unwrapFrom(await kekFromPrf(prf, r.kdfSalt), r, false));
  await k.unlock.set({ secret: base64(prf), cred: base64(r.credId) });
  prf.fill(0);
}

/** "Forget this computer" (this side): the key and this session's unlock go; the passkey provider is told the passkey is unused */
export async function forgetKey(k: Keyring): Promise<void> {
  const r = await k.store.get().catch(() => undefined);
  await k.store.delete();
  await k.unlock.remove().catch(() => undefined);
  if (checkRecord(r) && r.kind === 'prf') await signalUnknown(r.credId);
}

async function signalUnknown(credId: Uint8Array): Promise<void> {
  try {
    const pk = globalThis.PublicKeyCredential as unknown as { signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void> } | undefined;
    const rpId = (globalThis as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime?.id;
    if (pk?.signalUnknownCredential && rpId) await pk.signalUnknownCredential({ rpId, credentialId: base64(credId).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') });
  } catch {
    /* best effort */
  }
}
