// The kill-list: a signed JSON document; only the signed payload counts, offline keeps the last
// good list, an older list never replaces a newer one.
import { describe, expect, it } from 'vitest';
import { killListVerdict, refreshKillList, verifyKillList, type StoredKillList } from '../src/licensing/killlist';
import { issuer, NOW, signToken } from './helpers';

const I = issuer();
function doc(payload: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const p = { v: 1, kid: 'k1', issued: NOW, revoked_versions: [], revoked_lids: [], message: '', ...payload };
  return { ...p, ...extra, sig: signToken('ASHLEYREV1', p, I.privateKey) };
}
const fetchOf = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

describe('kill-list', () => {
  it('verifies a signed document and reads both spellings of the licence list', async () => {
    const v = await verifyKillList(doc({ revoked_versions: ['0.9.0'], revoked_lids: ['L-a'], revoked: ['L-b'], message: 'update please' }), I.keys);
    expect(v.ok).toBe(true);
    expect(v.list?.revoked_versions).toEqual(['0.9.0']);
    expect(v.list?.revoked_lids).toEqual(['L-a', 'L-b']);
    expect(v.list?.message).toBe('update please');
  });

  it('trusts only the signed payload: tampered outer fields are ignored, a tampered signature is rejected', async () => {
    const v = await verifyKillList(doc({ revoked_versions: [] }, { revoked_versions: ['1.0.0'] }), I.keys);
    expect(v.ok).toBe(true);
    expect(v.list?.revoked_versions).toEqual([]);
    const d = doc({});
    const bad = { ...d, sig: d.sig.slice(0, -4) + 'AAAA' };
    expect((await verifyKillList(bad, I.keys)).ok).toBe(false);
    expect((await verifyKillList({ v: 1 }, I.keys)).detail).toMatch(/no signature/);
    expect((await verifyKillList(doc({ kid: 'k9' }), I.keys)).detail).toMatch(/unknown-key/);
    expect((await verifyKillList('text', I.keys)).ok).toBe(false);
  });

  it('keeps the last good list when offline, when the server errs, and when the signature fails', async () => {
    const previous: StoredKillList = { fetched_at: 'x', list: { v: 1, kid: 'k1', issued: NOW - 100, revoked_versions: ['0.1.0'], revoked_lids: [], message: '' } };
    const offline = (async () => {
      throw new Error('ENETUNREACH');
    }) as unknown as typeof fetch;
    const a = await refreshKillList(previous, I.keys, offline);
    expect(a.current).toBe(previous);
    expect(a.fresh).toBe(false);
    expect(a.detail).toMatch(/keeping the last good list/);
    const b = await refreshKillList(previous, I.keys, fetchOf(500, {}));
    expect(b.current).toBe(previous);
    const forged = doc({ revoked_versions: ['1.0.0'] });
    forged.sig = forged.sig.slice(0, -2) + 'zz';
    const c = await refreshKillList(previous, I.keys, fetchOf(200, forged));
    expect(c.current).toBe(previous);
    expect(c.fresh).toBe(false);
  });

  it('accepts a newer verified list and never an older one', async () => {
    const previous: StoredKillList = { fetched_at: 'x', list: { v: 1, kid: 'k1', issued: NOW, revoked_versions: ['0.1.0'], revoked_lids: [], message: '' } };
    const newer = await refreshKillList(previous, I.keys, fetchOf(200, doc({ issued: NOW + 10, revoked_versions: ['0.1.0', '1.0.0'] })), () => new Date(0));
    expect(newer.fresh).toBe(true);
    expect(newer.current?.list.revoked_versions).toContain('1.0.0');
    const older = await refreshKillList(newer.current, I.keys, fetchOf(200, doc({ issued: NOW - 10, revoked_versions: [] })));
    expect(older.fresh).toBe(false);
    expect(older.current?.list.revoked_versions).toContain('1.0.0');
  });

  it('turns a list into a verdict for this install', () => {
    const stored: StoredKillList = { fetched_at: 'x', list: { v: 1, kid: 'k1', issued: NOW, revoked_versions: ['1.0.0'], revoked_lids: ['L-x'], message: 'why' } };
    expect(killListVerdict(stored, '1.0.0', 'L-y')).toEqual({ versionRevoked: true, licenseRevoked: false, message: 'why' });
    expect(killListVerdict(stored, '1.0.1', 'L-x')).toEqual({ versionRevoked: false, licenseRevoked: true, message: 'why' });
    expect(killListVerdict(undefined, '1.0.0', 'L-x').versionRevoked).toBe(false);
  });
});
