// The Windows installer's release files (helper/release/windows), checked as text: Windows PowerShell,
// cargo for the MSVC target, signtool, the Artifact Signing client and WiX are not on this machine, and
// no Windows machine has built or installed the MSI yet (not yet measured; README.md there lists it). What a
// text check settles: Package.wxs is balanced XML with the per-user scope, the two HKCU keys Chrome and Edge
// read and nothing under HKLM; build-msi.ps1 names every parameter, reads signing.json rather than holding
// account names, signs through the Dlib with Microsoft's timestamp and never prints metadata.json; no key or
// password shape anywhere; signing.json absent and the example holding placeholders only; every file LF and
// ASCII; the student text free of internals. Where pwsh is on PATH on Linux, the script also runs with
// -SkipSign against stand-ins for cargo, rustup and wix, and must stage the manifest right and write no sidecar.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DIR = fileURLToPath(new URL('../../helper/release/windows/', import.meta.url));
const FILES = ['build-msi.ps1', 'Package.wxs', 'README.txt', 'signing.example.json', 'README.md'];
const read = (name: string) => readFileSync(path.join(DIR, name), 'utf8');
const HOST = 'com.openspineconsortium.beethoven.bridge';
const GUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;

/** Every open tag closes in order; comments and the declaration are skipped, and a tag ends at the first
 *  ">" outside quotes, so an attribute value may hold one. No dependency: the check must stay readable. */
function tagBalance(xml: string): { ok: boolean; why: string } {
  const s = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  const stack: string[] = [];
  let i = 0;
  for (;;) {
    const lt = s.indexOf('<', i);
    if (s.slice(i, lt < 0 ? s.length : lt).includes('>')) return { ok: false, why: `a stray > after ${i}` };
    if (lt < 0) break;
    let j = lt + 1;
    let quote = '';
    while (j < s.length && (quote !== '' || s[j] !== '>')) {
      const c = s[j];
      if (quote !== '') { if (c === quote) quote = ''; }
      else if (c === '"' || c === "'") quote = c;
      j++;
    }
    if (j >= s.length) return { ok: false, why: `the tag opened at ${lt} never ends` };
    const tag = s.slice(lt + 1, j).trim();
    i = j + 1;
    if (tag.startsWith('/')) {
      const open = stack.pop();
      if (open !== tag.slice(1).trim()) return { ok: false, why: `<${tag}> closes <${open ?? 'nothing'}>` };
    } else if (!tag.endsWith('/')) {
      stack.push(tag.split(/\s/)[0] ?? tag);
    }
  }
  if (stack.length) return { ok: false, why: `<${stack[stack.length - 1]}> never closes` };
  return { ok: true, why: '' };
}

describe('the tag-balance check is a real check', () => {
  it('passes nested and self-closing tags and fails a crossed or open one', () => {
    expect(tagBalance('<?xml version="1.0"?><!-- <x> --><a b="1>2"><c/><d>t</d></a>').ok).toBe(true);
    expect(tagBalance('<a><b></a>').ok).toBe(false);
    expect(tagBalance('<a><b/>').ok).toBe(false);
    expect(tagBalance('<a>x</a></b>').ok).toBe(false);
  });
});

