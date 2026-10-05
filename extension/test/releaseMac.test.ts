// The Mac release script (helper/release/mac/build-pkg.sh) run end to end on Linux against stand-ins for
// Apple's and Rust's tools: each stand-in on PATH records its argv to a log and leaves behind what the real
// tool would (a binary per target, the joined binary, a listing of the component's root, the copied package,
// a stapled ticket), so what is checked here is the script's own work: the order and flags of the signing,
// notarization and stapling calls, the payload and its modes, the sidecar helper/build.mjs reads, the
// argument errors, and the two scripts that run on the student's Mac (postinstall, uninstall.command)
// against a stand-in home. No real Mac has run any of it: Apple's tools, Gatekeeper's verdict and the
// Installer's handling of a home-only package are not yet measured. The bash 3.2 that macOS ships cannot
// run here either; a static search for the bash 4 constructs stands in for it.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MAC = fileURLToPath(new URL('../../helper/release/mac/', import.meta.url));
const HELPER = fileURLToPath(new URL('../../helper/', import.meta.url));
const VERSION = readFileSync(path.join(HELPER, 'VERSION'), 'utf8').trim();
const SCRIPT = path.join(MAC, 'build-pkg.sh');
const POSTINSTALL = path.join(MAC, 'scripts', 'postinstall');
const UNINSTALL = path.join(MAC, 'payload', 'uninstall.command');
const NAME = 'com.openspineconsortium.beethoven.bridge';
const ID = 'abcdefghijklmnopabcdefghijklmnop';
const ORIGIN = `chrome-extension://${ID}/`;
const APP = 'Developer ID Application: Test Maker (TEAMID0000)';
const INST = 'Developer ID Installer: Test Maker (TEAMID0000)';
const PROFILE = 'beethoven-notary';
const RUN = process.platform !== 'win32';

// Every stand-in starts the same way: its name and each argument, tab-separated, on one line of the log.
const PRELUDE = `#!/bin/bash
{ printf '%s' "$(basename "$0")"; for a in "$@"; do printf '\\t%s' "$a"; done; printf '\\n'; } >> "$SHIM_LOG"
last=; for a in "$@"; do last=$a; done
`;

const SHIMS: Record<string, string> = {
  cargo: `target= dir=
while [ $# -gt 0 ]; do case "$1" in --target) target=$2; shift 2 ;; --target-dir) dir=$2; shift 2 ;; *) shift ;; esac; done
[ -n "$target" ] && [ -n "$dir" ] || exit 9
mkdir -p "$dir/$target/release"
printf 'fake bridge for %s\\n' "$target" > "$dir/$target/release/beethoven-bridge"
chmod 755 "$dir/$target/release/beethoven-bridge"
`,
  rustup: `case "$*" in *"target list --installed"*) printf 'aarch64-apple-darwin\\nx86_64-apple-darwin\\n' ;; esac
`,
  rustc: `printf 'rustc 1.90.0 (0000000 2026-01-01)\\n'
`,
  lipo: `out= ins=()
while [ $# -gt 0 ]; do case "$1" in -create) shift ;; -output) out=$2; shift 2 ;; *) ins[\${#ins[@]}]=$1; shift ;; esac; done
cat "\${ins[@]}" > "$out"
chmod 755 "$out"
`,
  codesign: `case "$*" in *--verify*) printf '%s: valid on disk\\n%s: satisfies its Designated Requirement\\n' "$last" "$last" >&2 ;; esac
`,
  pkgbuild: `[ "$1" = --version ] && { printf 'pkgbuild version 1.0 (stand-in)\\n'; exit 0; }
root= scripts= out=
while [ $# -gt 0 ]; do case "$1" in --root) root=$2; shift 2 ;; --scripts) scripts=$2; shift 2 ;; --identifier|--version|--install-location) shift 2 ;; *) out=$1; shift ;; esac; done
{
  printf 'component\\n'
  (cd "$root" && find . -type f | LC_ALL=C sort | while IFS= read -r f; do printf '%s %s %s\\n' "$(stat -c %a "$f")" "$(stat -c %s "$f")" "$f"; done)
  printf 'folders\\n'
  (cd "$root" && find . -type d | LC_ALL=C sort | while IFS= read -r f; do printf '%s %s\\n' "$(stat -c %a "$f")" "$f"; done)
  printf 'scripts\\n'
  (cd "$scripts" && find . -type f | LC_ALL=C sort | while IFS= read -r f; do printf '%s %s\\n' "$(stat -c %a "$f")" "$f"; done)
} > "$out"
`,
  productbuild: `[ "$1" = --version ] && { printf 'productbuild version 1.0 (stand-in)\\n'; exit 0; }
dist= res= pkgs= out=
while [ $# -gt 0 ]; do case "$1" in --distribution) dist=$2; shift 2 ;; --resources) res=$2; shift 2 ;; --package-path) pkgs=$2; shift 2 ;; --sign) shift 2 ;; --timestamp) shift ;; *) out=$1; shift ;; esac; done
comp=$(sed -n 's/.*<pkg-ref[^>]*>\\([^<]*\\)<\\/pkg-ref>.*/\\1/p' "$dist" | sed -n 1p)
[ -n "$comp" ] && [ -f "$pkgs/$comp" ] || { printf 'productbuild stand-in: the component %s named by %s is not in %s\\n' "$comp" "$dist" "$pkgs" >&2; exit 9; }
[ -f "$res/welcome.txt" ] || { printf 'productbuild stand-in: no welcome.txt in %s\\n' "$res" >&2; exit 9; }
{ cat "$pkgs/$comp"; printf 'distribution\\n'; cat "$dist"; printf 'resources\\n'; cat "$res/welcome.txt"; } > "$out"
`,
  xcrun: `case "$1 $2" in
  "notarytool submit")
    if [ "\${SHIM_NOTARY_INVALID:-0}" = 1 ]; then printf '  id: 00000000-0000-0000-0000-000000000000\\n  status: Invalid\\n'; exit 0; fi
    printf 'Conducting pre-submission checks for %s and initiating connection to the Apple notary service...\\n  id: 00000000-0000-0000-0000-000000000000\\n  status: Accepted\\n' "$(basename "$3")" ;;
  "stapler staple") printf 'stapled ticket\\n' >> "$last"; printf 'Processing: %s\\nThe staple and validate action worked!\\n' "$last" ;;
  "stapler validate") printf 'Processing: %s\\nThe validate action worked!\\n' "$last" ;;
  *) exit 9 ;;
esac
`,
  spctl: `if [ "\${SHIM_SPCTL_REJECT:-0}" = 1 ]; then printf '%s: rejected\\nsource=Unnotarized Developer ID\\n' "$last" >&2; exit 3; fi
printf '%s: accepted\\nsource=Notarized Developer ID\\n' "$last" >&2
`,
  pkgutil: `case "$1" in
  --check-signature) printf 'Package "%s":\\n   Status: signed by a developer certificate issued by Apple for distribution\\n' "$(basename "$2")" ;;
  --forget) ;;
  *) exit 9 ;;
esac
`,
  sw_vers: `printf '15.6\\n'
`,
  xcodebuild: `printf 'Xcode 16.4\\nBuild version 16F6\\n'
`,
};

