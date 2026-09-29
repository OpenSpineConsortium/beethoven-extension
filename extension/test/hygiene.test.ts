// What the source must never contain, checked against the files themselves: no reading of a
// cookie anywhere (the extension is authenticated by the person's own portal sign-in and reads
// only the account name the dashboard shows), no cookies permission and no host on an Anthropic
// domain in the manifest, no key acceptance or key wording left in the code the student's browser
// runs, and the one banned word nowhere in the project.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === 'node_modules' || name === '.output' || name === '.wxt') continue;
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.includes(path.extname(name))) out.push(p);
  }
  return out;
}

const SRC = walk(path.join(ROOT, 'src'), ['.ts', '.html', '.css', '.json']);
const read = (p: string) => readFileSync(p, 'utf8');
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');

describe('what the source must not contain', () => {
  it('reads no cookie anywhere', () => {
    const hits = SRC.filter((p) => /document\s*\.\s*cookie|cookieStore|browser\.cookies|chrome\.cookies/.test(read(p))).map(rel);
    expect(hits).toEqual([]);
  });

  it('asks for exactly storage, alarms, scripting, activeTab and sidePanel, optional https hosts only, and nothing on an Anthropic domain', () => {
    const cfg = read(path.join(ROOT, 'wxt.config.ts'));
    const perms = /permissions:\s*\[([^\]]*)\]/.exec(cfg)?.[1] ?? '';
    const named = [...perms.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(named.sort()).toEqual(['activeTab', 'alarms', 'scripting', 'sidePanel', 'storage']);
    expect(/'cookies'|"cookies"/.test(perms)).toBe(false);
    const hosts = /const hosts = \[([^\]]*)\]/.exec(cfg)?.[1] ?? '';
    expect(hosts).toMatch(/'https:\/\/\*\/\*'/);
    expect(/host_permissions\s*:/.test(cfg.replace(/optional_host_permissions/g, ''))).toBe(false);
    for (const p of [...SRC, path.join(ROOT, 'wxt.config.ts')]) {
      const text = read(p);
      // the environment link the panel opens is claude.ai (isEnvironmentUrl) and the sign-in tab is Anthropic's own page; neither is a permission or a fetch
      expect(/(host_permissions|matches)\s*:[^\n]*(anthropic|claude)\./.test(text), rel(p)).toBe(false);
    }
  });

  it('accepts no key and speaks of none', () => {
    for (const p of SRC) {
      const text = read(p);
      expect(/licen[cs]e[ -]key|site key|personal key|trial key|ASHLEY1'|save-key|isSiteKey|USERNAME_RE|licenceIdentity|LICENSE_KEY/.test(text), rel(p)).toBe(false);
      expect(/document\.cookie/.test(text), rel(p)).toBe(false);
    }
    // the one key that remains is the public one the kill-list is signed with
    const ring = JSON.parse(read(path.join(ROOT, 'src', 'licensing', 'keys.json'))) as Record<string, string>;
    expect(Object.keys(ring)).toEqual(['k1']);
  });

  it('never uses the banned word', () => {
    const banned = new RegExp(['prov', 'enance'].join(''), 'i');
    const files = [...SRC, ...walk(path.join(ROOT, 'test'), ['.ts']), ...walk(path.join(ROOT, 'mock-ood'), ['.mjs', '.mts']), path.join(ROOT, 'wxt.config.ts')];
    const hits = files.filter((p) => banned.test(read(p))).map(rel);
    expect(hits).toEqual([]);
  });
});
