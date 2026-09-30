// The flight strip: the side panel (Chrome/Edge), the sidebar (Firefox) or a tab (Safari). Top:
// one status line and ONE button showing the next step only, with the step's own input when it
// has one (the data statement, the sign-in terminal); everything else is folded under "Details".
// The step machine (core/steps.ts) decides; this file gathers the facts, renders the view and
// performs the automatic actions: waking the portal, asking the background for the access check,
// installing the tool, running the probe, opening the sign-in, starting the worker (through the
// background's one start path), polling the run's files (every 10 s for the first two minutes
// after a start, then every 60 s), and opening the Claude link once. The strip itself never
// talks to Licensor: the background does, and only the record it leaves is read here.
import { browser } from 'wxt/browser';
import type { RunState } from '../entrypoints/background';
import { commands, parseJobId } from '../core/contract';
import { gatherFacts, type Transient } from '../core/facts';
import { bundledFrameworkVersion, bundledSharedInstall, installFailureWords, installFramework, installNoteOf } from '../core/install';
import { ACCESS_KEY, CLICK_KEY, IDENTITY_KEY, INSTALL_KEY, PORTAL_KEY, PREFS_KEY, PROBE_KEY, STATEMENTS_KEY, type ClickNote, type IdentityNote, type PortalSettings, type ProbeNote } from '../core/keys';
import { decide, type Action, type Facts, type StripView } from '../core/steps';
import { stopWorker } from '../core/worker';
import { assetUrl, local, portalSettings, prefs as loadPrefs, session, version } from '../ext/storage';
import { detailsSections, type Kind } from './details';
import { add, clear, el } from './dom';
import { checkAccessNow, connectPortal, currentRun, markStopped, openEnvironment, openOptions, openPortalTab, originGranted, portal, portalAlive, portalTab, refreshRun, requestOrigin, startWorkerNow } from './rpc';
import { statementSection } from './sections';
import { openTerminal, type Terminal } from './terminal';
import { PRODUCT_NAME } from '../core/terms';

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
  /** where "Ask for access" goes, with the account name filled in */
  requestUrl: string;
  /** which copy of the tool the account runs, for the line in Details */
  install: Facts['install'];
}

/** the floor refusal a start comes back with: not a failure, the machine waits the clock out and asks again */
const FLOOR_REASON = /at most once a minute|asked less than a minute|asked less than \d+ s ago/i;

