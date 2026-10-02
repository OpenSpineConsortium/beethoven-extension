// Scenario 9: a long Claude sign-in (AM4; contract D32). The student takes six minutes on Anthropic's
// page before pasting (--minutes N changes it; the contract's own test is 10.5 with MOCK_CODE_WAIT_S=700).
// By default the panel is CLOSED while the student is away, so only the extension's service worker
// holds the sign-in sitting: that is the case Check 5 asks about. --panel-open keeps the panel open
// instead (10.0.0's way, and AM4's fallback). The mock's OnDemand idle limit stays at its 300 s
// default, so the sitting survives only if the framework's keepalive lines flow; the harness logs the
// "{}" frames the extension sends, every service-worker stop, and whether the sitting was still open
// when the code was pasted.
import { agree, claudeSignIn, connect, gridSignIn, online, setup, statement, Stop, teardown, useAnotherPortal, WAYNE_BASIC, welcomePage } from '../lib/flows.mjs';

export default async function longSignin(opts = {}) {
  const minutes = Number(opts.minutes ?? 6);
  const panelOpen = !!opts.panelOpen;
  const h = await setup(`09-long-signin${panelOpen ? '-panel-open' : ''}`, { title: `A ${minutes}-minute Claude sign-in, panel ${panelOpen ? 'open' : 'closed'}`, mockArgs: WAYNE_BASIC, mockEnv: { MOCK_QUEUE_S: '5', MOCK_START_S: '3', MOCK_LOGGED_IN: 'false', ...(minutes > 9 ? { MOCK_CODE_WAIT_S: '700' } : {}) }, browser: opts.browser });
  try {
    await welcomePage(h);
    await useAnotherPortal(h);
    await agree(h);
    await gridSignIn(h);
    await statement(h);
    await connect(h);
    const before = await h.mock.state();
    await claudeSignIn(h, { waitBeforePasteMs: minutes * 60_000, closePanelWhileWaiting: !panelOpen });
    const after = await h.mock.state();
    h.run.check(`the sign-in sitting survived ${minutes} minutes with the panel ${panelOpen ? 'open' : 'closed'}`, after.idleKills === before.idleKills, JSON.stringify({ keepaliveFrames: after.keepaliveFrames - before.keepaliveFrames, idleKills: after.idleKills }));
    h.run.note(`"{}" frames from the extension during the wait: ${after.keepaliveFrames - before.keepaliveFrames}; the service worker stopped ${h.br.workerStops ?? 0} time(s) (WORKER lines in events.log)`);
    await online(h);
  } catch (e) {
    if (!(e instanceof Stop)) h.run.check('the scenario ran to its end', false, e.stack?.split('\n').slice(0, 3).join(' '));
  }
  return teardown(h);
}
