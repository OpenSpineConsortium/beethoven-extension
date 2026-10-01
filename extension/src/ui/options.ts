// The setup page (manifest options_ui; opened on install, from right-click > Options, and from the
// strip): the signing dialog (ported from the termsPanel of the vendor's VS Code extension), the
// access card, connecting or disconnecting the portal by address, the settings, the audit log with
// its export, and the Google Drive step. Built to the assent pattern the cases enforce: conspicuous
// notice, un-prechecked boxes whose sentence names the exact button, a typed name, never
// install-equals-accept; and the text stays exportable and printable.
import { browser } from 'wxt/browser';
import { acceptanceComplete, AFFIRMATIONS, AGREE_BUTTON, measureReading, NOT_READ, openedInTab, PRODUCT_NAME, readingHint, readingRecord, sha256, SUMMARY, TERMS_KEY, TERMS_TITLE, TERMS_VERSION, textRead, type Affirmation, type BoxGeometry, type ReadingState, type TermsRecord } from '../core/terms';
import { browserName, installId, local, portalSettings, prefs as loadPrefs, session, version } from '../ext/storage';
import { AUTO_START_KEY, type AutoStartNote } from '../core/keys';
import { auditSection, settingsSection } from './details';
import { add, clear, downloadText, el, fmtTime } from './dom';
import { currentRun, portalAlive } from './rpc';
import { accessButtons, accessLine, accessSummary, connectSection, driveStep, statementSection, type AccessSummary } from './sections';

const SEPARATOR = '\n\n\n==================== PRIVACY STATEMENT ====================\n\n';

async function texts(): Promise<{ license: string; privacy: string }> {
  const [l, p] = await Promise.all([fetch(browser.runtime.getURL('/LICENSE.txt')).then((r) => r.text()), fetch(browser.runtime.getURL('/PRIVACY.md')).then((r) => r.text())]);
  return { license: l, privacy: p };
}

type Notify = (k: 'ok' | 'warn' | 'fail' | 'info', t: string) => void;

export async function mountOptions(root: HTMLElement): Promise<void> {
  const notice = el('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const notify: Notify = (kind, text) => {
    notice.className = `status ${kind === 'info' ? 'muted' : kind}`;
    notice.textContent = text;
  };
  const render = async () => {
    clear(root);
    const summary = await accessSummary();
    const settings = await portalSettings();
    const prefs = await loadPrefs();
    root.append(
      el('h1', { text: `${PRODUCT_NAME}: setup` }),
      el('p', { class: 'muted' }, 'The everyday way in is the toolbar button on your portal tab: it opens the strip, which does the rest and asks you only when it must. This page holds the agreement, your access, the portal connection, the settings and the audit log. Nothing here signs in anywhere for you, and nothing runs on claude.ai.'),
      notice,
      el('h2', { text: '1. The agreement' }),
      summary.termsOk ? acceptedCard(summary.terms!, notify) : await signingDialog(notify, render),
      el('h2', { text: '2. Your access' }),
      accessCard(summary, notify, render),
      el('h2', { text: '3. Your portal' }),
      connectSection(settings, render, notify),
      el('h2', { text: '4. Where your work goes' }),
      await statementSection(render),
      el('h2', { text: '5. Settings' }),
      settingsSection({ settings, prefs, render }, await session.get<AutoStartNote>(AUTO_START_KEY)),
      el('h2', { text: '6. Audit log' }),
      await auditSection({ notify, render }),
      el('h2', { text: '7. Connect Google Drive in claude.ai (optional)' }),
      await driveStep(render),
      el('p', { class: 'muted small' }, `${PRODUCT_NAME} ${version()}. The strip is the toolbar button (side panel in Chrome and Edge, sidebar in Firefox).${(await portalAlive()) ? '' : ' Your portal tab is not open right now.'}${(await currentRun().catch(() => undefined)) ? ' A worker is recorded in this browser session.' : ''}`),
    );
  };
  await render();
}

function acceptedCard(rec: TermsRecord, notify: Notify): HTMLElement {
  return el('div', { class: 'card' },
    el('div', { class: 'ok', text: `Accepted version ${rec.terms_version} on ${new Date(rec.accepted_at).toLocaleString()} by "${rec.signed_name}" (${rec.host}).` }),
    el('div', { class: 'muted small', text: `Agreement SHA-256 ${rec.license_sha256.slice(0, 16)}..., privacy statement ${rec.privacy_sha256.slice(0, 16)}...` }),
    el('div', { class: 'row noprint' },
      el('button', { text: 'Export the agreement and your record', onClick: async () => exportAll(rec, notify) }),
      el('button', { text: 'Show the agreement', onClick: () => browser.tabs.create({ url: browser.runtime.getURL('/LICENSE.txt') }) }),
      el('button', { text: 'Show the privacy statement', onClick: () => browser.tabs.create({ url: browser.runtime.getURL('/PRIVACY.md') }) }),
    ),
  );
}