let T: string;
let shims: string;

function writeShims(dir: string, omit: string[] = []): void {
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(SHIMS)) {
    if (omit.includes(name)) continue;
    const p = path.join(dir, name);
    writeFileSync(p, PRELUDE + body);
    chmodSync(p, 0o755);
  }
}

/** a fresh log, work root and output folder for one run of the script */
function fresh(label: string): { log: string; tmp: string; out: string } {
  const base = path.join(T, label);
  mkdirSync(path.join(base, 'tmp'), { recursive: true });
  const log = path.join(base, 'argv.log');
  writeFileSync(log, '');
  return { log, tmp: path.join(base, 'tmp'), out: path.join(base, 'signed') };
}

function runScript(args: string[], r: { log: string; tmp: string }, env: Record<string, string> = {}, bin = shims) {
  const p = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, SHIM_LOG: r.log, TMPDIR: r.tmp, ...env },
  });
  return { code: p.status, out: p.stdout, err: p.stderr };
}

const FULL = ['--store-id', ID, '--app-identity', APP, '--installer-identity', INST, '--notary-profile', PROFILE];
const calls = (log: string, tool: string) => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => l.split('\t')).filter((l) => l[0] === tool);
const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const mode = (p: string) => statSync(p).mode & 0o777;

beforeAll(() => {
  T = mkdtempSync(path.join(tmpdir(), 'beethoven-release-mac-'));
  shims = path.join(T, 'bin');
  writeShims(shims);
});
afterAll(() => {
  rmSync(T, { recursive: true, force: true });
});

