// The background: a Chrome/Edge MV3 service worker or the Firefox persistent background, from
// one file. The toolbar click is the whole start: it opens the panel and, when the click came from
// an Open OnDemand tab, asks for that one origin and loads the page script into the tab, all
// inside the same gesture. It brokers messages between the pages and the portal page script,
// wakes once a minute to read the current run's status files, fetches the kill-list once a day,
// is the one place a worker is started from (the strip asks it; the "start when my portal opens"
// setting asks it too), opens the worker's Claude link once when it first appears, and keeps its
// state in storage.session so any page can re-attach after it restarts. It never talks to the
// portal itself: the page script on the portal origin is the only network client.
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { lookAtTab } from '../core/connect';
import { isEnvironmentUrl, parseRegistration, paths, type ConnectionFile, type StatusFile } from '../core/contract';
import { statementFor, type Statements } from '../core/disclosure';
import { environmentLinkOf, gatherFacts, type Transient } from '../core/facts';
import { bundledFrameworkVersion } from '../core/install';
import { AUTO_START_KEY, CLICK_KEY, OPENED_KEY, PORTAL_TAB_KEY, REVOKED_KEY, RUN_KEY, STATEMENTS_KEY, type AutoStartNote, type ClickNote, type OpenedLinks, type PortalSettings } from '../core/keys';
import { fail, succeed, unwrap, type Answer, type Request } from '../core/messages';
import { PORTAL_OPS, type PortalApi, type PortalOp } from '../core/portal';
import { decide } from '../core/steps';
import { startWorker } from '../core/worker';
import { killListVerdict, KILLLIST_PERIOD_MINUTES, refreshKillList, type StoredKillList } from '../licensing/killlist';
import { BUNDLED_KEYS, peek } from '../licensing/license';
import { connectApi, connectPortal, requestOrigin } from '../ext/connectApi';
import { assetUrl, installId, license, local, portalSettings, prefs as loadPrefs, session, version } from '../ext/storage';

const POLL_ALARM = 'bridge.poll';
const KILLLIST_ALARM = 'bridge.killlist';
/** the report's floor: clients read the job's files no more than once a minute */
const POLL_MINUTES = 1;
/** the "start when my portal opens" setting asks the login node at most this often */
const AUTO_START_EVERY_MS = 60_000;

export interface RunState {
  /** the framework's state directory (the profile's shared_state_dir, expanded) */
  stateDir: string;
  /** the worker's name: its run directory is <stateDir>/<run> */
  run: string;
  /** the job the start command reported; the status file carries the chain's current one */
  job: string;
  /** the profile's site name */
  site?: string;
  /** when this run was recorded here */
  set_at?: string;
  /** how it was started */
  started_by?: 'button' | 'auto' | 'strip';
  status?: StatusFile;
  connection?: ConnectionFile;
  /** what the registration block in rc.log says, when the files do not carry them yet */
  registration?: { session_name?: string; environment_url?: string; capacity?: string };
  rc_tail?: string;
  updated?: string;
  error?: string;
  /** the student pressed Stop; the run stays stopped until they start it again */
  stopped_by_student?: boolean;
}

interface PortalTab {
  tabId: number;
  origin: string;
}

export interface StartResult {
  started: boolean;
  /** why not, in the student's words, when not started */
  reason?: string;
  /** not started only because the scheduler was asked less than a minute ago: ask again after this long */
  waitMs?: number;
  job?: string;
  alreadyRunning?: boolean;
}

/** the settings, cached so the click handler can decide synchronously inside the gesture */
let settingsCache: PortalSettings | undefined;
/** at most one start in flight */
let startInFlight: Promise<StartResult> | undefined;
/** serialises the once-only opening of the Claude link */
let openChain: Promise<unknown> = Promise.resolve();