describe('Package.wxs', () => {
  const wxs = read('Package.wxs');

  it('is balanced XML in the WiX v4 schema with the fixed Package attributes', () => {
    const r = tagBalance(wxs);
    expect(r.why).toBe('');
    expect(r.ok).toBe(true);
    expect(wxs).toContain('xmlns="http://wixtoolset.org/schemas/v4/wxs"');
    expect(wxs).toContain('Name="Beethoven bridge"');
    expect(wxs).toContain('Manufacturer="OpenSpineConsortium"');
    expect(wxs).toContain('Version="$(var.Version)"');
    expect(wxs).toContain('Scope="perUser"');
    expect(wxs).toContain('Language="1033"');
    expect(wxs).toContain('Compressed="yes"');
    expect(wxs).toContain('<SummaryInformation Description="Beethoven bridge" Manufacturer="OpenSpineConsortium"/>');
    expect(wxs).toContain('<MediaTemplate EmbedCab="yes"/>');
  });

  it('carries one fixed UpgradeCode, a MajorUpgrade with a downgrade message and no Modify in Settings', () => {
    const up = /UpgradeCode="([^"]+)"/.exec(wxs)?.[1] ?? '';
    expect(up).toMatch(GUID);
    expect(wxs).toMatch(/<MajorUpgrade DowngradeErrorMessage="A newer Beethoven bridge is already installed\."\/>/);
    expect(wxs).toContain('<Property Id="ARPNOMODIFY" Value="1"/>');
    expect(wxs).toContain('<Property Id="ARPURLINFOABOUT" Value="https://openspineconsortium.com/beethoven/"/>');
    expect(wxs).toContain('<Property Id="ARPHELPLINK" Value="https://openspineconsortium.com/beethoven/"/>');
    expect(wxs).toMatch(/<Property Id="ARPCOMMENTS" Value="[^"]+"\/>/);
  });

  it('installs under LocalAppDataFolder\\Beethoven\\bridge and removes both folders on uninstall', () => {
    expect(wxs).toContain('<StandardDirectory Id="LocalAppDataFolder">');
    expect(wxs).toContain('<Directory Id="BeethovenFolder" Name="Beethoven">');
    expect(wxs).toContain('<Directory Id="BridgeFolder" Name="bridge"/>');
    expect(wxs).toContain('<ComponentGroup Id="BridgeFiles" Directory="BridgeFolder">');
    expect(wxs).toMatch(/<RemoveFolder Id="RemoveBridgeFolder" Directory="BridgeFolder" On="uninstall"\/>/);
    expect(wxs).toMatch(/<RemoveFolder Id="RemoveBeethovenFolder" Directory="BeethovenFolder" On="uninstall"\/>/);
  });

  it('writes the two per-user keys Chrome and Edge read, pointing at the manifest in the bridge folder', () => {
    const value = `[BridgeFolder]${HOST}.json`;
    for (const browser of ['Google\\Chrome', 'Microsoft\\Edge']) {
      const key = `Software\\${browser}\\NativeMessagingHosts\\${HOST}`;
      const line = wxs.split('\n').find((l) => l.includes(`Key="${key}"`)) ?? '';
      expect(line, key).toContain('Root="HKCU"');
      expect(line, key).toContain(`Value="${value}"`);
      expect(line, key).toContain('Type="string"');
      expect(line, key).not.toMatch(/ Name="/);        // the key's default value, which is what the browsers read
    }
  });

  it('keeps the relative "beethoven-bridge.exe" out of the wxs: the staged manifest the script writes holds it', () => {
    const rest = wxs.replace(/\$\(var\.StageDir\)\\beethoven-bridge\.exe/g, '');
    expect(rest).not.toContain('beethoven-bridge.exe');
    expect(wxs).not.toContain('"path"');
    expect(wxs).toContain(`Source="$(var.StageDir)\\${HOST}.json"`);
    expect(wxs).toContain('Source="$(var.StageDir)\\README.txt"');
  });

  it('touches nothing under HKLM and runs no custom action', () => {
    expect(wxs).not.toMatch(/HKLM|HKMU|HKEY_LOCAL_MACHINE|LocalMachine/i);
    expect(wxs).not.toMatch(/<CustomAction|<InstallExecuteSequence|<Binary|<ServiceInstall|<Shortcut/);
    expect(wxs.match(/Root="HKCU"/g)?.length).toBe(6);
  });

  it('gives every component a fixed, distinct GUID and an HKCU KeyPath, with every File KeyPath="no" (ICE38)', () => {
    const components = wxs.split(/<Component /).slice(1).map((c) => c.split('</Component>')[0] ?? '');
    expect(components.length).toBe(5);
    const guids = components.map((c) => /Guid="([^"]+)"/.exec(c)?.[1] ?? '');
    for (const g of guids) expect(g).toMatch(GUID);
    expect(new Set(guids).size).toBe(guids.length);
    for (const c of components) {
      const keyPaths = c.match(/KeyPath="yes"/g) ?? [];
      expect(keyPaths.length).toBe(1);
      expect(c.split('\n').find((l) => l.includes('KeyPath="yes"'))).toContain('<RegistryValue Root="HKCU"');
      for (const f of c.match(/<File [^>]*>/g) ?? []) expect(f).toContain('KeyPath="no"');
    }
    expect(wxs).toContain('<Feature Id="Bridge" Title="Beethoven bridge" Level="1">');
    expect(wxs).toContain('<ComponentGroupRef Id="BridgeFiles"/>');
  });
});

