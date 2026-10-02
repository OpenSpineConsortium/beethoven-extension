// Scenario 15 (12.0.0): no helper on this computer. The direct way's helper moment, "Use GlobalProtect
// instead", the fallback moment, then 11.0.0's way through the portal on the mock (Chrome's own sign-in box,
// where your work goes, Connect, the Claude sign-in, in line, online), the home's Grid row "Through
// GlobalProtect", and Settings' Connection. No grid stand-in runs; the helper is not registered.
import { claudeSignIn, connect, expectWords, gotComputer, gridSignIn, inLine, moment, online, setup, statement, step, Stop, teardown, ACCOUNT } from '../lib/flows.mjs';
import { FINAL, guardHits, hostKeyPresent, installHelperFromZip, openSettings, removeHostKey, TEST_EXT } from '../lib/direct.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { withAllowedOrigins } from '../../src/core/bridgeZip.ts';
import { sleep } from '../lib/harness.mjs';
import { WORDS } from '../lib/words.mjs';
import { MOCK_ARGS } from './13-direct-first-run.mjs';
import { toHelper } from './14-direct-passkey.mjs';

const W = WORDS.direct;

export default async function directNoHelper(opts = {}) {
  const h = await setup('15-direct-no-helper', {
    title: '12.0.0 no helper: Use GlobalProtect instead, then 11.0.0 on the mock',
    mockArgs: MOCK_ARGS,
    mockEnv: { MOCK_QUEUE_S: '75', MOCK_START_S: '8', MOCK_LOGGED_IN: 'false' }, // scenario 1's timings
    browser: { ...opts.browser, ext: TEST_EXT },
  });
  try {
    removeHostKey(h.run);
    h.run.check('no helper registered for the test browser', !hostKeyPresent());
    await toHelper(h);
    await step(h, 'the helper moment with no helper', async () => {
      const p = h.br.panel;
      const t = await p.waitText(W.installHelper.title, 60_000);
      if (!t) throw new Error(`no "${W.installHelper.title}"`);
      const m = await moment(h, 'helper moment, no helper');
      expectWords(h, 'install-helper', m.panel, [W.installHelper.title, W.installHelper.download('Windows'), W.installHelper.useVpn('GlobalProtect')]);
    });
    await step(h, 'Use GlobalProtect instead', async () => {
      const p = h.br.panel;
      await p.press(W.installHelper.useVpn('GlobalProtect'));
      h.presses.push('panel: Use GlobalProtect instead');
      const t = await p.waitText(new RegExp(`${W.fallback.title('GlobalProtect')}|${WORDS.grid.title}|GlobalProtect`), 20_000);
      const m = await moment(h, 'after Use GlobalProtect instead');
      h.run.check(`the fallback: "${W.fallback.title('GlobalProtect')}" (or straight to the 11.0.0 moments)`, !!t, (m.panel ?? '').slice(0, 200));
      if ((m.panel ?? '').includes(W.fallback.title('GlobalProtect'))) {
        expectWords(h, 'fallback-to-vpn', m.panel, [W.fallback.title('GlobalProtect'), W.fallback.body('GlobalProtect'), W.fallback.continue, W.fallback.tryDirect]);
        await p.press(W.fallback.continue);
        h.presses.push('panel: Continue');
        await sleep(1500);
        await moment(h, 'after the fallback Continue');
      }
    });
    // 11.0.0 from here, on the mock: on 11.0.0's first run the agreement's press opened the portal's sign-in itself;
    // after "Use GlobalProtect instead" the panel shows the grid moment and the student presses its button
    await step(h, 'the grid moment after the fallback', async () => {
      const p = h.br.panel;
      const t = await p.waitText(WORDS.grid.title, 15_000);
      const m = await moment(h, 'grid moment after the fallback');
      h.run.check(`the 11.0.0 grid moment: "${WORDS.grid.title}"`, !!t, (m.panel ?? '').slice(0, 200));
      const b = (await p.find('Sign in again')) ?? (await p.find(/^Sign in/));
      if (b?.visible) {
        h.run.note(`the grid moment's button on this first run reads "${b.name}" (beside "Signed out")`);
        await p.clickAt(b.x, b.y);
        h.presses.push(`panel: ${b.name}`);
      }
    });
    await gridSignIn(h, { expectTabClose: true });
    await statement(h);
    await connect(h);
    await claudeSignIn(h);
    await inLine(h, { tour: false });
    await gotComputer(h);
    await online(h);
    await step(h, 'the home: Grid "Through GlobalProtect"', async () => {
      const p = h.br.panel;
      await sleep(2000);
      const m = await moment(h, 'home through GlobalProtect');
      h.run.check(`the home's Grid row: "${W.rowVpn('GlobalProtect')}"`, (m.panel ?? '').includes(W.rowVpn('GlobalProtect')), (m.panel ?? '').slice(0, 300));
      const { page } = await openSettings(h);
      const s = await moment(h, 'settings connection (no helper)', { page });
      expectWords(h, 'Settings: Connection', s.page, [W.settings.title.toUpperCase(), W.settings.helper, W.settings.helperMissing, W.settings.modes.vpn]);
    });
    await step(h, 'the way back to the direct way after "Use GlobalProtect instead"', async () => {
      // the helper is installed now (from the package's zip), and Settings' Connection is set to "Direct when possible"
      // the package's zip carries the placeholder its installer refuses; the copy the page saves names this
      // extension (core/bridgeZip.ts): made here the same way, for the test extension's id
      const packaged = path.join(TEST_EXT, 'bridge', 'beethoven-bridge-windows.zip');
      const zip = path.join(FINAL, 'student', 'beethoven-bridge-windows-for-test-id.zip');
      fs.mkdirSync(path.dirname(zip), { recursive: true });
      fs.writeFileSync(zip, withAllowedOrigins(new Uint8Array(fs.readFileSync(packaged)), `chrome-extension://${h.br.extId}/`));
      const r = await installHelperFromZip(h.run, zip);
      h.run.check('the helper installed afterwards (exit 0)', r.code === 0);
      const pg = h.br.page(/\/options\.html/);
      const sp = h.br.surface(pg);
      const vpnOpt = await sp.find(W.settings.modes.vpn);
      if (vpnOpt?.visible) await sp.clickAt(vpnOpt.x, vpnOpt.y);
      await sleep(1500);
      const directOpt = await sp.find(W.settings.modes.direct);
      if (directOpt?.visible) await sp.clickAt(directOpt.x, directOpt.y);
      await sleep(1500);
      await moment(h, 'settings: Direct when possible chosen again', { page: pg });
      const p = h.br.panel;
      const t = await p.waitText(new RegExp(`${W.signin.title}|${W.installHelper.title}|${W.rowDirect}(?!\\w)`), 45_000);
      const m = await moment(h, 'panel after Direct when possible');
      const direct = !!t && !(m.panel ?? '').includes(W.rowVpn('GlobalProtect'));
      h.run.check('after "Use GlobalProtect instead", Settings > "Direct when possible" (with the helper installed) brings the direct way back', direct, (m.panel ?? '').slice(0, 300));
      const st = await h.br.bg(async () => ({ direct: (await chrome.storage.local.get('bridge.direct'))['bridge.direct'] ?? null })).catch((e) => ({ error: e.message }));
      h.run.ev('STATE', `DIRECT_KEY after Direct when possible: ${JSON.stringify(st).slice(0, 300)}`);
      removeHostKey(h.run);
    });
  } catch (e) {
    if (!(e instanceof Stop)) h.run.check('the scenario ran to its end', false, e.stack?.split('\n').slice(0, 3).join(' '));
  }
  h.run.check('no attempt to open grid.wayne.edu through a helper (the verification guard saw none)', guardHits().length === 0, guardHits().join(' | '));
  return teardown(h);
}
