// The Windows installer built on the Mac (helper/release/windows/build-msi-mac.sh and bridge.wxs), run on
// Linux, which has the same open tools the Mac route uses: msitools' wixl and msiinfo build and read a real
// MSI here, Rust cross-builds the real exe with the mingw-w64 linker where that target is installed, and
// stand-ins on PATH take the place of az, jsign and osslsigncode, recording their arguments, so what is
// checked is the script's own work: the argument refusals, the tool checks, the MSI's tables against
// Package.wxs, the token's path from az to jsign and nowhere else, the order of the signing steps, and a
// sidecar helper/build.mjs accepts. No Mac and no Windows machine has run any of it, and Azure Artifact
// Signing has not been asked for a signature: those are not yet measured (README.md there lists them).
// The bash 3.2 that macOS ships cannot run here either; a static search for the bash 4 constructs stands in.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const WIN = path.join(REPO, 'helper', 'release', 'windows');
const SCRIPT = path.join(WIN, 'build-msi-mac.sh');
const BUILD = path.join(REPO, 'helper', 'build.mjs');
const VERSION = readFileSync(path.join(REPO, 'helper', 'VERSION'), 'utf8').trim();
const HOST = 'com.openspineconsortium.beethoven.bridge';
const MSI = 'beethoven-bridge-windows.msi';
const ID = 'abcdefghijklmnopabcdefghijklmnop';
const ORIGIN = `chrome-extension://${ID}/`;
// stand-in names, shaped like the real ones and belonging to nobody
const ENDPOINT = 'stand-in.codesigning.example';
const ACCOUNT = 'stand-in-account';
const PROFILE = 'stand-in-profile';
const TOKEN = 'stand-in-token-6d1f0c9a';
const SIGN_ARGS = ['--store-id', ID, '--azure-endpoint', ENDPOINT, '--azure-account', ACCOUNT, '--azure-profile', PROFILE];
const RUN = process.platform !== 'win32';

const has = (cmd: string) => RUN && spawnSync('bash', ['-c', 'command -v "$0" >/dev/null', cmd]).status === 0;
const MSITOOLS = has('wixl') && has('msiinfo');
const CROSS =
  MSITOOLS && has('cargo') && has('x86_64-w64-mingw32-gcc') && has('x86_64-w64-mingw32-objdump') &&
  (spawnSync('rustup', ['target', 'list', '--installed'], { encoding: 'utf8' }).stdout ?? '').split('\n').includes('x86_64-pc-windows-gnu');

// ---- a small reader for the two WiX files ---------------------------------------------------------
// Every element with its attributes and the chain of elements around it; comments and the declaration
// are dropped, and a crossed or unclosed tag throws. No dependency: the check must stay readable.

interface El { name: string; attrs: Record<string, string>; parents: El[] }

