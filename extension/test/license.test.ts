// The licence verifier: a WebCrypto port of grid/license.js, checked against tokens signed the
// way that file signs them, with a key generated here. No vendor key is involved.
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { bindIdentity, licenceIdentity, licenceNote, siteEmailDomain } from '../src/core/identity';
import { killListVerdict, type StoredKillList } from '../src/licensing/killlist';
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

// A site key: edition "site", a domain and no person, one key for every tester at a university.
// The extension matches it to "<portal username>@<site e-mail domain>" (core/identity.ts), the
// domain taken from the portal hostname when the site profile names none; it is refused from a
// portal outside the domain and once its lid is on the kill-list. Signed here with kid "test".
describe('site keys', () => {
  const T = issuer('test');
  const SITE = T.license({ sub: undefined, email: undefined, name: 'Wayne State testers', edition: 'site', domain: 'wayne.edu', lid: 'L-site0001', exp: NOW + 365 * DAY });
  const on = (hostname: string, username: string | undefined = 'go2432', extra: Record<string, unknown> = {}) =>
    verifyLicense(SITE, { keys: T.keys, now: NOW, identity: licenceIdentity(bindIdentity(username, undefined), SITE, siteEmailDomain(undefined, hostname)), ...extra });

  it('is a site key: a domain, no person, matched to nobody in particular', async () => {
    const p = peek(SITE)!;
    expect(p.edition).toBe('site');
    expect(p.domain).toBe('wayne.edu');
    expect(p.sub).toBeUndefined();
    expect(p.email).toBeUndefined();
    // the bundled ring does not know the test issuer, so this key never verifies in a real build
    expect((await verifyLicense(SITE, { now: NOW })).status).toBe('unknown-key');
  });

  it('verifies for go2432 on ondemand.grid.wayne.edu and on hpc.med.wayne.edu', async () => {
    const a = await on('ondemand.grid.wayne.edu');
    expect(a.status).toBe('valid');
    expect(a.ok).toBe(true);
    expect(a.identity).toBe(true);
    expect(a.detail).toMatch(/licensed to Wayne State testers until 2027-09-21/);
    const b = await on('hpc.med.wayne.edu');
    expect(b.status).toBe('valid');
    expect(b.identity).toBe(true);
    // any username at the site: the key names none
    expect((await on('ondemand.grid.wayne.edu', 'zz9999')).status).toBe('valid');
    // the note says what the key was matched to
    expect(licenceNote(bindIdentity('go2432', undefined), peek(SITE), siteEmailDomain(undefined, 'ondemand.grid.wayne.edu'), 'ondemand.grid.wayne.edu')).toBe('site key for wayne.edu, matched to your portal username go2432 at ondemand.grid.wayne.edu');
  });

  it('is refused on ondemand.osc.edu and on wayne.edu.evil.example, with a sentence naming both domains', async () => {
    const osc = await on('ondemand.osc.edu');
    expect(osc.ok).toBe(false);
    expect(osc.status).toBe('wrong-person');
    expect(osc.identity).toBe(false);
    expect(osc.detail).toBe('this is a site key for wayne.edu; your portal is in osc.edu, not in that domain');
    const evil = await on('wayne.edu.evil.example');
    expect(evil.status).toBe('wrong-person');
    expect(evil.detail).toMatch(/your portal is in evil\.example, not in that domain/);
    // a look-alike hostname is not a subdomain either
    expect((await on('ondemand.notwayne.edu')).status).toBe('wrong-person');
  });

  it('is refused once its lid is on the kill-list, whoever holds it and wherever it is used', async () => {
    const r = await on('ondemand.grid.wayne.edu', 'go2432', { revoked: ['L-site0001'] });
    expect(r.ok).toBe(false);
    expect(r.status).toBe('revoked');
    expect(r.detail).toMatch(/L-site0001 has been withdrawn/);
    const stored: StoredKillList = { fetched_at: 'x', list: { v: 1, kid: 'test', issued: NOW, revoked_versions: [], revoked_lids: ['L-site0001'], message: 'the pilot has ended' } };
    expect(killListVerdict(stored, '1.0.0', peek(SITE)?.lid)).toEqual({ versionRevoked: false, licenseRevoked: true, message: 'the pilot has ended' });
    expect((await on('ondemand.grid.wayne.edu', 'go2432', { revoked: stored.list.revoked_lids })).status).toBe('revoked');
  });

  it('with no username or no portal yet there is nothing to compare with; a connected portal whose address has no domain is outside the site', async () => {
    const noUser = await on('ondemand.grid.wayne.edu', '');
    expect(noUser.status).toBe('valid');
    expect(noUser.identity).toBeNull();
    const noPortal = await verifyLicense(SITE, { keys: T.keys, now: NOW, identity: licenceIdentity(bindIdentity('go2432', undefined), SITE, siteEmailDomain(undefined, undefined)) });
    expect(noPortal.status).toBe('valid');
    expect(noPortal.identity).toBeNull();
    expect(licenceNote(bindIdentity('go2432', undefined), peek(SITE), siteEmailDomain(undefined, undefined))).toMatch(/not matched to a portal yet/);
    // the mock portal and the like: connected, but in no domain a site key could name
    const local = await on('localhost');
    expect(local.status).toBe('wrong-person');
    expect(local.detail).toBe('this is a site key for wayne.edu; it works only from a portal in that domain');
    expect((await on('127.0.0.1')).status).toBe('wrong-person');
    expect(licenceNote(bindIdentity('go2432', undefined), peek(SITE), siteEmailDomain(undefined, 'localhost'), 'localhost')).toBe('site key for wayne.edu, but your portal address localhost has no domain to match it against');
  });

  it('leaves a personal key exactly as it was: the username decides, no e-mail is built for it', async () => {
    const person = I.license();
    const site = siteEmailDomain(undefined, 'ondemand.grid.wayne.edu');
    expect(licenceIdentity(bindIdentity('ab1234', undefined), person, site)).toEqual({ accessId: 'ab1234' });
    expect((await verifyLicense(person, { keys: I.keys, now: NOW, identity: licenceIdentity(bindIdentity('ab1234', undefined), person, site) })).status).toBe('valid');
    // another username at the same site is still the wrong person
    expect((await verifyLicense(person, { keys: I.keys, now: NOW, identity: licenceIdentity(bindIdentity('zz9999', undefined), person, site) })).status).toBe('wrong-person');
  });
});
