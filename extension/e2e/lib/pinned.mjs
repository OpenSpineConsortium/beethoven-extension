// hpcworker's two program exports as this repository pins them (interface/README.md): framework/shared-copy,
// the export `framework` (the lab's shared copy as hpcworker publishes it), and framework/testbed, the export
// `testbed` (its fake scheduler). Git keeps only each folder's ORIGIN; `interface/pull.sh --at-origin` fetches
// the files, and they are checked here against ORIGIN before the direct-way lane runs any of them, so the lane
// runs exactly the commit ORIGIN names and never a checkout of hpcworker.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
/** the one line that fetches both, from the repository's root */
export const FETCH = 'bash interface/pull.sh --at-origin framework/shared-copy framework/testbed';

/** a folder's ORIGIN: the repository, the commit, the export and its version, and each file's sha256 */
export function readOrigin(dir) {
  const lines = fs.readFileSync(path.join(dir, 'ORIGIN'), 'utf8').split('\n').filter(Boolean);
  const o = { repository: '', commit: '', export: '', version: 0, files: [] };
  for (const l of lines) {
    let m;
    if ((m = /^repository (\S+)$/.exec(l))) o.repository = m[1];
    else if ((m = /^commit ([0-9a-f]{40})$/.exec(l))) o.commit = m[1];
    else if ((m = /^export (\S+) (\d+)$/.exec(l))) [o.export, o.version] = [m[1], Number(m[2])];
    else if ((m = /^sha256 ([0-9a-f]{64}) ([A-Za-z0-9_][A-Za-z0-9._/-]*)$/.exec(l)) && !m[2].split('/').includes('..')) o.files.push([m[2], m[1]]);
    else throw new Error(`${path.join(dir, 'ORIGIN')}: a line of no known form: ${l}`);
  }
  return o;
}

/**
 * The pinned folder `rel` (from the repository's root) holding export `id`, checked against its ORIGIN: every
 * file ORIGIN lists is there with its sha256, and nothing else is (but ORIGIN). Throws a sentence that says how
 * to fetch the files when they are missing or differ; returns the folder, the commit and the files. `root` is
 * the repository's root, another only in this check's own test.
 */
export function checkPinned(rel, id, root = ROOT) {
  const dir = path.join(root, rel);
  const o = readOrigin(dir);
  if (o.repository !== 'OpenSpineConsortium/hpcworker' || o.export !== id || o.version !== 1 || !o.commit || !o.files.length) throw new Error(`${rel}/ORIGIN does not record hpcworker's export ${id} version 1`);
  const missing = o.files.filter(([p]) => !fs.existsSync(path.join(dir, p))).map(([p]) => p);
  if (missing.length) throw new Error(`the direct way's scenarios run hpcworker's ${id} export as this repository pins it, and ${rel} lacks ${missing.length === o.files.length ? 'its files' : missing.join(', ')}: fetch them once from the repository's root with \`${FETCH}\` (your own gh sign-in; e2e/README.md, "12.0.0: the direct way")`);
  const differ = o.files.filter(([p, sha]) => createHash('sha256').update(fs.readFileSync(path.join(dir, p))).digest('hex') !== sha).map(([p]) => p);
  const listed = new Set(['ORIGIN', ...o.files.map(([p]) => p)]);
  const extra = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (!listed.has(path.relative(dir, full).split(path.sep).join('/'))) extra.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  walk(dir);
  if (differ.length || extra.length) throw new Error(`${rel} is not what its ORIGIN records (${[...differ.map((p) => `${p} differs`), ...extra.map((p) => `${p} is not listed`)].join('; ')}): fetch it again with \`${FETCH}\`, never by hand`);
  return { dir, commit: o.commit, files: o.files };
}
