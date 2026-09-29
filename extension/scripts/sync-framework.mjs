#!/usr/bin/env node
// Bundle the cluster-side framework into the extension so "Set up the cluster" can upload it
// through the portal's Files routes. Copies ../framework/** (text files only; nothing under a
// test, node_modules or .git folder) into public/framework/files/ and writes
// public/framework/manifest.json listing each file with its size, SHA-256 and mode. Runs before
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
await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`sync-framework: ${files.length} file(s) bundled from ${source}`);
