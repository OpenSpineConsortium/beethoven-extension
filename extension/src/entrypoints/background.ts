// The background: a Chrome/Edge MV3 service worker or the Firefox persistent background, from
// one file. It brokers messages between the pages and the portal page script, wakes once a
// minute to read the current run's status files, fetches the kill-list once a day, and keeps
// its state in storage.session so any page can re-attach after it restarts. It never talks to
// the portal itself: the page script on the portal origin is the only network client.
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { paths, type ConnectionFile, type StatusFile } from '../core/contract';
import { KILLLIST_KEY, PORTAL_TAB_KEY, REVOKED_KEY, RUN_KEY } from '../core/keys';
import { fail, succeed, unwrap, type Answer, type Request } from '../core/messages';
import { PORTAL_OPS, type PortalApi, type PortalOp } from '../core/portal';
import { killListVerdict, KILLLIST_PERIOD_MINUTES, refreshKillList, type StoredKillList } from '../licensing/killlist';
import { BUNDLED_KEYS, peek } from '../licensing/license';
import { license, local, portalSettings, session, version } from '../ext/storage';

const POLL_ALARM = 'bridge.poll';
const KILLLIST_ALARM = 'bridge.killlist';
/** the report's floor: clients read the job's files no more than once a minute */
const POLL_MINUTES = 1;

export interface RunState {
  /** the framework's state directory (the profile's shared_state_dir, expanded) */
  stateDir: string;
  /** the worker's name: its run directory is <stateDir>/<run> */
  run: string;
  job: string;
  /** the profile's site name, the first half of the session name */
  site?: string;
  status?: StatusFile;
  connection?: ConnectionFile;
  rc_tail?: string;
  updated?: string;
  error?: string;
}

interface PortalTab {
  tabId: number;
  origin: string;
}

export default defineBackground({
  // Firefox MV2: a persistent background keeps the alarm and message listeners simple; ignored on MV3
  persistent: true,
  main() {
    browser.runtime.onInstalled.addListener(async (details) => {
      if (details.reason === 'install') await browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
      await ensureAlarms();
      await reRegisterPortalScript();
    });
    browser.runtime.onStartup?.addListener(async () => {
      await ensureAlarms();
      await reRegisterPortalScript();
    });
    void ensureAlarms();

    browser.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === POLL_ALARM) await pollRun();
      else if (alarm.name === KILLLIST_ALARM) await refreshKillListNow();
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
      return succeed({ registered: true });
    }
    case 'portal.ping':
      return succeed(await pingPortal());
    case 'portal.call': {
      if (!PORTAL_OPS.includes(msg.op)) return fail(new Error(`unknown portal operation ${String(msg.op)}`));
      return succeed(await callPortal(msg.op, msg.args ?? []));
    }
    case 'run.get':
      return succeed(await session.get<RunState>(RUN_KEY));
    case 'run.set': {
      const state: RunState = { stateDir: msg.stateDir, run: msg.run, job: msg.job, ...(msg.site ? { site: msg.site } : {}) };
      await session.set(RUN_KEY, state);
      await pollRun();
      return succeed(await session.get<RunState>(RUN_KEY));
    }
    case 'run.clear':
      await session.remove(RUN_KEY);
      return succeed(undefined);
    case 'run.refresh':
      await pollRun();
      return succeed(await session.get<RunState>(RUN_KEY));
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
    const tab = tabs.find((t) => t.id !== undefined);
    if (tab?.id !== undefined) {
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
  try {
    const a = (await browser.tabs.sendMessage(id, { type: 'portal.ping' })) as Answer<boolean> | undefined;
    return !!a && a.ok && a.value === true;
  } catch {
    return false;
  }
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

/** the typed view of the page script's operations, for the background's own reads */
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
    if (log !== undefined) next.rc_tail = log.slice(-4000);
  } catch (e) {
    next.error = (e as Error).message;
  }
  await session.set(RUN_KEY, next);
  try {
    await browser.runtime.sendMessage({ type: 'run.changed' } satisfies Request);
  } catch {
    /* no page open to hear it */
  }
}

async function refreshKillListNow(): Promise<{ detail: string; revoked: boolean }> {
  const previous = await local.get<StoredKillList>(KILLLIST_KEY);
  const out = await refreshKillList(previous, BUNDLED_KEYS, fetch);
  if (out.fresh && out.current) await local.set(KILLLIST_KEY, out.current);
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
  const granted = await browser.permissions.contains({ origins: [`${settings.origin}/*`] });
  if (!granted) return;
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: ['ashley-bridge-portal'] }).catch(() => []);
  if (existing.length) return;
  await browser.scripting.registerContentScripts([
    { id: 'ashley-bridge-portal', js: ['/content-scripts/portal.js'], matches: [`${settings.origin}/*`], runAt: 'document_idle', persistAcrossSessions: true },
  ]);
}
