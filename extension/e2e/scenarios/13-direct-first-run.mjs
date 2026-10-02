// Scenario 13 (12.0.0): the first run on the direct way, then the returning run, the door unreachable, and
// Forget this computer. Against the local grid stand-in (lib/direct.mjs), never the grid.
//
//   welcome (the four prerequisites with their QR codes, decoded from the picture) -> Use another portal (the
//   mock, for the agreement's grant and the approval stand-in) -> Agree -> the helper moment: the bundled
//   download, "Check again" before the install (not found), the install from the downloaded zip, "Check
//   again" (Helper found.) -> the sheet: "nocode" (the grid's "wrong code, or no 2FA" refusal -> "The grid
//   didn't accept the code" -> "I don't have a grid code yet" -> the route choice -> the phone route's QR
//   codes, decoded -> I've set up my code) -> st1234 with three wrong passwords (stopped: "Use GlobalProtect
//   instead" first, "Try again at <time>" not pressable; the cooldown's end simulated by clearing the
//   refusal count in storage.session) -> Cancel, st1234 with the password and the code -> "This computer is set up."
//   -> the key line on the server, restricted to the gate -> the protection card: Not now -> where your work
//   goes -> Connect (the Claude sitting in the held password session) -> the Claude sign-in -> in line ->
//   got a computer -> online -> the home with Grid "Direct" -> Stop -> Connect again (through the gate,
//   --login never) -> online. Then a browser restart (no prompt), the door down and back, and Forget.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { claudeSignIn, expectWords, gotComputer, inLine, moment, online, setup, step, Stop, teardown, useAnotherPortal, welcomePage, ACCOUNT } from '../lib/flows.mjs';
import { addAuthenticator, decodeQr, FINAL, Grid, GRID_CODE, GRID_PASSWORD, guardHits, hostKeyPresent, installHelperFromZip, pressSel, removeHostKey, SHARED_TEST, SSH_PORT, TEST_EXT, traceKeys, openSettings, typeInto, waitDownload, watchDownloads } from '../lib/direct.mjs';
import { Browser, sleep } from '../lib/harness.mjs';
import { withAllowedOrigins } from '../../src/core/bridgeZip.ts';
import { AFFIRMATION, loose, STATEMENT_TICK, WORDS } from '../lib/words.mjs';

const W = WORDS.direct;
const FOUND_HOLD_NOTE = '1.2 s, steps.ts FOUND_HOLD_MS';
// a code carries a Wayne State article in its short form (routes.ts qrUrl); either form is the same page
const KB20242 = /^https:\/\/services\.wayne\.edu\/TDClient\/277\/Portal\/KB\/(Article\/20242\/|ArticleDet\?ID=20242$)/;
const KB20314 = /^https:\/\/services\.wayne\.edu\/TDClient\/277\/Portal\/KB\/(Article\/20314\/|ArticleDet\?ID=20314$)/;
const GP_IOS = 'https://apps.apple.com/app/globalprotect/id1400555706';
const GP_ANDROID = 'https://play.google.com/store/apps/details?id=com.paloaltonetworks.globalprotect';
const STORE = /^https:\/\/(apps\.apple\.com|play\.google\.com)\//;

export const MOCK_ARGS = ['--auth', 'basic', '--shared-install', SHARED_TEST];

/** every QR code on a surface: each square SVG/canvas brought into view, the view pictured and decoded; then each other tab of a QR group pressed and the same again */
export async function qrCodesOn(h, surface, label) {
  const dir = path.join(h.run.dir, `qr-${label}`);
  fs.mkdirSync(dir, { recursive: true });
  const isPage = surface.kind === 'page';
  const found = [];
  let n = 0;
  const shoot = async (tag) => {
    const count = await surface.eval(`() => { window.__qr = [...document.querySelectorAll('svg, canvas, img')].filter((e) => { const r = e.getBoundingClientRect(); return r.width >= 60 && Math.abs(r.width - r.height) < 6 && getComputedStyle(e).visibility !== 'hidden'; }); return window.__qr.length; }`);
    const files = [];
    for (let i = 0; i < count; i++) {
      await surface.eval(`(i) => window.__qr[i].scrollIntoView({ block: 'center', inline: 'nearest' })`, i);
      await sleep(150);
      const f = path.join(dir, `${tag}-${String(++n).padStart(2, '0')}.png`);
      try {
        if (isPage) await surface.h.screenshot({ path: f, scale: 'device' });
        else {
          const r = await surface.h.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
        }
        files.push(f);
      } catch (e) {
        h.run.ev('QR', `no picture for code ${i}: ${e.message}`);
      }
    }
    if (!files.length) return;
    const dec = decodeQr(files);
    for (const f of files) for (const t of dec[f] ?? []) if (!found.includes(t)) found.push(t);
  };
  await shoot('a');
  // the groups with more than one code (iPhone / Android): press each other tab, then picture again
  const tabs = await surface.eval(`() => [...document.querySelectorAll('[role=tab]')].map((e, i) => ({ i, name: (e.innerText || e.getAttribute('aria-label') || '').trim(), sel: e.getAttribute('aria-selected') }))`);
  for (const t of tabs.filter((x) => x.sel !== 'true')) {
    // a person's press on the tab (found by its name among the tabs; the first one of that name not yet selected)
    await surface.eval(`(i) => [...document.querySelectorAll('[role=tab]')][i].scrollIntoView({ block: 'center' })`, t.i);
    await sleep(200);
    const pos = await surface.eval(`(i) => { const e = [...document.querySelectorAll('[role=tab]')][i]; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }`, t.i);
    await surface.clickAt(pos.x, pos.y);
    await sleep(500);
    const now = await surface.eval(`(i) => [...document.querySelectorAll('[role=tab]')][i]?.getAttribute('aria-selected')`, t.i);
    h.run.ev('QR', `pressed the "${t.name}" tab: aria-selected ${now}`);
    await shoot(`tab${t.i}`);
  }
  await surface.eval(`() => window.scrollTo(0, 0)`).catch(() => {});
  fs.writeFileSync(path.join(dir, 'decoded.json'), JSON.stringify({ found, tabs }, null, 1));
  h.run.ev('QR', `${label}: ${found.length} decoded: ${found.join(' | ')}`);
  return found;
}