describe('build-msi.ps1', () => {
  const ps1 = read('build-msi.ps1');
  const code = ps1.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const paramBlock = /\[CmdletBinding\(\)\]\s*param\(([\s\S]*?)\n\)/.exec(ps1)?.[1] ?? '';

  it('is Windows PowerShell 5.1 shaped: CmdletBinding, strict mode, Stop, and no ??, ternary or &&', () => {
    expect(ps1).toContain('[CmdletBinding()]');
    expect(ps1).toContain('Set-StrictMode -Version 2');
    expect(ps1).toContain("$ErrorActionPreference = 'Stop'");
    expect(code).not.toContain('??');
    expect(code).not.toContain('&&');
    expect(code).not.toMatch(/\?\s*[^\s:]+\s*:\s*[^\s]+\s*$/m);
  });

  it('names every parameter, requires StoreId and checks it against the identifier pattern', () => {
    for (const p of ['StoreId', 'SigningConfig', 'SignTool', 'Dlib', 'Wix', 'OutDir', 'Target', 'SkipSign']) {
      expect(paramBlock, p).toMatch(new RegExp(`\\[(string|switch)\\]\\$${p}\\b`));
    }
    expect(paramBlock).toMatch(/\[Parameter\(Mandatory = \$true\)\]\s*\[string\]\$StoreId/);
    expect(paramBlock).toContain("[string]$Target = 'x86_64-pc-windows-msvc'");
    expect(paramBlock).toContain("[string]$Wix = 'wix'");
    expect(paramBlock).toContain("Join-Path $PSScriptRoot 'signing.json'");
    expect(ps1).toContain("'^[a-p]{32}$'");
    expect(ps1).toContain('Windows Kits\\10\\bin\\*\\x64\\signtool.exe');
    expect(ps1).toContain('microsoft.trusted.signing.client\\*\\bin\\x64\\Azure.CodeSigning.Dlib.dll');
    expect(ps1).toContain('not checked from here');
  });

  it('reads the account names from signing.json and holds none itself', () => {
    expect(ps1).toContain('signing.json');
    expect(ps1).toContain('signing.example.json');
    expect(ps1).toContain('ConvertFrom-Json');
    for (const k of ['Endpoint', 'CodeSigningAccountName', 'CertificateProfileName']) {
      expect(ps1).toContain(`'${k}'`);
      expect(ps1, k).not.toMatch(new RegExp(`${k}\\s*[=:]\\s*['"][^$'"]`));
    }
    expect(ps1).not.toMatch(/codesigning\.azure\.net|\.onmicrosoft\.com|@\w+\.(com|edu|org)/i);
  });

  it('signs the exe and then the MSI through the Dlib with the Microsoft timestamp, and verifies both', () => {
    expect(ps1).toContain("'http://timestamp.acs.microsoft.com'");
    const signs = ps1.split('\n').filter((l) => /'sign',/.test(l));
    expect(signs.length).toBe(2);
    for (const l of signs) {
      expect(l).toContain("'/fd', 'SHA256'");
      expect(l).toContain("'/tr', $TimestampUrl, '/td', 'SHA256'");
      expect(l).toContain("'/dlib', $Dlib, '/dmdf', $MetadataPath");
    }
    expect(signs[0]).toContain('$StagedExe');
    expect(signs[1]).toContain('$Msi');
    expect(ps1.split('\n').filter((l) => /'verify', '\/pa', '\/v'/.test(l)).length).toBe(2);
    expect(ps1).toMatch(/'build', '-arch', 'x64', '-d', "StageDir=\$Stage", '-d', "Version=\$Version", \$Wxs, '-o', \$Msi/);
    expect(ps1).toContain("'--release', '--target', $Target, '--target-dir', $TargetDir");
  });

  it('writes metadata.json for the Dlib into its work folder and never prints it', () => {
    expect(ps1).toContain("Join-Path $Work 'metadata.json'");
    expect(ps1).toContain('CorrelationId = [Guid]::NewGuid().ToString()');
    const touching = code.split('\n').filter((l) => /MetadataPath|\$meta\b/.test(l));
    expect(touching.length).toBeGreaterThan(2);
    for (const l of touching) expect(l).not.toMatch(/Step |Write-|Get-Content|Out-File|Out-String|Format-|\[Console\]/);
    expect(ps1).toMatch(/Remove-Item -LiteralPath \$Work -Recurse -Force/);
    expect(ps1).toContain('$Work.StartsWith($TempRoot)');
  });

  it('writes the sidecar as the contract says, and none with -SkipSign', () => {
    for (const k of ['name = $MsiName', "os = 'windows'", "kind = 'binary'", 'helper = $Version', 'protocol = [int]1', 'size = [long]', 'sha256 =', 'allowed_origins = @($Origin)', "signed = 'authenticode'", 'built_at =', 'tools =']) {
      expect(ps1).toContain(k);
    }
    expect(ps1).toContain('.Hash.ToLowerInvariant()');
    expect(ps1).toContain('ConvertTo-Json -InputObject $sidecar -Depth 4');
    expect(ps1).toContain('[System.Environment]::OSVersion.VersionString');
    expect(ps1).toContain('New-Object System.Text.UTF8Encoding($false)');
    expect(ps1).toContain('never ship');
    // the staged manifest: the relative path Chrome allows on Windows, stdio, the one origin
    expect(ps1).toContain('`"path`": `"$ExeName`"');
    expect(ps1).toContain('`"type`": `"stdio`"');
    expect(ps1).toContain('`"allowed_origins`": [`"$Origin`"]');
  });
});

