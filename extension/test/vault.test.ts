// The saved grid sign-in (core/vault.ts, 19.0.0): the passkey made and unlocked against a stand-in
// authenticator (test/fakeauthenticator.ts) in each of the ways a real one answers PRF, the password sealed
// and opened, and the two places the record lives. What a real Windows Hello or Touch ID does with an
// extension's passkey is not yet measured; these hold the module to what the WebAuthn spec and Chromium say.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  base64,
  base64url,
  browserPasskeys,
  browserStatics,
  indexedDbRecords,
  isSigninRecord,
  makePasskey,
  memoryRecords,
  openPassword,
  passkeySupport,
  sealPassword,
  SIGNIN_DB,
  SIGNIN_RECORD_ID,
  SIGNIN_STORE,
  unbase64,
  unbase64url,
  unlockPasskey,
  VaultError,
  type PasskeyApi,
  type PasskeyStatics,
  type SigninRecord,
} from '../src/core/vault';
import { fakeAuthenticator, prfBase64, type FakeAuthenticator } from './fakeauthenticator';

const ORIGIN = 'https://ondemand.grid.wayne.edu';
const USER = 'st1234';
const PASSWORD = 'Correct-Horse-7!';

const err = async (p: Promise<unknown>): Promise<VaultError> => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(VaultError);
    return e as VaultError;
  }
  throw new Error('expected a VaultError');
};

const createOptions = (fa: FakeAuthenticator, i = 0) => (fa.calls.filter((c) => c.kind === 'create')[i]!.options as CredentialCreationOptions);
const getOptions = (fa: FakeAuthenticator, i = 0) => (fa.calls.filter((c) => c.kind === 'get')[i]!.options as CredentialRequestOptions);
const asBytes = (x: unknown) => new Uint8Array(x instanceof ArrayBuffer ? x : (x as ArrayBufferView).buffer);

/** a PasskeyApi whose answers pass through `edit` first (an authenticator that misbehaves in one way) */
function edited(fa: FakeAuthenticator, edit: { create?: (c: any) => any; get?: (c: any) => any }): PasskeyApi {
  return {
    create: async (o) => (edit.create ?? ((c) => c))(await fa.create(o)),
    get: async (o) => (edit.get ?? ((c) => c))(await fa.get(o)),
  };
}

async function saved(fa = fakeAuthenticator()) {
  const pk = await makePasskey(fa, { origin: ORIGIN, username: USER });
  const rec = await sealPassword(pk.prf, { origin: ORIGIN, username: USER, cred: pk.cred, prfSalt: pk.prfSalt, password: PASSWORD, savedAt: '2026-10-09T04:00:00.000Z' });
  return { fa, pk, rec };
}

