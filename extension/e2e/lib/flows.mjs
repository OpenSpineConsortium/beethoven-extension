// The first run and the home, moment by moment (SPEC "The first run", "The home panel"), as flows the
// scenarios share. Each flow presses what a student presses, takes a numbered moment, and checks the
// screen against the words (lib/words.mjs). A flow that cannot go on throws Stop; the scenario then
// records what it saw and ends.
import fs from 'node:fs';
import path from 'node:path';
import { Browser, hygiene, Mock, Run, sleep } from './harness.mjs';
import { AFFIRMATION, C, LOG_WORDS, loose, SHORT_STATEMENT, STATEMENT_TICK, SUMMARY, sources, WORDS } from './words.mjs';

export const SHARED_WAYNE = '/rs/rs_grp_oschome/shared/beethoven/hpcworker/current';
export const PORT = Number(process.env.E2E_PORT || 8443);
/** the portal's host: ondemand.wayne.localhost reads as the site "wayne" (the bundled Wayne profile); E2E_HOST=localhost for a --live-access run */
export const HOST = process.env.E2E_HOST || 'ondemand.wayne.localhost';
export const ACCOUNT = 'st1234';
export const PASSWORD = 'mockpass';
export const TITLE = 'Wayne State grid';

export class Stop extends Error {}

/** a scenario's run, mock and browser; `mock` takes the mock's command-line switches and environment */
export async function setup(name, { title, mockArgs = [], mockEnv = {}, mockHome, browser = {}, startMock = true, prompts = 'Allow' } = {}) {
  const run = new Run(name, { title });
  run.ev('WORDS', sources.join('; '));
  const mock = new Mock(run, { port: PORT, args: ['--user', ACCOUNT, ...mockArgs], env: mockEnv, home: mockHome });
  if (startMock) await mock.start();
  const br = new Browser(run, { mock, portalHost: HOST, ...browser });
  await br.launch({ keepProfile: !!browser.keepProfile });
  if (prompts) br.watchPrompts(prompts);
  if (process.env.E2E_TRACE_RUN !== '0') br.traceRun();
  const h = { run, mock, br, presses: [], panelTexts: [], portal: `${HOST}:${PORT}`, origin: `https://${HOST}:${PORT}` };
  return h;
}

/**
 * the mock's switches for the Wayne-like portal: HTTP Basic, the bundled Wayne profile's shared copy, a
 * fresh account. At "localhost" (a --live-access run) no bundled profile names a shared copy, so the
 * account starts set up on the mock's own (the store reviewer's recipe), and the words naming Wayne
 * State do not apply.
 */
export const WAYNE_BASIC = HOST === 'localhost' ? ['--auth', 'basic'] : ['--auth', 'basic', '--shared-install', SHARED_WAYNE];

/** run fn as one named step: a thrown error is a FAIL with a last moment, and ends the scenario */
export async function step(h, name, fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Stop) throw e;
    h.run.check(name, false, e.message.split('\n')[0]);
    await h.br.moment(`failed ${name}`).catch(() => {});
    throw new Stop(name);
  }
}

/** a press the student makes (counted for the spec's click count) */
async function studentPress(h, surface, label, opts) {
  const f = await surface.press(label, opts);
  h.presses.push(`${surface.name}: ${f.name.slice(0, 60)}`);
  return f;
}

/** a moment, with the hygiene rule on the panel's words (Details is exempt) */
export async function moment(h, slug, opts) {
  const m = await h.br.moment(slug, opts);
  if (m.panel && !/Details for your lab lead/.test(m.panel)) {
    h.panelTexts.push({ slug, text: m.panel });
    const bad = hygiene(m.panel);
    if (bad.length) h.run.check(`no internal word on the panel (${slug})`, false, bad.join('; '));
  }
  return m;
}

// innerText applies CSS text-transform, so an eyebrow ("You'll need", "The agreement, in short", "Try
// asking") reads in capitals: a string also matches when the page shows it upper-cased
const has = (text, s) => (s instanceof RegExp ? s.test(text ?? '') : loose(s).test(text ?? '') || loose(String(s).toUpperCase()).test(text ?? ''));
export function expectWords(h, where, text, list) {
  const missing = list.filter((s) => !has(text, s));
  return h.run.check(`${where}: the specification's words`, missing.length === 0, missing.length ? `missing: ${missing.map((s) => String(s).slice(0, 70)).join(' | ')}` : `${list.length} sentences`);
}

// ---- moments 1 to 5: install, welcome, the agreement, Chrome's prompt, the grid sign-in ----------------

