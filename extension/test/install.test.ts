// Setting up the cluster, against a fake portal that records what is sent: the lab's shared copy is
// the one way (one line through the bootstrap shell, nothing uploaded, the exact command the page
// script types, the 15 s shell clock waited out first); a site profile with no shared folder types
// nothing and uploads nothing, and says why; a shared copy the account cannot use (bash cannot open
// the launcher, or the tool refuses the folder) uploads nothing either, with the reason in the
// student's words; any other failure is reported as it is.
import { describe, expect, it } from 'vitest';
import { classifyCommand } from '../src/core/audit';
import { commands, paths, sharedInstallFrom, sharedRootOf } from '../src/core/contract';
import { bundledSharedInstall, hideSharedPath, installFailureWords, installFramework, installNoteOf, LAB_COPY, noSharedForSite, profileAsset, sharedUnusable, toolWords } from '../src/core/install';
import type { PortalApi } from '../src/core/portal';

const HOME = '/wsu/home/ab/ab12/ab1234';
const WAYNE_SHARED = '/rs/rs_grp_oschome/shared/ashley/hpcworker/current';
const EXACT = "bash '/rs/rs_grp_oschome/shared/ashley/hpcworker/current/bin/hpcworker' install --shared '/rs/rs_grp_oschome/shared/ashley/hpcworker/current' --profile 'wayne'";

/** the extension's own files as a build carries them: the site profiles only; `shared` goes into profiles/wayne.json when given */
function assets(shared?: string | null) {
  const files: Record<string, string> = {
    '/profiles/wayne.json': JSON.stringify({ schema_version: 1, site: 'wayne', shared_state_dir: '/rs/rs_grp_oschome/$USER/hpcworker', ...(shared ? { shared_install: shared } : {}) }),
  };
  const asked: string[] = [];
  const fetchAsset = async (p: string): Promise<Response> => {
    asked.push(p);
    return p in files ? new Response(files[p]) : new Response('not found', { status: 404 });
  };
  return { fetchAsset, asked };
}

/** a portal that answers the shell lines in turn and records every write and line; auditWait answers from `waits` in turn */
function fakePortal(answers: Array<{ exitCode: number; output: string }>, waits: number[] = []) {
  const shells: string[] = [];
  const writes: string[] = [];
  const dirs: string[] = [];
  const p = {
    home: async () => HOME,
    mkdir: async (d: string) => void dirs.push(d),
    writeFile: async (f: string) => void writes.push(f),
    auditWait: async () => waits.shift() ?? 0,
    shell: async (line: string) => {
      shells.push(line);
      const a = answers.shift() ?? { exitCode: 0, output: '' };
      return { ...a, transcript: a.output, ms: 5 };
    },
  } as unknown as PortalApi;
  return { p, shells, writes, dirs };
}

describe('the shared folder a site profile names', () => {
  it('accepts a plain absolute folder and nothing a shell would read differently', () => {
    expect(sharedRootOf(WAYNE_SHARED)).toBe(WAYNE_SHARED);
    expect(sharedRootOf(`${WAYNE_SHARED}/`)).toBe(WAYNE_SHARED);
    expect(sharedRootOf(' /opt/lab/hpcworker/v5 ')).toBe('/opt/lab/hpcworker/v5');
    for (const bad of ['', 'rs/relative', '/rs/$USER/x', '/rs/a b', "/rs/it's", '/rs/a;rm', '/rs/../etc', '/rs/./x', '~/x', '/', 5, undefined, null]) expect(sharedRootOf(bad), String(bad)).toBeUndefined();
    expect(sharedInstallFrom(JSON.stringify({ site: 'wayne', shared_install: WAYNE_SHARED }))).toBe(WAYNE_SHARED);
    // a profile from before framework 5 has no such key: the site keeps no shared copy
    expect(sharedInstallFrom(JSON.stringify({ site: 'wayne' }))).toBeUndefined();
    expect(sharedInstallFrom('not json')).toBeUndefined();
  });

  it('is read from the bundled profile of the site, at /profiles/<site>.json, and only for a plain site name', async () => {
    expect(profileAsset('wayne')).toBe('/profiles/wayne.json');
    expect(await bundledSharedInstall('wayne', assets(WAYNE_SHARED).fetchAsset)).toBe(WAYNE_SHARED);
    expect(await bundledSharedInstall('wayne', assets(null).fetchAsset)).toBeUndefined();
    expect(await bundledSharedInstall('osc', assets(WAYNE_SHARED).fetchAsset)).toBeUndefined();
    const a = assets(WAYNE_SHARED);
    expect(await bundledSharedInstall('../../manifest', a.fetchAsset)).toBeUndefined();
    expect(a.asked).toEqual([]);
    // an extension page whose own file is missing gets a rejected fetch, not a 404
    expect(await bundledSharedInstall('wayne', async () => Promise.reject(new TypeError('Failed to fetch')))).toBeUndefined();
  });

  it('is linked with exactly one line, a shell line on the 15 s clock, never a scheduler call', () => {
    expect(commands.installShared(WAYNE_SHARED, 'wayne')).toBe(EXACT);
    expect(commands.installShared(WAYNE_SHARED, 'wayne')).not.toMatch(/[\r\n]/);
    expect(classifyCommand(EXACT)).toBe('shell');
    expect(paths.sharedMarker(HOME)).toBe(`${HOME}/.hpcworker/shared`);
    expect(paths.sharedVersion(WAYNE_SHARED)).toBe(`${WAYNE_SHARED}/VERSION`);
    // the own-copy install and its upload are gone: the extension types no other install
    expect(Object.keys(commands)).not.toContain('install');
  });
});

