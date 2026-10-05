// Builds the Beethoven bridge packages the extension ships, and their manifest:
//
//   extension/public/bridge/beethoven-bridge-windows.zip   bridge.cmd + bridge.ps1, install.cmd, uninstall.cmd
//   extension/public/bridge/beethoven-bridge-mac.zip       bridge.pl, install.command, uninstall.command
//   extension/public/bridge/beethoven-bridge-linux.zip     bridge.pl + bridge.py, install.sh, uninstall.sh
//   extension/public/bridge/beethoven-bridge-mac.pkg       the signed macOS installer, when helper/signed/ holds one
//   extension/public/bridge/beethoven-bridge-windows.msi   the signed Windows installer, when helper/signed/ holds one
//   extension/public/bridge/manifest.json                  name, host_name, helper, protocol, allowed_origins,
//                                                          origins_filled, files[]: os, kind, name, size, sha256,
//                                                          and per kind: script -> open; binary -> allowed_origins, signed
//
//   node helper/build.mjs [--store-id ID] [--dev --unpacked-id ID...] [--out DIR] [--signed DIR | --no-signed] [--check]
//
// The zips carry a placeholder in allowed_origins.json, which every installer refuses. The
// extension does not ship them that way to a student: the page that offers the download writes the
// extension's own identifier (chrome.runtime.id) into a copy of the zip in memory and saves that copy
// (extension/src/core/bridgeZip.ts, src/ui/helperFile.ts), so the zip names exactly the Beethoven it
// was saved from and no release step has to know the store's identifier in advance. The flags remain
// for building a zip by hand: --store-id names a published extension; --unpacked-id (a development
// build's identifier) is refused unless --dev is given too, so a release package can never let a
// development extension start a student's bridge. helper/extension-ids.json is read the same way.
// --check builds in memory and fails if the files on disk differ. The zips are reproducible: fixed
// timestamps, sorted entries, Unix modes (0755 on what must run, so macOS keeps install.command
// executable), CRLF only for the Windows text files.
//
// The signed installers are not built here. helper/release/ builds them on the maintainer's own Mac
// (the .msi too, cross-built and signed through Azure Artifact Signing, not yet measured; a Windows
// machine is the fallback; no identity, certificate, token or key ever enters the repository or CI) and
// leaves each in helper/signed/ (gitignored) beside a sidecar <name>.json: name, os, kind, helper,
// protocol, size, sha256, allowed_origins, signed. This build takes a package only on its sidecar's
// word checked against the facts: helper equals helper/VERSION, protocol is 1, size and sha256 are
// the file's own, every origin is a Chrome extension origin (and the --store-id one when given) and
// "signed" is one of the two ways a package is signed. It copies the file into OUT unchanged and lists
// it after the script zips, with no "open" because the file itself is the installer. Only a release
// build (--store-id) or --signed DIR reads a folder of signed installers: after a release
// helper/signed/ still holds them, and a plain build that took them would write the store's identifier
// into the tracked manifest.json. Without either, or with --no-signed, the output is byte for byte the
// three zips and their manifest. An installer under one of the two names the release scripts give
// theirs, left in OUT by an earlier release build, is removed, since an installer the manifest does
// not list must never ship by accident; no other file is, and never one with a sidecar beside it,
// which marks a folder of signed installers rather than an output. --check reports every .pkg and
// .msi in OUT that this build would not write as a difference.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'src');
const HOST_NAME = 'com.openspineconsortium.beethoven.bridge';
const PLACEHOLDER = 'chrome-extension://REPLACE_WITH_EXTENSION_ID_SEE_HELPER_README/';

const args = process.argv.slice(2);
const many = (k) => args.flatMap((a, i) => (a === k && args[i + 1] ? [args[i + 1]] : []));
const one = (k) => many(k)[0];
const OUT = path.resolve(one('--out') || path.join(HERE, '..', 'extension', 'public', 'bridge'));
const CHECK = args.includes('--check');
const DEV = args.includes('--dev');
const NO_SIGNED = args.includes('--no-signed');
const signedArg = one('--signed');
if (NO_SIGNED && signedArg) fail('--signed and --no-signed contradict each other');
const DEFAULT_SIGNED = path.join(HERE, 'signed');
const MERGE = !NO_SIGNED && (Boolean(signedArg) || many('--store-id').length > 0);
const SIGNED = MERGE ? path.resolve(signedArg || DEFAULT_SIGNED) : undefined;
if (signedArg && !(fs.existsSync(SIGNED) && fs.statSync(SIGNED).isDirectory())) fail(`--signed ${SIGNED} is not a folder`);