export async function welcomePage(h) {
  return step(h, 'the welcome page opens by itself on install', async () => {
    const p = await h.br.waitPage(/\/options\.html/, 15_000);
    if (!p) throw new Error('no options.html tab within 15 s of install');
    h.welcome = h.br.surface(p);
    h.welcomePage = p;
    // shots: the welcome page at 1280 x 720, the size the specification holds it to
    if (process.env.E2E_SHOTS) await p.setViewportSize({ width: 1280, height: 720 }).catch(() => {});
    await h.welcome.waitText(WORDS.welcome.headline, 10_000);
    h.run.check('moment 1: the welcome page opened by itself on install', true);
    return h.welcome;
  });
}

export async function welcomeMoment(h) {
  const m = await moment(h, 'welcome', { page: h.welcomePage });
  const w = WORDS.welcome;
  expectWords(h, 'moment 2 welcome', m.page, [w.headline, w.subline, w.needsTitle, ...w.needs.flatMap((n) => [n.title, n.detail, n.link]), w.summaryTitle, ...SUMMARY, w.showTerms, AFFIRMATION.bold, AFFIRMATION.soft, w.agree, w.allowNote('ondemand.grid.wayne.edu'), w.footerNothingLeaves, /Use another portal/]);
  const order = w.needs.map((n) => (m.page ?? '').indexOf(n.title));
  h.run.check("the three requirements in Greg's order: grid account, GlobalProtect, Claude Pro or Max", order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), JSON.stringify(order));
  h.run.check('the first screen says nothing about GitHub (AM3)', !/github/i.test(m.page ?? ''));
  const agree = await h.welcome.find(w.agree);
  h.run.check('"Agree and continue" is disabled until the box is ticked', agree?.disabled === true, JSON.stringify(agree));
  const tick = await h.welcome.find(loose(AFFIRMATION.bold));
  h.run.check('one tick, unticked (AM3: the one-tick variant)', tick?.checked === false || (tick && tick.checked === null), JSON.stringify(tick));
  h.run.check('nothing has left this computer before the agreement', h.br.requests.length === 0, h.br.requests.map((r) => r.url).join(' '));
  return m;
}

/** "Not at Wayne State? Use another portal": the field, prefilled with the university's address, then the mock's */
export async function useAnotherPortal(h, address = h.portal, { expectRefusal = false } = {}) {
  return step(h, `Use another portal: ${address}`, async () => {
    const fieldSel = 'input[type=text], input[type=url], input:not([type])';
    let input = await h.welcome.find(/.*/, { selector: fieldSel });
    if (!input?.visible) {
      await studentPress(h, h.welcome, /Use another portal/);
      input = await h.welcome.waitFind(/.*/, 5000, { selector: fieldSel });
    }
    if (!input?.visible) throw new Error('no address field after "Use another portal"');
    const value = await h.welcomePage.evaluate((sel) => [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0)?.value, fieldSel);
    h.run.check('the field is prefilled with ondemand.grid.wayne.edu', /ondemand\.grid\.wayne\.edu/.test(value ?? '') || h.prefilledChecked, value);
    h.prefilledChecked = true;
    await h.welcome.clickAt(input.x, input.y);
    await h.welcome.key('a', { ctrl: true });
    await h.welcome.type(address);
    const promptsBefore = h.br.prompts.length;
    await studentPress(h, h.welcome, WORDS.welcome.usePortal);
    await sleep(1500);
    let t = await h.welcome.text();
    if (expectRefusal) return t;
    // 11.0.0 after its review: "Use this portal" only chooses; Chrome is asked by "Agree and continue", after the tick
    h.run.check('"Use this portal" asks Chrome nothing before the agreement (the prompt comes with "Agree and continue")', h.br.prompts.length === promptsBefore, h.br.prompts.slice(promptsBefore).map((x) => x.text).join(' | '));
    const host = address.split(':')[0];
    t = (await h.welcome.waitText(loose(WORDS.welcome.allowNote(host)), 6000)) ?? (await h.welcome.waitText(loose(WORDS.welcome.allowNote(address)), 1000)) ?? (await h.welcome.text());
    h.run.check(`the allow note names the portal typed (${host})`, has(t, WORDS.welcome.allowNote(host)) || has(t, WORDS.welcome.allowNote(address)), (/Chrome will ask[^\n]*/.exec(t) ?? [''])[0]);
    await moment(h, 'another portal', { page: h.welcomePage });
    return t;
  });
}

