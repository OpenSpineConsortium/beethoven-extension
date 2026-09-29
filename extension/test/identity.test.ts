// The username a licence is matched against: the portal-observed one wins, a typed one is only
// a stand-in, and the note says which was used. For a site key: the e-mail domain it is matched
// under (the profile's, else the portal hostname's registrable domain), the identity built from it,
// and the note that names the binding.
import { describe, expect, it } from 'vitest';
import { bindIdentity, identityNote, isSiteKey, licenceIdentity, licenceNote, registrableDomain, siteEmailDomain, withSiteDomain } from '../src/core/identity';
import type { PortalSettings } from '../src/core/keys';
import { peek, verifyLicense } from '../src/licensing/license';
import { issuer, NOW } from './helpers';

const I = issuer();
const SITE_KEY = I.license({ sub: undefined, email: undefined, domain: 'wayne.edu', edition: 'site', name: 'Wayne State testers' });
const SETTINGS: PortalSettings = { origin: 'https://ondemand.grid.wayne.edu', hostname: 'ondemand.grid.wayne.edu', connected_at: '2026-09-28T00:00:00Z', shell_host: 'default', site: 'wayne' };

describe('identity binding', () => {
  it('prefers the portal-observed username over anything typed', () => {
    expect(bindIdentity('ab1234', 'zz9999')).toEqual({ accessId: 'ab1234', source: 'portal' });
    expect(bindIdentity('  ab1234 ', undefined)).toEqual({ accessId: 'ab1234', source: 'portal' });
    expect(bindIdentity(undefined, 'zz9999')).toEqual({ accessId: 'zz9999', source: 'typed' });
    expect(bindIdentity('', '  ')).toEqual({ source: 'none' });
    expect(identityNote(bindIdentity('ab1234', 'x'))).toMatch(/portal username ab1234/);
    expect(identityNote(bindIdentity(undefined, 'x'))).toMatch(/username you typed \(x\)/);
    expect(identityNote(bindIdentity(undefined, undefined))).toMatch(/not matched/);
  });

  it('a key issued to one student does not verify for another who typed that student\'s username', async () => {
    const key = I.license(); // issued to ab1234
    const bypass = bindIdentity('zz9999', 'ab1234');
    const c = await verifyLicense(key, { keys: I.keys, now: NOW, identity: { accessId: bypass.accessId } });
    expect(c.ok).toBe(false);
    expect(c.status).toBe('wrong-person');
    const honest = bindIdentity('ab1234', 'zz9999');
    expect((await verifyLicense(key, { keys: I.keys, now: NOW, identity: { accessId: honest.accessId } })).ok).toBe(true);
  });
});

