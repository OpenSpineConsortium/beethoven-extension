// Sections shared by the setup page and the strip: connecting a portal by address, the plan-class
// disclosure with the data statement (persisted per workspace), the Google Drive step, and the
// licence/agreement status line.
import { browser } from 'wxt/browser';
import { ackSubject, makeAcknowledgement, PLAN_CLASS_DISCLOSURE, STATEMENT_TEXT, statementFor, STATEMENTS_KEY, type Acknowledgement, type Statements } from '../core/disclosure';
import { paths, profileRestricts, RESTRICTED_MARKER, stateDirFrom } from '../core/contract';
import { bindIdentity, licenceIdentity, licenceNote, siteEmailDomain, type IdentitySource } from '../core/identity';
import { CHECKLIST_KEY, IDENTITY_KEY, KILLLIST_KEY, LICENSE_KEY, PREFS_KEY, type Checklist, type LicenseState, type PortalSettings, type Prefs } from '../core/keys';
import { recordInForce, TERMS_KEY, type TermsRecord } from '../core/terms';
import { writeConsentFile } from '../core/worker';
import { BUNDLED_KEYS, verifyLicense } from '../licensing/license';
import { killListVerdict, type StoredKillList } from '../licensing/killlist';
import { installId, local, portalSettings, prefs as loadPrefs, version } from '../ext/storage';
import { add, clear, el } from './dom';
import { connectPortal, disconnectPortal, openPortalTab, portal, portalAlive, requestOrigin } from './rpc';

export interface Notify {
  (kind: 'ok' | 'warn' | 'fail' | 'info', text: string): void;
}

/** the claude.ai page where a student connects Google Drive; opened in a tab, never scripted */
export const CONNECTORS_URL = 'https://claude.ai/settings/connectors';

/** where a student without a key asks for one */
export const ACCESS_REQUEST_URL = 'https://openspineconsortium.com/ashley/bridge';