/** tick, then "Agree and continue": the panel and Chrome's prompt from the one click (moments 2 and 3) */
export async function agree(h, { expectPrompt = true } = {}) {
  return step(h, 'tick and Agree and continue', async () => {
    await studentPress(h, h.welcome, loose(AFFIRMATION.bold));
    const tick = await h.welcome.find(loose(AFFIRMATION.bold));
    h.run.check('the box is ticked', tick?.checked !== false, JSON.stringify(tick));
    const promptsBefore = h.br.prompts.length;
    h.br.acceptedAt = Date.now();
    await studentPress(h, h.welcome, WORDS.welcome.agree);
    const panel = await h.br.sidePanel(8000);
    h.run.check('moment 2: the panel opens for the window from the one press', !!panel, panel ? 'side panel target present' : 'no side panel within 8 s');
    if (!panel) await h.br.panelInTab();
    if (expectPrompt) {
      const t0 = Date.now();
      while (h.br.prompts.length === promptsBefore && Date.now() - t0 < 8000) await sleep(200);
      const p = h.br.prompts.slice(promptsBefore)[0] ?? h.br.prompts[h.br.prompts.length - 1];
      h.run.check("moment 3: Chrome's permission prompt for the one portal, from the same press, answered Allow", !!p && p.text.includes(HOST) && /pressed Allow/.test(p.action), p ? `${p.text} / ${p.action}` : 'no prompt seen');
      h.presses.push("Chrome's prompt: Allow");
    }
    await sleep(800);
    const perms = await h.br.permissions().catch(() => ({ origins: [] }));
    h.run.check('the extension holds the portal and nothing else (no Anthropic origin)', perms.origins.some((o) => o.includes(HOST)) && !perms.origins.some((o) => /claude|anthropic/.test(o)), JSON.stringify(perms.origins));
    return panel;
  });
}

/** moment 5: Chrome's own sign-in box in the same tab, typed through UI Automation; the tab closes itself */
export async function gridSignIn(h, { expectTabClose = true, cancel = false } = {}) {
  return step(h, 'moment 5: sign in to the grid', async () => {
    const t0 = Date.now();
    let tab;
    while (!tab && Date.now() - t0 < 15_000) {
      tab = [...h.br.tabs.values()].filter((t) => t.kind === 'tab' && !t.closedAt && t.url.includes(`${HOST}:${PORT}`)).pop();
      if (!tab) await sleep(200);
    }
    if (!tab) throw new Error(`no tab at ${HOST}:${PORT} within 15 s`);
    h.run.check('the sign-in happens in a tab on the portal (the welcome tab itself on a first run)', true, tab.url);
    const m = await moment(h, 'grid sign-in box');
    expectWords(h, 'moment 5 panel', m.panel, [WORDS.grid.title, WORDS.grid.body]);
    const box = await h.br.signInBox({ action: cancel ? 'Cancel' : 'SignIn' });
    h.run.check("Chrome's own sign-in box appeared and was answered as a person does", /^BOX/.test(box), box);
    if (!cancel) h.presses.push("Chrome's sign-in box: Sign in");
    if (cancel) return tab;
    if (expectTabClose) {
      const t1 = Date.now();
      while (!h.br.tabs.get(tab.targetId)?.closedAt && Date.now() - t1 < 15_000) await sleep(200);
      h.run.check('the sign-in tab closes by itself once signed in (direct mode)', !!h.br.tabs.get(tab.targetId)?.closedAt, `closed after ${Date.now() - t1} ms`);
      const open = [...h.br.tabs.values()].filter((t) => t.kind !== 'side panel' && t.type === 'page' && !t.closedAt);
      h.run.check('the window was not left without a tab', open.length >= 1, open.map((t) => t.url.slice(0, 50)).join(', '));
    }
    // on a first run moment 5 draws "Signed in as st1234."; from the home (a returning run) the Grid row says "Signed in as st1234"
    const fromHome = h.br.panel ? /\bGrid\b/.test((await h.br.panel.text().catch(() => '')) ?? '') : false;
    const want = fromHome ? new RegExp(`Grid\\s+Signed in as ${ACCOUNT}`) : loose(WORDS.grid.signedIn(ACCOUNT));
    const t = await h.br.panel.waitText(want, 15_000);
    h.run.check(fromHome ? `the home's Grid row says "${WORDS.home.gridSignedIn(ACCOUNT)}"` : `the panel says "${WORDS.grid.signedIn(ACCOUNT)}"`, !!t);
    if (t && !fromHome) await moment(h, 'signed in to the grid');
    return tab;
  });
}

