// Sections shared by the setup page and the panel: connecting a portal, the plan-class
// disclosure with the data-classification acknowledgement, and the licence/agreement status line.
import { ACK_KEY, ackCovers, ackSubject, DATA_CLASSIFICATION_STATEMENT, PLAN_CLASS_DISCLOSURE, type Acknowledgement } from '../core/disclosure';
import { paths, stateDirFrom } from '../core/contract';
import { IDENTITY_KEY, KILLLIST_KEY, LICENSE_KEY, PREFS_KEY, type LicenseState, type PortalSettings, type Prefs } from '../core/keys';
import { recordInForce, TERMS_KEY, type TermsRecord } from '../core/terms';
import { BUNDLED_KEYS, verifyLicense } from '../licensing/license';
import { killListVerdict, type StoredKillList } from '../licensing/killlist';
import { local, prefs as loadPrefs, session, version } from '../ext/storage';
import { add, clear, el } from './dom';
import { activeTabOrigin, connectPortal, disconnectPortal, openPortalTab, portal, portalAlive } from './rpc';

export interface Notify {
  (kind: 'ok' | 'warn' | 'fail' | 'info', text: string): void;
}

/** Connect / disconnect. `active` is the toolbar tab, known only when the popup opened from it. */
export function connectSection(settings: PortalSettings | undefined, onChange: () => void, notify: Notify, active?: { origin: string; tabId: number; path: string }): HTMLElement {
  const box = el('div', { class: 'card' });
  if (settings) {
    add(box,
      el('div', {}, el('strong', { text: 'Portal: ' }), el('span', { class: 'mono', text: settings.hostname })),
      el('div', { class: 'muted small', text: `connected ${settings.connected_at.slice(0, 10)}; shell host "${settings.shell_host}", site profile "${settings.site}"` }),
      el('div', { class: 'row' },
        el('button', { onClick: () => openPortalTab().catch((e) => notify('fail', e.message)), text: 'Open the portal' }),
        el('button', {
          class: 'danger',
          text: 'Disconnect',
          onClick: async () => {
            await disconnectPortal();
            notify('info', 'Portal disconnected: the site permission and the page script were removed.');
            onChange();
          },
        }),
      ),
    );
    return box;
  }
  const looksLikeOod = !!active && /^\/pun\//.test(active.path);
  const input = el('input', { type: 'text', class: 'wide', placeholder: 'ondemand.your-university.edu', value: active && looksLikeOod ? active.origin : '', 'aria-label': 'Portal address' });
  const status = el('div', { class: 'status', role: 'status' });
  const doConnect = (value: string, tabId?: number) => {
    // no await before connectPortal: the permission prompt must come straight from the click
    connectPortal(value, tabId)
      .then(async (s) => {
        notify('ok', `Connected ${s.hostname}. Checking that it is an Open OnDemand portal...`);
        onChange();
        try {
          const info = await portal.session();
          if (info.signedIn && info.isOnDemand) notify('ok', `${s.hostname} is an Open OnDemand portal and you are signed in${info.username ? ` as ${info.username}` : ''}.`);
          else if (!info.signedIn) notify('warn', `${s.hostname}: ${info.detail}`);
          else notify('warn', `${s.hostname} does not look like an Open OnDemand portal (no "OnDemand" on its dashboard). You can disconnect it.`);
          if (info.username) await local.set(IDENTITY_KEY, { username: info.username });
        } catch (e) {
          notify('warn', `Connected, but the portal tab did not answer yet: ${(e as Error).message}`);
        }
      })
      .catch((e) => {
        status.textContent = (e as Error).message;
      });
  };
  add(box,
    el('p', {}, 'Ashley Bridge talks to one website: your Open OnDemand portal. Connect it from its own tab, or type its address. The browser will ask you to allow that one site.'),
    active && looksLikeOod
      ? el('div', { class: 'row' }, el('button', { class: 'primary', text: `Connect this portal (${new URL(active.origin).hostname})`, onClick: () => doConnect(active.origin, active.tabId) }))
      : el('p', { class: 'muted small', text: active ? `The current tab (${new URL(active.origin).hostname}) does not look like an Open OnDemand dashboard (no /pun/ in its address). Open your portal, then use the toolbar button there, or type the address below.` : 'Open your portal in a tab and use the toolbar button there, or type its address below.' }),
    el('div', { class: 'row' }, input, el('button', { text: 'Connect', onClick: () => doConnect(input.value) })),
    status,
  );
  return box;
}

/** where the named worker works on the cluster, when the portal can tell us; else the relative form */
export async function workspaceFor(workerName: string): Promise<{ path: string; known: boolean }> {
  try {
    if (!(await portalAlive())) throw new Error('no portal tab');
    const home = await portal.home();
    const user = (await portal.whoAmI()) ?? home.split('/').filter(Boolean).pop() ?? '';
    const profile = await portal.readFileIfExists(paths.profile(home));
    return { path: paths.workspace(stateDirFrom(profile, { home, user }), workerName), known: true };
  } catch {
    return { path: `<state directory>/${ackSubject(workerName)}`, known: false };
  }
}

