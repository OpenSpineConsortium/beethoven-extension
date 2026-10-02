// Scenario 14 (12.0.0): the opt-in protection of the key with Windows Hello / Touch ID, played by a CDP
// virtual authenticator with PRF on the side panel's own target. Against the local grid stand-in.
//
//   first run to "This computer is set up." -> the protection card: Turn on (one passkey made, the key
//   re-wrapped, nothing changes on the server) -> Settings: the switch is on -> the browser session's unlock
//   dropped (what a browser restart does to storage.session) -> the Grid row "Locked · Unlock", no key use
//   while locked -> Unlock: one assertion, the direct way back -> Settings: switch off (one assertion), on
//   again (a new passkey) -> a real browser restart: "Locked · Unlock" and no connection before the student
//   acts. A virtual authenticator does not keep a credential's PRF secret across WebAuthn.getCredentials /
//   addCredential (probe_prf.mjs: the imported credential answers with no PRF output), so a successful unlock
//   after a REAL restart cannot be shown here; the scenario records what the Unlock press does then.
import fs from 'node:fs';
import path from 'node:path';
import { expectWords, moment, setup, step, Stop, teardown, useAnotherPortal, welcomePage, ACCOUNT } from '../lib/flows.mjs';
import { addAuthenticator, credentials, FINAL, Grid, GRID_CODE, GRID_PASSWORD, guardHits, openSettings, removeHostKey, TEST_EXT, watchDownloads } from '../lib/direct.mjs';
import { Browser, sleep } from '../lib/harness.mjs';
import { AFFIRMATION, loose, STATEMENT_TICK, WORDS } from '../lib/words.mjs';
import { continueAfterEnrolled, enrolled, helperMoment, MOCK_ARGS, sheetAccount, sheetAnswer } from './13-direct-first-run.mjs';

const W = WORDS.direct;

/** welcome -> another portal -> tick and Agree (no QR decoding: scenario 13 does that) */
export async function toHelper(h) {
  await welcomePage(h);
  await useAnotherPortal(h);
  await step(h, 'tick and Agree and continue', async () => {
    await h.welcome.press(loose(AFFIRMATION.bold));
    h.br.acceptedAt = Date.now();
    await h.welcome.press(WORDS.welcome.agree);
    const panel = await h.br.sidePanel(8000);
    if (!panel) await h.br.panelInTab();
    await sleep(2500);
  });
}

export async function keyRecord(br) {
  return br.bg(async () => {
    const dbs = await indexedDB.databases();
    const out = { dbs: dbs.map((d) => d.name) };
    for (const d of dbs) {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open(d.name);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      for (const s of db.objectStoreNames) {
        const all = await new Promise((res) => {
          const q = db.transaction(s).objectStore(s).getAll();
          q.onsuccess = () => res(q.result);
          q.onerror = () => res([]);
        });
        // shape only: which kind of wrap, whether a credential id is there; never the bytes
        out[`${d.name}/${s}`] = all.map((x) => ({ kind: x?.kind, alg: x?.alg, hasCredId: !!x?.credId, enrolled_at: x?.enrolled_at, account: x?.account, keys: Object.keys(x ?? {}) }));
      }
      db.close();
    }
    out.unlock = Object.keys((await chrome.storage.session.get('bridge.keyUnlock')) ?? {}).length > 0;
    return out;
  });
}