// ---- moments 6 to 8: where your work goes, Connect, the Claude sign-in ----------------------------------

export async function statement(h) {
  return step(h, 'moment 6: where your work goes', async () => {
    const p = h.br.panel;
    const t = await p.waitText(WORDS.statement.title, 20_000);
    if (!t) throw new Error(`no "${WORDS.statement.title}" on the panel within 20 s`);
    const m = await moment(h, 'where your work goes');
    // the checklist: its three rows, or, once all three are done, the one line they fold into (so the moment fits the panel)
    const rows = (m.panel ?? '').includes(WORDS.statement.rowReady) ? [WORDS.statement.rowSignedIn(ACCOUNT), WORDS.statement.rowApproved, WORDS.statement.rowReady] : [`${WORDS.statement.rowSignedIn(ACCOUNT)} · ${WORDS.statement.rowApproved} · Ready`];
    expectWords(h, 'moment 6', m.panel, [WORDS.statement.title, ...SHORT_STATEMENT, /More about your data/, STATEMENT_TICK, WORDS.statement.connect, ...rows]);
    const connect = await p.find(WORDS.statement.connect);
    h.run.check('"Connect" is disabled until the statement is ticked', connect?.disabled === true, JSON.stringify(connect));
    const checks = h.br.requests.filter((r) => /\/beethoven\/access_check$/.test(r.url) && r.method === 'POST');
    const body = checks[0]?.body ? JSON.parse(checks[0].body) : undefined;
    h.run.check('the approval check went to the stand-in after acceptance, with only v, access_id, portal, product, version, install_id', !!body && !checks[0].beforeAcceptance && JSON.stringify(Object.keys(body).sort()) === JSON.stringify(['access_id', 'install_id', 'portal', 'product', 'v', 'version']) && body.access_id === ACCOUNT && body.version === h.br.version, checks[0]?.body);
    return m;
  });
}

export async function connect(h) {
  return step(h, 'moment 7: Connect', async () => {
    const p = h.br.panel;
    // E2E_PRECONNECT_MS: wait before Connect. Only to move the press off the phase in which the extension's own
    // listing races the Connect's run record (a product defect, reported); the default (0) reproduces it.
    const pre = Number(process.env.E2E_PRECONNECT_MS || 0);
    if (pre) {
      h.run.note(`E2E_PRECONNECT_MS: waited ${pre} ms before Connect`);
      await sleep(pre);
    }
    await studentPress(h, p, loose(STATEMENT_TICK));
    const t0 = Date.now();
    await studentPress(h, p, WORDS.statement.connect);
    const t = await p.waitText(WORDS.connect.hero, 5000);
    h.run.check('the panel answers within a second: "Asking the grid for a computer…"', !!t && Date.now() - t0 <= 1500, `${Date.now() - t0} ms`);
    const m = await moment(h, 'asking for a computer');
    expectWords(h, 'moment 7', m.panel, [WORDS.connect.hero, ...WORDS.track]);
    return m;
  });
}