/** the student's helper: the panel's download link, the zip saved, then Check again before and after the install */
export async function helperMoment(h, grid, { install = true } = {}) {
  const p = h.br.panel;
  await step(h, 'the helper moment', async () => {
    const t = await p.waitText(W.installHelper.title, 60_000);
    if (!t) throw new Error(`no "${W.installHelper.title}" within 60 s`);
    const m = await moment(h, 'helper moment');
    expectWords(h, 'install-helper', m.panel, [W.installHelper.title, W.installHelper.body, W.installHelper.unsignedNote, W.installHelper.download('Windows'), /beethoven-bridge-windows\.zip · \d+ KB/, W.installHelper.useVpn('GlobalProtect')]);
  });
  await step(h, 'the bundled download', async () => {
    await p.press(W.installHelper.download('Windows'));
    const d = await waitDownload(h.br, /beethoven-bridge-windows\.zip$/, 20_000);
    if (!d?.file) throw new Error(`no download completed: ${JSON.stringify(h.br.downloads)}`);
    const bytes = fs.readFileSync(d.file);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    // the page made it out to this extension: the package's own zip with allowed_origins.json naming exactly
    // chrome-extension://<this id>/, every other entry byte for byte (core/bridgeZip.ts, ui/helperFile.ts)
    const packaged = new Uint8Array(fs.readFileSync(path.join(TEST_EXT, 'bridge', 'beethoven-bridge-windows.zip')));
    const expected = Buffer.from(withAllowedOrigins(packaged, `chrome-extension://${h.br.extId}/`));
    h.run.check("the download is this extension's own copy of the package's zip (made in the page; nothing fetched from anywhere else)", d.url.startsWith(`blob:chrome-extension://${h.br.extId}/`) && bytes.equals(expected), `${d.url} ${bytes.length} ${sha.slice(0, 16)}`);
    h.run.check('the packaged zip itself still carries the placeholder (only the saved copy names this extension)', /REPLACE_WITH_EXTENSION_ID/.test(Buffer.from(packaged).toString('latin1')) && !/REPLACE_WITH_EXTENSION_ID/.test(bytes.toString('latin1')) && bytes.toString('latin1').includes(`chrome-extension://${h.br.extId}/`));
    h.zip = d.file;
    await sleep(600);
    const m = await moment(h, 'helper downloaded, the steps');
    expectWords(h, 'install-helper after the download', m.panel, [...W.installHelper.stepsNamed.windows('install.cmd'), W.installHelper.osNote.windows, W.installHelper.checkAgain, W.installHelper.useVpn('GlobalProtect')]);
    // right after the download Beethoven looks by itself: waiting, not "Not found yet", and Check again can be pressed
    const tx = (await p.text().catch(() => '')) ?? '';
    h.run.check(`right after the download: "${W.installHelper.waiting}", not "${W.installHelper.notFound}"`, tx.includes(W.installHelper.waiting) && !tx.includes(W.installHelper.notFound), tx.slice(0, 200));
  });
  await step(h, 'Check again before the install', async () => {
    await p.press(W.installHelper.checkAgain);
    const t = await p.waitText(W.installHelper.notFound, 20_000);
    h.run.check(`"Check again" before the install: "${W.installHelper.notFound}"`, !!t);
    await moment(h, 'helper not found yet');
  });
  if (!install) return;
  await step(h, 'install from the downloaded zip, then Check again', async () => {
    // the installer runs while the harness watches the panel (the panel looks by itself every 3 s)
    const installing = installHelperFromZip(h.run, h.zip, { port: SSH_PORT });
    let r;
    void installing.then((x) => (r = x));
    // the panel looks again by itself every few seconds while this moment is up ("Looking for the helper…", Check again
    // disabled meanwhile); press Check again as soon as it can be pressed, unless the helper was found first
    const t0 = Date.now();
    const timeline = [];
    let pressed = false;
    let found = false;
    let last = '';
    while (Date.now() - t0 < 60_000) {
      const tx = (await p.text().catch(() => '')) ?? '';
      const state = tx.includes(W.installHelper.found) ? 'found' : tx.includes(W.signin.title) ? 'sheet' : tx.includes(W.installHelper.checking) ? 'looking' : tx.includes(W.installHelper.notFound) ? 'not-found' : tx.includes(W.installHelper.broken) ? 'broken' : 'other';
      if (state !== last) {
        timeline.push(`${Date.now() - t0} ms ${state}`);
        last = state;
        if (state === 'found' && !found) {
          found = true;
          await moment(h, 'helper found');
        }
      }
      if (state === 'sheet') break;
      if (!pressed && state !== 'found') {
        const b = await p.find(W.installHelper.checkAgain).catch(() => null);
        if (b?.visible && !b.disabled) {
          await p.clickAt(b.x, b.y);
          pressed = true;
          timeline.push(`${Date.now() - t0} ms pressed Check again`);
        }
      }
      await sleep(120);
    }
    r = r ?? (await installing);
    h.run.check('install.cmd from the downloaded zip: exit 0, its own check got a hello', r.code === 0 && /is installed/.test(r.out), r.out.trim().split(/\r?\n/).slice(-1)[0]);
    h.run.check('registered for the TEST browser only (HKCU\\Software\\Chromium\\NativeMessagingHosts)', hostKeyPresent());
    h.run.ev('HELPER', `from the installer's start: ${timeline.join(' -> ')}`);
    h.run.check(`after the install the panel finds the helper by itself or on "Check again" and moves to the sheet ("${W.installHelper.found}" seen: ${found})`, last === 'sheet', timeline.join(' -> '));
    // the panel looks every 3 s while the installer runs, so it may have found the helper (and shown "Helper found." for
    // FOUND_HOLD_MS) before install.cmd returned: then the sheet is already up here, which is not a failure
    if (!found) h.run.note(`"${W.installHelper.found}" was not seen after install.cmd returned (${timeline.join(' -> ')}): the panel found the helper while the installer was still running`);
  });
}

