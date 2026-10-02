// What the source must never contain, checked against the files themselves: no reading of a
// cookie anywhere (the extension is authenticated by the person's own portal sign-in and reads
// only the account name the dashboard shows), no cookies permission and no host on an Anthropic
// domain in the manifest, no key acceptance or key wording left in the code the student's browser
// runs, and the one banned word nowhere in the project. And what the built package must never
// contain (8.0.0): any cluster-side code (the tool lives in the lab's shared copy; the package
// carries the site profiles as data only), or JavaScript a person could read as source (Vite
// minifies it; no source map, no comment survives).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { LOG_WORDS, WORDS } from '../src/core/model';
import { PRODUCT_NAME } from '../src/core/terms';
import { FIXTURES, fixtureStrings } from '../src/ui/fixtures';
import { LABELS } from '../src/ui/labels';
import { WORDS12 } from '../src/ui/model12';

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

  // 12.0.0: nativeMessaging, for the Beethoven bridge that comes inside the package (D1): the only host it
  // can reach is com.openspineconsortium.beethoven.bridge, and only once the student has installed it
  it('asks for exactly storage, alarms, scripting, sidePanel and nativeMessaging (no activeTab since 11.0.0), optional https hosts only, and nothing on an Anthropic domain', () => {
    const cfg = read(path.join(ROOT, 'wxt.config.ts'));
    const perms = /permissions:\s*\[([^\]]*)\]/.exec(cfg)?.[1] ?? '';
    const named = [...perms.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(named.sort()).toEqual(['alarms', 'nativeMessaging', 'scripting', 'sidePanel', 'storage']);
    expect(/'activeTab'/.test(perms)).toBe(false);
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

  it('reads no framework file: the package carries none, only the site profiles', () => {
    const hits = SRC.filter((p) => /['"`]\/framework\/|files\.json|bundledFrameworkVersion/.test(read(p))).map(rel);
    expect(hits).toEqual([]);
    expect(existsSync(path.join(ROOT, 'scripts', 'sync-framework.mjs'))).toBe(false);
  });

  // 9.0.0 wears the site's typefaces; they are files in the package, never fetched (no remote code, and no
  // request a reader of the privacy statement would not expect)
  it('loads its fonts from the package only, each family with its licence', () => {
    const css = SRC.filter((p) => p.endsWith('.css'));
    const fontsDir = path.join(ROOT, 'public', 'fonts');
    const bundled = readdirSync(fontsDir);
    for (const p of css) {
      const text = read(p);
      expect(/@import|https?:\/\/|\/\/fonts\.|googleapis|gstatic/i.test(text.replace(/\/\*[\s\S]*?\*\//g, '')), rel(p)).toBe(false);
      for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
        const ref = m[1] ?? '';
        expect(ref, rel(p)).toMatch(/^\/fonts\/[A-Za-z0-9-]+\.woff2$/);
        expect(bundled, rel(p)).toContain(ref.slice('/fonts/'.length));
      }
    }
    for (const family of ['Newsreader', 'IBMPlex']) {
      expect(bundled.some((n) => n.startsWith(family) && n.endsWith('.woff2')), family).toBe(true);
      expect(read(path.join(fontsDir, `${family}-OFL.txt`))).toMatch(/SIL Open Font License, Version 1\.1/);
    }
    const bytes = bundled.reduce((s, n) => s + statSync(path.join(fontsDir, n)).size, 0);
    expect(bytes).toBeLessThan(400 * 1024);
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

// The built package, as the stores and the direct downloads on the site get it: every build folder
// in .output whose manifest carries this version (npm run build), and the store zips of this
// version beside them (npm run zip); folders and zips left there by earlier versions are not
// looked at. The package carries no cluster-side code at all since 8.0.0: no script, no job
// template, no copy of the tool, no README or VERSION of it, no file list; the site profiles are
// there as data, without their free-text notes. Its JavaScript is Vite's minified output, which a
// store's rules allow (Chrome forbids obfuscation, not minification): long lines, no comment left,
// no source map and no pointer to one. Skipped, and shown as skipped, when .output holds no build
// of this version (a fresh checkout: npm test before npm run build).
describe('the built package', () => {
  const OUT = path.join(ROOT, '.output');
  const VERSION = (JSON.parse(read(path.join(ROOT, 'package.json'))) as { version: string }).version;
  const builds = existsSync(OUT)
    ? readdirSync(OUT)
        .map((n) => path.join(OUT, n))
        .filter((d) => statSync(d).isDirectory() && existsSync(path.join(d, 'manifest.json')))
        // a development build (wxt --mode development: "<browser>-mv3-dev") carries the fixture gallery and is never shipped
        .filter((d) => !/-dev$/.test(path.basename(d)))
        .filter((d) => (JSON.parse(read(path.join(d, 'manifest.json'))) as { version?: string }).version === VERSION)
    : [];
  const zips = existsSync(OUT) ? readdirSync(OUT).filter((n) => n.startsWith(`beethoven-${VERSION}-`) && n.endsWith('.zip') && !n.endsWith('-dev.zip')).map((n) => path.join(OUT, n)) : [];
  const storeZips = zips.filter((z) => !z.endsWith('-sources.zip'));
  const sourcesZip = zips.find((z) => z.endsWith('-sources.zip'));

  /** every file of a package: its path inside, and its bytes on demand */
  type Entry = { name: string; bytes: () => Buffer };
  const folderEntries = (dir: string): Entry[] => {
    const out: Entry[] = [];
    const walkAll = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = path.join(d, n);
        if (statSync(p).isDirectory()) walkAll(p);
        else out.push({ name: path.relative(dir, p).replace(/\\/g, '/'), bytes: () => readFileSync(p) });
      }
    };
    walkAll(dir);
    return out;
  };
  /** a zip's entries from its central directory (stored or deflated, as wxt zip writes them) */
  const zipEntries = (file: string): Entry[] => {
    const buf = readFileSync(file);
    let eocd = buf.length - 22;
    while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
    if (eocd < 0) throw new Error(`${file}: no end of central directory`);
    const count = buf.readUInt16LE(eocd + 10);
    let at = buf.readUInt32LE(eocd + 16);
    const out: Entry[] = [];
    for (let i = 0; i < count; i++) {
      if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error(`${file}: bad central directory entry ${i}`);
      const method = buf.readUInt16LE(at + 10);
      const size = buf.readUInt32LE(at + 20);
      const nameLen = buf.readUInt16LE(at + 28);
      const extraLen = buf.readUInt16LE(at + 30);
      const commentLen = buf.readUInt16LE(at + 32);
      const local = buf.readUInt32LE(at + 42);
      const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
      at += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith('/')) continue;
      out.push({
        name,
        bytes: () => {
          const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
          const raw = buf.subarray(start, start + size);
          if (method === 0) return Buffer.from(raw);
          if (method === 8) return inflateRawSync(raw);
          throw new Error(`${file}: ${name} uses compression method ${method}`);
        },
      });
    }
    return out;
  };
  const packages: Array<{ label: string; entries: Entry[] }> = [
    ...builds.map((d) => ({ label: `.output/${path.basename(d)}`, entries: folderEntries(d) })),
    ...storeZips.map((z) => ({ label: `.output/${path.basename(z)}`, entries: zipEntries(z) })),
  ];

  // a comment in the source, long enough that finding it in the bundle can only mean it was kept
  const COMMENTS = [...new Set(SRC.filter((p) => p.endsWith('.ts')).flatMap((p) => read(p).split('\n').map((l) => /^\s*(?:\/\/|\*|\/\*\*)\s?(.*)$/.exec(l)?.[1]?.trim() ?? '').filter((c) => c.length >= 40 && !/["'`]/.test(c))))];

  it.skipIf(packages.length === 0)(`carries no cluster-side code, only the site profiles as data (${VERSION})`, () => {
    const CODE = /\.(sh|bash|py|pyc|tpl|sbatch|pbs|lsf|pl|rb|ts|mts|map)$/i;
    const TOOL_FILES = /(^|\/)(hpcworker|VERSION|files\.json|README[^/]*)$/i;
    const framework = (() => {
      try {
        return readdirSync(path.join(ROOT, '..', 'framework', 'profiles')).filter((n) => n.endsWith('.json')).sort();
      } catch {
        return undefined;
      }
    })();
    for (const { label, entries } of packages) {
      const names = entries.map((e) => e.name);
      expect(names.filter((n) => CODE.test(n) || TOOL_FILES.test(n) || /(^|\/)framework\//.test(n)), label).toEqual([]);
      // the profiles, as data: JSON objects named by their site, with no free-text notes
      const profiles = entries.filter((e) => e.name.startsWith('profiles/'));
      for (const e of profiles) {
        expect(e.name, label).toMatch(/^profiles\/[A-Za-z0-9_-]+\.json$/);
        const p = JSON.parse(e.bytes().toString('utf8')) as Record<string, unknown>;
        expect(p.notes, `${label} ${e.name}`).toBeUndefined();
        expect(`profiles/${String(p.site)}.json`, label).toBe(e.name);
      }
      if (framework) expect(profiles.map((e) => e.name.slice('profiles/'.length)).sort(), label).toEqual(framework);
      // nothing beside the manifest, the pages, the scripts, the styles, the icons (11.0.0: and their lit variants), the
      // profiles, the texts, the bundled fonts with their licences (9.0.0), the tour's copy of the site diagram (11.0.0),
      // and (12.0.0, D1) the Beethoven bridge's installers as zips with the manifest that names them
      const other = names.filter((n) => !/^(manifest\.json|[^/]+\.html|LICENSE\.txt|PRIVACY\.md|THIRD_PARTY_NOTICES\.md|icon\/(?:on-|off-)?\d+\.png|profiles\/[^/]+\.json|(?:chunks|content-scripts|assets)\/[^/]+\.(?:js|css)|[^/]+\.js|fonts\/[A-Za-z0-9-]+\.woff2|fonts\/[A-Za-z0-9-]+-OFL\.txt|tour\/diagram\.(?:js|css)|bridge\/[A-Za-z0-9._-]+\.zip|bridge\/manifest\.json)$/.test(n));
      expect(other, label).toEqual([]);
      // 12.0.0: the bridge's manifest names only files that are there, each a zip under bridge/
      const bm = entries.find((e) => e.name === 'bridge/manifest.json');
      if (bm) {
        // the helper stream writes each entry's file as "name" (core/bridge.ts parseBridgeManifest also reads the older "file")
        const m = JSON.parse(bm.bytes().toString('utf8')) as { files?: Array<{ name?: string; file?: string }> };
        for (const f of m.files ?? []) expect(names, `${label} bridge/${f.name ?? f.file}`).toContain(`bridge/${f.name ?? f.file}`);
      }
      // 11.0.0: what the pages need is there: the lit icons, the tour's diagram, the notices
      for (const need of ['icon/on-16.png', 'icon/on-32.png', 'icon/on-48.png', 'icon/on-128.png', 'icon/off-16.png', 'icon/off-32.png', 'icon/off-48.png', 'icon/off-128.png', 'tour/diagram.js', 'tour/diagram.css', 'THIRD_PARTY_NOTICES.md']) expect(names, `${label} ${need}`).toContain(need);
      // the GPU a student may use depends on their account: the diagram names none
      const diagram = entries.find((e) => e.name === 'tour/diagram.js')!.bytes().toString('utf8');
      expect(diagram).not.toMatch(/H200/);
      // the fixture gallery is a development build's only: no fixture name, no gallery code
      const js = entries.filter((e) => e.name.endsWith('.js') && !e.name.startsWith('tour/')).map((e) => e.bytes().toString('utf8')).join('\n');
      expect(js, label).not.toMatch(/h-online-confirm|j-statement-not-approved|\[gallery\]|alex@wayne\.edu/);
      // and none of its styles (11.0.0: gallery.css travels with gallery.ts)
      const css = entries.filter((e) => e.name.endsWith('.css') && !e.name.startsWith('tour/')).map((e) => e.bytes().toString('utf8')).join('\n');
      expect(css, label).not.toMatch(/\.gallery\b/);
      // every font the pages use is in the package, beside the licence of its family
      const fonts = names.filter((n) => n.endsWith('.woff2'));
      expect(fonts.length, label).toBeGreaterThan(0);
      for (const family of ['Newsreader', 'IBMPlex']) {
        expect(fonts.some((n) => n.startsWith(`fonts/${family}`)), `${label} ${family}`).toBe(true);
        expect(names, label).toContain(`fonts/${family}-OFL.txt`);
      }
    }
  });

  it.skipIf(packages.length === 0)(`ships its JavaScript minified, with no comment and no source map (${VERSION})`, () => {
    expect(COMMENTS.length).toBeGreaterThan(200);
    for (const { label, entries } of packages) {
      const scripts = entries.filter((e) => e.name.endsWith('.js'));
      expect(scripts.length, label).toBeGreaterThan(3);
      for (const e of scripts) {
        const text = e.bytes().toString('utf8');
        const where = `${label} ${e.name}`;
        expect(text, where).not.toMatch(/sourceMappingURL|sourceURL=/);
        const lines = text.split('\n');
        // minified: a few very long lines (the breaks left are inside template strings), never source-shaped ones
        expect(text.length / lines.length, where).toBeGreaterThan(200);
        expect(Math.max(...lines.map((l) => l.length)), where).toBeGreaterThan(2000);
        expect(lines.filter((l) => /^\s*(?:\/\/|\/\*)/.test(l)), where).toEqual([]);
        expect(text, where).not.toMatch(/\/\*\*|\/\*!|@license|@preserve/);
        expect(COMMENTS.filter((c) => text.includes(c)), where).toEqual([]);
      }
    }
  });

  it.skipIf(!sourcesZip)(`the sources zip (for the Firefox review, not published) carries no framework either (${VERSION})`, () => {
    const names = zipEntries(sourcesZip!).map((e) => e.name);
    expect(names.filter((n) => n.startsWith('public/framework/') || n === 'scripts/sync-framework.mjs')).toEqual([]);
    expect(names).toContain('scripts/sync-profiles.mjs');
  });
});

// No sentence a student can read may name the machinery: job, node, partition, heartbeat, shell, portal tab,
// probe, scheduler, hpcworker, OnDemand or "Failed to fetch" (the specification's hygiene rule). Details for
// the lab lead and Settings' folded "For your lab lead" are exempt. Five sentences of the specification itself
// break the rule and are allowed by name: the third Try asking question, the share subline and the tour's third
// caption ("job", "jobs"), and the two grid sign-in sentences that name the portal's own page ("OnDemand",
// "LOGIN TO ONDEMAND").
// The one-time key step's line is a command the student pastes, not a sentence; it is not in these tables.
describe('the words a student reads', () => {
  const BANNED = (t: string) => /\b(jobs?|nodes?|partition|heartbeat|shell|scheduler|hpcworker|probe)\b|portal tab|Failed to fetch/i.test(t) || /OnDemand|ONDEMAND/.test(t);
  const ALLOWED = new Set<string>([WORDS.home.prompts[2], WORDS.queue.shareSub, WORDS.tour.captions[2], WORDS.grid.notOod, WORDS.grid.startPage]);
  const strings = (v: unknown, skip: string[] = []): string[] => {
    if (typeof v === 'string') return [v];
    if (typeof v === 'function') return [String((v as (...a: unknown[]) => unknown)('st1234', 'GlobalProtect', 'protect.wayne.edu', 'Wayne State grid'))];
    if (Array.isArray(v)) return v.flatMap((x) => strings(x, skip));
    if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => (skip.includes(k) ? [] : strings(x, skip)));
    return [];
  };

  it('the sentence tables hold none of the internal words', () => {
    const all = [...strings(WORDS, ['details']), ...strings(LOG_WORDS), ...strings(LABELS), ...strings(WORDS12)];
    expect(all.length).toBeGreaterThan(200);
    expect(all.filter((t) => BANNED(t) && !ALLOWED.has(t))).toEqual([]);
    // the allow-list is exactly what it says: each allowed sentence is still in the tables
    for (const a of ALLOWED) expect(all).toContain(a);
  });

  it('every fixture (every state the pages draw) holds none of them', () => {
    expect(FIXTURES.length).toBeGreaterThan(90);
    const hits = FIXTURES.flatMap((f) => fixtureStrings(f).filter((t) => BANNED(t) && !ALLOWED.has(t)).map((t) => `${f.name}: ${t}`));
    expect(hits).toEqual([]);
  });

  // 12.0.0: the direct way may tempt the machinery's words onto the student's screen. "ssh", "native
  // messaging", "WebCrypto", "PRF", "authorized_keys" and the halves of a key pair never appear; "key",
  // "helper" and "bridge" only in the sentences below, where no honest plainer word exists (the browser's
  // key the student may protect; the setup key Google Authenticator itself asks for; the helper the
  // student downloads and its status; the Beethoven bridge by name). A new sentence with one of them
  // fails here until it is reviewed and named. Details for the lab lead is exempt, as for the rest.
  const NEVER = (t: string) => /\bssh\b|native messaging|webcrypto|\bprf\b|authorized_keys|public key|private key|key ?pair/i.test(t);
  const RESTRICTED = (t: string) => /\b(keys?|helpers?|bridges?)\b/i.test(t);
  const D = WORDS.direct;
  const RESTRICTED_OK = new Set<string>([
    // 11.0.0's one-time terminal step
    WORDS.loginSetup.lineExplain,
    // the helper the student downloads (the core's words)
    D.installHelper.body,
    D.installHelper.unsignedNote,
    D.installHelper.checking,
    D.installHelper.found,
    D.installHelper.broken,
    D.installHelper.noDownload,
    // the browser's key and its opt-in protection
    D.signin.checking,
    D.signin.keyNotTaken,
    D.signin.unlockBody,
    D.protectKey.title,
    D.protectKey.unsupported,
    D.settings.protectKey,
    D.settings.forgetNote,
    D.settings.helper,
    D.settings.keyNone,
    D.settings.keyPlain,
    D.settings.keyProtected,
    LOG_WORDS.keyProtected,
    LOG_WORDS.keyUnprotected,
    // fixer A (12.0.0 reviews): the installers' own last sentence names the Beethoven bridge; the helper is waited for
    D.installHelper.steps.windows[2],
    D.installHelper.steps.mac[2],
    D.installHelper.steps.linux[2],
    String(D.installHelper.stepsNamed.windows('st1234')),
    String(D.installHelper.stepsNamed.mac('st1234')),
    String(D.installHelper.stepsNamed.linux('st1234')),
    D.installHelper.waiting,
    // the browser's key: what the grid did with it, what this browser could not do, the later protection, Forget
    D.signin.wrongGrid,
    D.signin.keyNotTakenTitle,
    D.signin.keyStoreTitle,
    D.signin.keyStore,
    D.protectKey.titleOn,
    D.protectKey.notOff,
    D.settings.protectLaterNote,
    D.settings.forgottenHere,
    D.settings.forgetLocked,
    // the gate's caps, after a Connect on the direct way
    D.gate.names,
    D.gate.hourly,
    // Google Authenticator's own "Enter a setup key"
    D.codeSetup.phoneSteps[3],
    WORDS12.routes.phoneNoKey,
    WORDS12.routes.never,
  ]);

  it("the sentence tables and every fixture keep 12.0.0's machinery off the screen, and key, helper and bridge to the named sentences", () => {
    const tables = [...strings(WORDS, ['details']), ...strings(LOG_WORDS), ...strings(LABELS), ...strings(WORDS12)];
    const shown = [...tables, ...FIXTURES.flatMap((f) => fixtureStrings(f))];
    expect(shown.filter(NEVER)).toEqual([]);
    expect([...new Set(shown.filter((t) => RESTRICTED(t) && !RESTRICTED_OK.has(t)))]).toEqual([]);
    // the list is exactly what it says: each named sentence still has its word, and is still in the tables
    for (const t of RESTRICTED_OK) {
      expect(RESTRICTED(t), t).toBe(true);
      expect(tables, t).toContain(t);
    }
  });
});
