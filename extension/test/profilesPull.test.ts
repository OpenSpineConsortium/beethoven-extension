// framework/profiles/pull.sh, the only way the site profiles enter this repository (interface/README.md),
// run end to end against a stand-in for gh that answers from a fixture: no network, no sign-in and no
// checkout of hpcworker. What it must do is what the interface standard says a pull does: refuse a
// provider with no manifest (hpcworker until its interface is merged) and a commit its default branch
// does not contain, take only the paths the export lists, each below the folder they share, write ORIGIN
// with the export line, list what the provider dropped without deleting it, and never hand gh a token
// from the environment. A copy of the script runs in a scratch folder; the repository's own copy is not
// touched. Linux and macOS only, as the release scripts' tests: the maintainer runs it from bash there.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PULL = fileURLToPath(new URL('../../framework/profiles/pull.sh', import.meta.url));
const works = (cmd: string, args: string[]) => {
  try {
    return spawnSync(cmd, args, { encoding: 'utf8' }).status === 0;
  } catch {
    return false;
  }
};
const RUN = process.platform !== 'win32' && works('bash', ['-c', 'true']);
const REPO = 'OpenSpineConsortium/hpcworker';
const SHA = 'c0ffee0000000000000000000000000000000001';
const OLD = '{"site":"wayne","ssh_port":22}\n';
const MANIFEST = JSON.stringify({ format: 1, name: 'hpcworker', exports: [{ id: 'profiles', kind: 'data', version: 1, paths: ['framework/profiles/*.json'] }] });

// gh as pull.sh calls it: five calls, answered from the fixture; every call and whether a token reached it is logged
const FAKE_GH = String.raw`
const fs = require('fs');
const fx = JSON.parse(fs.readFileSync(process.env.FAKE_GH_FIXTURE, 'utf8'));
const a = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify({ args: a, token: !!(process.env.GH_TOKEN || process.env.GITHUB_TOKEN) }) + '\n');
let jq, accept, ep;
for (let i = 1; i < a.length; i++) {
  if (a[i] === '--jq') jq = a[++i];
  else if (a[i] === '-H') accept = a[++i];
  else ep = a[i];
}
const die = () => { process.stderr.write('gh: Not Found (HTTP 404)\n'); process.exit(1); };
const [p, q] = String(ep).split('?');
const parts = p.split('/');
if (a[0] !== 'api' || parts[0] !== 'repos' || parts[1] + '/' + parts[2] !== fx.repo) die();
const rest = parts.slice(3);
if (!rest.length && jq === '.default_branch') { console.log(fx.default); process.exit(0); }
if (rest[0] === 'commits' && jq === '.sha') { if (!fx.refs[rest[1]]) die(); console.log(fx.refs[rest[1]]); process.exit(0); }
if (rest[0] === 'compare' && jq === '.status') { console.log(fx.compare[rest[1].split('...')[1]] || 'diverged'); process.exit(0); }
if (rest[0] === 'git' && rest[1] === 'trees' && q === 'recursive=1' && jq === '.tree[] | select(.type == "blob") | .path') { console.log(Object.keys(fx.files).join('\n')); process.exit(0); }
if (rest[0] === 'contents' && accept === 'Accept: application/vnd.github.raw' && q === 'ref=' + fx.sha) {
  const f = rest.slice(1).join('/');
  if (!(f in fx.files)) die();
  process.stdout.write(fx.files[f]);
  process.exit(0);
}
die();
`;

interface Fixture {
  repo?: string;
  sha?: string;
  default?: string;
  refs?: Record<string, string>;
  compare?: Record<string, string>;
  files: Record<string, string>;
}

