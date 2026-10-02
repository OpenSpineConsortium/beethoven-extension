// Scenario 11 (added by the verifier): the waiting table's reason variants (SPEC "Waiting and status").
// The scheduler's reason reaches the panel through `worker status --json`, asked once a minute while the
// worker is in line (the 60 s scheduler floor makes the first one about a minute after Connect). Two
// runs: QOSMaxJobsPerUserLimit ("Waiting for your share of the grid" / "It starts when your other grid
// jobs finish.") and ReqNodeNotAvail ("The grid is under maintenance" / "Your worker starts when it's
// back."), each with the toolbar's badge and title. "Past 15 min" is not played (it would take 15 min).
import { agree, claudeSignIn, connect, expectWords, gridSignIn, moment, setup, statement, Stop, teardown, useAnotherPortal, WAYNE_BASIC, welcomePage } from '../lib/flows.mjs';
import { WORDS } from '../lib/words.mjs';

const Q = WORDS.queue;
const CASES = [
  { reason: 'QOSMaxJobsPerUserLimit', hero: Q.shareHero, sub: Q.shareSub, log: /In line: /, label: 'share' },
  { reason: 'ReqNodeNotAvail, UnavailableNodes:node[01-04]', hero: Q.maintenanceHero, sub: Q.maintenanceSub, log: /In line: /, label: 'maintenance' },
];

async function one(c, opts) {
  const h = await setup(`11-queue-${c.label}`, { title: `In line, reason ${c.reason}`, mockArgs: WAYNE_BASIC, mockEnv: { MOCK_QUEUE_S: '240', MOCK_QUEUE_REASON: c.reason, MOCK_START_S: '3', MOCK_LOGGED_IN: 'false' }, browser: opts.browser });
  try {
    await welcomePage(h);
    await useAnotherPortal(h);
    await agree(h);
    await gridSignIn(h);
    await statement(h);
    await connect(h);
    await claudeSignIn(h);
    const p = h.br.panel;
    const skip = await p.waitFind(WORDS.tour.skip, 8000);
    if (skip?.visible) await p.press(WORDS.tour.skip);
    const t0 = Date.now();
    const t = await p.waitText(c.hero, 120_000);
    h.run.ev('TIMING', `"${c.hero}" ${t ? `after ${Date.now() - t0} ms` : 'not seen in 120 s'}`);
    const m = await moment(h, `in line, ${c.label}`);
    expectWords(h, `in line, reason ${c.reason}`, m.panel, [c.hero, c.sub]);
    const tb = m.toolbar ?? {};
    h.run.check(`in line (${c.label}): badge "Nm" ochre and title "Beethoven · In line for N min"`, /^\d+m$/.test(tb.badge ?? '') && /^Beethoven · In line for \d+ min$/.test(tb.title ?? '') && JSON.stringify(tb.color) === '[143,78,23,255]', JSON.stringify(tb));
  } catch (e) {
    if (!(e instanceof Stop)) h.run.check('the scenario ran to its end', false, e.stack?.split('\n').slice(0, 3).join(' '));
  }
  return teardown(h);
}

export default async function queueReasons(opts = {}) {
  const parts = [];
  for (const c of CASES) parts.push(await one(c, opts));
  return { scenario: '11-queue-reasons', passed: parts.reduce((s, r) => s + r.passed, 0), failed: parts.reduce((s, r) => s + r.failed, 0), parts };
}