describe('when the shared copy cannot be used', () => {
  it('is told apart from any other failure', () => {
    // bash could not open the launcher: an account outside the lab's group, or a folder not there
    expect(sharedUnusable({ exitCode: 126, output: `bash: ${WAYNE_SHARED}/bin/hpcworker: Permission denied` })).toMatch(/may not read it/);
    expect(sharedUnusable({ exitCode: 127, output: `bash: ${WAYNE_SHARED}/bin/hpcworker: No such file or directory` })).toMatch(/not there/);
    // framework 5 refused the folder (install --shared, exit 3), in its own words, "this account" said as "your account"
    expect(sharedUnusable({ exitCode: 3, output: `hpcworker: the shared copy at ${WAYNE_SHARED} cannot be used from this account: this account cannot open it (it does not exist, or this account is not in the group that may read it). Nothing was changed.` })).toBe('your account cannot open it (it does not exist, or your account is not in the group that may read it)');
    expect(sharedUnusable({ exitCode: 3, output: `hpcworker: the shared copy at ${WAYNE_SHARED} cannot be used from this account: it has no readable VERSION file. Nothing was changed.\r\n` })).toBe('it has no readable VERSION file');
    // its launcher, when the folder became unreadable later
    expect(sharedUnusable({ exitCode: 3, output: `hpcworker: the shared copy at ${WAYNE_SHARED} cannot be read from this account (ask your lab lead to give this account access to it)` })).toBe('your account cannot use it');
    // anything else is the tool's own answer and is reported as it is
    expect(sharedUnusable({ exitCode: 0, output: '' })).toBeUndefined();
    const busy = { exitCode: 1, output: `hpcworker: your worker worker (job 4243102, online) still runs from the copy in ${HOME}/.hpcworker. Stop it first (hpcworker worker stop), then run this again. Nothing was changed.` };
    expect(sharedUnusable(busy)).toBeUndefined();
    expect(sharedUnusable({ exitCode: 1, output: `hpcworker: the shared copy at ${WAYNE_SHARED} has no profile named 'osc' (have: wayne ). Nothing was changed.` })).toBeUndefined();
    expect(sharedUnusable({ exitCode: 1, output: 'hpcworker: install --shared: no shared copy is named here' })).toBeUndefined();
    expect(sharedUnusable({ exitCode: 127, output: 'python3: command not found' })).toBeUndefined();
    // the strip's one line for a failure: a running worker in plain words, anything else by its exit code
    expect(installFailureWords({ exitCode: 1, log: busy.output })).toBe('your worker is still running from your own copy of the tool; stop it (Details), then try again');
    // framework 5 says the same of a probe still under way (live_run's "probe (job N)"); stopping the worker would not help there
    const probeBusy = `hpcworker: your worker probe (job 4243107) still runs from the copy in ${HOME}/.hpcworker. Stop it first (hpcworker worker stop), then run this again. Nothing was changed.`;
    expect(sharedUnusable({ exitCode: 1, output: probeBusy })).toBeUndefined();
    expect(installFailureWords({ exitCode: 1, log: probeBusy })).toBe('the check job on a compute node is still running from your own copy of the tool; try again once it has finished');
    expect(installFailureWords({ exitCode: 2, log: 'something else' })).toBe('the install command ended with exit 2 (see Details)');
  });
});

