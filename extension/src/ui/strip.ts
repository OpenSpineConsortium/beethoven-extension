// The flight strip: the side panel (Chrome/Edge), the sidebar (Firefox) or a tab (Safari). Top:
// one status line and ONE button showing the next step only, with the step's own input when it
// has one (the key box, the data statement, the sign-in terminal); everything else is folded
// under "Details". The step machine (core/steps.ts) decides; this file gathers the facts, renders
// the view and performs the automatic actions: waking the portal, installing the tool, running
// the probe, opening the sign-in, starting the worker (through the background's one start path),
// polling the run's files (every 10 s for the first two minutes after a start, then every 60 s),
// and opening the Claude link once.
import { browser } from 'wxt/browser';
import type { RunState } from '../entrypoints/background';
import { commands, parseJobId } from '../core/contract';
import { gatherFacts, type Transient } from '../core/facts';
import { bundledFrameworkVersion, installFramework } from '../core/install';
import { CLICK_KEY, INSTALL_KEY, LICENSE_KEY, IDENTITY_KEY, KILLLIST_KEY, PORTAL_KEY, PREFS_KEY, PROBE_KEY, STATEMENTS_KEY, type ClickNote, type InstallNote, type LicenseState, type PortalSettings, type ProbeNote } from '../core/keys';
import { decide, type Action, type StripView } from '../core/steps';
import { bindIdentity, identityNote } from '../core/identity';
import { stopWorker } from '../core/worker';
import { BUNDLED_KEYS, findKey, peek, verifyLicense } from '../licensing/license';
import type { StoredKillList } from '../licensing/killlist';
import { assetUrl, local, portalSettings, prefs as loadPrefs, session, version } from '../ext/storage';
import { detailsSections, type Kind } from './details';
import { add, clear, el } from './dom';
import { connectPortal, currentRun, markStopped, openEnvironment, openOptions, openPortalTab, originGranted, portal, portalAlive, portalTab, refreshRun, requestOrigin, startWorkerNow } from './rpc';
import { ACCESS_REQUEST_URL, statementSection } from './sections';
import { openTerminal, type Terminal } from './terminal';

/** the run's files are read this often while the panel is open */
const FAST_POLL_MS = 10_000;
const SLOW_POLL_MS = 60_000;
/** the fast cadence applies for this long after a start */
const FAST_WINDOW_MS = 2 * 60_000;

interface Snapshot {
  view: StripView;
  settings: PortalSettings | undefined;
  state: RunState | undefined;
  click: ClickNote | undefined;
  alive: boolean;
  url?: string;
  sessionName?: string;
}

/** the floor refusal a start comes back with: not a failure, the machine waits the clock out and asks again */
const FLOOR_REASON = /at most once a minute|asked less than a minute|asked less than \d+ s ago/i;

