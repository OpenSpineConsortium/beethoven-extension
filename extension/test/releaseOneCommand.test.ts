// The one command of a release (helper/release/release.sh) and its one-time setup (helper/release/setup-mac.sh),
// run on Linux. release.sh runs against a temporary copy of the repository, committed on main, never this
// checkout: its --dry-run plan (the steps in order, release.json's names in the right flags, nothing run), its
// refusals (release.json, a dirty tree, another branch, an existing record, a missing script), and a whole run
// against stand-ins for every tool that only a Mac, Apple, Azure or the store can be (setup check, npm, npx,
// both installer scripts, the upload), with the real helper/build.mjs merging the two stand-in packages and real
// git, zip and unzip: the record it writes, the tracked bridge files put back, and what a failure leaves.
// setup-mac.sh runs with PATH holding nothing, then with stand-ins for every tool it asks about. Nothing here has
// run on a Mac: the bash 3.2 that macOS ships, Apple's and Azure's answers, Homebrew's formulae and the store's
// upload are not yet measured; a static search for the bash 4 constructs stands in for bash 3.2.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIR = path.join(ROOT, 'helper', 'release');
const RELEASE = path.join(DIR, 'release.sh');
const SETUP = path.join(DIR, 'setup-mac.sh');
const CONFIG_JS = path.join(DIR, 'release-config.mjs');
const EXAMPLE = path.join(DIR, 'release.example.json');
const README = path.join(DIR, 'README.md');
// written by another stream; the tests that put a check here side by side with it run once it is in the checkout
const MSI_MAC = path.join(DIR, 'windows', 'build-msi-mac.sh');
const VERSION = (JSON.parse(readFileSync(path.join(ROOT, 'extension', 'package.json'), 'utf8')) as { version: string }).version;

const works = (cmd: string, args: string[]) => spawnSync(cmd, args, { encoding: 'utf8' }).status === 0;
const RUN = process.platform !== 'win32' && works('bash', ['-c', 'true']) && works('git', ['--version']);
const ZIPS = RUN && works('zip', ['-v']) && works('unzip', ['-v']);
const PTY = RUN && process.platform === 'linux' && works('script', ['--version']);
const BASH = RUN ? spawnSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim() : 'bash';

const ID = 'abcdefghijklmnopabcdefghijklmnop';
const PUB = 'pub-0123456789';
const APP = 'Developer ID Application: Test Maker (TEAMID0000)';
const INST = 'Developer ID Installer: Test Maker (TEAMID0000)';
const PROFILE = 'beethoven-notary';
const EP = 'https://eus.codesigning.azure.net';
const ACCOUNT = 'testacct';
const CERT = 'testprofile';
const NAMES = {
  store_id: ID,
  publisher_id: PUB,
  mac: { app_identity: APP, installer_identity: INST, notary_profile: PROFILE },
  windows: { azure_endpoint: EP, azure_account: ACCOUNT, azure_profile: CERT },
};
// what a token looks like; both sit in every run's environment and must never reach the output
const SENTINELS = { AZURE_ACCESS_TOKEN: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.sentinel-azure', GOOGLE_REFRESH: '1//0sentinel-google-refresh' };
const SECRET_SHAPES = [/eyJ[A-Za-z0-9_-]{8,}/, /ya29\./, /1\/\/0[A-Za-z0-9_-]{6,}/, /-----BEGIN/, /client_secret|refresh_token|access_token|storepass/i];
// a long run of key-shaped characters; a run of lower-case hex is a digest or a commit, which the output names on purpose
const LONG_RUN = /[A-Za-z0-9+=_-]{40,}/g;
const REL = `release/${VERSION}`;
const ZIP_NAME = `beethoven-${VERSION}-chrome.zip`;
const SIX = ['beethoven-bridge-linux.zip', 'beethoven-bridge-mac.pkg', 'beethoven-bridge-mac.zip', 'beethoven-bridge-windows.msi', 'beethoven-bridge-windows.zip', 'manifest.json'];

let T: string;
beforeAll(() => {
  T = mkdtempSync(path.join(tmpdir(), 'beethoven-onecommand-'));
});
afterAll(() => {
  if (T) rmSync(T, { recursive: true, force: true });
});

const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const mode = (p: string) => statSync(p).mode & 0o777;
const git = (repo: string, ...args: string[]) => spawnSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });

function writeExec(p: string, body: string): void {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, body);
  chmodSync(p, 0o755);
}

/** a vendor folder holding release.json (an object is written as JSON, a string as it is, null: none) and, with token, the store sign-in's two files */
function vendor(label: string, names: unknown = NAMES, token = true): string {
  const v = path.join(T, label, 'vendor');
  mkdirSync(v, { recursive: true });
  if (names !== null) writeFileSync(path.join(v, 'release.json'), typeof names === 'string' ? names : JSON.stringify(names, null, 2));
  if (token) {
    mkdirSync(path.join(v, 'chrome-web-store'), { recursive: true });
    for (const f of ['client.json', 'token.json']) writeFileSync(path.join(v, 'chrome-web-store', f), '{"stand-in":true}\n');
  }
  return v;
}

// Every stand-in records its name and arguments, tab-separated, one line per call, in $SHIM_LOG.
const LOGLINE = `{ printf '%s' "\${0##*/}"; for a in "$@"; do printf '\\t%s' "$a"; done; printf '\\n'; } >> "$SHIM_LOG"\n`;

// the stand-ins for the steps release.sh calls inside the repository
const REPO_STUBS: Record<string, string> = {
  'helper/release/setup-mac.sh': `#!/bin/bash
${LOGLINE}if [ "\${SHIM_SETUP_MISSING:-0}" = 1 ]; then printf '  missing  Homebrew\\n\\nMissing: 1.\\n'; exit 3; fi
printf 'Everything a release needs is on this Mac.\\n'
`,
  'helper/release/mac/build-pkg.sh': `#!/bin/bash
${LOGLINE}id=; while [ $# -gt 0 ]; do case "$1" in --store-id) id=$2; shift 2 ;; *) shift ;; esac; done
mkdir -p helper/signed
printf 'a notarized package (stand-in)\\n' > helper/signed/beethoven-bridge-mac.pkg
node "$SHIM_DIR/sidecar.mjs" helper/signed/beethoven-bridge-mac.pkg mac developer-id-notarized "$id"
`,
  'helper/release/windows/build-msi-mac.sh': `#!/bin/bash
${LOGLINE}id=; while [ $# -gt 0 ]; do case "$1" in --store-id) id=$2; shift 2 ;; *) shift ;; esac; done
if [ "\${SHIM_MSI_SILENT:-0}" = 1 ]; then exit 0; fi
mkdir -p helper/signed
printf 'an authenticode-signed package (stand-in)\\n' > helper/signed/beethoven-bridge-windows.msi
node "$SHIM_DIR/sidecar.mjs" helper/signed/beethoven-bridge-windows.msi windows authenticode "$id"
`,
  'helper/release/publish-store.mjs': `import fs from 'node:fs';
fs.appendFileSync(process.env.SHIM_LOG, ['publish-store.mjs', ...process.argv.slice(2)].join('\\t') + '\\n');
if (process.env.SHIM_UPLOAD_FAIL === '1') { console.error('The store did not take the upload (stand-in).'); process.exit(1); }
console.log('Uploaded; submitted for review (stand-in).');
`,
};

// the stand-ins on PATH, for what release.sh runs from extension/
const PATH_STUBS: Record<string, string> = {
  npm: `#!/bin/bash
${LOGLINE}case "$*" in
  --version) printf '10.9.0 (stand-in)\n' ;;
  ci|"run sync-profiles") ;;
  "run zip")
    v=$(node -p 'require("./package.json").version')
    rm -rf .output/stage && mkdir -p .output/stage && cp -R public/bridge .output/stage/bridge && printf '{}' > .output/stage/manifest.json
    (cd .output/stage && zip -q -r -X "../beethoven-$v-chrome.zip" manifest.json bridge)
    if [ "\${SHIM_ZIP_STRAY:-0}" = 1 ]; then printf 'left by the build\n' > stray-from-zip.txt; fi ;;
  *) exit 9 ;;
esac
`,
  npx: `#!/bin/bash
${LOGLINE}e=$(printf '\\033')
case "$*" in
  "tsc --noEmit") ;;
  "vitest run")
    if [ "\${SHIM_SUITE_STRAY:-0}" = 1 ]; then printf 'left by the suite\\n' > stray-from-suite.txt; fi
    printf ' %s[2mTest Files%s[22m  %s[32m45 passed%s[39m (45)\\n      Tests  530 passed (530)\\n' "$e" "$e" "$e" "$e" ;;
  "vitest run test/hygiene.test.ts")
    if [ "\${SHIM_PACKAGE_FAIL:-0}" = 1 ]; then printf '      Tests  1 failed | 4 passed (5)\\n'; exit 1; fi
    printf ' Test Files  1 passed (1)\\n      Tests  5 passed (5)\\n' ;;
  *) exit 9 ;;
esac
`,
  'sidecar.mjs': `import fs from 'node:fs';
import crypto from 'node:crypto';
const [file, os, signed, id] = process.argv.slice(2);
const data = fs.readFileSync(file);
fs.writeFileSync(file + '.json', JSON.stringify({ name: file.split('/').pop(), os, kind: 'binary', helper: fs.readFileSync('helper/VERSION', 'utf8').trim(), protocol: 1,
  size: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex'), allowed_origins: ['chrome-extension://' + id + '/'], signed,
  built_at: '2026-10-04T12:00:00Z', tools: { rustc: 'rustc 1.90.0 (stand-in)', [os === 'mac' ? 'macos' : 'jsign']: os === 'mac' ? '15.6' : '7.5 (stand-in)' } }, null, 2) + '\\n');
`,
};