/** moment 8: the Anthropic tab, Authorize, Copy Code, paste into the panel's box; the tab closes itself */
export async function claudeSignIn(h, { waitBeforePasteMs = 0, closePanelWhileWaiting = false } = {}) {
  return step(h, 'moment 8: sign in to Claude', async () => {
    const tabRe = /^https:\/\/claude\.ai\/oauth\/authorize\?/;
    const page = await h.br.waitPage(tabRe, 90_000);
    if (!page) throw new Error('no Anthropic sign-in tab within 90 s of Connect');
    const rec = [...h.br.tabs.values()].filter((t) => tabRe.test(t.urls[0] ?? '')).pop();
    h.run.check('the extension opened Anthropic\'s authorize link in a new tab (https, claude.ai)', !!rec && !rec.byHarness && C.isClaudeAuthUrl(page.url()), page.url().slice(0, 100));
    const p = h.br.panel;
    await p.waitText(WORDS.claude.title, 15_000);
    const m = await moment(h, 'sign in to claude', { page });
    expectWords(h, 'moment 8 panel', m.panel, [WORDS.claude.title, WORDS.claude.body, WORDS.claude.reopen, /Your worker is already in line · \d+:\d\d/]);
    const box = await p.find(undefined, { placeholder: WORDS.claude.placeholder, selector: 'input, textarea' });
    h.run.check('one box with the placeholder "Paste code"', !!box?.visible);
    const anth = h.br.surface(page);
    await studentPress(h, anth, 'Authorize');
    await page.waitForURL(/oauth\/code\/callback/, { timeout: 10_000 });
    await studentPress(h, anth, 'Copy Code');
    const code = h.br.codes[h.br.codes.length - 1];
    if (waitBeforePasteMs) {
      h.run.ev('WAIT', `the student takes ${Math.round(waitBeforePasteMs / 1000)} s before pasting${closePanelWhileWaiting ? ', with the panel closed' : ''}`);
      if (closePanelWhileWaiting) {
        await h.br.bcdp.send('Target.closeTarget', { targetId: h.br.panel.h.info.id }).catch(() => {});
        h.br.panel = undefined;
        await sleep(1500);
        h.run.check('the panel is closed while the student is away', !(await h.br.sidePanel(1500)));
      }
      const t0 = Date.now();
      while (Date.now() - t0 < waitBeforePasteMs) {
        await sleep(Math.min(30_000, waitBeforePasteMs - (Date.now() - t0)));
        const st = await h.mock.state().catch(() => ({}));
        h.run.ev('WAITING', `${Math.round((Date.now() - t0) / 1000)} s: shells ${st.shells}, keepalive frames ${st.keepaliveFrames}, idle kills ${st.idleKills}`);
      }
      if (closePanelWhileWaiting) {
        await h.br.clickToolbar();
        if (!(await h.br.sidePanel(8000))) await h.br.panelInTab();
        await moment(h, 'panel reopened after the wait');
      }
    }
    await h.br.panel.pasteInto(undefined, { placeholder: WORDS.claude.placeholder, selector: 'input, textarea' });
    h.presses.push('panel: paste box (click + Ctrl+V)');
    const ok = await h.br.panel.waitText(/Signed in as st1234@wayne\.edu · Max/, 20_000);
    h.run.check('"Signed in as st1234@wayne.edu · Max" after the paste', !!ok);
    const t1 = Date.now();
    while (!page.isClosed() && Date.now() - t1 < 10_000) await sleep(200);
    h.run.check('the Anthropic tab closes itself after SIGNED-IN', page.isClosed(), `${Date.now() - t1} ms`);
    await moment(h, 'signed in to claude');
    const store = JSON.stringify(await h.br.storage().catch(() => ({})));
    // the stand-in's own callback navigation in the Anthropic tab carries the code (the student's Authorize click); every other request must not
    const reqText = JSON.stringify(h.br.requests.filter((r) => r.to !== 'anthropic'));
    const mockLog = JSON.stringify(await h.mock.saveLog().catch(() => ({})));
    h.run.check('the pasted code is kept nowhere: not in storage, not in a request, not in the mock\'s shell lines', !!code && !store.includes(code.split('#')[0]) && !reqText.includes(code.split('#')[0]) && !mockLog.includes(code.split('#')[0]));
    return code;
  });
}

// ---- moments 9 to 13: in line, the tour, got a computer, online, the home ----------------------------------

/** the tour runs 16 s on its own clock from the moment the queue appears: note when each caption is first seen (any order), a picture of each, then Try asking */
async function watchTour(h, p) {
  const caps = WORDS.tour.captions;
  const seenAt = caps.map(() => -1);
  const shots = [];
  const t0 = Date.now();
  let tryAsk;
  while (Date.now() - t0 < 30_000) {
    const tt = (await p.text().catch(() => '')) ?? '';
    caps.forEach((c, i) => {
      if (seenAt[i] < 0 && tt.includes(c)) {
        seenAt[i] = Date.now() - t0;
        shots.push(moment(h, `tour scene ${i + 1}`).catch(() => {}));
      }
    });
    if (/Try asking/i.test(tt) && WORDS.home.prompts.every((s) => has(tt, s))) {
      tryAsk = tt;
      break;
    }
    await sleep(200);
  }
  await Promise.all(shots);
  return { seenAt, tryAsk };
}