export async function mountStrip(root: HTMLElement): Promise<void> {
  const transient: Transient = {};
  // the framework version this build carries, read once: the facts compare it with ~/.hpcworker/VERSION
  const bundledVersion = bundledFrameworkVersion((p) => fetch(assetUrl(p)));
  let terminal: Terminal | undefined;
  let busy: Action | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let detailsOpen = false;
  let statementBox: HTMLElement | undefined;
  const notice = el('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const notify = (kind: Kind, text: string) => {
    notice.className = `status ${kind === 'info' ? 'muted' : kind}`;
    notice.textContent = text;
  };
  let detailBusy = false;
  const runDetail = async (label: string, fn: () => Promise<void>) => {
    if (detailBusy) return notify('warn', 'Something is already running; wait for it to finish.');
    detailBusy = true;
    notify('info', `${label}...`);
    try {
      await fn();
    } catch (e) {
      notify('fail', (e as Error).message);
    } finally {
      detailBusy = false;
    }
  };
  // elements that keep their state across renders
  const keyBox = el('input', { type: 'text', class: 'wide mono', placeholder: 'ASHLEY1.…  (paste the whole key, or the e-mail it came in)', 'aria-label': 'Licence key' });
  const log = el('pre', { class: 'small', hidden: true });
  const showLog = (t: string) => {
    log.hidden = false;
    log.textContent = t;
  };

  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void tick(true), ms);
  };

  const tick = async (refresh = false): Promise<void> => {
    if (timer) clearTimeout(timer);
    const settings = await portalSettings();
    const prefs = await loadPrefs();
    if (refresh) await refreshRun().catch(() => undefined);
    const state = await currentRun().catch(() => undefined);
    const click = await session.get<ClickNote>(CLICK_KEY);
    const g = await gatherFacts({
      version: version(),
      now: () => Date.now(),
      local,
      keys: BUNDLED_KEYS,
      settings,
      prefs,
      granted: (o) => originGranted(o),
      alive: () => portalAlive(),
      portal: () => portal,
      run: state,
      click,
      transient,
      bundledFrameworkVersion: () => bundledVersion,
    });
    const view = decide(g.facts);
    const snap: Snapshot = { view, settings, state, click, alive: g.facts.portal.alive, url: g.facts.run.url, sessionName: g.facts.run.sessionName };
    await render(snap);
    // the automatic part, one at a time
    if (view.auto && !busy) {
      if (view.auto === 'poll') {
        const startedAt = state?.set_at ? new Date(state.set_at).getTime() : 0;
        schedule(startedAt && Date.now() - startedAt < FAST_WINDOW_MS ? FAST_POLL_MS : SLOW_POLL_MS);
      } else if (view.waitMs && view.waitMs > 0) {
        schedule(Math.min(view.waitMs + 500, SLOW_POLL_MS));
      } else {
        void perform(view.auto, snap);
      }
    } else if (view.done) {
      schedule(SLOW_POLL_MS);
    }
  };

  /** the connect button: the permission request is the first call inside the click, as Firefox requires */
  const connectFromClick = (click: ClickNote) => {
    const granting = requestOrigin(click.origin);
    connectPortal(click.origin, click.tabId, granting)
      .then((out) => notify(out.answered ? 'ok' : 'warn', out.answered ? `Connected ${out.settings.hostname}.` : `Connected ${out.settings.hostname}; the portal tab has not answered yet. Reload it if this does not change in a moment.`))
      .catch((e) => notify('fail', (e as Error).message))
      .finally(() => void tick());
  };

  const perform = async (a: Action, snap: Snapshot): Promise<void> => {
    if (busy) return;
    busy = a;
    try {
      switch (a) {
        case 'warm':
        case 'retry-warm': {
          transient.warm = { state: 'warming' };
          await tick();
          const w = await portal.warm();
          transient.warm = w.ok && w.signedIn ? { state: 'warm' } : w.status === 0 ? { state: 'unreachable', detail: w.detail } : w.ok ? { state: 'signed-out', detail: w.detail } : { state: 'cold', detail: w.detail };
          break;
        }
        case 'install':
        case 'retry-install': {
          transient.installing = true;
          transient.installFailed = undefined;
          await tick();
          try {
            const r = await installFramework(portal, { site: snap.settings!.site, fetchAsset: (p) => fetch(assetUrl(p)), onProgress: showLog });
            if (!r.ok) transient.installFailed = `the install command ended with exit ${r.exitCode} (see Details)`;
            // remembered so an update that changed nothing is reported once, not run again every minute
            await local.set(INSTALL_KEY, { attempted_at: new Date().toISOString(), ok: r.ok, detail: `exit ${r.exitCode}, ${r.uploaded} file(s) uploaded` } satisfies InstallNote);
          } catch (e) {
            transient.installFailed = (e as Error).message;
          } finally {
            transient.installing = false;
          }
          break;
        }
        case 'probe':
        case 'retry-probe': {
          transient.probeSubmitting = true;
          transient.probeFailed = undefined;
          await tick();
          try {
            const r = await portal.shell(commands.probe(), { timeoutMs: 60_000 });
            const id = parseJobId(r.output);
            if (!id) transient.probeFailed = `the probe command printed no job id (exit ${r.exitCode})`;
            else await local.set(PROBE_KEY, { submitted_at: new Date().toISOString(), job: id } satisfies ProbeNote);
            showLog(r.output);
          } catch (e) {
            // a floor refusal is not a failure: the machine waits it out on the next tick
            if ((e as { name?: string }).name !== 'FloorError') transient.probeFailed = (e as Error).message;
          } finally {
            transient.probeSubmitting = false;
          }
          break;
        }
        case 'login':
        case 'retry-login': {
          transient.loginFailed = undefined;
          // the sitting is an allocation on the login node (a scheduler call, once a minute): while
          // that clock runs, nothing is opened; the next tick shows the wait and comes back when it is over
          if ((await portal.auditWait('scheduler').catch(() => 0)) > 0) break;
          const tab = await portalTab();
          if (!tab) {
            transient.loginFailed = 'Open your portal in a tab first.';
            break;
          }
          terminal?.close();
          transient.loginInProgress = true;
          terminal = openTerminal(tab.tabId, {
            onSignedIn: () => {
              transient.loginInProgress = false;
              void tick();
            },
            onFailed: (sentence) => {
              transient.loginInProgress = false;
              transient.loginFailed = sentence;
              void tick();
            },
            onClosed: () => {
              transient.loginInProgress = false;
              void tick();
            },
          });
          break;
        }
        case 'start':
        case 'retry-start': {
          // by itself or by the button: either way the student's wish to start is on record until it
          // went through or failed, so a stopped or failed run is started once the floor allows
          transient.startRequested = true;
          transient.starting = true;
          transient.startFailed = undefined;
          await tick();
          try {
            const r = await startWorkerNow();
            const floor = !r.started && (!!r.waitMs || FLOOR_REASON.test(r.reason ?? ''));
            if (r.started) transient.startRequested = false;
            else if (!floor) {
              transient.startFailed = r.reason ?? 'a step is missing';
              transient.startRequested = false;
            }
          } catch (e) {
            transient.startFailed = (e as Error).message;
            transient.startRequested = false;
          } finally {
            transient.starting = false;
          }
          break;
        }
        case 'open-claude':
          await openEnvironment().catch(() => undefined);
          break;
        case 'connect':
          if (snap.click) connectFromClick(snap.click);
          break;
        case 'open-setup':
        case 'accept-terms':
          await openOptions();
          break;
        case 'open-portal':
          await openPortalTab().catch((e) => notify('fail', (e as Error).message));
          break;
        case 'save-key':
          await saveKey();
          break;
        case 'acknowledge':
        case 'poll':
          break;
      }
    } finally {
      busy = undefined;
      void tick();
    }
  };

  const saveKey = async () => {
    const stored = await local.get<LicenseState>(LICENSE_KEY);
    const known = (await local.get<{ username?: string }>(IDENTITY_KEY))?.username;
    const kill = await local.get<StoredKillList>(KILLLIST_KEY);
    const found = findKey(keyBox.value) ?? keyBox.value.trim();
    const who = bindIdentity(known, stored?.identity?.accessId);
    const v = await verifyLicense(found, { keys: BUNDLED_KEYS, identity: { accessId: who.accessId }, revoked: kill?.list.revoked_lids ?? [] });
    if (!v.ok) {
      const p = peek(found);
      notify('fail', `${v.detail}${p?.name ? ` (key issued to ${p.name})` : ''}`);
      return;
    }
    await local.set(LICENSE_KEY, { key: found, identity: { accessId: stored?.identity?.accessId }, saved_at: new Date().toISOString() } satisfies LicenseState);
    keyBox.value = '';
    notify('ok', `${v.detail} (${identityNote(who)}).`);
  };

  const primaryButton = (snap: Snapshot): HTMLElement | null => {
    const p = snap.view.primary;
    if (!p) return null;
    // "connect" needs the permission call inside the click itself; everything else goes through perform
    const onClick = p.action === 'connect' && snap.click ? () => connectFromClick(snap.click!) : () => void perform(p.action, snap);
    return el('div', { class: 'row' }, el('button', { class: 'primary', text: p.label, onClick }));
  };

  const render = async (snap: Snapshot) => {
    const { view, settings, state, url, sessionName } = snap;
    clear(root);
    const head = el('div', { class: `strip ${view.tone}` });
    add(head,
      el('div', { class: 'strip-title' }, el('strong', { text: 'Ashley Bridge' }), el('span', { class: 'muted small', text: ` step ${view.index} of ${view.total}: ${view.title}` })),
      el('div', { class: 'strip-status', text: view.status }),
    );
    // the step's own input, when it has one
    if (view.input === 'key') {
      add(head, el('div', { class: 'row' }, keyBox), el('div', { class: 'row' },
        el('button', { class: 'primary', text: view.primary?.label ?? 'Save the key', onClick: () => void perform('save-key', snap) }),
        el('a', { href: ACCESS_REQUEST_URL, target: '_blank', rel: 'noopener', text: 'Ask for access' }),
        el('span', { class: 'muted small', text: 'The key is checked in this browser and must name your portal username.' }),
      ));
    } else if (view.input === 'statement') {
      // the statement's own button is the step's one button; the box keeps its state across renders
      if (!statementBox) statementBox = await statementSection(() => void tick(), { compact: true });
      add(head, statementBox);
    } else if (view.input === 'terminal') {
      if (terminal) add(head, terminal.root);
      add(head, primaryButton(snap));
    } else {
      add(head, primaryButton(snap));
    }
    if (view.input !== 'statement') statementBox = undefined;
    if (view.done && url) {
      add(head,
        el('div', { class: 'row' },
          el('button', { class: 'success', text: 'Open in Claude', title: url, onClick: () => void openEnvironment() }),
          el('button', { text: 'Copy link', onClick: () => navigator.clipboard.writeText(url).then(() => notify('ok', 'Link copied.'), () => notify('warn', 'The link could not be copied; use the button instead.')) }),
          state ? el('button', { class: 'danger small', text: 'Stop', title: 'Writes the stop file; the job leaves on its own and ends its chain', onClick: () => runDetail('Stopping the worker', async () => { const o = await stopWorker(portal, state); await markStopped(); notify('ok', o.note); await tick(); }) }) : null,
        ),
        sessionName ? el('p', { class: 'small' }, 'Find ', el('span', { class: 'session-name', text: sessionName }), ' under Code in the Claude app.') : null,
        el('p', { class: 'muted small', text: 'A first message cannot be typed for you on claude.ai: nothing of Ashley Bridge runs there.' }),
      );
    }
    add(head, notice, log);
    root.append(head);
    const details = el('details', { class: 'details', open: detailsOpen });
    details.addEventListener('toggle', () => {
      detailsOpen = details.open;
      if (detailsOpen) void tick();
    });
    details.append(el('summary', { text: 'Details' }));
    if (detailsOpen) {
      const parts = await detailsSections({
        settings,
        prefs: await loadPrefs(),
        state,
        alive: snap.alive,
        notify,
        run: runDetail,
        render: () => tick(),
        stripFix: (f) => {
          if (f === 'sign-in-claude') return void perform('retry-login', snap);
          // the statement lives in the strip: fold the details so the step is in view
          details.open = false;
          detailsOpen = false;
          statementBox = undefined;
          void tick();
        },
      });
      details.append(...parts);
    }
    root.append(details);
  };

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (sender.id !== browser.runtime.id) return undefined;
    if ((message as { type?: string })?.type === 'run.changed') void tick();
    return undefined;
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[PORTAL_KEY] || changes[PREFS_KEY] || changes[LICENSE_KEY] || changes[STATEMENTS_KEY] || changes['bridge.terms'])) void tick();
    if (area === 'session' && changes[CLICK_KEY]) void tick();
  });
  window.addEventListener('unload', () => terminal?.close());
  await tick();
}
