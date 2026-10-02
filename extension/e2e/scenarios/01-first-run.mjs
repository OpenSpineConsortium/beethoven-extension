// Scenario 1: the first run on HTTP Basic with a 75-second queue (SPEC "The first run", moments 1-13,
// then the home: Show log, Phone, New session, Copy link, Stop with its confirmation, Stopped).
// The portal is the mock at https://ondemand.wayne.localhost:8443 (the site reads as "wayne", so the
// bundled Wayne profile, its shared copy and "Wayne State grid" apply), reached through "Use another
// portal" because the default address is the real university's, which the harness never touches.
import { agree, claudeSignIn, connect, copyLink, gotComputer, gridSignIn, home, inLine, newSession, online, phone, setup, showLog, statement, Stop, stopWorker, teardown, useAnotherPortal, WAYNE_BASIC, welcomeMoment, welcomePage } from '../lib/flows.mjs';

/** the first run up to online, shared by the scenarios that start from it */
export async function firstRunToOnline(h, { tour = true, claude = {}, queue = true } = {}) {
  await welcomePage(h);
  await welcomeMoment(h);
  await useAnotherPortal(h);
  await agree(h);
  await gridSignIn(h);
  await statement(h);
  await connect(h);
  await claudeSignIn(h, claude);
  // a short mock queue (a few seconds) passes during the Claude sign-in: then there is no queue moment to see
  if (queue) {
    await inLine(h, { tour });
    await gotComputer(h);
  }
  await online(h);
}

export default async function firstRun(opts = {}) {
  const h = await setup('01-first-run', {
    title: 'First run on HTTP Basic with a 75-second queue',
    mockArgs: WAYNE_BASIC,
    mockEnv: { MOCK_QUEUE_S: '75', MOCK_START_S: '8', MOCK_LOGGED_IN: 'false' },
    browser: opts.browser,
  });
  try {
    await firstRunToOnline(h);
    const toOnline = h.presses.length;
    // the spec counts 9; typing the mock's address under "Use another portal" adds "Use another portal" and "Use this portal"
    h.run.check('the first run took 9 presses (plus 2 for "Use another portal" and "Use this portal" on the mock)', toOnline === 11, `${toOnline}: ${h.presses.join('; ')}`);
    await home(h);
    await showLog(h);
    await phone(h);
    await newSession(h);
    await copyLink(h);
    await stopWorker(h);
  } catch (e) {
    if (!(e instanceof Stop)) h.run.check('the scenario ran to its end', false, e.stack?.split('\n').slice(0, 3).join(' '));
  }
  return teardown(h);
}
