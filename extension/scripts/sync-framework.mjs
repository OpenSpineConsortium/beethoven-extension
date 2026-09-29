#!/usr/bin/env node
// Bundle the cluster-side framework into the extension so "Set up the cluster" can upload it
// through the portal's Files routes. Copies ../framework/** (text files only; nothing under a
// test, node_modules or .git folder) into public/framework/files/ and writes
// (named files.json, not manifest.json: the Chrome Web Store refuses a package with a second manifest.json anywhere inside)
// public/framework/files.json listing each file with its size, SHA-256 and mode. Runs before
// every build and zip (prebuild, prezip). An empty framework folder yields an empty manifest and
// the extension says so instead of pretending to install something.
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = path.resolve(root, '..', 'framework');
const target = path.join(root, 'public', 'framework');
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.pytest_cache', 'tests', 'test']);
const SKIP_FILES = /\.(pyc|png|jpg|jpeg|gif|sif|tar|gz|zip|pem|key)$/i;

async function walk(dir, rel = '') {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) out.push(...(await walk(path.join(dir, e.name), r)));
    } else if (e.isFile() && !SKIP_FILES.test(e.name) && !e.name.startsWith('.')) {
      out.push(r);
    }
  }
  return out;
}

function looksBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

await fs.rm(target, { recursive: true, force: true });
await fs.mkdir(path.join(target, 'files'), { recursive: true });
const files = [];
for (const rel of await walk(source)) {
  const buf = await fs.readFile(path.join(source, rel));
  if (looksBinary(buf)) {
    console.warn(`sync-framework: skipping binary file ${rel} (the Files route writes text)`);
    continue;
  }
  // LF endings on the cluster whatever the checkout did on Windows
  const text = buf.toString('utf8').replace(/\r\n/g, '\n');
  const dest = path.join(target, 'files', rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, text);
  const executable = /^(bin\/|.*\.(sh|sbatch|py)$)/.test(rel) || text.startsWith('#!');
  files.push({ path: rel, bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex'), mode: executable ? '0755' : '0644' });
}
const manifest = { v: 1, generated: new Date().toISOString(), source: 'framework/', files };
await fs.writeFile(path.join(target, 'files.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`sync-framework: ${files.length} file(s) bundled from ${source}`);

// The agreement texts the extension ships must be byte-identical to the canonical ones at the
// repository root (CLAUDE.md, "Terms"); copy them at the same moment, so a build can never carry
// a stale or foreign text. The signing dialog hashes what it shows, so the copy is what is recorded.
for (const name of ['LICENSE.txt', 'PRIVACY.md']) {
  const from = path.resolve(root, '..', name);
  try {
    const text = await fs.readFile(from);
    await fs.writeFile(path.join(root, 'public', name), text);
    console.log(`sync-framework: ${name} copied from the repository root (${text.length} bytes)`);
  } catch {
    console.warn(`sync-framework: ${from} not found; public/${name} left as it is`);
  }
}

// The signing dialog records the version it names (src/core/terms.ts TERMS_VERSION, TERMS_DATE) and
// hashes the LICENSE.txt it shows. A build in which the two disagree would record an acceptance of
// "version N" beside a text headed "Version M", so the build stops here instead of shipping that.
const fail = (msg) => {
  console.error(`sync-framework: ${msg}`);
  process.exit(1);
};
const termsSource = await fs.readFile(path.join(root, 'src', 'core', 'terms.ts'), 'utf8');
const termsVersion = /export const TERMS_VERSION = (\d+);/.exec(termsSource)?.[1];
const termsDate = /export const TERMS_DATE = '(\d{4}-\d{2}-\d{2})';/.exec(termsSource)?.[1];
if (!termsVersion || !termsDate) fail('src/core/terms.ts does not declare TERMS_VERSION = <integer> and TERMS_DATE = <yyyy-mm-dd>');
const licenceText = await fs.readFile(path.join(root, 'public', 'LICENSE.txt'), 'utf8').catch(() => '');
const licenceHead = /^Version (\d+), (\d{4}-\d{2}-\d{2})\./m.exec(licenceText);
if (!licenceHead) fail('public/LICENSE.txt carries no "Version N, yyyy-mm-dd." line');
if (licenceHead[1] !== termsVersion) fail(`public/LICENSE.txt is Version ${licenceHead[1]} but src/core/terms.ts has TERMS_VERSION = ${termsVersion}; change the text and the constant together`);
if (licenceHead[2] !== termsDate) fail(`public/LICENSE.txt is dated ${licenceHead[2]} but src/core/terms.ts has TERMS_DATE = '${termsDate}'; change the text and the constant together`);
console.log(`sync-framework: LICENSE.txt Version ${licenceHead[1]}, ${licenceHead[2]} matches TERMS_VERSION and TERMS_DATE`);
