// The kill-list: a signed JSON document; only the signed payload counts, offline keeps the last
// good list, an older list never replaces a newer one, and since version 4 it withdraws versions
// only (the ids an older list may carry are read for the comparison and never acted on).
import { describe, expect, it } from 'vitest';
import { killListVerdict, refreshKillList, verifyKillList, type StoredKillList } from '../src/licensing/killlist';
import { BUNDLED_KEYS, open, REV_PREFIX, REV_PREFIXES } from '../src/licensing/signed';
import { issuer, NOW, signToken } from './helpers';

const I = issuer();
function doc(payload: Record<string, unknown>, extra: Record<string, unknown> = {}, prefix = 'ASHLEYREV1') {
  const p = { v: 1, kid: 'k1', issued: NOW, revoked_versions: [], revoked_lids: [], message: '', ...payload };
  return { ...p, ...extra, sig: signToken(prefix, p, I.privateKey) };
}
const fetchOf = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

describe('kill-list', () => {
  it('verifies a signed document, reads both spellings of the compatibility id list, and counts only versions', async () => {
    const v = await verifyKillList(doc({ revoked_versions: ['0.9.0'], revoked_lids: ['L-a'], revoked: ['L-b'], message: 'update please' }), I.keys);
    expect(v.ok).toBe(true);
    expect(v.list?.revoked_versions).toEqual(['0.9.0']);
    expect(v.list?.revoked_lids).toEqual(['L-a', 'L-b']);
    expect(v.list?.message).toBe('update please');
    expect(v.detail).toBe('1 withdrawn version(s), list of 2026-09-21');
  });

  it('the signed-token check: the prefix, the payload, an unknown key id and a bad signature', async () => {
    const tok = signToken(REV_PREFIX, { v: 1, kid: 'k1', issued: NOW, revoked: [] }, I.privateKey);
    expect((await open(REV_PREFIX, tok, I.keys)).payload).toMatchObject({ v: 1, kid: 'k1' });
    expect((await open('OTHER1', tok, I.keys)).error).toBe('malformed');
    expect((await open(REV_PREFIX, signToken(REV_PREFIX, { v: 1, kid: 'k9' }, I.privateKey), I.keys)).error).toBe('unknown-key');
    expect((await open(REV_PREFIX, tok.slice(0, -4) + 'AAAA', I.keys)).error).toBe('bad-signature');
    expect((await open(REV_PREFIX, 'ASHLEYREV1.nonsense', I.keys)).error).toBe('malformed');
    expect((await open(REV_PREFIX, undefined as unknown as string, I.keys)).error).toBe('missing');
  });

  it('takes the tag in either spelling, ASHLEYREV1 or BEETHOVENREV1, and the signature must cover the one it carries', async () => {
    expect(REV_PREFIXES).toEqual(['ASHLEYREV1', 'BEETHOVENREV1']);
    const content = { revoked_versions: ['0.9.0'], message: 'update please' };
    const oldTag = await verifyKillList(doc(content), I.keys);
    const newTag = await verifyKillList(doc(content, {}, 'BEETHOVENREV1'), I.keys);
    expect(newTag.ok, newTag.detail).toBe(true);
    expect(newTag.list).toEqual(oldTag.list);
    const out = await refreshKillList(undefined, I.keys, fetchOf(200, doc(content, {}, 'BEETHOVENREV1')), () => new Date(0));
    expect(out.fresh, out.detail).toBe(true);
    expect(killListVerdict(out.current, '0.9.0')).toEqual({ versionRevoked: true, message: 'update please' });
    // a list signed as ASHLEYREV1 with only its tag rewritten: the signed text differs, so it is refused
    const a = doc(content);
    const swapped = { ...a, sig: a.sig.replace(/^ASHLEYREV1\./, 'BEETHOVENREV1.') };
    expect((await verifyKillList(swapped, I.keys)).detail).toMatch(/bad-signature/);
    // any other tag is no signature at all, and a single-prefix open stays as strict as before
    expect((await verifyKillList(doc(content, {}, 'OTHERREV1'), I.keys)).detail).toMatch(/no signature/);
    const tok = signToken('BEETHOVENREV1', { v: 1, kid: 'k1', issued: NOW, revoked: [] }, I.privateKey);
    expect((await open(REV_PREFIX, tok, I.keys)).error).toBe('malformed');
    expect((await open(REV_PREFIXES, tok, I.keys)).payload).toMatchObject({ v: 1, kid: 'k1' });
    expect((await open(REV_PREFIXES, signToken('BEETHOVENREV1', { v: 1, kid: 'k9' }, I.privateKey), I.keys)).error).toBe('unknown-key');
  });

  it('the bundled ring holds one raw 32-byte key, k1, the release key the published list is signed with', () => {
    expect(Object.keys(BUNDLED_KEYS)).toEqual(['k1']);
    for (const raw of Object.values(BUNDLED_KEYS)) expect(Buffer.from(raw, 'base64').length).toBe(32);
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

  it('turns a list into a verdict for this install: the version, and nothing about ids', () => {
    const stored: StoredKillList = { fetched_at: 'x', list: { v: 1, kid: 'k1', issued: NOW, revoked_versions: ['1.0.0'], revoked_lids: ['L-x'], message: 'why' } };
    expect(killListVerdict(stored, '1.0.0')).toEqual({ versionRevoked: true, message: 'why' });
    expect(killListVerdict(stored, '1.0.1')).toEqual({ versionRevoked: false, message: 'why' });
    expect(killListVerdict(undefined, '1.0.0')).toEqual({ versionRevoked: false, message: '' });
  });
});