let SHIMS: string;
beforeAll(() => {
  SHIMS = path.join(T, 'shims');
  for (const [name, body] of Object.entries(PATH_STUBS)) writeExec(path.join(SHIMS, name), body);
});

/** a temporary repository, committed on main: the release scripts as they are here, and (full) what a whole run needs */
function makeRepo(label: string, full = false): string {
  const r = path.join(T, label, 'repo');
  mkdirSync(path.join(r, 'helper', 'release'), { recursive: true });
  for (const f of ['release.sh', 'setup-mac.sh', 'release-config.mjs', 'release.example.json']) cpSync(path.join(DIR, f), path.join(r, 'helper', 'release', f));
  mkdirSync(path.join(r, 'extension'), { recursive: true });
  cpSync(path.join(ROOT, 'extension', 'package.json'), path.join(r, 'extension', 'package.json'));
  cpSync(path.join(ROOT, 'helper', 'VERSION'), path.join(r, 'helper', 'VERSION'));
  cpSync(path.join(ROOT, '.gitignore'), path.join(r, '.gitignore'));
  cpSync(path.join(ROOT, 'extension', '.gitignore'), path.join(r, 'extension', '.gitignore'));
  if (full) {
    cpSync(path.join(ROOT, 'helper', 'build.mjs'), path.join(r, 'helper', 'build.mjs'));
    cpSync(path.join(ROOT, 'helper', 'src'), path.join(r, 'helper', 'src'), { recursive: true, filter: (s) => path.basename(s) !== 'target' });
    cpSync(path.join(ROOT, 'extension', 'public', 'bridge'), path.join(r, 'extension', 'public', 'bridge'), { recursive: true, filter: (s) => !/\.(pkg|msi)$/.test(s) });
    cpSync(path.join(ROOT, 'docs', 'guides'), path.join(r, 'docs', 'guides'), { recursive: true });
    for (const [rel, body] of Object.entries(REPO_STUBS)) writeExec(path.join(r, rel), body);
  } else {
    // a dry run must not start any of them: each would leave a mark beside the repository
    const mark = path.join(T, label, 'RAN');
    for (const rel of ['helper/build.mjs', 'helper/release/mac/build-pkg.sh', 'helper/release/windows/build-msi-mac.sh', 'helper/release/publish-store.mjs']) {
      writeExec(path.join(r, rel), rel.endsWith('.mjs') ? `require('fs').writeFileSync(${JSON.stringify(mark)}, '')\n` : `touch ${JSON.stringify(mark)}\n`);
    }
  }
  expect(git(r, 'init', '-q').status).toBe(0);
  git(r, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(r, 'add', '-A');
  expect(git(r, 'commit', '-qm', 'the release scripts, as they are').status).toBe(0);
  return r;
}

/** gives the repository an origin (a bare clone beside it) whose main is the repository's own */
function withOrigin(r: string): void {
  const o = path.join(path.dirname(r), 'origin.git');
  expect(spawnSync('git', ['clone', '-q', '--bare', r, o]).status).toBe(0);
  expect(git(r, 'remote', 'add', 'origin', o).status).toBe(0);
}

function release(r: string, v: string, args: string[], env: Record<string, string> = {}) {
  const log = path.join(path.dirname(r), 'calls.log');
  if (!existsSync(log)) writeFileSync(log, '');
  const tmp = path.join(path.dirname(r), 'tmp');
  mkdirSync(tmp, { recursive: true });
  const p = spawnSync(BASH, [path.join(r, 'helper', 'release', 'release.sh'), ...args], {
    cwd: r,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, ...SENTINELS, PATH: `${SHIMS}:${process.env.PATH ?? ''}`, SHIM_LOG: log, SHIM_DIR: SHIMS, BEETHOVEN_VENDOR_DIR: v, ASHLEY_VENDOR_DIR: '', TMPDIR: tmp, ...env },
  });
  return { code: p.status, out: p.stdout, err: p.stderr, log, tmp };
}
/** git status lists nothing but the files of the record, every one untracked */
const untracked = (r: string) => {
  const lines = git(r, 'status', '--porcelain', '-uall').stdout.trim().split('\n');
  return lines.length > 0 && lines.every((l) => l.startsWith(`?? ${REL}/`));
};
const plan = (out: string) => out.split('\n').filter((l) => l.startsWith('$ ')).map((l) => l.slice(2));
const calls = (log: string) => readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const noSecrets = (text: string) => {
  for (const line of text.split('\n')) {
    for (const re of SECRET_SHAPES) expect(line, line).not.toMatch(re);
    expect((line.match(LONG_RUN) ?? []).filter((m) => !/^[0-9a-f]+$/.test(m)), line).toEqual([]);
  }
  for (const s of Object.values(SENTINELS)) expect(text).not.toContain(s);
};

const COPIES = 'extension/public/bridge/beethoven-bridge-mac.pkg extension/public/bridge/beethoven-bridge-windows.msi';
const PLAN = [
  'bash helper/release/setup-mac.sh',
  'git fetch origin main',
  `rm -f helper/signed/beethoven-bridge-mac.pkg helper/signed/beethoven-bridge-mac.pkg.json helper/signed/beethoven-bridge-windows.msi helper/signed/beethoven-bridge-windows.msi.json ${COPIES}`,
  '(cd extension && npm ci)',
  '(cd extension && npm run sync-profiles)',
  '(cd extension && npx tsc --noEmit)',
  '(cd extension && npx vitest run)',
  `bash helper/release/mac/build-pkg.sh --store-id ${ID} --app-identity '${APP}' --installer-identity '${INST}' --notary-profile ${PROFILE}`,
  `bash helper/release/windows/build-msi-mac.sh --store-id ${ID} --azure-endpoint ${EP} --azure-account ${ACCOUNT} --azure-profile ${CERT}`,
  `node helper/build.mjs --store-id ${ID}`,
  '(cd extension && npm run zip)',
  '(cd extension && npx vitest run test/hygiene.test.ts)',
  'git checkout -- extension/public/bridge/',
  `rm -f ${COPIES}`,
  'node helper/build.mjs --check --no-signed',
  `node helper/release/publish-store.mjs upload --publisher ${PUB} --item ${ID} --zip ${REL}/${ZIP_NAME} --require-signed --publish`,
];

