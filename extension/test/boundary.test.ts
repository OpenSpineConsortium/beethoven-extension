// The interface standard's rules 1 to 3 for this repository (interface/README.md): nothing here reads,
// runs or copies a file of another Beethoven repository's checkout; what it offers is declared in
// interface/INTERFACE.json and nowhere else; and what it takes from one is a pinned copy that matches its
// ORIGIN. A line that reaches another checkout fails unless it is on the known list below with its
// reason, and an entry that no longer matches fails too, so the list only shrinks. The patterns are
// hpcworker's (its framework/tests/test_boundary.py), with this repository's own dependency manifests
// added. No network and no other checkout: everything read here is this tree.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const SELF = 'beethoven-extension';
const STANDARD = 'https://github.com/OpenSpineConsortium/beethoven/blob/main/INTERFACES.md';
// every other repository of the ecosystem and the names their checkouts had (the Desktop folders ashley
// and ashley-bridge), and the website's
const OTHERS = ['beethoven', 'hpcworker', 'beethoven-desktop', 'beethoven-qa', 'beethoven-agents', 'beethoven-research', 'beethoven-sites', 'beethoven-base', 'beethoven-vscode', 'ashley', 'ashley-bridge', 'openspineconsortium.github.io', 'spinesurg-ct-nnunet', 'u251-xenograft-rat-rnaseq-study'];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAMES = [...OTHERS].sort((a, b) => b.length - a.length).map(esc).join('|');
// a path made from this checkout's parent: "../<repo>", or "$(dirname ...)/<repo>", "${parent}/<repo>" and the like
const SIBLING_PATH = new RegExp(`(?:\\.\\./|\\)/|\\}/)(${NAMES})(?![A-Za-z0-9_.-])`, 'g');
// ... except a web address built from an origin, where /beethoven/ is the site's folder, not a checkout
// (`${m.origin}/beethoven/services.json`, `${SITE_ORIGIN}/beethoven/request.html`)
const WEB_BASE = /origin|\bport\b|url\b/i;
// a variable whose value is another repository's checkout, or a folder of another repository's code this
// one runs. E2E_SHARED_TEST named the copy of hpcworker's framework the direct-way lane ran until that lane
// took the pinned exports (framework/shared-copy, framework/testbed); E2E_FINAL, the lane's own scaffolding,
// which is in no repository and supplies nothing of hpcworker's since then, is not one
const CHECKOUT_VAR = /\b((?:HPCWORKER|ASHLEY|SITES|QA|BEETHOVEN_(?:SERVICE|QA|AGENTS|RESEARCH|SITES?|EXTENSION|DESKTOP|VSCODE|BASE|HUB))_DIR|E2E_SHARED_TEST)\b/g;
// an option, as the code reads it, whose value is another repository's checkout
const CHECKOUT_OPTION = /['"](--sync-site)['"]/g;
// a clone of another repository of the organisation
const CLONE = new RegExp(`\\b(?:git clone|gh repo clone)\\b[^\\n]*?OpenSpineConsortium/(${NAMES})\\b`, 'gi');
const CHECKOUT_ACTION_REPO = /^\s*repository:\s*\S+/m;
const KINDS = ['contract', 'schema', 'data', 'python', 'cli', 'files', 'program', 'text'];
// what an import's folder may hold besides the export's files (rule 3); one of these the export itself
// carries (the framework's own README.md) is the export's, and its ORIGIN lists it
const OWN = new Set(['ORIGIN', 'README.md', 'pull.sh']);

/** what still reaches another checkout today: the file, what matched, why it is still here and who removes it */
const KNOWN: Array<{ file: string; match: string; why: string }> = [
  {
    file: 'extension/test/killlist.live.test.ts',
    match: 'BEETHOVEN_SITE_DIR',
    why: "the maintainer's check of a signed kill-list before the site repository publishes it (docs/PUBLISHING_SITE.md, \"The kill-list\"): until it is pushed the list exists only in that checkout, so the check reads it there, opt-in with no default, and skips without the variable. It goes when the website offers the signed list as an export, or the check moves to the published address (the maintainer)",
  },
  {
    file: 'extension/store-assets/src/build_assets.mjs',
    match: '--sync-site',
    why: "copies the website's home-page diagram (tools/pages/index/body.html between flow:start and flow:end, and rules of assets/css/hero.css) from a checkout of the site the maintainer names, into store-assets/src/diagram.* and so into public/tour/diagram.*, with no ORIGIN; no default, a maintainer's tool. It goes when the website offers the diagram as an export this repository pins with interface/pull.sh (the maintainer, with the site)",
  },
];

/** the repository's files: git's list where git is at hand, else the tree without .git, dependencies and build output */
function tracked(): string[] {
  const r = spawnSync('git', ['-C', REPO, 'ls-files', '-z'], { encoding: 'utf8' });
  const files = r.status === 0 ? r.stdout.split('\0').filter(Boolean) : [];
  if (files.length) return files;
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', '.output', '.wxt', 'target', '__pycache__'].includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) found.push(path.relative(REPO, full).split(path.sep).join('/'));
    }
  };
  walk(REPO);
  return found;
}
const FILES = tracked();