describe('signing configuration', () => {
  it('signing.json is not in the tree and the example holds placeholders only', () => {
    expect(existsSync(path.join(DIR, 'signing.json'))).toBe(false);
    const ex = JSON.parse(read('signing.example.json')) as Record<string, unknown>;
    expect(Object.keys(ex).sort()).toEqual(['CertificateProfileName', 'CodeSigningAccountName', 'Endpoint', '_comment']);
    for (const k of ['Endpoint', 'CodeSigningAccountName', 'CertificateProfileName']) {
      expect(ex[k], k).toMatch(/<[a-z]+>/);
    }
    expect(ex.Endpoint).toBe('https://<region>.codesigning.azure.net');
    expect(String(ex._comment)).toContain('signing.json');
    expect(String(ex._comment)).toMatch(/gitignored/);
  });
});

describe('every release file', () => {
  const here = fileURLToPath(import.meta.url);
  const all = [...FILES.map((f) => path.join(DIR, f)), here];

  it('is LF and printable ASCII', () => {
    for (const p of all) {
      const b = readFileSync(p);
      expect(b.includes(13), `${path.basename(p)} has a carriage return`).toBe(false);
      const bad = [...b].findIndex((c) => c > 126 || (c < 32 && c !== 10 && c !== 9));
      expect(bad, `${path.basename(p)} has a byte outside printable ASCII at ${bad}`).toBe(-1);
    }
  });

  // the release files only: this test names the shapes it looks for
  it('holds no key, token or password shape and not the banned word', () => {
    const banned = new RegExp(['prov', 'enance'].join(''), 'i');
    for (const p of FILES.map((f) => path.join(DIR, f))) {
      const t = readFileSync(p, 'utf8');
      const label = path.basename(p);
      expect(t, label).not.toContain('-----BEGIN');
      expect(t, label).not.toMatch(/\bsk-/i);
      expect(t, label).not.toMatch(/password\s*=/i);
      expect(t, label).not.toMatch(/\b(eyJ[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,})\b/);
      expect(t, label).not.toMatch(banned);
    }
  });

  it('keeps fractional versions out and says what is not yet measured', () => {
    expect(read('README.md')).not.toMatch(/\b\d+\.[1-9]\d*\.\d+\b/);
    expect(read('README.md')).toContain('not yet measured');
    expect(read('README.md')).toContain('Windows protected your PC');
    expect(read('README.md')).toContain('Windows on ARM is not built');
  });
});