/** a scratch folder holding a copy of framework/profiles (pull.sh, an ORIGIN, wayne.json, a README) and the stand-in gh */
function scratch(fx: Fixture) {
  const T = mkdtempSync(path.join(os.tmpdir(), 'beethoven-pull-'));
  const folder = path.join(T, 'framework', 'profiles');
  mkdirSync(folder, { recursive: true });
  copyFileSync(PULL, path.join(folder, 'pull.sh'));
  writeFileSync(path.join(folder, 'wayne.json'), OLD);
  writeFileSync(path.join(folder, 'README.md'), 'the folder\'s own README\n');
  writeFileSync(path.join(folder, 'ORIGIN'), `repository ${REPO}\ncommit ${'a'.repeat(40)}\nsha256 ${createHash('sha256').update(OLD).digest('hex')} wayne.json\n`);
  const bin = path.join(T, 'bin');
  mkdirSync(bin);
  writeFileSync(path.join(T, 'gh.cjs'), FAKE_GH);
  writeFileSync(path.join(bin, 'gh'), `#!/bin/bash\nexec "$FAKE_GH_NODE" "$FAKE_GH_JS" "$@"\n`);
  chmodSync(path.join(bin, 'gh'), 0o755);
  writeFileSync(path.join(T, 'fixture.json'), JSON.stringify({ repo: REPO, sha: SHA, default: 'main', refs: { main: SHA }, compare: { [SHA]: 'identical' }, ...fx }));
  const log = path.join(T, 'gh.log');
  writeFileSync(log, '');
  const before = snapshot(folder);
  const run = (...args: string[]) => {
    const r = spawnSync('bash', [path.join(folder, 'pull.sh'), ...args], {
      encoding: 'utf8',
      timeout: 60_000,
      // a token in the environment, as a shell or another tool may leave one: it must never reach gh
      env: { ...process.env, PATH: [bin, path.dirname(process.execPath), process.env.PATH ?? ''].join(path.delimiter), GH_TOKEN: 'from-the-environment', GITHUB_TOKEN: 'from-the-environment', FAKE_GH_NODE: process.execPath, FAKE_GH_JS: path.join(T, 'gh.cjs'), FAKE_GH_FIXTURE: path.join(T, 'fixture.json'), FAKE_GH_LOG: log },
    });
    const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { args: string[]; token: boolean });
    return { code: r.status, out: r.stdout, err: r.stderr, calls };
  };
  return { folder, before, run };
}

/** every file of the folder and its bytes */
function snapshot(folder: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else out[path.relative(folder, full).split(path.sep).join('/')] = readFileSync(full, 'utf8');
    }
  };
  walk(folder);
  return out;
}

