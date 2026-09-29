// Which username a licence key is matched against. The portal's own dashboard says "Logged in as
// <user>", and that observed name always wins: a key issued to one student must not verify for
// another because the other typed the first one's username on the setup page. A typed name is
// only a stand-in until the portal has shown one, and the pages say so when that is the case.
//
// A site key names a domain instead of a person (payload `domain`, no `sub`): one key for every
// tester at a university, withdrawn by its lid when the pilot ends. The verifier (licensing/license.ts,
// the port of Ashley's license.js) matches such a key against an e-mail in that domain, so the
// extension builds one from what it has, "<portal username>@<site e-mail domain>", where the site
// e-mail domain is the profile's `email_domain` when ~/.hpcworker/profile.json names one, else the
// registrable domain of the portal hostname (ondemand.grid.wayne.edu -> wayne.edu). That e-mail is
// never stored, shown or sent; it exists for the comparison only. A person key is matched exactly
// as before: no e-mail is built for it.
import { emailDomainFrom } from './contract';
import type { PortalSettings } from './keys';
import { peek, type Identity, type LicensePayload } from '../licensing/license';

export type IdentitySource = 'portal' | 'typed' | 'none';

export interface BoundIdentity {
  accessId?: string;
  source: IdentitySource;
}

/** the portal-observed username first; the typed one only when the portal has shown none */
export function bindIdentity(observed: string | undefined, typed: string | undefined): BoundIdentity {
  const seen = String(observed ?? '').trim();
  if (seen) return { accessId: seen, source: 'portal' };
  const t = String(typed ?? '').trim();
  if (t) return { accessId: t, source: 'typed' };
  return { source: 'none' };
}

/** one clause for the panel, appended to the licence line */
export function identityNote(b: BoundIdentity): string {
  if (b.source === 'portal') return `matched to your portal username ${b.accessId}`;
  if (b.source === 'typed') return `matched to the username you typed (${b.accessId}); the portal has not shown one yet, and its own name will take over when it does`;
  return 'not matched to a username yet (the portal will show one once it is connected)';
}

/**
 * Public suffixes of two labels, under which the registrable domain is three labels long
 * (ondemand.hpc.cam.ac.uk -> cam.ac.uk). A short list of the university suffixes is enough: a
 * site this list misses names its e-mail domain in its profile instead.
 */
const TWO_LABEL_SUFFIXES = new Set([
  'ac.uk', 'co.uk', 'org.uk', 'gov.uk', 'nhs.uk',
  'edu.au', 'com.au', 'org.au', 'gov.au',
  'ac.nz', 'co.nz', 'org.nz', 'ac.za', 'co.za', 'ac.in', 'edu.in', 'co.in',
  'ac.jp', 'co.jp', 'ac.kr', 'edu.cn', 'edu.hk', 'edu.sg', 'edu.tw', 'ac.th', 'edu.my', 'ac.id', 'ac.il', 'edu.sa', 'ac.ir', 'edu.tr', 'edu.pk',
  'ac.at', 'ac.be', 'edu.br', 'com.br', 'edu.mx', 'edu.ar', 'edu.co', 'edu.pe',
]);

/** "ondemand.grid.wayne.edu" -> "wayne.edu"; "ondemand.hpc.cam.ac.uk" -> "cam.ac.uk"; undefined for localhost or an IP address */
export function registrableDomain(hostname: string | undefined): string | undefined {
  const labels = String(hostname ?? '').trim().toLowerCase().replace(/\.+$/, '').split('.').filter(Boolean);
  if (labels.length < 2 || labels.every((l) => /^\d+$/.test(l))) return undefined;
  const n = labels.length >= 3 && TWO_LABEL_SUFFIXES.has(labels.slice(-2).join('.')) ? 3 : 2;
  return labels.slice(-n).join('.');
}

export interface SiteDomain {
  domain?: string;
  /** where the domain came from: the site profile (read now or remembered), the portal hostname, or nowhere yet */
  source: 'profile' | 'portal' | 'none';
  /** the connected portal's address, when there is one: a portal whose address yields no domain is outside every site, which is not the same as no portal yet */
  hostname?: string;
}

