// helper/build.mjs's merge of the signed installers (15.0.0), run as the release runbook runs it: a
// process, given fabricated .pkg and .msi files and sidecars whose size and sha256 this test computes.
// Every refusal exits 1 naming the sidecar, --no-signed leaves the three zips alone, and the tracked
// extension/public/bridge is a fresh build of helper/src. Plain Node; nothing is signed or opened here.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const BUILD = path.join(REPO, 'helper', 'build.mjs');
const TRACKED = path.join(REPO, 'extension', 'public', 'bridge');
const VERSION = fs.readFileSync(path.join(REPO, 'helper', 'VERSION'), 'utf8').trim();
// with this file present the build fills the zips' origins from it, and the tracked zips (placeholder) no longer compare
const IDS_FILE = path.join(REPO, 'helper', 'extension-ids.json');
const ID = 'abcdefghijklmnopabcdefghijklmnop';
const OTHER_ID = 'ponmlkjihgfedcbaponmlkjihgfedcba';
const ORIGIN = `chrome-extension://${ID}/`;
const SCRIPT_NAMES = ['beethoven-bridge-windows.zip', 'beethoven-bridge-mac.zip', 'beethoven-bridge-linux.zip'];

type Sidecar = Record<string, unknown>;
interface Manifest {
  helper: string;
  protocol: number;
  files: Array<Record<string, unknown>>;
}

const made: string[] = [];
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

function tmp(label: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `beethoven-build-${label}-`));
  made.push(d);
  return d;
}