describe.skipIf(!RUN)('build-pkg.sh, end to end against stand-ins for the tools', () => {
  let r: { log: string; tmp: string; out: string };
  let res: { code: number | null; out: string; err: string };
  let pkg: string;
  let sidecar: Record<string, unknown>;
  let work: string;

  beforeAll(() => {
    r = fresh('full');
    res = runScript([...FULL, '--out', r.out, '--keep-work'], r);
    pkg = path.join(r.out, 'beethoven-bridge-mac.pkg');
    const kept = readdirSync(r.tmp).filter((d) => d.startsWith('beethoven-bridge-pkg.'));
    work = path.join(r.tmp, kept[0] ?? 'missing');
    sidecar = existsSync(pkg + '.json') ? (JSON.parse(readFileSync(pkg + '.json', 'utf8')) as Record<string, unknown>) : {};
  });

  it('exits 0, announces each step on one line and names what it wrote', () => {
    expect(res.err + res.out, res.err).not.toMatch(/error|No such file/i);
    expect(res.code).toBe(0);
    const steps = res.out.split('\n').filter((l) => l.startsWith('-- '));
    expect(steps.length).toBeGreaterThanOrEqual(14);
    expect(res.out).toContain(`Wrote ${pkg}`);
    expect(res.out).toContain(`Wrote ${pkg}.json`);
    expect(res.out).toContain('Work folder kept: ');
    expect(res.out).toContain('status: Accepted');
    expect(res.out).toContain('source=Notarized Developer ID');
  });

  it('writes the sidecar the contract names, with size and sha256 of the final stapled file', () => {
    expect(existsSync(pkg)).toBe(true);
    expect(sidecar).toMatchObject({
      name: 'beethoven-bridge-mac.pkg',
      os: 'mac',
      kind: 'binary',
      helper: VERSION,
      protocol: 1,
      size: statSync(pkg).size,
      sha256: sha256(pkg),
      allowed_origins: [ORIGIN],
      signed: 'developer-id-notarized',
    });
    expect(Object.keys(sidecar).sort()).toEqual(['allowed_origins', 'built_at', 'helper', 'kind', 'name', 'os', 'protocol', 'sha256', 'signed', 'size', 'tools']);
    expect(sidecar.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sidecar.built_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(Math.abs(Date.parse(sidecar.built_at as string) - Date.now())).toBeLessThan(10 * 60_000);
    expect(sidecar.tools).toMatchObject({ rustc: 'rustc 1.90.0 (0000000 2026-01-01)', macos: '15.6', xcodebuild: 'Xcode 16.4', pkgbuild: 'pkgbuild version 1.0 (stand-in)', productbuild: 'productbuild version 1.0 (stand-in)' });
    // the stand-in stapler appended its ticket, so the hash is of the file after stapling
    expect(readFileSync(pkg, 'utf8')).toContain('stapled ticket');
  });

  it('builds each target into the work folder, joins them with lipo, signs with the hardened runtime and a timestamp, then verifies', () => {
    const cargo = calls(r.log, 'cargo');
    expect(cargo.map((c) => c[c.indexOf('--target') + 1]).sort()).toEqual(['aarch64-apple-darwin', 'x86_64-apple-darwin']);
    for (const c of cargo) {
      expect(c.slice(1, 4)).toEqual(['build', '--release', '--locked']);
      expect(c[c.indexOf('--target-dir') + 1]).toBe(path.join(work, 'target'));
    }
    expect(existsSync(path.join(HELPER, 'src', 'rust', 'target', 'aarch64-apple-darwin'))).toBe(false);
    const lipo = calls(r.log, 'lipo');
    expect(lipo).toHaveLength(1);
    expect(lipo[0]?.slice(1)).toEqual(['-create', path.join(work, 'target', 'aarch64-apple-darwin', 'release', 'beethoven-bridge'), path.join(work, 'target', 'x86_64-apple-darwin', 'release', 'beethoven-bridge'), '-output', path.join(work, 'beethoven-bridge')]);
    expect(readFileSync(path.join(work, 'beethoven-bridge'), 'utf8')).toBe('fake bridge for aarch64-apple-darwin\nfake bridge for x86_64-apple-darwin\n');
    const cs = calls(r.log, 'codesign');
    expect(cs).toHaveLength(2);
    expect(cs[0]?.slice(1)).toEqual(['--force', '--options', 'runtime', '--timestamp', '--sign', APP, path.join(work, 'beethoven-bridge')]);
    expect(cs[1]?.slice(1)).toEqual(['--verify', '--strict', '--verbose=2', path.join(work, 'beethoven-bridge')]);
  });

  it('lays the payload out under Library/Application Support/Beethoven/bridge with the modes the contract names and exactly one origin', () => {
    const dest = path.join(work, 'root', 'Library', 'Application Support', 'Beethoven', 'bridge');
    expect(readdirSync(dest).sort()).toEqual(['README.txt', 'allowed_origins.json', 'beethoven-bridge', 'uninstall.command']);
    expect(mode(path.join(dest, 'beethoven-bridge'))).toBe(0o755);
    expect(mode(path.join(dest, 'uninstall.command'))).toBe(0o755);
    expect(mode(path.join(dest, 'README.txt'))).toBe(0o644);
    expect(mode(path.join(dest, 'allowed_origins.json'))).toBe(0o644);
    expect(readFileSync(path.join(dest, 'allowed_origins.json'), 'utf8')).toBe(`["${ORIGIN}"]\n`);
    expect(readFileSync(path.join(dest, 'beethoven-bridge'))).toEqual(readFileSync(path.join(work, 'beethoven-bridge')));
    expect(readFileSync(path.join(dest, 'uninstall.command'))).toEqual(readFileSync(UNINSTALL));
    expect(readFileSync(path.join(dest, 'README.txt'))).toEqual(readFileSync(path.join(MAC, 'payload', 'README.txt')));
    expect(readFileSync(path.join(work, 'scripts', 'postinstall'))).toEqual(readFileSync(POSTINSTALL));
    expect(mode(path.join(work, 'scripts', 'postinstall'))).toBe(0o755);
    // the stand-in pkgbuild listed the root it was given: mode, size, path
    const listing = readFileSync(pkg, 'utf8');
    expect(listing).toContain(`755 ${statSync(path.join(work, 'beethoven-bridge')).size} ./Library/Application Support/Beethoven/bridge/beethoven-bridge`);
    expect(listing).toContain(`644 ${`["${ORIGIN}"]\n`.length} ./Library/Application Support/Beethoven/bridge/allowed_origins.json`);
    expect(listing).toMatch(/\n755 \d+ \.\/Library\/Application Support\/Beethoven\/bridge\/uninstall\.command\n/);
    expect(listing).toMatch(/\n644 \d+ \.\/Library\/Application Support\/Beethoven\/bridge\/README\.txt\n/);
    expect(listing).toContain('scripts\n755 ./postinstall\n');
    // the folders above the bridge's land on the student's home, ~/Library and ~/Library/Application Support:
    // recorded no wider than macOS makes them, so an Installer that applied them would let no other account in
    expect(listing).toContain('folders\n750 .\n700 ./Library\n700 ./Library/Application Support\n755 ./Library/Application Support/Beethoven\n755 ./Library/Application Support/Beethoven/bridge\nscripts\n');
  });

  it('runs pkgbuild with the identifier, the helper version and the home-relative install location, then productbuild signed with the installer identity', () => {
    const pb = calls(r.log, 'pkgbuild').filter((c) => c[1] !== '--version');
    expect(pb).toHaveLength(1);
    expect(pb[0]?.slice(1)).toEqual(['--root', path.join(work, 'root'), '--scripts', path.join(work, 'scripts'), '--identifier', NAME, '--version', VERSION, '--install-location', '/', path.join(work, 'component.pkg')]);
    const prb = calls(r.log, 'productbuild').filter((c) => c[1] !== '--version');
    expect(prb).toHaveLength(1);
    expect(prb[0]?.slice(1)).toEqual(['--distribution', path.join(work, 'distribution.xml'), '--resources', path.join(work, 'resources'), '--package-path', work, '--sign', INST, '--timestamp', path.join(work, 'beethoven-bridge-mac.pkg')]);
    const filled = readFileSync(path.join(work, 'distribution.xml'), 'utf8');
    expect(filled).not.toMatch(/@[A-Z_]+@/);
    expect(filled).toContain(`<pkg-ref id="${NAME}" version="${VERSION}" onConclusion="none">component.pkg</pkg-ref>`);
    const welcome = readFileSync(path.join(work, 'resources', 'welcome.txt'), 'utf8');
    expect(welcome).toContain(`Beethoven bridge ${VERSION}`);
    expect(welcome).toContain('No administrator password is asked.');
    expect(welcome).toContain('uninstall.command');
    expect(welcome).not.toMatch(/ssh|native messaging|manifest|registry/i);
  });

  it('notarizes with the keychain profile and --wait, staples, validates, then checks the signature and asks Gatekeeper', () => {
    const x = calls(r.log, 'xcrun');
    expect(x.map((c) => c.slice(1))).toEqual([
      ['notarytool', 'submit', path.join(work, 'beethoven-bridge-mac.pkg'), '--keychain-profile', PROFILE, '--wait'],
      ['stapler', 'staple', path.join(work, 'beethoven-bridge-mac.pkg')],
      ['stapler', 'validate', path.join(work, 'beethoven-bridge-mac.pkg')],
    ]);
    expect(calls(r.log, 'pkgutil').map((c) => c.slice(1))).toEqual([['--check-signature', path.join(work, 'beethoven-bridge-mac.pkg')]]);
    expect(calls(r.log, 'spctl').map((c) => c.slice(1))).toEqual([['-a', '-vv', '-t', 'install', path.join(work, 'beethoven-bridge-mac.pkg')]]);
    // the order of the whole: sign, build, notarize, staple, check, and only then the copy out
    const order = readFileSync(r.log, 'utf8').trim().split('\n').map((l) => l.split('\t').slice(0, 3).join(' '));
    const at = (s: string) => order.findIndex((l) => l.startsWith(s));
    expect(at('codesign --force')).toBeLessThan(at('pkgbuild --root'));
    expect(at('pkgbuild --root')).toBeLessThan(at('productbuild --distribution'));
    expect(at('productbuild --distribution')).toBeLessThan(at('xcrun notarytool submit'));
    expect(at('xcrun notarytool submit')).toBeLessThan(at('xcrun stapler staple'));
    expect(at('xcrun stapler staple')).toBeLessThan(at('xcrun stapler validate'));
    expect(at('xcrun stapler validate')).toBeLessThan(at('pkgutil --check-signature'));
    expect(at('pkgutil --check-signature')).toBeLessThan(at('spctl -a'));
  });

  it('never puts a secret on a command line: every recorded argument is a path, a flag, a name or a version', () => {
    const all = readFileSync(r.log, 'utf8');
    expect(all).not.toMatch(/password|--apple-id|--team-id|-p\t|\.p12|\.pem|\.cer|BEGIN/i);
    expect(all).toContain(PROFILE);
  });

  it('writes the same sidecar through the printf writer (the hook for a Mac without /usr/bin/python3)', () => {
    const r2 = fresh('plain');
    const res2 = runScript([...FULL, '--out', r2.out], r2, { BEETHOVEN_PKG_PLAIN_JSON: '1' });
    expect(res2.code, res2.err).toBe(0);
    const plain = JSON.parse(readFileSync(path.join(r2.out, 'beethoven-bridge-mac.pkg.json'), 'utf8')) as Record<string, unknown>;
    const strip = (o: Record<string, unknown>) => ({ ...o, built_at: undefined });
    expect(strip(plain)).toEqual(strip(sidecar));
    expect(plain.built_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(readdirSync(r2.tmp)).toEqual([]); // no --keep-work: the work folder is gone
  });
});

describe.skipIf(!RUN)('build-pkg.sh refusals', () => {
  it('a trial build (--no-notarize) goes to <out>/trial, gets no sidecar, says it must never ship and calls neither notarytool nor stapler', () => {
    const r = fresh('trial');
    const res = runScript(['--store-id', ID, '--app-identity', APP, '--installer-identity', INST, '--no-notarize', '--out', r.out], r);
    expect(res.code, res.err).toBe(0);
    expect(existsSync(path.join(r.out, 'trial', 'beethoven-bridge-mac.pkg'))).toBe(true);
    expect(existsSync(path.join(r.out, 'beethoven-bridge-mac.pkg'))).toBe(false);
    expect(readdirSync(path.join(r.out, 'trial'))).toEqual(['beethoven-bridge-mac.pkg']);
    expect(res.out).toContain('must never ship');
    expect(calls(r.log, 'xcrun')).toEqual([]);
    expect(calls(r.log, 'codesign')).toHaveLength(2);
    expect(calls(r.log, 'productbuild').some((c) => c.includes('--sign'))).toBe(true);
  });

  it('a trial build survives Gatekeeper rejecting it and says so; a notarized build does not, and leaves nothing in --out', () => {
    const r1 = fresh('trial-rejected');
    const res1 = runScript(['--store-id', ID, '--app-identity', APP, '--installer-identity', INST, '--no-notarize', '--out', r1.out], r1, { SHIM_SPCTL_REJECT: '1' });
    expect(res1.code, res1.err).toBe(0);
    expect(res1.out).toContain('expected to be rejected');
    const r2 = fresh('rejected');
    const res2 = runScript([...FULL, '--out', r2.out], r2, { SHIM_SPCTL_REJECT: '1' });
    expect(res2.code).toBe(5);
    expect(res2.err).toContain('Gatekeeper did not accept the package');
    expect(existsSync(r2.out) ? readdirSync(r2.out) : []).toEqual([]);
  });

  it('a notarization that is not Accepted ends with exit 5, and nothing in --out', () => {
    const r = fresh('invalid');
    const res = runScript([...FULL, '--out', r.out], r, { SHIM_NOTARY_INVALID: '1' });
    expect(res.code).toBe(5);
    expect(res.err).toContain('Apple did not accept the package');
    expect(calls(r.log, 'xcrun').map((c) => c[2])).toEqual(['submit']);
    expect(existsSync(r.out) ? readdirSync(r.out) : []).toEqual([]);
  });

  it('a bad store id exits 2 with one sentence', () => {
    for (const bad of ['abc', 'ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP', 'abcdefghijklmnopabcdefghijklmnoq', 'abcdefghijklmnopabcdefghijklmno']) {
      const r = fresh('badid');
      const res = runScript(['--store-id', bad, '--app-identity', APP, '--installer-identity', INST, '--notary-profile', PROFILE, '--out', r.out], r);
      expect(res.code, bad).toBe(2);
      expect(res.err.trim().split('\n'), bad).toHaveLength(1);
      expect(res.err).toContain('--store-id must be');
      expect(res.out).toBe('');
    }
    const r = fresh('noid');
    expect(runScript(['--app-identity', APP, '--installer-identity', INST, '--notary-profile', PROFILE, '--out', r.out], r).code).toBe(2);
  });

  it('a missing or mis-kinded identity exits 2, a missing notary profile exits 2, an unknown argument exits 2', () => {
    const r = fresh('args');
    expect(runScript(['--store-id', ID, '--installer-identity', INST, '--notary-profile', PROFILE, '--out', r.out], r)).toMatchObject({ code: 2, err: expect.stringContaining('--app-identity must name') });
    expect(runScript(['--store-id', ID, '--app-identity', APP, '--notary-profile', PROFILE, '--out', r.out], r)).toMatchObject({ code: 2, err: expect.stringContaining('--installer-identity must name') });
    expect(runScript(['--store-id', ID, '--app-identity', INST, '--installer-identity', APP, '--notary-profile', PROFILE, '--out', r.out], r).code).toBe(2);
    expect(runScript(['--store-id', ID, '--app-identity', 'Apple Development: Someone (TEAMID0000)', '--installer-identity', INST, '--notary-profile', PROFILE, '--out', r.out], r).code).toBe(2);
    expect(runScript(['--store-id', ID, '--app-identity', APP, '--installer-identity', INST, '--out', r.out], r)).toMatchObject({ code: 2, err: expect.stringContaining('--notary-profile is required') });
    expect(runScript([...FULL, '--out', r.out, '--sign-with', 'x'], r)).toMatchObject({ code: 2, err: expect.stringContaining('Unknown argument: --sign-with') });
    expect(runScript([...FULL, '--out'], r)).toMatchObject({ code: 2, err: expect.stringContaining('--out needs a value') });
    expect(runScript([...FULL, '--out', r.out, '--targets', 'x86_64-pc-windows-msvc'], r).code).toBe(2);
    expect(existsSync(path.join(r.out, 'beethoven-bridge-mac.pkg'))).toBe(false);
    expect(readFileSync(r.log, 'utf8')).toBe(''); // no tool was run before the arguments were checked
  });

  it('a missing tool exits 3 before anything is built', () => {
    const bin = path.join(T, 'bin-nolipo');
    writeShims(bin, ['lipo']);
    const r = fresh('nolipo');
    const res = runScript([...FULL, '--out', r.out], r, {}, bin);
    expect(res.code).toBe(3);
    expect(res.err).toContain('lipo was not found');
    expect(calls(r.log, 'cargo')).toEqual([]);
    // a target rustup does not list is also refused before cargo runs
    const bin2 = path.join(T, 'bin-onetarget');
    writeShims(bin2, ['rustup']);
    const p = path.join(bin2, 'rustup');
    writeFileSync(p, PRELUDE + "printf 'aarch64-apple-darwin\\n'\n");
    chmodSync(p, 0o755);
    const r2 = fresh('onetarget');
    const res2 = runScript([...FULL, '--out', r2.out], r2, {}, bin2);
    expect(res2.code).toBe(3);
    expect(res2.err).toContain('x86_64-apple-darwin is not installed');
    expect(calls(r2.log, 'cargo')).toEqual([]);
  });

  it('--help prints the usage and exits 0', () => {
    const r = fresh('help');
    const res = runScript(['--help'], r);
    expect(res.code).toBe(0);
    expect(res.out).toContain('--store-id ID');
    expect(res.out).toContain('--no-notarize');
  });
});

describe.skipIf(!RUN)('postinstall, run as the Installer runs it, against a stand-in home', () => {
  const AS = (home: string) => path.join(home, 'Library', 'Application Support');
  const bridge = (home: string) => path.join(AS(home), 'Beethoven', 'bridge');
  const manifest = (home: string, browser: string) => path.join(AS(home), browser, 'NativeMessagingHosts', `${NAME}.json`);

  function home(label: string, origins = `["${ORIGIN}"]\n`): string {
    const h = path.join(T, 'homes', label);
    mkdirSync(bridge(h), { recursive: true });
    writeFileSync(path.join(bridge(h), 'beethoven-bridge'), 'fake binary\n');
    chmodSync(path.join(bridge(h), 'beethoven-bridge'), 0o644); // postinstall is to set 755 itself
    writeFileSync(path.join(bridge(h), 'uninstall.command'), readFileSync(UNINSTALL));
    writeFileSync(path.join(bridge(h), 'README.txt'), readFileSync(path.join(MAC, 'payload', 'README.txt')));
    writeFileSync(path.join(bridge(h), 'allowed_origins.json'), origins);
    return h;
  }
  const run = (args: string[], env: Record<string, string> = {}) =>
    spawnSync('bash', [POSTINSTALL, ...args], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, HOME: '/nonexistent-home-for-this-test', ...env } });

  it('writes Chrome\'s manifest with the absolute path, stdio and the package\'s origins, and nothing for Edge or Chromium when they are absent', () => {
    const h = home('chrome');
    const res = run(['/Volumes/Downloads/beethoven-bridge-mac.pkg', h]);
    expect(res.status, res.stdout + res.stderr).toBe(0);
    const m = JSON.parse(readFileSync(manifest(h, 'Google/Chrome'), 'utf8')) as Record<string, unknown>;
    expect(m).toEqual({
      name: NAME,
      description: "The Beethoven bridge: carries Beethoven's encrypted connection to the grid.",
      path: path.join(bridge(h), 'beethoven-bridge'),
      type: 'stdio',
      allowed_origins: [ORIGIN],
    });
    expect(existsSync(manifest(h, 'Microsoft Edge'))).toBe(false);
    expect(existsSync(manifest(h, 'Chromium'))).toBe(false);
    expect(res.stdout.trim().split('\n')).toEqual([`Wrote ${manifest(h, 'Google/Chrome')}`]);
    expect(mode(path.join(bridge(h), 'beethoven-bridge'))).toBe(0o755);
    expect(mode(path.join(bridge(h), 'uninstall.command'))).toBe(0o755);
    // the payload is untouched: nothing deleted, nothing added in the bridge folder
    expect(readdirSync(bridge(h)).sort()).toEqual(['README.txt', 'allowed_origins.json', 'beethoven-bridge', 'uninstall.command']);
  });

  it('writes Edge\'s manifest only when the "Microsoft Edge" folder exists, and Chromium\'s likewise', () => {
    const h = home('edge');
    mkdirSync(path.join(AS(h), 'Microsoft Edge'), { recursive: true });
    const res = run(['/x.pkg', h]);
    expect(res.status).toBe(0);
    expect(existsSync(manifest(h, 'Google/Chrome'))).toBe(true);
    expect(existsSync(manifest(h, 'Microsoft Edge'))).toBe(true);
    expect(existsSync(manifest(h, 'Chromium'))).toBe(false);
    expect(readFileSync(manifest(h, 'Microsoft Edge'), 'utf8')).toBe(readFileSync(manifest(h, 'Google/Chrome'), 'utf8'));
    expect(res.stdout.trim().split('\n')).toHaveLength(2);
    mkdirSync(path.join(AS(h), 'Chromium'), { recursive: true });
    expect(run(['/x.pkg', h]).stdout.trim().split('\n')).toHaveLength(3);
    expect(existsSync(manifest(h, 'Chromium'))).toBe(true);
  });

  it('falls back to $HOME when $2 is not a folder, and escapes the path as JSON', () => {
    const h = home('fall back "quoted"');
    const res = run(['/x.pkg', '/not/a/folder'], { HOME: h });
    expect(res.status, res.stdout).toBe(0);
    const m = JSON.parse(readFileSync(manifest(h, 'Google/Chrome'), 'utf8')) as { path: string };
    expect(m.path).toBe(path.join(bridge(h), 'beethoven-bridge'));
    const none = run(['/x.pkg', '/not/a/folder'], { HOME: '/also/not/a/folder' });
    expect(none.status).toBe(1);
    expect(none.stdout.trim().split('\n')).toHaveLength(1);
  });

  it('refuses a package whose allowed_origins.json is not Beethoven\'s origin list, and writes no manifest', () => {
    for (const [label, origins] of [
      ['placeholder', '["chrome-extension://REPLACE_WITH_EXTENSION_ID_SEE_HELPER_README/"]\n'],
      ['upper', `["chrome-extension://${ID.toUpperCase()}/"]\n`],
      ['extra', `["${ORIGIN}", "https://example.org/"]\n`],
      ['empty', '[]\n'],
      ['object', `{"origins": ["${ORIGIN}"]}\n`],
    ] as const) {
      const h = home(`bad-${label}`, origins);
      const res = run(['/x.pkg', h]);
      expect(res.status, label).toBe(1);
      expect(res.stdout.trim().split('\n'), label).toHaveLength(1);
      expect(res.stdout, label).toContain("built without Beethoven's extension identifier");
      expect(existsSync(path.join(AS(h), 'Google')), label).toBe(false);
    }
    // two origins, both well-formed, pass as in install.command
    const h = home('two', `["${ORIGIN}", "chrome-extension://${'p'.repeat(32)}/"]\n`);
    expect(run(['/x.pkg', h]).status).toBe(0);
    expect((JSON.parse(readFileSync(manifest(h, 'Google/Chrome'), 'utf8')) as { allowed_origins: string[] }).allowed_origins).toHaveLength(2);
  });

  it('says so and writes nothing when the payload is missing', () => {
    const h = path.join(T, 'homes', 'empty');
    mkdirSync(h, { recursive: true });
    const res = run(['/x.pkg', h]);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('were not found');
    expect(existsSync(path.join(AS(h), 'Google'))).toBe(false);
  });
});