async function exportAll(rec: TermsRecord, notify: Notify): Promise<void> {
  const t = await texts();
  downloadText(`${PRODUCT_NAME.replace(/\s+/g, '-')}-agreement-v${rec.terms_version}.txt`, `${t.license}${SEPARATOR}${t.privacy}\n\n\n==================== YOUR ACCEPTANCE RECORD ====================\n\n${JSON.stringify(rec, null, 1)}\n`);
  notify('ok', 'Exported: the agreement, the privacy statement and your acceptance record, in one text file.');
}

async function signingDialog(notify: Notify, done: () => Promise<void>): Promise<HTMLElement> {
  const t = await texts();
  const licenseHash = await sha256(t.license);
  const privacyHash = await sha256(t.privacy);
  // the reading gate (core/terms.ts measureReading): scrolled to the end, opened in a tab, or the
  // text fits its box once the box is on the page and laid out
  let reading: ReadingState = NOT_READ;
  const doc = el('div', { class: 'doc', id: 'doc', tabindex: '0', role: 'region', 'aria-label': 'License agreement and privacy statement, scrollable' });
  doc.textContent = `${t.license}${SEPARATOR}${t.privacy}`;
  const hint = el('p', { class: 'muted small', id: 'scrollhint', 'aria-live': 'polite', text: readingHint(reading) });
  const boxes = AFFIRMATIONS.map((a) => ({ a, input: el('input', { type: 'checkbox', id: `aff-${a.id}`, 'data-id': a.id }) }));
  const name = el('input', { type: 'text', id: 'name', autocomplete: 'name', 'aria-describedby': 'namehint' });
  const agree = el('button', { class: 'primary', type: 'button', disabled: true, text: AGREE_BUTTON });
  const status = el('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const check = () => {
    const read = textRead(reading);
    const all = boxes.every((b) => b.input.checked);
    const n = name.value.trim();
    const ok = read && all && n.length >= 2;
    agree.disabled = !ok;
    const missing: string[] = [];
    if (!read) missing.push('read the full text (scroll it to its end, or open it in tabs)');
    if (!all) missing.push('tick every statement that is true (all are needed to continue)');
    if (n.length < 2) missing.push('type your name');
    status.textContent = ok ? '' : `To continue: ${missing.join('; ')}.`;
  };
  const moveTo = (next: ReadingState) => {
    reading = next;
    const words = readingHint(reading);
    if (hint.textContent !== words) hint.textContent = words;
    check();
  };
  const geometry = (): BoxGeometry => ({ scrollTop: doc.scrollTop, clientHeight: doc.clientHeight, scrollHeight: doc.scrollHeight });
  doc.addEventListener('scroll', () => moveTo(measureReading(reading, geometry())));
  // Measured when the box is actually laid out on the page, and again whenever its size changes
  // (the observer reports the box once it has a size). Until then it has no height, and a box with
  // no height proves nothing (laidOut); without the observer the gate opens only by scrolling or
  // by opening the text in a tab.
  if (typeof ResizeObserver === 'function') {
    let seen = false;
    const observer = new ResizeObserver(() => {
      if (!doc.isConnected) {
        // the page was drawn again without this box: stop watching it
        if (seen) observer.disconnect();
        return;
      }
      seen = true;
      // the print layout unrolls the box to the whole text; that is not this screen's box fitting it
      if (window.matchMedia?.('print').matches) return;
      moveTo(measureReading(reading, geometry()));
    });
    observer.observe(doc);
  }
  for (const b of boxes) b.input.addEventListener('input', check);
  name.addEventListener('input', check);
  agree.addEventListener('click', async () => {
    const affirmations: Affirmation[] = boxes.map((b) => ({ id: b.a.id, label: b.a.label, checked: b.input.checked }));
    const complete = acceptanceComplete(affirmations, name.value, textRead(reading));
    if (!complete.ok) return check();
    const record: TermsRecord = {
      v: 1,
      terms_version: TERMS_VERSION,
      edition: 'trial',
      license_sha256: licenseHash,
      privacy_sha256: privacyHash,
      accepted_at: new Date().toISOString(),
      surface: 'extension',
      button_label: AGREE_BUTTON,
      affirmations,
      signed_name: name.value.trim(),
      // what happened: the end reached by scrolling (or the text fitted its box), and separately whether it was opened in a tab
      ...readingRecord(reading),
      product_version: version(),
      host: browserName(),
      install_id: await installId(),
    };
    await local.set(TERMS_KEY, record);
    notify('ok', `Terms accepted. Your record is kept in this browser; export it any time.`);
    await done();
  });
  const card = el('div', { class: 'card' });
  add(card,
    el('h3', { text: `${TERMS_TITLE} (version ${TERMS_VERSION}) and Privacy Statement` }),
    el('p', {}, `Read the summary, then the full text (scroll to its end), tick each statement, type your name, and choose `, el('strong', { text: AGREE_BUTTON }), `. Choosing that button forms the agreement between you and the licensor; opening the agreement and the privacy statement in tabs (the first button under the text) also counts as reading them. You can export or print the text at any time.`),
    el('h3', { text: 'In short' }),
    el('ul', {}, ...SUMMARY.map((s) => el('li', { text: s }))),
    el('h3', { text: 'The full text' }),
    doc,
    hint,
    el('div', { class: 'row noprint' },
      el('button', {
        type: 'button',
        text: 'Open in tabs (plain text, printable)',
        onClick: () => {
          // the box holds both texts, so both open; it counts as reading once both tabs exist
          void Promise.all([browser.tabs.create({ url: browser.runtime.getURL('/LICENSE.txt') }), browser.tabs.create({ url: browser.runtime.getURL('/PRIVACY.md') })])
            .then(() => moveTo(openedInTab(reading)))
            .catch((e) => notify('fail', `The texts could not be opened in tabs (${(e as Error).message}); scroll the text above to its end instead.`));
        },
      }),
      el('button', { type: 'button', text: 'Export a copy', onClick: () => downloadText(`${PRODUCT_NAME.replace(/\s+/g, '-')}-agreement-v${TERMS_VERSION}.txt`, `${t.license}${SEPARATOR}${t.privacy}`) }),
      el('button', { type: 'button', text: 'Print', onClick: () => window.print() }),
      el('button', { type: 'button', text: 'Open the privacy statement', onClick: () => browser.tabs.create({ url: browser.runtime.getURL('/PRIVACY.md') }) }),
    ),
    el('h3', { text: 'Your statements' }),
    el('fieldset', {}, el('legend', { text: 'Tick each box only if it is true. None is ticked for you.' }), ...boxes.map((b) => el('div', { class: 'box' }, b.input, el('label', { for: `aff-${b.a.id}`, text: b.a.label })))),
    el('div', { class: 'row' }, el('label', { for: 'name', text: 'Type your full name as your signature:' }), name),
    el('p', { class: 'muted small', id: 'namehint', text: `Your typed name, the boxes you tick, the time, the browser, the version of ${PRODUCT_NAME}, this installation's random identifier, whether you reached the end of the text in the box above (by scrolling, or because it all fitted with nothing to scroll) or opened it in tabs, and the version and hash of this text are recorded in this browser to prove the agreement. This record stays in this browser; only the installation identifier goes with each approval check (see 2. Your access).` }),
    el('div', { class: 'row noprint' }, agree, el('button', { type: 'button', text: 'Decline', onClick: () => { notify('info', `Declined. Do not use ${PRODUCT_NAME}; you can remove it from your browser's extensions page.`); window.close(); } })),
    status,
  );
  // the status line needs no layout; the reading gate waits for the observer above
  check();
  return card;
}

