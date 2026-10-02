// Scenario 8: an Anthropic address typed under "Use another portal" (SPEC moment 2: "An Anthropic
// address is refused before any prompt: That's a Claude address, not your grid."; AM7: Beethoven holds
// no site permission on claude.ai, claude.com or anthropic.com). No Chrome prompt may appear (the
// harness watches with no button pressed, and any prompt is a FAIL), no Anthropic origin may be
// granted, and nothing may be requested from Anthropic. Before the agreement and with the box ticked.
import { moment, setup, Stop, teardown, useAnotherPortal, welcomePage } from '../lib/flows.mjs';
import { sleep } from '../lib/harness.mjs';
import { AFFIRMATION, loose, WORDS } from '../lib/words.mjs';

const ADDRESSES = ['claude.ai', 'https://claude.ai/code', 'www.claude.com', 'claude.com/pun/sys/dashboard', 'anthropic.com', 'api.anthropic.com', 'CLAUDE.AI.', 'foo.bar.claude.ai:443'];

export default async function anthropicPortal(opts = {}) {
  const h = await setup('08-anthropic-portal', { title: 'An Anthropic address under "Use another portal"', mockArgs: ['--auth', 'basic'], browser: opts.browser, prompts: 'None' });
  try {
    await welcomePage(h);
    for (const ticked of [false, true]) {
      if (ticked) await h.welcome.press(loose(AFFIRMATION.bold));
      for (const a of ADDRESSES) {
        const before = h.br.prompts.length;
        const t = await useAnotherPortal(h, a, { expectRefusal: true });
        await sleep(4000);
        const perms = await h.br.permissions().catch(() => ({ origins: [] }));
        h.run.check(`"${a}"${ticked ? ' (box ticked)' : ''}: refused before any prompt, "${WORDS.welcome.anthropicRefused}"`, h.br.prompts.length === before && (t ?? '').includes(WORDS.welcome.anthropicRefused) && !perms.origins.some((o) => /claude|anthropic/i.test(o)), `prompts ${h.br.prompts.length - before}; origins ${JSON.stringify(perms.origins)}`);
      }
      await moment(h, ticked ? 'anthropic refused, box ticked' : 'anthropic refused', { page: h.welcomePage });
    }
    h.run.check('no request ever went to an Anthropic host', !h.br.requests.some((r) => r.to === 'anthropic'));
    h.run.check('no permission prompt at all', h.br.prompts.length === 0, JSON.stringify(h.br.prompts));
  } catch (e) {
    if (!(e instanceof Stop)) h.run.check('the scenario ran to its end', false, e.stack?.split('\n').slice(0, 3).join(' '));
  }
  return teardown(h, { expectAccessService: false });
}
