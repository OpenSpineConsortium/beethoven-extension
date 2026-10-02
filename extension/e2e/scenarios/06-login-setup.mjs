// Scenario 6: the password prompt and the one-time key step (AM2; V11_CONTRACT.md section 8).
// UNPROVEN ON THE GRID: this plays it on the mock's keyless account only.
//   a. xterm terminal: Connect meets the password; "One more thing, once." [Open the grid terminal]
//      puts the setup line on the clipboard and opens the grid's terminal in front; "Type your password
//      in the terminal, then press Enter." [I'm in]; the harness types the password INTO THE TERMINAL
//      PAGE (the student's act; Beethoven sees nothing of it); Beethoven types the line only after the
//      title says the shell is up or after "I'm in"; "Checking…"; the tab closes itself; "Done. You won't
//      need this again."; the waiting Connect carries on to online.
//   b. an older terminal (no xterm.js helper textarea): "Paste, then press Enter." and the fold "What
//      does the line do?"; the student pastes; done.
//   c. the terminal tab closed before the password: "Not done yet." [Open the grid terminal].
import fs from 'node:fs';
import path from 'node:path';
import { agree, claudeSignIn, expectWords, gridSignIn, moment, online, PASSWORD, setup, SHARED_WAYNE, statement, Stop, teardown, useAnotherPortal, WAYNE_BASIC, welcomePage } from '../lib/flows.mjs';
import { sleep } from '../lib/harness.mjs';
import { C, loose, STATEMENT_TICK, WORDS } from '../lib/words.mjs';

const L = WORDS.loginSetup;
const TERMINAL = /\/pun\/sys\/shell\/ssh\/[^/?#]+/;
const LINE = C.commands.loginSetup(SHARED_WAYNE);

async function toPasswordOffer(h) {
  await welcomePage(h);
  await useAnotherPortal(h);
  await agree(h);
  await gridSignIn(h);
  await statement(h);
  await h.br.panel.press(loose(STATEMENT_TICK));
  await h.br.panel.press(WORDS.statement.connect);
  const t = await h.br.panel.waitText(L.title, 60_000);
  const m = await moment(h, 'one more thing');
  expectWords(h, 'AM2 offer', m.panel, [L.title, L.body, L.open]);
  h.run.check('the key step appears only because the grid asked for a password', !!t);
  const st = await h.mock.state();
  h.run.check('Beethoven typed nothing at the password prompt', st.typedAtPasswordPrompt === 0 && st.passwordPrompts >= 1, JSON.stringify({ prompts: st.passwordPrompts, typed: st.typedAtPasswordPrompt }));
}

async function readClipboard(h) {
  const reader = await h.br.newPage(`${h.origin}/public/start.html`);
  await h.br.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: h.origin });
  const clip = await reader.evaluate(() => navigator.clipboard.readText()).catch((e) => `(unreadable: ${e.message})`);
  await reader.close();
  return clip;
}

async function openTerminal(h) {
  await h.br.panel.press(L.open);
  const term = await h.br.waitPage(TERMINAL, 10_000);
  const rec = [...h.br.tabs.values()].filter((t) => TERMINAL.test(t.urls[0] ?? '')).pop();
  h.run.check('"Open the grid terminal" opens the grid\'s own terminal page in a tab Beethoven opened', !!term && !!rec && !rec.byHarness, term?.url());
  const clip = await readClipboard(h);
  h.run.check('the setup line is on the clipboard', clip === LINE, clip);
  return term;
}

async function typePassword(h, term) {
  await term.bringToFront();
  await term.waitForFunction(() => /password: $/.test(document.body.innerText.trimEnd() + ' '), null, { timeout: 15_000 }).catch(() => {});
  const ta = term.locator('textarea').first();
  await ta.focus();
  await term.keyboard.type(PASSWORD);
  await term.keyboard.press('Enter');
  h.run.ev('STUDENT', 'typed the grid password into the grid\'s terminal page (the harness, as the student)');
}

