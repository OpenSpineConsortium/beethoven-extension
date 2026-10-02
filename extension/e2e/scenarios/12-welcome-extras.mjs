// Scenario 12 (added by the verifier): the welcome page's states scenarios 1 to 8 do not picture (SPEC moment
// 2). At 1280 x 720: "Show terms" opened in place; then, with the university's own default address (the
// harness maps it to NOTFOUND and aborts any request to it), the tick and "Agree and continue": the button's
// "Opening the grid…" while Chrome's prompt is up, then Deny in Chrome's prompt: "Beethoven needs
// ondemand.grid.wayne.edu to work." with "Try again". Nothing is granted and nothing reaches the university.
import { expectWords, moment, setup, Stop, teardown, welcomePage } from '../lib/flows.mjs';
import { sleep } from '../lib/harness.mjs';
import { AFFIRMATION, loose, WORDS } from '../lib/words.mjs';

const W = WORDS.welcome;

export default async function welcomeExtras(opts = {}) {
  const h = await setup('12-welcome-extras', { title: 'The welcome page: Show terms, Opening the grid, Deny', mockArgs: ['--auth', 'basic'], browser: opts.browser, prompts: 'None' });
  try {
    await welcomePage(h);
    await h.welcomePage.setViewportSize({ width: 1280, height: 720 });
    await h.welcome.press(W.showTerms);
    await h.welcome.waitText(W.hideTerms, 5000);
    await sleep(700);
    const m = await moment(h, 'welcome, show terms', { page: h.welcomePage });
    expectWords(h, 'Show terms', m.page, [W.hideTerms, W.openInTab, W.saveCopy, W.print, /Version 8, 2026-10-01\./]);
    // measured where the page is, without scrolling it (find() would scroll the button into view)
    const agree = await h.welcomePage.evaluate((label) => {
      window.scrollTo(0, 0);
      const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === label);
      const r = b?.getBoundingClientRect();
      return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, sh: document.documentElement.scrollHeight } : null;
    }, W.agree);
    h.run.check('at 1280 x 720 with the terms open, "Agree and continue" is still in view without scrolling', !!agree && agree.bottom <= agree.vh, JSON.stringify(agree));
    await h.welcome.press(W.hideTerms);
    await sleep(500);
    // the default address: the press asks Chrome for ondemand.grid.wayne.edu; the student presses Deny
    h.br.watchPrompts('None');
    await h.welcome.press(loose(AFFIRMATION.bold));
    h.br.acceptedAt = Date.now();
    await h.welcome.press(W.agree);
    const t0 = Date.now();
    while (!h.br.prompts.length && Date.now() - t0 < 10_000) await sleep(200);
    const opening = await h.welcome.waitText(W.opening, 3000);
    await moment(h, 'welcome, opening the grid, Chrome asks', { page: h.welcomePage });
    h.run.check(`while Chrome asks, the button reads "${W.opening}"`, !!opening);
    h.run.check("Chrome's prompt names ondemand.grid.wayne.edu", h.br.prompts.some((p) => /ondemand\.grid\.wayne\.edu/.test(p.text)), JSON.stringify(h.br.prompts));
    h.br.watchPrompts('Deny');
    const denied = await h.welcome.waitText(W.denied('ondemand.grid.wayne.edu'), 15_000);
    await sleep(500);
    const md = await moment(h, 'welcome, denied', { page: h.welcomePage });
    h.run.check(`Deny: "${W.denied('ondemand.grid.wayne.edu')}" with "${W.tryAgain}"`, !!denied && (md.page ?? '').includes(W.tryAgain), (md.page ?? '').slice(0, 0));
    const perms = await h.br.permissions().catch(() => ({ origins: [] }));
    h.run.check('after Deny nothing is granted', perms.origins.length === 0, JSON.stringify(perms.origins));
    await sleep(4000);
    h.run.check('after Deny nothing reaches the university', !h.br.requests.some((r) => r.to === 'UNIVERSITY'), h.br.requests.filter((r) => r.to === 'UNIVERSITY').map((r) => r.url).join(' '));
    h.run.note(`requests after the press: ${h.br.requests.map((r) => `${r.to} ${r.method} ${r.url.slice(0, 70)}`).join(' | ')}`);
  } catch (e) {
    if (!(e instanceof Stop)) h.run.check('the scenario ran to its end', false, e.stack?.split('\n').slice(0, 3).join(' '));
  }
  return teardown(h, { expectAccessService: false });
}