export default defineBackground({
  // Firefox MV2: a persistent background keeps the alarm and message listeners simple; ignored on MV3
  persistent: true,
  main() {
    void portalSettings().then((s) => (settingsCache = s));
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes['bridge.portal']) settingsCache = changes['bridge.portal']?.newValue as PortalSettings | undefined;
    });

    browser.runtime.onInstalled.addListener(async (details) => {
      if (details.reason === 'install') await browser.runtime.openOptionsPage();
      await ensureAlarms();
      await reRegisterPortalScript();
    });
    browser.runtime.onStartup?.addListener(async () => {
      await ensureAlarms();
      await reRegisterPortalScript();
    });
    void ensureAlarms();

    // the toolbar button: `action` on MV3, `browserAction` on the Firefox MV2 build
    const b = browser as unknown as { action?: { onClicked: { addListener(fn: (tab: ClickedTab) => void): void } }; browserAction?: { onClicked: { addListener(fn: (tab: ClickedTab) => void): void } } };
    (b.action ?? b.browserAction)?.onClicked.addListener((tab) => onActionClicked(tab));

    browser.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === POLL_ALARM) {
        await pollRun();
        await maybeAutoStart('alarm');
      } else if (alarm.name === KILLLIST_ALARM) await refreshKillListNow();
    });

    browser.runtime.onMessage.addListener((message: unknown, sender): Promise<Answer> | undefined => {
      // the OWASP rule: check who is talking before reading what they say
      if (sender.id !== browser.runtime.id) return undefined;
      const msg = message as Request;
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return undefined;
      return handle(msg, sender).catch((e) => fail(e));
    });
  },
});

interface ClickedTab {
  id?: number;
  url?: string;
  windowId?: number;
}

/**
 * Icon click = go. Everything that needs the gesture happens before the first await: the panel
 * opens, and when the tab looks like Open OnDemand (a /pun/ page, or the portal already connected)
 * the browser is asked for that origin. The rest (registering and loading the page script,
 * remembering the hostname) follows the grant.
 */
function onActionClicked(tab: ClickedTab): void {
  openPanelFor(tab);
  const look = lookAtTab(tab.url, settingsCache?.hostname);
  const note: ClickNote | undefined = look && tab.id !== undefined ? { tabId: tab.id, origin: look.origin, path: look.path, looksLikeOod: look.ood, granted: false, at: new Date().toISOString() } : undefined;
  if (look && tab.id !== undefined && look.ood) {
    const tabId = tab.id;
    const granting = requestOrigin(look.origin);
    void (async () => {
      try {
        const out = await connectPortal(look.origin, tabId, granting);
        settingsCache = out.settings;
        if (note) await session.set(CLICK_KEY, { ...note, granted: true });
        if (out.answered) await session.set(PORTAL_TAB_KEY, { tabId, origin: out.settings.origin } satisfies PortalTab);
        await tellPages();
      } catch {
        if (note) await session.set(CLICK_KEY, note);
        await tellPages();
      }
    })();
    return;
  }
  if (note) void session.set(CLICK_KEY, note).then(tellPages);
}

