// interface/pull.sh, the only way another repository's export enters this one (interface/README.md), run
// end to end against a stand-in for gh that answers from a fixture: no network, no sign-in and no checkout
// of hpcworker. What it must do is what the interface standard says a pull does: read the import from this
// repository's manifest, refuse a provider with no manifest and a commit its default branch does not
// contain, take only the paths the export lists at the version the import names, each below the folder
// they share and with the mode the provider's tree records, write ORIGIN with the export line, list what
// the provider dropped without deleting it, and take a program folder's files again at its ORIGIN's commit.
// gh signs in as it does for the person (GH_TOKEN and GITHUB_TOKEN left as they are), and nothing puts a
// token on a command line. A copy of the script runs in a scratch tree; the repository's own copy is not
// touched. Linux and macOS only, as the release scripts' tests: the maintainer runs it from bash there.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PULL = fileURLToPath(new URL('../../interface/pull.sh', import.meta.url));
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
const PINNED = 'a'.repeat(40);
const OLD = '{"site":"wayne","ssh_port":22}\n';
const TOKEN = 'from-the-environment';
const STAND_IN = '.stand-in';
const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const PROVIDER = (exports: unknown[]) => JSON.stringify({ format: 1, name: 'hpcworker', exports });
const PROFILES = { id: 'profiles', kind: 'data', version: 1, paths: ['framework/profiles/*.json'] };
const FRAMEWORK = { id: 'framework', kind: 'program', version: 1, paths: ['framework/bin/', 'framework/lib/', 'framework/README.md'] };
// this repository's own manifest in the scratch tree: two imports, a data copy and a program folder
const OURS = JSON.stringify({
  format: 1,
  name: 'beethoven-extension',
  imports: [
    { repository: REPO, export: 'profiles', version: 1, into: 'framework/profiles', origin: 'framework/profiles/ORIGIN' },
    { repository: REPO, export: 'framework', version: 1, into: 'framework/shared-copy', origin: 'framework/shared-copy/ORIGIN' },
  ],
});

// gh as pull.sh calls it, answered from the fixture; every call, and whether the environment's token was there, is logged
const FAKE_GH = String.raw`
const fs = require('fs');
const fx = JSON.parse(fs.readFileSync(process.env.FAKE_GH_FIXTURE, 'utf8'));
const a = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify({ args: a, token: process.env.GH_TOKEN === 'from-the-environment' && process.env.GITHUB_TOKEN === 'from-the-environment' }) + '\n');
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
if (rest[0] === 'git' && rest[1] === 'trees' && rest[2] === fx.sha && q === 'recursive=1' && jq.includes('.tree[]') && jq.includes('.truncated')) {
  if (fx.truncated) console.log('truncated');
  for (const f of Object.keys(fx.files)) console.log((fx.modes[f] || '100644') + ' ' + f);
  process.exit(0);
}
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
  truncated?: boolean;
  modes?: Record<string, string>;
  files: Record<string, string>;
}

/** a scratch tree: interface/ (a copy of pull.sh, our manifest), framework/profiles (an ORIGIN, wayne.json, its own README), framework/shared-copy (ORIGIN alone), and the stand-in gh */
function scratch(fx: Fixture) {
  const T = mkdtempSync(path.join(os.tmpdir(), 'beethoven-pull-'));
  mkdirSync(path.join(T, 'interface'));
  copyFileSync(PULL, path.join(T, 'interface', 'pull.sh'));
  writeFileSync(path.join(T, 'interface', 'INTERFACE.json'), OURS);
  const folder = path.join(T, 'framework', 'profiles');
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'wayne.json'), OLD);
  writeFileSync(path.join(folder, 'README.md'), "the folder's own README\n");
  writeFileSync(path.join(folder, 'ORIGIN'), `repository ${REPO}\ncommit ${PINNED}\nexport profiles 1\nsha256 ${sha(OLD)} wayne.json\n`);
  const program = path.join(T, 'framework', 'shared-copy');
  mkdirSync(program);
  writeFileSync(path.join(program, 'ORIGIN'), `repository ${REPO}\ncommit ${SHA}\nexport framework 1\n`);
  // the stand-in's own files, which no snapshot looks at
  const S = path.join(T, STAND_IN);
  const bin = path.join(S, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(S, 'gh.cjs'), FAKE_GH);
  writeFileSync(path.join(bin, 'gh'), `#!/bin/bash\nexec "$FAKE_GH_NODE" "$FAKE_GH_JS" "$@"\n`);
  chmodSync(path.join(bin, 'gh'), 0o755);
  const fixture = path.join(S, 'fixture.json');
  const set = (more: Partial<Fixture>) => writeFileSync(fixture, JSON.stringify({ repo: REPO, sha: SHA, default: 'main', refs: { main: SHA }, compare: { [SHA]: 'identical' }, modes: {}, ...fx, ...more }));
  set({});
  const log = path.join(S, 'gh.log');
  writeFileSync(log, '');
  const before = snapshot(T);
  const run = (...args: string[]) => {
    writeFileSync(log, '');
    const r = spawnSync('bash', [path.join(T, 'interface', 'pull.sh'), ...args], {
      encoding: 'utf8',
      timeout: 60_000,
      // gh's own sign-in, as a shell or a cloud session has it: the pull leaves it as it is
      env: { ...process.env, PATH: [bin, path.dirname(process.execPath), process.env.PATH ?? ''].join(path.delimiter), GH_TOKEN: TOKEN, GITHUB_TOKEN: TOKEN, FAKE_GH_NODE: process.execPath, FAKE_GH_JS: path.join(S, 'gh.cjs'), FAKE_GH_FIXTURE: fixture, FAKE_GH_LOG: log },
    });
    const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { args: string[]; token: boolean });
    return { code: r.status, out: r.stdout, err: r.stderr, calls };
  };
  return { root: T, folder, program, before, run, set };
}

