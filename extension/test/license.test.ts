// The licence verifier: a WebCrypto port of grid/license.js, checked against tokens signed the
// way that file signs them, with a key generated here. No vendor key is involved.
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { BUNDLED_KEYS, findKey, KEY_PATTERN, peek, verifyLicense } from '../src/licensing/license';
import { DAY, issuer, NOW } from './helpers';

const I = issuer();
const check = (key: string, extra: Record<string, unknown> = {}) => verifyLicense(key, { keys: I.keys, now: NOW, ...extra });

describe('licence keys', () => {
  it('a licence issued for a person verifies, and names them', async () => {
    const k = I.license();
    expect(k).toMatch(KEY_PATTERN);
    const c = await check(k, { identity: { accessId: 'AB1234' } });
    expect(c.status).toBe('valid');
    expect(c.ok).toBe(true);
    expect(c.identity).toBe(true);
    expect(c.payload?.sub).toBe('ab1234');
    expect(c.daysLeft).toBe(30);
    expect((await check(k)).identity).toBeNull();
  });

  it('an altered key, a foreign signature or an unknown signing key is refused', async () => {
    const k = I.license();
    const [p, body, sig] = k.split('.');
    const payload = JSON.parse(Buffer.from(body!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    payload.exp += 365 * DAY;
    const forged = `${p}.${Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${sig}`;
    expect((await check(forged)).status).toBe('invalid');
    const { privateKey: other } = generateKeyPairSync('ed25519');
    expect((await check(I.license({}, other))).status).toBe('invalid');
    expect((await check(I.license({ kid: 'k9' }))).status).toBe('unknown-key');
    expect((await check(k.slice(0, -3) + 'AAA')).ok).toBe(false);
    expect((await check('ASHLEY1.nonsense.x')).status).toBe('invalid');
    expect((await check('ASHLEYREV1.a.b')).status).toBe('invalid');
    expect((await check('')).status).toBe('missing');
    expect((await check('   ')).status).toBe('missing');
  });

  it('dates: grace after the end, then expired; not before the start', async () => {
    const g = await check(I.license({ exp: NOW - 3 * DAY }));
    expect(g.status).toBe('grace');
    expect(g.ok).toBe(true);
    expect((await check(I.license({ exp: NOW - 15 * DAY }))).status).toBe('expired');
    expect((await check(I.license({ exp: NOW - 15 * DAY, grace_days: 30 }))).status).toBe('grace');
    expect((await check(I.license({ exp: NOW - 1 * DAY, grace_days: 0 }))).status).toBe('expired');
    expect((await check(I.license({ nbf: NOW + 3 * DAY }))).status).toBe('not-yet-valid');
    expect((await check(I.license({ nbf: NOW + 3600 }))).status).toBe('valid');
  });

  it('the wrong person is refused; a site licence takes subdomains but not look-alikes', async () => {
    expect((await check(I.license(), { identity: { accessId: 'cd5678' } })).status).toBe('wrong-person');
    expect((await check(I.license(), { identity: { email: 'ab1234@wayne.edu' } })).status).toBe('valid');
    const site = I.license({ sub: undefined, email: undefined, domain: 'wayne.edu', edition: 'site' });
    expect((await check(site, { identity: { email: 'x@wayne.edu' } })).status).toBe('valid');
    expect((await check(site, { identity: { email: 'x@med.wayne.edu' } })).status).toBe('valid');
    expect((await check(site, { identity: { email: 'x@notwayne.edu' } })).status).toBe('wrong-person');
    expect((await check(site, { identity: { email: 'x@wayne.edu.evil.com' } })).status).toBe('wrong-person');
    expect((await check(site, { identity: { accessId: 'ab1234' } })).status).toBe('wrong-person');
  });

  it('a withdrawn licence, the wrong product and a key without dates are refused', async () => {
    const k = I.license();
    expect((await check(k, { revoked: ['L-test0001'] })).status).toBe('revoked');
    expect((await check(I.license({ product: 'other' }))).status).toBe('wrong-product');
    expect((await check(I.license({ v: 2 }))).status).toBe('wrong-product');
    expect((await check(I.license({ exp: undefined }))).status).toBe('invalid');
    expect((await check(I.license({ lid: undefined }))).status).toBe('invalid');
  });

  it('finds a key in pasted text and peeks at a payload without trusting it', () => {
    const k = I.license();
    expect(findKey(`Hello,\n\nyour key is ${k}\n\nRegards`)).toBe(k);
    expect(findKey('nothing here')).toBeNull();
    expect(peek(k)?.name).toBe('A. Student');
    expect(peek('garbage')).toBeNull();
  });

  it('the bundled key ring holds the two raw 32-byte keys from Ashley (k1 and trial)', () => {
    expect(Object.keys(BUNDLED_KEYS).sort()).toEqual(['k1', 'trial']);
    for (const raw of Object.values(BUNDLED_KEYS)) expect(Buffer.from(raw, 'base64').length).toBe(32);
  });
});