describe.skipIf(!RUN)('uninstall.command against a stand-in home', () => {
  it('removes the manifests and the bridge files by name, the two folders when empty, forgets the receipt, and says its sentence', () => {
    const h = path.join(T, 'homes', 'uninstall');
    const AS = path.join(h, 'Library', 'Application Support');
    const bridge = path.join(AS, 'Beethoven', 'bridge');
    mkdirSync(bridge, { recursive: true });
    for (const f of ['beethoven-bridge', 'allowed_origins.json', 'allow.txt', 'README.txt']) writeFileSync(path.join(bridge, f), f);
    writeFileSync(path.join(bridge, 'uninstall.command'), readFileSync(UNINSTALL));
    chmodSync(path.join(bridge, 'uninstall.command'), 0o755);
    for (const b of ['Google/Chrome', 'Microsoft Edge', 'Chromium']) {
      mkdirSync(path.join(AS, b, 'NativeMessagingHosts'), { recursive: true });
      writeFileSync(path.join(AS, b, 'NativeMessagingHosts', `${NAME}.json`), '{}');
      writeFileSync(path.join(AS, b, 'NativeMessagingHosts', 'com.example.other.json'), '{}');
    }
    const log = path.join(T, 'uninstall.log');
    writeFileSync(log, '');
    const res = spawnSync('bash', [path.join(bridge, 'uninstall.command')], {
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, HOME: h, BEETHOVEN_BRIDGE_YES: '1', PATH: `${shims}:${process.env.PATH ?? ''}`, SHIM_LOG: log },
    });
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout.trim().split('\n').pop()).toBe('The Beethoven bridge is removed from this Mac.');
    expect(existsSync(bridge)).toBe(false);
    expect(existsSync(path.join(AS, 'Beethoven'))).toBe(false);
    for (const b of ['Google/Chrome', 'Microsoft Edge', 'Chromium']) {
      expect(existsSync(path.join(AS, b, 'NativeMessagingHosts', `${NAME}.json`))).toBe(false);
      expect(existsSync(path.join(AS, b, 'NativeMessagingHosts', 'com.example.other.json'))).toBe(true); // another host's file stays
    }
    expect(calls(log, 'pkgutil').map((c) => c.slice(1))).toEqual([['--forget', NAME, '--volume', h]]);
  });

  it('leaves the Beethoven folder when something else is in it, and waits for Return without the hook', () => {
    const h = path.join(T, 'homes', 'uninstall-keep');
    const AS = path.join(h, 'Library', 'Application Support');
    mkdirSync(path.join(AS, 'Beethoven', 'bridge'), { recursive: true });
    writeFileSync(path.join(AS, 'Beethoven', 'notes.txt'), 'kept');
    writeFileSync(path.join(AS, 'Beethoven', 'bridge', 'beethoven-bridge'), 'x');
    const res = spawnSync('bash', [UNINSTALL], { encoding: 'utf8', timeout: 30_000, input: '', env: { ...process.env, HOME: h, PATH: `${shims}:${process.env.PATH ?? ''}`, SHIM_LOG: path.join(T, 'u2.log') } });
    // stdin closed before Return: the prompt's read fails and the script leaves without removing anything
    expect(res.status).toBe(1);
    expect(existsSync(path.join(AS, 'Beethoven', 'bridge', 'beethoven-bridge'))).toBe(true);
    const yes = spawnSync('bash', [UNINSTALL], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, HOME: h, BEETHOVEN_BRIDGE_YES: '1', PATH: `${shims}:${process.env.PATH ?? ''}`, SHIM_LOG: path.join(T, 'u2.log') } });
    expect(yes.status).toBe(0);
    expect(existsSync(path.join(AS, 'Beethoven', 'bridge'))).toBe(false);
    expect(readFileSync(path.join(AS, 'Beethoven', 'notes.txt'), 'utf8')).toBe('kept');
  });
});

