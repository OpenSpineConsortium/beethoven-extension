// What the source must never contain, checked against the files themselves: no reading of a
// cookie anywhere (the extension is authenticated by the person's own portal sign-in and reads
// only the account name the dashboard shows), no cookies permission and no host on an Anthropic
// domain in the manifest, no key acceptance or key wording left in the code the student's browser
// runs, and the one banned word nowhere in the project.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME } from '../src/core/terms';

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

// The public name is Beethoven (7.0.0). The code name survives only where a format or the cluster
// needs it: the signed lists' tag ASHLEYREV1 (and the older token tag the redaction still catches,
// written ASHLEY(?:REV)?1 in its pattern), and the lab's folders under /shared/ashley/ on the Wayne
// State volume, which the panel never shows. Everything else a person, a reviewer or a log reads
// says Beethoven: the manifest, the package, the pages, the strip, the checks, the mock portal, the
// store images' sources and this folder's README.
describe('the name', () => {
  const KEPT = [/ASHLEY\(\?:REV\)\?1/g, /ASHLEY(?:REV)?1/g, /\/shared\/ashley\//g];
  const readable = [
    ...SRC,
    path.join(ROOT, 'wxt.config.ts'),
    path.join(ROOT, 'package.json'),
    path.join(ROOT, 'README.md'),
    ...walk(path.join(ROOT, 'store-assets', 'src'), ['.html']),
    // the mock's stand-in commands in bin/ have no extension
    ...walk(path.join(ROOT, 'mock-ood'), ['.mjs', '.mts', '']),
  ];

  it('is Beethoven in the manifest and the package, with a description no longer than the 132 characters Chrome allows', () => {
    const cfg = read(path.join(ROOT, 'wxt.config.ts'));
    expect(PRODUCT_NAME).toBe('Beethoven');
    expect(cfg).toContain(`name: '${PRODUCT_NAME}',`);
    expect(cfg).toContain(`short_name: '${PRODUCT_NAME}',`);
    expect(cfg).toContain(`default_title: '${PRODUCT_NAME}'`);
    expect(cfg).toContain("id: 'beethoven@openspineconsortium.com',");
    expect(cfg).toContain("homepage_url: 'https://openspineconsortium.com/beethoven/',");
    const purpose = /const SINGLE_PURPOSE =\s*"([^"]+)";/.exec(cfg)?.[1] ?? '';
    expect(purpose.length).toBeGreaterThan(0);
    expect(purpose.length).toBeLessThanOrEqual(132);
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json'))) as Record<string, string>;
    expect(pkg.name).toBe('beethoven');
    expect(pkg.displayName).toBe(PRODUCT_NAME);
    expect(pkg.description).toBe(purpose);
    expect(pkg.homepage).toBe('https://openspineconsortium.com/beethoven/');
  });

  it('shows the old name nowhere but in the kept tag and cluster paths', () => {
    const hits: string[] = [];
    for (const p of readable) {
      read(p).split('\n').forEach((line, i) => {
        if (/ashley/i.test(KEPT.reduce((s, re) => s.replace(re, ''), line))) hits.push(`${rel(p)}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
