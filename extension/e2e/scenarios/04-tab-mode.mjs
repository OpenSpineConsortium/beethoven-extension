// Scenario 4: tab mode (SPEC "The portal tab": a portal whose sign-in is a SameSite=Lax cookie, which
// the browser does not send on the extension's own WebSocket). The mock runs in cookie mode with
// --samesite lax; the student signs in on the mock's identity-provider page. The channel test must
// then choose "tab": the sign-in tab is kept (not closed), the earlier tab is brought back, the connect
// sitting runs through the page script (the mock sees the shell's Origin as the portal's own), the panel
// says "Working on the grid…" for a background action, and the portal tab is closed when the work ends.
import { ACCOUNT, agree, claudeSignIn, connect, HOST, moment, online, PORT, setup, SHARED_WAYNE, statement, Stop, stopWorker, teardown, useAnotherPortal, welcomeMoment, welcomePage } from '../lib/flows.mjs';
import { sleep } from '../lib/harness.mjs';
import { WORDS } from '../lib/words.mjs';

export default async function tabMode(opts = {}) {
  const h = await setup('04-tab-mode', { title: 'Tab mode: a SameSite=Lax cookie portal', mockArgs: ['--auth', 'cookie', '--samesite', 'lax', '--shared-install', SHARED_WAYNE], mockEnv: { MOCK_QUEUE_S: '10', MOCK_START_S: '3', MOCK_LOGGED_IN: 'false' }, browser: opts.browser });
  try {
    await welcomePage(h);
    await welcomeMoment(h);
    await useAnotherPortal(h);
    await agree(h);
    const idp = await h.br.waitPage(new RegExp(`${HOST}:${PORT}/login`), 15_000);
    if (!idp) throw new Error('the sign-in tab did not reach the identity-provider stand-in (/login)');
    await moment(h, 'cookie sign-in page', { page: idp });
    await h.br.surface(idp).press(`Sign in as ${ACCOUNT}`);
    h.presses.push('IdP: Sign in');
    const t = await h.br.panel.waitText(WORDS.grid.signedIn(ACCOUNT), 20_000);
    h.run.check('signed in through the cookie portal', !!t);
    await sleep(8000);
    const portalTab = [...h.br.tabs.values()].filter((x) => x.kind === 'tab' && x.url.includes(`${HOST}:${PORT}`) && !x.closedAt);
    h.run.check('tab mode: the portal tab is kept open (the cookie does not travel on the extension\'s WebSocket)', portalTab.length >= 1, portalTab.map((x) => x.url).join(' '));
    const store = await h.br.storage();
    const channel = Object.entries(store.local ?? {}).find(([k]) => /channel/i.test(k));
    h.run.check('the channel test recorded "tab"', !!channel && JSON.stringify(channel[1]).includes('"tab"'), JSON.stringify(channel));
    await moment(h, 'tab mode chosen');
    await statement(h);
    await connect(h);
    const log = await h.mock.saveLog();
    const connectShell = log.shells.find((s) => s.lines.some((l) => /hpcworker' connect /.test(l)));
    h.run.check("the connect sitting ran through the page script: the shell's Origin is the portal's own", !!connectShell && connectShell.origin === `https://${HOST}:${PORT}`, connectShell?.origin);
    await claudeSignIn(h);
    await online(h);
    await sleep(5000);
    const left = [...h.br.tabs.values()].filter((x) => x.kind === 'tab' && x.url.includes(`${HOST}:${PORT}`) && !x.closedAt);
    h.run.check('the portal tab is closed when the work ends (online)', left.length === 0, left.map((x) => x.url).join(' '));
    const tabsBefore = [...h.br.tabs.values()].length;
    const pStop = stopWorker(h);
    const working = await h.br.panel.waitText(/Working on the grid…/, 15_000);
    await pStop;
    const opened = [...h.br.tabs.values()].slice(tabsBefore).filter((x) => x.kind === 'tab' && x.url.includes(`${HOST}:${PORT}`));
    h.run.check('Stop in tab mode: "Working on the grid…", one background tab opened and closed again', !!working && opened.length >= 1 && opened.every((x) => x.closedAt), opened.map((x) => `${x.url} ${x.closedAt ? 'closed' : 'open'}`).join(' '));
  } catch (e) {
    if (!(e instanceof Stop)) h.run.check('the scenario ran to its end', false, e.stack?.split('\n').slice(0, 3).join(' '));
  }
  return teardown(h);
}
