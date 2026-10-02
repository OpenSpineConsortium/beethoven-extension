// Scenario 7: reduced motion and a 320 px panel (SPEC "The look": reduced motion; the panel designed
// at 360 x 658 and working down to 300 px; the welcome page at phone width). The browser runs with
// --force-prefers-reduced-motion. The welcome page is read at 360 px wide and its "Show terms" opened
// (optional, in place, never required); the panel is narrowed to 320 px through DevTools emulation (a
// real side panel's width is the student's drag, which no API sets). At each moment: no horizontal
// scroll, no animation that runs for ever, and the tour as still frames with "Next".
import { agree, claudeSignIn, connect, gridSignIn, inLine, moment, online, setup, statement, Stop, teardown, useAnotherPortal, WAYNE_BASIC, welcomeMoment, welcomePage } from '../lib/flows.mjs';
import { sleep } from '../lib/harness.mjs';
import { WORDS } from '../lib/words.mjs';

const LAYOUT = `() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, forever: document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming().iterations === Infinity).length })`;

async function layout(h, surface, where) {
  const l = await surface.eval(LAYOUT).catch(() => null);
  if (!l) return;
  h.run.check(`${where}: no horizontal scroll at ${l.cw} px`, l.sw <= l.cw + 1, JSON.stringify(l));
  h.run.check(`${where}: reduced motion is in force and nothing animates for ever`, l.reduce && l.forever === 0, JSON.stringify(l));
}

export default async function motionWidth(opts = {}) {
  const h = await setup('07-motion-width', { title: 'Reduced motion and a 320 px panel', mockArgs: WAYNE_BASIC, mockEnv: { MOCK_QUEUE_S: '120', MOCK_START_S: '3', MOCK_LOGGED_IN: 'false' }, browser: { ...opts.browser, reducedMotion: true } });
  try {
    await welcomePage(h);
    await h.welcomePage.setViewportSize({ width: 360, height: 740 });
    await welcomeMoment(h);
    await layout(h, h.welcome, 'the welcome page at 360 px');
    const agreeBtn = await h.welcome.find(WORDS.welcome.agree);
    h.run.check('at phone width the tick and the button stay in view without scrolling', !!agreeBtn && agreeBtn.y < 740, JSON.stringify(agreeBtn));
    await h.welcome.press(WORDS.welcome.showTerms);
    const terms = await h.welcome.waitText(WORDS.welcome.hideTerms, 5000);
    const m = await moment(h, 'show terms', { page: h.welcomePage });
    h.run.check('"Show terms" expands in place to "Hide terms" with Open in a tab · Save a copy · Print', !!terms && [WORDS.welcome.openInTab, WORDS.welcome.saveCopy, WORDS.welcome.print].every((s) => (m.page ?? '').includes(s)));
    const region = await h.welcome.eval(`() => { const el = [...document.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 200 && /LICENSE|Licence|license/i.test(e.innerText.slice(0, 2000)) && getComputedStyle(e).overflowY !== 'visible'); return el ? Math.round(el.getBoundingClientRect().height) : null; }`);
    h.run.check('the terms sit in a scroll region of about 360 px', region !== null && region <= 380 && region >= 200, String(region));
    await h.welcome.press(WORDS.welcome.hideTerms);
    await h.welcomePage.setViewportSize({ width: 1280, height: 800 });
    await useAnotherPortal(h);
    await agree(h);
    const p = h.br.panel;
    if (p.kind === 'panel') {
      await p.h.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 658, deviceScaleFactor: 0, mobile: false });
      h.run.note('the panel is narrowed to 320 px by DevTools emulation (the real width is the student\'s drag)');
    }
    await gridSignIn(h);
    await statement(h);
    await layout(h, p, 'moment 6 at 320 px');
    await connect(h);
    await claudeSignIn(h);
    await inLine(h, { tour: false });
    await layout(h, p, 'in line at 320 px');
    await p.press(WORDS.home.more).catch(() => {});
    await sleep(500);
    await p.press(WORDS.home.menu.tour).catch(() => h.run.note('no "See what it can do" in the ⋯ menu while in line'));
    const next = await p.waitFind(WORDS.tour.next, 6000);
    const shots = [];
    for (let i = 0; i < 4 && next?.visible; i++) {
      shots.push((await p.text()).includes(WORDS.tour.captions[i]));
      await moment(h, `tour still frame ${i + 1}`);
      if (i < 3) await p.press(WORDS.tour.next).catch(() => {});
    }
    h.run.check('with reduced motion the tour is four still frames with "Next"', shots.length === 4 && shots.every(Boolean), JSON.stringify(shots));
    await p.press(WORDS.tour.done).catch(() => p.press(WORDS.tour.skip).catch(() => {}));
    await online(h);
    await layout(h, p, 'online at 320 px');
  } catch (e) {
    if (!(e instanceof Stop)) h.run.check('the scenario ran to its end', false, e.stack?.split('\n').slice(0, 3).join(' '));
  }
  return teardown(h);
}
