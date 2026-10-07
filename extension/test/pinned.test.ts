// The direct-way lane's check of hpcworker's two program exports (e2e/lib/pinned.mjs), the check that runs
// before the lane runs anything of them: a folder passes only when it holds exactly the files its ORIGIN
// lists, each with its sha256, for the export the lane asked for; anything else stops the lane with the one
// line that fetches the files again. Against a scratch tree, never the repository's own folders, and the
// repository's own folders too when their files are here (git keeps only their ORIGIN: rule 3).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkPinned, FETCH, readOrigin, ROOT } from '../e2e/lib/pinned.mjs';

const COMMIT = 'c0ffee0000000000000000000000000000000001';
const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const FILES: Record<string, string> = { 'README.md': 'the framework\n', 'bin/hpcworker': '#!/bin/bash\n', 'lib/common.sh': 'x=1\n' };

/** a scratch repository root with framework/shared-copy as a pull leaves it */
function tree(origin?: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'beethoven-pinned-'));
  const dir = path.join(root, 'framework', 'shared-copy');
  for (const [rel, text] of Object.entries(FILES)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  const lines = ['repository OpenSpineConsortium/hpcworker', `commit ${COMMIT}`, 'export framework 1', ...Object.keys(FILES).sort().map((f) => `sha256 ${sha(FILES[f]!)} ${f}`)];
  writeFileSync(path.join(dir, 'ORIGIN'), origin ?? `${lines.join('\n')}\n`);
  return { root, dir };
}

describe('the pinned program folders the direct way runs', () => {
  it('passes a folder that is exactly its ORIGIN, and says which commit it is', () => {
    const t = tree();
    expect(checkPinned('framework/shared-copy', 'framework', t.root)).toEqual({ dir: t.dir, commit: COMMIT, files: Object.keys(FILES).sort().map((f) => [f, sha(FILES[f]!)]) });
  });

  it('stops on a missing file, a changed one and one ORIGIN does not list, each with the line that fetches them', () => {
    let t = tree();
    rmSync(path.join(t.dir, 'bin'), { recursive: true });
    expect(() => checkPinned('framework/shared-copy', 'framework', t.root)).toThrow(/lacks bin\/hpcworker/);
    t = tree();
    for (const f of Object.keys(FILES)) rmSync(path.join(t.dir, f));
    expect(() => checkPinned('framework/shared-copy', 'framework', t.root)).toThrow(new RegExp(`lacks its files: fetch them once from the repository's root with \`${FETCH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``));
    t = tree();
    writeFileSync(path.join(t.dir, 'lib', 'common.sh'), 'x=2\n');
    expect(() => checkPinned('framework/shared-copy', 'framework', t.root)).toThrow(/lib\/common\.sh differs/);
    t = tree();
    writeFileSync(path.join(t.dir, 'lib', 'extra.sh'), 'y\n');
    expect(() => checkPinned('framework/shared-copy', 'framework', t.root)).toThrow(/lib\/extra\.sh is not listed/);
  });

  it('stops on an ORIGIN of another export, another repository or no known form', () => {
    let t = tree();
    expect(() => checkPinned('framework/shared-copy', 'testbed', t.root)).toThrow(/does not record hpcworker's export testbed version 1/);
    t = tree(`repository OpenSpineConsortium/beethoven-sites\ncommit ${COMMIT}\nexport framework 1\nsha256 ${sha('r')} README.md\n`);
    expect(() => checkPinned('framework/shared-copy', 'framework', t.root)).toThrow(/does not record/);
    t = tree(`repository OpenSpineConsortium/hpcworker\ncommit ${COMMIT}\nexport framework 1\nsha256 ${sha('r')} ../outside\n`);
    expect(() => readOrigin(t.dir)).toThrow(/a line of no known form/);
  });

  it("checks the repository's own folders, when their files are here", () => {
    for (const [rel, id] of [
      ['framework/shared-copy', 'framework'],
      ['framework/testbed', 'testbed'],
    ] as const) {
      const o = readOrigin(path.join(ROOT, rel));
      expect(o.export, rel).toBe(id);
      // git keeps only ORIGIN; a checkout that fetched the files checks them all
      if (o.files.every(([f]) => !existsSync(path.join(ROOT, rel, f)))) continue;
      expect(checkPinned(rel, id).commit, rel).toBe(o.commit);
    }
  });
});
