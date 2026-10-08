// 17.0.0: the deployments a build carries (core/deployments.ts): the list sync-profiles writes, each
// profile read with beethoven-base's reader (src/base/profile.ts, pinned by interface/pull.sh), the
// portal a profile declares, the deployment a granted portal belongs to (one, none, several, the
// picked one of several), and the welcome page's words from the picked profile. The Wayne State
// profile is the one offered first (greg, 2026-10-08), and nothing is ever read from a host name
// (Linear BEE-210).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readProfileText } from '../src/base/profile';
import { bundledDeployments, bundledProfile, bundledSites, deploymentOfPortal, DEPLOYMENTS_ASSET, portalOf, PRESELECTED_SITE, profileAsset, siteOfPortal, type Deployment } from '../src/core/deployments';
import { WORDS } from '../src/core/model';
import { welcomeView } from '../src/core/steps';

const PROFILES = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'framework', 'profiles');
const WAYNE = readFileSync(path.join(PROFILES, 'wayne.json'), 'utf8');
const wayne = readProfileText(WAYNE)!.profile;
/** a second deployment, as a university that does not exist (beethoven-sites' examples/) would declare it */
const EXAMPLE = { schema_version: 1, site: 'example', display_name: 'Example University research cluster', ood_base_url: 'https://ondemand.hpc.university.example', vpn_required: false, session_title: 'Example grid', shared_install: '/shared/beethoven/current' };

/** a package holding the files given, as the pages fetch them */
function assets(files: Record<string, string>) {
  return async (p: string): Promise<Response> => (p in files ? new Response(files[p], { status: 200 }) : new Response('', { status: 404 }));
}
const PKG = { [DEPLOYMENTS_ASSET]: JSON.stringify({ sites: ['wayne', 'example'] }), [profileAsset('wayne')]: WAYNE, [profileAsset('example')]: JSON.stringify(EXAMPLE) };

describe('the deployments a build carries', () => {
  it('the Wayne State profile is the one offered first, and it is one the framework publishes', () => {
    expect(PRESELECTED_SITE).toBe('wayne');
    expect(readdirSync(PROFILES)).toContain(`${PRESELECTED_SITE}.json`);
    // the shipped profile reads whole: hpcworker composed it, so base's reader refuses none of its keys
    expect(readProfileText(WAYNE)!.refused).toEqual([]);
    expect(wayne.site).toBe('wayne');
  });

  it('lists the ids deployments.json names, in its order, and only the plain ones', async () => {
    expect(await bundledSites(assets(PKG))).toEqual(['wayne', 'example']);
    expect(await bundledSites(assets({ [DEPLOYMENTS_ASSET]: JSON.stringify({ sites: ['wayne', '../x', 'Bad', 7] }) }))).toEqual(['wayne']);
    expect(await bundledSites(assets({ [DEPLOYMENTS_ASSET]: 'not json' }))).toEqual([]);
    expect(await bundledSites(assets({ [DEPLOYMENTS_ASSET]: '[]' }))).toEqual([]);
    expect(await bundledSites(assets({}))).toEqual([]);
    expect(await bundledSites(async () => Promise.reject(new TypeError('Failed to fetch')))).toEqual([]);
  });

  it("reads each listed profile with base's reader, under its own id only", async () => {
    const ds = await bundledDeployments(assets(PKG));
    expect(ds.map((d) => d.site)).toEqual(['wayne', 'example']);
    expect(ds[0]!.profile.session_title).toBe('Wayne State grid');
    expect(ds[1]!.profile.vpn_required).toBe(false);
    // a listed id whose file is missing, or whose profile names another site, is left out
    const odd = { ...PKG, [profileAsset('example')]: JSON.stringify({ ...EXAMPLE, site: 'other' }), [DEPLOYMENTS_ASSET]: JSON.stringify({ sites: ['wayne', 'example', 'gone'] }) };
    expect((await bundledDeployments(assets(odd))).map((d) => d.site)).toEqual(['wayne']);
    // a value of the wrong type is left out by the reader, never carried into the words
    const typed = await bundledProfile('example', assets({ [profileAsset('example')]: JSON.stringify({ ...EXAMPLE, vpn_required: 'no', session_title: 7 }) }));
    expect(typed?.site).toBe('example');
    expect(typed?.vpn_required).toBeUndefined();
    expect(typed?.session_title).toBeUndefined();
    expect(await bundledProfile('../manifest', assets(PKG))).toBeUndefined();
    expect(await bundledProfile('example', assets({ [profileAsset('example')]: '[1]' }))).toBeUndefined();
  });

  it('the portal a profile declares: an https origin, the host in lower case, port 443 dropped, nothing for another scheme', () => {
    expect(portalOf(wayne)).toEqual({ origin: 'https://ondemand.grid.wayne.edu', hostname: 'ondemand.grid.wayne.edu' });
    expect(portalOf({ ood_base_url: 'https://Portal.Example:443/pun/sys/dashboard' })).toEqual({ origin: 'https://portal.example', hostname: 'portal.example' });
    expect(portalOf({ ood_base_url: 'https://portal.example:8443' })).toEqual({ origin: 'https://portal.example:8443', hostname: 'portal.example' });
    expect(portalOf({ ood_base_url: 'http://portal.example' })).toBeUndefined();
    expect(portalOf({})).toBeUndefined();
    expect(portalOf(undefined)).toBeUndefined();
  });

  it('a granted portal belongs to the deployment whose own profile declares it: one, none, or the picked one of several', async () => {
    const ds = await bundledDeployments(assets(PKG));
    expect(deploymentOfPortal('https://ondemand.grid.wayne.edu', ds)?.site).toBe('wayne');
    expect(deploymentOfPortal('https://ondemand.hpc.university.example', ds)?.site).toBe('example');
    // the pick never overrides what a profile declares
    expect(deploymentOfPortal('https://ondemand.grid.wayne.edu', ds, 'example')?.site).toBe('wayne');
    // a portal no profile declares: none, whatever was picked and whatever its host name resembles
    expect(deploymentOfPortal('https://ondemand.grid.wayne.edu.example', ds, 'wayne')).toBeUndefined();
    expect(siteOfPortal('https://ondemand.osc.edu', ds, 'wayne')).toBe('');
    expect(siteOfPortal('https://ondemand.grid.wayne.edu', ds)).toBe('wayne');
    // two labs on one portal: the picked one, else none (the page offers the pick)
    const twin: Deployment = { site: 'wayne-other', profile: { ...wayne, site: 'wayne-other' } };
    expect(deploymentOfPortal('https://ondemand.grid.wayne.edu', [...ds, twin])).toBeUndefined();
    expect(deploymentOfPortal('https://ondemand.grid.wayne.edu', [...ds, twin], 'wayne-other')?.site).toBe('wayne-other');
    expect(deploymentOfPortal('https://ondemand.grid.wayne.edu', [...ds, twin], 'wayne')?.site).toBe('wayne');
  });
});