async function variant(name, opts, fn) {
  const h = await setup(`06-login-setup-${name}`, { title: `AM2 key step: ${name}`, mockArgs: [...WAYNE_BASIC, '--keyless', ...(opts.mockArgs ?? [])], mockEnv: { MOCK_QUEUE_S: '5', MOCK_START_S: '3', MOCK_LOGGED_IN: 'false', ...(opts.mockEnv ?? {}) }, browser: opts.browser });
  h.run.note('UNPROVEN ON THE GRID: the keyless student is played by the mock only (LOGIN_SETUP_PROVEN is false)');
  try {
    await toPasswordOffer(h);
    await fn(h);
  } catch (e) {
    if (!(e instanceof Stop)) h.run.check('the scenario ran to its end', false, e.stack?.split('\n').slice(0, 3).join(' '));
  }
  const ak = fs.existsSync(path.join(h.mock.home, '.ssh', 'authorized_keys')) ? fs.readFileSync(path.join(h.mock.home, '.ssh', 'authorized_keys'), 'utf8') : '';
  h.run.note(`authorized_keys after the run: ${ak.trim().slice(0, 90)}…`);
  return teardown(h);
}

export default async function loginSetup(opts = {}) {
  const results = [];
  results.push(
    await variant('xterm', opts, async (h) => {
      const term = await openTerminal(h);
      const pw = await h.br.panel.waitText(L.typePassword, 8000);
      const m = await moment(h, 'type your password', { page: term });
      expectWords(h, 'AM2 password phase', m.panel, [L.typePassword, L.imIn]);
      h.run.check('the panel asks the student to type the password in the terminal', !!pw);
      await typePassword(h, term);
      // Beethoven acts on the shell's title (D31); if it has not after 6 s, the student presses "I'm in"
      const auto = await h.br.panel.waitText(new RegExp(`${L.checking}|${L.done.replace('.', '\\.')}`), 6000);
      if (!auto) {
        h.run.note('no action on the title within 6 s: pressing "I\'m in"');
        await h.br.panel.press(L.imIn);
      } else h.run.check('Beethoven acted on the shell\'s own title (the student did not need "I\'m in")', true);
      const done = await h.br.panel.waitText(L.done, 30_000);
      const md = await moment(h, 'key step done');
      h.run.check('"Done. You won\'t need this again." with the drawn check', !!done, (md.panel ?? '').slice(0, 160));
      await sleep(1500);
      h.run.check('the terminal tab Beethoven opened closed itself', term.isClosed());
      const log = await h.mock.saveLog();
      const termShell = log.shells.find((s) => s.lines.includes(LINE));
      h.run.check('the setup line ran in the terminal page\'s own shell, once, after the password', !!termShell && termShell.password === 'accepted' && log.shells.filter((s) => s.lines.includes(LINE)).length === 1, JSON.stringify(termShell && { origin: termShell.origin, password: termShell.password }));
      const st = await h.mock.state();
      h.run.check('the account is set up (the mock\'s next shell skips the password); nothing was typed at the prompt', st.loginSetupDone && st.typedAtPasswordPrompt === 0);
      const connected = log.shells.some((s) => s.lines.some((l) => /hpcworker' connect /.test(l)));
      h.run.check('the waiting Connect carried on by itself', connected || !!(await h.br.waitPage(/claude\.ai\/oauth\/authorize/, 20_000)));
      await claudeSignIn(h);
      await online(h);
    }),
  );
  results.push(
    await variant('hterm', { ...opts, mockArgs: ['--terminal', 'hterm'] }, async (h) => {
      const term = await openTerminal(h);
      await typePassword(h, term);
      const paste = await h.br.panel.waitText(L.paste, 30_000);
      h.run.check('an older terminal (no xterm.js helper textarea): "Paste, then press Enter."', !!paste);
      await h.br.panel.press(new RegExp(L.whatLine.replace('?', '\\?')));
      const m = await moment(h, 'paste fallback');
      expectWords(h, 'AM2 paste phase', m.panel, [L.paste, L.whatLine, LINE, L.lineExplain]);
      await term.bringToFront();
      await term.locator('textarea').first().focus();
      await term.keyboard.press('Control+V');
      await term.keyboard.press('Enter');
      h.run.ev('STUDENT', 'pasted the line into the terminal and pressed Enter');
      const done = await h.br.panel.waitText(L.done, 30_000);
      h.run.check('done after the student pasted the line', !!done);
    }),
  );
  results.push(
    await variant('closed', opts, async (h) => {
      const term = await openTerminal(h);
      await term.close();
      h.run.ev('STUDENT', 'closed the terminal tab before typing the password');
      const t = await h.br.panel.waitText(L.notYet, 15_000);
      const m = await moment(h, 'not done yet');
      expectWords(h, 'AM2 closed', m.panel, [L.notYet, L.open]);
      h.run.check('"Not done yet." with "Open the grid terminal" again', !!t);
    }),
  );
  return { scenario: '06-login-setup', passed: results.reduce((s, r) => s + r.passed, 0), failed: results.reduce((s, r) => s + r.failed, 0), parts: results };
}