/** the monitoring surface this browser has: Chrome/Edge side panel, Firefox sidebar, else a tab (Safari) */
function openPanelFor(tab: ClickedTab): void {
  const b = browser as unknown as { sidePanel?: { open(o: { tabId?: number; windowId?: number }): Promise<void> }; sidebarAction?: { open(): Promise<void> } };
  try {
    if (b.sidePanel && tab.id !== undefined) {
      b.sidePanel.open({ tabId: tab.id }).catch(() => browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html') }));
      return;
    }
    if (b.sidebarAction) {
      b.sidebarAction.open().catch(() => browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html') }));
      return;
    }
  } catch {
    /* fall through */
  }
  void browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html') });
}

async function ensureAlarms(): Promise<void> {
  const poll = await browser.alarms.get(POLL_ALARM);
  if (!poll) await browser.alarms.create(POLL_ALARM, { periodInMinutes: POLL_MINUTES });
  const kl = await browser.alarms.get(KILLLIST_ALARM);
  if (!kl) {
    await browser.alarms.create(KILLLIST_ALARM, { delayInMinutes: 1, periodInMinutes: KILLLIST_PERIOD_MINUTES });
  }
}

async function handle(msg: Request, sender: { tab?: { id?: number }; url?: string }): Promise<Answer> {
  switch (msg.type) {
    case 'portal.hello': {
      // only a page script on the granted origin may register as the portal tab
      const settings = await portalSettings();
      const from = sender.url ? new URL(sender.url).origin : '';
      if (!settings || from !== settings.origin || from !== msg.origin || sender.tab?.id === undefined) return fail(new Error('hello from an unexpected origin'));
      await session.set(PORTAL_TAB_KEY, { tabId: sender.tab.id, origin: from } satisfies PortalTab);
      await tellPages();
      // the portal tab just connected: the one moment the "start when my portal opens" setting acts on
      void maybeAutoStart('hello');
      return succeed({ registered: true });
    }
    case 'portal.ping':
      return succeed(await pingPortal());
    case 'portal.tab': {
      const id = await portalTabId();
      const settings = await portalSettings();
      return succeed(id !== undefined && settings ? { tabId: id, origin: settings.origin } : undefined);
    }
    case 'portal.call': {
      if (!PORTAL_OPS.includes(msg.op)) return fail(new Error(`unknown portal operation ${String(msg.op)}`));
      return succeed(await callPortal(msg.op, msg.args ?? []));
    }
    case 'run.get':
      return succeed(await session.get<RunState>(RUN_KEY));
    case 'run.set': {
      const state: RunState = { stateDir: msg.stateDir, run: msg.run, job: msg.job, ...(msg.site ? { site: msg.site } : {}), set_at: new Date().toISOString(), started_by: 'button' };
      await session.set(RUN_KEY, state);
      await pollRun();
      return succeed(await session.get<RunState>(RUN_KEY));
    }
    case 'run.stopped': {
      const state = await session.get<RunState>(RUN_KEY);
      if (state) await session.set(RUN_KEY, { ...state, stopped_by_student: true } satisfies RunState);
      await pollRun();
      return succeed(await session.get<RunState>(RUN_KEY));
    }
    case 'run.clear':
      await session.remove(RUN_KEY);
      return succeed(undefined);
    case 'run.refresh':
      await pollRun();
      return succeed(await session.get<RunState>(RUN_KEY));
    case 'run.open':
      return succeed(await openEnvironmentOnce(true));
    case 'worker.start':
      return succeed(await startNow('strip'));
    case 'killlist.refresh':
      return succeed(await refreshKillListNow());
    default:
      return fail(new Error(`unhandled message ${(msg as { type: string }).type}`));
  }
}

/** find the tab whose page script answers: the one that said hello, else any tab on the granted origin */
async function portalTabId(): Promise<number | undefined> {
  const settings = await portalSettings();
  if (!settings) return undefined;
  const remembered = await session.get<PortalTab>(PORTAL_TAB_KEY);
  if (remembered && remembered.origin === settings.origin) {
    try {
      await browser.tabs.get(remembered.tabId);
      return remembered.tabId;
    } catch {
      await session.remove(PORTAL_TAB_KEY);
    }
  }
  // matching by URL needs host permission for that URL, which the grant provides; no "tabs" permission
  try {
    const tabs = await browser.tabs.query({ url: `${settings.origin}/*` });
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      // a tab that was open before the grant has no page script yet: load it now, as the click would have
      if (!(await connectApi.ping(tab.id).catch(() => false))) {
        await connectApi.inject(tab.id).catch(() => undefined);
        let ok = false;
        for (let i = 0; i < 8 && !ok; i++) {
          await connectApi.sleep(250);
          ok = await connectApi.ping(tab.id).catch(() => false);
        }
        if (!ok) continue;
      }
      await session.set(PORTAL_TAB_KEY, { tabId: tab.id, origin: settings.origin } satisfies PortalTab);
      return tab.id;
    }
  } catch {
    /* no match */
  }
  return undefined;
}

async function pingPortal(): Promise<boolean> {
  const id = await portalTabId();
  if (id === undefined) return false;
  return connectApi.ping(id).catch(() => false);
}

async function callPortal(op: PortalOp, args: unknown[]): Promise<unknown> {
  const id = await portalTabId();
  if (id === undefined) throw new Error('Open your portal in a tab first (the extension works only from your own portal tab).');
  let a: Answer | undefined;
  try {
    a = (await browser.tabs.sendMessage(id, { type: 'portal.call', op, args })) as Answer | undefined;
  } catch (e) {
    throw new Error(`The portal tab did not answer (${(e as Error).message}). Reload the portal tab and try again.`);
  }
  return unwrap(a);
}

/** the typed view of the page script's operations, for the background's own reads and starts */
function portal(): PortalApi {
  return new Proxy({} as PortalApi, { get: (_t, op: string) => (...args: unknown[]) => callPortal(op as PortalOp, args) });
}

/** the once-a-minute read of the current run's files; the job writes them, we never ask the scheduler */
async function pollRun(): Promise<void> {
  const state = await session.get<RunState>(RUN_KEY);
  if (!state) return;
  const p = portal();
  const next: RunState = { ...state, updated: new Date().toISOString(), error: undefined };
  try {
    const status = await p.readFileIfExists(paths.status(state.stateDir, state.run));
    if (status) next.status = JSON.parse(status) as StatusFile;
    const conn = await p.readFileIfExists(paths.connection(state.stateDir, state.run));
    if (conn) next.connection = JSON.parse(conn) as ConnectionFile;
    const log = await p.readFileIfExists(paths.rcLog(state.stateDir, state.run));
    if (log !== undefined) {
      next.rc_tail = log.slice(-4000);
      // the registration block is the ground truth for the name and the link; the files echo it
      const reg = parseRegistration(log);
      if (reg.session_name || reg.environment_url) next.registration = reg;
    }
    const url = next.connection?.environment_url ?? next.status?.environment_url ?? next.registration?.environment_url;
    if (url && !isEnvironmentUrl(url)) next.error = 'the job reported a link that is not a claude.ai/code environment link; it is not shown';
  } catch (e) {
    next.error = (e as Error).message;
  }
  await session.set(RUN_KEY, next);
  await tellPages();
  await openEnvironmentOnce(false);
}

/**
 * Open the worker's claude.ai link in a new tab the first time this browser profile sees it
 * (setting "open claude.ai when the worker connects", on by default); afterwards the green
 * button does it on request. The link opened is only ever Claude's own Code page for an
 * environment (isEnvironmentUrl), and nothing of the extension runs on it.
 */
function openEnvironmentOnce(byRequest: boolean): Promise<{ opened: boolean; url?: string }> {
  const step = openChain.then(async () => {
    const state = await session.get<RunState>(RUN_KEY);
    const url = environmentLinkOf(state);
    if (!url) return { opened: false };
    const opened = (await local.get<OpenedLinks>(OPENED_KEY)) ?? { urls: [] };
    const prefs = await loadPrefs();
    if (!byRequest && (!prefs.open_claude_on_connect || opened.urls.includes(url))) return { opened: false, url };
    await browser.tabs.create({ url });
    if (!opened.urls.includes(url)) await local.set(OPENED_KEY, { urls: [...opened.urls.slice(-19), url] } satisfies OpenedLinks);
    await tellPages();
    return { opened: true, url };
  });
  openChain = step.catch(() => undefined);
  return step;
}

async function tellPages(): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'run.changed' } satisfies Request);
  } catch {
    /* no page open to hear it */
  }
}