export async function sheetAccount(h, account, { expectWhy = true } = {}) {
  const p = h.br.panel;
  const t = await p.waitText(W.signin.title, 30_000);
  if (!t) throw new Error(`no "${W.signin.title}" within 30 s`);
  await p.waitFind(/[\s\S]*/, 15_000, { selector: '#sheet-account' });
  const m = await moment(h, `sheet account ${account}`);
  expectWords(h, 'the sheet (AccessID)', m.panel, [W.signin.title, W.signin.accountLabel, W.signin.privacy, ...(expectWhy ? [W.settings.protectKey] : [])]);
  await typeInto(p, '#sheet-account', account);
  await pressSel(p, '#sheet-submit');
  h.presses.push(`panel: AccessID ${account}, Continue`);
}

/** one prompt of the grid's: wait for it, check the grid's words are shown verbatim, answer it */
export async function sheetAnswer(h, kind, answer, { shot } = {}) {
  const p = h.br.panel;
  const want = kind === 'password' ? 'Password:' : 'Your google authenticator one-time verification code:';
  const t = await p.waitText(want, 30_000);
  if (!t) throw new Error(`no grid prompt "${want}" within 30 s`);
  await p.waitFind(/[\s\S]*/, 10_000, { selector: '#sheet-p0' });
  if (shot) await moment(h, shot);
  const type = await p.eval(`() => document.querySelector('#sheet-p0')?.type`);
  if (kind === 'password') h.run.check('the password field is masked (type=password), autocomplete off, in no form', type === 'password' && (await p.eval(`() => { const e = document.querySelector('#sheet-p0'); return e.autocomplete === 'off' && !e.form && !e.name; }`)));
  await typeInto(p, '#sheet-p0', answer);
  await pressSel(p, '#sheet-submit');
  h.presses.push(`panel: ${kind}, Continue`);
  // the field is emptied as the answer is sent, and the answer is nowhere in the page
  await sleep(300);
  const leak = await p.eval(`(a) => document.documentElement.outerHTML.includes(a) || [...document.querySelectorAll('input')].some((e) => e.value === a)`, answer);
  h.run.check(`the ${kind} is not left in the page after it is sent`, !leak);
}

