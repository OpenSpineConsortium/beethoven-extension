// The setup page: the signing dialog (ported from Ashley's termsPanel), the licence key, the
// disclosure, and connecting the portal. Built to the assent pattern the cases enforce:
// conspicuous notice, un-prechecked boxes whose sentence names the exact button, a typed name,
// never install-equals-accept; and the text stays exportable and printable.
import { browser } from 'wxt/browser';
import { IDENTITY_KEY, KILLLIST_KEY, LICENSE_KEY, type LicenseState } from '../core/keys';
import { acceptanceComplete, AFFIRMATIONS, AGREE_BUTTON, PRODUCT_NAME, sha256, SUMMARY, TERMS_KEY, TERMS_TITLE, TERMS_VERSION, type Affirmation, type TermsRecord } from '../core/terms';
import { browserName, installId, local, portalSettings, version } from '../ext/storage';
import { type StoredKillList } from '../licensing/killlist';
import { BUNDLED_KEYS, findKey, peek, verifyLicense } from '../licensing/license';
import { add, clear, downloadText, el } from './dom';
import { ackSection, connectSection, licenceSummary } from './sections';

const SEPARATOR = '\n\n\n==================== PRIVACY STATEMENT ====================\n\n';

async function texts(): Promise<{ license: string; privacy: string }> {
  const [l, p] = await Promise.all([fetch(browser.runtime.getURL('/LICENSE.txt')).then((r) => r.text()), fetch(browser.runtime.getURL('/PRIVACY.md')).then((r) => r.text())]);
  return { license: l, privacy: p };
}

export async function mountOnboarding(root: HTMLElement): Promise<void> {
  const notice = el('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const notify = (kind: 'ok' | 'warn' | 'fail' | 'info', text: string) => {
    notice.className = `status ${kind === 'info' ? 'muted' : kind}`;
    notice.textContent = text;
  };
  const render = async () => {
    clear(root);
    const summary = await licenceSummary();
    const settings = await portalSettings();
    root.append(
      el('h1', { text: `${PRODUCT_NAME}: set up` }),
      el('p', { class: 'muted' }, 'Four short steps. Nothing here signs in anywhere for you, and nothing runs on claude.ai: the extension only talks to the portal you connect.'),
      notice,
      el('h2', { text: '1. The agreement' }),
      summary.termsOk ? acceptedCard(summary.terms!, notify) : await signingDialog(notify, render),
      el('h2', { text: '2. Your licence key' }),
      await licenceCard(notify, render),
      el('h2', { text: '3. Where your work goes' }),
      await ackSection(render),
      el('h2', { text: '4. Your portal' }),
      connectSection(settings, render, notify),
      el('p', { class: 'muted small' }, `${PRODUCT_NAME} ${version()}. The monitoring panel is the toolbar button (side panel in Chrome and Edge, sidebar in Firefox).`),
    );
  };
  await render();
}