function readXml(xml: string): El[] {
  const s = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  const all: El[] = [];
  const stack: El[] = [];
  for (const m of s.matchAll(/<(\/?)([A-Za-z]+)((?:[^>"]|"[^"]*")*?)(\/?)>/g)) {
    const [, close, name = '', rest = '', self] = m;
    if (close) {
      const open = stack.pop();
      if (open?.name !== name) throw new Error(`</${name}> closes <${open?.name ?? 'nothing'}>`);
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of rest.matchAll(/([A-Za-z]+)="([^"]*)"/g)) attrs[a[1] ?? ''] = a[2] ?? '';
    const el: El = { name, attrs, parents: stack.slice() };
    all.push(el);
    if (!self) stack.push(el);
  }
  if (stack.length) throw new Error(`<${stack[stack.length - 1]?.name}> never closes`);
  return all;
}

const named = (els: El[], name: string) => els.filter((e) => e.name === name);
/** the folder a component or a RemoveFolder lands in: an explicit Directory attribute, else the nearest enclosing folder */
function folderOf(e: El): string {
  if (e.name === 'RemoveFolder' && e.attrs.Directory) return e.attrs.Directory;
  for (const p of [...e.parents].reverse()) {
    if ((p.name === 'Directory' || p.name === 'StandardDirectory') && p.attrs.Id) return p.attrs.Id;
    if (p.name === 'ComponentGroup' && p.attrs.Directory) return p.attrs.Directory;
  }
  return '';
}
const componentOf = (e: El) => [...e.parents].reverse().find((p) => p.name === 'Component')?.attrs.Id ?? '';
/** the file a Source names, whichever separator follows $(var.StageDir) */
const staged = (src: string) => src.replace(/^\$\(var\.StageDir\)[\\/]/, '');

interface Summary {
  upgradeCode: string;
  components: Record<string, { guid: string; files: string[]; registry: string[] }>;
  removeFolders: string[];
  folders: string[];
  properties: Record<string, string>;
}

function summarize(els: El[]): Summary {
  const components: Summary['components'] = {};
  for (const c of named(els, 'Component')) components[c.attrs.Id ?? ''] = { guid: c.attrs.Guid ?? '', files: [], registry: [] };
  for (const f of named(els, 'File')) components[componentOf(f)]?.files.push(`${f.attrs.Id} ${staged(f.attrs.Source ?? '')} KeyPath=${f.attrs.KeyPath}`);
  for (const r of named(els, 'RegistryValue')) {
    const { Root, Key, Name, Value, Type, KeyPath } = r.attrs;
    components[componentOf(r)]?.registry.push(`${Root}\\${Key} [${Name ?? '(default)'}] = ${Value} (${Type}) KeyPath=${KeyPath ?? 'no'}`);
  }
  const upgradeCode = [...named(els, 'Package'), ...named(els, 'Product')].map((e) => e.attrs.UpgradeCode).find(Boolean) ?? '';
  const properties: Record<string, string> = {};
  for (const p of named(els, 'Property')) properties[p.attrs.Id ?? ''] = p.attrs.Value ?? '';
  return {
    upgradeCode,
    components,
    removeFolders: named(els, 'RemoveFolder').map((r) => `${r.attrs.Id} removes ${folderOf(r)} on ${r.attrs.On}`).sort(),
    // TARGETDIR is the root every MSI has; WiX v5 adds it itself and the v3 schema spells it out
    folders: named(els, 'Directory').filter((d) => d.attrs.Name && d.attrs.Id !== 'TARGETDIR').map((d) => `${d.attrs.Id} "${d.attrs.Name}" in ${folderOf(d)}`).sort(),
    properties,
  };
}

const PACKAGE_WXS = readFileSync(path.join(WIN, 'Package.wxs'), 'utf8');
const BRIDGE_WXS = readFileSync(path.join(WIN, 'bridge.wxs'), 'utf8');
const V5 = readXml(PACKAGE_WXS);
const V3 = readXml(BRIDGE_WXS);

describe('the XML reader is a real check', () => {
  it('reads nesting and attributes, and throws on a crossed or open tag', () => {
    const els = readXml('<?xml version="1.0"?><!-- <x> --><a b="1>2"><c d="e"/><f><g/></f></a>');
    expect(els.map((e) => e.name)).toEqual(['a', 'c', 'f', 'g']);
    expect(els[0]?.attrs.b).toBe('1>2');
    expect(els[3]?.parents.map((p) => p.name)).toEqual(['a', 'f']);
    expect(() => readXml('<a><b></a>')).toThrow();
    expect(() => readXml('<a><b/>')).toThrow();
  });
});

describe('bridge.wxs and Package.wxs are one package', () => {
  const a = summarize(V5);
  const b = summarize(V3);

  it('carry the same UpgradeCode, and bridge.wxs is the WiX v3 schema wixl reads', () => {
    expect(a.upgradeCode).toMatch(/^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/);
    expect(b.upgradeCode).toBe(a.upgradeCode);
    expect(BRIDGE_WXS).toContain('<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">');
    expect(named(V3, 'Product')[0]?.attrs.Id).toBe('*');
  });

  it('carry the same five components: Id, GUID, files and registry values, KeyPaths included', () => {
    expect(Object.keys(a.components).sort()).toEqual(['BridgeExe', 'FolderCleanup', 'HostManifest', 'HostRegistration', 'ReadMe']);
    expect(b.components).toEqual(a.components);
    const files = Object.values(a.components).flatMap((c) => c.files);
    expect(files.sort()).toEqual([`BridgeExeFile beethoven-bridge.exe KeyPath=no`, `HostManifestFile ${HOST}.json KeyPath=no`, 'ReadMeFile README.txt KeyPath=no']);
    expect(Object.values(a.components).flatMap((c) => c.registry)).toHaveLength(6);
  });

  it('install into the same folders and remove the same two on uninstall', () => {
    expect(b.folders).toEqual(a.folders);
    expect(a.folders).toEqual(['BeethovenFolder "Beethoven" in LocalAppDataFolder', 'BridgeFolder "bridge" in BeethovenFolder']);
    expect(b.removeFolders).toEqual(a.removeFolders);
    expect(a.removeFolders).toEqual(['RemoveBeethovenFolder removes BeethovenFolder on uninstall', 'RemoveBridgeFolder removes BridgeFolder on uninstall']);
    // wixl's RemoveFolder takes its component's folder, so bridge.wxs names none, and only FolderCleanup moved
    expect(named(V3, 'RemoveFolder').every((r) => r.attrs.Directory === undefined)).toBe(true);
    const where = (els: El[]) => Object.fromEntries(named(els, 'Component').map((c) => [c.attrs.Id, folderOf(c)]));
    expect(where(V3)).toEqual({ ...where(V5), FolderCleanup: 'BeethovenFolder' });
  });

  it('carry the same properties, product names, upgrade rule, media and feature', () => {
    expect(b.properties).toEqual(a.properties);
    expect(Object.keys(a.properties).sort()).toEqual(['ARPCOMMENTS', 'ARPHELPLINK', 'ARPNOMODIFY', 'ARPURLINFOABOUT']);
    const pkg = named(V5, 'Package')[0]?.attrs ?? {};
    const product = named(V3, 'Product')[0]?.attrs ?? {};
    const v3pkg = named(V3, 'Package')[0]?.attrs ?? {};
    for (const k of ['Name', 'Manufacturer', 'Version', 'Language']) expect(product[k], k).toBe(pkg[k]);
    expect(pkg.Scope).toBe('perUser');
    expect(v3pkg.InstallScope).toBe('perUser');
    expect(v3pkg.Compressed).toBe(pkg.Compressed);
    expect(v3pkg.Description).toBe(named(V5, 'SummaryInformation')[0]?.attrs.Description);
    expect(v3pkg.Manufacturer).toBe(pkg.Manufacturer);
    expect(named(V3, 'MajorUpgrade')[0]?.attrs).toEqual(named(V5, 'MajorUpgrade')[0]?.attrs);
    expect(named(V3, 'MediaTemplate')[0]?.attrs).toEqual(named(V5, 'MediaTemplate')[0]?.attrs);
    expect(named(V3, 'Feature')[0]?.attrs).toEqual(named(V5, 'Feature')[0]?.attrs);
    expect(named(V3, 'ComponentRef').map((r) => r.attrs.Id).sort()).toEqual(Object.keys(a.components).sort());
  });

  it('hold nothing else: an element added to one file and not the other fails here', () => {
    const kinds = (els: El[]) => [...new Set(els.map((e) => e.name))].sort();
    expect(kinds(V5)).toEqual(['Component', 'ComponentGroup', 'ComponentGroupRef', 'Directory', 'Feature', 'File', 'MajorUpgrade', 'MediaTemplate', 'Package', 'Property', 'RegistryValue', 'RemoveFolder', 'StandardDirectory', 'SummaryInformation', 'Wix']);
    expect(kinds(V3)).toEqual(['Component', 'ComponentRef', 'Directory', 'Feature', 'File', 'MajorUpgrade', 'MediaTemplate', 'Package', 'Product', 'Property', 'RegistryValue', 'RemoveFolder', 'Wix']);
    for (const k of ['Component', 'File', 'RegistryValue', 'RemoveFolder', 'Property']) expect(named(V3, k).length, k).toBe(named(V5, k).length);
    expect(BRIDGE_WXS).not.toMatch(/HKLM|HKMU|<CustomAction|<Binary|<ServiceInstall|<Shortcut/);
    // wixl on the Mac reads a backslash as part of the file name
    expect(BRIDGE_WXS).not.toMatch(/\$\(var\.StageDir\)\\/);
  });

  it('each says the two change together, and the test holds them equal', () => {
    const head = /<!--([\s\S]*?)-->/.exec(BRIDGE_WXS)?.[1] ?? '';
    expect(head).toContain('Package.wxs and this file are one package written twice and must change together');
    expect(head).toContain('releaseWindowsMac.test.ts');
    expect(PACKAGE_WXS).toMatch(/bridge\.wxs/);
  });
});

// ---- stand-ins and runs ---------------------------------------------------------------------------

// Every stand-in records its name and arguments, tab-separated, on one line of the log, and its own name in
// <log>.env when the token is anywhere in its environment: only jsign may ever appear there.
const PRELUDE = String.raw`#!/bin/bash
{ printf '%s' "$(basename "$0")"; for a in "$@"; do printf '\t%s' "$a"; done; printf '\n'; } >> "$SHIM_LOG"
if env | grep -Fq '${TOKEN}'; then basename "$0" >> "$SHIM_LOG.env"; fi
last=; for a in "$@"; do last=$a; done
`;

const JSIGN_BODY = String.raw`if [ "$1" = --version ]; then printf 'Jsign 7.5 (stand-in)\n'; exit 0; fi
var=; prev=
for a in "$@"; do [ "$prev" = --storepass ] && var=$a; prev=$a; done
case "$var" in env:*) ;; *) printf 'jsign stand-in: --storepass is not env:NAME\n' >&2; exit 9 ;; esac
name=$(printf '%s' "$var" | sed 's/^env://')
if [ "$(printenv "$name")" = '${TOKEN}' ]; then printf 'jsign-token\tok\n' >> "$SHIM_LOG"; else printf 'jsign-token\tmissing\n' >> "$SHIM_LOG"; fi
if [ "$SHIM_JSIGN_FAIL" = 1 ]; then printf 'jsign stand-in: the service answered 403 Forbidden\n' >&2; exit 1; fi
printf '\nsigned by the jsign stand-in\n' >> "$last"
printf 'Adding Authenticode signature to %s\n' "$last"
`;

const SHIMS: Record<string, string> = {
  cargo: String.raw`printf 'cargo-env\t%s\t%s\n' "$CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER" "$PWD" >> "$SHIM_LOG"
target= dir=
while [ $# -gt 0 ]; do case "$1" in --target) target=$2; shift 2 ;; --target-dir) dir=$2; shift 2 ;; *) shift ;; esac; done
[ -n "$target" ] && [ -n "$dir" ] || exit 9
mkdir -p "$dir/$target/release"
printf 'MZ stand-in exe for %s\n' "$target" > "$dir/$target/release/beethoven-bridge.exe"
`,
  rustup: String.raw`case "$*" in *"target list --installed"*) printf 'x86_64-unknown-linux-gnu\n'; [ "$SHIM_NO_TARGET" = 1 ] || printf 'x86_64-pc-windows-gnu\n' ;; *) exit 9 ;; esac
`,
  rustc: String.raw`printf 'rustc 9.0.0 (stand-in)\n'
`,
  'x86_64-w64-mingw32-gcc': String.raw`printf 'x86_64-w64-mingw32-gcc (GCC) stand-in\n'
`,
  'x86_64-w64-mingw32-objdump': String.raw`[ "$1" = -p ] || exit 9
printf '\nThe Import Tables (interpreted .idata section contents)\n'
printf '\tDLL Name: KERNEL32.dll\n\tvma:  Hint/Ord Member-Name Bound-To\n\tDLL Name: WS2_32.dll\n\tDLL Name: api-ms-win-core-synch-l1-2-0.dll\n'
if [ "$SHIM_UCRT" = 1 ]; then printf '\tDLL Name: api-ms-win-crt-runtime-l1-1-0.dll\n\tDLL Name: api-ms-win-crt-heap-l1-1-0.dll\n\tDLL Name: ucrtbase.dll\n'; fi
if [ "$SHIM_BAD_DLL" = 1 ]; then printf '\tDLL Name: libwinpthread-1.dll\n'; fi
exit 0
`,
  az: String.raw`if [ "$SHIM_AZ_FAIL" = 1 ]; then printf "ERROR: Please run 'az login' to setup account.\n" >&2; exit 1; fi
case "$*" in
  "account get-access-token --resource https://codesigning.azure.net --output none") ;;
  "account get-access-token --resource https://codesigning.azure.net --query accessToken --output tsv") printf '%s\n' '${TOKEN}' ;;
  *) printf 'az stand-in: unexpected arguments\n' >&2; exit 9 ;;
esac
`,
  jsign: JSIGN_BODY,
  // -version as a JDK answers it, or (SHIM_JAVA_STUB) as macOS's /usr/bin/java does with no Java runtime registered
  java: String.raw`if [ "$1" = -version ]; then
  if [ "$SHIM_JAVA_STUB" = 1 ]; then printf 'The operation could not be completed. Unable to locate a Java Runtime.\n' >&2; exit 1; fi
  printf 'openjdk version "21" (stand-in)\n' >&2; exit 0
fi
[ "$1" = -jar ] || exit 9
printf 'java-jar\t%s\n' "$2" >> "$SHIM_LOG"
shift 2
` + JSIGN_BODY,
  osslsigncode: String.raw`if [ "$1" = --version ]; then printf 'osslsigncode 2.8, using:\n\tOpenSSL (stand-in)\n'; exit 0; fi
[ "$1" = verify ] && [ "$2" = -in ] || exit 9
d=$( (sha256sum "$3" 2>/dev/null || shasum -a 256 "$3") | cut -d' ' -f1 | tr '[:lower:]' '[:upper:]')
c=$d
if [ "$SHIM_OSSL_MISMATCH" = 1 ]; then c=0000000000000000000000000000000000000000000000000000000000000000; fi
case "$3" in *.msi) what=DigitalSignature ;; *) what='message digest' ;; esac
printf 'Signature Index: 0  (Primary Signature)\n\nMessage digest algorithm  : SHA256\n'
printf 'Current %s    : %s \n' "$what" "$d"
printf 'Calculated %s : %s \n' "$what" "$c"
if [ "$c" != "$d" ]; then printf '    MISMATCH!!!\n'; fi
printf "\nSigner's certificate:\n\t------------------\n\tSigner #0:\n\t\tSubject: /CN=Stand-in Publisher\n\t\tIssuer : /CN=Stand-in Code Signing CA\n\n"
if [ "$SHIM_OSSL_NOTS" = 1 ]; then printf '\nTimestamp is not available\n\n'; else printf 'Countersignatures:\n\tTimestamp time: Oct  4 19:49:30 2026 GMT\n\tIssuer: /CN=Stand-in TSA\n\n'; fi
printf 'Signature verification: failed\n\nNumber of verified signatures: 1\nFailed\n'
exit 1
`,
  sw_vers: String.raw`printf '15.6\n'
`,
};
// enough for the tool check to pass where msitools is absent; the runs that reach them use the real ones
const MSITOOLS_STANDINS: Record<string, string> = { wixl: 'exit 9\n', msiinfo: 'exit 9\n' };

let T: string;
let shims: string;
let vendor: string;

function writeShims(dir: string, set: Record<string, string>, omit: string[] = []): void {
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(set)) {
    if (omit.includes(name)) continue;
    writeFileSync(path.join(dir, name), PRELUDE + body);
    chmodSync(path.join(dir, name), 0o755);
  }
}

/** one folder linking every command on this PATH except the omitted ones, so a tool can be taken away */
function farm(dir: string, omit: string[]): string {
  mkdirSync(dir, { recursive: true });
  const seen = new Set<string>(omit);
  for (const d of (process.env.PATH ?? '').split(path.delimiter)) {
    let names: string[] = [];
    try { names = readdirSync(d); } catch { continue; }
    for (const n of names) {
      if (seen.has(n)) continue;
      seen.add(n);
      symlinkSync(path.join(d, n), path.join(dir, n));
    }
  }
  return dir;
}

interface Ctx { log: string; tmp: string; out: string; cwd: string }
/** a fresh log, temp folder, output folder and working folder for one run */
function fresh(label: string): Ctx {
  const base = path.join(T, label);
  for (const d of ['tmp', 'cwd']) mkdirSync(path.join(base, d), { recursive: true });
  const log = path.join(base, 'argv.log');
  writeFileSync(log, '');
  return { log, tmp: path.join(base, 'tmp'), out: path.join(base, 'out'), cwd: path.join(base, 'cwd') };
}

function run(args: string[], c: Ctx, env: Record<string, string> = {}, PATH = `${shims}${path.delimiter}${process.env.PATH ?? ''}`) {
  const base: Record<string, string | undefined> = { ...process.env };
  for (const k of ['JSIGN', 'BEETHOVEN_MSI_TEST_EXE', 'ASHLEY_VENDOR_DIR', 'SHIM_AZ_FAIL', 'SHIM_JSIGN_FAIL', 'SHIM_BAD_DLL', 'SHIM_UCRT', 'SHIM_JAVA_STUB', 'SHIM_OSSL_MISMATCH', 'SHIM_OSSL_NOTS', 'SHIM_NO_TARGET']) delete base[k];
  const p = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 120_000,
    cwd: c.cwd,
    env: { ...base, PATH, SHIM_LOG: c.log, TMPDIR: c.tmp, BEETHOVEN_VENDOR_DIR: vendor, JSIGN: path.join(shims, 'jsign'), ...env },
  });
  return { code: p.status, out: p.stdout ?? '', err: p.stderr ?? '' };
}