/** The disclosure in the report's words and the statement about the worker's workspace; per browser session. */
export async function ackSection(onChange: () => void): Promise<HTMLElement> {
  const prefs = await loadPrefs();
  const ack = await session.get<Acknowledgement>(ACK_KEY);
  const box = el('div', { class: 'card' });
  const name = el('input', { type: 'text', value: prefs.worker_name, placeholder: 'worker', 'aria-label': 'Worker name', pattern: '[A-Za-z0-9_-]{1,32}' });
  const where = el('div', { class: 'muted small mono' });
  const tick = el('input', { type: 'checkbox', id: 'ack-tick' });
  const status = el('div', { class: 'status', role: 'status' });
  const covered = ackCovers(ack, ackSubject(prefs.worker_name));
  const showWhere = async () => {
    const w = await workspaceFor(name.value.trim() || 'worker');
    where.textContent = w.known ? `workspace on the cluster: ${w.path}` : `workspace on the cluster: ${w.path} (the exact path is read from the profile once the portal is connected and the tool installed)`;
  };
  void showWhere();
  name.addEventListener('change', () => void showWhere());
  add(box,
    el('h3', { text: 'Where your work goes' }),
    el('ul', {}, ...PLAN_CLASS_DISCLOSURE.map((s) => el('li', { text: s }))),
    el('p', { class: 'small muted', text: 'This is asked once per browser session and before every start. The worker refuses to start until you have made this statement about its workspace.' }),
    el('div', { class: 'row' }, el('label', { for: 'worker-name', text: 'Worker name (its run directory and workspace are named after it): ' }), name),
    where,
    el('div', { class: 'box' }, tick, el('label', { for: 'ack-tick', text: DATA_CLASSIFICATION_STATEMENT })),
    el('div', { class: 'row' },
      el('button', {
        class: 'primary',
        text: 'I have read this and the statement is true',
        onClick: async () => {
          const n = name.value.trim() || 'worker';
          if (!/^[A-Za-z0-9_-]{1,32}$/.test(n)) return void (status.textContent = 'The worker name must be letters, digits, _ or - (up to 32).');
          if (!tick.checked) return void (status.textContent = 'Tick the statement only if it is true; it is needed to continue.');
          const now = new Date().toISOString();
          await local.set(PREFS_KEY, { ...prefs, worker_name: n } satisfies Prefs);
          await session.set(ACK_KEY, { v: 1, work_dir: ackSubject(n), disclosure_at: now, classification_at: now, statement: DATA_CLASSIFICATION_STATEMENT } satisfies Acknowledgement);
          status.textContent = '';
          onChange();
        },
      }),
      covered ? el('span', { class: 'ok small', text: `acknowledged this session for worker "${prefs.worker_name}"` }) : el('span', { class: 'warn small', text: 'not acknowledged this session' }),
    ),
    status,
  );
  return box;
}

export interface LicenceSummary {
  termsOk: boolean;
  terms?: TermsRecord;
  licenceOk: boolean;
  licenceDetail: string;
  versionRevoked: boolean;
  revokedMessage: string;
  identityKnown: boolean;
}

export async function licenceSummary(): Promise<LicenceSummary> {
  const terms = await local.get<unknown>(TERMS_KEY);
  const lic = await local.get<LicenseState>(LICENSE_KEY);
  const stored = await local.get<StoredKillList>(KILLLIST_KEY);
  const username = (await local.get<{ username?: string }>(IDENTITY_KEY))?.username;
  const accessId = lic?.identity?.accessId || username;
  const v = await verifyLicense(lic?.key, { keys: BUNDLED_KEYS, identity: { accessId }, revoked: stored?.list.revoked_lids ?? [] });
  const verdict = killListVerdict(stored, version(), v.payload?.lid);
  return {
    termsOk: recordInForce(terms),
    terms: recordInForce(terms) ? terms : undefined,
    licenceOk: v.ok,
    licenceDetail: v.status === 'missing' ? 'no licence key entered (a trial key is free)' : v.detail,
    versionRevoked: verdict.versionRevoked,
    revokedMessage: verdict.message,
    identityKnown: !!accessId,
  };
}

export function licenceLine(s: LicenceSummary, onOpenSetup: () => void): HTMLElement {
  const box = el('div', { class: 'card' });
  add(box,
    el('div', {}, el('span', { class: s.termsOk ? 'ok' : 'fail', text: s.termsOk ? 'Terms accepted' : 'Terms not accepted' }), s.terms ? el('span', { class: 'muted small', text: ` on ${s.terms.accepted_at.slice(0, 10)} by ${s.terms.signed_name}` }) : null),
    el('div', {}, el('span', { class: s.licenceOk ? 'ok' : 'fail', text: s.licenceOk ? 'Licence ' : 'Licence: ' }), el('span', { class: 'small', text: s.licenceDetail }), !s.identityKnown && s.licenceOk ? el('span', { class: 'warn small', text: ' (the key will be matched to your portal username once the portal is connected)' }) : null),
    s.versionRevoked ? el('div', { class: 'fail', text: `This version has been withdrawn and sends no commands. ${s.revokedMessage || 'Update to continue.'}` }) : null,
    el('div', { class: 'row' }, el('button', { text: s.termsOk && s.licenceOk ? 'Open the setup page' : 'Finish setup (terms and key)', onClick: onOpenSetup })),
  );
  return box;
}

export function replaceChildren(node: Element, ...children: Node[]): void {
  clear(node);
  node.append(...children);
}

export { activeTabOrigin };
