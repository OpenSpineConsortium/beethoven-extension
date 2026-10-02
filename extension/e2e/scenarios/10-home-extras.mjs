// Scenario 10 (added by the verifier): the home's buttons scenarios 1 to 9 do not press (SPEC "The home
// panel"). Part A, in line: "Cancel" with its confirmation, "Keep it", then Cancel for real (a worker
// still in line is stopped at once), Connect again with no Claude sign-in. Part B, online: Try asking's
// copy, Show log closed again when the panel is reopened, Stop then "Keep it", and every item of the
// "⋯" menu: See what it can do, Your files, Settings (Appearance), Details for your lab lead (the sheet,
// Done) and Help.
import { ACCOUNT, agree, claudeSignIn, connect, expectWords, gridSignIn, moment, online, setup, statement, Stop, teardown, useAnotherPortal, WAYNE_BASIC, welcomePage } from '../lib/flows.mjs';
import { sleep } from '../lib/harness.mjs';
import { loose, WORDS } from '../lib/words.mjs';

const H = WORDS.home;

async function readClipboard(h) {
  const reader = await h.br.newPage(`${h.origin}/public/start.html`);
  await h.br.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: h.origin });
  const clip = await reader.evaluate(() => navigator.clipboard.readText()).catch((e) => `(unreadable: ${e.message})`);
  await reader.close();
  return clip;
}

/** a tab the extension opened (from the browser's own target list) whose address matches */
async function extensionTab(h, re, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const rec = [...h.br.tabs.values()].find((t) => t.type === 'page' && !t.byHarness && t.openedAt >= h.mark && t.urls.some((u) => re.test(u)));
    if (rec) return rec;
    await sleep(200);
  }
  return undefined;
}

async function menuItem(h, label) {
  const p = h.br.panel;
  await p.press(H.more);
  await sleep(400);
  h.mark = Date.now() - h.run.t0;
  await p.press(label, { selector: '[role=menuitem], button, a' });
}

async function reopenPanel(h) {
  await h.br.bcdp.send('Target.closeTarget', { targetId: h.br.panel.h.info.id }).catch(() => {});
  h.br.panel = undefined;
  await sleep(1500);
  await h.br.clickToolbar();
  return (await h.br.sidePanel(8000)) ?? (await h.br.panelInTab());
}