const lines = (log: string) => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')) : []);
const calls = (log: string, tool: string) => lines(log).filter((l) => l[0] === tool);
const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n)) : [path.join(dir, n)])) : []);
const listed = (dir: string) => walk(dir).map((f) => path.relative(dir, f).replace(/\\/g, '/')).sort();

/** a table of an MSI as msiinfo exports it: header lines dropped, rows split on tabs */
function table(msi: string, name: string): string[][] {
  const r = spawnSync('msiinfo', ['export', msi, name], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`msiinfo export ${name}: ${r.stderr}`);
  return r.stdout.replace(/\r/g, '').split('\n').slice(3).filter(Boolean).map((l) => l.split('\t'));
}

beforeAll(() => {
  T = mkdtempSync(path.join(tmpdir(), 'beethoven-release-winmac-'));
  shims = path.join(T, 'bin');
  writeShims(shims, SHIMS);
  vendor = path.join(T, 'vendor');
  mkdirSync(vendor);
});
afterAll(() => {
  rmSync(T, { recursive: true, force: true });
});

// ---- the script as text --------------------------------------------------------------------------

describe('build-msi-mac.sh as text', () => {
  const whole = readFileSync(SCRIPT, 'utf8');
  const code = whole.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

  it.skipIf(!RUN)('passes bash -n', () => {
    const r = spawnSync('bash', ['-n', SCRIPT], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
  });

  it('uses nothing the bash 3.2 that macOS ships lacks (a static stand-in: that bash cannot run on this Linux)', () => {
    expect(whole).toMatch(/^#!\/bin\/bash\n/);
    expect(code).toContain('set -euo pipefail');
    expect(code).not.toMatch(/\b(declare|typeset|local)\s+-[a-zA-Z]*A\b/);
    expect(code).not.toMatch(/\b(mapfile|readarray)\b/);
    expect(code).not.toMatch(/\$\{[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?[,^]/);
    expect(code).not.toMatch(/\|&|&>>/);
    expect(code).not.toMatch(/;;?&/);
    expect(code).not.toMatch(/\$\{[A-Za-z_][A-Za-z0-9_]*\[-1\]\}/);
    expect(code).not.toMatch(/\bsed -i\b|\bstat -c\b|\breadlink -f\b/); // GNU-only spellings
  });

  it('keeps the token in one exported variable that only jsign reads: never an argument, never echoed, unset after each use', () => {
    const name = /--storepass env:([A-Z_]+)/.exec(code)?.[1] ?? '';
    expect(name).toMatch(/^[A-Z_]+$/);
    expect(code).not.toMatch(/set -x|set -o xtrace|BASH_XTRACEFD/);
    // az is asked twice: once to check the sign-in with nothing printed, once with its answer captured straight into the variable
    const az = code.split('\n').filter((l) => /\baz account get-access-token\b/.test(l));
    expect(az).toHaveLength(2);
    expect(az[0]).toMatch(/az account get-access-token --resource "\$AZ_RESOURCE" --output none >\/dev\/null/);
    expect(az[1]).toContain(`${name}=$(az account get-access-token --resource "$AZ_RESOURCE" --query accessToken --output tsv)`);
    // every line naming the variable is the capture, the export, the emptiness test, jsign's env: or an unset
    for (const l of code.split('\n').filter((x) => x.includes(name))) {
      expect(l, l).toMatch(new RegExp(`^\\s*(if ! ${name}=\\$\\(az |export ${name}$|if \\[ -z "\\$${name}" \\]; then$|--storepass env:${name} |unset ${name}$)`));
    }
    expect(code.match(new RegExp(`\\$\\{?${name}\\b`, 'g'))).toHaveLength(1); // read once, by the emptiness test
    expect(code.match(new RegExp(`unset ${name}`, 'g'))?.length).toBeGreaterThanOrEqual(5);
    // the jsign call: the store type, the names, env: and Microsoft's timestamp, and no other password option
    expect(code).toMatch(/"\$\{JSIGN_CMD\[@\]\}" --storetype TRUSTEDSIGNING --keystore "\$ENDPOINT" --alias "\$ACCOUNT\/\$PROFILE" \\\n\s+--storepass env:[A-Z_]+ --alg SHA-256 --tsaurl "\$TSA_URL" --tsmode RFC3161 "\$f"/);
    expect(code).not.toMatch(/--keypass|--storepass (?!env:)|file:/);
    expect(code).toContain('TSA_URL=http://timestamp.acs.microsoft.com');
    expect(code).toContain('AZ_RESOURCE=https://codesigning.azure.net');
  });

  it('holds no Azure name, identity, key or token shape, and reads the vendor folder the other scripts read', () => {
    for (const t of [whole, readFileSync(path.join(WIN, 'README.md'), 'utf8')]) {
      const hosts = [...t.matchAll(/([A-Za-z0-9<>-]+)\.codesigning\.azure\.net/g)].map((m) => m[1]);
      expect(hosts.every((h) => h === '<region>'), hosts.join(' ')).toBe(true);
      expect(t).not.toContain('-----BEGIN');
      expect(t).not.toMatch(/\b(eyJ[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,})\b/);
      expect(t).not.toMatch(/password\s*=|client[_-]?secret\s*=/i);
      expect(t).not.toMatch(/\.onmicrosoft\.com|@\w+\.(com|edu|org)/i);
    }
    expect(code).toContain('VENDOR=${BEETHOVEN_VENDOR_DIR:-${ASHLEY_VENDOR_DIR:-$HOME/.beethoven-vendor}}');
  });

  it('stages the manifest build-msi.ps1 writes, word for word', () => {
    const ps1 = readFileSync(path.join(WIN, 'build-msi.ps1'), 'utf8');
    const description = /"description`": `"([^`]+)`"/.exec(ps1)?.[1] ?? '';
    expect(description).toMatch(/^The Beethoven bridge: /);
    expect(code).toContain(`"${description}"`);
    expect(code).toContain(`printf '  "path": "%s",\\n' "$EXE_NAME"`);
    expect(code).toContain(`printf '  "type": "stdio",\\n'`);
    expect(code).toContain(`printf '  "allowed_origins": ["%s"]\\n' "$ORIGIN"`);
  });

  it('allows exactly Windows\' own libraries, the six measured on 2026-10-04 among them', () => {
    const allowed = (/^ALLOWED_DLLS="([^"]+)"$/m.exec(code)?.[1] ?? '').split(' ');
    for (const d of ['kernel32.dll', 'ntdll.dll', 'msvcrt.dll', 'ws2_32.dll', 'bcryptprimitives.dll', 'api-ms-win-core-synch-l1-2-0.dll']) expect(allowed).toContain(d);
    expect(allowed.every((d) => /^[a-z0-9_-]+\.dll$/.test(d) && !/^lib/.test(d))).toBe(true);
    expect(allowed.length).toBeLessThanOrEqual(10);
    // the Universal C Runtime a UCRT-default mingw-w64 links in place of msvcrt.dll, by name pattern
    expect(code).toContain('api-ms-win-crt-*-l1-1-0.dll|ucrtbase.dll)');
  });

  it('matches captured text without a pipe into grep -q (a writer killed by SIGPIPE under pipefail turns a match into a miss)', () => {
    expect(code).not.toMatch(/(?<!\|)\|(?!\|)\s*grep\s+-[A-Za-z]*q/);
    expect(code.match(/<<<"\$[A-Za-z_]+"/g)?.length).toBeGreaterThanOrEqual(15);
  });
});

// ---- refusals ----------------------------------------------------------------------------------

describe.skipIf(!RUN)('build-msi-mac.sh refusals', () => {
  it('a bad or missing store id exits 2 with one sentence, before any tool runs', () => {
    for (const bad of ['abc', 'ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP', 'abcdefghijklmnopabcdefghijklmnoq', 'abcdefghijklmnopabcdefghijklmno']) {
      const c = fresh('badid');
      const r = run(['--store-id', bad, ...SIGN_ARGS.slice(2), '--out', c.out], c);
      expect(r.code, bad).toBe(2);
      expect(r.err.trim().split('\n'), bad).toHaveLength(1);
      expect(r.err).toContain('--store-id must be');
      expect(r.out).toBe('');
      expect(readFileSync(c.log, 'utf8')).toBe('');
      expect(existsSync(c.out)).toBe(false);
    }
    const c = fresh('noid');
    expect(run(SIGN_ARGS.slice(2), c).code).toBe(2);
  });

  it('signing without each Azure name, or with a malformed one, exits 2 naming the option', () => {
    const c = fresh('azure-args');
    const without = (opt: string) => {
      const i = SIGN_ARGS.indexOf(opt);
      return [...SIGN_ARGS.slice(0, i), ...SIGN_ARGS.slice(i + 2)];
    };
    for (const opt of ['--azure-endpoint', '--azure-account', '--azure-profile']) {
      const r = run([...without(opt), '--out', c.out], c);
      expect(r.code, opt).toBe(2);
      expect(r.err, opt).toContain(`${opt} is required`);
    }
    const bad: Array<[string, string]> = [
      ['--azure-endpoint', 'https://eus.codesigning.azure.net/path'],
      ['--azure-endpoint', '-eus.codesigning.azure.net'],
      ['--azure-endpoint', 'stand-in-account'],
      ['--azure-endpoint', '<region>.codesigning.azure.net'],
      ['--azure-account', '<account>'],
      ['--azure-account', 'account/profile'],
      ['--azure-account', 'two words'],
      ['--azure-account', 'under_score'],
      ['--azure-profile', '<profile>'],
      ['--azure-profile', '-leading-hyphen'],
      ['--azure-profile', 'account/profile'],
    ];
    for (const [opt, value] of bad) {
      const args = [...SIGN_ARGS];
      args[args.indexOf(opt) + 1] = value;
      const r = run([...args, '--out', c.out], c);
      expect(r.code, `${opt} ${value}`).toBe(2);
      expect(r.err, `${opt} ${value}`).toContain(`${opt} must be`);
    }
    expect(readFileSync(c.log, 'utf8')).toBe('');
    expect(existsSync(c.out)).toBe(false);
  });

  it('an unknown argument, a missing value and the test hook outside a trial each exit 2', () => {
    const c = fresh('args');
    expect(run([...SIGN_ARGS, '--out', c.out, '--sign-with', 'x'], c)).toMatchObject({ code: 2, err: expect.stringContaining('Unknown argument: --sign-with') });
    expect(run([...SIGN_ARGS, '--out'], c)).toMatchObject({ code: 2, err: expect.stringContaining('--out needs a value') });
    const exe = path.join(T, 'hook.exe');
    writeFileSync(exe, 'MZ\n');
    expect(run([...SIGN_ARGS, '--out', c.out], c, { BEETHOVEN_MSI_TEST_EXE: exe })).toMatchObject({ code: 2, err: expect.stringContaining('accepted only with --no-sign') });
    expect(run(['--store-id', ID, '--no-sign', '--out', c.out], c, { BEETHOVEN_MSI_TEST_EXE: path.join(T, 'nowhere.exe') })).toMatchObject({ code: 2, err: expect.stringContaining('is not a file') });
    expect(readFileSync(c.log, 'utf8')).toBe('');
    expect(existsSync(c.out)).toBe(false);
  });

  it('--help prints the usage and exits 0', () => {
    const r = run(['--help'], fresh('help'));
    expect(r.code).toBe(0);
    for (const s of ['--store-id ID', '--azure-endpoint HOST', '--azure-account NAME', '--azure-profile NAME', '--no-sign', '--keep-work']) expect(r.out).toContain(s);
  });

  it('a missing tool exits 3 with the fix, before anything is built', () => {
    const spaced = path.join(T, 'Mobile Documents', 'jsign.jar');
    mkdirSync(path.dirname(spaced), { recursive: true });
    writeFileSync(spaced, 'a real file whose path has a space\n');
    const jar = path.join(T, 'jar', 'jsign.jar');
    mkdirSync(path.dirname(jar), { recursive: true });
    writeFileSync(jar, 'a stand-in jar\n');
    const stubVendor = path.join(T, 'vendor-stub');
    mkdirSync(path.join(stubVendor, 'jsign'), { recursive: true });
    writeFileSync(path.join(stubVendor, 'jsign', 'jsign-7.5.jar'), 'a stand-in jar\n');
    const cases: Array<{ omit: string[]; args: string[]; env?: Record<string, string>; says: string[] }> = [
      { omit: ['wixl'], args: ['--store-id', ID, '--no-sign'], says: ['wixl was not found', 'brew install msitools'] },
      { omit: ['x86_64-w64-mingw32-gcc'], args: ['--store-id', ID, '--no-sign'], says: ['x86_64-w64-mingw32-gcc was not found', 'brew install mingw-w64'] },
      { omit: ['az'], args: SIGN_ARGS, says: ['az was not found', 'brew install azure-cli'] },
      { omit: ['osslsigncode'], args: SIGN_ARGS, says: ['osslsigncode was not found', 'brew install osslsigncode'] },
      { omit: ['jsign', 'java'], args: SIGN_ARGS, env: { JSIGN: '' }, says: ['jsign was not found', 'net.jsign:jsign', `${vendor}/jsign/`] },
      { omit: [], args: SIGN_ARGS, env: { JSIGN: path.join(T, 'no-such-jsign') }, says: ['JSIGN names'] },
      // JSIGN is split at spaces: the jar is there, and the tool check says why it cannot be named so
      { omit: [], args: SIGN_ARGS, env: { JSIGN: `java -jar ${spaced}` }, says: ['split at spaces', 'not a file'] },
      // macOS's /usr/bin/java with no Java runtime registered, by either route that runs java
      { omit: [], args: SIGN_ARGS, env: { JSIGN: `java -jar ${jar}`, SHIM_JAVA_STUB: '1' }, says: ['java is on PATH but does not run', 'openjdk.jdk'] },
      { omit: ['jsign'], args: SIGN_ARGS, env: { JSIGN: '', BEETHOVEN_VENDOR_DIR: stubVendor, SHIM_JAVA_STUB: '1' }, says: ['java is on PATH but does not run'] },
      { omit: [], args: ['--store-id', ID, '--no-sign'], env: { SHIM_NO_TARGET: '1' }, says: ['rustup target add x86_64-pc-windows-gnu'] },
    ];
    for (const [i, k] of cases.entries()) {
      const bin = path.join(T, `bin-missing-${i}`);
      writeShims(bin, { ...SHIMS, ...MSITOOLS_STANDINS }, k.omit);
      const c = fresh(`missing-${i}`);
      const r = run([...k.args, '--out', c.out], c, k.env ?? {}, `${bin}${path.delimiter}${farm(path.join(T, `farm-${i}`), [...k.omit, ...Object.keys(SHIMS), ...Object.keys(MSITOOLS_STANDINS)])}`);
      expect(r.code, `${k.omit.join(' ')}: ${r.err}`).toBe(3);
      for (const s of k.says) expect(r.err).toContain(s);
      expect(calls(c.log, 'cargo')).toEqual([]);
      expect(calls(c.log, 'az')).toEqual([]);
      expect(readdirSync(c.tmp)).toEqual([]);
    }
  });
});

// ---- a trial with the test hook, the real wixl and msiinfo -----------------------------------------

describe.skipIf(!MSITOOLS)('a trial build (--no-sign) of a stand-in exe, with the real wixl and msiinfo', () => {
  let c: Ctx;
  let home: string;
  let exe: string;
  let res: { code: number | null; out: string; err: string };
  let msi: string;
  let gitBefore: string;
  const git = () => spawnSync('git', ['status', '--porcelain', '--ignored', '--', 'helper'], { cwd: REPO, encoding: 'utf8' });
  const GIT = spawnSync('git', ['--version']).status === 0 && git().status === 0;

  beforeAll(() => {
    c = fresh('hook');
    home = path.join(T, 'hook', 'home');
    mkdirSync(home);
    exe = path.join(T, 'hook', 'stand-in.exe');
    writeFileSync(exe, 'MZ a tiny stand-in, not a program\n');
    gitBefore = GIT ? git().stdout : '';
    res = run(['--store-id', ID, '--no-sign', '--out', c.out], c, { BEETHOVEN_MSI_TEST_EXE: exe, HOME: home });
    msi = path.join(c.out, 'trial', MSI);
  });

  it('exits 0, says the MSI must never ship, and writes it to <out>/trial with no sidecar', () => {
    expect(res.code, res.out + res.err).toBe(0);
    expect(res.out).toContain('must never ship');
    expect(res.out).toContain('BEETHOVEN_MSI_TEST_EXE, a test hook');
    expect(res.out).not.toMatch(/Signing |Writing the sidecar/);
    expect(listed(c.out)).toEqual([`trial/${MSI}`]);
  });

  it('writes nothing outside the out folder and its own work folder, and runs no build or signing tool', () => {
    expect(readdirSync(c.tmp)).toEqual([]); // the work folder is gone again
    expect(readdirSync(home)).toEqual([]);
    expect(readdirSync(c.cwd)).toEqual([]);
    expect(readFileSync(c.log, 'utf8')).toBe('');
    expect(readFileSync(exe, 'utf8')).toBe('MZ a tiny stand-in, not a program\n');
    if (GIT) expect(git().stdout).toBe(gitBefore);
  });

  it('Registry: six values, every one under HKEY_CURRENT_USER, and both browsers\' keys pointing at the manifest', () => {
    const rows = table(msi, 'Registry');
    expect(rows).toHaveLength(6);
    for (const r of rows) expect(r[1], r.join(' | ')).toBe('1');
    const value = `[BridgeFolder]${HOST}.json`;
    for (const browser of ['Google\\Chrome', 'Microsoft\\Edge']) {
      const row = rows.find((r) => r[2] === `Software\\${browser}\\NativeMessagingHosts\\${HOST}`);
      expect(row, browser).toBeDefined();
      expect(row?.slice(3)).toEqual(['', value, 'HostRegistration']);
    }
    const markers = rows.filter((r) => r[2] === 'Software\\OpenSpineConsortium\\Beethoven bridge').map((r) => `${r[3]}=${r[4]} ${r[5]}`).sort();
    expect(markers).toEqual(['BridgeExe', 'FolderCleanup', 'HostManifest', 'ReadMe'].map((n) => `${n}=${VERSION} ${n}`));
  });

  it('Component and RemoveFile: Package.wxs\'s GUIDs, each keyed by its registry value, and the two folders removed on uninstall', () => {
    const guids = Object.fromEntries(named(V5, 'Component').map((e) => [e.attrs.Id, `{${e.attrs.Guid}}`]));
    const rows = table(msi, 'Component');
    expect(Object.fromEntries(rows.map((r) => [r[0], r[1]]))).toEqual(guids);
    for (const r of rows) {
      expect(Number(r[3]) & 4, `${r[0]} has a registry KeyPath`).toBe(4);
      expect(Number(r[3]) & 256, `${r[0]} is a 64-bit component`).toBe(256);
      expect(r[2]).toBe(r[0] === 'FolderCleanup' ? 'BeethovenFolder' : 'BridgeFolder');
    }
    expect(table(msi, 'RemoveFile').map((r) => r.join('|')).sort()).toEqual(['RemoveBeethovenFolder|FolderCleanup||BeethovenFolder|2', 'RemoveBridgeFolder|BridgeExe||BridgeFolder|2']);
  });

  it('Directory and File: %LOCALAPPDATA%\\Beethoven\\bridge, holding the three staged files', () => {
    const dirs = Object.fromEntries(table(msi, 'Directory').map((r) => [r[0], `${r[1]} ${r[2]}`]));
    expect(dirs).toMatchObject({ BridgeFolder: 'BeethovenFolder bridge', BeethovenFolder: 'LocalAppDataFolder Beethoven' });
    expect(dirs.LocalAppDataFolder?.startsWith('TARGETDIR')).toBe(true);
    const files = table(msi, 'File').map((r) => `${r[0]} ${r[1]} ${r[2]} ${r[3]}`).sort();
    const manifest = `{\n  "name": "${HOST}",\n  "description": "The Beethoven bridge: carries Beethoven's encrypted ssh connection to the grid.",\n  "path": "beethoven-bridge.exe",\n  "type": "stdio",\n  "allowed_origins": ["${ORIGIN}"]\n}\n`;
    expect(files).toEqual([
      `BridgeExeFile BridgeExe beethoven-bridge.exe ${statSync(exe).size}`,
      `HostManifestFile HostManifest ${HOST}.json ${Buffer.byteLength(manifest)}`,
      `ReadMeFile ReadMe README.txt ${statSync(path.join(WIN, 'README.txt')).size}`,
    ]);
    if (has('msiextract')) {
      const x = path.join(T, 'hook', 'extracted');
      mkdirSync(x);
      expect(spawnSync('msiextract', ['-C', x, msi]).status).toBe(0);
      const bridge = path.join(x, 'Beethoven', 'bridge');
      expect(readdirSync(bridge).sort()).toEqual(['README.txt', 'beethoven-bridge.exe', `${HOST}.json`]);
      expect(readFileSync(path.join(bridge, `${HOST}.json`), 'utf8')).toBe(manifest);
      expect(readFileSync(path.join(bridge, 'README.txt'))).toEqual(readFileSync(path.join(WIN, 'README.txt')));
      expect(readFileSync(path.join(bridge, 'beethoven-bridge.exe'))).toEqual(readFileSync(exe));
    }
  });

  it('Upgrade, Property and the summary: MajorUpgrade on Package.wxs\'s UpgradeCode, per user, x64, no custom action', () => {
    const code = `{${summarize(V5).upgradeCode}}`;
    const up = table(msi, 'Upgrade');
    expect(up.map((r) => [r[0], r[6]])).toEqual(expect.arrayContaining([[code, 'WIX_UPGRADE_DETECTED'], [code, 'WIX_DOWNGRADE_DETECTED']]));
    expect(up).toHaveLength(2);
    expect(up.find((r) => r[6] === 'WIX_UPGRADE_DETECTED')?.[2]).toBe(VERSION);
    expect(up.find((r) => r[6] === 'WIX_DOWNGRADE_DETECTED')?.[1]).toBe(VERSION);
    const props = Object.fromEntries(table(msi, 'Property').map((r) => [r[0], r[1]]));
    expect(props.ALLUSERS).toBeUndefined();
    expect(props.MSIINSTALLPERUSER).toBeUndefined();
    expect(props).toMatchObject({ ...summarize(V5).properties, ProductName: 'Beethoven bridge', Manufacturer: 'OpenSpineConsortium', ProductVersion: VERSION, ProductLanguage: '1033', UpgradeCode: code });
    expect(table(msi, 'LaunchCondition')).toEqual([['NOT WIX_DOWNGRADE_DETECTED', 'A newer Beethoven bridge is already installed.']]);
    expect(table(msi, 'CustomAction')).toEqual([]);
    const info = spawnSync('msiinfo', ['suminfo', msi], { encoding: 'utf8' }).stdout;
    expect(Number(/^Source: (\d+)/m.exec(info)?.[1]) & 8).toBe(8); // installs without administrator rights
    expect(info).toMatch(/^Template: x64;1033$/m);
  });

  it('with --keep-work, the work folder holds the staged payload and nothing of anyone else\'s', () => {
    const k = fresh('hook-keep');
    const r = run(['--store-id', ID, '--no-sign', '--out', k.out, '--keep-work'], k, { BEETHOVEN_MSI_TEST_EXE: exe });
    expect(r.code, r.err).toBe(0);
    const kept = readdirSync(k.tmp);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatch(/^beethoven-bridge-msi\./);
    expect(r.out).toContain(`Work folder kept: ${path.join(k.tmp, kept[0] ?? '')}`);
    expect(listed(path.join(k.tmp, kept[0] ?? ''))).toEqual([MSI, 'beethoven-bridge.exe', 'stage/README.txt', 'stage/beethoven-bridge.exe', `stage/${HOST}.json`]);
  });
});

// ---- a signed build against stand-ins for the service's tools -----------------------------------------

describe.skipIf(!MSITOOLS)('a signed build, against stand-ins for cargo, objdump, az, jsign and osslsigncode, with the real wixl and msiinfo', () => {
  let c: Ctx;
  let res: { code: number | null; out: string; err: string };
  let work: string;
  let final: string;
  let sidecar: Record<string, unknown>;

  beforeAll(() => {
    c = fresh('signed');
    // the endpoint as the Azure portal shows it, a URL: the script takes it down to the host
    const args = [...SIGN_ARGS];
    args[args.indexOf('--azure-endpoint') + 1] = `https://${ENDPOINT}/`;
    res = run([...args, '--out', c.out, '--keep-work'], c);
    work = path.join(c.tmp, readdirSync(c.tmp)[0] ?? 'missing');
    final = path.join(c.out, MSI);
    sidecar = existsSync(`${final}.json`) ? (JSON.parse(readFileSync(`${final}.json`, 'utf8')) as Record<string, unknown>) : {};
  });

  it('exits 0, announces each step on one line and names what it wrote', () => {
    expect(res.code, res.out + res.err).toBe(0);
    expect(res.out.split('\n').filter((l) => l.startsWith('-- ')).length).toBeGreaterThanOrEqual(12);
    expect(res.out).toContain(`Wrote ${final} (`);
    expect(res.out).toContain(`Wrote ${final}.json`);
    expect(res.out).toContain('signer Subject: /CN=Stand-in Publisher');
    expect(res.out).toContain('Timestamp time: Oct  4 19:49:30 2026 GMT');
    expect(res.out).toContain('could not follow the certificate chain');
    expect(listed(c.out)).toEqual([MSI, `${MSI}.json`]);
  });

  it('writes the sidecar the contract names, with the size and SHA-256 of the signed file, and helper/build.mjs takes it', () => {
    expect(sidecar).toMatchObject({ name: MSI, os: 'windows', kind: 'binary', helper: VERSION, protocol: 1, size: statSync(final).size, sha256: sha256(final), allowed_origins: [ORIGIN], signed: 'authenticode' });
    expect(Object.keys(sidecar).sort()).toEqual(['allowed_origins', 'built_at', 'helper', 'kind', 'name', 'os', 'protocol', 'sha256', 'signed', 'size', 'tools']);
    expect(sidecar.built_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(Math.abs(Date.parse(sidecar.built_at as string) - Date.now())).toBeLessThan(10 * 60_000);
    expect(sidecar.tools).toMatchObject({ rustc: 'rustc 9.0.0 (stand-in)', mingw: 'x86_64-w64-mingw32-gcc (GCC) stand-in', jsign: 'Jsign 7.5 (stand-in)', osslsigncode: 'osslsigncode 2.8', macos: '15.6' });
    expect(readFileSync(final, 'utf8').endsWith('\nsigned by the jsign stand-in\n')).toBe(true);
    const bridge = path.join(T, 'signed', 'bridge');
    const b = spawnSync(process.execPath, [BUILD, '--store-id', ID, '--signed', c.out, '--out', bridge], { encoding: 'utf8', timeout: 60_000 });
    expect(b.status, b.stderr).toBe(0);
    expect(b.stdout).toContain(`NOTE: signed installer ${MSI} (windows, sha256 ${sha256(final).slice(0, 12)}..., 1 origin)`);
    expect(readFileSync(path.join(bridge, MSI))).toEqual(readFileSync(final));
  });

  it('cross-builds into the work folder with the mingw linker, then checks the imports', () => {
    const cargo = calls(c.log, 'cargo');
    expect(cargo).toHaveLength(1);
    expect(cargo[0]?.slice(1)).toEqual(['build', '--release', '--locked', '--target', 'x86_64-pc-windows-gnu', '--target-dir', path.join(work, 'target')]);
    expect(calls(c.log, 'cargo-env')[0]?.slice(1)).toEqual(['x86_64-w64-mingw32-gcc', path.join(REPO, 'helper', 'src', 'rust')]);
    expect(calls(c.log, 'x86_64-w64-mingw32-objdump').map((l) => l.slice(1))).toEqual([['-p', path.join(work, 'beethoven-bridge.exe')]]);
    for (const d of ['KERNEL32.dll', 'WS2_32.dll', 'api-ms-win-core-synch-l1-2-0.dll']) expect(res.out).toContain(`imports ${d}`);
    expect(existsSync(path.join(REPO, 'helper', 'src', 'rust', 'target', 'x86_64-pc-windows-gnu'))).toBe(false);
  });

  it('signs the staged exe before it is packaged and the MSI after, each with its own token, and checks each signature', () => {
    const order = lines(c.log).filter((l) => ['az', 'cargo', 'jsign', 'osslsigncode'].includes(l[0] ?? '') && l[1] !== '--version').map((l) => `${l[0]} ${l[l.length - 1] === 'tsv' ? 'token' : l[l.length - 1] === 'none' ? 'check' : path.basename(l[l.length - 1] ?? '')}`);
    expect(order).toEqual([
      'az check',
      'cargo ' + path.basename(path.join(work, 'target')),
      'az token',
      'jsign beethoven-bridge.exe',
      'osslsigncode beethoven-bridge.exe',
      'az token',
      `jsign ${MSI}`,
      `osslsigncode ${MSI}`,
    ]);
    const signs = calls(c.log, 'jsign').filter((l) => l[1] !== '--version');
    expect(signs.map((l) => l.slice(1))).toEqual([path.join(work, 'stage', 'beethoven-bridge.exe'), path.join(work, MSI)].map((f) => [
      '--storetype', 'TRUSTEDSIGNING', '--keystore', ENDPOINT, '--alias', `${ACCOUNT}/${PROFILE}`, '--storepass', expect.stringMatching(/^env:[A-Z_]+$/) as unknown as string,
      '--alg', 'SHA-256', '--tsaurl', 'http://timestamp.acs.microsoft.com', '--tsmode', 'RFC3161', f,
    ]));
    expect(calls(c.log, 'jsign-token').map((l) => l[1])).toEqual(['ok', 'ok']);
    expect(calls(c.log, 'osslsigncode').filter((l) => l[1] !== '--version').map((l) => l.slice(1, 3))).toEqual([['verify', '-in'], ['verify', '-in']]);
    // the exe inside the MSI is the signed one: its size in the File table includes the stand-in's signature
    const exeRow = table(path.join(work, MSI), 'File').find((r) => r[2] === 'beethoven-bridge.exe');
    expect(Number(exeRow?.[3])).toBe(statSync(path.join(work, 'stage', 'beethoven-bridge.exe')).size);
    expect(readFileSync(path.join(work, 'stage', 'beethoven-bridge.exe'), 'utf8')).toContain('signed by the jsign stand-in');
  });

  it('the token reaches jsign\'s environment and nothing else: no argument, no other tool, no output, no file', () => {
    expect(readFileSync(c.log, 'utf8')).not.toContain(TOKEN);
    expect(readFileSync(`${c.log}.env`, 'utf8').trim().split('\n')).toEqual(['jsign', 'jsign']);
    expect(res.out + res.err).not.toContain(TOKEN);
    for (const f of [...walk(c.out), ...walk(work)]) expect(readFileSync(f).includes(TOKEN), f).toBe(false);
  });

  it('runs jsign.jar from the vendor folder with java when neither JSIGN nor jsign on PATH is there', () => {
    writeFileSync(path.join(vendor, 'jsign.jar'), 'a stand-in, java is a stand-in too\n');
    try {
      const v = fresh('vendor-jar');
      const bin = path.join(T, 'bin-vendor');
      writeShims(bin, SHIMS, ['jsign']);
      const r = run([...SIGN_ARGS, '--out', v.out], v, { JSIGN: '' }, `${bin}${path.delimiter}${farm(path.join(T, 'farm-vendor'), ['jsign', ...Object.keys(SHIMS)])}`);
      expect(r.code, r.err).toBe(0);
      expect(calls(v.log, 'java-jar').map((l) => l[1])).toEqual([path.join(vendor, 'jsign.jar'), path.join(vendor, 'jsign.jar'), path.join(vendor, 'jsign.jar')]);
      expect(calls(v.log, 'jsign-token').map((l) => l[1])).toEqual(['ok', 'ok']);
      expect(listed(v.out)).toEqual([MSI, `${MSI}.json`]);
    } finally {
      rmSync(path.join(vendor, 'jsign.jar'));
    }
  });

  it('runs the first jar under the vendor folder\'s jsign/ when there is no jsign.jar (the places setup-mac.sh accepts)', () => {
    const v2 = path.join(T, 'vendor-dir');
    const jar = path.join(v2, 'jsign', 'jsign-7.5.jar');
    mkdirSync(path.dirname(jar), { recursive: true });
    writeFileSync(jar, 'a stand-in, java is a stand-in too\n');
    const v = fresh('vendor-dir-jar');
    const bin = path.join(T, 'bin-vendor-dir');
    writeShims(bin, SHIMS, ['jsign']);
    const r = run([...SIGN_ARGS, '--out', v.out], v, { JSIGN: '', BEETHOVEN_VENDOR_DIR: v2 }, `${bin}${path.delimiter}${farm(path.join(T, 'farm-vendor-dir'), ['jsign', ...Object.keys(SHIMS)])}`);
    expect(r.code, r.err).toBe(0);
    expect(calls(v.log, 'java').map((l) => l[1])).toEqual(['-version', '-jar', '-jar', '-jar']);
    expect(calls(v.log, 'java-jar').map((l) => l[1])).toEqual([jar, jar, jar]);
    expect(listed(v.out)).toEqual([MSI, `${MSI}.json`]);
  });

  it('takes the names the release\'s config accepts: the endpoint as a URL in upper case, a profile with "_"', () => {
    const n = fresh('names');
    const args = [...SIGN_ARGS];
    args[args.indexOf('--azure-endpoint') + 1] = `https://${ENDPOINT.toUpperCase()}/`;
    args[args.indexOf('--azure-profile') + 1] = 'stand_in_profile';
    const r = run([...args, '--out', n.out], n);
    expect(r.code, r.out + r.err).toBe(0);
    const signs = calls(n.log, 'jsign').filter((l) => l[1] !== '--version');
    expect(signs).toHaveLength(2);
    for (const l of signs) expect(l.slice(1, 7)).toEqual(['--storetype', 'TRUSTEDSIGNING', '--keystore', ENDPOINT, '--alias', `${ACCOUNT}/stand_in_profile`]);
  });

  it('accepts the Universal C Runtime a UCRT-default mingw-w64 links (api-ms-win-crt-*, ucrtbase.dll), and still refuses a mingw library beside it', () => {
    const u = fresh('ucrt');
    const r = run([...SIGN_ARGS, '--out', u.out], u, { SHIM_UCRT: '1' });
    expect(r.code, r.out + r.err).toBe(0);
    for (const d of ['api-ms-win-crt-runtime-l1-1-0.dll', 'api-ms-win-crt-heap-l1-1-0.dll', 'ucrtbase.dll']) expect(r.out).toContain(`imports ${d} (the Universal C Runtime, part of Windows 10 and 11)`);
    expect(listed(u.out)).toEqual([MSI, `${MSI}.json`]);
    const b = fresh('ucrt-bad');
    const rb = run([...SIGN_ARGS, '--out', b.out], b, { SHIM_UCRT: '1', SHIM_BAD_DLL: '1' });
    expect(rb.code, rb.out + rb.err).toBe(4);
    expect(rb.err).toContain('imports libwinpthread-1.dll');
    expect(listed(b.out)).toEqual([]);
  });

  const refusals: Array<{ label: string; env: Record<string, string>; code: number; says: string; jsigns: number }> = [
    { label: 'az cannot get a token', env: { SHIM_AZ_FAIL: '1' }, code: 5, says: 'az could not get a token', jsigns: 0 },
    { label: 'Artifact Signing refuses', env: { SHIM_JSIGN_FAIL: '1' }, code: 5, says: 'jsign did not sign beethoven-bridge.exe', jsigns: 1 },
    { label: 'the signature does not match the file', env: { SHIM_OSSL_MISMATCH: '1' }, code: 4, says: 'does not match the file', jsigns: 1 },
    { label: 'the signature has no timestamp', env: { SHIM_OSSL_NOTS: '1' }, code: 4, says: 'carries no timestamp', jsigns: 1 },
    { label: 'the exe imports a mingw runtime library', env: { SHIM_BAD_DLL: '1' }, code: 4, says: 'imports libwinpthread-1.dll', jsigns: 0 },
  ];
  for (const k of refusals) {
    it(`${k.label}: exit ${k.code}, and nothing reaches --out`, () => {
      const r0 = fresh(`refuse-${k.label.replace(/\W+/g, '-')}`);
      const r = run([...SIGN_ARGS, '--out', r0.out], r0, k.env);
      expect(r.code, r.out + r.err).toBe(k.code);
      expect(r.err).toContain(k.says);
      expect(calls(r0.log, 'jsign').filter((l) => l[1] !== '--version')).toHaveLength(k.jsigns);
      expect(listed(r0.out)).toEqual([]);
      expect(readdirSync(r0.tmp)).toEqual([]);
    });
  }

  it('wixl warning about an attribute it dropped: exit 4, the MSI is never signed, nothing reaches --out', () => {
    const real = spawnSync('bash', ['-c', 'command -v wixl'], { encoding: 'utf8' }).stdout.trim();
    const bin = path.join(T, 'bin-wixl-warns');
    writeShims(bin, { ...SHIMS, wixl: `"${real}" "$@"; s=$?\nprintf "(wixl:4242): GLib-GObject-CRITICAL **: g_object_set_is_valid_property: object class 'WixlWixPackage' has no property named 'Platform'\\n" >&2\nexit $s\n` });
    const w = fresh('wixl-warns');
    const r = run([...SIGN_ARGS, '--out', w.out], w, {}, `${bin}${path.delimiter}${process.env.PATH ?? ''}`);
    expect(r.code, r.out + r.err).toBe(4);
    expect(r.err).toContain('wixl warned while building the MSI');
    expect(calls(w.log, 'jsign').filter((l) => l[1] !== '--version').map((l) => path.basename(l[l.length - 1] ?? ''))).toEqual(['beethoven-bridge.exe']);
    expect(listed(w.out)).toEqual([]);
  });
});

// ---- the real cross-build ---------------------------------------------------------------------

describe.skipIf(!CROSS)('the real cross-build of the bridge (--no-sign), where the x86_64-pc-windows-gnu target and mingw-w64 are installed', () => {
  let c: Ctx;
  let res: { code: number | null; out: string; err: string };
  let work: string;

  beforeAll(() => {
    c = fresh('cross');
    res = run(['--store-id', ID, '--no-sign', '--out', c.out, '--keep-work'], c, {}, process.env.PATH ?? '');
    work = path.join(c.tmp, readdirSync(c.tmp)[0] ?? 'missing');
  });

  it('builds a Windows exe that imports only Windows\' own libraries, and packages exactly that file', () => {
    expect(res.code, res.out + res.err).toBe(0);
    const exe = path.join(work, 'stage', 'beethoven-bridge.exe');
    expect(readFileSync(exe).subarray(0, 2).toString('latin1')).toBe('MZ');
    const dump = spawnSync('x86_64-w64-mingw32-objdump', ['-p', exe], { encoding: 'utf8' }).stdout;
    const dlls = [...dump.matchAll(/DLL Name:\s*(\S+)/g)].map((m) => (m[1] ?? '').toLowerCase());
    const allowed = (/^ALLOWED_DLLS="([^"]+)"$/m.exec(readFileSync(SCRIPT, 'utf8'))?.[1] ?? '').split(' ');
    expect(dlls.length).toBeGreaterThan(0);
    // a UCRT-default mingw-w64 (likely Homebrew's) links the Universal C Runtime's sets in place of msvcrt.dll
    const ucrt = (d: string) => /^api-ms-win-crt-[a-z]+-l1-1-0\.dll$/.test(d) || d === 'ucrtbase.dll';
    for (const d of dlls) expect(allowed.includes(d) || ucrt(d), d).toBe(true);
    expect(dlls).not.toEqual(expect.arrayContaining([expect.stringMatching(/^lib/)]));
    for (const d of dlls) expect(res.out.toLowerCase()).toContain(`imports ${d}`);
    const row = table(path.join(c.out, 'trial', MSI), 'File').find((r) => r[2] === 'beethoven-bridge.exe');
    expect(Number(row?.[3])).toBe(statSync(exe).size);
    expect(listed(c.out)).toEqual([`trial/${MSI}`]);
  });

  it('refuses the exe when it imports a library Windows does not carry (objdump wrapped to report one)', () => {
    const real = spawnSync('bash', ['-c', 'command -v x86_64-w64-mingw32-objdump'], { encoding: 'utf8' }).stdout.trim();
    const bin = path.join(T, 'bin-objdump-extra');
    mkdirSync(bin);
    writeFileSync(path.join(bin, 'x86_64-w64-mingw32-objdump'), `#!/bin/bash\n"${real}" "$@"\nprintf '\\tDLL Name: libgcc_s_seh-1.dll\\n'\n`);
    chmodSync(path.join(bin, 'x86_64-w64-mingw32-objdump'), 0o755);
    const b = fresh('cross-bad');
    const r = run(['--store-id', ID, '--no-sign', '--out', b.out], b, {}, `${bin}${path.delimiter}${process.env.PATH ?? ''}`);
    expect(r.code, r.out + r.err).toBe(4);
    expect(r.err).toContain('imports libgcc_s_seh-1.dll');
    expect(listed(b.out)).toEqual([]);
  });
});

// ---- the files themselves -----------------------------------------------------------------------

describe('the files this stream adds', () => {
  const files = ['bridge.wxs', 'build-msi-mac.sh', 'README.md'].map((f) => path.join(WIN, f));
  const here = fileURLToPath(import.meta.url);

  it('are LF-only printable ASCII and use no word this project does not use', () => {
    const banned = new RegExp('prov' + 'enance', 'i');
    for (const f of [...files, here]) {
      const b = readFileSync(f);
      expect(b.includes(13), f).toBe(false);
      expect(b.some((x) => x > 126 || (x < 32 && x !== 10 && x !== 9)), f).toBe(false);
      expect(banned.test(b.toString('latin1')), f).toBe(false);
    }
  });

  it('README.md puts the Mac route first, keeps the Windows machine as the alternative, and says what is not yet measured', () => {
    const md = readFileSync(path.join(WIN, 'README.md'), 'utf8');
    const mac = md.indexOf('build-msi-mac.sh');
    const win = md.indexOf('build-msi.ps1 -StoreId');
    expect(mac).toBeGreaterThan(-1);
    expect(win).toBeGreaterThan(mac);
    expect(md).toContain('## Not yet measured');
    expect(md.replace(/\s+/g, ' ')).toContain('Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic\'s marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher.');
    expect(md).toMatch(/<region>\.codesigning\.azure\.net/);
  });
});
