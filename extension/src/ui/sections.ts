// Sections shared by the setup page and the panel: connecting a portal, the plan-class
// disclosure with the data-classification acknowledgement, the Google Drive step, and the
// licence/agreement status line.
import { browser } from 'wxt/browser';
import { ACK_KEY, ackCovers, ackSubject, DATA_CLASSIFICATION_STATEMENT, PLAN_CLASS_DISCLOSURE, type Acknowledgement } from '../core/disclosure';
import { paths, profileRestricts, RESTRICTED_MARKER, stateDirFrom } from '../core/contract';
import { bindIdentity, identityNote, type IdentitySource } from '../core/identity';
import { CHECKLIST_KEY, IDENTITY_KEY, KILLLIST_KEY, LICENSE_KEY, PREFS_KEY, type Checklist, type LicenseState, type PortalSettings, type Prefs } from '../core/keys';
import { recordInForce, TERMS_KEY, type TermsRecord } from '../core/terms';
import { BUNDLED_KEYS, verifyLicense } from '../licensing/license';
import { killListVerdict, type StoredKillList } from '../licensing/killlist';
import { local, prefs as loadPrefs, session, version } from '../ext/storage';
import { add, clear, el } from './dom';
import { activeTabOrigin, connectPortal, disconnectPortal, openPortalTab, portal, portalAlive } from './rpc';

export interface Notify {
  (kind: 'ok' | 'warn' | 'fail' | 'info', text: string): void;
}

/** the claude.ai page where a student connects Google Drive; opened in a tab, never scripted */
export const CONNECTORS_URL = 'https://claude.ai/settings/connectors';

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

export interface WorkspaceInfo {
  path: string;
  /** the path was read from the profile through the portal */
  known: boolean;
  /** the workspace is marked restricted (its .restricted file, or the profile) */
  restricted: boolean;
  markerPath?: string;
}

/** where the named worker works on the cluster, and whether it is marked restricted, when the portal can tell us */
export async function workspaceFor(workerName: string): Promise<WorkspaceInfo> {
  try {
    if (!(await portalAlive())) throw new Error('no portal tab');
    const home = await portal.home();
    const user = (await portal.whoAmI()) ?? home.split('/').filter(Boolean).pop() ?? '';
    const profile = await portal.readFileIfExists(paths.profile(home));
    const stateDir = stateDirFrom(profile, { home, user });
    const markerPath = paths.restrictedMarker(stateDir, workerName);
    const marked = profileRestricts(profile, workerName) || (await portal.readFileIfExists(markerPath)) !== undefined;
    return { path: paths.workspace(stateDir, workerName), known: true, restricted: marked, markerPath };
  } catch {
    return { path: `<state directory>/${ackSubject(workerName)}`, known: false, restricted: false };
  }
}