export async function mountStrip(root: HTMLElement): Promise<void> {
  const transient: Transient = {};
  // the framework version this build carries, read once: the facts compare it with ~/.hpcworker/VERSION
  const bundledVersion = bundledFrameworkVersion((p) => fetch(assetUrl(p)));
  // the shared folder the bundled profile of a site names (framework 5 shared_install), read once per site name
  const sharedBySite = new Map<string, Promise<string | undefined>>();
  const sharedFor = (site: string): Promise<string | undefined> => {
    let p = sharedBySite.get(site);
    if (!p) sharedBySite.set(site, (p = bundledSharedInstall(site, (x) => fetch(assetUrl(x)))));
    return p;
  };
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
      settings,
      prefs,
      granted: (o) => originGranted(o),
      alive: () => portalAlive(),
      portal: () => portal,
      run: state,
      click,
      transient,
      bundledFrameworkVersion: () => bundledVersion,
      bundledSharedInstall: sharedFor,
    });
    const view = decide(g.facts);
    // an approval past its day is confirmed again quietly: the background asks Licensor when its
    // caches say so (never from here), and the strip goes on meanwhile
    if (g.facts.access.ok && g.facts.access.needsCheck && !busy) void checkAccessNow(false).catch(() => undefined);
    const snap: Snapshot = { view, settings, state, click, alive: g.facts.portal.alive, url: g.facts.run.url, sessionName: g.facts.run.sessionName, requestUrl: g.facts.access.requestUrl, install: g.facts.install };
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
          // the account name the dashboard shows is the one identity the extension uses (the access check asks about it)
          if (w.session.signedIn && w.session.username) await local.set(IDENTITY_KEY, { username: w.session.username, seen_at: w.session.checkedAt } satisfies IdentityNote);
          transient.warm = w.ok && w.signedIn ? { state: 'warm' } : w.status === 0 ? { state: 'unreachable', detail: w.detail } : w.ok ? { state: 'signed-out', detail: w.detail } : { state: 'cold', detail: w.detail };
          break;
        }
        case 'check-access':
        case 'retry-access': {
          // the background asks Licensor (its caches decide whether a request is made); a button press asks again after a refusal or a failed attempt
          transient.accessFailed = undefined;
          transient.accessChecking = true;
          await tick();
          try {
            const r = await checkAccessNow(a === 'retry-access');
            if (!r.asked && r.approved === undefined) transient.accessFailed = r.detail;
          } catch (e) {
            transient.accessFailed = (e as Error).message;
          } finally {
            transient.accessChecking = false;
          }
          break;
        }
        case 'ask-access':
          // the request page on Licensor's site, with the account name filled in; the person asks, the maintainer approves
          await browser.tabs.create({ url: snap.requestUrl });
          break;
        case 'install':
        case 'retry-install': {
          transient.installing = true;
          transient.installFailed = undefined;
          await tick();
          try {
            const r = await installFramework(portal, { site: snap.settings!.site, fetchAsset: (p) => fetch(assetUrl(p)), onProgress: showLog });
            if (!r.ok) transient.installFailed = installFailureWords(r);
            // remembered so an update that changed nothing is reported once, not run again every minute,
            // and so Details can say which copy was set up (and why not the lab's, when it fell back)
            await local.set(INSTALL_KEY, installNoteOf(r, new Date()));
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
        case 'acknowledge':
        case 'poll':
          break;
      }
    } finally {
      busy = undefined;
      void tick();
    }
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
      el('div', { class: 'strip-title' }, el('strong', { text: PRODUCT_NAME }), el('span', { class: 'muted small', text: ` step ${view.index} of ${view.total}: ${view.title}` })),
      el('div', { class: 'strip-status', text: view.status }),
    );
    // the step's own input, when it has one
    if (view.input === 'statement') {
      // the statement's own button is the step's one button; the box keeps its state across renders
      if (!statementBox) statementBox = await statementSection(() => void tick(), { compact: true });
      add(head, statementBox);
    } else if (view.input === 'terminal') {
      if (terminal) add(head, terminal.root);
      add(head, primaryButton(snap));
    } else {
      add(head, primaryButton(snap));
      if (view.step === 'access' && view.primary?.action === 'ask-access') add(head, el('p', { class: 'muted small', text: "Your university's sign-in is who you are; the approved list is whether you may. The request page opens in a tab with your account name filled in." }));
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
        el('p', { class: 'muted small', text: `A first message cannot be typed for you on claude.ai: nothing of ${PRODUCT_NAME} runs there.` }),
      );
    }
    add(head, notice, log);
    root.append(head);
    const details = el('details', { class: 'details', open: detailsOpen });
    // A details element created open fires "toggle" too; ticking on that one re-rendered the strip
    // in a loop while Details was open, each pass reading five files through the portal (about ten
    // requests a second, measured 2026-09-29 against the mock). Only a person opening it asks for a tick.
    details.addEventListener('toggle', () => {
      const wasOpen = detailsOpen;
      detailsOpen = details.open;
      if (detailsOpen && !wasOpen) void tick();
    });
    details.append(el('summary', { text: 'Details' }));
    if (detailsOpen) {
      const parts = await detailsSections({
        settings,
        prefs: await loadPrefs(),
        state,
        alive: snap.alive,
        install: snap.install,
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
    if (area === 'local' && (changes[PORTAL_KEY] || changes[PREFS_KEY] || changes[ACCESS_KEY] || changes[IDENTITY_KEY] || changes[STATEMENTS_KEY] || changes['bridge.terms'])) void tick();
    if (area === 'session' && changes[CLICK_KEY]) void tick();
  });
  window.addEventListener('unload', () => terminal?.close());
  await tick();
}