describe('making the passkey', () => {
  it('asks exactly as the contract says, and one prompt is enough when the output comes at creation', async () => {
    const fa = fakeAuthenticator({ prf: 'create' });
    const signal = new AbortController().signal;
    const pk = await makePasskey(fa, { origin: ORIGIN, username: USER, signal });
    expect([fa.creates, fa.gets]).toEqual([1, 0]);
    const o = createOptions(fa);
    expect(o.signal).toBe(signal);
    const p = o.publicKey!;
    expect(p.rp).toEqual({ name: 'Beethoven' });
    expect(p.user.name).toBe('st1234 (grid)');
    expect(p.user.displayName).toBe('Beethoven grid sign-in');
    expect(p.pubKeyCredParams.map((x) => x.alg)).toEqual([-7, -8, -257]);
    expect(p.authenticatorSelection).toEqual({ authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' });
    expect(p.attestation).toBe('none');
    expect(p.timeout).toBe(60_000);
    expect(asBytes(p.challenge).length).toBe(32);
    expect(base64(asBytes(p.extensions!.prf!.eval!.first))).toBe(pk.prfSalt);
    expect(unbase64(pk.prfSalt).length).toBe(32);
    // the passkey it made, and the output that passkey gives for that salt
    expect(fa.passkeys().map((x) => x.cred)).toEqual([pk.cred]);
    expect(pk.prf.length).toBe(32);
    expect(base64(pk.prf)).toBe(await prfBase64(fa, pk.cred, pk.prfSalt));
    expect(fa.log).toEqual(['webauthn.create -> ok']);
  });

  it('a timeout given is passed on', async () => {
    const fa = fakeAuthenticator({ prf: 'get' });
    await makePasskey(fa, { origin: ORIGIN, username: USER, timeout: 30_000 });
    expect(createOptions(fa).publicKey!.timeout).toBe(30_000);
    expect(getOptions(fa).publicKey!.timeout).toBe(30_000);
  });

  it('two prompts when the authenticator only says it can: one get() for that passkey and the same salt', async () => {
    const fa = fakeAuthenticator({ prf: 'get' });
    const signal = new AbortController().signal;
    const pk = await makePasskey(fa, { origin: ORIGIN, username: USER, signal });
    expect([fa.creates, fa.gets]).toEqual([1, 1]);
    const g = getOptions(fa);
    expect(g.signal).toBe(signal);
    expect(g.publicKey!.userVerification).toBe('required');
    expect(g.publicKey!.allowCredentials!.map((d) => base64url(asBytes(d.id)))).toEqual([pk.cred]);
    expect(base64(asBytes(g.publicKey!.extensions!.prf!.eval!.first))).toBe(pk.prfSalt);
    expect(base64(pk.prf)).toBe(await prfBase64(fa, pk.cred, pk.prfSalt));
  });

  it('a passkey that says it has no PRF stops at once: no-prf after exactly one prompt, carrying the passkey it made', async () => {
    const fa = fakeAuthenticator({ prf: 'disabled' });
    const e = await err(makePasskey(fa, { origin: ORIGIN, username: USER }));
    expect(e.code).toBe('no-prf');
    expect(fa.ceremonies).toBe(1);
    expect(e.cred).toBe(fa.passkeys()[0]!.cred);
  });

  it('an answer that says nothing about PRF gets one get(), and no output there is no-prf after two prompts', async () => {
    const fa = fakeAuthenticator({ prf: 'none' });
    const e = await err(makePasskey(fa, { origin: ORIGIN, username: USER }));
    expect(e.code).toBe('no-prf');
    expect([fa.creates, fa.gets]).toEqual([1, 1]);
    expect(e.cred).toBe(fa.passkeys()[0]!.cred);
  });

  it('an output of the wrong size is no PRF', async () => {
    const fa = fakeAuthenticator({ prf: 'create' });
    const short = edited(fa, { create: (c) => ({ ...c, response: c.response, getClientExtensionResults: () => ({ prf: { enabled: true, results: { first: new ArrayBuffer(16) } } }) }) });
    expect((await err(makePasskey(short, { origin: ORIGIN, username: USER }))).code).toBe('no-prf');
    expect(fa.gets).toBe(0);
  });

  it('a cancelled or timed-out prompt is not-allowed, and names no passkey when none was made', async () => {
    for (const answer of ['cancel', 'timeout'] as const) {
      const fa = fakeAuthenticator({ answer });
      const e = await err(makePasskey(fa, { origin: ORIGIN, username: USER }));
      expect(e.code, answer).toBe('not-allowed');
      expect('cred' in e, answer).toBe(false);
      expect(fa.passkeys(), answer).toEqual([]);
      expect(fa.log, answer).toEqual([`webauthn.create -> ${answer}`]);
    }
  });

  it('the second prompt cancelled is not-allowed too, and names the passkey the first one made', async () => {
    const fa = fakeAuthenticator({ prf: 'get', queue: ['approve', 'cancel'] });
    const e = await err(makePasskey(fa, { origin: ORIGIN, username: USER }));
    expect(e.code).toBe('not-allowed');
    expect(e.cred).toBe(fa.passkeys()[0]!.cred);
  });

  it('the page closing aborts the prompt (not-allowed); an aborted signal never prompts at all', async () => {
    const fa = fakeAuthenticator({ answer: 'hang' });
    const ac = new AbortController();
    const p = makePasskey(fa, { origin: ORIGIN, username: USER, signal: ac.signal });
    setTimeout(() => ac.abort(), 5);
    expect((await err(p)).code).toBe('not-allowed');
    const fb = fakeAuthenticator();
    expect((await err(makePasskey(fb, { origin: ORIGIN, username: USER, signal: AbortSignal.abort() }))).code).toBe('not-allowed');
    expect(fb.passkeys()).toEqual([]);
    expect(fb.log).toEqual(['webauthn.create -> aborted']);
  });

  it('no user verification is no-uv, whether at create() or at the get() after it', async () => {
    const fa = fakeAuthenticator({ uv: false });
    const e = await err(makePasskey(fa, { origin: ORIGIN, username: USER }));
    expect(e.code).toBe('no-uv');
    expect(e.cred).toBe(fa.passkeys()[0]!.cred);
    expect(fa.ceremonies).toBe(1);
    const fb = fakeAuthenticator({ prf: 'get' });
    const late = edited(fb, { create: (c) => ((fb.options.uv = false), c) });
    const e2 = await err(makePasskey(late, { origin: ORIGIN, username: USER }));
    expect(e2.code).toBe('no-uv');
    expect(e2.cred).toBe(fb.passkeys()[0]!.cred);
  });

  it('reads verification from the authenticator data only, not from anything else in the answer', async () => {
    const fa = fakeAuthenticator();
    // the attestation object still says verified; the data the browser hands back says not
    const noData = edited(fa, { create: (c) => ({ ...c, response: { attestationObject: c.response.attestationObject, clientDataJSON: c.response.clientDataJSON } }) });
    expect((await err(makePasskey(noData, { origin: ORIGIN, username: USER }))).code).toBe('no-uv');
    const short = edited(fa, { create: (c) => ({ ...c, response: { ...c.response, getAuthenticatorData: () => new ArrayBuffer(32) } }) });
    expect((await err(makePasskey(short, { origin: ORIGIN, username: USER }))).code).toBe('no-uv');
  });

  it('maps the browser\'s errors by name: a cancel, an abort and a timeout are not-allowed; no WebAuthn here is no-webauthn', async () => {
    const cases: Array<[unknown, string]> = [
      [new DOMException('x', 'NotAllowedError'), 'not-allowed'],
      [new DOMException('x', 'AbortError'), 'not-allowed'],
      [new DOMException('x', 'TimeoutError'), 'not-allowed'],
      ['pagehide', 'not-allowed'],
      [new DOMException('x', 'NotSupportedError'), 'no-webauthn'],
      [new DOMException('x', 'SecurityError'), 'no-webauthn'],
      [new TypeError('x'), 'no-webauthn'],
    ];
    for (const [thrown, code] of cases) {
      const api: PasskeyApi = { create: () => Promise.reject(thrown), get: () => Promise.reject(thrown) };
      const e = await err(makePasskey(api, { origin: ORIGIN, username: USER }));
      expect(e.code, String((thrown as Error).name ?? thrown)).toBe(code);
      expect(e.message).not.toContain(PASSWORD);
      expect((await err(unlockPasskey(api, { cred: 'AAAA', prfSalt: 'AAAA' }))).code).toBe(code);
    }
  });

  it('the user handle is the same for one account at one grid, so saving again replaces the earlier passkey', async () => {
    const fa = fakeAuthenticator();
    const id = (i: number) => base64url(asBytes(createOptions(fa, i).publicKey!.user.id));
    const want = createHash('sha256').update(`beethoven-grid|${ORIGIN}|${USER}`, 'utf8').digest().subarray(0, 16).toString('base64url');
    const a = await makePasskey(fa, { origin: ORIGIN, username: USER });
    const b = await makePasskey(fa, { origin: ORIGIN, username: USER });
    expect(id(0)).toBe(want);
    expect(id(1)).toBe(want);
    expect(a.cred).not.toBe(b.cred);
    expect(fa.passkeys().map((p) => p.cred)).toEqual([b.cred]);
    await makePasskey(fa, { origin: ORIGIN, username: 'ab9876' });
    await makePasskey(fa, { origin: 'https://ondemand.example.edu', username: USER });
    expect(new Set([id(1), id(2), id(3)]).size).toBe(3);
    expect(fa.passkeys().map((p) => p.userName)).toEqual(['st1234 (grid)', 'ab9876 (grid)', 'st1234 (grid)']);
  });

  it('no WebAuthn here, by the browser\'s error names; an empty answer is no passkey', async () => {
    for (const name of ['NotSupportedError', 'SecurityError']) {
      const api: PasskeyApi = { create: async () => Promise.reject(new DOMException('x', name)), get: async () => null };
      expect((await err(makePasskey(api, { origin: ORIGIN, username: USER }))).code, name).toBe('no-webauthn');
    }
    const empty: PasskeyApi = { create: async () => null, get: async () => null };
    expect((await err(makePasskey(empty, { origin: ORIGIN, username: USER }))).code).toBe('no-webauthn');
    // an rp.id that is not the extension's own is the browser's SecurityError
    const fa = fakeAuthenticator();
    const withRp: PasskeyApi = { create: (o) => fa.create({ ...o, publicKey: { ...o.publicKey!, rp: { name: 'Beethoven', id: 'chrome-extension://ext' } } }), get: fa.get };
    expect((await err(makePasskey(withRp, { origin: ORIGIN, username: USER }))).code).toBe('no-webauthn');
  });
});

describe('unlocking it', () => {
  it('gives the same output as at creation, with one prompt for that passkey', async () => {
    const fa = fakeAuthenticator({ prf: 'create' });
    const pk = await makePasskey(fa, { origin: ORIGIN, username: USER });
    const ac = new AbortController();
    const prf = await unlockPasskey(fa, { cred: pk.cred, prfSalt: pk.prfSalt, signal: ac.signal });
    expect(base64(prf)).toBe(base64(pk.prf));
    expect([fa.creates, fa.gets]).toEqual([1, 1]);
    const g = getOptions(fa).publicKey!;
    expect(getOptions(fa).signal).toBe(ac.signal);
    expect(g.allowCredentials!.map((d) => base64url(asBytes(d.id)))).toEqual([pk.cred]);
    expect(g.userVerification).toBe('required');
    expect(g.timeout).toBe(60_000);
  });

  it('refuses a cancelled prompt, a deleted passkey and a stranger\'s authenticator (not-allowed), none naming the saved passkey', async () => {
    const fa = fakeAuthenticator();
    const pk = await makePasskey(fa, { origin: ORIGIN, username: USER });
    fa.options.queue.push('cancel');
    const cancelled = await err(unlockPasskey(fa, pk));
    expect(cancelled.code).toBe('not-allowed');
    expect('cred' in cancelled).toBe(false);
    const stranger = fakeAuthenticator({ seed: 'another' });
    expect((await err(unlockPasskey(stranger, pk))).code).toBe('not-allowed');
    expect(fa.remove(pk.cred)).toBe(true);
    expect((await err(unlockPasskey(fa, pk))).code).toBe('not-allowed');
    expect(fa.log.at(-1)).toBe('webauthn.get -> no passkey');
  });

  it('refuses an answer without verification (no-uv), without an output (no-prf), or from another passkey (mismatch)', async () => {
    const fa = fakeAuthenticator();
    const pk = await makePasskey(fa, { origin: ORIGIN, username: USER });
    fa.options.uv = false;
    const noUv = await err(unlockPasskey(fa, pk));
    expect(noUv.code).toBe('no-uv');
    expect('cred' in noUv).toBe(false);
    fa.options.uv = true;
    const bare = edited(fa, { get: (c) => ({ ...c, response: c.response, getClientExtensionResults: () => ({}) }) });
    expect((await err(unlockPasskey(bare, pk))).code).toBe('no-prf');
    const other = edited(fa, { get: (c) => ({ ...c, response: c.response, getClientExtensionResults: c.getClientExtensionResults, rawId: new Uint8Array(16).buffer }) });
    expect((await err(unlockPasskey(other, pk))).code).toBe('mismatch');
  });

  it('a record that names no passkey is corrupt, with no prompt at all', async () => {
    const fa = fakeAuthenticator();
    expect((await err(unlockPasskey(fa, { cred: 'not base64url!', prfSalt: base64(new Uint8Array(32)) }))).code).toBe('corrupt');
    expect((await err(unlockPasskey(fa, { cred: 'AAAA', prfSalt: '' }))).code).toBe('corrupt');
    expect((await err(unlockPasskey(fa, { cred: 'AAAA', prfSalt: 'A===' }))).code).toBe('corrupt');
    expect(fa.ceremonies).toBe(0);
  });
});

describe('the seal', () => {
  it('opens to the AccessID and password it was saved with, for that grid and account', async () => {
    const { pk, rec } = await saved();
    expect(isSigninRecord(rec)).toBe(true);
    expect(rec).toMatchObject({ v: 1, origin: ORIGIN, username: USER, cred: pk.cred, prfSalt: pk.prfSalt, saved_at: '2026-10-09T04:00:00.000Z' });
    expect(unbase64(rec.iv).length).toBe(12);
    expect(unbase64(rec.hkdfSalt).length).toBe(32);
    expect(unbase64(rec.ct).length).toBe(new TextEncoder().encode(PASSWORD).length + 16);
    expect(await openPassword(pk.prf, rec, { origin: ORIGIN, username: USER })).toEqual({ username: USER, password: PASSWORD });
    // the background knows the grid, not the account: the record names it
    expect(await openPassword(pk.prf, rec, { origin: ORIGIN })).toEqual({ username: USER, password: PASSWORD });
    // and it survives the trip into IndexedDB and back
    expect(await openPassword(pk.prf, structuredClone(rec), { origin: ORIGIN })).toEqual({ username: USER, password: PASSWORD });
  });

  it('holds only ciphertext: neither the password, nor the passkey\'s output, in any form, and every field a string', async () => {
    const { pk, rec } = await saved();
    const text = JSON.stringify(rec);
    const pw = Buffer.from(PASSWORD, 'utf8');
    const prf = Buffer.from(pk.prf);
    for (const s of [PASSWORD, pw.toString('base64'), pw.toString('base64url'), pw.toString('hex'), prf.toString('base64'), prf.toString('base64url'), prf.toString('hex')]) expect(text).not.toContain(s);
    expect(Object.values(rec).every((v) => typeof v === 'string' || v === 1)).toBe(true);
  });

  it('a fresh IV and HKDF salt every time, so the same password seals differently and both open', async () => {
    const { pk, rec } = await saved();
    const again = await sealPassword(pk.prf, { origin: ORIGIN, username: USER, cred: pk.cred, prfSalt: pk.prfSalt, password: PASSWORD, savedAt: rec.saved_at });
    expect(again.iv).not.toBe(rec.iv);
    expect(again.hkdfSalt).not.toBe(rec.hkdfSalt);
    expect(again.ct).not.toBe(rec.ct);
    expect((await openPassword(pk.prf, again, { origin: ORIGIN })).password).toBe(PASSWORD);
    expect((await openPassword(pk.prf, rec, { origin: ORIGIN })).password).toBe(PASSWORD);
  });

  it('any password the student can type survives the round trip', async () => {
    const { pk } = await saved();
    for (const password of ['pässwörd ß 🔑', ' leading and trailing ', 'x'.repeat(200)]) {
      const rec = await sealPassword(pk.prf, { origin: ORIGIN, username: USER, cred: pk.cred, prfSalt: pk.prfSalt, password, savedAt: 'now' });
      expect((await openPassword(pk.prf, rec, { origin: ORIGIN, username: USER })).password).toBe(password);
    }
  });

  it('opens for no other grid and no other account (mismatch)', async () => {
    const { pk, rec } = await saved();
    expect((await err(openPassword(pk.prf, rec, { origin: 'https://ondemand.example.edu' }))).code).toBe('mismatch');
    expect((await err(openPassword(pk.prf, rec, { origin: ORIGIN, username: 'ab9876' }))).code).toBe('mismatch');
  });

  it('anything altered does not open (corrupt): the ciphertext, the IV, the salt, and every field the additional data binds', async () => {
    const { pk, rec } = await saved();
    const flip = (s: string) => {
      const b = unbase64(s);
      b[0]! ^= 0x01;
      return base64(b);
    };
    const cases: Array<[string, SigninRecord, { origin: string; username?: string }]> = [
      ['ct', { ...rec, ct: flip(rec.ct) }, { origin: ORIGIN }],
      ['iv', { ...rec, iv: flip(rec.iv) }, { origin: ORIGIN }],
      ['hkdfSalt', { ...rec, hkdfSalt: flip(rec.hkdfSalt) }, { origin: ORIGIN }],
      ['cred', { ...rec, cred: base64url(new Uint8Array(16)) }, { origin: ORIGIN }],
      ['username', { ...rec, username: 'ab9876' }, { origin: ORIGIN }],
      ['origin', { ...rec, origin: 'https://ondemand.example.edu' }, { origin: 'https://ondemand.example.edu' }],
      ['a short iv', { ...rec, iv: base64(unbase64(rec.iv).subarray(0, 8)) }, { origin: ORIGIN }],
    ];
    for (const [what, r, expect_] of cases) expect((await err(openPassword(pk.prf, r, expect_))).code, what).toBe('corrupt');
  });

  it('another passkey\'s output does not open it (corrupt)', async () => {
    const { rec } = await saved();
    const other = await makePasskey(fakeAuthenticator({ seed: 'another' }), { origin: ORIGIN, username: USER });
    expect((await err(openPassword(other.prf, rec, { origin: ORIGIN }))).code).toBe('corrupt');
  });

  it('a record this version does not read is corrupt, and is not a record', async () => {
    const { pk, rec } = await saved();
    const bad: unknown[] = [{ ...rec, v: 2 }, { ...rec, ct: undefined }, { ...rec, ct: 'not base64!' }, { ...rec, cred: 'a+b/' }, { ...rec, iv: '' }, null, 'grid'];
    for (const r of bad) {
      expect(isSigninRecord(r)).toBe(false);
      expect((await err(openPassword(pk.prf, r as SigninRecord, { origin: ORIGIN }))).code).toBe('corrupt');
    }
  });

  it('seals only with a 32-byte output (no-prf otherwise)', async () => {
    const e = await err(sealPassword(new Uint8Array(16), { origin: ORIGIN, username: USER, cred: 'AAAA', prfSalt: 'AAAA', password: PASSWORD, savedAt: 'now' }));
    expect(e.code).toBe('no-prf');
  });

  describe('the keys', () => {
    afterEach(() => vi.restoreAllMocks());

    it('nothing is extractable: the PRF is imported and the AES key derived non-extractable, each for its one use, and the record is opened before it is handed back', async () => {
      const { pk } = await saved();
      const s = globalThis.crypto.subtle;
      const imported = vi.spyOn(s, 'importKey');
      const derived = vi.spyOn(s, 'deriveKey');
      const decrypted = vi.spyOn(s, 'decrypt');
      const rec = await sealPassword(pk.prf, { origin: ORIGIN, username: USER, cred: pk.cred, prfSalt: pk.prfSalt, password: PASSWORD, savedAt: 'now' });
      // the seal derives a key to encrypt, then derives it again to open what it made
      expect(derived.mock.calls.map((c) => c[4])).toEqual([['encrypt'], ['decrypt']]);
      expect(decrypted).toHaveBeenCalledTimes(1);
      await openPassword(pk.prf, rec, { origin: ORIGIN });
      expect(derived.mock.calls.map((c) => c[4])).toEqual([['encrypt'], ['decrypt'], ['decrypt']]);
      for (const c of imported.mock.calls) {
        expect(c[0]).toBe('raw');
        expect(c[3]).toBe(false);
      }
      for (const c of derived.mock.calls) {
        expect(c[0]).toMatchObject({ name: 'HKDF', hash: 'SHA-256' });
        expect(new TextDecoder().decode(asBytes((c[0] as HkdfParams).info))).toBe('Beethoven grid sign-in v1');
        expect(c[2]).toEqual({ name: 'AES-GCM', length: 256 });
        expect(c[3]).toBe(false);
      }
      for (const r of derived.mock.results) {
        const key = (await r.value) as CryptoKey;
        expect(key.extractable).toBe(false);
        await expect(s.exportKey('raw', key)).rejects.toThrow();
      }
    });
  });
});

/**
 * Enough of IndexedDB to hold the vault to it: databases by name and version, object stores, transactions
 * that honour their mode, requests that answer later, and structured clone on the way in and out. A knob
 * makes the next transaction fail; it counts the connections it opened and closed.
 */
function standInIndexedDB() {
  const dbs = new Map<string, { version: number; stores: Map<string, Map<unknown, unknown>> }>();
  const counts = { opened: 0, closed: 0, modes: [] as string[] };
  const knobs = { failNext: false };
  const later = (f: () => void) => setTimeout(f, 0);
  const factory = {
    open(name: string, version = 1) {
      const req: any = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      later(() => {
        let db = dbs.get(name);
        const upgrade = !db || db.version < version;
        if (!db) dbs.set(name, (db = { version, stores: new Map() }));
        db.version = Math.max(db.version, version);
        const d = db;
        counts.opened++;
        let closed = false;
        req.result = {
          name,
          objectStoreNames: { contains: (n: string) => d.stores.has(n) },
          createObjectStore(n: string) {
            if (d.stores.has(n)) throw new DOMException(`${n} exists`, 'ConstraintError');
            d.stores.set(n, new Map());
          },
          transaction(n: string, mode: IDBTransactionMode = 'readonly') {
            if (closed) throw new DOMException('closed', 'InvalidStateError');
            const st = d.stores.get(n);
            if (!st) throw new DOMException(`no store ${n}`, 'NotFoundError');
            counts.modes.push(mode);
            const fail = knobs.failNext;
            knobs.failNext = false;
            const tx: any = { mode, error: null, oncomplete: null, onerror: null, onabort: null };
            const request = (f: () => unknown) => {
              const r: any = { result: undefined, error: null, onsuccess: null };
              later(() => {
                if (fail) {
                  tx.error = new DOMException('the disk is full', 'QuotaExceededError');
                  tx.onerror?.();
                  tx.onabort?.();
                  return;
                }
                r.result = f();
                r.onsuccess?.();
                later(() => tx.oncomplete?.());
              });
              return r;
            };
            const writable = () => {
              if (mode !== 'readwrite') throw new DOMException('read-only transaction', 'ReadOnlyError');
            };
            tx.objectStore = (s: string) => {
              if (s !== n) throw new DOMException(`not in this transaction: ${s}`, 'NotFoundError');
              return {
                get: (k: unknown) => request(() => structuredClone(st.get(k))),
                put: (v: unknown, k: unknown) => (writable(), request(() => (st.set(k, structuredClone(v)), k))),
                delete: (k: unknown) => (writable(), request(() => (st.delete(k), undefined))),
              };
            };
            return tx;
          },
          close() {
            if (!closed) counts.closed++;
            closed = true;
          },
        };
        if (upgrade) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
  return { factory: factory as unknown as IDBFactory, dbs, counts, knobs };
}

describe('where the record lives', () => {
  const sample = async (): Promise<SigninRecord> => (await saved()).rec;

  it('in memory: a copy goes in and a copy comes out; delete removes it', async () => {
    const m = memoryRecords();
    expect(await m.get()).toBeUndefined();
    const rec = await sample();
    await m.put(rec);
    rec.username = 'changed after';
    const got = (await m.get())!;
    expect(got.username).toBe(USER);
    got.ct = 'AAAA';
    expect((await m.get())!.ct).not.toBe('AAAA');
    await m.delete();
    expect(await m.get()).toBeUndefined();
  });

  it('in IndexedDB: database beethoven-signin, store records, key grid; reads read-only, writes read-write, every connection closed', async () => {
    const idb = standInIndexedDB();
    const store = indexedDbRecords(idb.factory);
    expect(await store.get()).toBeUndefined();
    expect([...idb.dbs.keys()]).toEqual([SIGNIN_DB]);
    expect(SIGNIN_DB).toBe('beethoven-signin');
    expect([...idb.dbs.get(SIGNIN_DB)!.stores.keys()]).toEqual([SIGNIN_STORE]);
    const rec = await sample();
    await store.put(rec);
    expect([...idb.dbs.get(SIGNIN_DB)!.stores.get(SIGNIN_STORE)!.keys()]).toEqual([SIGNIN_RECORD_ID]);
    expect([SIGNIN_STORE, SIGNIN_RECORD_ID]).toEqual(['records', 'grid']);
    expect(await store.get()).toEqual(rec);
    // a second store over the same database (the background, after the page saved) reads the same record
    expect(await indexedDbRecords(idb.factory).get()).toEqual(rec);
    await store.delete();
    expect(await store.get()).toBeUndefined();
    expect(idb.counts.modes).toEqual(['readonly', 'readwrite', 'readonly', 'readonly', 'readwrite', 'readonly']);
    expect(idb.counts.closed).toBe(idb.counts.opened);
  });

  it('a value it cannot read is no record; a failed transaction rejects and still closes the connection', async () => {
    const idb = standInIndexedDB();
    const store = indexedDbRecords(idb.factory);
    await store.put(await sample());
    idb.dbs.get(SIGNIN_DB)!.stores.get(SIGNIN_STORE)!.set(SIGNIN_RECORD_ID, { v: 9, anything: 'else' });
    expect(await store.get()).toBeUndefined();
    idb.knobs.failNext = true;
    await expect(store.put(await sample())).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(idb.counts.closed).toBe(idb.counts.opened);
  });

  it('uses the page\'s own IndexedDB when given none, looked up at each call', async () => {
    const g = globalThis as { indexedDB?: IDBFactory };
    const before = g.indexedDB;
    const store = indexedDbRecords();
    const idb = standInIndexedDB();
    try {
      g.indexedDB = idb.factory;
      const rec = await sample();
      await store.put(rec);
      expect(await store.get()).toEqual(rec);
      expect(idb.dbs.has(SIGNIN_DB)).toBe(true);
      // where there is none at all, nothing can have been kept there: nothing to find, nothing to delete
      delete g.indexedDB;
      expect(await store.get()).toBeUndefined();
      await expect(store.delete()).resolves.toBeUndefined();
      await expect(store.put(rec)).rejects.toThrow(/no IndexedDB/);
    } finally {
      if (before) g.indexedDB = before;
      else delete g.indexedDB;
    }
  });
});

describe('whether this computer can lock a password', () => {
  const api = fakeAuthenticator();
  const statics = (o: { platform?: boolean | Error; caps?: Record<string, boolean> | Error | 'absent' }): PasskeyStatics => {
    const caps = o.caps;
    return {
      uvpaa: async () => {
        if (o.platform instanceof Error) throw o.platform;
        return o.platform ?? true;
      },
      ...(caps === 'absent'
        ? {}
        : {
            caps: async () => {
              if (caps instanceof Error) throw caps;
              return caps ?? {};
            },
          }),
    };
  };

  it('says no without WebAuthn or a platform authenticator, or when the browser says it has no PRF', async () => {
    expect(await passkeySupport(undefined, statics({}))).toBe('no');
    expect(await passkeySupport(api, statics({ platform: false, caps: { 'extension:prf': true } }))).toBe('no');
    expect(await passkeySupport(api, statics({ platform: new Error('x') }))).toBe('no');
    expect(await passkeySupport(api, statics({ caps: { 'extension:prf': false } }))).toBe('no');
  });

  it('says yes only when the browser says it has PRF, and unknown (offered like yes) when it says nothing', async () => {
    expect(await passkeySupport(api, statics({ caps: { 'extension:prf': true } }))).toBe('yes');
    expect(await passkeySupport(api, statics({ caps: {} }))).toBe('unknown');
    expect(await passkeySupport(api, statics({ caps: 'absent' }))).toBe('unknown');
    expect(await passkeySupport(api, statics({ caps: new Error('x') }))).toBe('unknown');
    expect(await passkeySupport(api)).toBe('unknown');
    // the stand-in's own probes
    expect(await passkeySupport(api, api.statics)).toBe('yes');
    expect(await passkeySupport(api, fakeAuthenticator({ capabilities: 'absent' }).statics)).toBe('unknown');
    expect(await passkeySupport(api, fakeAuthenticator({ platform: false }).statics)).toBe('no');
  });
});

describe('the browser\'s own WebAuthn', () => {
  const g = globalThis as { navigator?: unknown; PublicKeyCredential?: unknown };
  const saved_ = { nav: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), pkc: Object.getOwnPropertyDescriptor(globalThis, 'PublicKeyCredential') };
  afterEach(() => {
    for (const [k, d] of [['navigator', saved_.nav], ['PublicKeyCredential', saved_.pkc]] as const) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete (globalThis as Record<string, unknown>)[k];
    }
  });

  it('is absent here, as in the service worker: Node has neither navigator.credentials nor PublicKeyCredential', () => {
    expect(browserPasskeys()).toBeUndefined();
    expect(browserStatics()).toBeUndefined();
  });

  it('calls navigator.credentials on the container itself, and the probes on PublicKeyCredential', async () => {
    const seen: unknown[] = [];
    const container = {
      create(this: unknown, o: unknown) {
        seen.push(['create', this, o]);
        return Promise.resolve(null);
      },
      get(this: unknown, o: unknown) {
        seen.push(['get', this, o]);
        return Promise.resolve(null);
      },
    };
    class PKC {
      static isUserVerifyingPlatformAuthenticatorAvailable(this: unknown) {
        seen.push(['uvpaa', this]);
        return Promise.resolve(true);
      }
      static getClientCapabilities(this: unknown) {
        seen.push(['caps', this]);
        return Promise.resolve({ 'extension:prf': true });
      }
    }
    Object.defineProperty(globalThis, 'navigator', { value: { credentials: container }, configurable: true });
    Object.defineProperty(globalThis, 'PublicKeyCredential', { value: PKC, configurable: true });
    const api = browserPasskeys()!;
    const o = { publicKey: undefined };
    await api.create(o);
    await api.get(o);
    const st = browserStatics()!;
    expect(await passkeySupport(api, st)).toBe('yes');
    expect(seen).toEqual([['create', container, o], ['get', container, o], ['uvpaa', PKC], ['caps', PKC]]);
    // a browser without getClientCapabilities
    Object.defineProperty(globalThis, 'PublicKeyCredential', { value: class { static isUserVerifyingPlatformAuthenticatorAvailable = () => Promise.resolve(true); }, configurable: true });
    expect(browserStatics()!.caps).toBeUndefined();
    // navigator.credentials without PublicKeyCredential is not WebAuthn
    delete g.PublicKeyCredential;
    expect(browserPasskeys()).toBeUndefined();
  });

  it('is touched only inside browserPasskeys and browserStatics: the module reads no browser global when it loads', () => {
    const src = readFileSync(path.join(__dirname, '..', 'src', 'core', 'vault.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const body = (name: string): [number, number] => {
      const start = code.indexOf(`export function ${name}(`);
      expect(start, name).toBeGreaterThan(-1);
      let i = code.indexOf('{', code.indexOf(')', start));
      let depth = 0;
      for (; i < code.length; i++) {
        if (code[i] === '{') depth++;
        else if (code[i] === '}' && --depth === 0) break;
      }
      return [start, i];
    };
    const inside = (at: number, ranges: Array<[number, number]>) => ranges.some(([a, b]) => at >= a && at <= b);
    const webauthn = [...code.matchAll(/\bnavigator\b|\bPublicKeyCredential\b/g)].map((m) => m.index!);
    expect(webauthn.length).toBeGreaterThan(0);
    expect(webauthn.filter((at) => !inside(at, [body('browserPasskeys'), body('browserStatics')]))).toEqual([]);
    // IndexedDB is looked up when a store is used, never when the module loads; no extension API at all
    const idb = [...code.matchAll(/\bindexedDB\b/g)].map((m) => m.index!);
    expect(idb.filter((at) => !inside(at, [body('indexedDbRecords')]))).toEqual([]);
    expect(/\bchrome\.|\bbrowser\.|from 'wxt/.test(code)).toBe(false);
  });
});

describe('bytes and errors', () => {
  it('base64 and base64url round-trip, strictly', () => {
    const b = new Uint8Array(70000).map((_, i) => (i * 7) & 0xff);
    expect(unbase64(base64(b))).toEqual(b);
    expect(unbase64url(base64url(b))).toEqual(b);
    expect(base64(new Uint8Array([0xfb, 0xff]))).toBe('+/8=');
    expect(base64url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    for (const s of ['+/8', ' +/8=', '+/8=\n', '-_8=']) expect(() => unbase64(s), JSON.stringify(s)).toThrow();
    for (const s of ['+/8', 'A', 'a=b']) expect(() => unbase64url(s), JSON.stringify(s)).toThrow();
  });

  it('a VaultError is an Error with its code, and names a passkey only when given one', () => {
    const e = new VaultError('corrupt', 'x');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('VaultError');
    expect(e.code).toBe('corrupt');
    expect('cred' in e).toBe(false);
    expect(new VaultError('no-prf', 'x', 'AAAA')).toMatchObject({ code: 'no-prf', cred: 'AAAA' });
  });
});