describe('the site e-mail domain', () => {
  it('takes the last two labels of a portal hostname, three under a two-label public suffix', () => {
    expect(registrableDomain('ondemand.grid.wayne.edu')).toBe('wayne.edu');
    expect(registrableDomain('hpc.med.wayne.edu')).toBe('wayne.edu');
    expect(registrableDomain('wayne.edu')).toBe('wayne.edu');
    expect(registrableDomain('OnDemand.OSC.edu.')).toBe('osc.edu');
    expect(registrableDomain('ondemand.hpc.cam.ac.uk')).toBe('cam.ac.uk');
    expect(registrableDomain('ood.hpc.unimelb.edu.au')).toBe('unimelb.edu.au');
    expect(registrableDomain('login.nesi.org.nz')).toBe('nesi.org.nz');
    // a look-alike is its own domain, never wayne.edu
    expect(registrableDomain('wayne.edu.evil.example')).toBe('evil.example');
    // nothing to derive from: the mock portal and addresses without a domain
    expect(registrableDomain('localhost')).toBeUndefined();
    expect(registrableDomain('127.0.0.1')).toBeUndefined();
    expect(registrableDomain('')).toBeUndefined();
    expect(registrableDomain(undefined)).toBeUndefined();
  });

  it('is the profile\'s email_domain when the profile names one, else the remembered one, else the hostname\'s own', () => {
    const W = 'ondemand.grid.wayne.edu';
    const O = 'ondemand.osc.edu';
    expect(siteEmailDomain(undefined, W)).toEqual({ domain: 'wayne.edu', source: 'portal', hostname: W });
    expect(siteEmailDomain('{"site":"wayne"}', W)).toEqual({ domain: 'wayne.edu', source: 'portal', hostname: W });
    expect(siteEmailDomain('{"site":"osc","email_domain":"osu.edu"}', O)).toEqual({ domain: 'osu.edu', source: 'profile', hostname: O });
    expect(siteEmailDomain('{"email_domain":" @OSU.edu "}', O).domain).toBe('osu.edu');
    // remembered from an earlier read, when the file is not at hand
    expect(siteEmailDomain(undefined, O, 'osu.edu')).toEqual({ domain: 'osu.edu', source: 'profile', hostname: O });
    // the file at hand is the truth: a profile without the field is not overridden by a stale memory
    expect(siteEmailDomain('{"site":"osc"}', O, 'osu.edu')).toEqual({ domain: 'osc.edu', source: 'portal', hostname: O });
    // a connected portal in no domain is told apart from no portal yet
    expect(siteEmailDomain(undefined, 'localhost')).toEqual({ source: 'none', hostname: 'localhost' });
    expect(siteEmailDomain(undefined, '  ')).toEqual({ source: 'none' });
    expect(siteEmailDomain(undefined, undefined)).toEqual({ source: 'none' });
  });

  it('remembers the profile\'s domain in the portal settings only when it changed', () => {
    expect(withSiteDomain(SETTINGS, '{"site":"wayne"}')).toBeUndefined();
    expect(withSiteDomain(SETTINGS, undefined)).toBeUndefined();
    expect(withSiteDomain(undefined, '{"email_domain":"osu.edu"}')).toBeUndefined();
    const set = withSiteDomain(SETTINGS, '{"email_domain":"osu.edu"}');
    expect(set).toEqual({ ...SETTINGS, email_domain: 'osu.edu' });
    expect(withSiteDomain(set, '{"email_domain":"osu.edu"}')).toBeUndefined();
    // the field taken out of the profile again is forgotten
    expect(withSiteDomain(set, '{"site":"osc"}')).toEqual(SETTINGS);
  });
});