describe.skipIf(!RUN)('release.sh --dry-run', () => {
  it('prints every step in order with release.json\'s names in the right flags, runs none of them, and fetches nothing', () => {
    const r = makeRepo('dry');
    const res = release(r, vendor('dry'), ['--dry-run']);
    expect(res.code, res.err).toBe(0);
    expect(res.err).toBe('');
    // the repository has no origin at all, so a fetch that ran would have failed the run
    expect(plan(res.out)).toEqual(PLAN);
    expect(res.out.split('\n').filter((l) => /^-- step \d+: /.test(l))).toHaveLength(15);
    expect(res.out).toContain('Dry run: nothing was run, written or uploaded.');
    expect(res.out).toContain('then: HEAD must be origin/main');
    expect(existsSync(path.join(T, 'dry', 'RAN'))).toBe(false);
    expect(readFileSync(res.log, 'utf8')).toBe(''); // no stand-in on PATH was started either
    expect(existsSync(path.join(r, 'helper', 'signed'))).toBe(false);
    expect(existsSync(path.join(r, 'release'))).toBe(false);
    expect(git(r, 'status', '--porcelain').stdout).toBe('');
    expect(readdirSync(res.tmp)).toEqual([]); // no work folder either
    noSecrets(res.out + res.err);
  });

  it('--no-upload prints the same plan without the upload, and says it is skipped', () => {
    const r = makeRepo('dry-noup');
    const res = release(r, vendor('dry-noup'), ['--dry-run', '--no-upload']);
    expect(res.code, res.err).toBe(0);
    expect(plan(res.out)).toEqual(PLAN.slice(0, -1));
    expect(res.out).toContain('skipped (--no-upload)');
  });

  it('--allow-branch rehearses on another branch with no fetch, and only with --no-upload', () => {
    const r = makeRepo('dry-branch');
    expect(git(r, 'checkout', '-q', '-b', 'rehearsal').status).toBe(0);
    const refused = release(r, vendor('dry-branch'), ['--dry-run']);
    expect(refused.code).toBe(4);
    expect(refused.err.trim().split('\n')).toHaveLength(1);
    expect(refused.err).toMatch(/on rehearsal, not main/);
    const upload = release(r, vendor('dry-branch'), ['--dry-run', '--allow-branch']);
    expect(upload.code).toBe(2);
    expect(upload.err).toContain('--allow-branch is for a rehearsal, and a rehearsal never uploads: add --no-upload.');
    const ok = release(r, vendor('dry-branch'), ['--dry-run', '--allow-branch', '--no-upload']);
    expect(ok.code, ok.err).toBe(0);
    expect(plan(ok.out)).toEqual(PLAN.filter((l) => !l.startsWith('git fetch') && !l.includes('publish-store')));
    expect(ok.out).toContain('skipped (--allow-branch)');
  });

  it('refuses a dirty tree, untracked or modified, with one sentence and exit 4', () => {
    const r = makeRepo('dirty');
    writeFileSync(path.join(r, 'stray.txt'), 'not committed\n');
    const untracked = release(r, vendor('dirty'), ['--dry-run']);
    expect(untracked.code).toBe(4);
    expect(untracked.err.trim().split('\n')).toEqual(['The working tree is not clean (git status --porcelain lists what changed); commit or set the changes aside first, since the record names one commit.']);
    rmSync(path.join(r, 'stray.txt'));
    writeFileSync(path.join(r, 'extension', 'package.json'), readFileSync(path.join(r, 'extension', 'package.json'), 'utf8') + '\n');
    const modified = release(r, vendor('dirty'), ['--dry-run']);
    expect(modified.code).toBe(4);
    expect(modified.err).toMatch(/not clean/);
    expect(plan(modified.out)).toEqual([PLAN[0]]); // stopped before anything after the setup check

    // a run cut off after the merge leaves the merged bridge build, which names the store: put back, never committed
    git(r, 'checkout', '--', 'extension/package.json');
    mkdirSync(path.join(r, 'extension', 'public', 'bridge'), { recursive: true });
    writeFileSync(path.join(r, 'extension', 'public', 'bridge', 'manifest.json'), '{"files":[]}\n');
    git(r, 'add', '-A');
    expect(git(r, 'commit', '-qm', 'a tracked bridge build').status).toBe(0);
    writeFileSync(path.join(r, 'extension', 'public', 'bridge', 'manifest.json'), `{"files":[{"allowed_origins":["chrome-extension://${ID}/"]}]}\n`);
    const merged = release(r, vendor('dirty'), ['--dry-run']);
    expect(merged.code).toBe(4);
    expect(merged.err.trim().split('\n')).toEqual(["extension/public/bridge/ still holds the merged build of a release run that was cut off; it names the store's extension and is never committed: put the tracked files back with git checkout -- extension/public/bridge/ and run again."]);
    expect(plan(merged.out)).toEqual([PLAN[0]]);
  });

  it('refuses an existing record, a missing step script and an unknown argument', () => {
    const r = makeRepo('exists');
    mkdirSync(path.join(r, REL), { recursive: true });
    writeFileSync(path.join(r, REL, 'README.md'), 'an earlier record\n');
    git(r, 'add', '-A');
    git(r, 'commit', '-qm', 'a record');
    const exists = release(r, vendor('exists'), ['--dry-run']);
    expect(exists.code).toBe(4);
    expect(exists.err).toContain(`${REL}/ is already there: a release record is never overwritten.`);

    const m = makeRepo('missing-step');
    git(m, 'rm', '-q', 'helper/release/windows/build-msi-mac.sh');
    git(m, 'commit', '-qm', 'without the Windows step');
    const missing = release(m, vendor('missing-step'), ['--dry-run']);
    expect(missing.code).toBe(4);
    expect(missing.err.trim()).toBe('helper/release/windows/build-msi-mac.sh is not in this checkout, so the release cannot run to the end; pull main first.');

    const unknown = release(m, vendor('missing-step'), ['--dry-run', '--sign-everything']);
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain('Unknown argument: --sign-everything');
  });
});