const utf8 = new TextDecoder('utf-8', { fatal: true });
/** a file's text, or '' for one that is not UTF-8 text (an icon, a zip, a font) */
function text(rel: string): string {
  try {
    return utf8.decode(readFileSync(path.join(REPO, rel)));
  } catch {
    return '';
  }
}

/** every reach of another checkout in one line, as the names that matched */
function reaches(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(SIBLING_PATH)) {
    const at = m.index ?? 0;
    const close = line[at];
    if (close === '}' || close === ')') {
      const open = line.lastIndexOf(close === '}' ? '${' : '$(', at);
      if (open >= 0 && WEB_BASE.test(line.slice(open + 2, at))) continue;
    }
    out.push(m[1]!);
  }
  for (const rx of [CHECKOUT_VAR, CHECKOUT_OPTION, CLONE]) for (const m of line.matchAll(rx)) out.push(m[1]!);
  return out;
}

/** the tracked files an export path names: "dir/" every file under it, "*" within one part of a path */
function covered(p: string): string[] {
  if (p.endsWith('/')) return FILES.filter((f) => f.startsWith(p));
  const re = new RegExp(`^${p.split('*').map(esc).join('[^/]*')}$`);
  return FILES.filter((f) => re.test(f));
}

const MANIFEST = JSON.parse(readFileSync(path.join(REPO, 'interface', 'INTERFACE.json'), 'utf8')) as {
  format: number;
  name: string;
  repository: string;
  summary: string;
  standard: string;
  exports: Array<{ id: string; kind: string; version: number; summary: string; paths: string[]; consumers: string[] }>;
  imports: Array<{ repository: string; export: string; version: number; into: string; origin: string }>;
};