function acceptedCard(rec: TermsRecord, notify: (k: 'ok' | 'warn' | 'fail' | 'info', t: string) => void): HTMLElement {
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

async function exportAll(rec: TermsRecord, notify: (k: 'ok' | 'warn' | 'fail' | 'info', t: string) => void): Promise<void> {
  const t = await texts();
  downloadText(`${PRODUCT_NAME.replace(/\s+/g, '-')}-agreement-v${rec.terms_version}.txt`, `${t.license}${SEPARATOR}${t.privacy}\n\n\n==================== YOUR ACCEPTANCE RECORD ====================\n\n${JSON.stringify(rec, null, 1)}\n`);
  notify('ok', 'Exported: the agreement, the privacy statement and your acceptance record, in one text file.');
}

async function signingDialog(notify: (k: 'ok' | 'warn' | 'fail' | 'info', t: string) => void, done: () => Promise<void>): Promise<HTMLElement> {
  const t = await texts();
  const licenseHash = await sha256(t.license);
  const privacyHash = await sha256(t.privacy);
  let scrolled = false;
  const doc = el('div', { class: 'doc', id: 'doc', tabindex: '0', role: 'region', 'aria-label': 'License agreement and privacy statement, scrollable' });
  doc.textContent = `${t.license}${SEPARATOR}${t.privacy}`;
  const hint = el('p', { class: 'muted small', id: 'scrollhint', text: 'Scroll the text above to its end to continue.' });
  const boxes = AFFIRMATIONS.map((a) => ({ a, input: el('input', { type: 'checkbox', id: `aff-${a.id}`, 'data-id': a.id }) }));
  const name = el('input', { type: 'text', id: 'name', autocomplete: 'name', 'aria-describedby': 'namehint' });
  const agree = el('button', { class: 'primary', type: 'button', disabled: true, text: AGREE_BUTTON });
  const status = el('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const check = () => {
    const all = boxes.every((b) => b.input.checked);
    const n = name.value.trim();
    const ok = scrolled && all && n.length >= 2;
    agree.disabled = !ok;
    const missing: string[] = [];
    if (!scrolled) missing.push('read the full text to its end');
    if (!all) missing.push('tick every statement that is true (all are needed to continue)');
    if (n.length < 2) missing.push('type your name');
    status.textContent = ok ? '' : `To continue: ${missing.join('; ')}.`;
  };
  doc.addEventListener('scroll', () => {
    if (doc.scrollTop + doc.clientHeight >= doc.scrollHeight - 8) {
      scrolled = true;
      hint.textContent = 'You have reached the end of the text.';
      check();
    }
  });
  setTimeout(() => {
    if (doc.scrollHeight <= doc.clientHeight + 8) {
      scrolled = true;
      hint.textContent = '';
      check();
    }
  }, 0);
  for (const b of boxes) b.input.addEventListener('input', check);
  name.addEventListener('input', check);
  agree.addEventListener('click', async () => {
    const affirmations: Affirmation[] = boxes.map((b) => ({ id: b.a.id, label: b.a.label, checked: b.input.checked }));
    const complete = acceptanceComplete(affirmations, name.value, scrolled);
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
      scrolled_to_end: true,
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
    el('p', {}, `Read the summary, then the full text (scroll to its end), tick each statement, type your name, and choose `, el('strong', { text: AGREE_BUTTON }), `. Choosing that button forms the agreement between you and the licensor; opening the text in a tab also counts as reading it. You can export or print the text at any time.`),
    el('h3', { text: 'In short' }),
    el('ul', {}, ...SUMMARY.map((s) => el('li', { text: s }))),
    el('h3', { text: 'The full text' }),
    doc,
    hint,
    el('div', { class: 'row noprint' },
      el('button', {
        type: 'button',
        text: 'Open in a tab (plain text, printable)',
        onClick: () => {
          void browser.tabs.create({ url: browser.runtime.getURL('/LICENSE.txt') });
          scrolled = true;
          hint.textContent = 'The full text is open in a tab.';
          check();
        },
      }),
      el('button', { type: 'button', text: 'Export a copy', onClick: () => downloadText(`${PRODUCT_NAME.replace(/\s+/g, '-')}-agreement-v${TERMS_VERSION}.txt`, `${t.license}${SEPARATOR}${t.privacy}`) }),
      el('button', { type: 'button', text: 'Print', onClick: () => window.print() }),
      el('button', { type: 'button', text: 'Open the privacy statement', onClick: () => browser.tabs.create({ url: browser.runtime.getURL('/PRIVACY.md') }) }),
    ),
    el('h3', { text: 'Your statements' }),
    el('fieldset', {}, el('legend', { text: 'Tick each box only if it is true. None is ticked for you.' }), ...boxes.map((b) => el('div', { class: 'box' }, b.input, el('label', { for: `aff-${b.a.id}`, text: b.a.label })))),
    el('div', { class: 'row' }, el('label', { for: 'name', text: 'Type your full name as your signature:' }), name),
    el('p', { class: 'muted small', id: 'namehint', text: 'Your typed name, the boxes you tick, the time, the browser, and the version and hash of this text are recorded in this browser to prove the agreement. Nothing else is recorded here, and nothing is sent anywhere.' }),
    el('div', { class: 'row noprint' }, agree, el('button', { type: 'button', text: 'Decline', onClick: () => { notify('info', `Declined. Do not use ${PRODUCT_NAME}; you can remove it from your browser's extensions page.`); window.close(); } })),
    status,
  );
  setTimeout(check, 0);
  return card;
}

async function licenceCard(notify: (k: 'ok' | 'warn' | 'fail' | 'info', t: string) => void, done: () => Promise<void>): Promise<HTMLElement> {
  const stored = await local.get<LicenseState>(LICENSE_KEY);
  const known = (await local.get<{ username?: string }>(IDENTITY_KEY))?.username;
  const kill = await local.get<StoredKillList>(KILLLIST_KEY);
  const key = el('input', { type: 'text', class: 'wide mono', placeholder: 'ASHLEY1.…  (paste the whole key, or the e-mail it came in)', value: stored?.key ?? '', 'aria-label': 'Licence key' });
  const user = el('input', { type: 'text', placeholder: 'your portal username', value: stored?.identity?.accessId ?? known ?? '', 'aria-label': 'Portal username' });
  const status = el('div', { class: 'status', role: 'status' });
  const current = stored ? await verifyLicense(stored.key, { keys: BUNDLED_KEYS, identity: { accessId: stored.identity?.accessId || known }, revoked: kill?.list.revoked_lids ?? [] }) : undefined;
  const card = el('div', { class: 'card' });
  add(card, 
    el('p', {}, 'A key names one person and is checked in this browser, against the signing keys built into this version; nothing is sent to check it. It must match your portal username (the account the worker runs under).'),
    current ? el('div', { class: current.ok ? 'ok' : 'fail', text: current.detail }) : null,
    key,
    el('div', { class: 'row' }, el('label', { text: 'Portal username: ' }, user), el('span', { class: 'muted small', text: known ? `(seen on your portal: ${known})` : '(filled in once your portal is connected)' })),
    el('div', { class: 'row' },
      el('button', {
        class: 'primary',
        text: 'Check and save the key',
        onClick: async () => {
          const found = findKey(key.value) ?? key.value.trim();
          const accessId = user.value.trim() || known;
          const v = await verifyLicense(found, { keys: BUNDLED_KEYS, identity: { accessId }, revoked: kill?.list.revoked_lids ?? [] });
          if (!v.ok) {
            const p = peek(found);
            status.textContent = `${v.detail}${p?.name ? ` (key issued to ${p.name})` : ''}`;
            return;
          }
          await local.set(LICENSE_KEY, { key: found, identity: { accessId }, saved_at: new Date().toISOString() } satisfies LicenseState);
          status.textContent = '';
          notify('ok', `${v.detail}${v.identity === null ? '. The key will be matched to your portal username once the portal is connected.' : ''}`);
          await done();
        },
      }),
      stored ? el('button', { text: 'Forget the key', onClick: async () => { await local.remove(LICENSE_KEY); await done(); } }) : null,
    ),
    status,
  );
  return card;
}
