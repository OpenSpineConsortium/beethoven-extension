// Scenario 5: the approval answers (SPEC moment 6, "If it goes wrong"), from the mock's stand-in for the
// lab's access service, never the live one: not approved ("Ask for access", which opens the request
// page with the AccessID), another installation, another account, a withdrawn version (the service's
// "update_required"; a kill-list withdrawal needs the lab's signing key and is not played here), the
// service unreachable, and an approval withdrawn after a yes. Each case is a fresh browser profile.
import { ACCOUNT, agree, expectWords, gridSignIn, moment, setup, Stop, teardown, useAnotherPortal, WAYNE_BASIC, welcomePage } from '../lib/flows.mjs';
import { Browser, profileDir, sleep } from '../lib/harness.mjs';
import { WORDS } from '../lib/words.mjs';

const S = WORDS.statement;
const CASES = [
  { mode: 'denied', words: [S.notApproved.title, S.notApproved.body(ACCOUNT), S.notApproved.button], press: S.notApproved.button, opens: /openspineconsortium\.com\/beethoven\/request\.html\?access_id=st1234/ },
  { mode: 'other-installation', words: [S.otherInstallation.title, S.otherInstallation.body(ACCOUNT)] },
  { mode: 'other-account', words: [S.otherAccount.title, S.otherAccount.body] },
  { mode: 'update-required', words: [S.withdrawn.title, S.withdrawn.body, S.withdrawn.button] },
  { mode: 'down', words: [S.accessUnreachable.body, S.accessUnreachable.button] },
];

async function signedInFresh(h, label) {
  if (h.used) {
    await h.br.close();
    h.br = new Browser(h.run, { mock: h.mock, portalHost: h.br.portalHost, profile: profileDir(`${h.run.name}-${label}`) });
    await h.br.launch();
    h.br.watchPrompts('Allow');
  }
  h.used = true;
  h.prefilledChecked = false;
  await welcomePage(h);
  await useAnotherPortal(h);
  await agree(h);
  await gridSignIn(h);
}

export default async function approval(opts = {}) {
  const h = await setup('05-approval', { title: 'Not approved, another installation, another account, withdrawn', mockArgs: [...WAYNE_BASIC, '--access', 'denied'], mockEnv: { MOCK_LOGGED_IN: 'false' }, browser: opts.browser });
  for (const c of CASES) {
    try {
      await h.mock.setAccess(c.mode);
      h.run.ev('CASE', `the stand-in answers "${c.mode}"`);
      await signedInFresh(h, c.mode);
      const t = await h.br.panel.waitText(c.words[0], 30_000);
      const m = await moment(h, `access ${c.mode}`);
      expectWords(h, `moment 6, ${c.mode}`, m.panel, c.words);
      h.run.check(`${c.mode}: no Connect can go ahead`, !!t);
      if (c.press) {
        await h.br.panel.press(c.press);
        // the browser's own target list (Playwright can attach an extension-opened tab many seconds late)
        const t0 = Date.now();
        let rec;
        while (!rec && Date.now() - t0 < 8000) {
          rec = [...h.br.tabs.values()].find((t) => t.type === 'page' && !t.byHarness && t.urls.some((u) => c.opens.test(u)));
          if (!rec) await sleep(200);
        }
        h.run.check(`"${c.press}" opens the request page with the AccessID filled in`, !!rec, rec?.urls.find((u) => c.opens.test(u)));
      }
    } catch (e) {
      if (!(e instanceof Stop)) h.run.check(`case ${c.mode} ran`, false, e.message);
    }
  }
  // an approval withdrawn after a yes: approved, then the service says no; the panel re-checks when it opens after a day
  try {
    await h.mock.setAccess('approved');
    await signedInFresh(h, 'withdrawn');
    await h.br.panel.waitText(S.title, 20_000);
    h.run.check('approved first', !(await h.br.panel.text()).includes(S.notApproved.title));
    await h.mock.setAccess('withdrawn');
    // a test device, logged as such: the stored answer is made a day old so opening the panel asks again (LICENSE 3(a))
    const aged = await h.br.bg(async () => {
      const all = await chrome.storage.local.get(null);
      const key = Object.keys(all).find((k) => /access/i.test(k) && all[k] && typeof all[k] === 'object' && 'approved' in all[k]);
      if (!key) return null;
      const old = new Date(Date.now() - 25 * 3600_000).toISOString();
      await chrome.storage.local.set({ [key]: { ...all[key], checked_at: old, last_attempt_at: old } });
      return key;
    });
    h.run.note(`test device: the stored approval (${aged}) was dated 25 h back so that opening the panel re-checks`);
    await h.br.bcdp.send('Target.closeTarget', { targetId: h.br.panel.h.info.id }).catch(() => {});
    await sleep(1500);
    await h.br.clickToolbar();
    const panel = (await h.br.sidePanel(8000)) ?? (await h.br.panelInTab());
    const t = await panel.waitText(S.notApproved.title, 30_000);
    const m = await moment(h, 'approval withdrawn');
    h.run.check('an approval withdrawn after a yes: the panel no longer lets the student connect', !!t, (m.panel ?? '').slice(0, 200));
  } catch (e) {
    if (!(e instanceof Stop)) h.run.check('the withdrawn case ran', false, e.message);
  }
  return teardown(h);
}
