// The deployments this build carries (17.0.0). hpcworker's `profiles` export is copied into the package
// as data, public/profiles/<site>.json, by scripts/sync-profiles.mjs, which also writes
// public/deployments.json, the list of their ids in the order a page offers them (a page cannot list a
// folder of the package). Each profile is read with beethoven-base's reader (src/base/profile.ts, the
// `browser` export pinned by interface/pull.sh): the keys clients read, each of module-schema 1's type,
// a value of another type left out. Which deployment a portal belongs to is what its own profile
// declares (base's deploymentFor: the portal's origin, never a default site and never a guess from a
// host name; Linear BEE-210). The one the welcome page offers first, PRESELECTED_SITE, is greg's choice
// of 2026-10-08 (the Wayne State profile is the default); it chooses nothing by itself, since the press
// stores the deployment whose profile declares the portal Chrome granted, and a portal no profile
// declares is stored with no site at all.
import { deploymentFor, portalOriginOf, readProfileText, sharedRootOf, type SiteProfile } from '../base/profile';

/** the deployment the welcome page offers first, where the build carries it */
export const PRESELECTED_SITE = 'wayne';
/** the list sync-profiles writes: {"sites": ["wayne", ...]} */
export const DEPLOYMENTS_ASSET = '/deployments.json';
/** where a site's profile sits in the package (scripts/sync-profiles.mjs writes public/profiles/) */
export const profileAsset = (site: string): string => `/profiles/${site}.json`;
/** a site id as sync-profiles admits it and connect types it (core/contract.ts SITE_RE, cli.json's site form) */
const SITE = /^[a-z0-9][a-z0-9-]{0,31}$/;

export interface Deployment {
  /** the profile's id, the first half of a worker's session name and the name connect is given */
  site: string;
  profile: SiteProfile;
}

/** the pages read the package's own files through the extension's URL; tests pass a stand-in */
export type FetchAsset = (path: string) => Promise<Response>;

/** the whole site profile this build carries for a site, or undefined when it carries none (or a file that is not a JSON object) */
export async function bundledProfile(site: string, fetchAsset: FetchAsset): Promise<SiteProfile | undefined> {
  if (!/^[A-Za-z0-9_-]+$/.test(String(site ?? ''))) return undefined;
  try {
    const res = await fetchAsset(profileAsset(site));
    if (!res.ok) return undefined;
    return readProfileText(await res.text())?.profile;
  } catch {
    return undefined;
  }
}

/**
 * The shared folder the site profile this build carries names ("shared_install" in
 * framework/profiles/<site>.json), or undefined: no such profile, no such key, or a value that is
 * not a plain absolute folder.
 */
export async function bundledSharedInstall(site: string, fetchAsset: FetchAsset): Promise<string | undefined> {
  return sharedRootOf((await bundledProfile(site, fetchAsset))?.shared_install);
}

/** the ids public/deployments.json lists, in its order; [] when the build carries none, or the file is not {sites: [...]} of plain ids */
export async function bundledSites(fetchAsset: FetchAsset): Promise<string[]> {
  try {
    const res = await fetchAsset(DEPLOYMENTS_ASSET);
    if (!res.ok) return [];
    const v = JSON.parse(await res.text()) as { sites?: unknown } | null;
    const sites = v?.sites;
    if (!Array.isArray(sites)) return [];
    return sites.filter((s): s is string => typeof s === 'string' && SITE.test(s));
  } catch {
    return [];
  }
}

/** every listed deployment whose profile the build carries under its own id, in the list's order */
export async function bundledDeployments(fetchAsset: FetchAsset): Promise<Deployment[]> {
  const out: Deployment[] = [];
  for (const site of await bundledSites(fetchAsset)) {
    const profile = await bundledProfile(site, fetchAsset);
    if (profile && profile.site === site) out.push({ site, profile });
  }
  return out;
}

/** the portal a profile declares (ood_base_url, an https origin), as the welcome page's press asks Chrome for it */
export function portalOf(profile: SiteProfile | undefined): { origin: string; hostname: string } | undefined {
  const origin = portalOriginOf(profile?.ood_base_url);
  if (!origin) return undefined;
  return { origin, hostname: new URL(origin).hostname };
}

/**
 * The deployment a granted portal belongs to: the one picked on the welcome page when its own profile
 * declares that origin, else the one deployment that does. Undefined when none does (a portal this build
 * carries no profile for), or when several do and none of them was picked (two labs on one portal).
 */
export function deploymentOfPortal(origin: string, deployments: readonly Deployment[], picked?: string): Deployment | undefined {
  const found = deploymentFor({ origin }, deployments.map((d) => d.profile));
  const matching: readonly SiteProfile[] = found.found === 'one' ? [found.profile] : found.found === 'several' ? found.profiles : [];
  const hits = deployments.filter((d) => matching.includes(d.profile));
  return hits.find((d) => d.site === picked) ?? (hits.length === 1 ? hits[0] : undefined);
}

/** the site name stored with a granted portal: its deployment's, or "" for a portal no bundled profile declares */
export function siteOfPortal(origin: string, deployments: readonly Deployment[], picked?: string): string {
  return deploymentOfPortal(origin, deployments, picked)?.site ?? '';
}
