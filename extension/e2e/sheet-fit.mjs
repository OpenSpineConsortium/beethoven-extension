#!/usr/bin/env node
// The grid sign-in sheet at the panel's smallest size (19.0.0): with each phase of the sheet drawn from
// its gallery fixture at 360 x 658, the press (Sign in, or Unlock) and the quiet ways out (Chrome's own
// sign-in box, Not now) end inside the window without scrolling, however long the sentences above them
// run; and a focused password field, with the sentence under it, is never under the foot. Then two runs
// where the caret stays in a field while the sheet changes around it (no focus event comes): Enter in the
// password, the attempt, and the refusal growing under the field (its lockout warning must be read whole
// before the next try); and a problem arriving above the password while it is being typed.
//
//   npm run build:dev                 the development build: only it carries the gallery
//   node e2e/sheet-fit.mjs            every sheet fixture below and the two runs; one PASS or FAIL line each, exit 1 on a FAIL
//   node e2e/sheet-fit.mjs --height 580 j-grid-sheet-type-refused-later     one fixture, no runs
//   (measured at 560, 600, 640 and 658; Chrome's side panel at 1366 x 768 or at 150 % gives about 550 to 640)
//
// The build is served from 127.0.0.1 on a port of its own and drawn in Playwright's Chromium (headless;
// PLAYWRIGHT_DIR, else the scratchpad copy mock-selftest.mjs names), with a stand-in for the extension
// APIs: a fixture page asks for nothing. Nothing here reaches the network.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => (args.includes(n) ? args.splice(args.indexOf(n), 2)[1] : undefined);
const H = Number(flag('--height') ?? 658);
const W = Number(flag('--width') ?? 360);
const DIR = path.resolve(flag('--build') ?? path.join(here, '..', '.output', 'chrome-mv3-dev'));
const NAMES = args.length
  ? args
  : [
      'j-grid-sheet-type',
      'j-grid-sheet-type-later',
      'j-grid-sheet-type-refused-later',
      'j-grid-sheet-type-refused-twice-later',
      'j-grid-sheet-type-held-later',
      'j-grid-sheet-type-replace-saved-later',
      'j-grid-sheet-no-password',
      'j-grid-sheet-not-saved',
      'j-grid-sheet-working-later',
      'j-grid-sheet-unreachable',
      'j-grid-sheet-locked-later',
      'j-grid-sheet-not-unlocked',
    ];

