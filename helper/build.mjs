// Builds the three Beethoven bridge packages the extension ships, and their manifest:
//
//   extension/public/bridge/beethoven-bridge-windows.zip   bridge.cmd + bridge.ps1, install.cmd, uninstall.cmd
//   extension/public/bridge/beethoven-bridge-mac.zip       bridge.pl, install.command, uninstall.command
//   extension/public/bridge/beethoven-bridge-linux.zip     bridge.pl + bridge.py, install.sh, uninstall.sh
//   extension/public/bridge/manifest.json                  names, sizes, SHA-256, helper version, origins
//
//   node helper/build.mjs [--store-id ID] [--dev --unpacked-id ID...] [--out DIR] [--check]
//
// The packages carry a placeholder in allowed_origins.json, which every installer refuses. The
// extension does not ship them that way to a student: the page that offers the download writes the
// extension's own identifier (chrome.runtime.id) into a copy of the zip in memory and saves that copy
// (extension/src/core/bridgeZip.ts, src/ui/helperFile.ts), so the zip names exactly the Beethoven it
// was saved from and no release step has to know the store's identifier in advance. The flags remain
// for building a zip by hand: --store-id names a published extension; --unpacked-id (a development
// build's identifier) is refused unless --dev is given too, so a release package can never let a
// development extension start a student's bridge. helper/extension-ids.json is read the same way. --check builds in memory and fails if the files on disk
// differ. The zips are reproducible: fixed timestamps, sorted entries, Unix modes (0755 on what
// must run, so macOS keeps install.command executable), CRLF only for the Windows text files.
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
const banned = new RegExp('prov' + 'enance', 'i');
for (const dir of fs.readdirSync(SRC)) {
  for (const f of fs.readdirSync(path.join(SRC, dir))) {
    if (!fs.statSync(path.join(SRC, dir, f)).isFile()) continue;   // __pycache__ from a local py_compile, say
    const b = fs.readFileSync(path.join(SRC, dir, f));
    if (b.includes(13)) fail(`src/${dir}/${f} has a carriage return; sources are LF (the build adds CRLF where Windows needs it)`);
    if (b.some((c) => c > 126 || (c < 32 && c !== 10 && c !== 9))) fail(`src/${dir}/${f} has a byte outside printable ASCII`);
    if (banned.test(b.toString('latin1'))) fail(`src/${dir}/${f} uses a word this project does not use`);
  }
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

if (CHECK) {
  let same = true;
  for (const [name, data] of outputs) {
    const p = path.join(OUT, name);
    if (!fs.existsSync(p) || !fs.readFileSync(p).equals(data)) { console.error(`build --check: ${name} differs from a fresh build`); same = false; }
  }
  if (!same) process.exit(1);
  console.log(`build --check: ${outputs.size} files in ${OUT} match a fresh build of bridge ${VERSION}`);
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, data] of outputs) fs.writeFileSync(path.join(OUT, name), data);
for (const f of listing) console.log(`${f.name}  ${f.size} bytes  sha256 ${f.sha256}`);
console.log(`manifest.json  bridge ${VERSION}, protocol 1, ${OUT}`);
if (!filled) {
  console.log('NOTE: no extension identifier was given, so these packages carry the placeholder: an installer run from the');
  console.log('      packaged file refuses. The extension writes its own identifier into the copy a student saves.');
}
if (DEV) console.log('NOTE: --dev: these packages name a development extension. Do not ship them.');
