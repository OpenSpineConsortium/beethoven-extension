// Scenario 2: the returning run (SPEC "The returning run"). A first run to online; the browser closes
// and starts again on the same profile, so the browser has forgotten the grid sign-in: the panel shows
// the last known state "As of …", the Grid row "Signed out · Sign in", nothing opens by itself, and
// "Open my session" works without the grid. Then "Sign in" (the tab, Chrome's box, the tab closing,
// live again), Stop, another restart, and Connect while signed out: the sign-in tab, then the worker,
// with no Claude sign-in because the grid is still signed in to Claude.
import { ACCOUNT, expectWords, gridSignIn, moment, online, setup, Stop, stopWorker, teardown, WAYNE_BASIC } from '../lib/flows.mjs';
import { Browser, sleep } from '../lib/harness.mjs';
import { WORDS } from '../lib/words.mjs';
import { firstRunToOnline } from './01-first-run.mjs';

async function restart(h, why) {
  h.run.ev('RESTART', why);
  const profile = h.br.profile;
  await h.br.close();
  h.br = new Browser(h.run, { mock: h.mock, portalHost: h.br.portalHost, profile });
  h.br.acceptedAt = Date.now(); // accepted in the first session
  await h.br.launch({ keepProfile: true });
  h.br.watchPrompts('Allow');
  await sleep(4000);
  const opened = [...h.br.tabs.values()].filter((t) => t.kind === 'tab' && /ondemand\.wayne\.localhost/.test(t.url));
  h.run.check('after the restart nothing opens by itself', opened.length === 0, opened.map((t) => t.url).join(' '));
  // a browser starts with a New Tab: the toolbar button is pressed on it (opened first, so closing the
  // options page below never closes the window)
  await h.br.newPage('about:blank');
  await sleep(500);
  // harness artifact of a command-line unpacked extension, which Chrome installs afresh at every launch:
  // onInstalled "install" opens the options page (a store install does not). Should the site grant be missing
  // (a store install keeps it), it is restored as a test device, logged as such.
  const perms = await h.br.permissions().catch(() => ({ origins: [] }));
  h.run.note(`site grant after the restart, before any test device: ${JSON.stringify(perms.origins)}`);
  let opt = h.br.pages().filter((x) => /\/options\.html/.test(x.url())).pop();
  if (opt) h.run.note('harness artifact: the options page opened at launch (onInstalled "install" for a command-line unpacked extension)');
  if (!perms.origins.some((o) => o.includes(h.br.portalHost))) {
    opt = opt ?? (await h.br.newPage(`chrome-extension://${h.br.extId}/options.html`));
    await opt.waitForLoadState().catch(() => {});
    await opt.evaluate((o) => {
      const b = document.createElement('button');
      b.id = 'harness-regrant';
      b.textContent = 'Harness: restore the site grant';
      b.style.cssText = 'position:fixed;top:8px;right:8px;z-index:99999;padding:10px;font:14px sans-serif';
      b.onclick = () => chrome.permissions.request({ origins: [`${o}/*`] }).then((g) => (document.title = `regrant ${g}`));
      document.body.append(b);
    }, `https://${h.br.portalHost}:${h.mock.port}`);
    await h.br.surface(opt).press('Harness: restore the site grant');
    const t0 = Date.now();
    while (!/regrant/.test(await opt.title().catch(() => '')) && Date.now() - t0 < 12_000) await sleep(200);
    const after = await h.br.permissions().catch(() => ({ origins: [] }));
    h.run.note(`test device: the site grant a store install keeps across a restart was restored through Chrome's prompt (${await opt.title().catch(() => '')}; ${JSON.stringify(after.origins)})`);
  }
  for (const x of h.br.pages().filter((y) => /\/options\.html/.test(y.url()))) await x.close().catch(() => {});
  await sleep(500);
  await h.br.clickToolbar();
  const panel = (await h.br.sidePanel(8000)) ?? (await h.br.panelInTab());
  return panel;
}

export default async function returning(opts = {}) {
  const h = await setup('02-returning', { title: 'The returning run after a browser restart', mockArgs: WAYNE_BASIC, mockEnv: { MOCK_QUEUE_S: '5', MOCK_START_S: '3', MOCK_LOGGED_IN: 'false' }, browser: opts.browser });
  try {
    await firstRunToOnline(h, { tour: false, queue: false });
    let p = await restart(h, 'the browser closes and starts again: the grid sign-in is forgotten');
    const asOf = await p.waitText(/As of \d{1,2}:\d\d/, 15_000);
    const m = await moment(h, 'returning, signed out');
    expectWords(h, 'returning, signed out', m.panel, [/As of \d{1,2}:\d\d\s?[AP]M\. Sign in to the grid to see it live\./, WORDS.home.gridSignedOut, WORDS.home.gridSignIn, WORDS.home.openSession]);
    h.run.check('the last known state is shown at once', !!asOf);
    const before = (await h.mock.saveLog()).requests.length;
    await p.press(WORDS.home.openSession);
    const env = await h.br.waitPage(/^https:\/\/claude\.ai\/code\?environment=env_/, 8000);
    const after = (await h.mock.saveLog()).requests.slice(before).filter((r) => r.kind === 'http' && !/dashboard\/?$/.test(r.path));
    h.run.check('"Open my session" opens the stored link without the grid', !!env && after.length === 0, after.map((r) => r.path).join(' '));
    await moment(h, 'open my session without the grid');
    // "Sign in" in the Grid row: the tab, the box, the tab closing, live again
    await p.press(WORDS.home.gridSignIn, { last: true });
    await gridSignIn(h);
    const live = await p.waitText(WORDS.home.gridSignedIn(ACCOUNT), 20_000);
    h.run.check('signed in again: the Grid row and the live state come back', !!live && (await p.waitText(/Wayne State grid · (up |online just now)/, 20_000)) !== undefined);
    await moment(h, 'live again');
    await stopWorker(h);
    p = await restart(h, 'the browser closes and starts again after Stop');
    await p.waitText(WORDS.home.stoppedHero, 15_000);
    await moment(h, 'stopped, signed out');
    await p.press(WORDS.home.connect);
    await gridSignIn(h);
    const anth = await h.br.waitPage(/^https:\/\/claude\.ai\/oauth\/authorize/, 15_000);
    h.run.check('Connect after a Stop: no Claude sign-in when the grid is signed in to Claude', !anth);
    await online(h);
  } catch (e) {
    if (!(e instanceof Stop)) h.run.check('the scenario ran to its end', false, e.stack?.split('\n').slice(0, 3).join(' '));
  }
  return teardown(h);
}