export async function inLine(h, { tour = true } = {}) {
  return step(h, 'moment 9: in line for a computer', async () => {
    const p = h.br.panel;
    const t = await p.waitText(WORDS.queue.hero, 60_000);
    if (!t) throw new Error(`no "${WORDS.queue.hero}" within 60 s`);
    const tourWatch = tour ? watchTour(h, p) : undefined;
    const m = await moment(h, 'in line');
    expectWords(h, 'moment 9', m.panel, [WORDS.queue.hero, /\b\d+:\d\d\b/]);
    // the estimate comes from `worker status --json`, which the 60 s scheduler floor allows at the earliest a minute after Connect
    h.expectedWatch = p.waitText(/Expected around \d{1,2}:\d\d/, 75_000).then((x) => {
      h.run.check('moment 9: "Expected around …" once the scheduler gives an estimate', !!x);
      return x;
    });
    const a = /\b(\d+):(\d\d)\b/.exec(m.panel ?? '');
    await sleep(2200);
    const b = /\b(\d+):(\d\d)\b/.exec((await p.text()) ?? '');
    h.run.check('the timer counts (from submitted_at)', !!a && !!b && a[0] !== b[0], `${a?.[0]} -> ${b?.[0]}`);
    const tb = m.toolbar ?? (await h.br.toolbar().catch(() => ({})));
    h.run.check('the toolbar badge shows the wait ("…" or "Nm") and the title "Beethoven · In line for N min"', /^(\d+m|…)$/.test(tb.badge ?? '') && /^Beethoven · In line for \d+ min$|^Beethoven/.test(tb.title ?? ''), JSON.stringify(tb));
    if (tourWatch) {
      const { seenAt, tryAsk } = await tourWatch;
      const inOrder = seenAt.every((x, i) => x >= 0 && (i === 0 || x > seenAt[i - 1]));
      h.run.check('moment 10: the tour plays its four captions in order while in line', inOrder, JSON.stringify(seenAt));
      h.run.check('the tour ends with Try asking and its three prompts', !!tryAsk);
      await sleep(700); // Try asking fades in; a press during the fade can be lost
      await moment(h, 'tour try asking');
      for (let i = 0; i < 2; i++) {
        const done = await p.find(WORDS.tour.done);
        if (!done?.visible) break;
        await p.press(WORDS.tour.done);
        await sleep(1200);
        if (!/What it can do/i.test((await p.text().catch(() => '')) ?? '')) break;
        h.run.note(`"${WORDS.tour.done}" did not close the tour on press ${i + 1}`);
      }
    }
    // with the tour closed (or never shown) the full hero is back with its subline; with reduced motion
    // the tour's still frames wait for "Next", so the slim timer bar stays while they are up
    const sub = await p.waitText(WORDS.queue.sub, 6000);
    const tourUp = /What it can do/i.test((await p.text().catch(() => '')) ?? '');
    if (sub || !tourUp) h.run.check(`moment 9: "${WORDS.queue.sub}" (the tour hides it behind a slim timer bar while it plays)`, !!sub);
    if (sub) await moment(h, 'in line, the hero');
    else h.run.note(`moment 9's subline is behind the tour's slim timer bar while the tour is still up (not checked here)`);
    return m;
  });
}

export async function gotComputer(h) {
  return step(h, 'moment 11: got a computer', async () => {
    const t = await h.br.panel.waitText(WORDS.starting.gotComputer, 240_000);
    if (h.expectedWatch) await h.expectedWatch;
    if (!t) throw new Error(`no "${WORDS.starting.gotComputer}" within 4 minutes`);
    const m = await moment(h, 'got a computer');
    expectWords(h, 'moment 11', m.panel, [WORDS.starting.hero, WORDS.starting.gotComputer]);
    return m;
  });
}

export async function online(h) {
  return step(h, 'moment 12: online', async () => {
    // "You're online." or, when the extension skips the moment (it does when its run record lost the
    // Connect's "pressed", a product defect reported by the verifier), the home's "Online" hero
    const t = await h.br.panel.waitText(new RegExp(`${WORDS.online.hero.replace('.', '\\.')}|${WORDS.home.rows.worker}\\s+Online · checked`), 120_000);
    if (!t) throw new Error(`no "${WORDS.online.hero}" within 2 minutes`);
    if (!t.includes(WORDS.online.hero)) {
      h.run.check(`moment 12: "${WORDS.online.hero}" shown when the worker comes online`, false, 'the panel went straight to the home: no moment, no claude.ai tab (the run record was taken for one found, not pressed)');
      await moment(h, 'online without the moment');
      return undefined;
    }
    const m = await moment(h, 'online');
    expectWords(h, 'moment 12', m.panel, [WORDS.online.hero, new RegExp(`Ready in Claude(, \\d+ min after you asked| in under a minute)\\. Look for ${TITLE}\\.`), WORDS.online.open]);
    const env = await h.br.waitPage(/^https:\/\/claude\.ai\/code\?environment=env_/, 15_000);
    h.run.check('claude.ai/code?environment=… opened by itself, once', !!env && h.br.pages().filter((x) => /claude\.ai\/code\?environment=/.test(x.url())).length === 1, env?.url());
    const tb = await h.br.toolbar().catch(() => ({}));
    h.run.check('the toolbar: "Beethoven · Online…", no badge', /^Beethoven · Online/.test(tb.title ?? '') && !tb.badge, JSON.stringify(tb));
    return m;
  });
}

