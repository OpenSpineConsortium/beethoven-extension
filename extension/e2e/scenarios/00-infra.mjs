// Scenario 0: the harness's own machinery, with whatever build is in .output (10.0.0 works). It is not
// a scenario of the product: to prove the one-gesture path it adds a test button to the extension's own
// options page (Playwright evaluates in that page) whose click opens the side panel for the window and
// asks Chrome for the mock's origin, as 11.0.0's "Agree and continue" does. Then: Chrome's prompt
// answered through UI Automation; the real side panel read, pressed and photographed over its DevTools
// socket; Chrome's own HTTP sign-in box filled through UI Automation; the extension's service worker
// fetching the dashboard and opening the shell's WebSocket with the sign-in the browser holds (the
// tab-free design's premise); a keyless terminal page typed into; every request, tab and prompt logged.
import { ACCOUNT, HOST, PASSWORD, PORT, setup, SHARED_WAYNE, Stop, teardown } from '../lib/flows.mjs';
import { sleep } from '../lib/harness.mjs';

export default async function infra(opts = {}) {
  const h = await setup('00-infra', { title: 'The harness machinery (any build)', mockArgs: ['--auth', 'basic', '--keyless', '--shared-install', SHARED_WAYNE], browser: opts.browser });
  const origin = `https://${HOST}:${PORT}`;
  try {
    const opt = (await h.br.waitPage(/\/options\.html/, 15_000)) ?? (await h.br.newPage(`chrome-extension://${h.br.extId}/options.html`));
    h.run.check('the build opened its options page on install', !!opt, `${h.br.version}`);
    await opt.waitForLoadState();
    await opt.evaluate((o) => {
      const b = document.createElement('button');
      b.id = 'harness-gesture';
      b.textContent = 'Harness: panel and permission from one click';
      b.style.cssText = 'position:fixed;top:8px;right:8px;z-index:99999;padding:10px;font:14px sans-serif';
      let win;
      chrome.windows.getCurrent().then((w) => (win = w.id));
      b.onclick = () => {
        const p1 = chrome.sidePanel.open({ windowId: win }).then(() => 'opened', (e) => `ERR ${e.message}`);
        const p2 = chrome.permissions.request({ origins: [`${o}/*`] }).then((g) => (g ? 'granted' : 'denied'), (e) => `ERR ${e.message}`);
        Promise.all([p1, p2]).then(([a, c]) => (document.title = `panel ${a}; permission ${c}`));
      };
      document.body.append(b);
    }, `https://${HOST}`);
    h.run.note('test device: a button added to the extension\'s options page (infra only)');
    const s = h.br.surface(opt);
    h.br.acceptedAt = Date.now();
    await s.press('Harness: panel and permission from one click');
    const panel = await h.br.sidePanel(8000);
    const t0 = Date.now();
    while (!h.br.prompts.length && Date.now() - t0 < 8000) await sleep(200);
    await sleep(1500);
    h.run.check('one trusted click opened the side panel and raised Chrome\'s prompt', !!panel && h.br.prompts.length >= 1, `${await opt.title()}; prompts ${JSON.stringify(h.br.prompts)}`);
    h.run.check('the prompt names the one site and was answered Allow through UI Automation', h.br.prompts.some((p) => p.text.includes(HOST) && /pressed Allow/.test(p.action)));
    const perms = await h.br.permissions();
    h.run.check('the origin is granted', perms.origins.some((x) => x.includes(HOST)), JSON.stringify(perms.origins));
    if (panel) {
      const t = await panel.texts();
      h.run.check('the real side panel is read over its own DevTools socket', t.text.length > 0, t.text.slice(0, 120).replace(/\n/g, ' | '));
      const first = await panel.find(/.+/, { selector: 'button' });
      h.run.check('a control in the side panel is found by its label, with its position for a trusted click', !!first?.visible, JSON.stringify(first));
    }
    await h.br.moment('panel and permission', { page: opt }); // not the 11.0.0 panel: no hygiene check here
    // Chrome's own sign-in box, in a tab the harness opens
    const tab = await h.br.newPage();
    const nav = tab.goto(`${origin}/pun/sys/dashboard/`).catch(() => {});
    const box = await h.br.signInBox({ user: ACCOUNT, pass: PASSWORD });
    await nav;
    await tab.waitForLoadState().catch(() => {});
    h.run.check("Chrome's HTTP sign-in box filled through UI Automation; the dashboard says Logged in as st1234", /^BOX/.test(box) && (await tab.content()).includes(`Logged in as ${ACCOUNT}`), box);
    await h.br.moment('signed in by the box', { page: tab });
    await tab.close();
    await sleep(500);
    // the extension's own background, with the sign-in the browser holds and no portal tab
    const dash = await h.br.bg(async (o) => {
      const r = await fetch(`${o}/pun/sys/dashboard/`, { credentials: 'include' });
      return { status: r.status, logged: (await r.text()).includes('Logged in as') };
    }, origin);
    h.run.check('with the tab closed, the service worker\'s fetch carries the browser\'s Basic sign-in (200, Logged in as)', dash.status === 200 && dash.logged, JSON.stringify(dash));
    const ws = await h.br.bg(async (o) => {
      const page = await (await fetch(`${o}/pun/sys/shell/ssh/default`, { credentials: 'include' })).text();
      const csrf = /csrf=([^"]+)"/.exec(page)?.[1];
      return new Promise((resolve) => {
        const w = new WebSocket(`${o.replace(/^https/, 'wss')}/pun/sys/shell/ssh/default?csrf=${csrf}`);
        let text = '';
        const t = setTimeout(() => resolve({ opened: false, text }), 8000);
        w.onmessage = (m) => {
          text += m.data;
          if (/password: $/.test(text) || /\$ $/.test(text)) {
            clearTimeout(t);
            w.close();
            resolve({ opened: true, text: text.replace(/\x1b\][^\x07]*\x07/g, '') });
          }
        };
        w.onerror = () => resolve({ opened: false, text: 'error' });
      });
    }, origin);
    h.run.check('the service worker\'s WebSocket to the shell upgrades with the same sign-in (the keyless account asks for its password)', ws.opened && /password: $/.test(ws.text), JSON.stringify(ws));
    const log = await h.mock.saveLog();
    h.run.check("the mock saw the extension's shell handshake with auth=good and Origin chrome-extension://", log.requests.some((r) => r.kind === 'ws' && r.auth === 'good' && r.origin.startsWith('chrome-extension://') && r.status === 101));
    // the keyless terminal page, typed into as a student does
    const term = await h.br.newPage(`${origin}/pun/sys/shell/ssh/default`);
    await term.waitForFunction(() => /password: $/.test(document.body.innerText.trimEnd() + ' '), null, { timeout: 15_000 }).catch(() => {});
    await term.locator('textarea.xterm-helper-textarea').focus();
    await term.keyboard.type(PASSWORD);
    await term.keyboard.press('Enter');
    await term.waitForFunction(() => document.title !== 'Shell', null, { timeout: 10_000 }).catch(() => {});
    h.run.check('the keyless terminal page: the password typed in the page, the title becomes "st1234@login1:~"', (await term.title()) === `${ACCOUNT}@login1:~`, await term.title());
    await h.br.moment('terminal page', { page: term });
    h.run.check('the window screenshot works (Chrome\'s own UI is captured)', h.br.windowShot(`${h.run.dir}/window-check.png`));
  } catch (e) {
    if (!(e instanceof Stop)) h.run.check('the scenario ran to its end', false, e.stack?.split('\n').slice(0, 3).join(' '));
  }
  return teardown(h, { expectAccessService: false });
}