/**
 * The one start path. The facts are gathered afresh here and the step machine decides: the
 * worker is started only when it is the next step (terms, key, tool, probe, sign-in and the
 * statement all in order, no worker alive, the scheduler floor open). The strip and the
 * "start my worker when I open my portal" setting both come through here, so two starts can
 * never race: at most one is in flight, and hpcworker itself finds a job that already exists.
 * A stopped or failed worker is the one case the two callers differ on: the strip asks after the
 * student pressed its "Start again" button (the machine offers that button and nothing automatic),
 * and that press is honoured; the setting never restarts one.
 */
function startNow(trigger: 'strip' | 'auto'): Promise<StartResult> {
  if (startInFlight) return startInFlight;
  startInFlight = (async (): Promise<StartResult> => {
    const settings = await portalSettings();
    if (!settings) return { started: false, reason: 'no portal connected' };
    const p = portal();
    const prefs = await loadPrefs();
    const transient: Transient = {};
    try {
      const w = await p.warm();
      transient.warm = w.ok && w.signedIn ? { state: 'warm' } : w.status === 0 ? { state: 'unreachable', detail: w.detail } : w.ok ? { state: 'signed-out', detail: w.detail } : { state: 'cold', detail: w.detail };
    } catch (e) {
      return { started: false, reason: (e as Error).message };
    }
    const run = await session.get<RunState>(RUN_KEY);
    const click = await session.get<ClickNote>(CLICK_KEY);
    const g = await gatherFacts({
      version: version(),
      now: () => Date.now(),
      local,
      keys: BUNDLED_KEYS,
      settings,
      prefs,
      granted: (o) => connectApi.containsOrigin(o),
      alive: () => pingPortal(),
      portal: () => p,
      run,
      click,
      transient,
      bundledFrameworkVersion: () => bundledFrameworkVersion((path) => fetch(assetUrl(path))),
    });
    const view = decide(g.facts);
    const byButton = view.step === 'start' && (view.primary?.action === 'start' || view.primary?.action === 'retry-start');
    const allowed = view.step === 'start' && (view.auto === 'start' || (trigger === 'strip' && byButton));
    if (!allowed) return { started: false, reason: view.status };
    const wait = g.facts.run.schedulerWaitMs;
    if (wait > 0) return { started: false, waitMs: wait, reason: `Starting your worker in ${Math.ceil(wait / 1000)} s (the scheduler is asked at most once a minute)...` };
    const ack = statementFor(await local.get<Statements>(STATEMENTS_KEY), prefs.worker_name);
    try {
      const out = await startWorker(p, { name: prefs.worker_name, permissionMode: prefs.permission_mode, site: settings.site, ack, consent: { installId: await installId(), written: !!ack?.consent_written_at } });
      if (out.consentWritten && ack) {
        const all = (await local.get<Statements>(STATEMENTS_KEY)) ?? {};
        await local.set(STATEMENTS_KEY, { ...all, [ack.work_dir]: { ...ack, consent_written_at: new Date().toISOString() } } satisfies Statements);
      }
      const state: RunState = { stateDir: out.stateDir, run: prefs.worker_name, job: out.job, site: out.site, set_at: new Date().toISOString(), started_by: trigger };
      await session.set(RUN_KEY, state);
      await pollRun();
      return { started: true, job: out.job, alreadyRunning: out.alreadyRunning };
    } catch (e) {
      return { started: false, reason: (e as Error).message };
    }
  })();
  startInFlight.finally(() => (startInFlight = undefined)).catch(() => undefined);
  return startInFlight;
}