export async function home(h) {
  return step(h, 'moment 13: the home', async () => {
    const p = h.br.panel;
    // "up 3 min", or "online just now" in the worker's first minute (never "up 0 min")
    const t = await p.waitText(new RegExp(`${TITLE} · (up |online just now)`), 15_000);
    const m = await moment(h, 'home');
    expectWords(h, 'the home', m.panel, [WORDS.home.onlineHero, new RegExp(`${TITLE} · (up |online just now)`), WORDS.home.openSession, WORDS.home.newSession, WORDS.home.copyLink, WORDS.home.phone, WORDS.home.rows.grid, WORDS.home.rows.claude, WORDS.home.rows.worker, WORDS.home.gridSignedIn(ACCOUNT), WORDS.home.claudeSignedIn('Max'), /Online · checked \d+ (s|min) ago/, /Renews itself at \d{1,2}:\d\d/, WORDS.home.stop, /Try asking/i, WORDS.home.prompts[0], /Show log/]);
    const more = await p.find(WORDS.home.more);
    h.run.check('the header carries "⋯" with the name "More"', !!more?.visible);
    const fits = await p.eval(`() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight })`);
    h.run.check('the home fits without scrolling while the log is closed', fits.sh <= fits.ch + 2 && fits.sw <= fits.cw + 1, JSON.stringify(fits));
    return t;
  });
}

export async function showLog(h) {
  return step(h, 'Show log', async () => {
    const p = h.br.panel;
    await p.press(/^Show log/);
    const t = await p.waitText(LOG_WORDS.asked, 8000);
    const m = await moment(h, 'show log');
    expectWords(h, 'Show log', m.panel, [LOG_WORDS.gridSignedIn(ACCOUNT), LOG_WORDS.approved, LOG_WORDS.asked, LOG_WORDS.claudeSignedIn('Max'), LOG_WORDS.inLine.line, LOG_WORDS.gotComputer, LOG_WORDS.online(TITLE), WORDS.home.copyLog, WORDS.home.hideLog]);
    h.run.check('the log shows no job numbers, nodes or tool output', !/\b1\d{5}\b|node01|hpcworker|HPCW-/.test(m.panel ?? ''));
    await p.press(WORDS.home.hideLog);
    return t;
  });
}

export async function phone(h) {
  return step(h, 'Phone', async () => {
    const p = h.br.panel;
    await p.press(WORDS.home.phone);
    await p.waitText(WORDS.home.phoneTitle, 5000);
    // the face flips in 280 ms: wait for the QR's SVG to be drawn and settled before measuring it
    for (let i = 0; i < 20; i++) {
      const w = await p.eval(`() => Math.max(0, ...[...document.querySelectorAll('svg')].map((x) => x.getBoundingClientRect().width))`).catch(() => 0);
      if (w >= 120) break;
      await sleep(150);
    }
    await sleep(800);
    const qr = await p.eval(`() => { const s = [...document.querySelectorAll('svg')].find((x) => x.getBoundingClientRect().width >= 120); return s ? { w: Math.round(s.getBoundingClientRect().width), parts: s.querySelectorAll('rect, path').length } : null; }`);
    const m = await moment(h, 'phone');
    expectWords(h, 'Phone', m.panel, [WORDS.home.phoneTitle, WORDS.home.phoneBody(TITLE), WORDS.home.phoneDone]);
    h.run.check('a QR code drawn on the device (an SVG of about 180 px)', !!qr && qr.w >= 150, JSON.stringify(qr));
    await p.press(WORDS.home.phoneDone);
  });
}

export async function newSession(h) {
  return step(h, 'New session', async () => {
    const before = h.br.pages().filter((x) => /claude\.ai\/code\?environment=/.test(x.url())).length;
    await h.br.panel.press(WORDS.home.newSession);
    const t = await h.br.panel.waitText(WORDS.home.newSessionTip, 5000);
    await sleep(1500);
    const after = h.br.pages().filter((x) => /claude\.ai\/code\?environment=/.test(x.url())).length;
    h.run.check('"New session" opens the environment link in a new tab, with the one-time tip', after === before + 1 && !!t, `${before} -> ${after}`);
    await moment(h, 'new session');
  });
}

