// Setting up the cluster in its two modes, against a fake portal that records what is sent: the
// lab's shared copy (one line through the bootstrap shell, nothing uploaded, the exact command the
// page script types), the fallback to the student's own copy when bash cannot open the shared
// launcher or the tool refuses the folder (with the one-line note Details shows, and the 15 s shell
// clock waited out between the two lines), a failure of any other kind reported rather than worked
// around, and a site profile with no shared folder keeping the upload exactly as before.
import { describe, expect, it } from 'vitest';
import { classifyCommand } from '../src/core/audit';
import { commands, paths, sharedInstallFrom, sharedRootOf } from '../src/core/contract';
import { bundledSharedInstall, installFailureWords, installFramework, installNoteOf, sharedUnusable, toolWords } from '../src/core/install';
import type { PortalApi } from '../src/core/portal';

const HOME = '/wsu/home/ab/ab12/ab1234';
const WAYNE_SHARED = '/rs/rs_grp_oschome/shared/ashley/hpcworker/current';
const EXACT = "bash '/rs/rs_grp_oschome/shared/ashley/hpcworker/current/bin/hpcworker' install --shared '/rs/rs_grp_oschome/shared/ashley/hpcworker/current' --profile 'wayne'";

/** the extension's own files as a build carries them; `shared` goes into profiles/wayne.json when given */
function assets(shared?: string | null, extra: Record<string, string> = {}) {
  const files: Record<string, string> = {
    'bin/hpcworker': '#!/bin/bash\necho tool\n',
    VERSION: '5\n',
    'profiles/wayne.json': JSON.stringify({ schema_version: 1, site: 'wayne', shared_state_dir: '/rs/rs_grp_oschome/$USER/hpcworker', ...(shared ? { shared_install: shared } : {}) }),
    ...extra,
  };
  const asked: string[] = [];
  const fetchAsset = async (p: string): Promise<Response> => {
    asked.push(p);
    if (p === '/framework/manifest.json') return Response.json({ v: 1, generated: 'test', files: Object.entries(files).map(([path, body]) => ({ path, bytes: body.length, sha256: '', mode: path.startsWith('bin/') ? '0755' : '0644' })) });
    const rel = p.replace(/^\/framework\/files\//, '');
    return rel in files ? new Response(files[rel]) : new Response('not found', { status: 404 });
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
    // a profile from before framework 5 has no such key: the tool is uploaded as before
    expect(sharedInstallFrom(JSON.stringify({ site: 'wayne' }))).toBeUndefined();
    expect(sharedInstallFrom('not json')).toBeUndefined();
  });

  it('is read from the bundled profile of the site, and only for a plain site name', async () => {
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
    const { p, shells, writes, dirs } = fakePortal([{ exitCode: 0, output: `installed: this account uses the shared copy of hpcworker 5 at ${WAYNE_SHARED} (nothing copied)` }]);
    const r = await installFramework(p, { site: 'wayne', fetchAsset: assets(WAYNE_SHARED).fetchAsset });
    expect(shells).toEqual([EXACT]);
    expect(writes).toEqual([]);
    expect(dirs).toEqual([]);
    expect(r).toMatchObject({ ok: true, exitCode: 0, uploaded: 0, mode: 'shared', sharedDir: WAYNE_SHARED });
    expect(r.note).toBeUndefined();
    expect(r.log).toContain(`running: ${EXACT}`);
    expect(installNoteOf(r, new Date('2026-09-29T20:00:00Z'))).toEqual({ attempted_at: '2026-09-29T20:00:00.000Z', ok: true, detail: `exit 0, your lab's shared copy at ${WAYNE_SHARED}`, mode: 'shared', dir: WAYNE_SHARED });
  });

  it("falls back to the student's own copy when bash cannot open the shared launcher, waiting out the shell clock between the two lines", async () => {
    const slept: number[] = [];
    const { p, shells, writes } = fakePortal([{ exitCode: 126, output: `bash: ${WAYNE_SHARED}/bin/hpcworker: Permission denied` }, { exitCode: 0, output: 'installed hpcworker 5 at ~/.hpcworker' }], [0, 9_000]);
    const r = await installFramework(p, { site: 'wayne', fetchAsset: assets(WAYNE_SHARED).fetchAsset, sleep: async (ms) => void slept.push(ms) });
    expect(shells).toEqual([EXACT, commands.install('wayne')]);
    expect(writes).toEqual([`${HOME}/.hpcworker/bin/hpcworker`, `${HOME}/.hpcworker/VERSION`, `${HOME}/.hpcworker/profiles/wayne.json`]);
    expect(slept).toEqual([9_250]);
    expect(r).toMatchObject({ ok: true, mode: 'own', uploaded: 3, sharedDir: WAYNE_SHARED });
    expect(r.note).toBe(`Your lab's shared copy of the tool at ${WAYNE_SHARED} could not be used from your account: your account may not read it. The tool was put in your own account instead.`);
    const note = installNoteOf(r, new Date('2026-09-29T20:00:00Z'));
    expect(note).toMatchObject({ ok: true, mode: 'own', dir: WAYNE_SHARED, note: r.note, detail: 'exit 0, 3 file(s) uploaded' });
    // the same when the tool itself refused the folder (exit 3), with its reason in the note
    const refused = fakePortal([{ exitCode: 3, output: `hpcworker: the shared copy at ${WAYNE_SHARED} cannot be used from this account: it has no readable VERSION file. Nothing was changed.` }, { exitCode: 0, output: '' }]);
    const r2 = await installFramework(refused.p, { site: 'wayne', fetchAsset: assets(WAYNE_SHARED).fetchAsset });
    expect(r2).toMatchObject({ ok: true, mode: 'own' });
    expect(r2.note).toBe(`Your lab's shared copy of the tool at ${WAYNE_SHARED} could not be used from your account: it has no readable VERSION file. The tool was put in your own account instead.`);
    expect(refused.shells).toHaveLength(2);
  });

  it('reports any other failure of the shared line as it is, uploading nothing (a worker still running from the own copy)', async () => {
    const { p, shells, writes } = fakePortal([{ exitCode: 1, output: `hpcworker: your worker worker (job 123, online) still runs from the copy in ${HOME}/.hpcworker. Stop it first (hpcworker worker stop), then run this again. Nothing was changed.` }]);
    const r = await installFramework(p, { site: 'wayne', fetchAsset: assets(WAYNE_SHARED).fetchAsset });
    expect(shells).toEqual([EXACT]);
    expect(writes).toEqual([]);
    expect(r).toMatchObject({ ok: false, exitCode: 1, uploaded: 0, mode: 'shared' });
    expect(installFailureWords(r)).toMatch(/^your worker is still running from your own copy/);
  });

  it('at a site with no shared folder: the upload and one install line, as before', async () => {
    const { p, shells, writes } = fakePortal([{ exitCode: 0, output: 'installed hpcworker 5' }]);
    const r = await installFramework(p, { site: 'wayne', fetchAsset: assets(null).fetchAsset });
    expect(shells).toEqual([commands.install('wayne')]);
    expect(writes).toHaveLength(3);
    expect(r).toMatchObject({ ok: true, mode: 'own', uploaded: 3 });
    expect(r.sharedDir).toBeUndefined();
    expect(r.note).toBeUndefined();
  });
});