describe('rule 1: the repository builds, tests and runs from its own tree', () => {
  it('reads, runs and copies no file of another checkout, but what the known list names', () => {
    const found = new Map<string, string>();
    for (const rel of FILES) {
      // prose may name another repository; this file names them to look for them
      if (rel.endsWith('.md') || rel === 'extension/test/boundary.test.ts') continue;
      text(rel)
        .split('\n')
        .forEach((line, i) => {
          for (const name of reaches(line)) {
            const key = `${rel}\t${name}`;
            if (!found.has(key)) found.set(key, `${rel}:${i + 1}: ${line.trim().slice(0, 160)}`);
          }
        });
    }
    const known = new Set(KNOWN.map((k) => `${k.file}\t${k.match}`));
    const fresh = [...found].filter(([k]) => !known.has(k)).map(([, where]) => where);
    expect(fresh, "these lines reach another repository's checkout; take what is needed from that repository's interface instead (interface/README.md)").toEqual([]);
    const stale = [...known].filter((k) => !found.has(k)).map((k) => k.replace('\t', ': '));
    expect(stale, 'fixed: remove these from KNOWN in test/boundary.test.ts').toEqual([]);
    for (const k of KNOWN) expect(k.why.length, `${k.file}: say why it is still here and who removes it`).toBeGreaterThan(40);
  });

  it('has no submodule, and no workflow checks out another repository', () => {
    expect(existsSync(path.join(REPO, '.gitmodules'))).toBe(false);
    for (const rel of FILES.filter((f) => f.startsWith('.github/workflows/'))) expect(CHECKOUT_ACTION_REPO.test(text(rel)), `${rel} checks out another repository`).toBe(false);
  });

  it('takes no dependency by path or git URL', () => {
    const bad: string[] = [];
    const local = /^(?:file:|link:|git\+|git:|github:|gitlab:|bitbucket:|ssh:|\.{0,2}\/|~\/|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:#.*)?$)|\.git(?:#.*)?$/;
    for (const rel of FILES.filter((f) => path.posix.basename(f) === 'package.json')) {
      const pkg = JSON.parse(text(rel)) as Record<string, unknown>;
      for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'bundleDependencies', 'overrides']) {
        for (const [name, spec] of Object.entries((pkg[field] as Record<string, unknown>) ?? {})) if (typeof spec === 'string' && local.test(spec)) bad.push(`${rel} ${field}.${name}: ${spec}`);
      }
    }
    // the lock records where each package really came from: the registry, never a folder or a repository
    for (const rel of FILES.filter((f) => path.posix.basename(f) === 'package-lock.json')) {
      const lock = JSON.parse(text(rel)) as { packages?: Record<string, { resolved?: string; link?: boolean }> };
      for (const [name, p] of Object.entries(lock.packages ?? {})) {
        if (!name) continue;
        if (p.link || (p.resolved !== undefined && !p.resolved.startsWith('https://registry.npmjs.org/'))) bad.push(`${rel} ${name}: ${p.link ? 'a link' : p.resolved}`);
      }
    }
    // the bridge's Rust crate: a dependency table never names a path or a git repository
    for (const rel of FILES.filter((f) => path.posix.basename(f) === 'Cargo.toml')) {
      let deps = false;
      for (const line of text(rel).split('\n')) {
        const head = /^\s*\[\[?([^\]]+)\]\]?\s*$/.exec(line); // a table or an array of tables ([[bin]])
        if (head) deps = /(^|\.)(dev-|build-)?dependencies(\.|$)/.test(head[1]!);
        else if (deps && /\b(path|git)\s*=/.test(line)) bad.push(`${rel}: ${line.trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('rule 2: what the repository offers, it declares in interface/INTERFACE.json', () => {
  it('has the manifest of format 1, named for this repository', () => {
    expect(MANIFEST.format).toBe(1);
    expect(MANIFEST.name).toBe(SELF);
    expect(MANIFEST.repository).toBe(`OpenSpineConsortium/${SELF}`);
    expect(MANIFEST.standard).toBe(STANDARD);
    expect(typeof MANIFEST.summary === 'string' && MANIFEST.summary.length > 20).toBe(true);
    expect(Array.isArray(MANIFEST.exports) && Array.isArray(MANIFEST.imports)).toBe(true);
  });

  it('names every export by kind and version, and every export path names a file of this repository', () => {
    const ids = MANIFEST.exports.map((e) => e.id);
    expect(new Set(ids).size, 'an export id is used once').toBe(ids.length);
    for (const e of MANIFEST.exports) {
      expect(e.id, 'an id is lower-case words joined by -').toMatch(/^[a-z][a-z0-9-]*$/);
      expect(KINDS, `${e.id}: kind`).toContain(e.kind);
      expect(Number.isInteger(e.version) && e.version >= 1, `${e.id}: version is an integer from 1`).toBe(true);
      expect(typeof e.summary === 'string' && e.summary.length > 10, `${e.id}: summary`).toBe(true);
      expect(Array.isArray(e.paths) && e.paths.length > 0, `${e.id}: paths`).toBe(true);
      expect(Array.isArray(e.consumers), `${e.id}: consumers`).toBe(true);
      for (const c of e.consumers) expect(c, `${e.id}: a consumer is a repository`).toMatch(/^OpenSpineConsortium\/[A-Za-z0-9._-]+$/);
      for (const p of e.paths) {
        expect(p.startsWith('/') || p.split('/').includes('..'), `${e.id}: ${p} is relative to the repository's root`).toBe(false);
        expect(covered(p).length, `${e.id}: ${p} names no tracked file`).toBeGreaterThan(0);
        // what this repository took from another is that one's to offer, never re-offered from here
        for (const imp of MANIFEST.imports) expect(covered(p).filter((f) => f.startsWith(`${imp.into}/`)), `${e.id}: ${p} re-offers ${imp.repository}'s files`).toEqual([]);
      }
    }
  });

  it('names every import by repository, export, version and folder', () => {
    for (const imp of MANIFEST.imports) {
      expect(imp.repository).toMatch(/^OpenSpineConsortium\/[A-Za-z0-9._-]+$/);
      expect(imp.repository).not.toBe(MANIFEST.repository);
      expect(imp.export).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(Number.isInteger(imp.version) && imp.version >= 1, `${imp.into}: version`).toBe(true);
      expect(imp.into.startsWith('/') || imp.into.endsWith('/') || imp.into.split('/').includes('..'), `${imp.into}: a folder relative to the root`).toBe(false);
      expect(statSync(path.join(REPO, imp.into)).isDirectory(), `${imp.into} is a folder`).toBe(true);
      expect(imp.origin).toBe(`${imp.into}/ORIGIN`);
    }
  });
});