export async function copyLink(h) {
  return step(h, 'Copy link', async () => {
    await h.br.panel.press(WORDS.home.copyLink);
    const t = await h.br.panel.waitText(WORDS.home.linkCopied, 5000);
    const reader = await h.br.newPage(`${h.origin}/public/start.html`);
    await h.br.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: h.origin });
    const clip = await reader.evaluate(() => navigator.clipboard.readText()).catch((e) => `(unreadable: ${e.message})`);
    await reader.close();
    h.run.check('"Copy link": the toast "Link copied." and the environment link on the clipboard', !!t && C.isEnvironmentUrl(clip), clip);
  });
}

export async function stopWorker(h) {
  return step(h, 'Stop', async () => {
    const p = h.br.panel;
    await studentPress(h, p, WORDS.home.stop);
    await p.waitText(WORDS.home.confirm, 5000);
    await moment(h, 'stop confirm');
    await studentPress(h, p, WORDS.home.confirmStop, { last: true });
    const tStop = Date.now();
    const stopping = await p.waitText(WORDS.home.stopping, 5000);
    h.run.check('"Stopping…" until the job is gone', !!stopping);
    const t = await p.waitText(WORDS.home.stoppedSub, 120_000);
    h.run.ev('TIMING', `Stop to "Stopped": ${Date.now() - tStop} ms`);
    const m = await moment(h, 'stopped');
    expectWords(h, 'Stopped', m.panel, [WORDS.home.stoppedHero, WORDS.home.stoppedSub, WORDS.home.connect]);
    const log = await h.mock.saveLog();
    h.run.check('Stop ran "worker stop" alone through the shell', log.shells.some((s) => s.lines.some((l) => /hpcworker' worker stop --name 'worker'/.test(l))));
    return t;
  });
}

// ---- what every scenario checks at the end ------------------------------------------------------------------

export async function finalChecks(h, { expectAccessService = true } = {}) {
  const { br, run } = h;
  const before = br.requests.filter((r) => r.beforeAcceptance);
  run.check('nothing was sent anywhere before the agreement was accepted', before.length === 0, before.map((r) => `${r.method} ${r.url}`).join(' | '));
  run.check('nothing reached the university', !br.requests.some((r) => r.to === 'UNIVERSITY'));
  const anth = br.requests.filter((r) => r.to === 'anthropic');
  run.check('Anthropic pages were reached only by tabs (stand-ins), never by the extension\'s own code', anth.every((r) => r.from !== 'extension service worker'), anth.map((r) => `${r.from}: ${r.url.slice(0, 60)}`).join(' | '));
  const panelNet = br.panel?.kind === 'panel' ? br.panel.h.requests.filter((r) => !/^https:\/\/ondemand\.wayne\.localhost/.test(r.url)) : [];
  run.check('the side panel itself fetched nothing from the network', panelNet.length === 0, panelNet.map((r) => r.url).join(' '));
  if (expectAccessService) {
    const live = br.requests.filter((r) => r.to === 'access');
    run.check(br.liveAccess ? 'the live access service was asked only about st1234 at localhost' : 'the live access service was never asked (the stand-in answered)', br.liveAccess || live.length === 0, live.map((r) => r.url).join(' '));
  }
  const store = JSON.stringify(await br.storage().catch(() => ({})));
  run.check('extension storage holds no password, key or setup line', !/mockpass|ssh-ed25519|BEGIN OPENSSH|beethoven_ed25519|login-setup/.test(store));
  run.note(`student presses: ${h.presses.length} (${h.presses.join('; ')})`);
  run.note(`tabs: ${[...br.tabs.values()].filter((t) => t.type === 'page').map((t) => `${t.kind} ${t.urls[0].slice(0, 60)}${t.closedAt ? ' [closed]' : ''}${t.byHarness ? ' [harness]' : ''}`).join(' | ')}`);
  run.note(`permission prompts: ${br.prompts.length} (${br.prompts.map((p) => `${p.text} ${p.action}`).join(' | ')})`);
}

/** the end of every scenario: final checks, logs, the browser and the mock closed, the result */
export async function teardown(h, extra = {}) {
  try {
    await finalChecks(h, extra);
  } catch (e) {
    h.run.ev('ERROR', `final checks: ${e.message}`);
  }
  await h.mock.saveLog().catch(() => {});
  fs.writeFileSync(path.join(h.run.dir, 'panel-texts.json'), JSON.stringify(h.panelTexts, null, 1));
  await h.br.close();
  await h.mock.stop();
  return h.run.finish({ presses: h.presses, panelAsTab: h.br.panelAsTab, extensionVersion: h.br.version });
}