const VERSION = fs.readFileSync(path.join(HERE, 'VERSION'), 'utf8').trim();
if (!/^\d+\.0\.0$/.test(VERSION)) fail(`helper/VERSION must be a whole-number version like 1.0.0, not ${VERSION}`);

function fail(msg) { console.error(`build: ${msg}`); process.exit(1); }

// ---- extension identifiers -----------------------------------------------------------------

let storeIds = many('--store-id');
let unpackedIds = many('--unpacked-id');
const idsFile = path.join(HERE, 'extension-ids.json');
if (!storeIds.length && !unpackedIds.length && fs.existsSync(idsFile)) {
  const j = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
  storeIds = j.store ? [j.store] : [];
  unpackedIds = Array.isArray(j.unpacked) ? j.unpacked : [];
}
if (unpackedIds.length && !DEV) fail('an unpacked (development) extension identifier was given: pass --dev as well, and never ship that build');
const ids = [...storeIds, ...unpackedIds];
for (const id of ids) if (!/^[a-p]{32}$/.test(id)) fail(`not a Chrome extension identifier: ${id}`);
const filled = ids.length > 0;
const origins = filled ? [...new Set(ids)].map((id) => `chrome-extension://${id}/`) : [PLACEHOLDER];
const originsJson = JSON.stringify(origins) + '\n';

// ---- source checks -------------------------------------------------------------------------

const VERSION_MARKS = [
  ['windows/bridge.ps1', `$BridgeVersion = '${VERSION}'`],
  ['windows/install.ps1', `$BridgeVersion = '${VERSION}'`],
  ['common/bridge.pl', `our $VERSION = '${VERSION}';`],
  ['common/bridge.py', `VERSION = "${VERSION}"`],
  ['mac/install.command', `VERSION=${VERSION}`],
  ['linux/install.sh', `VERSION=${VERSION}`],
];
for (const [f, mark] of VERSION_MARKS) {
  if (!fs.readFileSync(path.join(SRC, f), 'utf8').includes(mark)) fail(`${f} does not carry ${mark} (helper/VERSION is ${VERSION})`);
}
// The script sources go into the zips as they are (latin1 in, CRLF added for Windows), which is why
// they stay LF-only printable ASCII. The Rust crate is cargo's to read; it answers for the banned
// word like everything else under src/.
const SCRIPT_DIRS = ['common', 'linux', 'mac', 'windows'];
const banned = new RegExp('prov' + 'enance', 'i');
function* sources(dir) {
  for (const f of fs.readdirSync(dir)) {
    if (f === 'target' || f === '__pycache__') continue;   // cargo's build output; a local py_compile
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) yield* sources(p);
    else yield p;
  }
}
for (const p of sources(SRC)) {
  const rel = path.relative(HERE, p).split(path.sep).join('/');
  const b = fs.readFileSync(p);
  if (banned.test(b.toString('latin1'))) fail(`${rel} uses a word this project does not use`);
  if (!SCRIPT_DIRS.includes(path.relative(SRC, p).split(path.sep)[0])) continue;
  if (b.includes(13)) fail(`${rel} has a carriage return; sources are LF (the build adds CRLF where Windows needs it)`);
  if (b.some((c) => c > 126 || (c < 32 && c !== 10 && c !== 9))) fail(`${rel} has a byte outside printable ASCII`);
}

// ---- packages ------------------------------------------------------------------------------

const PACKAGES = [
  {
    os: 'windows', name: 'beethoven-bridge-windows.zip', open: 'install.cmd',
    files: [
      ['README.txt', 'windows/README.txt'], ['allowed_origins.json', null],
      ['bridge.cmd', 'windows/bridge.cmd'], ['bridge.ps1', 'windows/bridge.ps1'],
      ['install.cmd', 'windows/install.cmd'], ['install.ps1', 'windows/install.ps1'],
      ['uninstall.cmd', 'windows/uninstall.cmd'], ['uninstall.ps1', 'windows/uninstall.ps1'],
    ],
    crlf: (n) => /\.(cmd|ps1|txt)$/.test(n),
    exec: () => false,
  },
  {
    os: 'mac', name: 'beethoven-bridge-mac.zip', open: 'install.command',
    files: [
      ['README.txt', 'mac/README.txt'], ['allowed_origins.json', null],
      ['bridge.pl', 'common/bridge.pl'],
      ['install.command', 'mac/install.command'], ['uninstall.command', 'mac/uninstall.command'],
    ],
    crlf: () => false,
    exec: (n) => /\.(pl|command)$/.test(n),
  },
  {
    os: 'linux', name: 'beethoven-bridge-linux.zip', open: 'install.sh',
    files: [
      ['README.txt', 'linux/README.txt'], ['allowed_origins.json', null],
      ['bridge.pl', 'common/bridge.pl'], ['bridge.py', 'common/bridge.py'],
      ['install.sh', 'linux/install.sh'], ['uninstall.sh', 'linux/uninstall.sh'],
    ],
    crlf: () => false,
    exec: (n) => /\.(pl|py|sh)$/.test(n),
  },
];