/** Connect by address (the setup page) or disconnect. The toolbar click from a portal tab is the usual way in. */
export function connectSection(settings: PortalSettings | undefined, onChange: () => void, notify: Notify): HTMLElement {
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
  const input = el('input', { type: 'text', class: 'wide', placeholder: 'ondemand.your-university.edu', 'aria-label': 'Portal address' });
  const status = el('div', { class: 'status', role: 'status' });
  add(box,
    el('p', {}, 'Ashley Bridge talks to one website: your Open OnDemand portal. The usual way in: open the portal in a tab and click the Ashley Bridge button there; the browser asks you to allow that one site. Or type its address here.'),
    el('div', { class: 'row' }, input, el('button', {
      text: 'Connect',
      onClick: () => {
        // no await before the permission request: the prompt must come straight from the click
        let origin: string;
        try {
          origin = new URL(/^https?:\/\//i.test(input.value.trim()) ? input.value.trim() : `https://${input.value.trim()}`).origin;
        } catch {
          status.textContent = 'type your portal address first';
          return;
        }
        const granting = requestOrigin(origin);
        connectPortal(origin, undefined, granting)
          .then((out) => {
            notify('ok', `Connected ${out.settings.hostname}. Open it in a tab and click the Ashley Bridge button there.`);
            onChange();
          })
          .catch((e) => {
            status.textContent = (e as Error).message;
          });
      },
    })),
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
  home?: string;
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
    const marked = profileRestricts(profile, workerName) || (await portal.exists(markerPath));
    return { path: paths.workspace(stateDir, workerName), known: true, restricted: marked, markerPath, home };
  } catch {
    return { path: `<state directory>/${ackSubject(workerName)}`, known: false, restricted: false };
  }
}

/**
 * Record the statement for a worker and write the framework's consent marker on the cluster
 * (~/.hpcworker/consent: "yes <iso> <install id>"). When the portal cannot be written to right
 * now the acknowledgement is kept without consent_written_at and the start writes the file.
 */
export async function acknowledgeStatement(workerName: string): Promise<{ ack: Acknowledgement; consentWritten: boolean; note: string }> {
  const ack = makeAcknowledgement(workerName);
  const all = (await local.get<Statements>(STATEMENTS_KEY)) ?? {};
  let consentWritten = false;
  let note = '';
  try {
    if (!(await portalAlive())) throw new Error('no portal tab');
    const home = await portal.home();
    await writeConsentFile(portal, home, await installId(), ack.acknowledged_at);
    ack.consent_written_at = new Date().toISOString();
    consentWritten = true;
    note = `Your statement is recorded, and your answer to Claude Code's one-time question is written for your worker (${paths.consent(home)}).`;
  } catch (e) {
    note = `Your statement is recorded; the answer file for your worker will be written when it starts (${(e as Error).message}).`;
  }
  await local.set(STATEMENTS_KEY, { ...all, [ack.work_dir]: ack } satisfies Statements);
  return { ack, consentWritten, note };
}

/** The disclosure in the report's words and the statement about the worker's workspace; kept per workspace. */
export async function statementSection(onChange: () => void, opts: { compact?: boolean; buttonLabel?: string } = {}): Promise<HTMLElement> {
  const prefs = await loadPrefs();
  const ack = statementFor(await local.get<Statements>(STATEMENTS_KEY), prefs.worker_name);
  const box = el('div', { class: opts.compact ? 'statement' : 'card' });
  const name = el('input', { type: 'text', value: prefs.worker_name, placeholder: 'worker', 'aria-label': 'Worker name', pattern: '[A-Za-z0-9_-]{1,32}' });
  const where = el('div', { class: 'muted small mono' });
  const restrictedLine = el('div', { class: 'small' });
  const markButton = el('button', { class: 'small', text: 'Mark this workspace restricted', hidden: true });
  const tick = el('input', { type: 'checkbox', id: 'ack-tick' });
  const status = el('div', { class: 'status', role: 'status' });
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
    opts.compact ? null : el('h3', { text: 'Where your work goes' }),
    el('ul', { class: 'small' }, ...PLAN_CLASS_DISCLOSURE.map((s) => el('li', { text: s }))),
    el('p', { class: 'small muted', text: 'Asked once per workspace, and again when this text changes. The worker refuses to start until you have made this statement about its workspace, and never starts in a workspace you have marked restricted.' }),
    el('div', { class: 'row' }, el('label', { for: 'worker-name', text: 'Worker name: ' }), name),
    where,
    el('div', { class: 'row' }, restrictedLine, markButton),
    el('div', { class: 'box' }, tick, el('label', { for: 'ack-tick', text: STATEMENT_TEXT })),
    el('div', { class: 'row' },
      el('button', {
        class: 'primary',
        text: opts.buttonLabel ?? 'I have read this and the statement is true',
        onClick: async () => {
          const n = name.value.trim() || 'worker';
          if (!/^[A-Za-z0-9_-]{1,32}$/.test(n)) return void (status.textContent = 'The worker name must be letters, digits, _ or - (up to 32).');
          if (!tick.checked) return void (status.textContent = 'Tick the statement only if it is true; it is needed to continue.');
          await local.set(PREFS_KEY, { ...prefs, worker_name: n } satisfies Prefs);
          const r = await acknowledgeStatement(n);
          status.className = r.consentWritten ? 'status ok' : 'status warn';
          status.textContent = r.note;
          onChange();
        },
      }),
      ack ? el('span', { class: 'ok small', text: `made for worker "${prefs.worker_name}" on ${ack.acknowledged_at.slice(0, 10)}` }) : el('span', { class: 'warn small', text: 'not made yet for this workspace' }),
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
  const open = el('button', { class: compact ? 'small' : '', text: 'Open claude.ai connectors', onClick: () => void browser.tabs.create({ url: CONNECTORS_URL }) });
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
  licenceMissing: boolean;
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
  // the portal-observed username wins; the typed one stands in only until the portal has shown one;
  // a site key is matched to that username under the site's e-mail domain (the profile's as remembered, else the portal's own)
  const who = bindIdentity(observed, lic?.identity?.accessId);
  const settings = await portalSettings();
  const site = siteEmailDomain(undefined, settings?.hostname, settings?.email_domain);
  const v = await verifyLicense(lic?.key, { keys: BUNDLED_KEYS, identity: licenceIdentity(who, lic?.key, site), revoked: stored?.list.revoked_lids ?? [] });
  const verdict = killListVerdict(stored, version(), v.payload?.lid);
  return {
    termsOk: recordInForce(terms),
    terms: recordInForce(terms) ? terms : undefined,
    licenceOk: v.ok,
    licenceMissing: v.status === 'missing',
    licenceDetail: v.status === 'missing' ? 'no licence key entered (a trial key is free)' : v.detail,
    versionRevoked: verdict.versionRevoked,
    revokedMessage: verdict.message,
    identityKnown: !!who.accessId,
    identitySource: who.source,
    identityNote: licenceNote(who, v.payload, site, settings?.hostname),
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
