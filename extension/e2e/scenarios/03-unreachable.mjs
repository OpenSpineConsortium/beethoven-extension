// Scenario 3: the grid unreachable, then back. Part 1 (moment 4): the mock is down when the student
// presses "Agree and continue": the GlobalProtect moment ("Turn on GlobalProtect." … "Looking for the
// grid…", after 45 s "Still looking…"), and when the mock comes up, "Connected." and on by itself with
// no press. Part 2 (the home): online, then the mock goes down: "Can't reach the grid" / "Is
// GlobalProtect on? Your worker keeps running.", the Grid row "Can't reach",
// "Open my session" still works; the mock comes back on the same home and the panel is live again.
import { agree, claudeSignIn, connect, expectWords, gotComputer, gridSignIn, moment, online, setup, statement, Stop, teardown, useAnotherPortal, WAYNE_BASIC, welcomeMoment, welcomePage } from '../lib/flows.mjs';
import { sleep } from '../lib/harness.mjs';
import { WORDS } from '../lib/words.mjs';

export default async function unreachable(opts = {}) {
  const h = await setup('03-unreachable', { title: 'The grid unreachable, then back', mockArgs: WAYNE_BASIC, mockEnv: { MOCK_QUEUE_S: '5', MOCK_START_S: '3', MOCK_LOGGED_IN: 'false' }, startMock: false, browser: opts.browser });
  try {
    await welcomePage(h);
    await welcomeMoment(h);
    await useAnotherPortal(h);
    await agree(h);
    const p = h.br.panel;
    const gp = await p.waitText(/Turn on (GlobalProtect|your VPN)\./, 20_000);
    let m = await moment(h, 'globalprotect');
    expectWords(h, 'moment 4', m.panel, [WORDS.globalprotect.title('GlobalProtect'), WORDS.globalprotect.body('GlobalProtect', 'protect.wayne.edu'), 'protect.wayne.edu', WORDS.globalprotect.copy, WORDS.globalprotect.looking]);
    h.run.check('the GlobalProtect moment appears only because the grid does not answer', !!gp);
    const still = await p.waitText(WORDS.globalprotect.still('GlobalProtect'), 60_000);
    h.run.check('after 45 s: "Still looking. Check that GlobalProtect says Connected."', !!still);
    h.run.check('there is no "Continue anyway"', !/Continue anyway/i.test((await p.text()) ?? ''));
    await moment(h, 'still looking');
    await h.mock.start();
    const t0 = Date.now();
    // "Connected." on a line of its own (the "Still looking" sentence also ends in "Connected.")
    const conn = await p.waitText(/(^|\n)\s*Connected\.\s*(\n|$)/, 15_000);
    h.run.check('the grid answers: "Connected." within a few seconds, with no press', !!conn, `${Date.now() - t0} ms`);
    if (conn) await moment(h, 'connected');
    await gridSignIn(h);
    await statement(h);
    await connect(h);
    await claudeSignIn(h);
    await gotComputer(h);
    await online(h);
    await p.waitText(/Wayne State grid · (up |online just now)/, 15_000);
    await h.mock.stop();
    const down = await p.waitText(WORDS.home.unreachableHero, 90_000);
    m = await moment(h, 'grid unreachable');
    expectWords(h, 'the home, grid unreachable', m.panel, [WORDS.home.unreachableHero, WORDS.home.unreachableSub('GlobalProtect'), WORDS.home.gridUnreachable, WORDS.home.openSession]);
    h.run.check('within a minute or so the panel says it cannot reach the grid (never "Failed to fetch")', !!down && !/Failed to fetch/.test(m.panel ?? ''));
    const n = h.br.pages().filter((x) => /claude\.ai\/code\?environment=/.test(x.url())).length;
    await p.press(WORDS.home.openSession);
    await sleep(2000);
    h.run.check('"Open my session" works while the grid is unreachable', h.br.pages().filter((x) => /claude\.ai\/code\?environment=/.test(x.url())).length >= n);
    await h.mock.start();
    const back = await p.waitText(/Wayne State grid · (up |online just now)/, 90_000);
    m = await moment(h, 'grid back');
    h.run.check('the mock is back (same home): the panel is live again, still signed in (the browser kept the sign-in)', !!back && (m.panel ?? '').includes(WORDS.home.gridSignedIn('st1234')));
  } catch (e) {
    if (!(e instanceof Stop)) h.run.check('the scenario ran to its end', false, e.stack?.split('\n').slice(0, 3).join(' '));
  }
  return teardown(h);
}