// 2026-10-02 00:00:00, in the DOS date and time fields every zip entry carries.
const DOS_DATE = ((2026 - 1980) << 9) | (10 << 5) | 2;
const DOS_TIME = 0;

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, mode } of entries) {
    const nameBuf = Buffer.from(name, 'ascii');
    const crc = zlib.crc32(data) >>> 0;
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const method = stored ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);          // made by Unix, so the mode below is read
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(((0o100000 | mode) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const outputs = new Map();
const listing = [];
for (const pkg of PACKAGES) {
  const entries = pkg.files
    .map(([name, src]) => {
      let data = src ? fs.readFileSync(path.join(SRC, src)) : Buffer.from(originsJson, 'ascii');
      if (pkg.crlf(name)) data = Buffer.from(data.toString('latin1').replace(/\n/g, '\r\n'), 'latin1');
      return { name, data, mode: pkg.exec(name) ? 0o755 : 0o644 };
    })
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  const z = zip(entries);
  outputs.set(pkg.name, z);
  listing.push({
    os: pkg.os,
    kind: 'script',
    name: pkg.name,
    open: pkg.open,
    size: z.length,
    sha256: crypto.createHash('sha256').update(z).digest('hex'),
  });
}

// ---- the signed installers (helper/release/, built on the maintainer's machines) --------------

// Every rule below fails closed and names the sidecar: a package a student opens must be the one the
// release scripts signed for exactly this helper, and the manifest must say nothing the file does not.
const SIGNED_EXT = { mac: '.pkg', windows: '.msi' };
const SIGNED_BY_OS = { mac: 'developer-id-notarized', windows: 'authenticode' };
const SIGNED_WAYS = Object.values(SIGNED_BY_OS);
const NAME_RE = /^[A-Za-z0-9._-]+$/;
const ORIGIN_RE = /^chrome-extension:\/\/[a-p]{32}\/$/;
const storeOrigins = storeIds.map((id) => `chrome-extension://${id}/`);

const signed = [];
if (SIGNED && fs.existsSync(SIGNED) && fs.statSync(SIGNED).isDirectory()) {
  const names = fs.readdirSync(SIGNED).sort();
  // a package with no sidecar cannot be verified, and passing over it in silence would be the wrong-but-plausible state
  for (const n of names) {
    if (/\.(pkg|msi)$/.test(n) && !names.includes(`${n}.json`)) fail(`${n} in ${SIGNED} has no sidecar ${n}.json beside it, so it cannot be verified and is not shipped`);
  }
  for (const sc of names.filter((n) => n.endsWith('.json'))) {
    const bad = (why) => fail(`sidecar ${sc}: ${why}`);
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(SIGNED, sc), 'utf8')); } catch (e) { bad(`not JSON (${e.message})`); }
    if (!j || typeof j !== 'object' || Array.isArray(j)) bad('not a JSON object');
    const { name, os } = j;
    if (typeof name !== 'string' || !NAME_RE.test(name)) bad(`"name" is letters, digits, ".", "_" and "-" only, not ${JSON.stringify(name)}`);
    if (typeof os !== 'string' || !Object.hasOwn(SIGNED_EXT, os)) bad(`"os" is mac or windows, not ${JSON.stringify(os)}`);
    if (!name.endsWith(SIGNED_EXT[os])) bad(`a ${os} package ends in ${SIGNED_EXT[os]}, not ${name}`);
    if (sc !== `${name}.json`) bad(`a sidecar is named after its package, ${name}.json`);
    if (j.kind !== 'binary') bad(`"kind" is binary, not ${JSON.stringify(j.kind)}`);
    if (j.helper !== VERSION) bad(`helper ${JSON.stringify(j.helper)} is not helper/VERSION ${VERSION}; rebuild the package from these sources`);
    if (j.protocol !== 1) bad(`protocol ${JSON.stringify(j.protocol)} is not 1`);
    const file = path.join(SIGNED, name);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) bad(`its package ${name} is not beside it in ${SIGNED}`);
    const data = fs.readFileSync(file);
    if (j.size !== data.length) bad(`size ${JSON.stringify(j.size)} is not the file's ${data.length} bytes`);
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    if (j.sha256 !== sha256) bad(`sha256 ${JSON.stringify(j.sha256)} is not the file's ${sha256}`);
    const origins = j.allowed_origins;
    if (!Array.isArray(origins) || !origins.length) bad('"allowed_origins" names at least one extension');
    for (const o of origins) {
      if (typeof o !== 'string' || !ORIGIN_RE.test(o)) bad(`${JSON.stringify(o)} is not a Chrome extension origin (chrome-extension://<32 letters a to p>/)`);
      if (storeOrigins.length && !storeOrigins.includes(o)) bad(`${o} is not the --store-id extension, so this package would never be offered`);
    }
    if (!SIGNED_WAYS.includes(j.signed)) bad(`"signed" is ${SIGNED_WAYS.join(' or ')}, not ${JSON.stringify(j.signed)}`);
    if (j.signed !== SIGNED_BY_OS[os]) bad(`a ${os} package is signed ${SIGNED_BY_OS[os]}, not ${j.signed}`);
    if (signed.some((s) => s.os === os)) bad(`a second package for ${os}; the manifest lists one per system`);
    signed.push({ os, name, data, sha256, origins: origins.slice(), signed: j.signed });
  }
  signed.sort((a, b) => (a.os < b.os ? -1 : 1));
}
for (const s of signed) {
  outputs.set(s.name, s.data);
  listing.push({ os: s.os, kind: 'binary', name: s.name, size: s.data.length, sha256: s.sha256, allowed_origins: s.origins, signed: s.signed });
}

