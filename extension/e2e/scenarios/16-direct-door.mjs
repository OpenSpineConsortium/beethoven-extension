// Scenario 16 (12.0.0): the grid's door, with reduced motion and the panel at 320 px. Against the local grid
// stand-in, never the grid.
//
//   the stand-in started with ANOTHER host key (not the pinned one): the AccessID -> "The grid didn't prove who
//   it is" and no prompt; the server saw no user name, no password, nothing after the key exchange ->
//   the stand-in down: "Can't reach the grid directly right now." with GlobalProtect offered -> the stand-in
//   back with the pinned key: the sign-in goes through and the computer is set up.
import { expectWords, moment, setup, step, Stop, teardown, ACCOUNT } from '../lib/flows.mjs';
import { FINAL, Grid, GRID_CODE, GRID_PASSWORD, guardHits, openSettings, pressSel, removeHostKey, TEST_EXT, typeInto, watchDownloads } from '../lib/direct.mjs';
import { sleep } from '../lib/harness.mjs';
import { WORDS } from '../lib/words.mjs';
import path from 'node:path';
import { continueAfterEnrolled, enrolled, helperMoment, MOCK_ARGS, sheetAccount, sheetAnswer } from './13-direct-first-run.mjs';
import { keyRecord, toHelper } from './14-direct-passkey.mjs';

const W = WORDS.direct;

async function narrow(h) {
  const p = h.br.panel;
  if (p?.kind === 'panel') await p.h.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 658, deviceScaleFactor: 0, mobile: false }).catch(() => {});
}

async function fits(h, slug) {
  const p = h.br.panel;
  const f = await p.eval(`() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, w: innerWidth, rm: matchMedia('(prefers-reduced-motion: reduce)').matches })`);
  h.run.check(`${slug}: no sideways scroll at ${f.w} px, reduced motion ${f.rm ? 'on' : 'OFF'}`, f.sw <= f.cw + 1 && f.w <= 320 && f.rm, JSON.stringify(f));
}