export default async function homeExtras(opts = {}) {
  const h = await setup('10-home-extras', { title: 'The home: Cancel, Keep it, Try asking, Show log on reopen, the ⋯ menu', mockArgs: WAYNE_BASIC, mockEnv: { MOCK_QUEUE_S: '75', MOCK_START_S: '3', MOCK_LOGGED_IN: 'false' }, browser: opts.browser });
  try {
    await welcomePage(h);
    await useAnotherPortal(h);
    await agree(h);
    await gridSignIn(h);
    await statement(h);
    await connect(h);
    await claudeSignIn(h);
    const p = h.br.panel;
    await p.waitText(WORDS.queue.hero, 60_000);
    const skip = await p.waitFind(WORDS.tour.skip, 8000);
    if (skip?.visible) await p.press(WORDS.tour.skip);
    await online(h);
    // ---- part B: online ---------------------------------------------------------------------------
    await p.waitText(new RegExp(`${H.rows.worker}\\s+Online · checked`), 15_000);
    await p.press(`Copy this question: ${H.prompts[0]}`, { selector: 'button' });
    const toast = await p.waitText(H.promptCopied, 4000);
    const clip = await readClipboard(h);
    h.run.check(`Try asking: the copy icon puts the question on the clipboard with the toast "${H.promptCopied}"`, !!toast && clip === H.prompts[0], clip);
    // Show log, then close and reopen the panel: the log is closed again
    await p.press(/^Show log/);
    await p.waitText(H.hideLog, 5000);
    await sleep(700); // the fold opens over 320 ms
    h.run.check('Show log expands in place (Hide log and Copy log appear)', (await p.find(H.hideLog))?.visible && (await p.find(H.copyLog))?.visible);
    await moment(h, 'show log open');
    const p2 = await reopenPanel(h);
    await p2.waitText(H.onlineHero, 15_000);
    await sleep(1000);
    const hide = await p2.find(H.hideLog);
    const show = await p2.find(/^Show log/);
    let m = await moment(h, 'panel reopened, log closed');
    h.run.check('the log is closed every time the panel opens', !hide?.visible && !!show?.visible, JSON.stringify({ hide: hide?.visible, show: show?.visible }));
    // Stop, then Keep it
    await p2.press(H.stop);
    await p2.waitText(H.confirm, 5000);
    await p2.press(H.keep);
    await sleep(800);
    const t = await p2.text();
    h.run.check('Stop then "Keep it": still online, nothing stopped', /Online/.test(t) && !t.includes(H.confirm) && !(await h.mock.saveLog()).shells.some((s) => s.lines.some((l) => / worker stop /.test(l) && Date.parse(s.opened) > Date.now() - 5000)));
    // the ⋯ menu
    await p2.press(H.more);
    await sleep(500);
    m = await moment(h, 'the more menu');
    expectWords(h, 'the ⋯ menu', m.panel, [H.menu.tour, H.menu.files, H.menu.settings, H.menu.details, H.menu.help]);
    await p2.key('Escape');
    await sleep(400);
    // See what it can do
    await menuItem(h, H.menu.tour);
    const cap = await p2.waitText(WORDS.tour.captions[0], 6000);
    await moment(h, 'tour from the menu');
    h.run.check('⋯ > See what it can do: the tour plays from its first scene, with Skip', !!cap && (await p2.find(WORDS.tour.skip))?.visible);
    await p2.press(WORDS.tour.skip).catch(() => {});
    await sleep(600);
    // Your files
    await menuItem(h, H.menu.files);
    const files = await extensionTab(h, /\/pun\/sys\/dashboard\/files\/fs\//);
    h.run.check('⋯ > Your files: the worker\'s folder in the portal\'s Files app, in a tab', !!files, files?.urls.join(' '));
    // Settings
    await menuItem(h, H.menu.settings);
    const settings = await h.br.waitPage(/\/options\.html/, 8000);
    if (settings) {
      await settings.bringToFront().catch(() => {});
      const st = (await h.br.surface(settings).waitText(/Appearance/i, 8000)) ?? (await h.br.surface(settings).text());
      await moment(h, 'settings', { page: settings });
      expectWords(h, 'Settings', st, [WORDS.settings.title, WORDS.settings.worker, WORDS.settings.appearance, WORDS.settings.appearances.cream, WORDS.settings.appearances.system, WORDS.settings.grid, WORDS.settings.agreement, WORDS.settings.keepRunning, WORDS.settings.openClaude]);
    } else h.run.check('⋯ > Settings opens the settings page', false);
    // Details for your lab lead
    await h.br.panel.press(H.more).catch(() => {});
    await sleep(400);
    await h.br.panel.press(H.menu.details, { selector: '[role=menuitem], button, a' });
    const det = await p2.waitText(WORDS.details.runChecks, 8000);
    await sleep(800);
    m = await moment(h, 'details for your lab lead');
    expectWords(h, 'Details', m.panel, [WORDS.details.title, WORDS.details.runChecks, WORDS.details.copyReport, WORDS.details.footer, WORDS.details.loginSetupUnproven, WORDS.details.done]);
    h.run.check('Details is a sheet with Done', !!det);
    await p2.press(WORDS.details.done, { last: true }).catch(() => {});
    await sleep(600);
    // Help
    await menuItem(h, H.menu.help);
    const help = await extensionTab(h, /openspineconsortium\.com\/beethoven\/support\.html/);
    h.run.check('⋯ > Help: openspineconsortium.com/beethoven/support.html', !!help, help?.urls.join(' '));
    // ---- part A (after B): the home in line, from a Connect on the home --------------------------
    await p2.press(H.stop);
    await p2.waitText(H.confirm, 5000);
    await p2.press(H.confirmStop, { last: true });
    await p2.waitText(H.stoppedSub, 120_000);
    const tConnect = Date.now();
    await p2.press(H.connect);
    const asked = await p2.waitText(new RegExp(`${WORDS.connect.hero}|${WORDS.queue.hero}`), 5000);
    h.run.check('Connect from the home answers at once', !!asked);
    // what the panel says while the press waits for the scheduler floor (the Stop just used it)
    await sleep(6000);
    const mWait = await moment(h, 'home connect pressed, 6 s later');
    h.run.check('6 s after Connect on the home, the panel still shows the press going ahead (not "Stopped" with Connect again)', !(mWait.panel ?? '').includes(H.stoppedSub), (mWait.panel ?? '').split('\n').slice(5, 9).join(' | '));
    const anth = await h.br.waitPage(/^https:\/\/claude\.ai\/oauth\/authorize/, 15_000);
    h.run.check('Connect again: no Claude sign-in when the grid is already signed in', !anth);
    const seenClaude = await p2.waitText(new RegExp(WORDS.claude.title), 70_000);
    if (seenClaude) {
      const mc = await moment(h, 'home connect, the claude moment');
      h.run.check('already signed in to Claude: the "Sign in to Claude" moment never appears, only "Signed in as … · Max" (SPEC moment 8)', !(mc.panel ?? '').includes(WORDS.claude.body), (mc.panel ?? '').split('\n').slice(5, 10).join(' | '));
    }
    await p2.waitText(WORDS.queue.hero, 70_000);
    await p2.waitText(/Asked at \d/, 15_000);
    h.run.ev('TIMING', `Connect on the home to "In line": ${Date.now() - tConnect} ms`);
    await sleep(1500);
    let m2 = await moment(h, 'home in line, the foot row');
    // the timer is the hero while in line (a large line of its own), the sentence under it
    expectWords(h, 'the home in line: the timer as the hero, Worker row and foot row', m2.panel, [WORDS.queue.hero, /\b\d+:\d\d\b[\s\S]{0,60}It starts as soon as one is free\./, /In line · \d+ min/, /Asked at \d{1,2}:\d\d\s?[AP]M/, H.cancel]);
    await p2.press(H.cancel);
    const conf = await p2.waitText(H.confirmCancel, 5000);
    m2 = await moment(h, 'cancel confirm');
    h.run.check(`"${H.cancel}" asks "${H.confirmCancel}" with [${H.confirmCancelButton}] [${H.keep}]`, !!conf && (m2.panel ?? '').includes(H.keep) && (m2.panel ?? '').includes(H.confirmCancelButton));
    await p2.press(H.keep);
    await sleep(800);
    const still = await p2.text();
    h.run.check('"Keep it" leaves the worker in line', still.includes(WORDS.queue.hero) && !still.includes(H.confirmCancel));
    await p2.press(H.cancel);
    await p2.waitText(H.confirmCancel, 5000);
    const tCancel = Date.now();
    await p2.press(H.confirmCancelButton, { last: true });
    const stopped = await p2.waitText(H.stoppedSub, 120_000);
    h.run.ev('TIMING', `Cancel to "Stopped" while in line: ${Date.now() - tCancel} ms`);
    await moment(h, 'cancelled while in line');
    h.run.check('Cancel while in line ends in "Stopped" (the tool stops a worker still in line at once)', !!stopped, `${Date.now() - tCancel} ms`);
    await moment(h, 'home after the menu');
    h.run.note(`account ${ACCOUNT}; the menu's tabs were opened by the extension`);
    void loose;
  } catch (e) {
    if (!(e instanceof Stop)) h.run.check('the scenario ran to its end', false, e.stack?.split('\n').slice(0, 3).join(' '));
  }
  return teardown(h);
}