/** "This computer is set up." moves on by itself after ENROLLED_HOLD_MS (4 s): press Continue only while it is up */
export async function continueAfterEnrolled(h) {
  const p = h.br.panel;
  const t = (await p.text().catch(() => '')) ?? '';
  const c = await p.find(W.enrolled.continue).catch(() => null);
  if (t.includes(W.enrolled.title) && c?.visible) {
    await p.clickAt(c.x, c.y);
    h.run.ev('PRESS', 'panel: "Continue" (enrolled)');
  } else h.run.note('"This computer is set up." had already moved on by itself (held 4 s) before Continue was pressed');
}

export async function enrolled(h, grid) {
  const p = h.br.panel;
  const t = await p.waitText(W.enrolled.title, 60_000);
  if (!t) throw new Error(`no "${W.enrolled.title}" within 60 s`);
  const m = await moment(h, 'enrolled');
  expectWords(h, 'enrolled', m.panel, [W.enrolled.title, W.enrolled.body]);
  const ak = grid.authorizedKeys();
  const line = ak.split('\n').find((l) => /beethoven-browser/.test(l)) ?? '';
  fs.writeFileSync(path.join(h.run.dir, 'authorized_keys-after-enrolment.txt'), ak);
  const re = new RegExp(`^restrict,command="${SHARED_TEST.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/bin/hpcworker gate" (ecdsa-sha2-nistp256|ssh-ed25519) [A-Za-z0-9+/=]+ beethoven-browser \\d{4}-\\d{2}-\\d{2}$`);
  h.run.check('the key line is on the server, restricted to the gate (restrict,command="<shared copy>/bin/hpcworker gate" <type> <key> beethoven-browser <date>)', re.test(line), line.slice(0, 160));
  h.run.check('it is the only line in authorized_keys', ak.trim().split('\n').length === 1, `${ak.trim().split('\n').length} lines`);
  const log = grid.log();
  const add = log.find((e) => e.event === 'session' && /browser-key add/.test(e.original_command ?? ''));
  h.run.check('browser-key add ran in the password+code session (with a pty), not through a key', !!add && add.auth === 'password+code' && add.pty === true, JSON.stringify(add)?.slice(0, 200));
  const ver = log.filter((e) => e.event === 'session' && e.auth === 'publickey');
  h.run.check('then a second connection with the new key ran the gate (forced command) for version', ver.some((e) => e.original_command === 'version' && /\/bin\/hpcworker gate$/.test(e.forced ?? '')), JSON.stringify(ver[0])?.slice(0, 200));
  return line;
}