describe('the files themselves', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n)) : [path.join(dir, n)]));
  const files = walk(MAC);
  const scripts = [SCRIPT, POSTINSTALL, UNINSTALL];

  it('are the six under helper/release/mac the stream owns (the seventh is this test)', () => {
    expect(files.map((f) => path.relative(MAC, f).replace(/\\/g, '/')).sort()).toEqual(['README.md', 'build-pkg.sh', 'distribution.xml', 'payload/README.txt', 'payload/uninstall.command', 'scripts/postinstall']);
  });

  it('are LF-only printable ASCII, as helper/build.mjs demands of helper sources, and use no word this project does not use', () => {
    const banned = new RegExp('prov' + 'enance', 'i');
    for (const f of files) {
      const b = readFileSync(f);
      expect(b.includes(13), f).toBe(false);
      expect(b.some((c) => c > 126 || (c < 32 && c !== 10 && c !== 9)), f).toBe(false);
      expect(banned.test(b.toString('latin1')), f).toBe(false);
    }
  });

  it.skipIf(!RUN)('pass bash -n', () => {
    for (const s of scripts) {
      const r = spawnSync('bash', ['-n', s], { encoding: 'utf8' });
      expect(r.status, s + '\n' + r.stderr).toBe(0);
    }
  });

  it('use nothing the bash 3.2 that macOS ships lacks (a static stand-in: that bash cannot run on this Linux)', () => {
    for (const s of scripts) {
      const whole = readFileSync(s, 'utf8');
      expect(whole, s).toMatch(/^#!\/bin\/bash\n/);
      // the headers say in prose what they avoid, so only code lines are searched
      const t = whole.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
      expect(t, s).not.toMatch(/\b(declare|typeset|local)\s+-[a-zA-Z]*A\b/);
      expect(t, s).not.toMatch(/\b(mapfile|readarray)\b/);
      expect(t, s).not.toMatch(/\$\{[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?[,^]/);
      expect(t, s).not.toMatch(/\|&/);
      expect(t, s).not.toMatch(/;;?&/);
      expect(t, s).not.toMatch(/\$\{![A-Za-z_]+\[[@*]\]\}/); // ${!arr[@]} came with bash 3.0; the 4.x-only forms above are the ones that bite
    }
  });

  it('distribution.xml installs into the current user\'s home only, for both architectures, with no customization', () => {
    // the comment at the top names the tokens too; what productbuild reads is the rest
    const d = readFileSync(path.join(MAC, 'distribution.xml'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    expect(d).toContain('<domains enable_anywhere="false" enable_currentUserHome="true" enable_localSystem="false"/>');
    expect(d).toContain('<options customize="never" require-scripts="false" hostArchitectures="x86_64,arm64"/>');
    expect(d).toContain('<title>Beethoven bridge</title>');
    expect(d).toContain('<welcome file="welcome.txt" mime-type="text/plain"/>');
    expect(d.match(/@COMPONENT_PKG@/g)).toHaveLength(1);
    expect(d.match(/@VERSION@/g)).toHaveLength(1);
    expect(d.match(new RegExp(`<pkg-ref id="${NAME}"`, 'g'))).toHaveLength(2);
    expect(d).not.toMatch(/enable_localSystem="true"|enable_anywhere="true"/);
  });

  it('the installed README and the scripts\' sentences are student words with no internals', () => {
    const readme = readFileSync(path.join(MAC, 'payload', 'README.txt'), 'utf8');
    expect(readme).not.toMatch(/ssh|native messaging|manifest|registry|json|codesign|notariz/i);
    expect(readme).toContain('uninstall.command');
    expect(readme).toContain('no administrator password');
    const said = (s: string) => [...readFileSync(s, 'utf8').matchAll(/say "([^"]*)"/g)].map((m) => m[1]).join('\n');
    expect(said(UNINSTALL)).toContain('The Beethoven bridge is removed from this Mac.');
    expect(said(UNINSTALL) + said(POSTINSTALL)).not.toMatch(/ssh|native messaging|manifest|registry/i);
  });

  it('the maintainer README carries the trademark sentence and the not-yet-measured list, and names no identity', () => {
    const md = readFileSync(path.join(MAC, 'README.md'), 'utf8').replace(/\s+/g, ' ');
    expect(md).toContain('Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic\'s marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher.');
    expect(md).toContain('## Not yet measured');
    expect(md).toMatch(/Nothing in this folder has run on a real Mac/);
    expect(md).not.toMatch(/Developer ID (Application|Installer): [A-Z][a-z]+ [A-Z][a-z]+ \([A-Z0-9]{10}\)/); // placeholders only
    expect(md).toMatch(/<Name> \(<TEAMID>\)/);
  });
});