describe.skipIf(!RUN)(RUN ? 'framework/profiles/pull.sh' : 'framework/profiles/pull.sh (skipped: needs bash on Linux or macOS)', () => {
  it('refuses a provider with no interface/INTERFACE.json at the commit, in plain words, and leaves the copy as it was', () => {
    const s = scratch({ files: { 'framework/profiles/wayne.json': '{"site":"wayne"}\n' } });
    const r = s.run();
    expect(r.code, r.err).toBe(1);
    expect(r.err).toContain(`FAILED: ${REPO} has no interface/INTERFACE.json at ${SHA}, so it offers no export to take there. Until its interface is merged on main, the copy here stays as ORIGIN records it.`);
    expect(snapshot(s.folder)).toEqual(s.before);
    expect(r.calls.length).toBeGreaterThan(0);
    expect(r.calls.filter((c) => c.token), 'a token from the environment reached gh').toEqual([]);
  });

  it('refuses a commit the default branch does not contain (a pull request\'s branch)', () => {
    const s = scratch({ refs: { main: SHA, 'some-branch': 'b'.repeat(40) }, compare: { [SHA]: 'identical', ['b'.repeat(40)]: 'ahead' }, files: { 'interface/INTERFACE.json': MANIFEST } });
    const r = s.run('--ref', 'some-branch');
    expect(r.code, r.err).toBe(1);
    expect(r.err).toContain(`is not on ${REPO}'s main; take only what was merged there`);
    expect(snapshot(s.folder)).toEqual(s.before);
  });

  it('refuses a manifest that does not offer profiles version 1, naming what it does offer', () => {
    const other = JSON.stringify({ format: 1, exports: [{ id: 'profiles', kind: 'data', version: 2, paths: ['framework/profiles/*.json'] }, { id: 'contract', version: 1, paths: ['interface/contract/'] }] });
    const s = scratch({ files: { 'interface/INTERFACE.json': other, 'framework/profiles/wayne.json': '{"site":"wayne"}\n' } });
    const r = s.run();
    expect(r.code, r.err).toBe(1);
    expect(r.err).toContain('it does not offer profiles version 1 (offered: profiles 2, contract 1)');
    expect(snapshot(s.folder)).toEqual(s.before);
  });

  it('takes only the files the export lists, each below the folder the paths share, writes ORIGIN with the export line, and deletes nothing', () => {
    const files = {
      'interface/INTERFACE.json': MANIFEST,
      'framework/bin/hpcworker': '#!/bin/bash\n',
      'framework/profiles/README.md': 'hpcworker\'s own README, not in the export\n',
      'framework/profiles/other.json': '{"site":"other"}\n',
      'framework/profiles/sub/deeper.json': '{"site":"deeper"}\n',
      'framework/profiles/wayne.json': '{"site":"wayne","ssh_port":22,"new":true}\n',
      'framework/sites/wayne/site.json': '{"kind":"site"}\n',
    };
    const s = scratch({ files });
    writeFileSync(path.join(s.folder, 'gone.json'), '{"site":"gone"}\n');
    const r = s.run();
    expect(r.code, r.err).toBe(0);
    const after = snapshot(s.folder);
    expect(Object.keys(after).sort()).toEqual(['ORIGIN', 'README.md', 'gone.json', 'other.json', 'pull.sh', 'wayne.json']);
    expect(after['wayne.json']).toBe(files['framework/profiles/wayne.json']);
    expect(after['other.json']).toBe(files['framework/profiles/other.json']);
    expect(after['README.md'], "the folder's own README is never the provider's").toBe(s.before['README.md']);
    expect(after['gone.json'], 'nothing is deleted').toBe('{"site":"gone"}\n');
    const sha = (t: string) => createHash('sha256').update(t).digest('hex');
    expect(after['ORIGIN']).toBe([`repository ${REPO}`, `commit ${SHA}`, 'export profiles 1', `sha256 ${sha(files['framework/profiles/other.json'])} other.json`, `sha256 ${sha(files['framework/profiles/wayne.json'])} wayne.json`, ''].join('\n'));
    expect(r.out).toContain(`not in ${REPO}'s export profiles any more: framework/profiles/gone.json (remove it in a reviewed commit)`);
    expect(existsSync(path.join(s.folder, 'sub')), 'a * never crosses a /').toBe(false);
    expect(r.calls.filter((c) => c.token), 'a token from the environment reached gh').toEqual([]);
    // every call names hpcworker and nothing else, and every file is read at the one commit
    for (const c of r.calls) expect(c.args.find((x) => x.startsWith('repos/'))).toMatch(new RegExp(`^repos/${REPO}(/|$)`));
    for (const c of r.calls.filter((x) => x.args.some((y) => y.includes('/contents/')))) expect(c.args.find((x) => x.includes('/contents/'))).toMatch(new RegExp(`\\?ref=${SHA}$`));
  });

  it('refuses a file of the export that is not a JSON object, and leaves the copy as it was', () => {
    const s = scratch({ files: { 'interface/INTERFACE.json': MANIFEST, 'framework/profiles/other.json': '{"site":"other"}\n', 'framework/profiles/wayne.json': '[1, 2]\n' } });
    const r = s.run();
    expect(r.code, r.err).toBe(1);
    expect(r.err).toContain('framework/profiles/wayne.json at');
    expect(r.err).toContain('is not a JSON object');
    expect(snapshot(s.folder)).toEqual(s.before);
  });

  it("never lets the provider's files land on the folder's own ORIGIN, README.md or pull.sh", () => {
    const wide = JSON.stringify({ format: 1, exports: [{ id: 'profiles', kind: 'data', version: 1, paths: ['framework/profiles/'] }] });
    const s = scratch({ files: { 'interface/INTERFACE.json': wide, 'framework/profiles/pull.sh': 'echo replaced\n', 'framework/profiles/wayne.json': '{"site":"wayne"}\n' } });
    const r = s.run();
    expect(r.code, r.err).toBe(1);
    expect(r.err).toContain('framework/profiles/pull.sh would overwrite pull.sh, which this folder keeps for itself');
    expect(snapshot(s.folder)).toEqual(s.before);
  });

  it('answers a wrong argument with its usage', () => {
    const s = scratch({ files: {} });
    const r = s.run('--from', 'a-checkout');
    expect(r.code).toBe(2);
    expect(r.err).toContain('usage:');
    expect(r.calls).toEqual([]);
  });
});