export default async function directFirstRun(opts = {}) {
  const grid = new Grid({ ev: () => {}, dir: FINAL }, { queueS: Number(process.env.E2E_QUEUE_S || 45), startS: Number(process.env.E2E_START_S || 75) });
  const h = await setup('13-direct-first-run', {
    title: '12.0.0 first run on the direct way (local grid stand-in), returning, unreachable, Forget',
    mockArgs: MOCK_ARGS,
    mockEnv: { MOCK_LOGGED_IN: 'false' },
    browser: { ...opts.browser, ext: TEST_EXT },
  });
  grid.run = h.run;
  h.grid = grid;
  try {
    removeHostKey(h.run);
    grid.setup();
    await grid.start();
    const info = JSON.parse(fs.readFileSync(path.join(FINAL, 'ext-info.json'), 'utf8'));
    h.run.check('the test package\'s id is the one its bridge zips name', h.br.extId === info.id, `${h.br.extId} vs ${info.id}`);
    h.run.check('the test package\'s pin is the stand-in\'s host key', info.fingerprint === grid.fingerprint, `${info.fingerprint} vs ${grid.fingerprint}`);
    await watchDownloads(h.br, path.join(FINAL, 'student', 'Downloads'));
    traceKeys(h.br);

    // ---- welcome: the four prerequisites with their QR codes
    await welcomePage(h);
    await step(h, 'welcome (12.0.0): prerequisites and QR codes', async () => {
      const m = await moment(h, 'welcome', { page: h.welcomePage });
      const shot = path.join(h.run.dir, 'welcome-full.png');
      await h.welcomePage.screenshot({ path: shot, fullPage: true });
      h.run.check('nothing has left this computer before the agreement', h.br.requests.length === 0, h.br.requests.map((r) => r.url).join(' '));
      const links = await h.welcomePage.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href));
      h.run.check('welcome: KB 20314 (GlobalProtect for computers) is the GlobalProtect need\'s link', links.some((u) => KB20314.test(u)), links.filter((u) => /wayne/.test(u)).join(' | '));
      // the phone route opened on the welcome page: its square codes, each tab of each group pressed (iPhone, Android)
      await h.welcome.press(new RegExp(`^${W.chooseRoute.phone.title}`));
      await sleep(800);
      const m2 = await moment(h, 'welcome, the phone route open', { page: h.welcomePage });
      // each group shows one code at a time (iPhone first): the addresses printed before and after its tabs are pressed
      const page1 = await h.welcomePage.evaluate(() => document.body.innerText);
      const codes = await qrCodesOn(h, h.welcome, 'welcome');
      h.qrWelcome = codes;
      h.run.check('welcome QR (phone route): KB 20242 (Google Authenticator for the grid)', codes.some((u) => KB20242.test(u)), codes.join(' | '));
      h.run.check('welcome QR (phone route): the GlobalProtect app in both stores (the iPhone tab and the Android tab both switch)', codes.includes(GP_IOS) && codes.includes(GP_ANDROID), codes.join(' | '));
      h.run.check('welcome QR (phone route): the Google Authenticator app-store pages', codes.some((u) => /apps\.apple\.com\/app\/google-authenticator/.test(u)) && codes.some((u) => /authenticator2/.test(u)), codes.join(' | '));
      h.run.check('every welcome QR code is https and goes only to Wayne State or an app store', codes.length > 0 && codes.every((u) => KB20242.test(u) || KB20314.test(u) || STORE.test(u) || /^https:\/\/(services\.wayne\.edu|ondemand\.grid\.wayne\.edu)\//.test(u)), codes.join(' | '));
      // every code decoded is also written under it
      const page2 = await h.welcomePage.evaluate(() => document.body.innerText);
      const printed = `${page1}\n${page2}`;
      const missing = codes.filter((u) => !printed.includes(u.replace(/^https:\/\//, '').slice(0, 30)));
      h.run.check('each decoded address is printed under its code', missing.length === 0, missing.join(' | '));
      void m2;
    });
    await useAnotherPortal(h);
    await step(h, 'tick and Agree and continue', async () => {
      await h.welcome.press(loose(AFFIRMATION.bold));
      h.br.acceptedAt = Date.now();
      const promptsBefore = h.br.prompts.length;
      await h.welcome.press(WORDS.welcome.agree);
      h.presses.push('welcome: tick, Agree and continue');
      const panel = await h.br.sidePanel(8000);
      h.run.check('the panel opens for the window from the one press', !!panel);
      if (!panel) await h.br.panelInTab();
      const t0 = Date.now();
      while (h.br.prompts.length === promptsBefore && Date.now() - t0 < 8000) await sleep(200);
      const pr = h.br.prompts.slice(promptsBefore)[0];
      h.run.check("Chrome's permission prompt for the one portal (the fallback's), answered Allow", !!pr && /pressed Allow/.test(pr.action), pr ? `${pr.text} / ${pr.action}` : 'no prompt');
    });
    await moment(h, 'after agree');

    // ---- the helper
    await helperMoment(h, grid);

    // ---- the sheet: nocode -> the 2FA refusal -> the route choice
    await step(h, 'the sheet: an account without a grid code', async () => {
      await sheetAccount(h, 'nocode');
      await sheetAnswer(h, 'password', GRID_PASSWORD, { shot: 'sheet password prompt (nocode)' });
      const r = await h.br.panel.waitText(W.signin.codeRefusedTitle, 30_000);
      h.run.check(`the grid's "wrong code, or no 2FA" refusal is never taken for "no code": "${W.signin.codeRefusedTitle}" with "${W.signin.codeAgain}" and "${W.signin.noCode}"`, !!r && r.includes(W.signin.codeAgain) && r.includes(W.signin.noCode), (r ?? '').slice(0, 300));
      const mr = await moment(h, 'the code not accepted (nocode)');
      h.run.check('the refusal text itself is not shown to the student', !/You either typed in the wrong code/.test(mr.panel ?? ''));
      await h.br.panel.press(W.signin.noCode);
      h.presses.push(`panel: ${W.signin.noCode}`);
      const t = await h.br.panel.waitText(W.chooseRoute.title, 30_000);
      h.run.check(`"${W.signin.noCode}": the route choice "${W.chooseRoute.title}"`, !!t);
      const m = await moment(h, 'route choice (no grid code yet)');
      expectWords(h, 'choose-route', m.panel, [W.chooseRoute.title, W.chooseRoute.body, W.chooseRoute.laptop.title, W.chooseRoute.phone.title, W.codeSetup.warning]);
      h.run.check('the refusal text itself is not shown to the student', !/You either typed in the wrong code/.test(m.panel ?? ''));
    });
    await step(h, 'the phone route with its QR codes', async () => {
      // the route card is one button: its name is the whole card (title, detail, "Use my phone")
      await h.br.panel.press(new RegExp(`^${W.chooseRoute.phone.title}[\\s\\S]*${W.chooseRoute.phone.button}$`));
      const t = await h.br.panel.waitText(W.codeSetup.phoneTitle, 10_000);
      if (!t) throw new Error(`no "${W.codeSetup.phoneTitle}"`);
      const m = await moment(h, 'code setup, phone route');
      expectWords(h, 'code-setup phone', m.panel, [W.codeSetup.phoneTitle, ...W.codeSetup.phoneSteps, W.codeSetup.warning, W.codeSetup.done]);
      const codes = await qrCodesOn(h, h.br.panel, 'phone-route');
      h.qrPhone = codes;
      h.run.check('phone route QR: the GlobalProtect app in both stores (id1400555706, com.paloaltonetworks.globalprotect)', codes.includes(GP_IOS) && codes.includes(GP_ANDROID), codes.join(' | '));
      h.run.check('phone route QR: Google Authenticator store pages', codes.some((u) => /apps\.apple\.com.*google-authenticator|apps\.apple\.com\/app\/google-authenticator/.test(u) || /authenticator/i.test(u)), codes.join(' | '));
      h.run.check('phone route QR: KB 20242 (the grid\'s code instructions)', codes.some((u) => KB20242.test(u)), codes.join(' | '));
      await h.br.panel.press(W.codeSetup.done);
      await sleep(1200);
      await moment(h, "after I've set up my code");
    });

    // ---- st1234: three wrong passwords
    await step(h, 'three refusals', async () => {
      // "I've set up my code" signs in again as the same AccessID (nocode): "Change" brings back the field
      const pw = await h.br.panel.waitText('Password:', 20_000);
      h.run.check("after \"I've set up my code\" the sheet signs in again as the same AccessID", !!pw && /nocode/.test(pw));
      await h.br.panel.press(/^Change$/);
      await sleep(600);
      await sheetAccount(h, ACCOUNT, { expectWhy: false });
      await sheetAnswer(h, 'password', 'wrong-one', { shot: 'sheet password prompt' });
      const n1 = await h.br.panel.waitText(W.signin.notAccepted, 20_000);
      h.run.check(`a refusal: "${W.signin.notAccepted}" above the grid's prompt`, !!n1);
      await moment(h, 'not accepted, asked again');
      await sheetAnswer(h, 'password', 'wrong-two');
      await sleep(800);
      await sheetAnswer(h, 'password', 'wrong-three');
      const t = await h.br.panel.waitText(W.signin.stoppedTitle, 20_000);
      h.run.check(`three refusals: "${W.signin.stoppedTitle}" with "Use GlobalProtect instead" first and "Try again at <time>" (not a button) until the cooldown has passed`, !!t && /Use GlobalProtect instead/.test(t) && /Try again at \d/.test(t));
      const again = await h.br.panel.find(/^Try again/).catch(() => null);
      h.run.check('during the cooldown there is no Try again button to press', !again?.visible, JSON.stringify(again)?.slice(0, 160));
      await moment(h, 'stopped after three refusals');
      const kb = grid.log().filter((e) => e.event === 'kbdint-password' && e.user === ACCOUNT && e.accepted === false).length;
      h.run.check('the server saw exactly three refused passwords for st1234 and Beethoven stopped', kb === 3, `${kb}`);
    });

    // ---- the real sign-in
    await step(h, 'sign in with the password and the code', async () => {
      // the same AccessID straight away is refused without asking the grid (the core keeps the count per account)
      const before = grid.log().length;
      await h.br.panel.press(W.signin.cancel);
      await sleep(600);
      await sheetAccount(h, ACCOUNT, { expectWhy: false });
      const again = await h.br.panel.waitText(W.signin.stoppedTitle, 20_000);
      h.run.check('a new sign-in for st1234 during the cooldown stops again and nothing reaches the server', !!again && !grid.log().slice(before).some((e) => /^(connect|kbdint)/.test(e.event)), grid.log().slice(before).map((e) => e.event).join(','));
      // the cooldown's end, simulated (verification only): the refusal count kept in storage.session is cleared
      await h.br.bg(async () => chrome.storage.session.remove('bridge.refusals'));
      h.run.note('the 15-minute cooldown was not waited out: its end was simulated by clearing storage.session "bridge.refusals"');
      await h.br.panel.press(W.signin.cancel);
      await sleep(600);
      await sheetAccount(h, ACCOUNT, { expectWhy: false });
      await sheetAnswer(h, 'password', GRID_PASSWORD);
      await sheetAnswer(h, 'code', GRID_CODE, { shot: 'sheet code prompt' });
      h.acceptedAt = Date.now();
      const s = await h.br.panel.waitText(new RegExp(`${W.signin.settingUp}|${W.signin.checking}|${W.enrolled.title.replace('.', '\\.')}`), 30_000);
      if (s && !s.includes(W.enrolled.title)) await moment(h, 'setting up this computer');
    });
    await step(h, 'enrolled', async () => enrolled(h, grid));
    // the approval check went only after the grid accepted
    const checks = h.br.requests.filter((r) => /\/beethoven\/access_check$/.test(r.url) && r.method === 'POST');
    const codeOk = grid.log().find((e) => e.event === 'kbdint-code' && e.accepted);
    const first = checks[0];
    h.run.check('the approval check was sent only after the grid accepted the sign-in', !!first && !!codeOk && Date.parse(first.t) >= Date.parse(codeOk.t), `${first?.t} vs ${codeOk?.t}`);
    const body = first?.body ? JSON.parse(first.body) : undefined;
    h.run.check('the approval check carries only v, access_id, portal, product, version, install_id (no new field)', !!body && JSON.stringify(Object.keys(body).sort()) === JSON.stringify(['access_id', 'install_id', 'portal', 'product', 'v', 'version']) && body.access_id === ACCOUNT, first?.body);

    await step(h, 'Continue, then the protection card', async () => {
      await continueAfterEnrolled(h);
      const t = await h.br.panel.waitText(W.protectKey.title, 15_000);
      h.run.check(`the optional protection card: "${W.protectKey.title}", off unless chosen`, !!t);
      const m = await moment(h, 'protect key card');
      expectWords(h, 'protect-key-optional', m.panel, [W.protectKey.title, W.protectKey.body, W.protectKey.on, W.protectKey.notNow]);
      await h.br.panel.press(W.protectKey.notNow);
      h.presses.push('panel: Not now');
    });

    // ---- Where your work goes, Connect, the Claude sitting in the held password session
    await step(h, 'where your work goes, Connect', async () => {
      const p = h.br.panel;
      const t = await p.waitText(WORDS.statement.title, 30_000);
      if (!t) throw new Error(`no "${WORDS.statement.title}"`);
      await moment(h, 'where your work goes');
      await p.press(loose(STATEMENT_TICK));
      await p.press(WORDS.statement.connect);
      h.presses.push('panel: tick, Connect');
      const a = await p.waitText(new RegExp(`${WORDS.connect.hero}|${W.signin.signingInClaude}|${WORDS.claude.title}`), 15_000);
      h.run.check('Connect answers at once', !!a);
      await moment(h, 'connect pressed');
    });
    await claudeSignIn(h);
    await step(h, 'the Claude sitting ran in the held password session', async () => {
      const log = grid.log();
      const sit = log.find((e) => e.event === 'session' && /hpcworker' connect /.test(e.original_command ?? ''));
      h.run.check('connect ran in the password+code session (no second sign-in), with a pty, --login auto', !!sit && sit.auth === 'password+code' && sit.pty && /--login '?(auto|always|fresh)/.test(sit.original_command), JSON.stringify(sit)?.slice(0, 260));
      const kb = log.filter((e) => e.event === 'kbdint-code' && e.accepted).length;
      h.run.check('the student typed the password and code once only', kb === 1, `${kb} code sign-ins`);
    });
    await inLine(h, { tour: false });
    await gotComputer(h);
    await online(h);
    await step(h, 'the home with Grid "Direct"', async () => {
      const p = h.br.panel;
      await p.waitText(/Grid/, 20_000);
      await sleep(1500);
      const m = await moment(h, 'home');
      h.run.check(`the home's Grid row: "${W.rowDirect}" beside the account`, new RegExp(`Signed in as ${ACCOUNT}[\\s\\S]{0,40}${W.rowDirect}|${W.rowDirect}[\\s\\S]{0,40}Signed in as ${ACCOUNT}`).test(m.panel ?? ''), (m.panel ?? '').slice(0, 300));
      const keyRuns = grid.log().filter((e) => e.event === 'session' && e.auth === 'publickey');
      h.run.check('reads of the worker went through the gate with the key (status / read / version), never a pty', keyRuns.length > 0 && keyRuns.every((e) => /\/bin\/hpcworker gate$/.test(e.forced ?? '') && !e.pty), keyRuns.map((e) => e.original_command).join(' | ').slice(0, 300));
    });
    await step(h, 'Stop, then Connect through the gate', async () => {
      const p = h.br.panel;
      await p.press(WORDS.home.stop);
      await p.waitText(WORDS.home.confirm, 5000);
      await p.press(WORDS.home.confirmStop, { last: true });
      const t = await p.waitText(WORDS.home.stoppedSub, 150_000);
      h.run.check('Stop: "Stopped" (worker stop through the gate)', !!t && grid.log().some((e) => e.event === 'session' && /^stop /.test(e.original_command ?? '') && e.auth === 'publickey'));
      await moment(h, 'stopped');
      const before = grid.calls().filter((c) => /^srun /.test(c)).length;
      await p.press(WORDS.home.connect);
      const on = await p.waitText(new RegExp(`${WORDS.online.hero.replace('.', '\\.')}|Online · checked`), 240_000);
      h.run.check('Connect again: online with no Claude sign-in and no sheet', !!on);
      const gc = grid.log().filter((e) => e.event === 'session' && /^connect /.test(e.original_command ?? ''));
      h.run.check('that Connect went through the gate with the key (connect NAME SITE ... ), and the gate ran no srun (--login never)', gc.some((e) => e.auth === 'publickey' && /\/bin\/hpcworker gate$/.test(e.forced ?? '')) && grid.calls().filter((c) => /^srun /.test(c)).length === before, gc.map((e) => `${e.auth}: ${e.original_command}`).join(' | '));
      await moment(h, 'online again through the gate');
    });

    // ---- (b) the returning run: a browser restart, no prompt
    await step(h, 'browser restart', async () => {
      grid.save('-before-restart');
      await h.br.close();
      const nb = new Browser(h.run, { mock: h.mock, portalHost: h.br.portalHost, ext: TEST_EXT, profile: h.br.profile });
      await nb.launch({ keepProfile: true });
      nb.watchPrompts('Allow');
      h.br = nb;
      traceKeys(nb);
      const n0 = grid.log().length;
      await sleep(2500);
      await nb.newPage('about:blank'); // a tab that keeps the window (and the toolbar's tab target) once the welcome tab is closed
      for (const pg of nb.pages()) if (/\/options\.html/.test(pg.url())) await pg.close().catch(() => {}); // the unpacked reinstall's welcome tab (harness artifact)
      await nb.clickToolbar();
      if (!(await nb.sidePanel(8000))) await nb.panelInTab();
      const t = await nb.panel.waitText(new RegExp(`Signed in as ${ACCOUNT}`), 60_000);
      await sleep(2000);
      const m = await moment(h, 'returning after restart');
      h.run.check('after the restart: the home, no sheet, no prompt', !!t && !/Password:|AccessID/.test(m.panel ?? ''));
      h.run.check(`after the restart: Grid "${W.rowDirect}"`, (m.panel ?? '').includes(W.rowDirect));
      const after = grid.log().slice(n0);
      h.run.check('after the restart only key sessions reached the server (nothing typed)', after.filter((e) => /^kbdint/.test(e.event)).length === 0 && after.some((e) => e.event === 'publickey-match'), after.map((e) => e.event).join(','));
    });

    // ---- (e) the door unreachable, then back
    await step(h, 'the ssh door unreachable', async () => {
      await grid.stop();
      await h.br.clickToolbar(); // close
      await sleep(800);
      await h.br.clickToolbar(); // open again: a fresh look at the grid
      if (!(await h.br.sidePanel(8000))) await h.br.panelInTab();
      const t = await h.br.panel.waitText(new RegExp(`${W.unreachableSub}|${W.signin.unreachable}|Can't reach the grid`), 120_000);
      h.run.check('the door down: the panel says it cannot reach the grid directly (worker keeps running)', !!t);
      await moment(h, 'door unreachable');
      await grid.start();
      const back = await h.br.panel.waitText(new RegExp(`Signed in as ${ACCOUNT}`), 150_000);
      h.run.check('the door back: Grid signed in again by itself', !!back);
      await moment(h, 'door back');
    });

    // ---- (c) Forget this computer
    await step(h, 'Forget this computer', async () => {
      const { page, surface: sp } = await openSettings(h);
      const m0 = await moment(h, 'settings connection', { page });
      expectWords(h, 'Settings: Connection', m0.page, [W.settings.title.toUpperCase(), W.settings.modes.direct, W.settings.modes.vpn, W.settings.protectKey, W.settings.helper, W.settings.forget]);
      await sp.press(W.settings.forget);
      await sp.waitText(W.settings.forgetConfirm, 5000);
      await moment(h, 'forget confirm', { page });
      await sp.press(W.settings.forgetButton, { last: true });
      const done = await sp.waitText(W.settings.forgotten, 60_000);
      h.run.check(`Forget: "${W.settings.forgotten}"`, !!done);
      await moment(h, 'forgotten', { page });
      const ak = grid.authorizedKeys();
      h.run.check('Forget removed the line from the server\'s authorized_keys', !/beethoven-browser/.test(ak), ak.slice(0, 120));
      h.run.check('Forget went through the gate (forget)', grid.log().some((e) => e.event === 'session' && e.original_command === 'forget' && e.auth === 'publickey'));
      const st = await h.br.bg(async () => {
        const dbs = await indexedDB.databases();
        return { dbs, direct: (await chrome.storage.local.get('bridge.direct'))['bridge.direct'] ?? null };
      }).catch((e) => ({ error: e.message }));
      h.run.ev('STATE', `after Forget: ${JSON.stringify(st).slice(0, 400)}`);
      // the panel after Forget: the next direct action asks for the sign-in again
      await h.br.clickToolbar().catch(() => {});
      await sleep(800);
      await h.br.clickToolbar().catch(() => {});
      if (!(await h.br.sidePanel(8000))) await h.br.panelInTab();
      await sleep(3000);
      await moment(h, 'panel after forget');
    });
  } catch (e) {
    if (!(e instanceof Stop)) h.run.check('the scenario ran to its end', false, e.stack?.split('\n').slice(0, 3).join(' '));
  }
  grid.save();
  h.run.check('no attempt to open grid.wayne.edu through the helper (the verification guard saw none)', guardHits().length === 0, guardHits().join(' | '));
  await grid.stop();
  const r = await teardown(h);
  removeHostKey(h.run);
  return r;
}