export default async function directPasskey(opts = {}) {
  const grid = new Grid({ ev: () => {}, dir: FINAL }, { queueS: 15, startS: 5 });
  const h = await setup('14-direct-passkey', {
    title: '12.0.0 the opt-in key protection (virtual authenticator with PRF)',
    mockArgs: MOCK_ARGS,
    mockEnv: { MOCK_LOGGED_IN: 'false' },
    browser: { ...opts.browser, ext: TEST_EXT },
  });
  grid.run = h.run;
  try {
    removeHostKey(h.run);
    grid.setup();
    await grid.start();
    await watchDownloads(h.br, path.join(FINAL, 'student', 'Downloads'));
    await toHelper(h);
    await helperMoment(h, grid);
    await step(h, 'sign in and enrol', async () => {
      await sheetAccount(h, ACCOUNT);
      const tick = await h.br.panel.find(loose(W.settings.protectKey));
      h.run.check('the sheet\'s "Protect my key with Windows Hello / Touch ID" tick is there and unticked by default', !!tick && tick.checked === false, JSON.stringify(tick));
      await sheetAnswer(h, 'password', GRID_PASSWORD);
      await sheetAnswer(h, 'code', GRID_CODE);
    });
    await step(h, 'enrolled', async () => enrolled(h, grid));
    const akBefore = grid.authorizedKeys();
    await step(h, 'Turn on with Windows Hello / Touch ID (virtual authenticator)', async () => {
      const p = h.br.panel;
      await continueAfterEnrolled(h);
      await p.waitText(W.protectKey.title, 15_000);
      await addAuthenticator(p, { prf: true });
      await moment(h, 'protect card before turn on');
      const before = await keyRecord(h.br);
      h.run.ev('KEY', `before: ${JSON.stringify(before)}`);
      await p.press(W.protectKey.on);
      const busy = await p.waitText(W.protectKey.turningOn, 3000);
      const t = await p.waitText(W.protectKey.turnedOn, 20_000);
      if (!t) h.run.note(`Turn on: "${W.protectKey.turnedOn}" was not seen (polled every 300 ms for 20 s); the card moved on to the next moment (${busy ? 'the waiting line was seen' : 'the waiting line passed too fast to see'})`);
      else h.run.check(`Turn on: "${W.protectKey.turnedOn}"`, true);
      await moment(h, 'protected');
      const creds = await credentials(p);
      h.run.check('one passkey was made on the authenticator (resident, for this extension)', creds.length === 1, JSON.stringify(creds.map((c) => ({ rpId: c.rpId, userName: c.userName, signCount: c.signCount }))));
      h.passkey = creds[0];
      const after = await keyRecord(h.br);
      h.run.ev('KEY', `after: ${JSON.stringify(after)}`);
      h.run.check('the key record is now wrapped under the passkey (kind prf, a credential id)', JSON.stringify(after).includes('"kind":"prf"') && JSON.stringify(after).includes('"hasCredId":true'), JSON.stringify(after).slice(0, 300));
      h.run.check('turning protection on changed nothing on the server (the same key line)', grid.authorizedKeys() === akBefore);
    });
    await step(h, 'on past the card', async () => {
      const p = h.br.panel;
      const t = await p.waitText(new RegExp(`${WORDS.statement.title}|Grid`), 20_000);
      if (/Not now/.test((await p.text()) ?? '') && (await p.find(W.protectKey.notNow))?.visible) await p.press(W.protectKey.notNow);
      await sleep(1500);
      await moment(h, 'after the protection card');
      h.run.check('the first run carries on after Turn on', !!t);
    });
    await step(h, 'the browser session ends (the unlock dropped, the background afresh): Unlock asked', async () => {
      const p = h.br.panel; // kept open: the virtual authenticator lives on this target
      await p.waitText(WORDS.statement.title, 30_000);
      h.lockedAt = grid.log().length;
      // what a browser restart does: storage.session is emptied (the passkey's output lives only there)
      await h.br.bg(async () => chrome.storage.session.remove('bridge.keyUnlock'));
      // and the background starts afresh, as after a restart (its memory gone), while the panel and its authenticator stay
      const swT = [...h.br.tabs.values()].filter((x) => x.type === 'service_worker' && !x.closedAt && x.url.includes(h.br.extId)).pop();
      const stopped = swT ? await h.br.bcdp.send('Target.closeTarget', { targetId: swT.targetId }).then(() => true).catch((e) => e.message) : 'no worker target';
      h.run.ev('WORKER', `stop the extension's service worker: ${stopped}`);
      const t = await p.waitText(new RegExp(`${W.signin.unlockTitle}|${W.rowLocked}`), 60_000);
      const m = await moment(h, 'locked: unlock asked');
      h.run.check(`the key locked: "${W.signin.unlockTitle}" with one Unlock button (no password, no code)`, !!t && !/Password:|AccessID/.test(m.panel ?? ''), (m.panel ?? '').slice(0, 300));
      await sleep(5000);
      const used = grid.log().slice(h.lockedAt).filter((e) => e.event === 'publickey-match' || /^kbdint/.test(e.event));
      h.run.check('while locked, nothing signs in to the server', used.length === 0, `${used.length}`);
    });
    await step(h, 'Unlock: one assertion on the same panel, then Connect works on the key', async () => {
      const p = h.br.panel;
      const c0 = (await credentials(p))[0]?.signCount;
      const b = (await p.find(W.signin.unlock)) ?? (await p.find(W.rowUnlock));
      if (!b?.visible) throw new Error('no Unlock control');
      await p.clickAt(b.x, b.y);
      h.presses.push('panel: Unlock');
      const t = await p.waitText(new RegExp(`${W.signin.unlockFailed}|${WORDS.statement.title}|${W.rowDirect}`), 60_000);
      await moment(h, 'unlocked');
      const c1 = (await credentials(p))[0]?.signCount;
      h.run.check('Unlock: one Windows Hello / Touch ID prompt (the passkey signed once)', c1 === (c0 ?? 0) + 1, `${c0} -> ${c1}`);
      h.run.check('Unlock: the key opens (not "didn\'t unlock")', !!t && !t.includes(W.signin.unlockFailed), (t ?? '').slice(0, 200));
      const back = await h.br.bg(async () => !!(await chrome.storage.session.get('bridge.keyUnlock'))['bridge.keyUnlock']).catch(() => false);
      h.run.check('the unlock is kept for this browser session only (storage.session)', back === true);
      if (t && t.includes(WORDS.statement.title)) {
        await p.press(loose(STATEMENT_TICK));
        await p.press(WORDS.statement.connect);
        const c = await p.waitText(new RegExp(`${WORDS.claude.title}|${WORDS.connect.hero}|${WORDS.queue.hero}`), 60_000);
        await moment(h, 'connect after unlock');
        h.run.check('Connect after the unlock goes ahead (the Claude sign-in or the queue)', !!c);
      }
      const used = grid.log().slice(h.lockedAt).filter((e) => e.event === 'publickey-match');
      h.run.check('after Unlock the key signs in to the server again', used.length > 0, `${used.length}`);
    });
    await step(h, 'Settings: the switch is on; switching it off asks once', async () => {
      // Settings is a page: its own target needs the authenticator too (the passkey made on the panel is copied in)
      const { page, surface: p } = await openSettings(h);
      const cdp = await h.br.context.newCDPSession(page);
      await cdp.send('WebAuthn.enable', { enableUI: false });
      const auth = (await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } })).authenticatorId;
      if (h.passkey) await cdp.send('WebAuthn.addCredential', { authenticatorId: auth, credential: h.passkey });
      p.h.authenticatorId = auth;
      const pageCreds = async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId: auth })).credentials;
      h.run.note('Settings is a separate page: a virtual authenticator was added to it and the panel\'s passkey imported; an imported credential gives no PRF output (probe_prf.mjs), so turning protection OFF from Settings cannot succeed under test');
      const sw = await p.waitFind(/[\s\S]*/, 5000, { selector: '#protect-key' });
      const before = await p.eval(`() => document.querySelector('#protect-key')?.getAttribute('aria-checked')`);
      h.run.check('Settings: "Protect my key with Windows Hello / Touch ID" is on', before === 'true', before);
      await moment(h, 'settings protection on', { page });
      const c0 = (await pageCreds())[0]?.signCount;
      await p.clickAt(sw.x, sw.y);
      let off;
      for (let i = 0; i < 30 && off !== 'false'; i++) {
        await sleep(300);
        off = await p.eval(`() => document.querySelector('#protect-key')?.getAttribute('aria-checked')`);
      }
      const c1 = (await pageCreds())[0]?.signCount;
      h.run.check('Settings, switch off: Windows Hello / Touch ID is asked once', c1 === (c0 ?? 0) + 1, `sign count ${c0} -> ${c1}`);
      const m = await moment(h, 'settings protection off attempt', { page });
      h.run.note(`Settings, switch off with the panel's passkey imported into the page's virtual authenticator: switch now ${off} (${off === 'false' ? 'turned off' : 'not turned off: expected under test, the imported credential gives no PRF output'}); page says: ${((m.page ?? '').match(/Protect my key[^\n]*\n[^\n]*/) ?? [''])[0].replace(/\n/g, ' | ')}`);
      h.run.check('Settings, switch off attempted: nothing changed on the server', grid.authorizedKeys() === akBefore);
      await page.close().catch(() => {});
    });
    await step(h, 'a real browser restart: Locked, nothing used before the student acts', async () => {
      grid.save('-before-restart');
      await h.br.close();
      const nb = new Browser(h.run, { mock: h.mock, portalHost: h.br.portalHost, ext: TEST_EXT, profile: h.br.profile });
      await nb.launch({ keepProfile: true });
      nb.watchPrompts('Allow');
      h.br = nb;
      const n0 = grid.log().length;
      await sleep(2500);
      await nb.newPage('about:blank'); // a tab that keeps the window (and the toolbar's tab target) once the welcome tab is closed
      for (const pg of nb.pages()) if (/\/options\.html/.test(pg.url())) await pg.close().catch(() => {});
      await nb.clickToolbar();
      if (!(await nb.sidePanel(8000))) await nb.panelInTab();
      const t = await nb.panel.waitText(new RegExp(`${W.rowLocked}|${W.signin.unlockTitle}`), 60_000);
      await sleep(3000);
      const m = await moment(h, 'after restart, locked');
      h.run.check('after a real restart: "Locked · Unlock" (the protected key waits for the student)', !!t, (m.panel ?? '').slice(0, 300));
      const used = grid.log().slice(n0).filter((e) => e.event === 'publickey-match' || /^kbdint/.test(e.event));
      h.run.check('after a real restart: no sign-in of any kind reached the server before Unlock', used.length === 0, `${used.length}`);
      const p = nb.panel;
      await addAuthenticator(p, { prf: true });
      if (h.passkey) await p.h.send('WebAuthn.addCredential', { authenticatorId: p.authenticatorId, credential: h.passkey });
      const c0 = (await credentials(p))[0]?.signCount;
      const b = (await p.find(W.rowUnlock)) ?? (await p.find(W.signin.unlock));
      if (b?.visible) await p.clickAt(b.x, b.y);
      await sleep(800);
      // the sheet's own Unlock only when the home's was not there (one press, one assertion; since the 12.0.0
      // reviews a failed Unlock on the home brings up the unlock sheet with "That didn't unlock", which is not pressed again)
      const su = await p.find(W.signin.unlock);
      if (!b?.visible && su?.visible && new RegExp(W.signin.unlockTitle).test((await p.text()) ?? '')) await p.clickAt(su.x, su.y);
      // the outcome: "Locked" gone (unlocked), or "That didn't unlock", or nothing said at all within 30 s
      let outcome = 'nothing changed on the panel within 30 s';
      for (let i = 0; i < 60; i++) {
        await sleep(500);
        const tx = (await p.text().catch(() => '')) ?? '';
        if (tx.includes(W.signin.unlockFailed)) { outcome = `"${W.signin.unlockFailed}"`; break; }
        if (!tx.includes(W.rowLocked) && !tx.includes(W.signin.unlockTitle)) { outcome = 'unlocked (Locked gone)'; break; }
      }
      await moment(h, 'after restart, unlock pressed');
      const c1 = (await credentials(p))[0]?.signCount;
      h.run.check('after a real restart, Unlock asks the authenticator once', c1 === (c0 ?? 0) + 1, `${c0} -> ${c1}`);
      h.run.note(`after a real restart, Unlock (the home's Grid row) with the credential imported into a new virtual authenticator: ${outcome}. A virtual authenticator gives an imported credential no PRF output (probe_prf.mjs), so the unlock cannot succeed under test; a real Windows Hello / Touch ID keeps its credential, so success after a real restart needs Greg's own run`);
      h.unlockAfterRestart = outcome;
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