describe.skipIf(!RUN)('release.json refusals (one sentence, exit 2, never the value back)', () => {
  const bad = (patch: (j: Record<string, unknown>) => void) => {
    const j = JSON.parse(JSON.stringify(NAMES)) as Record<string, unknown>;
    patch(j);
    return j;
  };
  const cases: Array<[string, unknown, RegExp, string?]> = [
    ['no file', null, /release\.json is missing; bash helper\/release\/setup-mac\.sh --write-config asks for each name and writes it\.$/],
    ['not JSON', '{"store_id": "abc', /release\.json is not JSON; /],
    ['an array', '[]', /is not a JSON object with store_id, publisher_id, mac and windows\.$/],
    ['the example, unfilled', readFileSync(EXAMPLE, 'utf8'), /: store_id still holds the example's placeholder; /],
    ['a store id that is not one', bad((j) => { j.store_id = 'ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP'; }), /: store_id must be the extension's 32-letter identifier/, 'ABCDEFGHIJKLMNOP'],
    ['an Apple Development certificate', bad((j) => { (j.mac as Record<string, string>).app_identity = 'Apple Development: Test Maker (TEAMID0000)'; }), /: mac\.app_identity must be the name of the "Developer ID Application/, 'Apple Development'],
    ['the two certificates swapped', bad((j) => { (j.mac as Record<string, string>).installer_identity = APP; }), /: mac\.installer_identity must be the name of the "Developer ID Installer/],
    ['no windows object', bad((j) => { delete j.windows; }), /: windows must be an object with azure_endpoint, azure_account, azure_profile\.$/],
    ['no certificate profile', bad((j) => { delete (j.windows as Record<string, string>).azure_profile; }), /: windows\.azure_profile is missing; /],
    ['a field it does not use, holding a token', bad((j) => { j.refresh_token = SENTINELS.GOOGLE_REFRESH; }), /has a field "refresh_token" that a release does not use; the file holds names only/, SENTINELS.GOOGLE_REFRESH],
    ['a nested field it does not use', bad((j) => { (j.windows as Record<string, string>).access_token = SENTINELS.AZURE_ACCESS_TOKEN; }), /has a field "windows\.access_token"/, SENTINELS.AZURE_ACCESS_TOKEN],
    ['a token pasted as the notary profile', bad((j) => { (j.mac as Record<string, string>).notary_profile = SENTINELS.AZURE_ACCESS_TOKEN; }), /: mac\.notary_profile looks like a token or a key, not a name; the file holds names only/, SENTINELS.AZURE_ACCESS_TOKEN],
    ['a long key-shaped value as the publisher id', bad((j) => { j.publisher_id = 'Ab3' + 'x9Kq'.repeat(10); }), /: publisher_id looks like a token or a key/, 'x9Kqx9Kq'],
    ['a line break in a name', bad((j) => { j.publisher_id = 'pub\nsecond'; }), /: publisher_id holds a character that is not printable ASCII/],
    ['an endpoint with a path', bad((j) => { (j.windows as Record<string, string>).azure_endpoint = `${EP}/sign`; }), /: windows\.azure_endpoint must be the Artifact Signing account's endpoint/],
  ];
  let r: string;
  beforeAll(() => {
    r = makeRepo('config');
  });
  for (const [label, names, want, never] of cases) {
    it(`refuses ${label}`, () => {
      const res = release(r, vendor(`config-${label.replace(/\W+/g, '-')}`, names), ['--dry-run']);
      expect(res.code, res.out).toBe(2);
      expect(res.err.trim().split('\n'), res.err).toHaveLength(1);
      expect(res.err.trim()).toMatch(want);
      if (never) expect(res.out + res.err).not.toContain(never);
      expect(plan(res.out)).toEqual([PLAN[0]]);
    });
  }

  it('release-config.mjs prints the eight names in order, and --write writes them mode 0600 from the environment alone', () => {
    const v = vendor('config-write', null, false);
    const file = path.join(v, 'release.json');
    const env = { ...process.env, RC_STORE_ID: ID, RC_PUBLISHER_ID: PUB, RC_APP_IDENTITY: APP, RC_INSTALLER_IDENTITY: INST, RC_NOTARY_PROFILE: PROFILE, RC_AZURE_ENDPOINT: EP, RC_AZURE_ACCOUNT: ACCOUNT, RC_AZURE_PROFILE: CERT };
    const w = spawnSync(process.execPath, [CONFIG_JS, '--write', file], { encoding: 'utf8', env });
    expect(w.status, w.stderr).toBe(0);
    expect(mode(file)).toBe(0o600);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(NAMES);
    expect(existsSync(file + '.new')).toBe(false);
    const p = spawnSync(process.execPath, [CONFIG_JS, file], { encoding: 'utf8' });
    expect(p.stdout.split('\n').slice(0, 8)).toEqual([ID, PUB, APP, INST, PROFILE, EP, ACCOUNT, CERT]);
    // a bad name refuses the whole write and leaves the file as it was
    const before = readFileSync(file, 'utf8');
    const refused = spawnSync(process.execPath, [CONFIG_JS, '--write', file], { encoding: 'utf8', env: { ...env, RC_STORE_ID: 'nope' } });
    expect(refused.status).toBe(2);
    expect(readFileSync(file, 'utf8')).toBe(before);
    // --current leaves out an unusable name rather than offering it back
    writeFileSync(file, JSON.stringify({ ...NAMES, store_id: '<32 letters a to p>' }));
    expect(spawnSync(process.execPath, [CONFIG_JS, '--current', file], { encoding: 'utf8' }).stdout.split('\n')[0]).toBe('');
  });

  // windows/build-msi-mac.sh refuses these with exit 2 at step 9, after the Mac package's notarization,
  // so release.json must refuse them at step 1 (and --write-config as they are typed)
  it('--field refuses the Azure names windows/build-msi-mac.sh refuses, and takes the ones it takes', () => {
    const field = (name: string, value: string) => spawnSync(process.execPath, [CONFIG_JS, '--field', name], { encoding: 'utf8', env: { ...process.env, RC_VALUE: value } });
    const refused: Array<[string, string]> = [
      ['windows.azure_profile', 'test_profile'],
      ['windows.azure_endpoint', 'https://EUS.codesigning.azure.net'],
      ['windows.azure_endpoint', 'https://-eus.codesigning.azure.net'],
      ['windows.azure_endpoint', 'https://eus-.codesigning.azure.net'],
    ];
    for (const [name, value] of refused) {
      const r = field(name, value);
      expect(r.status, `${name}=${value}`).toBe(2);
      expect(r.stderr.trim().split('\n')).toHaveLength(1);
      expect(r.stderr).not.toContain(value);
    }
    const taken: Array<[string, string]> = [
      ['windows.azure_profile', CERT],
      ['windows.azure_profile', 'Test-Profile-2'],
      ['windows.azure_endpoint', EP],
      ['windows.azure_endpoint', `${EP}/`],
      ['windows.azure_endpoint', 'eus.codesigning.azure.net'],
    ];
    for (const [name, value] of taken) {
      const r = field(name, value);
      expect(r.status, `${name}=${value}: ${r.stderr}`).toBe(0);
    }
  });

  it.skipIf(!existsSync(MSI_MAC))('every Azure name release.json takes, windows/build-msi-mac.sh takes too', () => {
    // past its argument checks it looks for its tools, and finds none on this PATH: exit 3, not 2
    const empty = path.join(T, 'msi-names-bin');
    mkdirSync(empty, { recursive: true });
    const pairs: Array<[string, string]> = [[EP, CERT], [`${EP}/`, 'Test-Profile-2'], ['eus.codesigning.azure.net', 'a1']];
    for (const [endpoint, profile] of pairs) {
      expect(spawnSync(process.execPath, [CONFIG_JS, '--field', 'windows.azure_endpoint'], { env: { ...process.env, RC_VALUE: endpoint } }).status).toBe(0);
      expect(spawnSync(process.execPath, [CONFIG_JS, '--field', 'windows.azure_profile'], { env: { ...process.env, RC_VALUE: profile } }).status).toBe(0);
      const r = spawnSync(BASH, [MSI_MAC, '--store-id', ID, '--azure-endpoint', endpoint, '--azure-account', ACCOUNT, '--azure-profile', profile], {
        encoding: 'utf8', timeout: 30_000, env: { HOME: path.join(T, 'home'), PATH: `${empty}:/usr/bin:/bin`, BEETHOVEN_VENDOR_DIR: path.join(T, 'msi-names-vendor') },
      });
      expect(r.status, `${endpoint} ${profile}: ${r.stderr}`).toBe(3);
    }
  });
});

describe.skipIf(!ZIPS)('release.sh, a whole run against stand-ins for the Mac, Apple, Azure and the store', () => {
  let r: string;
  let res: ReturnType<typeof release>;
  let tracked: Record<string, string>;

  beforeAll(() => {
    r = makeRepo('full', true);
    withOrigin(r);
    tracked = Object.fromEntries(readdirSync(path.join(r, 'extension', 'public', 'bridge')).map((n) => [n, sha256(path.join(r, 'extension', 'public', 'bridge', n))]));
    // an earlier release's copy, gitignored there: while it is there the bridge tests fail, so the run clears it first
    writeFileSync(path.join(r, 'extension', 'public', 'bridge', 'beethoven-bridge-windows.msi'), 'an earlier release\'s copy\n');
    res = release(r, vendor('full'), []);
  });

  it('runs every step in order with the names filled in, and exits 0', () => {
    expect(res.code, res.out + res.err).toBe(0);
    expect(plan(res.out)).toEqual(PLAN);
    // the record's README asks npm for its version; that read is not a step
    const seen = calls(res.log).map((c) => c.join(' ')).filter((c) => c !== 'npm --version');
    expect(seen).toEqual([
      'setup-mac.sh',
      'npm ci',
      'npm run sync-profiles',
      'npx tsc --noEmit',
      'npx vitest run',
      `build-pkg.sh --store-id ${ID} --app-identity ${APP} --installer-identity ${INST} --notary-profile ${PROFILE}`,
      `build-msi-mac.sh --store-id ${ID} --azure-endpoint ${EP} --azure-account ${ACCOUNT} --azure-profile ${CERT}`,
      'npm run zip',
      'npx vitest run test/hygiene.test.ts',
      `publish-store.mjs upload --publisher ${PUB} --item ${ID} --zip ${REL}/${ZIP_NAME} --require-signed --publish`,
    ]);
    for (const step of ['main is origin/main', 'helper/signed/ holds both installers and both sidecars', 'build.mjs verified both sidecars and listed both installers', `extension/.output/${ZIP_NAME} carries the six bridge files`, `${REL}/ written, and both SHA256SUMS.txt files verify`, `git status lists nothing but ${REL}/`]) {
      expect(res.out).toContain(`   ok: ${step}`);
    }
    expect(readdirSync(res.tmp)).toEqual([]); // the work folder is gone
  });

  it('records the zip it uploads, the six bridge files with their sums, the guides, a README and the sums over the folder', () => {
    const rel = path.join(r, REL);
    expect(readdirSync(rel).sort()).toEqual(['README.md', 'SHA256SUMS.txt', 'bridge', 'guides', ZIP_NAME].sort());
    expect(readdirSync(path.join(rel, 'bridge')).sort()).toEqual([...SIX, 'SHA256SUMS.txt'].sort());
    expect(readdirSync(path.join(rel, 'guides')).sort()).toEqual(readdirSync(path.join(ROOT, 'docs', 'guides')).filter((n) => n.endsWith('.md')).sort());
    // the bridge sums: binary mode, sorted, the six files
    const bridgeSums = readFileSync(path.join(rel, 'bridge', 'SHA256SUMS.txt'), 'utf8').trim().split('\n').map((l) => l.split(' *') as [string, string]);
    expect(bridgeSums.map(([, n]) => n)).toEqual([...SIX].sort());
    for (const [h, n] of bridgeSums) expect(h, n).toBe(sha256(path.join(rel, 'bridge', n)));
    // the folder sums: every file but the two sums files
    const sums = readFileSync(path.join(rel, 'SHA256SUMS.txt'), 'utf8').trim().split('\n').map((l) => l.split('  ') as [string, string]);
    expect(sums.map((s) => s[1])).toEqual(['README.md', ZIP_NAME, ...[...SIX].sort().map((n) => `bridge/${n}`), ...readdirSync(path.join(rel, 'guides')).sort().map((n) => `guides/${n}`)].sort());
    for (const [h, n] of sums) expect(h, n).toBe(sha256(path.join(rel, n)));
    // the merged bridge: both installers listed after the zips, named for the store's extension
    const manifest = JSON.parse(readFileSync(path.join(rel, 'bridge', 'manifest.json'), 'utf8')) as { files: Array<{ os: string; kind: string; signed?: string; allowed_origins?: string[] }> };
    expect(manifest.files.filter((f) => f.kind === 'binary').map((f) => [f.os, f.signed, f.allowed_origins])).toEqual([
      ['mac', 'developer-id-notarized', [`chrome-extension://${ID}/`]],
      ['windows', 'authenticode', [`chrome-extension://${ID}/`]],
    ]);
  });

  it('writes a README with the commit, the tools from the sidecars and the test counts, and no store or publisher id', () => {
    const md = readFileSync(path.join(r, REL, 'README.md'), 'utf8');
    expect(md).toContain(`# Beethoven ${VERSION} package and signed bridge installers`);
    expect(md).toContain(git(r, 'rev-parse', 'HEAD').stdout.trim());
    expect(md).toContain('main, equal to origin/main after a fetch');
    expect(md).toContain('Test Files  45 passed (45); Tests  530 passed (530)');
    expect(md).toContain('Test Files  1 passed (1); Tests  5 passed (5)');
    expect(md).toContain('- rustc: rustc 1.90.0 (stand-in)');
    expect(md).toContain('- macos: 15.6');
    expect(md).toContain('- jsign: 7.5 (stand-in)');
    expect(md).toContain('npm 10.9.0 (stand-in)');
    expect(md).toContain('Signed developer-id-notarized; built 2026-10-04T12:00:00Z.');
    expect(md).toContain('## What is not proven');
    expect(md).toContain(`The package's SHA-256 is \`${sha256(path.join(r, REL, ZIP_NAME))}\``);
    expect(md).not.toContain(ID);
    expect(md).not.toContain(PUB);
    expect(md).not.toMatch(/\x1b/);
    expect(md.replace(/\s+/g, ' ')).toContain('so `.gitignore` keeps them out of the repository');
  });

  it('puts the tracked bridge files back, leaves only the record untracked, and keeps the signed pair in helper/signed/', () => {
    expect(untracked(r)).toEqual(true);
    for (const [n, h] of Object.entries(tracked)) expect(sha256(path.join(r, 'extension', 'public', 'bridge', n)), n).toBe(h);
    // and nothing else: the two installer copies are gone, so the next release's bridge tests start clean
    expect(readdirSync(path.join(r, 'extension', 'public', 'bridge')).sort()).toEqual(Object.keys(tracked).sort());
    expect(res.out).toContain('build --check: 4 files in');
    expect(readdirSync(path.join(r, 'helper', 'signed')).sort()).toEqual(['beethoven-bridge-mac.pkg', 'beethoven-bridge-mac.pkg.json', 'beethoven-bridge-windows.msi', 'beethoven-bridge-windows.msi.json']);
    // with that pair still there, the plain build helper/README.md lists first leaves it out, so the tracked manifest never names the store
    const plain = spawnSync(process.execPath, ['helper/build.mjs'], { cwd: r, encoding: 'utf8', timeout: 60_000 });
    expect(plain.status, plain.stderr).toBe(0);
    expect(plain.stdout).toContain('NOTE: helper/signed/ holds signed installers, which this build leaves out');
    expect(plain.stdout).not.toContain('NOTE: signed installer');
    expect(untracked(r)).toEqual(true);
    for (const [n, h] of Object.entries(tracked)) expect(sha256(path.join(r, 'extension', 'public', 'bridge', n)), n).toBe(h);
  });

  it('ends with the plain summary: version, both installers\' hash prefixes, the store\'s answer, the review sentence and the git commands', () => {
    const tail = res.out.slice(res.out.lastIndexOf(`Beethoven ${VERSION}\n`));
    const pkg = sha256(path.join(r, REL, 'bridge', 'beethoven-bridge-mac.pkg')).slice(0, 12);
    const msi = sha256(path.join(r, REL, 'bridge', 'beethoven-bridge-windows.msi')).slice(0, 12);
    expect(tail).toContain(`Mac installer      beethoven-bridge-mac.pkg      sha256 ${pkg}...`);
    expect(tail).toContain(`Windows installer  beethoven-bridge-windows.msi  sha256 ${msi}...`);
    expect(tail).toContain("The store's answer: Uploaded; submitted for review (stand-in).");
    expect(tail).toContain('Google reviews it; students get it within hours of approval.');
    expect(tail).toContain(`  git add ${REL}\n`);
    expect(tail).toContain('  git push origin main\n');
    noSecrets(res.out + res.err);
  });

  it('a second run refuses: the record is there and the tree is not clean', () => {
    const again = release(r, vendor('full'), ['--dry-run']);
    expect(again.code).toBe(4);
    expect(again.err).toContain(`${REL}/ is already there`);
  });

  // last in this block: it stages the record
  it('the git add it prints commits the README, the guides and the sums, and nothing that names the store or carries a certificate', () => {
    expect(git(r, 'add', REL).status).toBe(0);
    const staged = git(r, 'diff', '--cached', '--name-only').stdout.trim().split('\n').sort();
    const guides = readdirSync(path.join(r, REL, 'guides')).map((n) => `${REL}/guides/${n}`);
    expect(staged).toEqual([`${REL}/README.md`, `${REL}/SHA256SUMS.txt`, `${REL}/bridge/SHA256SUMS.txt`, ...guides].sort());
    expect(git(r, 'grep', '--cached', '-l', ID).stdout).toBe('');
    // the files left out are still there, and the committed sums pin them
    for (const n of SIX) expect(existsSync(path.join(r, REL, 'bridge', n)), n).toBe(true);
    expect(existsSync(path.join(r, REL, ZIP_NAME))).toBe(true);
    expect(readFileSync(path.join(r, REL, 'SHA256SUMS.txt'), 'utf8')).toContain(`  ${ZIP_NAME}\n`);
    expect(res.out).toContain("Its zip and bridge/ name the store's extension, so .gitignore keeps them out");
  });
});

describe.skipIf(!ZIPS)('release.sh when a step fails', () => {
  it('a missing prerequisite stops at step 1 with the setup list, and nothing else runs', () => {
    const r = makeRepo('fail-setup', true);
    withOrigin(r);
    const res = release(r, vendor('fail-setup'), [], { SHIM_SETUP_MISSING: '1' });
    expect(res.code).toBe(5);
    expect(res.out).toContain('missing  Homebrew');
    expect(res.err.trim()).toBe('Stopped at step 1 (Checking this Mac has everything a release needs): it exited with status 3; its own message is above.');
    expect(calls(res.log).map((c) => c[0])).toEqual(['setup-mac.sh']);
  });

  it('main behind origin/main is refused after the fetch, before anything is built', () => {
    const r = makeRepo('fail-behind', true);
    withOrigin(r);
    git(r, 'commit', '-q', '--allow-empty', '-m', 'not pushed');
    const res = release(r, vendor('fail-behind'), []);
    expect(res.code).toBe(4);
    expect(res.err).toMatch(/main \([0-9a-f]+\) is not origin\/main \([0-9a-f]{40}\) after the fetch: push or pull first/);
    expect(calls(res.log).map((c) => c[0])).toEqual(['setup-mac.sh']);
  });

  it('a Windows step that leaves no package stops before the merge, so one installer is never shipped alone', () => {
    const r = makeRepo('fail-msi', true);
    withOrigin(r);
    const res = release(r, vendor('fail-msi'), [], { SHIM_MSI_SILENT: '1' });
    expect(res.code).toBe(5);
    expect(res.err).toContain('Stopped at step 9 (Building and signing the Windows installer): helper/signed/beethoven-bridge-windows.msi is not there after the two installer steps.');
    expect(git(r, 'status', '--porcelain').stdout).toBe('');
    expect(existsSync(path.join(r, 'extension', 'public', 'bridge', 'beethoven-bridge-mac.pkg'))).toBe(false);
  });

  it('a failure after the merge puts the tracked bridge files back first, then names the step', () => {
    const r = makeRepo('fail-package', true);
    withOrigin(r);
    const res = release(r, vendor('fail-package'), [], { SHIM_PACKAGE_FAIL: '1' });
    expect(res.code).toBe(5);
    expect(res.out).toContain('(the tracked extension/public/bridge/ is back: git checkout -- extension/public/bridge/, and the two installer copies removed)');
    expect(readdirSync(path.join(r, 'extension', 'public', 'bridge')).filter((n) => /\.(pkg|msi)$/.test(n))).toEqual([]);
    expect(res.err.trim().split('\n').pop()).toBe('Stopped at step 12 (Testing the package that ships (the package tests read extension/.output)): it exited with status 1; its own message is above.');
    expect(git(r, 'status', '--porcelain').stdout).toBe('');
    expect(existsSync(path.join(r, 'release'))).toBe(false);
    expect(calls(res.log).map((c) => c[0])).not.toContain('publish-store.mjs');
  });

  it('a tracked file the checks rewrote, or a file they left, stops right after them, before either installer is built', () => {
    const r = makeRepo('fail-suite-stray', true);
    withOrigin(r);
    const res = release(r, vendor('fail-suite-stray'), [], { SHIM_SUITE_STRAY: '1' });
    expect(res.code).toBe(5);
    expect(res.err.trim().split('\n').pop()).toBe('Stopped at step 7 (Running the whole test suite, on the tracked bridge build): after the checks git status lists ?? extension/stray-from-suite.txt; they must change nothing, or the zip would not be this commit\'s. Commit what they write (or remove what they left), then run again.');
    expect(calls(res.log).map((c) => c[0])).not.toContain('build-pkg.sh');
  });

  it('a check the script makes itself that fails (unzip, here) stops with the step named and exit 5, not the tool\'s status', () => {
    const r = makeRepo('fail-unzip', true);
    withOrigin(r);
    const real = spawnSync('bash', ['-c', 'command -v unzip'], { encoding: 'utf8' }).stdout.trim();
    const bin = path.join(T, 'fail-unzip', 'bin');
    writeExec(path.join(bin, 'unzip'), `#!/bin/bash\nif [ "$1" = -Z1 ]; then printf 'unzip: -Z not supported (stand-in)\\n' >&2; exit 10; fi\nexec ${JSON.stringify(real)} "$@"\n`);
    const res = release(r, vendor('fail-unzip'), [], { PATH: `${bin}:${SHIMS}:${process.env.PATH ?? ''}` });
    expect(res.code).toBe(5);
    expect(res.err).toContain('unzip: -Z not supported (stand-in)');
    expect(res.err.trim().split('\n').pop()).toBe('Stopped at step 11 (Packaging the extension): a command this step runs itself exited with status 10; its own message is above.');
    expect(res.out).toContain('(the tracked extension/public/bridge/ is back');
    expect(git(r, 'status', '--porcelain').stdout).toBe('');
  });

  it('a stop at step 14 removes the record it began, and once the cause is gone the same version runs again', () => {
    const r = makeRepo('fail-record', true);
    withOrigin(r);
    const res = release(r, vendor('fail-record'), [], { SHIM_ZIP_STRAY: '1' });
    expect(res.code).toBe(5);
    expect(res.err.trim().split('\n').pop()).toBe(`Stopped at step 14 (Putting the tracked bridge files back): besides ${REL}/, git status lists ?? extension/stray-from-zip.txt, so the zip may not be this commit's; nothing was uploaded.`);
    expect(res.out).toContain(`(the unfinished record ${REL}/ is removed: nothing was uploaded, so ${VERSION} can simply run again)`);
    expect(existsSync(path.join(r, REL))).toBe(false);
    expect(calls(res.log).map((c) => c[0])).not.toContain('publish-store.mjs');
    rmSync(path.join(r, 'extension', 'stray-from-zip.txt'));
    expect(git(r, 'status', '--porcelain').stdout).toBe('');
    const again = release(r, vendor('fail-record'), []);
    expect(again.code, again.out + again.err).toBe(0);
    expect(untracked(r)).toBe(true);
  });

  it('a failed upload leaves the whole record and says how to upload that same file', () => {
    const r = makeRepo('fail-upload', true);
    withOrigin(r);
    const res = release(r, vendor('fail-upload'), [], { SHIM_UPLOAD_FAIL: '1' });
    expect(res.code).toBe(5);
    expect(res.out + res.err).toContain('The store did not take the upload (stand-in).');
    expect(res.err).toContain('Stopped at step 15 (Uploading to the Chrome Web Store and submitting it for review): it exited with status 1');
    expect(res.err).toContain(`The record in ${REL}/ is complete. Once the cause is fixed, upload that same file with:\n  ${PLAN[PLAN.length - 1]}`);
    expect(readdirSync(path.join(r, REL)).sort()).toEqual(['README.md', 'SHA256SUMS.txt', 'bridge', 'guides', ZIP_NAME].sort());
    expect(untracked(r)).toBe(true);
  });

  it('--no-upload stops after the record and prints the upload command for later', () => {
    const r = makeRepo('no-upload', true);
    withOrigin(r);
    const res = release(r, vendor('no-upload'), ['--no-upload']);
    expect(res.code, res.err).toBe(0);
    expect(calls(res.log).map((c) => c[0])).not.toContain('publish-store.mjs');
    expect(res.out).toContain(`Not uploaded (--no-upload). To upload this same file later:\n  ${PLAN[PLAN.length - 1]}`);
    expect(readFileSync(path.join(r, REL, 'README.md'), 'utf8')).toContain('This run did not upload (--no-upload).');
  });
});

describe.skipIf(!RUN)('setup-mac.sh', () => {
  const run = (args: string[], pathDir: string, v: string, env: Record<string, string> = {}, input?: string) =>
    spawnSync(BASH, [SETUP, ...args], { encoding: 'utf8', timeout: 30_000, input, env: { HOME: path.join(T, 'home'), PATH: pathDir, BEETHOVEN_VENDOR_DIR: v, ...SENTINELS, ...env } });
  const missingLines = (out: string) => out.split('\n').filter((l) => l.startsWith('  missing  ')).map((l) => l.slice('  missing  '.length));
  const AZ_CHECK = 'account get-access-token --resource https://codesigning.azure.net --output none';

  it('with PATH holding nothing, lists every prerequisite as missing, each with its fix, then the hand steps, and exits 3', () => {
    const empty = path.join(T, 'empty-bin');
    mkdirSync(empty, { recursive: true });
    const v = vendor('setup-empty', null, false);
    const res = run([], empty, v);
    expect(res.status, res.stderr).toBe(3);
    expect(res.stderr).toBe('');
    expect(missingLines(res.stdout)).toEqual([
      'Xcode command line tools',
      'Homebrew',
      'mingw-w64 (x86_64-w64-mingw32-gcc)',
      'msitools (wixl msiinfo)',
      'osslsigncode (osslsigncode)',
      'azure-cli (az)',
      'node 22 or later (node, npm, npx)',
      'jsign',
      'rustup and cargo',
      'Rust target aarch64-apple-darwin',
      'Rust target x86_64-apple-darwin',
      'Rust target x86_64-pc-windows-gnu',
      'Developer ID Application identity',
      'Developer ID Installer identity',
      'notarytool keychain profile',
      'signed in to Azure',
      `release.json (${v}/release.json)`,
      'the Chrome Web Store sign-in',
    ]);
    expect(res.stdout).toContain('Missing: 18. The fixes, in this order:');
    for (const fix of ['xcode-select --install', 'https://brew.sh', 'brew install mingw-w64', 'brew install msitools', 'brew install osslsigncode', 'brew install azure-cli', 'brew install node@22', 'brew install jsign', 'https://rustup.rs', 'rustup target add x86_64-pc-windows-gnu', 'az login', 'bash helper/release/setup-mac.sh --write-config', 'node helper/release/publish-store.mjs sign-in --client']) {
      expect(res.stdout).toContain(fix);
    }
    expect(res.stdout).toMatch(/whether Homebrew carries a jsign formula is not yet measured/);
    const hand = res.stdout.slice(res.stdout.indexOf('What only you can do, once, and where:'));
    expect(hand.split('\n').filter((l) => /^ {2}\d\. /.test(l)).map((l) => l.trim().slice(0, 2))).toEqual(['1.', '2.', '3.', '4.', '5.', '6.', '7.', '8.']);
    for (const where of ['developer.apple.com/programs', 'xcrun notarytool store-credentials', 'portal.azure.com', 'az login', 'chrome.google.com/webstore/devconsole', 'console.cloud.google.com']) expect(hand).toContain(where);
    noSecrets(res.stdout);
  });

  // stand-ins for every tool the check asks about; security lists what SHIM_IDENTITIES holds
  function macShims(dir: string): string {
    mkdirSync(dir, { recursive: true });
    const log = path.join(dir, 'calls.log');
    writeFileSync(log, '');
    const ok = `#!/bin/bash\n${LOGLINE}`;
    for (const t of ['codesign', 'pkgbuild', 'productbuild', 'lipo', 'spctl', 'pkgutil', 'git', 'x86_64-w64-mingw32-gcc', 'wixl', 'msiinfo', 'osslsigncode', 'jsign', 'cargo', 'npm', 'npx']) writeExec(path.join(dir, t), ok);
    writeExec(path.join(dir, 'xcode-select'), `${ok}printf '/Library/Developer/CommandLineTools\\n'\n`);
    writeExec(path.join(dir, 'xcrun'), `${ok}[ "$1 $2 $3 $4" = "notarytool history --keychain-profile ${PROFILE}" ] || exit 1\n`);
    writeExec(path.join(dir, 'brew'), `${ok}[ "$1" = --prefix ] && printf '/opt/homebrew\\n'\nexit 0\n`);
    // the sign-in check asks az for a token for Artifact Signing and must keep it off the screen: the
    // stand-in answers only with --output none, and prints nothing then, as az does
    writeExec(path.join(dir, 'az'), `${ok}[ "$*" = "${AZ_CHECK}" ] || exit 1\n`);
    writeExec(path.join(dir, 'rustup'), `${ok}[ "$*" = "target list --installed" ] && printf '%s\\n' \${SHIM_TARGETS:-aarch64-apple-darwin x86_64-apple-darwin x86_64-pc-windows-gnu}\nexit 0\n`);
    writeExec(path.join(dir, 'security'), `${ok}case "$*" in
  "find-identity -v -p codesigning") printf '  1) 0000 "%s"\\n' "$SHIM_APP" ;;
  "find-identity -v") printf '  1) 0000 "%s"\\n  2) 1111 "%s"\\n' "$SHIM_APP" "$SHIM_INST" ;;
  *) exit 1 ;;
esac
`);
    writeExec(path.join(dir, 'node'), `#!/bin/bash\nexec ${JSON.stringify(process.execPath)} "$@"\n`);
    return log;
  }

  it('with every tool there, signed in and release.json complete, says so and exits 0, asking Apple once with the profile release.json names', () => {
    const bin = path.join(T, 'mac-bin');
    const log = macShims(bin);
    const res = run([], bin, vendor('setup-ok'), { SHIM_LOG: log, SHIM_APP: APP, SHIM_INST: INST });
    expect(res.status, res.stdout + res.stderr).toBe(0);
    expect(missingLines(res.stdout)).toEqual([]);
    expect(res.stdout).toContain(`  ok       Developer ID Application identity (${APP})`);
    expect(res.stdout).toContain(`  ok       Developer ID Installer identity (${INST})`);
    expect(res.stdout).toContain(`  ok       notarytool keychain profile "${PROFILE}"`);
    expect(res.stdout.trim().split('\n').pop()).toBe('Everything a release needs is on this Mac.');
    const seen = calls(log).map((c) => c.join(' '));
    expect(seen.filter((c) => c.startsWith('xcrun'))).toEqual([`xcrun notarytool history --keychain-profile ${PROFILE}`]);
    expect(seen).toContain(`az ${AZ_CHECK}`);
    expect(seen.filter((c) => c.startsWith('az '))).toEqual([`az ${AZ_CHECK}`]);
    // a check changes nothing
    expect(seen.filter((c) => /^(brew install|rustup target add)/.test(c))).toEqual([]);
  });

  it('names what release.json asks for that the keychain lacks, and a missing Rust target', () => {
    const bin = path.join(T, 'mac-bin-2');
    const log = macShims(bin);
    const res = run([], bin, vendor('setup-lacks'), { SHIM_LOG: log, SHIM_APP: APP, SHIM_INST: 'Developer ID Installer: Someone Else (OTHER00000)', SHIM_TARGETS: 'aarch64-apple-darwin x86_64-apple-darwin' });
    expect(res.status).toBe(3);
    expect(missingLines(res.stdout)).toEqual(['Rust target x86_64-pc-windows-gnu', `Developer ID Installer identity (${INST})`]);
    expect(res.stdout).toContain('release.json names it, but security find-identity -v does not list it');
  });

  // jsign as windows/build-msi-mac.sh finds it: JSIGN, then jsign on PATH, then a jar in the vendor folder
  // (jsign.jar, else the first jsign/*.jar) with a java that runs. A check that took anything that step
  // refuses would pass a Mac whose release stops at step 9, after the notarization.
  const JSIGN_LAYOUTS: Array<{ label: string; jar?: string; java?: 'runs' | 'stub'; jsign?: boolean; JSIGN?: string; found: boolean }> = [
    { label: 'jsign.jar in the vendor folder', jar: 'jsign.jar', java: 'runs', found: true },
    { label: 'a jar in the vendor folder\'s jsign/', jar: 'jsign/jsign-7.5.jar', java: 'runs', found: true },
    { label: 'jsign.jar and a java that is only a stub', jar: 'jsign.jar', java: 'stub', found: false },
    { label: 'a jar in another folder', jar: 'tools/jsign.jar', java: 'runs', found: false },
    { label: 'jsign on PATH', jsign: true, found: true },
    { label: 'JSIGN naming a command that is there', JSIGN: 'MY_JSIGN --quiet', found: true },
    { label: 'JSIGN naming nothing that is there, beside a good jar', jar: 'jsign.jar', java: 'runs', JSIGN: 'no-such-jsign', found: false },
    { label: 'JSIGN running java -jar on a file that is not there', java: 'runs', JSIGN: 'java -jar /nonexistent/jsign.jar', found: false },
    { label: 'nothing', found: false },
  ];
  /** a vendor folder and a bin folder (beside the stand-ins in base) laid out as one JSIGN_LAYOUTS row */
  function jsignLayout(base: string, i: number, l: (typeof JSIGN_LAYOUTS)[number]) {
    const v = vendor(`jsign-layout-${i}`);
    const bin = path.join(T, `jsign-layout-${i}`, 'bin');
    mkdirSync(bin, { recursive: true });
    if (l.jar) {
      mkdirSync(path.dirname(path.join(v, l.jar)), { recursive: true });
      writeFileSync(path.join(v, l.jar), 'a jar (stand-in)\n');
    }
    if (l.java) writeExec(path.join(bin, 'java'), l.java === 'runs' ? '#!/bin/bash\n[ "$1" = -version ] && exit 0\nexit 1\n' : '#!/bin/bash\necho "No Java runtime present (stand-in)" >&2\nexit 1\n');
    if (l.jsign) writeExec(path.join(bin, 'jsign'), '#!/bin/bash\nexit 0\n');
    const mine = path.join(T, `jsign-layout-${i}`, 'my-jsign');
    writeExec(mine, '#!/bin/bash\nexit 0\n');
    const env: Record<string, string> = l.JSIGN ? { JSIGN: l.JSIGN.replace('MY_JSIGN', mine) } : {};
    return { v, path: `${bin}:${base}`, env, mine };
  }
  const jsignLine = (out: string) => out.split('\n').find((l) => /^ {2}(ok|missing) +jsign( \(|$)/.test(l)) ?? '';

  it('finds jsign exactly where the Windows step looks for it, and nowhere else', () => {
    const base = path.join(T, 'mac-bin-jsign');
    const log = macShims(base);
    rmSync(path.join(base, 'jsign'));
    JSIGN_LAYOUTS.forEach((l, i) => {
      const { v, path: p, env, mine } = jsignLayout(base, i, l);
      const res = run([], p, v, { SHIM_LOG: log, SHIM_APP: APP, SHIM_INST: INST, ...env });
      expect(jsignLine(res.stdout).startsWith(l.found ? '  ok       jsign (' : '  missing  jsign'), `${l.label}: ${jsignLine(res.stdout)}`).toBe(true);
      expect(res.status, l.label).toBe(l.found ? 0 : 3);
      if (l.label === 'a jar in the vendor folder\'s jsign/') expect(jsignLine(res.stdout)).toBe(`  ok       jsign (the jar ${v}/jsign/jsign-7.5.jar, run with java)`);
      if (l.label === 'JSIGN naming a command that is there') expect(jsignLine(res.stdout)).toBe(`  ok       jsign (JSIGN, ${mine})`);
      if (l.label.startsWith('JSIGN naming nothing')) expect(res.stdout).toContain('JSIGN names no-such-jsign, which was not found; the Windows step runs what JSIGN names, so correct JSIGN or unset it');
      if (l.label.startsWith('JSIGN running java -jar')) expect(res.stdout).toContain('JSIGN runs java -jar /nonexistent/jsign.jar, which is not a file');
      if (l.java === 'stub') expect(res.stdout).toContain('java is on PATH but does not run');
      if (l.label === 'nothing') expect(res.stdout).toContain(`save jsign's jar (net.jsign:jsign 7.5, on Maven Central) as ${v}/jsign.jar`);
    });
  });

  // windows/build-msi-mac.sh comes from another stream; once it is in this checkout, every layout above
  // is put to it too, so that the check and the step can never drift apart again
  it.skipIf(!RUN || !existsSync(MSI_MAC))('agrees with windows/build-msi-mac.sh itself on every one of those layouts', () => {
    // the step's own tool checks, all passed by stand-ins, then its jsign lookup, then its az token
    // check, which fails here: reaching it means jsign was found, and nothing is built
    const base = path.join(T, 'msi-bin-jsign');
    const ok = '#!/bin/bash\nexit 0\n';
    for (const t of ['cargo', 'x86_64-w64-mingw32-gcc', 'x86_64-w64-mingw32-objdump', 'wixl', 'msiinfo', 'osslsigncode']) writeExec(path.join(base, t), ok);
    writeExec(path.join(base, 'rustup'), '#!/bin/bash\n[ "$*" = "target list --installed" ] && printf \'x86_64-pc-windows-gnu\\n\'\nexit 0\n');
    writeExec(path.join(base, 'az'), '#!/bin/bash\nexit 1\n');
    JSIGN_LAYOUTS.forEach((l, i) => {
      const { v, path: p, env } = jsignLayout(`${base}:/usr/bin:/bin`, i, l);
      const res = spawnSync(BASH, [MSI_MAC, '--store-id', ID, '--azure-endpoint', EP, '--azure-account', ACCOUNT, '--azure-profile', CERT], {
        encoding: 'utf8', timeout: 30_000, env: { HOME: path.join(T, 'home'), PATH: p, BEETHOVEN_VENDOR_DIR: v, ...env },
      });
      const reachedAz = (res.stdout + res.stderr).includes('az could not get a token');
      expect(reachedAz, `${l.label}: exit ${res.status}\n${res.stdout}${res.stderr}`).toBe(l.found);
      expect(res.status, l.label).toBe(l.found ? 5 : 3);
    });
  });

  it('wants both files of the store sign-in, the OAuth client\'s and the saved sign-in\'s', () => {
    const bin = path.join(T, 'mac-bin-store');
    const log = macShims(bin);
    const v = vendor('setup-store-half');
    rmSync(path.join(v, 'chrome-web-store', 'client.json'));
    const res = run([], bin, v, { SHIM_LOG: log, SHIM_APP: APP, SHIM_INST: INST });
    expect(res.status).toBe(3);
    expect(missingLines(res.stdout)).toEqual(['the Chrome Web Store sign-in']);
    const hand = res.stdout.slice(res.stdout.indexOf('What only you can do, once, and where:')).replace(/\s+/g, ' ');
    expect(hand).toContain('Google drops the saved sign-in after seven days');
    expect(hand).toContain('make it on this Mac (Keychain Access, Certificate Assistant');
  });

  it('--install runs the brew installs and rustup target adds that are missing, and nothing else', () => {
    const bin = path.join(T, 'mac-bin-3');
    const log = macShims(bin);
    for (const t of ['wixl', 'osslsigncode', 'jsign']) rmSync(path.join(bin, t));
    const res = run(['--install'], bin, vendor('setup-install'), { SHIM_LOG: log, SHIM_APP: APP, SHIM_INST: INST, SHIM_TARGETS: 'aarch64-apple-darwin' });
    // the stand-in brew installs nothing, so the check after it still finds them missing
    expect(res.status).toBe(3);
    const changing = calls(log).map((c) => c.join(' ')).filter((c) => !/^(xcode-select -p|brew --prefix|rustup target list --installed|security find-identity|xcrun notarytool history|az account get-access-token)/.test(c));
    expect(changing).toEqual(['brew install msitools osslsigncode', 'brew install jsign', 'rustup target add x86_64-apple-darwin x86_64-pc-windows-gnu']);
  });

  it('--install without Homebrew installs nothing and says where Homebrew comes from', () => {
    const empty = path.join(T, 'empty-bin-2');
    mkdirSync(empty, { recursive: true });
    const res = run(['--install'], empty, vendor('setup-install-nobrew', null, false));
    expect(res.status).toBe(3);
    expect(res.stdout.trim()).toBe('Homebrew is not on this Mac: install it from https://brew.sh first (not done here), then run this again.');
  });

  it('--write-config refuses when stdin is not a terminal, reads nothing from the pipe and writes nothing', () => {
    const v = vendor('setup-write-pipe', null, false);
    const res = run(['--write-config'], process.env.PATH ?? '', v, {}, `${ID}\n${PUB}\n`);
    expect(res.status).toBe(2);
    expect(res.stderr.trim()).toBe('--write-config asks for each name at the terminal and reads nothing from a pipe or a file: run it in Terminal.');
    expect(readdirSync(v)).toEqual([]);
  });

  it.skipIf(!PTY)('--write-config at a terminal asks again after a refused answer and writes release.json mode 0600 in a new 0700 folder', () => {
    const v = path.join(T, 'setup-write-tty', 'vendor');
    mkdirSync(path.dirname(v), { recursive: true });
    const answers = [ID, 'not a publisher id', PUB, 'Apple Development: Test Maker (TEAMID0000)', APP, INST, PROFILE, EP, ACCOUNT, CERT].join('\n') + '\n';
    const res = spawnSync('script', ['-qec', `${BASH} ${SETUP} --write-config`, '/dev/null'], { encoding: 'utf8', timeout: 30_000, input: answers, env: { ...process.env, BEETHOVEN_VENDOR_DIR: v } });
    expect(res.status, res.stdout + res.stderr).toBe(0);
    expect(res.stdout).toContain('publisher_id must be the publisher identifier');
    expect(res.stdout).toContain('mac.app_identity must be the name of the "Developer ID Application');
    expect(mode(v)).toBe(0o700);
    expect(mode(path.join(v, 'release.json'))).toBe(0o600);
    expect(JSON.parse(readFileSync(path.join(v, 'release.json'), 'utf8'))).toEqual(NAMES);
  });
});

describe('the files themselves', () => {
  const OURS = [RELEASE, SETUP, CONFIG_JS, EXAMPLE];
  const SCRIPTS = [RELEASE, SETUP];

  it('are LF-only printable ASCII and use no word this project does not use', () => {
    const banned = new RegExp('prov' + 'enance', 'i');
    for (const f of [...OURS, README]) {
      const b = readFileSync(f);
      expect(b.includes(13), f).toBe(false);
      expect(b.some((c) => c > 126 || (c < 32 && c !== 10 && c !== 9)), f).toBe(false);
      expect(banned.test(b.toString('latin1')), f).toBe(false);
    }
  });

  it.skipIf(!RUN)('pass bash -n', () => {
    for (const s of SCRIPTS) {
      const r = spawnSync('bash', ['-n', s], { encoding: 'utf8' });
      expect(r.status, s + '\n' + r.stderr).toBe(0);
    }
  });

  it('use nothing the bash 3.2 that macOS ships lacks (a static stand-in: that bash cannot run on this Linux)', () => {
    for (const s of SCRIPTS) {
      const whole = readFileSync(s, 'utf8');
      expect(whole, s).toMatch(/^#!\/bin\/bash\n/);
      const t = whole.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
      expect(t, s).not.toMatch(/\b(declare|typeset|local)\s+-[a-zA-Z]*A\b/);
      expect(t, s).not.toMatch(/\b(mapfile|readarray)\b/);
      expect(t, s).not.toMatch(/\$\{[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?[,^]/);
      expect(t, s).not.toMatch(/\|&/);
      expect(t, s).not.toMatch(/;;?&/);
      expect(t, s).not.toMatch(/\bcoproc\b|\bwait -n\b|\[\[ -v /);
    }
  });

  it('hold no secret and no name of the maintainer\'s accounts: the example is placeholders only', () => {
    for (const f of OURS) {
      // the reader names the shapes of a token on the one line that refuses them
      const text = readFileSync(f, 'utf8').replace(/^.*-----BEGIN.*$/m, f === CONFIG_JS ? '' : '$&');
      expect(text, f).not.toMatch(/-----BEGIN|eyJ[A-Za-z0-9_-]{8,}|ya29\.|--storepass|AZURE_CLIENT_SECRET|apiKey|ANTHROPIC_/);
      expect(text, f).not.toMatch(/Developer ID (Application|Installer): [A-Z][a-z]+ [A-Z][a-z]+ \([A-Z0-9]{10}\)/);
    }
    const ex = JSON.parse(readFileSync(EXAMPLE, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(ex)).toEqual(['_comment', 'store_id', 'publisher_id', 'mac', 'windows']);
    const values = [ex.store_id, ex.publisher_id, ...Object.values(ex.mac as object), ...Object.values(ex.windows as object)] as string[];
    expect(values).toHaveLength(8);
    for (const v of values) expect(v).toMatch(/<[^>]+>/);
  });

  it('the README opens with the one command and keeps the Windows machine as the fallback', () => {
    const md = readFileSync(README, 'utf8');
    const first = md.indexOf('\n## ');
    expect(md.slice(first + 1, md.indexOf('\n', first + 1))).toBe('## Your release, start to finish');
    const section = md.slice(first, md.indexOf('\n## ', first + 1));
    for (const s of ['bash helper/release/setup-mac.sh --install', 'bash helper/release/setup-mac.sh --write-config', 'bash helper/release/release.sh', '--dry-run', '--no-upload', 'Google']) expect(section).toContain(s);
    expect(md).toMatch(/### The Windows machine \(the fallback\)/);
    expect(md.replace(/\s+/g, ' ')).toContain('Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic\'s marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher.');
  });
});