describe('README.txt, the student text installed beside the exe', () => {
  const txt = read('README.txt');

  it('says what it is, what it never does and how to remove it, in plain words', () => {
    expect(txt).toContain('Beethoven bridge');
    expect(txt).toMatch(/encrypted connection to the grid and nothing else/);
    expect(txt).toMatch(/holds no password or key/);
    expect(txt).toMatch(/keeps no record/);
    expect(txt).toMatch(/Settings, choose Apps, find "Beethoven bridge" in the list and choose Uninstall/);
    expect(txt).toContain('Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are');
    expect(txt).toContain('"Open OnDemand" is the mark of its publisher.');
  });

  it('shows no internals', () => {
    expect(txt).not.toMatch(/native messaging|\bssh\b|registry|manifest|HKCU|HKEY|LOCALAPPDATA|json|stdio|\.exe|MSI\b|WiX|signtool|Authenticode/i);
  });
});

// ---- the live run, where pwsh exists ------------------------------------------------------------
// Linux only: the stand-ins are node scripts started through their shebang, which Windows would not run,
// and on Windows the real tools are the test. The cargo stand-in writes the exe where cargo would, the
// rustup stand-in lists the target, and the wix stand-in writes into the -o file what it was given: its
// arguments, the staged file names and the staged manifest, so the test can read what the MSI would carry.

const PWSH = process.platform !== 'win32' && spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' }).status === 0;

const SHIMS: Record<string, string> = {
  cargo: `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
const a = process.argv.slice(2);
const td = a[a.indexOf('--target-dir') + 1]; const target = a[a.indexOf('--target') + 1];
if (a[0] !== 'build' || !td || !target) { console.error('cargo stand-in: unexpected arguments ' + a.join(' ')); process.exit(2); }
const dir = path.join(td, target, 'release'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'beethoven-bridge.exe'), 'MZ stand-in, not a program\\n');
console.error('   Compiling beethoven-bridge (stand-in)');
`,
  rustup: `#!/usr/bin/env node
const a = process.argv.slice(2).join(' ');
if (a === 'target list --installed') { console.log('x86_64-pc-windows-msvc'); process.exit(0); }
console.error('rustup stand-in: unexpected arguments ' + a); process.exit(2);
`,
  wix: `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('5.0.0 (stand-in)'); process.exit(0); }
if (a[0] !== 'build') { console.error('wix stand-in: unexpected arguments ' + a.join(' ')); process.exit(2); }
const out = a[a.indexOf('-o') + 1];
const stageDef = a.find((x) => x.startsWith('StageDir='));
if (!out || !stageDef) { console.error('wix stand-in: no -o or StageDir'); process.exit(2); }
const stage = stageDef.slice('StageDir='.length);
const names = fs.readdirSync(stage).sort();
const raw = fs.readFileSync(path.join(stage, 'com.openspineconsortium.beethoven.bridge.json'));
fs.writeFileSync(out, JSON.stringify({ args: a, stage: names, bom: raw[0] === 0xef, cr: raw.includes(13), manifest: JSON.parse(raw.toString('utf8')) }));
`,
};