/**
 * The e-mail domain a site key is matched under. In order: the profile's `email_domain` when the
 * profile is at hand (a profile without the field says so, and nothing remembered overrides it),
 * else the value remembered in the portal settings from the last read of the profile, else the
 * portal hostname's own registrable domain.
 */
export function siteEmailDomain(profileJson: string | undefined, hostname: string | undefined, remembered?: string): SiteDomain {
  const host = String(hostname ?? '').trim().toLowerCase() || undefined;
  const portal = host ? { hostname: host } : {};
  const fromProfile = profileJson !== undefined ? emailDomainFrom(profileJson) : normDomain(remembered);
  if (fromProfile) return { domain: fromProfile, source: 'profile', ...portal };
  const fromHost = registrableDomain(host);
  if (fromHost) return { domain: fromHost, source: 'portal', ...portal };
  return { source: 'none', ...portal };
}

function normDomain(s: string | undefined): string | undefined {
  const d = String(s ?? '').trim().toLowerCase().replace(/^@/, '');
  return d || undefined;
}

/** the portal settings with the profile's e-mail domain remembered, or undefined when nothing changed (so a write is made only on a change) */
export function withSiteDomain(settings: PortalSettings | undefined, profileJson: string | undefined): PortalSettings | undefined {
  if (!settings || profileJson === undefined) return undefined;
  const dom = emailDomainFrom(profileJson);
  if (dom === settings.email_domain) return undefined;
  const next: PortalSettings = { ...settings };
  if (dom) next.email_domain = dom;
  else delete next.email_domain;
  return next;
}

/** a key whose payload names a domain and no person: one key for everyone at a site */
export function isSiteKey(p: LicensePayload | null | undefined): p is LicensePayload & { domain: string } {
  return !!p?.domain && !p.sub && !p.email;
}

/**
 * The identity a key is checked against. A person key sees the username and nothing else, exactly
 * as before. A site key sees the e-mail "<username>@<site domain>" the verifier compares with its
 * domain. With no username yet, or no portal connected yet, there is nothing to compare with and
 * the key is matched once there is, as a typed name is; a connected portal whose address yields no
 * domain (localhost, an address, a bare name) is outside every site, and the key is refused there.
 */
/** a portal username is a plain account name; anything else (an '@', spaces, a path) is not one */
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export function licenceIdentity(b: BoundIdentity, key: string | undefined, site: SiteDomain): Identity {
  const p = key ? peek(key) : null;
  if (!isSiteKey(p)) return { accessId: b.accessId };
  if (!b.accessId) return {};
  // the e-mail is built from the username, so the username must be one: a typed "x@wayne.edu" must
  // not smuggle a domain past the check (the verifier reads the part after the first '@')
  if (!USERNAME_RE.test(b.accessId)) return {};
  if (site.domain) return { accessId: b.accessId, email: `${b.accessId}@${site.domain}` };
  return site.hostname ? { accessId: b.accessId } : {};
}

/** the identity clause for a checked key: which username; for a site key also which domain and which portal */
export function licenceNote(b: BoundIdentity, payload: LicensePayload | null | undefined, site: SiteDomain, hostname?: string): string {
  if (!isSiteKey(payload)) return identityNote(b);
  const head = `site key for ${payload.domain}`;
  if (!site.domain && !site.hostname) return `${head}, not matched to a portal yet (it is checked against your portal's domain once one is connected)`;
  if (b.source === 'none') return `${head}, not matched to a username yet (the portal will show one once it is connected)`;
  if (!site.domain) return `${head}, but your portal address ${site.hostname} has no domain to match it against`;
  // when the profile names an e-mail domain that is not the hostname's own, say where the match came from
  const via = site.source === 'profile' && site.domain !== registrableDomain(hostname) ? ` (the site profile names ${site.domain} as its e-mail domain)` : '';
  const at = hostname ? ` at ${hostname}${via}` : '';
  if (b.source === 'portal') return `${head}, matched to your portal username ${b.accessId}${at}`;
  return `${head}, matched to the username you typed (${b.accessId})${at}; the portal has not shown one yet, and its own name will take over when it does`;
}