describe('installing', () => {
  it("at a site with a shared folder: one line, nothing uploaded, the lab's copy", async () => {
    const slept: number[] = [];
    const { p, shells, writes, dirs } = fakePortal([{ exitCode: 0, output: `installed: this account uses the shared copy of hpcworker 5 at ${WAYNE_SHARED} (nothing copied)` }], [9_000]);
    const r = await installFramework(p, { site: 'wayne', fetchAsset: assets(WAYNE_SHARED).fetchAsset, sleep: async (ms) => void slept.push(ms) });
    expect(shells).toEqual([EXACT]);
    expect(writes).toEqual([]);
    expect(dirs).toEqual([]);
    // the shell clock is waited out, not failed on
    expect(slept).toEqual([9_250]);
    expect(r).toMatchObject({ ok: true, exitCode: 0, sharedDir: WAYNE_SHARED });
    expect(r.noShared).toBeUndefined();
    // the line typed is the exact command; what the log shows names the folder in words, never by its path
    expect(r.log).toContain("running the install of the lab's shared copy, one line through the portal's shell; nothing is uploaded");
    expect(r.log).toContain('installed: this account uses the shared copy of hpcworker 5 (nothing copied)');
    expect(r.log).not.toContain('/rs/rs_grp_oschome/shared');
    expect(installNoteOf(r, new Date('2026-09-29T20:00:00Z'))).toEqual({ attempted_at: '2026-09-29T20:00:00.000Z', ok: true, detail: "exit 0, the lab's shared copy", dir: WAYNE_SHARED });
  });

  it('at a site with no shared folder: nothing typed, nothing uploaded, and why', async () => {
    const { p, shells, writes, dirs } = fakePortal([]);
    const r = await installFramework(p, { site: 'wayne', fetchAsset: assets(null).fetchAsset });
    expect(shells).toEqual([]);
    expect(writes).toEqual([]);
    expect(dirs).toEqual([]);
    expect(r).toMatchObject({ ok: false, noShared: noSharedForSite('wayne') });
    expect(r.exitCode).toBeUndefined();
    expect(r.noShared).toBe('no shared copy of the tool is known for the site "wayne" (the site profile name under Settings)');
    expect(installNoteOf(r, new Date('2026-09-29T20:00:00Z'))).toEqual({ attempted_at: '2026-09-29T20:00:00.000Z', ok: false, detail: 'no install line typed', note: `Why: ${r.noShared}.` });
    // a site this build carries no profile for at all reads the same way
    const none = await installFramework(fakePortal([]).p, { site: 'localhost', fetchAsset: assets(WAYNE_SHARED).fetchAsset });
    expect(none.noShared).toBe(noSharedForSite('localhost'));
  });

  it('when the account cannot use the shared copy: nothing uploaded instead, the reason in the student\'s words', async () => {
    const { p, shells, writes } = fakePortal([{ exitCode: 126, output: `bash: ${WAYNE_SHARED}/bin/hpcworker: Permission denied` }]);
    const r = await installFramework(p, { site: 'wayne', fetchAsset: assets(WAYNE_SHARED).fetchAsset });
    expect(shells).toEqual([EXACT]);
    expect(writes).toEqual([]);
    expect(r).toMatchObject({ ok: false, exitCode: 126, sharedDir: WAYNE_SHARED });
    expect(r.noShared).toBe("your lab's shared copy of the tool cannot be used from your account: your account may not read it");
    expect(r.log).toContain(`bash: ${LAB_COPY}: Permission denied`);
    expect(installNoteOf(r, new Date('2026-09-29T20:00:00Z'))).toMatchObject({ ok: false, dir: WAYNE_SHARED, detail: "exit 126, the lab's shared copy", note: `Why: ${r.noShared}.` });
    // the same when the tool itself refused the folder (exit 3), with its reason
    const refused = fakePortal([{ exitCode: 3, output: `hpcworker: the shared copy at ${WAYNE_SHARED} cannot be used from this account: it has no readable VERSION file. Nothing was changed.` }]);
    const r2 = await installFramework(refused.p, { site: 'wayne', fetchAsset: assets(WAYNE_SHARED).fetchAsset });
    expect(r2).toMatchObject({ ok: false, exitCode: 3 });
    expect(r2.noShared).toBe("your lab's shared copy of the tool cannot be used from your account: it has no readable VERSION file");
    expect(r2.log).toContain('hpcworker: the shared copy cannot be used from this account: it has no readable VERSION file.');
    expect(r2.log).not.toContain('/rs/rs_grp_oschome/shared');
    expect(refused.shells).toHaveLength(1);
    expect(refused.writes).toEqual([]);
  });

  it('reports any other failure of the shared line as it is (a worker still running from an own copy)', async () => {
    const { p, shells, writes } = fakePortal([{ exitCode: 1, output: `hpcworker: your worker worker (job 123, online) still runs from the copy in ${HOME}/.hpcworker. Stop it first (hpcworker worker stop), then run this again. Nothing was changed.` }]);
    const r = await installFramework(p, { site: 'wayne', fetchAsset: assets(WAYNE_SHARED).fetchAsset });
    expect(shells).toEqual([EXACT]);
    expect(writes).toEqual([]);
    expect(r).toMatchObject({ ok: false, exitCode: 1 });
    expect(r.noShared).toBeUndefined();
    expect(installFailureWords(r)).toMatch(/^your worker is still running from your own copy/);
  });
});