function runScript(extra: string[], shimDir: string): { status: number | null; out: string; err: string } {
  const r = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', path.join(DIR, 'build-msi.ps1'), ...extra], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ''}` },
    timeout: 50_000,
  });
  return { status: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}

describe.skipIf(!PWSH)('build-msi.ps1 -SkipSign against stand-ins (pwsh on PATH)', () => {
  const ID = 'abcdefghijklmnopabcdefghijklmnop';

  it('stages the manifest with the relative path and the one origin, builds, and writes no sidecar', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'bee-msi-'));
    try {
      const shimDir = path.join(tmp, 'bin');
      mkdirSync(shimDir);
      for (const [name, body] of Object.entries(SHIMS)) {
        writeFileSync(path.join(shimDir, name), body);
        chmodSync(path.join(shimDir, name), 0o755);
      }
      const outDir = path.join(tmp, 'out');
      const r = runScript(['-StoreId', ID, '-SkipSign', '-OutDir', outDir], shimDir);
      expect(r.status, r.out + r.err).toBe(0);
      expect(r.out).toContain('never ship');
      expect(r.out).not.toMatch(/Signing beethoven-bridge\.exe|Writing the sidecar/);
      expect(readdirSync(outDir).sort()).toEqual(['beethoven-bridge-windows.msi']);
      const got = JSON.parse(readFileSync(path.join(outDir, 'beethoven-bridge-windows.msi'), 'utf8')) as {
        args: string[]; stage: string[]; bom: boolean; cr: boolean;
        manifest: { name: string; description: string; path: string; type: string; allowed_origins: string[] };
      };
      expect(got.stage).toEqual(['README.txt', 'beethoven-bridge.exe', `${HOST}.json`]);
      expect(got.bom).toBe(false);
      expect(got.cr).toBe(false);
      expect(got.manifest.name).toBe(HOST);
      expect(got.manifest.path).toBe('beethoven-bridge.exe');
      expect(got.manifest.type).toBe('stdio');
      expect(got.manifest.allowed_origins).toEqual([`chrome-extension://${ID}/`]);
      expect(got.args.slice(0, 3)).toEqual(['build', '-arch', 'x64']);
      expect(got.args).toContain('Version=1.0.0');
      expect(got.args[got.args.length - 2]).toBe('-o');
      // the work folder under the temp directory is gone again
      expect(readdirSync(tmpdir()).filter((n) => n.startsWith('beethoven-bridge-msi-'))).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('refuses a wrong StoreId in one sentence, and without signing.json names signing.example.json', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'bee-msi-'));
    try {
      const shimDir = path.join(tmp, 'bin');
      mkdirSync(shimDir);
      for (const [name, body] of Object.entries(SHIMS)) {
        writeFileSync(path.join(shimDir, name), body);
        chmodSync(path.join(shimDir, name), 0o755);
      }
      const bad = runScript(['-StoreId', 'not-an-id', '-SkipSign', '-OutDir', path.join(tmp, 'o1')], shimDir);
      expect(bad.status).not.toBe(0);
      expect(bad.err).toContain('32 letters a to p');
      expect(existsSync(path.join(tmp, 'o1'))).toBe(false);
      // any two existing files stand in for signtool and the Dlib, so the check reaches signing.json
      const here = fileURLToPath(import.meta.url);
      const unsigned = runScript(['-StoreId', ID, '-SignTool', here, '-Dlib', here, '-SigningConfig', path.join(tmp, 'none.json'), '-OutDir', path.join(tmp, 'o2')], shimDir);
      expect(unsigned.status).not.toBe(0);
      expect(unsigned.err).toContain('signing.example.json');
      expect(existsSync(path.join(tmp, 'o2'))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