export default async function directDoor(opts = {}) {
  const grid = new Grid({ ev: () => {}, dir: FINAL }, { queueS: 15, startS: 5 });
  const h = await setup('16-direct-door', {
    title: '12.0.0 the door: a wrong host key, the door down, then back; reduced motion, 320 px',
    mockArgs: MOCK_ARGS,
    mockEnv: { MOCK_LOGGED_IN: 'false' },
    browser: { ...opts.browser, ext: TEST_EXT, reducedMotion: true },
  });
  grid.run = h.run;
  try {
    removeHostKey(h.run);
    grid.setup();
    await grid.start();
    await watchDownloads(h.br, path.join(FINAL, 'student', 'Downloads'));
    await toHelper(h);
    await narrow(h);
    await helperMoment(h, grid);
    await narrow(h);
    await step(h, 'the door down: unreachable, with Try again and GlobalProtect', async () => {
      await grid.stop();
      const n0 = grid.log().length;
      await sheetAccount(h, ACCOUNT);
      const p = h.br.panel;
      const t = await p.waitText(new RegExp(`${W.signin.unreachableTitle}|${W.unreachableSub}`), 60_000);
      const m = await moment(h, 'door down');
      await fits(h, 'door down');
      h.run.check(`the door down: "${W.signin.unreachableTitle}" ("${W.signin.unreachableBody}") with Try again and "Use GlobalProtect instead"`, !!t && (m.panel ?? '').includes(W.signin.unreachableBody) && /Try again/.test(m.panel ?? '') && /Use GlobalProtect instead/.test(m.panel ?? ''), (m.panel ?? '').slice(0, 300));
      h.run.check('the door down: nothing reached the server', grid.log().length === n0);
    });
    await step(h, 'a wrong host key: refused before any credential', async () => {
      await grid.start({ hostKey: 'other' });
      const n0 = grid.log().length;
      const p = h.br.panel;
      const b = (await p.find(W.signin.tryAgain)) ?? (await p.find(/Try again/));
      if (!b?.visible) throw new Error('no Try again after the door was down');
      await p.clickAt(b.x, b.y);
      h.presses.push('panel: Try again');
      const t = await p.waitText(new RegExp(`${W.signin.wrongGrid.replace(/[.?]/g, '\\$&')}|Password:`), 30_000);
      const m = await moment(h, 'wrong host key');
      await fits(h, 'wrong host key');
      h.run.check(`a wrong host key: "${W.signin.wrongGridTitle}", "${W.signin.wrongGrid}" and no prompt`, !!t && t.includes(W.signin.wrongGridTitle) && t.includes(W.signin.wrongGrid) && !/Password:/.test(t), (m.panel ?? '').slice(0, 300));
      h.run.check('a wrong host key: a quiet Try again is offered (the pin is checked again), not only "Use GlobalProtect instead"', /Try again/.test(m.panel ?? '') && /Use GlobalProtect instead/.test(m.panel ?? ''), (m.panel ?? '').slice(0, 300));
      const after = grid.log().slice(n0);
      h.run.check('the server saw a connection and NO user name, method or answer (the pin failed after the key exchange; nothing was sent)', after.some((e) => e.event === 'connect') && !after.some((e) => /^(userauth|kbdint|password|publickey)/.test(e.event)), after.map((e) => e.event).join(','));
      h.run.note(`after a wrong host key the sheet offers: ${['Try again', 'Cancel', 'Change', 'Use GlobalProtect instead'].filter((x) => (m.panel ?? '').includes(x)).join(', ') || 'nothing'}`);
    });
    await step(h, "after a wrong host key: the stand-in back on the pinned key, the stop's own quiet Try again", async () => {
      await grid.start();
      // 12.0.0 reviews: the wrong-grid stop offers a quiet Try again (the pin is checked again); no new background is needed
      const p = h.br.panel;
      const b = await p.find(W.signin.tryAgain);
      if (!b?.visible) throw new Error('no Try again on the wrong-grid stop');
      await p.clickAt(b.x, b.y);
      h.presses.push('panel: Try again (after the wrong host key)');
      const back = await p.waitText('Password:', 30_000);
      await moment(h, 'Try again after the wrong key');
      h.run.check("the wrong-grid stop's Try again, with the grid back on its pinned key, reaches the grid's own prompt", !!back, (back ?? '').slice(0, 200).replace(/\n/g, ' | '));
    });
    await step(h, 'the door back, with the pinned key', async () => {
      const p = h.br.panel;
      const pw = await p.waitText('Password:', 20_000);
      if (!pw && (await p.find(W.signin.tryAgain))?.visible) await p.press(W.signin.tryAgain);
      if (!pw && !(await p.waitText('Password:', 15_000))) {
        const f = await p.find(/[\s\S]*/, { selector: '#sheet-account' });
        if (f?.visible) {
          await typeInto(p, '#sheet-account', ACCOUNT);
          await pressSel(p, '#sheet-submit');
        }
      }
      await sheetAnswer(h, 'password', GRID_PASSWORD, { shot: 'password prompt at 320' });
      await fits(h, 'the sheet');
      await sheetAnswer(h, 'code', GRID_CODE, { shot: 'code prompt at 320' });
      await enrolled(h, grid);
      await fits(h, 'enrolled');
      await continueAfterEnrolled(h);
      await h.br.panel.waitText(W.protectKey.title, 15_000);
      await moment(h, 'protect card at 320');
      await fits(h, 'protect card');
      await h.br.panel.press(W.protectKey.notNow);
      await sleep(1500);
      await moment(h, 'after the card at 320');
      await fits(h, 'after the card');
    });
    await step(h, 'Settings: protection off by default; on (a passkey made), then off again (one prompt)', async () => {
      const { page, surface: sp } = await openSettings(h);
      await page.setViewportSize({ width: 320, height: 720 }).catch(() => {});
      const cdp = await h.br.context.newCDPSession(page);
      await cdp.send('WebAuthn.enable', { enableUI: false });
      const auth = (await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } })).authenticatorId;
      const creds = async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId: auth })).credentials;
      const state = () => sp.eval(`() => document.querySelector('#protect-key')?.getAttribute('aria-checked')`);
      const sw = await sp.waitFind(/[\s\S]*/, 5000, { selector: '#protect-key' });
      h.run.check('Settings: "Protect my key with Windows Hello / Touch ID" is off by default', (await state()) === 'false');
      await moment(h, 'settings protection off by default (320)', { page });
      await sp.clickAt(sw.x, sw.y);
      let on;
      for (let i = 0; i < 40 && on !== 'true'; i++) {
        await sleep(300);
        on = await state();
      }
      const c = await creds();
      h.run.check('Settings, switch on: a passkey is made and the switch is on', on === 'true' && c.length === 1, `${on}, ${c.length} credential(s)`);
      const rec = await keyRecord(h.br);
      h.run.check('switch on: the key is wrapped under the passkey (kind prf)', JSON.stringify(rec).includes('"kind":"prf"'), JSON.stringify(rec).slice(0, 200));
      await moment(h, 'settings protection on (320)', { page });
      const n0 = c[0]?.signCount ?? 0;
      const sw2 = await sp.waitFind(/[\s\S]*/, 5000, { selector: '#protect-key' });
      await sp.clickAt(sw2.x, sw2.y);
      let off;
      for (let i = 0; i < 40 && off !== 'false'; i++) {
        await sleep(300);
        off = await state();
      }
      const n1 = (await creds())[0]?.signCount ?? 0;
      h.run.check('Settings, switch off: one Windows Hello / Touch ID prompt and the switch is off', off === 'false' && n1 === n0 + 1, `${off}, sign count ${n0} -> ${n1}`);
      const rec2 = await keyRecord(h.br);
      h.run.check('switch off: the key is back under the browser key (no passkey wrap)', !JSON.stringify(rec2).includes('"kind":"prf"'), JSON.stringify(rec2).slice(0, 200));
      await moment(h, 'settings protection off again (320)', { page });
      const f = await sp.eval(`() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`);
      h.run.check('Settings at 320 px: no sideways scroll', f.sw <= f.cw + 1, JSON.stringify(f));
    });
  } catch (e) {
    if (!(e instanceof Stop)) h.run.check('the scenario ran to its end', false, e.stack?.split('\n').slice(0, 3).join(' '));
  }
  grid.save();
  h.run.check('no attempt to open grid.wayne.edu through the helper (the verification guard saw none)', guardHits().length === 0, guardHits().join(' | '));
  await grid.stop();
  const r = await teardown(h);
  removeHostKey(h.run);
  return r;
}