/**
 * The "start my worker when I open my portal" setting (on by default). It runs the one start
 * path when the portal tab connects and at the once-a-minute check, at most once a minute, and
 * records what it did for the panel to show. The step machine inside startNow keeps it honest:
 * nothing starts while a step is missing, while a worker is alive, or while a stopped worker is
 * meant to stay stopped.
 */
async function maybeAutoStart(trigger: 'hello' | 'alarm'): Promise<void> {
  const prefs = await loadPrefs();
  if (!prefs.auto_start) return;
  if (!(await portalSettings())) return;
  const last = await session.get<AutoStartNote>(AUTO_START_KEY);
  if (last && Date.now() - new Date(last.attempted_at).getTime() < AUTO_START_EVERY_MS) return;
  const run = await session.get<RunState>(RUN_KEY);
  if (run?.stopped_by_student || run?.status?.state === 'stopped') return;
  if (!(await pingPortal())) return;
  const r = await startNow('auto');
  await session.set(AUTO_START_KEY, { attempted_at: new Date().toISOString(), outcome: r.started ? `${r.alreadyRunning ? 'found running' : 'started'} on the portal ${trigger === 'hello' ? 'connecting' : 'check'}: job ${r.job}` : `not started: ${r.reason ?? 'a step is missing'}` } satisfies AutoStartNote);
  await tellPages();
}

async function refreshKillListNow(): Promise<{ detail: string; revoked: boolean }> {
  const previous = await local.get<StoredKillList>('bridge.killlist');
  const out = await refreshKillList(previous, BUNDLED_KEYS, fetch);
  if (out.fresh && out.current) await local.set('bridge.killlist', out.current);
  const lic = await license();
  const lid = lic ? peek(lic.key)?.lid : undefined;
  const verdict = killListVerdict(out.current, version(), lid);
  // what the page script's chokepoint consults before sending any command
  await local.set(REVOKED_KEY, { revoked: verdict.versionRevoked, message: verdict.message, checked_at: new Date().toISOString() });
  return { detail: out.detail, revoked: verdict.versionRevoked };
}

/** Chrome keeps runtime registrations across restarts, Firefox does not; re-register when the grant still stands. */
async function reRegisterPortalScript(): Promise<void> {
  const settings = await portalSettings();
  if (!settings) return;
  if (!(await connectApi.containsOrigin(settings.origin))) return;
  if ((await connectApi.scriptRegisteredFor()) === settings.origin) return;
  await connectApi.unregisterScript();
  await connectApi.registerScript(settings.origin);
}