describe("the welcome page's words from the picked profile", () => {
  const grids = { options: [{ site: 'wayne', name: 'Wayne State University HPC grid' }, { site: 'example', name: 'Example University research cluster' }], selected: 'wayne' };
  const base = { portal: { origin: 'https://ondemand.grid.wayne.edu', hostname: 'ondemand.grid.wayne.edu' }, state: 'idle' as const, licenseUrl: '/LICENSE.txt', privacyUrl: '/PRIVACY.md' };

  it('the Wayne State profile gives the 11.0.0 words to the letter', () => {
    const v = welcomeView({ ...base, grids, site: { grid: 'Wayne State grid', vpnApp: 'GlobalProtect', vpnPortal: 'protect.wayne.edu', title: 'Wayne State grid', hours: 8, gridAccountHelpUrl: wayne.grid_account_help_url!, vpnHelpUrl: wayne.vpn_help_url! } });
    expect(v.subline).toBe('Ask in claude.ai or the Claude app. A worker on the Wayne State grid does the work.');
    expect(v.needs.map((n) => [n.title, n.detail, n.link?.label])).toEqual([
      ['A Wayne State grid account', 'Your AccessID and password.', 'How to get one'],
      ['GlobalProtect', 'Connected to protect.wayne.edu.', 'How to set it up'],
      ['Claude Pro or Max', 'The account you use at claude.ai.', 'See plans'],
    ]);
    expect(v.needs.map((n) => n.link?.url)).toEqual([wayne.grid_account_help_url, wayne.vpn_help_url, 'https://claude.ai/upgrade']);
    expect(v.grids).toEqual({ label: WORDS.welcome.gridPicker, options: grids.options, selected: 'wayne' });
    expect(v.footer.otherPortal).toBe('Another university? Use another portal');
  });

  it('a profile that requires no VPN loses that need; one without help pages keeps the words and loses the links', () => {
    const v = welcomeView({ ...base, grids: { ...grids, selected: 'example' }, site: { grid: 'Example grid', vpnRequired: false, title: 'Example grid', hours: 8 } });
    expect(v.subline).toBe('Ask in claude.ai or the Claude app. A worker on the Example grid does the work.');
    expect(v.needs.map((n) => [n.title, n.link])).toEqual([
      ['An Example grid account', undefined],
      ['Claude Pro or Max', { label: 'See plans', url: 'https://claude.ai/upgrade' }],
    ]);
    expect(v.grids.selected).toBe('example');
  });

  it('a portal with no profile (D20) reads as a university grid with its VPN', () => {
    const v = welcomeView({ ...base, grids: { options: [], selected: '' }, site: { title: 'Grid worker', hours: 8 } });
    expect(v.subline).toBe("Ask in claude.ai or the Claude app. A worker on your university's grid does the work.");
    expect(v.needs.map((n) => [n.title, n.detail])).toEqual([
      ['A grid account', 'Your AccessID and password.'],
      ["Your university's VPN", 'Connected before you start.'],
      ['Claude Pro or Max', 'The account you use at claude.ai.'],
    ]);
  });
});