/** every file under a folder and its bytes, but the stand-in's own */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.name === STAND_IN) continue;
      if (e.isDirectory()) walk(full);
      else out[path.relative(root, full).split(path.sep).join('/')] = readFileSync(full, 'utf8');
    }
  };
  walk(root);
  return out;
}
const exec = (f: string) => (statSync(f).mode & 0o111) !== 0;

describe.skipIf(!RUN)(RUN ? 'interface/pull.sh' : 'interface/pull.sh (skipped: needs bash on Linux or macOS)', () => {
  it('refuses a provider with no interface/INTERFACE.json at the commit, in plain words, and leaves the copy as it was', () => {
    const s = scratch({ files: { 'framework/profiles/wayne.json': '{"site":"wayne"}\n' } });
    const r = s.run('framework/profiles');
    expect(r.code, r.err).toBe(1);
    expect(r.err).toContain(`FAILED: ${REPO} has no interface/INTERFACE.json at ${SHA}, so it offers no export to take there. Until its interface is merged on main, framework/profiles stays as its ORIGIN records it.`);
    expect(snapshot(s.root)).toEqual(s.before);
  });

  it("refuses a commit the default branch does not contain (a pull request's branch)", () => {
    const s = scratch({ refs: { main: SHA, 'some-branch': 'b'.repeat(40) }, compare: { [SHA]: 'identical', ['b'.repeat(40)]: 'ahead' }, files: { 'interface/INTERFACE.json': PROVIDER([PROFILES]) } });
    const r = s.run('--ref', 'some-branch', 'framework/profiles');
    expect(r.code, r.err).toBe(1);
    expect(r.err).toContain(`is not on ${REPO}'s main; take only what was merged there`);
    expect(snapshot(s.root)).toEqual(s.before);
  });

  it('refuses a manifest that does not offer the export at the version the import names, naming what it does offer', () => {
    const s = scratch({ files: { 'interface/INTERFACE.json': PROVIDER([{ ...PROFILES, version: 2 }, { id: 'contract', version: 1, paths: ['interface/contract/'] }]), 'framework/profiles/wayne.json': '{"site":"wayne"}\n' } });
    const r = s.run('framework/profiles');
    expect(r.code, r.err).toBe(1);
    expect(r.err).toContain('it does not offer profiles version 1 (offered: profiles 2, contract 1)');
    expect(snapshot(s.root)).toEqual(s.before);
  });

  it('takes only the files the export lists, each below the folder the paths share, writes ORIGIN with the export line, and deletes nothing', () => {
    const files = {
      'interface/INTERFACE.json': PROVIDER([PROFILES, FRAMEWORK]),
      'framework/bin/hpcworker': '#!/bin/bash\n',
      'framework/profiles/README.md': "hpcworker's own README, not in the export\n",
      'framework/profiles/other.json': '{"site":"other"}\n',
      'framework/profiles/sub/deeper.json': '{"site":"deeper"}\n',
      'framework/profiles/wayne.json': '{"site":"wayne","ssh_port":22,"new":true}\n',
      'framework/sites/wayne/site.json': '{"kind":"site"}\n',
    };
    const s = scratch({ files });
    writeFileSync(path.join(s.folder, 'gone.json'), '{"site":"gone"}\n');
    const r = s.run('framework/profiles');
    expect(r.code, r.err).toBe(0);
    const after = snapshot(s.folder);
    expect(Object.keys(after).sort()).toEqual(['ORIGIN', 'README.md', 'gone.json', 'other.json', 'wayne.json']);
    expect(after['wayne.json']).toBe(files['framework/profiles/wayne.json']);
    expect(after['other.json']).toBe(files['framework/profiles/other.json']);
    expect(after['README.md'], "the folder's own README is never the provider's").toBe("the folder's own README\n");
    expect(after['gone.json'], 'nothing is deleted').toBe('{"site":"gone"}\n');
    expect(after['ORIGIN']).toBe([`repository ${REPO}`, `commit ${SHA}`, 'export profiles 1', `sha256 ${sha(files['framework/profiles/other.json'])} other.json`, `sha256 ${sha(files['framework/profiles/wayne.json'])} wayne.json`, ''].join('\n'));
    expect(r.out).toContain(`not in ${REPO}'s export profiles any more: framework/profiles/gone.json (remove it in a reviewed commit)`);
    expect(existsSync(path.join(s.folder, 'sub')), 'a * never crosses a /').toBe(false);
    // the program folder was not named, so it is as it was
    expect(snapshot(s.program)).toEqual({ ORIGIN: s.before['framework/shared-copy/ORIGIN'] });
    // every call names hpcworker and nothing else, every file is read at the one commit, and gh signs in as it
    // does for the person, with nothing of a token on any command line
    for (const c of r.calls) expect(c.args.find((x) => x.startsWith('repos/'))).toMatch(new RegExp(`^repos/${REPO}(/|$)`));
    for (const c of r.calls.filter((x) => x.args.some((y) => y.includes('/contents/')))) expect(c.args.find((x) => x.includes('/contents/'))).toMatch(new RegExp(`\\?ref=${SHA}$`));
    expect(r.calls.every((c) => c.token), 'GH_TOKEN and GITHUB_TOKEN reach gh as the person set them').toBe(true);
    expect(r.calls.filter((c) => c.args.some((x) => x.includes(TOKEN))), 'a token on a command line').toEqual([]);
    expect(r.out + r.err).not.toContain(TOKEN);
  });

  it("takes a program folder again at its ORIGIN's commit, with the provider's executable bit and the export's own README", () => {
    const files = {
      'interface/INTERFACE.json': PROVIDER([PROFILES, FRAMEWORK]),
      'framework/README.md': "the framework's README\n",
      'framework/bin/hpcworker': '#!/bin/bash\necho hpcworker\n',
      'framework/lib/common.sh': 'x=1\n',
      'framework/profiles/wayne.json': '{"site":"wayne"}\n',
    };
    // main has moved on: --at-origin still takes the commit ORIGIN names
    const s = scratch({ refs: { main: 'd'.repeat(40) }, compare: { [SHA]: 'behind' }, modes: { 'framework/bin/hpcworker': '100755' }, files });
    const r = s.run('--at-origin', 'framework/shared-copy');
    expect(r.code, r.err).toBe(0);
    expect(r.calls.some((c) => c.args.some((x) => x.includes('/commits/'))), '--at-origin asks for no ref').toBe(false);
    const after = snapshot(s.program);
    expect(Object.keys(after).sort()).toEqual(['ORIGIN', 'README.md', 'bin/hpcworker', 'lib/common.sh']);
    expect(after['README.md']).toBe(files['framework/README.md']);
    expect(exec(path.join(s.program, 'bin', 'hpcworker'))).toBe(true);
    expect(exec(path.join(s.program, 'lib', 'common.sh'))).toBe(false);
    expect(after['ORIGIN']).toBe([`repository ${REPO}`, `commit ${SHA}`, 'export framework 1', `sha256 ${sha(files['framework/README.md'])} README.md`, `sha256 ${sha(files['framework/bin/hpcworker'])} bin/hpcworker`, `sha256 ${sha(files['framework/lib/common.sh'])} lib/common.sh`, ''].join('\n'));
    // again: the README its ORIGIN lists is the export's, and is taken like any other file
    const again = s.run('--at-origin', 'framework/shared-copy');
    expect(again.code, again.err).toBe(0);
    expect(snapshot(s.program)).toEqual(after);
    expect(again.out).not.toContain('any more');
  });

  it('takes several folders in one run, each as its own import', () => {
    const files = { 'interface/INTERFACE.json': PROVIDER([PROFILES, FRAMEWORK]), 'framework/README.md': 'r\n', 'framework/bin/hpcworker': 'h\n', 'framework/profiles/wayne.json': '{"site":"wayne","x":1}\n' };
    const s = scratch({ files });
    const r = s.run('framework/profiles', 'framework/shared-copy/');
    expect(r.code, r.err).toBe(0);
    expect(readFileSync(path.join(s.folder, 'ORIGIN'), 'utf8')).toContain('export profiles 1\n');
    expect(readFileSync(path.join(s.program, 'ORIGIN'), 'utf8')).toContain('export framework 1\n');
    expect(readFileSync(path.join(s.program, 'bin', 'hpcworker'), 'utf8')).toBe('h\n');
  });

  it('refuses a link, a listing too large to read whole, and a file of the export that is not a JSON object, leaving everything as it was', () => {
    const base = { 'interface/INTERFACE.json': PROVIDER([PROFILES, FRAMEWORK]), 'framework/README.md': 'r\n', 'framework/bin/hpcworker': 'h\n', 'framework/profiles/wayne.json': '{"site":"wayne"}\n' };
    const link = scratch({ modes: { 'framework/bin/hpcworker': '120000' }, files: base });
    let r = link.run('framework/shared-copy');
    expect(r.code, r.err).toBe(1);
    expect(r.err).toContain('framework/bin/hpcworker is not a regular file at that commit (mode 120000)');
    expect(snapshot(link.root)).toEqual(link.before);
    const big = scratch({ truncated: true, files: base });
    r = big.run('framework/profiles');
    expect(r.code, r.err).toBe(1);
    expect(r.err).toContain('too large for one listing');
    expect(snapshot(big.root)).toEqual(big.before);
    const notObject = scratch({ files: { ...base, 'framework/profiles/other.json': '{"site":"other"}\n', 'framework/profiles/wayne.json': '[1, 2]\n' } });
    r = notObject.run('framework/profiles');
    expect(r.code, r.err).toBe(1);
    expect(r.err).toContain('framework/profiles/wayne.json at');
    expect(r.err).toContain('is not a JSON object');
    expect(snapshot(notObject.root)).toEqual(notObject.before);
  });

  it("never lets the provider's files land on a folder's own ORIGIN, README.md or pull.sh", () => {
    const wide = PROVIDER([{ ...PROFILES, paths: ['framework/profiles/'] }]);
    for (const own of ['README.md', 'pull.sh', 'ORIGIN']) {
      const s = scratch({ files: { 'interface/INTERFACE.json': wide, [`framework/profiles/${own}`]: 'replaced\n', 'framework/profiles/wayne.json': '{"site":"wayne"}\n' } });
      const r = s.run('framework/profiles');
      expect(r.code, r.err).toBe(1);
      expect(r.err).toContain(`framework/profiles/${own} would overwrite ${own}, which this folder keeps for itself`);
      expect(snapshot(s.root)).toEqual(s.before);
    }
  });

  it('answers a wrong argument with its usage, and a folder that is no import with the imports there are', () => {
    const s = scratch({ files: {} });
    let r = s.run('--from', 'a-checkout');
    expect(r.code).toBe(2);
    expect(r.err).toContain('usage:');
    r = s.run();
    expect(r.code).toBe(2);
    expect(r.err).toContain('usage:');
    expect(r.calls).toEqual([]);
    r = s.run('framework/elsewhere');
    expect(r.code).toBe(1);
    expect(r.err).toContain('interface/INTERFACE.json names no import into framework/elsewhere (imports: framework/profiles, framework/shared-copy)');
    expect(r.calls).toEqual([]);
  });

  it("--at-origin refuses an ORIGIN that names another repository", () => {
    const s = scratch({ files: {} });
    writeFileSync(path.join(s.program, 'ORIGIN'), `repository OpenSpineConsortium/beethoven-sites\ncommit ${SHA}\nexport framework 1\n`);
    const r = s.run('--at-origin', 'framework/shared-copy');
    expect(r.code).toBe(1);
    expect(r.err).toContain(`framework/shared-copy/ORIGIN does not name ${REPO}`);
    expect(r.calls).toEqual([]);
  });
});