describe('the tool line under Details', () => {
  it('says which copy runs, why the lab\'s could not be used, and for an own copy at a site with a shared one, how to move', () => {
    expect(toolWords(undefined)).toEqual([]);
    expect(toolWords({})).toEqual([]);
    expect(toolWords({ installed: false, sharedRoot: WAYNE_SHARED })).toEqual(['tool: not set up yet; your lab keeps a shared copy']);
    // no usable shared copy: the reason the strip points to
    expect(toolWords({ installed: false, noSharedCopy: noSharedForSite('localhost') })).toEqual(['tool: not set up yet', 'Why: no shared copy of the tool is known for the site "localhost" (the site profile name under Settings).']);
    const failed = { attempted_at: 'x', ok: false, detail: 'exit 127', dir: WAYNE_SHARED, note: "Why: your lab's shared copy of the tool cannot be used from your account: it is not there, or your account cannot reach it." };
    expect(toolWords({ installed: false, sharedRoot: WAYNE_SHARED }, failed)).toEqual(['tool: not set up yet; your lab keeps a shared copy', failed.note]);
    expect(toolWords({ installed: true, shared: { dir: WAYNE_SHARED, version: '6' } })).toEqual(["tool: the lab's shared copy, version 6"]);
    expect(toolWords({ installed: true, shared: { dir: WAYNE_SHARED, unreadable: "the portal's Files app could not read its VERSION file (403)" } })[0]).toBe("tool: the lab's shared copy, version unknown (the portal's Files app could not read its VERSION file (403))");
    // the Files app's own error names the file it could not read; the line names the folder in words
    expect(toolWords({ installed: true, shared: { dir: WAYNE_SHARED, unreadable: `the portal's Files app could not read its VERSION file (could not read ${WAYNE_SHARED}/VERSION (403))` } })[0]).toBe("tool: the lab's shared copy, version unknown (the portal's Files app could not read its VERSION file (could not read the lab's shared copy (403)))");
    // an own copy, as a build before 8.0.0 left it
    expect(toolWords({ installed: true, version: '5' })).toEqual(['tool: your own copy, version 5']);
    expect(toolWords({ installed: true, version: '5', sharedRoot: WAYNE_SHARED })).toEqual(['tool: your own copy, version 5', 'Your lab keeps a shared copy; "Set up the cluster again" moves your account to it.']);
    expect(toolWords({ installed: true, version: '5', sharedRoot: WAYNE_SHARED }, failed)).toEqual(['tool: your own copy, version 5', failed.note]);
    // no line names a path
    for (const i of [{ installed: false, sharedRoot: WAYNE_SHARED }, { installed: true, shared: { dir: WAYNE_SHARED, version: '6' } }, { installed: true, version: '5', sharedRoot: WAYNE_SHARED }]) {
      for (const line of toolWords(i)) expect(line).not.toMatch(/\/rs\/|\/shared\//);
    }
    // once the account runs the shared copy, an old note is history and is not shown
    expect(toolWords({ installed: true, shared: { dir: WAYNE_SHARED, version: '5' } }, failed)).toHaveLength(1);
  });
});

describe("the lab's folder in words", () => {
  it('drops the path after "shared copy ... at", names any other path under the folder in words, and leaves the home alone', () => {
    expect(hideSharedPath(`installed: this account uses the shared copy of hpcworker 6 at ${WAYNE_SHARED} (nothing copied into ${HOME}/.hpcworker)`, WAYNE_SHARED)).toBe(`installed: this account uses the shared copy of hpcworker 6 (nothing copied into ${HOME}/.hpcworker)`);
    // the numbered copy beside `current` sits under the same parent
    expect(hideSharedPath(`6 (shared copy at ${WAYNE_SHARED.replace(/current$/, 'v6')})`, WAYNE_SHARED)).toBe('6 (shared copy)');
    expect(hideSharedPath(EXACT, WAYNE_SHARED)).toBe(`bash ${LAB_COPY} install --shared ${LAB_COPY} --profile 'wayne'`);
    expect(hideSharedPath(`bash: ${WAYNE_SHARED}/bin/hpcworker: No such file or directory`, WAYNE_SHARED)).toBe(`bash: ${LAB_COPY}: No such file or directory`);
    // a folder whose name only begins like the parent's is another folder
    const sibling = `${WAYNE_SHARED.replace(/\/current$/, 'X')}/y stays`;
    expect(hideSharedPath(sibling, WAYNE_SHARED)).toBe(sibling);
    expect(hideSharedPath('nothing to hide here', undefined)).toBe('nothing to hide here');
  });
});