if (!fs.existsSync(path.join(DIR, 'sidepanel.html'))) {
  console.error(`no development build at ${DIR}: run npm run build:dev first`);
  process.exit(2);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.md': 'text/plain' };
const server = http.createServer((req, res) => {
  const p = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = path.join(DIR, p);
  if (!file.startsWith(DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const pwDir = process.env.PLAYWRIGHT_DIR || 'C:/Users/grego/AppData/Local/Temp/claude/c--Users-grego-OneDrive-Desktop-CTSpinoPelvic1K-1/0599380b-0d32-4e19-b5be-65bdd1017566/scratchpad/pw/node_modules/playwright';
const { chromium } = await import(pathToFileURL(path.join(pwDir, 'index.mjs')).href);

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => check('the page draws without an error', false, String(e).slice(0, 200)));
  await page.addInitScript(() => {
    const area = () => ({ get: async () => ({}), set: async () => {}, remove: async () => {}, onChanged: { addListener() {} } });
    const evt = { addListener() {}, removeListener() {} };
    globalThis.chrome = {
      storage: { local: area(), session: area(), onChanged: evt },
      runtime: { id: 'x', getManifest: () => ({ version: '19.0.0', name: 'Beethoven' }), getURL: (p) => new URL(p, location.origin).href, onMessage: evt, connect: () => ({ onMessage: evt, onDisconnect: evt, postMessage() {}, disconnect() {} }), sendMessage: async () => undefined, getPlatformInfo: async () => ({ os: 'win' }) },
      tabs: { create: async () => ({}), getCurrent: async () => undefined },
      windows: { getCurrent: async () => ({ id: 1 }) },
      permissions: { contains: async () => true, request: async () => true },
      sidePanel: { open: async () => {} },
      i18n: { getUILanguage: () => 'en' },
    };
    globalThis.browser = globalThis.chrome;
  });
  for (const n of NAMES) {
    await page.goto(`${base}/sidepanel.html?fixture=${n}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('.m-grid .m-foot', { timeout: 8000 });
    // the moment rises in (420 ms): measure once it has settled
    await page.waitForTimeout(900);
    const m = await page.evaluate(() => {
      const live = (e) => !e.closest('.leaving');
      const all = (s) => Array.from(document.querySelectorAll(s)).filter(live);
      const bottom = (e) => Math.round(e.getBoundingClientRect().bottom);
      const press = all('#grid-signin, #grid-unlock')[0];
      const alts = all('.m-grid .m-alts button');
      return { vh: innerHeight, docH: document.scrollingElement.scrollHeight, press: press ? [press.id, bottom(press)] : null, alts: alts.map((b) => [b.textContent.trim(), bottom(b)]) };
    });
    const over = [...(m.press ? [m.press] : []), ...m.alts].filter(([, b]) => b > m.vh);
    check(`${n} at ${W}x${H}: ${[m.press?.[0], ...m.alts.map(([t]) => t)].filter(Boolean).join(', ')} in view (page ${m.docH} px)`, !!m.press && over.length === 0, over.map(([t, b]) => `${t} ends at ${b}`).join('; ') || (m.press ? '' : 'no press'));
    // the field the caret is in, with the sentence under it, clear of the foot: as the panel drew the
    // fixture (after a refusal it sends the caret to the password), then after a Tab into the password
    // from the top of the page
    const clear = () =>
      page.evaluate(() => {
        const live = (e) => !e.closest('.leaving');
        const foot = Array.from(document.querySelectorAll('.m-grid > .m-foot')).filter(live)[0].getBoundingClientRect();
        const q = document.activeElement?.closest?.('.gs-q');
        // the foot covers only what lies under it while it sticks to the bottom
        const footTop = foot.bottom >= innerHeight - 1 ? Math.round(foot.top) : innerHeight;
        return { active: document.activeElement?.id || document.activeElement?.tagName, footTop, field: q ? Math.round(q.getBoundingClientRect().bottom) : null };
      });
    const drawn = await clear();
    if (drawn.field !== null) check(`${n}: the field the panel put the caret in (${drawn.active}), and its sentence, clear of the foot`, drawn.field <= drawn.footTop, JSON.stringify(drawn));
    if (await page.$('#grid-pass')) {
      await page.evaluate(() => {
        document.activeElement?.blur?.();
        window.scrollTo(0, 0);
      });
      await page.focus('#grid-pass');
      await page.waitForTimeout(400);
      const tabbed = await clear();
      check(`${n}: the password field, focused, and its sentence clear of the foot`, tabbed.field !== null && tabbed.field <= tabbed.footTop, JSON.stringify(tabbed));
    }
  }
  if (!args.length) {
    // the gallery's ?sequence= shows each fixture STEP ms after the last, in one panel (a morph, as a push)
    const STEP = 3000;
    const where = () =>
      page.evaluate(() => {
        const live = (e) => !e.closest('.leaving');
        const foot = Array.from(document.querySelectorAll('.m-grid > .m-foot')).filter(live)[0]?.getBoundingClientRect();
        const q = document.activeElement?.closest?.('.gs-q');
        const note = Array.from(document.querySelectorAll('#grid-pass-note')).filter(live)[0];
        const pass = Array.from(document.querySelectorAll('#grid-pass')).filter(live)[0];
        const footTop = foot && foot.bottom >= innerHeight - 1 ? Math.round(foot.top) : innerHeight;
        // the header sticks to the top as the foot to the bottom
        const headBottom = Math.round(document.querySelector('.hdr-slot')?.getBoundingClientRect().bottom ?? 0);
        return { active: document.activeElement?.id || document.activeElement?.tagName, footTop, headBottom, field: q ? Math.round(q.getBoundingClientRect().bottom) : null, top: q ? Math.round(q.getBoundingClientRect().top) : null, note: note?.textContent ?? '', typed: pass?.value.length ?? 0, problem: Array.from(document.querySelectorAll('.m-grid .m-problem')).some(live) };
      });
    const ready = async (seq) => {
      await page.goto(`${base}/sidepanel.html?sequence=${seq}&step=${STEP}`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForSelector('#grid-pass');
      await page.waitForTimeout(700);
    };

    // Enter in the password: the caret never leaves it through the attempt and the refusal
    await ready('j-grid-sheet-type-later,j-grid-sheet-working-later,j-grid-sheet-type-refused-later');
    await page.fill('#grid-user', 'st1234');
    await page.click('#grid-pass');
    await page.keyboard.type('not-the-password');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#grid-pass-note')).some((n) => !n.closest('.leaving') && n.textContent.length > 0), null, { timeout: STEP * 3 });
    await page.waitForTimeout(300);
    const refused = await where();
    check(`Enter in the password at ${W}x${H}, then the refusal: the caret still in the password, the whole warning under it clear of the foot`, refused.active === 'grid-pass' && refused.field !== null && refused.field <= refused.footTop && refused.top >= refused.headBottom, JSON.stringify(refused));

    // a problem arrives above the password while it is being typed: the field, and what is typed, stay in view
    await ready('j-grid-sheet-type,j-grid-sheet-unreachable');
    await page.click('#grid-pass');
    await page.keyboard.type('half');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.m-grid .m-problem')).some((p) => !p.closest('.leaving')), null, { timeout: STEP * 2 });
    await page.waitForTimeout(300);
    const pushed = await where();
    check(`a problem above the password at ${W}x${H} while it is typed: the field clear of the foot, the typing kept`, pushed.active === 'grid-pass' && pushed.typed === 4 && pushed.field !== null && pushed.field <= pushed.footTop && pushed.top >= pushed.headBottom, JSON.stringify(pushed));
  }
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `\n${failed} FAIL` : '\nall PASS');
process.exit(failed ? 1 : 0);
