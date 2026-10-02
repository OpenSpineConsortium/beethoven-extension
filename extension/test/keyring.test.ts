// This computer's key (core/keyring.ts), decision D2: by default no biometric step, the signing key
// non-extractable and the stored key never in the clear; the passkey protection OPT-IN, turned on and off
// again on the SAME key (nothing changes on the grid); locked until unlocked once per browser session;
// "Forget this computer" removes it. The passkey is a stand-in that gives a fixed PRF output per
// credential, as a platform authenticator with the PRF extension does (a real one is not testable here).
import { describe, expect, it } from 'vitest';
import { ab } from '../src/ssh/bytes';
import { createProtectedKey, ensureKey, forgetKey, keyState, KeyringError, loadIdentity, markEnrolled, memoryKeyStore, memoryUnlockStore, protectKey, unlockKey, unprotectKey, type PasskeyApi } from '../src/core/keyring';

function fakePasskeys(o: { prfAtCreate?: boolean; noPrf?: boolean; cancel?: boolean } = {}) {
  const secrets = new Map<string, Uint8Array>();
  let calls = 0;
  const prfFor = async (credId: Uint8Array, salt: Uint8Array) => {
    const s = secrets.get(Buffer.from(credId).toString('hex'))!;
    const k = await crypto.subtle.importKey('raw', ab(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', k, ab(salt)));
  };
  const api: PasskeyApi & { calls(): number } = {
    calls: () => calls,
    async create({ prfSalt }) {
      calls++;
      if (o.cancel) throw new KeyringError('not-allowed', 'cancelled');
      const credId = crypto.getRandomValues(new Uint8Array(16));
      secrets.set(Buffer.from(credId).toString('hex'), crypto.getRandomValues(new Uint8Array(32)));
      if (o.noPrf) return { credId, prfEnabled: false };
      return { credId, prfEnabled: true, ...(o.prfAtCreate ? { prfFirst: await prfFor(credId, prfSalt) } : {}) };
    },
    async get({ credId, prfSalt }) {
      calls++;
      if (o.cancel) throw new KeyringError('not-allowed', 'cancelled');
      return prfFor(credId, prfSalt);
    },
  };
  return api;
}

const ring = () => ({ store: memoryKeyStore(), unlock: memoryUnlockStore() });

/** the record holds no clear private key: no field of it imports as pkcs8 */
async function noClearKey(rec: Record<string, unknown>): Promise<boolean> {
  for (const v of Object.values(rec)) {
    if (!(v instanceof Uint8Array)) continue;
    for (const alg of [{ name: 'Ed25519' }, { name: 'ECDSA', namedCurve: 'P-256' }]) {
      try {
        await crypto.subtle.importKey('pkcs8', ab(v), alg as AlgorithmIdentifier, true, ['sign']);
        return false;
      } catch {
        /* not a clear key */
      }
    }
  }
  return true;
}

describe('the default key (no biometric step)', () => {
  it('is made once, signs with a NON-extractable key, and is stored wrapped under a non-extractable browser key', async () => {
    const k = ring();
    const id = await ensureKey(k);
    expect(['ssh-ed25519', 'ecdsa-sha2-nistp256']).toContain(id.keyType);
    expect(id.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('pkcs8', id.privateKey)).rejects.toThrow();
    const rec = k.store.record!;
    expect(rec.kind).toBe('device');
    expect(rec.kind === 'device' && rec.kek.extractable).toBe(false);
    expect(await noClearKey(rec as unknown as Record<string, unknown>)).toBe(true);
    // the same key on every load, and no prompt anywhere
    const again = await ensureKey(k);
    expect(again.publicKeyBase64()).toBe(id.publicKeyBase64());
    const s = await keyState(k);
    expect(s).toMatchObject({ present: true, wrapped: false, locked: false, enrolled: false });
    expect(s.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
  });

  it('P-256 when asked (or where WebCrypto has no Ed25519)', async () => {
    const k = ring();
    const id = await ensureKey(k, { alg: 'ecdsa-p256' });
    expect(id.keyType).toBe('ecdsa-sha2-nistp256');
    expect(id.publicKeyBlob().length).toBe(104);
  });

  it('is marked enrolled for an account', async () => {
    const k = ring();
    await ensureKey(k);
    await markEnrolled(k, 'st1234', '2026-10-02T12:00:00Z');
    expect(await keyState(k)).toMatchObject({ enrolled: true, account: 'st1234', enrolledAt: '2026-10-02T12:00:00Z' });
  });
});

describe('the passkey protection (OPT-IN, on and off again)', () => {
  it('turning it on re-wraps the SAME key under the passkey; the browser key is gone; locked until unlocked', async () => {
    const k = ring();
    const pk = fakePasskeys();
    const before = (await ensureKey(k)).publicKeyBase64();
    await markEnrolled(k, 'st1234');
    const r = await protectKey(k, pk);
    expect(r.prompts).toBe(2); // create, then one assertion for the PRF output
    const rec = k.store.record!;
    expect(rec.kind).toBe('prf');
    expect('kek' in rec).toBe(false);
    expect(await noClearKey(rec as unknown as Record<string, unknown>)).toBe(true);
    expect(await keyState(k)).toMatchObject({ present: true, wrapped: true, locked: false, enrolled: true, account: 'st1234' });
    expect((await loadIdentity(k)).publicKeyBase64()).toBe(before);
    // a new browser session: the unlock is gone, the key is locked
    await k.unlock.remove();
    expect((await keyState(k)).locked).toBe(true);
    await expect(loadIdentity(k)).rejects.toMatchObject({ code: 'locked' });
    await unlockKey(k, pk);
    const id = await loadIdentity(k);
    expect(id.publicKeyBase64()).toBe(before);
    expect(id.privateKey.extractable).toBe(false);
  });

  it('one prompt when the authenticator gives the PRF output at creation', async () => {
    const k = ring();
    await ensureKey(k);
    expect((await protectKey(k, fakePasskeys({ prfAtCreate: true }))).prompts).toBe(1);
  });

  it('turning it off puts the SAME key back under a browser key, with one prompt', async () => {
    const k = ring();
    const pk = fakePasskeys({ prfAtCreate: true });
    const before = (await ensureKey(k)).publicKeyBase64();
    await protectKey(k, pk);
    const n = pk.calls();
    await unprotectKey(k, pk);
    expect(pk.calls() - n).toBe(1);
    expect(k.store.record!.kind).toBe('device');
    expect(k.unlock.value).toBeUndefined();
    expect((await loadIdentity(k)).publicKeyBase64()).toBe(before);
  });

  it('a cancelled or PRF-less passkey changes nothing', async () => {
    const k = ring();
    await ensureKey(k);
    await expect(protectKey(k, fakePasskeys({ cancel: true }))).rejects.toMatchObject({ code: 'not-allowed' });
    await expect(protectKey(k, fakePasskeys({ noPrf: true }))).rejects.toMatchObject({ code: 'no-prf' });
    expect(k.store.record!.kind).toBe('device');
  });

  it('another passkey does not open it', async () => {
    const k = ring();
    await ensureKey(k);
    await protectKey(k, fakePasskeys());
    await k.unlock.remove();
    const other = fakePasskeys();
    // a stranger authenticator: its own secrets, so the stored credential is unknown to it
    await expect(unlockKey(k, { ...other, get: async () => crypto.getRandomValues(new Uint8Array(32)) })).rejects.toMatchObject({ code: 'wrong-key' });
  });

  it('the first key can be made protected from the start (the switch ticked before the first sign-in)', async () => {
    const k = ring();
    const { identity } = await createProtectedKey(k, fakePasskeys({ prfAtCreate: true }));
    expect(identity.privateKey.extractable).toBe(false);
    expect(k.store.record!.kind).toBe('prf');
    await expect(createProtectedKey(k, fakePasskeys())).rejects.toMatchObject({ code: 'already' });
  });
});

describe('Forget this computer', () => {
  it('removes the key and the unlock', async () => {
    const k = ring();
    await ensureKey(k);
    await protectKey(k, fakePasskeys());
    await forgetKey(k);
    expect(k.store.record).toBeUndefined();
    expect(k.unlock.value).toBeUndefined();
    expect((await keyState(k)).present).toBe(false);
    await expect(loadIdentity(k)).rejects.toMatchObject({ code: 'no-key' });
  });
});