describe('the tool line under Details', () => {
  it('says which copy runs, and for an own copy at a site with a shared one, why or how to move', () => {
    expect(toolWords(undefined)).toEqual([]);
    expect(toolWords({})).toEqual([]);
    expect(toolWords({ installed: false, sharedRoot: WAYNE_SHARED })).toEqual([`tool: not set up yet; your lab keeps a shared copy at ${WAYNE_SHARED}`]);
    expect(toolWords({ installed: true, shared: { dir: WAYNE_SHARED, version: '5' } })).toEqual([`tool: shared copy, version 5 at ${WAYNE_SHARED}`]);
    expect(toolWords({ installed: true, shared: { dir: WAYNE_SHARED, unreadable: "the portal's Files app could not read its VERSION file (403)" } })[0]).toBe(`tool: shared copy, version unknown at ${WAYNE_SHARED} (the portal's Files app could not read its VERSION file (403))`);
    expect(toolWords({ installed: true, version: '5' })).toEqual(['tool: your copy, version 5']);
    expect(toolWords({ installed: true, version: '5', sharedRoot: WAYNE_SHARED })).toEqual(['tool: your copy, version 5', `Your lab keeps a shared copy at ${WAYNE_SHARED}; "Set up the cluster again" moves your account to it.`]);
    const note = { attempted_at: 'x', ok: true, detail: 'exit 0', mode: 'own' as const, dir: WAYNE_SHARED, note: 'could not be used' };
    expect(toolWords({ installed: true, version: '5', sharedRoot: WAYNE_SHARED }, note)).toEqual(['tool: your copy, version 5', 'could not be used']);
    // once the account runs the shared copy, an old fallback note is history and is not shown
    expect(toolWords({ installed: true, shared: { dir: WAYNE_SHARED, version: '5' } }, note)).toHaveLength(1);
  });
});