/** The disclosure in the report's words and the statement about the worker's workspace; per browser session. */
export async function ackSection(onChange: () => void): Promise<HTMLElement> {
  const prefs = await loadPrefs();
  const ack = await session.get<Acknowledgement>(ACK_KEY);
  const box = el('div', { class: 'card' });
  const name = el('input', { type: 'text', value: prefs.worker_name, placeholder: 'worker', 'aria-label': 'Worker name', pattern: '[A-Za-z0-9_-]{1,32}' });
  const where = el('div', { class: 'muted small mono' });
  const restrictedLine = el('div', { class: 'small' });
  const markButton = el('button', { class: 'small', text: 'Mark this workspace restricted', hidden: true });
  const tick = el('input', { type: 'checkbox', id: 'ack-tick' });
  const status = el('div', { class: 'status', role: 'status' });
  const covered = ackCovers(ack, ackSubject(prefs.worker_name));
  let current: WorkspaceInfo | undefined;
  const showWhere = async () => {
    const w = await workspaceFor(name.value.trim() || 'worker');
    current = w;
    where.textContent = w.known ? `workspace on the cluster: ${w.path}` : `workspace on the cluster: ${w.path} (the exact path is read from the profile once the portal is connected and the tool installed)`;
    restrictedLine.className = w.restricted ? 'fail small' : 'muted small';
    restrictedLine.textContent = w.restricted ? `This workspace is marked restricted: the worker will not start there. To lift the mark, remove ${w.markerPath ?? RESTRICTED_MARKER} yourself in the portal's Files app; Ashley Bridge never deletes anything.` : w.known ? 'Not marked restricted.' : '';
    markButton.hidden = !w.known || w.restricted;
  };
  markButton.addEventListener('click', async () => {
    if (!current?.markerPath) return;
    try {
      await portal.touch(current.markerPath);
      status.textContent = '';
      await showWhere();
    } catch (e) {
      status.textContent = `Could not write the marker: ${(e as Error).message}`;
    }
  });
  void showWhere();
  name.addEventListener('change', () => void showWhere());
  add(box,
    el('h3', { text: 'Where your work goes' }),
    el('ul', {}, ...PLAN_CLASS_DISCLOSURE.map((s) => el('li', { text: s }))),
    el('p', { class: 'small muted', text: 'This is asked once per browser session and before every start. The worker refuses to start until you have made this statement about its workspace, and never starts in a workspace you have marked restricted.' }),
    el('div', { class: 'row' }, el('label', { for: 'worker-name', text: 'Worker name (its run directory and workspace are named after it): ' }), name),
    where,
    el('div', { class: 'row' }, restrictedLine, markButton),
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

/**
 * The Google Drive step: one sentence, a button that opens claude.ai's connectors page in a new
 * tab (nothing of ours runs there), and a "done" box the student ticks themselves, kept on this
 * device only.
 */
export async function driveStep(onChange: () => void, compact = false): Promise<HTMLElement> {
  const list = (await local.get<Checklist>(CHECKLIST_KEY)) ?? {};
  const done = !!list.drive_connected_at;
  const box = el('div', { class: compact ? 'row' : 'card' });
  const tick = el('input', { type: 'checkbox', id: 'drive-done', checked: done });
  tick.addEventListener('change', async () => {
    await local.set(CHECKLIST_KEY, { ...list, drive_connected_at: tick.checked ? new Date().toISOString() : undefined } satisfies Checklist);
    onChange();
  });
  const open = el('button', { text: 'Open claude.ai connectors', onClick: () => void browser.tabs.create({ url: CONNECTORS_URL }) });
  if (compact) {
    add(box, el('span', { class: 'small muted', text: 'Optional: connect Google Drive in claude.ai so your worker sessions can read your Drive files.' }), open, el('label', { class: 'small', for: 'drive-done' }, tick, ' done'));
    return box;
  }
  add(box,
    el('p', {}, 'In claude.ai, open Settings, then Connectors, and connect Google Drive; that is how your worker sessions can read files you keep in Drive. Ashley Bridge only opens the page for you and runs nothing there.'),
    el('div', { class: 'row' }, open, el('label', { for: 'drive-done' }, tick, ' Done: Google Drive is connected in claude.ai'), done ? el('span', { class: 'ok small', text: `ticked ${list.drive_connected_at!.slice(0, 10)}` }) : el('span', { class: 'muted small', text: '(kept on this device only)' })),
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
  /** where the username the key was matched against came from */
  identitySource: IdentitySource;
  identityNote: string;
}

export async function licenceSummary(): Promise<LicenceSummary> {
  const terms = await local.get<unknown>(TERMS_KEY);
  const lic = await local.get<LicenseState>(LICENSE_KEY);
  const stored = await local.get<StoredKillList>(KILLLIST_KEY);
  const observed = (await local.get<{ username?: string }>(IDENTITY_KEY))?.username;
  // the portal-observed username wins; the typed one stands in only until the portal has shown one
  const who = bindIdentity(observed, lic?.identity?.accessId);
  const v = await verifyLicense(lic?.key, { keys: BUNDLED_KEYS, identity: { accessId: who.accessId }, revoked: stored?.list.revoked_lids ?? [] });
  const verdict = killListVerdict(stored, version(), v.payload?.lid);
  return {
    termsOk: recordInForce(terms),
    terms: recordInForce(terms) ? terms : undefined,
    licenceOk: v.ok,
    licenceDetail: v.status === 'missing' ? 'no licence key entered (a trial key is free)' : v.detail,
    versionRevoked: verdict.versionRevoked,
    revokedMessage: verdict.message,
    identityKnown: !!who.accessId,
    identitySource: who.source,
    identityNote: identityNote(who),
  };
}

export function licenceLine(s: LicenceSummary, onOpenSetup: () => void): HTMLElement {
  const box = el('div', { class: 'card' });
  add(box,
    el('div', {}, el('span', { class: s.termsOk ? 'ok' : 'fail', text: s.termsOk ? 'Terms accepted' : 'Terms not accepted' }), s.terms ? el('span', { class: 'muted small', text: ` on ${s.terms.accepted_at.slice(0, 10)} by ${s.terms.signed_name}` }) : null),
    el('div', {}, el('span', { class: s.licenceOk ? 'ok' : 'fail', text: s.licenceOk ? 'Licence ' : 'Licence: ' }), el('span', { class: 'small', text: s.licenceDetail }), s.licenceOk ? el('span', { class: `${s.identitySource === 'portal' ? 'muted' : 'warn'} small`, text: ` (${s.identityNote})` }) : null),
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