/**
 * Your access: who you are is the account your portal shows once you are signed in there (your
 * university's own sign-in); whether you may use Beethoven is Licensor's approved list, asked
 * by the background when the portal connects and about once a day. Nothing is typed here: the
 * card shows the last answer and offers the two things a person can do.
 */
function accessCard(s: AccessSummary, notify: Notify, done: () => Promise<void>): HTMLElement {
  const a = s.access;
  const card = el('div', { class: 'card' });
  add(card,
    el('p', {}, `There is nothing to enter. Your university's sign-in identifies you: once you are signed in to your portal, its dashboard shows your account name, and ${PRODUCT_NAME} asks Licensor's access service whether that account is approved (when you connect, and about once a day). What is sent: that account name, your portal's address, the product and its version, and this installation's identifier (a random number ${PRODUCT_NAME} made when you accepted its agreement, not taken from your computer). An approval is for one installation: a second computer, another browser profile or a reinstall is refused until your lab lead moves the approval to it. Not approved yet? Ask for access; the maintainer approves it, and the next click on the ${PRODUCT_NAME} button checks again.`),
    accessLine(a),
    a.accessId
      ? el('div', { class: 'muted small', text: `account ${a.accessId}${a.portal ? ` at ${a.portal}` : ''}${a.checkedAt ? `; the service last answered ${fmtTime(new Date(a.checkedAt).toISOString())}` : '; the service has not answered yet'}` })
      : el('div', { class: 'muted small', text: 'No account name yet: connect your portal and sign in there; its dashboard shows the name.' }),
    s.versionRevoked ? el('div', { class: 'fail', text: `This version has been withdrawn and sends no commands. ${s.revokedMessage || 'Update to continue.'}` }) : null,
    el('div', { class: 'row' }, ...accessButtons(a, notify, () => void done())),
  );
  return card;
}