describe('the identity a key is checked against', () => {
  it('builds "<username>@<site domain>" for a site key only; a personal key sees the username alone', () => {
    expect(isSiteKey(peek(SITE_KEY))).toBe(true);
    expect(isSiteKey(peek(I.license()))).toBe(false);
    const site = siteEmailDomain(undefined, 'ondemand.grid.wayne.edu');
    expect(licenceIdentity(bindIdentity('go2432', undefined), SITE_KEY, site)).toEqual({ accessId: 'go2432', email: 'go2432@wayne.edu' });
    expect(licenceIdentity(bindIdentity('go2432', undefined), I.license(), site)).toEqual({ accessId: 'go2432' });
    expect(licenceIdentity(bindIdentity(undefined, undefined), I.license(), site)).toEqual({ accessId: undefined });
    // nothing to compare with yet: no username, or no portal
    expect(licenceIdentity(bindIdentity(undefined, undefined), SITE_KEY, site)).toEqual({});
    expect(licenceIdentity(bindIdentity('go2432', undefined), SITE_KEY, { source: 'none' })).toEqual({});
    // a connected portal in no domain: the username alone, which the verifier refuses for a site key
    expect(licenceIdentity(bindIdentity('go2432', undefined), SITE_KEY, { source: 'none', hostname: 'localhost' })).toEqual({ accessId: 'go2432' });
    expect(licenceIdentity(bindIdentity('go2432', undefined), undefined, site)).toEqual({ accessId: 'go2432' });
    // a typed name that is not a plain username cannot smuggle a domain into the e-mail the check builds
    expect(licenceIdentity(bindIdentity(undefined, 'x@wayne.edu'), SITE_KEY, { source: 'portal', domain: 'osc.edu', hostname: 'ondemand.osc.edu' })).toEqual({});
    expect(licenceIdentity({ accessId: 'x@wayne.edu', source: 'typed' }, SITE_KEY, site)).toEqual({});
    expect(licenceIdentity(bindIdentity('go2432', undefined), 'garbage', site)).toEqual({ accessId: 'go2432' });
  });

  it('a site key verifies for anyone at the site and for nobody outside it; the person rule is untouched', async () => {
    const check = (host: string, user: string) => verifyLicense(SITE_KEY, { keys: I.keys, now: NOW, identity: licenceIdentity(bindIdentity(user, undefined), SITE_KEY, siteEmailDomain(undefined, host)) });
    expect((await check('ondemand.grid.wayne.edu', 'go2432')).status).toBe('valid');
    expect((await check('ondemand.grid.wayne.edu', 'ab1234')).status).toBe('valid');
    expect((await check('ondemand.osc.edu', 'go2432')).status).toBe('wrong-person');
    // the profile's e-mail domain rescues a portal that is not under it
    const viaProfile = await verifyLicense(SITE_KEY, { keys: I.keys, now: NOW, identity: licenceIdentity(bindIdentity('go2432', undefined), SITE_KEY, siteEmailDomain('{"email_domain":"wayne.edu"}', 'ondemand.osc.edu')) });
    expect(viaProfile.status).toBe('valid');
    // a typed username still loses to the portal's own for a site key too
    expect((await verifyLicense(I.license(), { keys: I.keys, now: NOW, identity: licenceIdentity(bindIdentity('zz9999', 'ab1234'), I.license(), siteEmailDomain(undefined, 'ondemand.grid.wayne.edu')) })).status).toBe('wrong-person');
  });

  it('says the binding in plain words', () => {
    const p = peek(SITE_KEY);
    const site = siteEmailDomain(undefined, 'ondemand.grid.wayne.edu');
    expect(licenceNote(bindIdentity('go2432', undefined), p, site, 'ondemand.grid.wayne.edu')).toBe('site key for wayne.edu, matched to your portal username go2432 at ondemand.grid.wayne.edu');
    expect(licenceNote(bindIdentity(undefined, 'go2432'), p, site, 'ondemand.grid.wayne.edu')).toMatch(/^site key for wayne\.edu, matched to the username you typed \(go2432\) at ondemand\.grid\.wayne\.edu; the portal has not shown one yet/);
    expect(licenceNote(bindIdentity(undefined, undefined), p, site, 'ondemand.grid.wayne.edu')).toMatch(/^site key for wayne\.edu, not matched to a username yet/);
    expect(licenceNote(bindIdentity('go2432', undefined), p, { source: 'none' })).toMatch(/^site key for wayne\.edu, not matched to a portal yet/);
    expect(licenceNote(bindIdentity('go2432', undefined), p, siteEmailDomain(undefined, 'localhost'), 'localhost')).toMatch(/^site key for wayne\.edu, but your portal address localhost has no domain/);
    expect(licenceNote(bindIdentity(undefined, undefined), p, siteEmailDomain(undefined, 'localhost'), 'localhost')).toMatch(/^site key for wayne\.edu, not matched to a username yet/);
    // a profile that names an e-mail domain other than the hostname's own says so
    expect(licenceNote(bindIdentity('go2432', undefined), p, siteEmailDomain('{"email_domain":"wayne.edu"}', 'ondemand.osc.edu'), 'ondemand.osc.edu')).toBe('site key for wayne.edu, matched to your portal username go2432 at ondemand.osc.edu (the site profile names wayne.edu as its e-mail domain)');
    // a personal key keeps the old clause
    expect(licenceNote(bindIdentity('ab1234', undefined), peek(I.license()), site, 'ondemand.grid.wayne.edu')).toBe('matched to your portal username ab1234');
    expect(licenceNote(bindIdentity('ab1234', undefined), undefined, site, 'ondemand.grid.wayne.edu')).toBe('matched to your portal username ab1234');
  });
});