/** git ignores this path of the tree (rule 3's program folders keep only their ORIGIN), or undefined without git */
function ignored(rel: string): boolean | undefined {
  const r = spawnSync('git', ['-C', REPO, 'check-ignore', '-q', '--no-index', '--', rel], { encoding: 'utf8' });
  return r.status === 0 ? true : r.status === 1 ? false : undefined;
}

describe('rule 3: each import is a pinned copy that equals its ORIGIN', () => {
  for (const imp of MANIFEST.imports) {
    it(`${imp.into} holds exactly the files ${imp.origin} lists, byte for byte`, () => {
      const lines = readFileSync(path.join(REPO, imp.origin), 'utf8').split('\n').filter(Boolean);
      expect(lines[0]).toBe(`repository ${imp.repository}`);
      expect(lines[1]).toMatch(/^commit [0-9a-f]{40}$/);
      // every copy here was taken after its provider published INTERFACE.json, so each names its export
      expect(lines.filter((x) => x.startsWith('export ')), `${imp.origin}: the export and its version`).toEqual([`export ${imp.export} ${imp.version}`]);
      expect(lines.filter((l) => !/^(repository \S+|commit [0-9a-f]{40}|export \S+ \d+|sha256 [0-9a-f]{64} \S+)$/.test(l)), `${imp.origin}: lines of no known form`).toEqual([]);
      const recorded = Object.fromEntries(lines.filter((l) => l.startsWith('sha256 ')).map((l) => [l.split(' ').slice(2).join(' '), l.split(' ')[1]]));
      expect(Object.keys(recorded).length, `${imp.origin} lists no file`).toBeGreaterThan(0);
      const present: Record<string, string> = {};
      const folder = path.join(REPO, imp.into);
      const walk = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full);
          else {
            const rel = path.relative(folder, full).split(path.sep).join('/');
            if (!OWN.has(rel) || rel in recorded) present[rel] = createHash('sha256').update(readFileSync(full)).digest('hex');
          }
        }
      };
      walk(folder);
      // a program only an opt-in lane runs stays out of git (rule 3): ORIGIN is committed, the files are
      // fetched by interface/pull.sh --at-origin, and when they are here they are the whole export, unchanged
      const listed = Object.keys(recorded).map((f) => `${imp.into}/${f}`);
      const out = listed.filter((f) => ignored(f));
      expect(out.length === 0 || out.length === listed.length, `${imp.into}: git ignores some of its files and not others`).toBe(true);
      expect(ignored(imp.origin), `${imp.origin} is committed`).not.toBe(true);
      if (out.length && Object.keys(present).length === 0) return;
      expect(present, `${imp.into} differs from ${imp.origin}: take a new copy with interface/pull.sh, never by hand`).toEqual(recorded);
    });
  }

  it('interface/pull.sh takes each import from its repository, at a merged commit, and nothing else', () => {
    const pull = text('interface/pull.sh');
    expect(pull, 'the repository has its pull').not.toBe('');
    // the import a folder holds is read from this repository's manifest, the export's files from the provider's
    expect(pull.match(/interface\/INTERFACE\.json/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // from GitHub through the person's own gh sign-in, as it is (never a token of its own, a clone or a checkout)
    expect(pull).toMatch(/\bgh api\b/);
    expect(pull, 'gh signs in as the person does, with GH_TOKEN and GITHUB_TOKEN left as they are').not.toMatch(/env -u|unset (?:GH_TOKEN|GITHUB_TOKEN)/);
    expect(pull).not.toMatch(/\bgit clone\b|\bcurl\b|\bwget\b/);
    // at a commit the provider's default branch contains
    expect(pull).toMatch(/compare\/\$default\.\.\.\$sha/);
    expect(pull, 'a pull never deletes what the provider dropped').not.toMatch(/\brm -(?:r|rf|fr)\b|\bgit rm\b/);
    // no folder keeps a pull of its own: one script takes every import
    for (const imp of MANIFEST.imports) expect(existsSync(path.join(REPO, imp.into, 'pull.sh')), `${imp.into}/pull.sh`).toBe(false);
  });
});