function run(args: string[]): { code: number | null; out: string; err: string } {
  const r = spawnSync(process.execPath, [BUILD, ...args], { encoding: 'utf8', timeout: 60_000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

/** a fabricated package and the sidecar the release scripts would write for it */
function sidecarFor(name: string, osName: string, data: Buffer, way: string): Sidecar {
  return {
    name,
    os: osName,
    kind: 'binary',
    helper: VERSION,
    protocol: 1,
    size: data.length,
    sha256: sha256(data),
    allowed_origins: [ORIGIN],
    signed: way,
    built_at: '2026-10-04T12:00:00Z',
    tools: { fabricated: 'test' },
  };
}

interface Fixture {
  dir: string;
  mac: Buffer;
  windows: Buffer;
  macSidecar: Sidecar;
  windowsSidecar: Sidecar;
}

/** helper/signed/ as the two release scripts leave it; `mutate` turns one sidecar wrong before it is written */
function signedDir(label: string, mutate?: (f: Fixture) => void): Fixture {
  const dir = tmp(label);
  const mac = crypto.randomBytes(2048 + Math.floor(Math.random() * 512));
  const windows = crypto.randomBytes(2048 + Math.floor(Math.random() * 512));
  const f: Fixture = {
    dir,
    mac,
    windows,
    macSidecar: sidecarFor('beethoven-bridge-mac.pkg', 'mac', mac, 'developer-id-notarized'),
    windowsSidecar: sidecarFor('beethoven-bridge-windows.msi', 'windows', windows, 'authenticode'),
  };
  fs.writeFileSync(path.join(dir, 'beethoven-bridge-mac.pkg'), mac);
  fs.writeFileSync(path.join(dir, 'beethoven-bridge-windows.msi'), windows);
  mutate?.(f);
  fs.writeFileSync(path.join(dir, 'beethoven-bridge-mac.pkg.json'), JSON.stringify(f.macSidecar, null, 2));
  fs.writeFileSync(path.join(dir, 'beethoven-bridge-windows.msi.json'), JSON.stringify(f.windowsSidecar, null, 2));
  return f;
}

const readManifest = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Manifest;

describe('helper/build.mjs with signed installers in helper/signed/', () => {
  it('copies both packages byte for byte, lists them after the zips with the contract fields and no "open", says so in NOTE lines, and --check agrees', () => {
    const f = signedDir('ok');
    const out = tmp('ok-out');
    const r = run(['--out', out, '--signed', f.dir]);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);

    const m = readManifest(out);
    expect(m.helper).toBe(VERSION);
    expect(m.protocol).toBe(1);
    expect(m.files.map((x) => x.name)).toEqual([...SCRIPT_NAMES, 'beethoven-bridge-mac.pkg', 'beethoven-bridge-windows.msi']);
    for (const s of m.files.slice(0, 3)) expect(s.kind).toBe('script');
    const [mac, win] = m.files.slice(3);
    expect(mac).toEqual({ os: 'mac', kind: 'binary', name: 'beethoven-bridge-mac.pkg', size: f.mac.length, sha256: sha256(f.mac), allowed_origins: [ORIGIN], signed: 'developer-id-notarized' });
    expect(win).toEqual({ os: 'windows', kind: 'binary', name: 'beethoven-bridge-windows.msi', size: f.windows.length, sha256: sha256(f.windows), allowed_origins: [ORIGIN], signed: 'authenticode' });
    expect(Object.keys(mac!)).toEqual(['os', 'kind', 'name', 'size', 'sha256', 'allowed_origins', 'signed']);
    expect('open' in mac!).toBe(false);
    expect('open' in win!).toBe(false);
    expect(fs.readFileSync(path.join(out, 'beethoven-bridge-mac.pkg')).equals(f.mac)).toBe(true);
    expect(fs.readFileSync(path.join(out, 'beethoven-bridge-windows.msi')).equals(f.windows)).toBe(true);

    const notes = r.out.split('\n').filter((l) => l.startsWith('NOTE: signed installer'));
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain('beethoven-bridge-mac.pkg (mac, sha256 ' + sha256(f.mac).slice(0, 12));
    expect(notes[0]).toContain('1 origin)');
    expect(notes[1]).toContain('beethoven-bridge-windows.msi (windows, sha256 ' + sha256(f.windows).slice(0, 12));

    const c = run(['--out', out, '--signed', f.dir, '--check']);
    expect(c.err).toBe('');
    expect(c.code).toBe(0);
    expect(c.out).toMatch(/build --check: 6 files in .* match a fresh build of bridge /);
    // the same identifier given as --store-id is the one the sidecars name (a release build: it also fills the zips' origins)
    const store = tmp('ok-store');
    const s = run(['--out', store, '--signed', f.dir, '--store-id', ID]);
    expect(s.err).toBe('');
    expect(s.code).toBe(0);
    const sm = JSON.parse(fs.readFileSync(path.join(store, 'manifest.json'), 'utf8')) as Manifest & { origins_filled: boolean; allowed_origins: string[] };
    expect(sm.origins_filled).toBe(true);
    expect(sm.allowed_origins).toEqual([ORIGIN]);
    expect(sm.files.slice(3)).toEqual(m.files.slice(3));
    expect(run(['--out', store, '--signed', f.dir, '--store-id', ID, '--check']).code).toBe(0);
  });

  it('--no-signed with a populated signed folder yields the three-zip manifest, and a stale installer in the out folder is removed, not shipped unlisted', () => {
    const f = signedDir('nosigned');
    const out = tmp('nosigned-out');
    expect(run(['--out', out, '--signed', f.dir]).code).toBe(0);
    expect(fs.existsSync(path.join(out, 'beethoven-bridge-mac.pkg'))).toBe(true);

    // --check without the signed packages names the two files the build would not write
    const c = run(['--out', out, '--no-signed', '--check']);
    expect(c.code).toBe(1);
    expect(c.err).toContain('beethoven-bridge-mac.pkg is in');
    expect(c.err).toContain('beethoven-bridge-windows.msi is in');

    const r = run(['--out', out, '--no-signed']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('removed beethoven-bridge-mac.pkg: not in this build');
    expect(fs.readdirSync(out).sort()).toEqual([...SCRIPT_NAMES, 'manifest.json'].sort());
    const m = readManifest(out);
    expect(m.files.map((x) => x.name)).toEqual(SCRIPT_NAMES);
    for (const s of m.files) expect(s.kind).toBe('script');
    if (!fs.existsSync(IDS_FILE)) {
      expect(fs.readFileSync(path.join(out, 'manifest.json')).equals(fs.readFileSync(path.join(TRACKED, 'manifest.json')))).toBe(true);
    }
    // --signed and --no-signed together is a contradiction, not a choice
    expect(run(['--out', out, '--signed', f.dir, '--no-signed']).code).toBe(1);
  });

  // label; what goes wrong, before the sidecars are written (or, in `after`, once everything is on disk); the sidecar named
  const refusals: Array<{ label: string; sidecar: string; mutate?: (f: Fixture) => void; after?: (f: Fixture) => void }> = [
    { label: 'helper mismatch', sidecar: 'beethoven-bridge-mac.pkg.json', mutate: (f) => { f.macSidecar.helper = '2.0.0'; } },
    { label: 'protocol mismatch', sidecar: 'beethoven-bridge-windows.msi.json', mutate: (f) => { f.windowsSidecar.protocol = 2; } },
    { label: 'size mismatch', sidecar: 'beethoven-bridge-mac.pkg.json', mutate: (f) => { f.macSidecar.size = f.mac.length + 1; } },
    { label: 'sha256 mismatch', sidecar: 'beethoven-bridge-windows.msi.json', mutate: (f) => { f.windowsSidecar.sha256 = sha256(f.mac); } },
    { label: 'a name with a space', sidecar: 'beethoven-bridge-mac.pkg.json', mutate: (f) => { f.macSidecar.name = 'beethoven bridge.pkg'; } },
    { label: 'a .msi declared for mac', sidecar: 'beethoven-bridge-windows.msi.json', mutate: (f) => { f.windowsSidecar.os = 'mac'; } },
    { label: 'an origin with upper-case letters', sidecar: 'beethoven-bridge-mac.pkg.json', mutate: (f) => { f.macSidecar.allowed_origins = [`chrome-extension://${ID.toUpperCase()}/`]; } },
    { label: 'no origin at all', sidecar: 'beethoven-bridge-windows.msi.json', mutate: (f) => { f.windowsSidecar.allowed_origins = []; } },
    { label: '"signed" of an unknown value', sidecar: 'beethoven-bridge-mac.pkg.json', mutate: (f) => { f.macSidecar.signed = 'self-signed'; } },
    { label: '"signed" of the other system', sidecar: 'beethoven-bridge-windows.msi.json', mutate: (f) => { f.windowsSidecar.signed = 'developer-id-notarized'; } },
    { label: 'a sidecar without its package', sidecar: 'beethoven-bridge-windows.msi.json', after: (f) => { fs.rmSync(path.join(f.dir, 'beethoven-bridge-windows.msi')); } },
    { label: 'a sidecar that is not JSON', sidecar: 'beethoven-bridge-mac.pkg.json', after: (f) => { fs.writeFileSync(path.join(f.dir, 'beethoven-bridge-mac.pkg.json'), '{'); } },
  ];
  for (const { label, sidecar, mutate, after } of refusals) {
    it(`refuses ${label}, exits 1 and names the sidecar`, () => {
      const f = signedDir('refuse', mutate);
      after?.(f);
      const out = tmp('refuse-out');
      const r = run(['--out', out, '--signed', f.dir]);
      expect(r.code, r.err).toBe(1);
      expect(r.err).toContain(sidecar);
      expect(r.err.trim().split('\n')).toHaveLength(1);
      expect(fs.existsSync(path.join(out, 'manifest.json'))).toBe(false);
    });
  }

  it('refuses a --store-id the sidecars do not name, and a package with no sidecar beside it', () => {
    const f = signedDir('storeid');
    const out = tmp('storeid-out');
    const r = run(['--out', out, '--signed', f.dir, '--store-id', OTHER_ID]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('beethoven-bridge-mac.pkg.json');
    expect(r.err).toContain(ORIGIN);
    expect(fs.existsSync(path.join(out, 'manifest.json'))).toBe(false);

    fs.writeFileSync(path.join(f.dir, 'beethoven-bridge-linux.pkg'), crypto.randomBytes(64));
    const s = run(['--out', out, '--signed', f.dir]);
    expect(s.code).toBe(1);
    expect(s.err).toMatch(/beethoven-bridge-linux\.pkg in .* has no sidecar beethoven-bridge-linux\.pkg\.json beside it/);
  });

  it('refuses a --signed folder that is not there', () => {
    const r = run(['--out', tmp('missing-out'), '--signed', path.join(tmp('missing'), 'nowhere')]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('is not a folder');
  });

  // the tracked build matches the sources: what CI runs from extension/ as "node ../helper/build.mjs --check --no-signed"
  it.skipIf(fs.existsSync(IDS_FILE))('the tracked extension/public/bridge is a fresh build of helper/src (--check --no-signed)', () => {
    const r = run(['--check', '--no-signed']);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/build --check: 4 files in .* match a fresh build of bridge /);
    expect(fs.readdirSync(TRACKED).filter((n) => /\.(pkg|msi)$/.test(n))).toEqual([]);
  });
});