const manifest = {
  name: 'Beethoven bridge',
  host_name: HOST_NAME,
  helper: VERSION,
  protocol: 1,
  allowed_origins: filled ? origins : [],
  origins_filled: filled,
  files: listing,
};
outputs.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8'));

/** a .pkg or .msi in OUT that this build does not write: unlisted, and so never to ship */
const stale = () => (fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((n) => /\.(pkg|msi)$/.test(n) && !outputs.has(n)) : []);
// --out may name any folder, so only an earlier release build's copy is removed: one of the release
// scripts' two names, with no sidecar beside it (one there marks a folder of signed installers)
const RELEASE_NAMES = ['beethoven-bridge-mac.pkg', 'beethoven-bridge-windows.msi'];
const removable = (n) => RELEASE_NAMES.includes(n) && !fs.existsSync(path.join(OUT, `${n}.json`));
const notes = signed.map((s) => `NOTE: signed installer ${s.name} (${s.os}, sha256 ${s.sha256.slice(0, 12)}..., ${s.origins.length} origin${s.origins.length === 1 ? '' : 's'}) is in this build; the page offers it only to the extension its origins name.`);
if (!MERGE && !NO_SIGNED && fs.existsSync(DEFAULT_SIGNED) && fs.readdirSync(DEFAULT_SIGNED).some((n) => /\.(pkg|msi)$/.test(n))) {
  notes.push('NOTE: helper/signed/ holds signed installers, which this build leaves out; a release build (--store-id <id>) merges them.');
}

if (CHECK) {
  let same = true;
  for (const [name, data] of outputs) {
    const p = path.join(OUT, name);
    if (!fs.existsSync(p) || !fs.readFileSync(p).equals(data)) { console.error(`build --check: ${name} differs from a fresh build`); same = false; }
  }
  for (const n of stale()) { console.error(`build --check: ${n} is in ${OUT} but this build would not write it`); same = false; }
  if (!same) process.exit(1);
  for (const n of notes) console.log(n);
  console.log(`build --check: ${outputs.size} files in ${OUT} match a fresh build of bridge ${VERSION}`);
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
for (const n of stale()) {
  if (removable(n)) { fs.rmSync(path.join(OUT, n)); console.log(`removed ${n}: not in this build`); }
  else console.log(`NOTE: ${n} in ${OUT} is not this build's; it is left in place, and the manifest does not list it.`);
}
for (const [name, data] of outputs) fs.writeFileSync(path.join(OUT, name), data);
for (const f of listing) console.log(`${f.name}  ${f.size} bytes  sha256 ${f.sha256}`);
console.log(`manifest.json  bridge ${VERSION}, protocol 1, ${OUT}`);
if (!filled) {
  console.log('NOTE: no extension identifier was given, so these packages carry the placeholder: an installer run from the');
  console.log('      packaged file refuses. The extension writes its own identifier into the copy a student saves.');
}
if (DEV) console.log('NOTE: --dev: these packages name a development extension. Do not ship them.');
for (const n of notes) console.log(n);
