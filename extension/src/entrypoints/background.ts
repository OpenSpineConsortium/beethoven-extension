// The background (11.0.0, and 12.0.0's direct way): a Chrome/Edge MV3 service worker or the Firefox persistent background,
// from one file. It is where everything happens; the pages only draw the views it pushes and send the
// actions the student presses (core/model.ts, core/messages.ts VIEW_PORT).
//
//   The panel is window-wide and opens on the toolbar click (sidePanel.setPanelBehavior); the welcome
//   page's one press of "Agree and continue" opens it and asks Chrome for the portal's site in the same
//   click (ext/gesture.ts), then this background takes over.
//   The grid sign-in: Wayne State's portal signs in with the browser's own HTTP box (AM1). This
//   background navigates the welcome tab (or opens one sign-in tab for a later press), watches it with
//   no timer loop of its own (tabs.onUpdated, the panel's 2-second tick, a 30-second alarm), reads the
//   AccessID from the dashboard with its own GET, runs the channel test once, and closes the tab under
//   the guards (core/tabs.ts).
//   The channel: "direct", a portal client here with credentials "include" (the browser attaches the
//   sign-in it holds), or "tab", where shell lines run in a page script in a portal tab Beethoven opens
//   inactive and closes (core/channel.ts). Every write is one of the lab's tool's shell verbs.
//   Connect: one `hpcworker connect` line carries the approval-checked press through to "You're online":
//   the Remote Control answer, the queued worker, and the Claude sign-in sitting held here (the code is
//   typed once and forgotten; core/login.ts CodeGate). The queue is narrated from status.json (R1 to
//   R13, core/facts.ts).
//   AM2's one-time key step (UNPROVEN ON THE GRID): when the shell asks for a password while a press
//   waits, the student types it into the university's own terminal page; Beethoven types only the one
//   setup line, after "I'm in" (core/loginSetup.ts).
//   12.0.0, the direct way first (decision D3; docs/V12_CONTRACT.md): ssh to the grid with no VPN,
//   through the first bridge this browser has (core/bridge.ts: a browser-only one when known, a relay
//   the site profile names, else the helper inside Beethoven, offered for a one-time install), signed
//   in once in Beethoven's own sheet (core/signin.ts) so this computer's key is enrolled, then every
//   action through the gate with the key (core/sshChannel.ts). Only when no bridge is there, or the
//   student chooses it, or the grid's ssh door does not answer, the 11.0.0 way above runs unchanged.
//
// It never runs anything on, and holds no site permission for, claude.ai, claude.com or anthropic.com
// (it opens Anthropic's sign-in page and the claude.ai link in tabs, as a bookmark would); it never
// reads, stores or relays a Claude credential or the university password; nothing goes to the lab
// before the agreement is accepted, and the approval check's fields are unchanged.
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { Audit, AUDIT_KEY, clearRecordsKeepingClocks } from '../core/audit';
import { BridgeError, chooseBridge, GRID_HOST, GRID_HOST_KEY_PIN, GRID_PORT, helperDownloadFor, RelayBridge, relayConfigFrom, StoreExtensionBridge, type BridgeProvider, type WsLikeCtor } from '../core/bridge';
import { forgetKey, keyState, loadIdentity, type KeyState } from '../core/keyring';
import { SignInFlow, type SignInOutcome } from '../core/signin';
import { DirectError, directFailureOf, SshPortal } from '../core/sshChannel';
import { testChannel, tabPortal, withPortalTab, readyScript } from '../core/channel';
import { buildNodes, type DiagCtx } from '../core/checks';
import { acceptedSettings, isAnthropicAddress, normaliseOrigin, SCRIPT_ID } from '../core/connect';
import { commands, gateText, isEnvironmentUrl, parseGateJson, parseJobId, parseRegistration, paths, planAllowsRemoteControl, planWord, reasonClass, sessionTitleFor, sharedRootOf, type ConnectEvent, type ConnectOptions, type GateFile, type LoginMode, type SiteProfile, type StatusFile, type ConnectionFile } from '../core/contract';
import { formatReport, runDiagnostics, type DiagReport } from '../core/diagnostics';
import { makeAcknowledgement, statementFor, withConsentRecorded, type Statements } from '../core/disclosure';
import { addActivity, addWait, applyConnection, applyStatus, applyStatusRead, environmentLinkOf, listingPlan, mergeLog, runFacts, waitMinutes, type RunState } from '../core/facts';
import { bundledProfile, usesSharedCopy } from '../core/install';
import {
  ACCESS_KEY,
  ACTIVITY_KEY,
  ANTHROPIC_TAB_KEY,
  BRIDGE_KEY,
  CHANNEL_KEY,
  CHECKLIST_KEY,
  CHECKS_KEY,
  CLAUDE_TAB_KEY,
  DEFAULT_PREFS,
  defaultPortalFrom,
  DIRECT_KEY,
  GRID_KEY,
  IDENTITY_KEY,
  KILLLIST_KEY,
  LAST_KNOWN_KEY,
  ONCE_KEY,
  PORTAL_KEY,
  PREFS_KEY,
  PRESS_KEY,
  PROBE_KEY,
  REVOKED_KEY,
  ROUTE_KEY,
  REFUSALS_KEY,
  RUN_KEY,
  SERVICES_KEY,
  SIGNIN_TAB_KEY,
  siteFromHostname,
  STATEMENTS_KEY,
  TERMINAL_TAB_KEY,
  TOUR_SEEN_KEY,
  WAIT_HISTORY_KEY,
  WELCOME_PRESS_KEY,
  type ActivityEntry,
  type AnthropicTab,
  type BridgeNote,
  type ChannelNote,
  type Checklist,
  type DirectNote,
  type GridNote,
  type IdentityNote,
  type LastKnown,
  type OnceNotes,
  type OpenedTab,
  type PendingPress,
  type PortalSettings,
  type Prefs,
  type ProbeNote,
  type RouteNote,
  type RefusalNote,
  type TourSeen,
  type WaitHistory,
} from '../core/keys';
import { CodeGate, ConnectWatcher } from '../core/login';
import { LoginSetupFlow } from '../core/loginSetup';
import { CONNECT_PORT, fail, succeed, unwrap, VIEW_PORT, type Answer, type ConnectOut, type Request, type TerminalTyped, type ViewIn, type ViewOut } from '../core/messages';
import { BADGE_COLORS, DIRECT_LINKS, LOG_WORDS, WORDS, type Action, type ActionResults, type ConnectFailure, type ConnectionSettingsView, type DirectDetails, type HelperDownload, type Surface, type SurfaceView, type WelcomeView } from '../core/model';
import type { WsConstructor } from '../core/net';
import { reach } from '../core/net';
import { DASHBOARD, PORTAL_OPS, PortalClient, type PortalApi, type SessionInfo } from '../core/portal';
import { isPasswordError, shellPageUrl, type ShellSession } from '../core/shell';
import { detailsView, settingsView } from '../core/sheets';
import { connectionMode, ENROLLED_HOLD_MS, firstRunDone, FOUND_HOLD_MS, PROTECTED_HOLD_MS, heroOf, home, lastKnownOf, panelView, toolbarView, welcomeView, type ConnectFacts, type DirectFacts, type Facts, type SetupFacts, type SigninFacts, type SiteWords } from '../core/steps';
import { sessionTabDecision, noteLoad, stillWhereLeft } from '../core/tabs';
import { bindAccount, recordInForce, TERMS_KEY, TERMS_REFUSAL, type TermsRecord } from '../core/terms';
import { connectLine, restrictByShell, statusByShell, stopByShell, withFloor, clusterContext } from '../core/worker';
import { accessFact, accessForced, ACCESS_PERIOD_MINUTES, checkAccess, NOT_ASKED_NO_ACCOUNT, NOT_ASKED_NO_PORTAL, NOT_ASKED_TERMS, requestUrl, type AccessRecord, type AccessTrigger, type StoredServices } from '../licensing/access';
import { killListVerdict, KILLLIST_PERIOD_MINUTES, refreshKillList, type StoredKillList } from '../licensing/killlist';
import { BUNDLED_KEYS } from '../licensing/signed';
import { connectApi, disconnectPortal, dropAnthropicLeftovers, savePortal } from '../ext/connectApi';
import { bridgeManifest, browserKeyring, helperBridge, helperOs } from '../ext/direct';
import { hasPanel } from '../ext/gesture';
import { assetUrl, installId, local, prefs as loadPrefs, session, version } from '../ext/storage';
import { activeTabIn, closeUnderGuards, focusTab, openTab, tabHost, tabNow } from '../ext/tabs';

export type { RunState } from '../core/facts';

const POLL_ALARM = 'bridge.poll';
const SIGNIN_ALARM = 'bridge.signin';
const KILLLIST_ALARM = 'bridge.killlist';
const ACCESS_ALARM = 'bridge.access';
/** the daily alarm leaves the kill-list alone when it was fetched this recently */
const KILLLIST_ALARM_SKIP_MS = 60 * 60_000;

/** the bundled site profile the welcome page offers first (public/profiles/wayne.json) */
const DEFAULT_SITE = 'wayne';
const HELP_URL = 'https://openspineconsortium.com/beethoven/support.html';

// cadences (docs/V11_CONTRACT.md §12)
/** the run folder's listing while a start is in progress and a page is open */
const LIST_STARTING_MS = 5_000;
/** otherwise */
const LIST_IDLE_MS = 60_000;
/** `worker status --json` while queued, a page open */
const STATUS_JSON_MS = 60_000;
/** the Grid row's live check while a page is open (D37) */
const GRID_LIVE_MS = 60_000;
/** the sign-in watch on the panel's tick */
const SIGNIN_WATCH_MS = 2_000;
/** the GlobalProtect moment's reachability check */
const REACH_EVERY_MS = 3_000;
/** "Done. You won't need this again." holds this long before the waiting press carries on */
const KEY_DONE_HOLD_MS = 1_500;
/** a waiting press asks again for what it waits on (the approval, the setup) at most this often */
const PRESS_RETRY_MS = 15_000;

/** the toolbar's unlit rack (no tile, the ink's faint tone): it recedes on a light and a dark toolbar, so the lit one always reads as "on" */
const PLAIN_ICONS = { 16: '/icon/off-16.png', 32: '/icon/off-32.png', 48: '/icon/off-48.png', 128: '/icon/off-128.png' };
const LIT_ICONS = { 16: '/icon/on-16.png', 32: '/icon/on-32.png', 48: '/icon/on-48.png', 128: '/icon/on-128.png' };

type ViewPort = { name: string; sender?: { id?: string; tab?: { id?: number } }; postMessage(m: ViewOut): void; onMessage: { addListener(fn: (m: unknown) => void): void }; onDisconnect: { addListener(fn: () => void): void } };

/** the welcome page is still open in that tab: its own port says so (no "tabs" permission, no address read) */
function welcomeStillIn(tabId: number | undefined): boolean {
  if (tabId === undefined) return false;
  for (const [port, sub] of mem.ports) if (sub.surface === 'welcome' && port.sender?.tab?.id === tabId) return true;
  return false;
}

/** the Claude sign-in sitting in flight (one at most) */
interface Sitting {
  id: number;
  /** direct: the portal's shell from here; tab: a page script in a portal tab; ssh: 12.0.0's direct way (the held sign-in session, or connect through the gate) */
  mode: 'direct' | 'tab' | 'ssh';
  login: LoginMode;
  gate: CodeGate;
  close(): void;
  /** Anthropic's authorize link, in memory only, for "Open the Claude tab again" */
  authUrl?: string;
  /** tab mode: the tab the sitting runs in, and whether this sitting opened it */
  tabId?: number;
  ownTab?: boolean;
}

const freshConnect = (): ConnectFacts => ({ inFlight: false, queued: false, signin: 'none' });

const mem = {
  ports: new Map<ViewPort, { surface: Surface; windowId?: number; last?: string }>(),
  panelWindowId: undefined as number | undefined,
  sitting: undefined as Sitting | undefined,
  sittingSeq: 0,
  connect: freshConnect(),
  loginSetup: undefined as LoginSetupFlow | undefined,
  setup: { state: 'unknown' } as SetupFacts,
  signin: { waiting: false } as SigninFacts,
  lookingSince: undefined as number | undefined,
  answeredAt: undefined as number | undefined,
  accessChecking: false,
  stopping: false,
  restricted: false,
  logOpen: false,
  checksRunning: false,
  toast: undefined as { text: string; until: number } | undefined,
  onlineAnnouncedAt: undefined as number | undefined,
  tourFromMenu: false,
  welcome: { state: 'idle' as WelcomeView['state'], problem: undefined as string | undefined },
  welcomeTab: undefined as { tabId?: number; windowId?: number } | undefined,
  pinned: undefined as boolean | undefined,
  workingInTab: 0,
  keptTabId: undefined as number | undefined,
  sharedDir: undefined as { key: string; dir?: string } | undefined,
  profile: undefined as { site: string; profile?: SiteProfile } | undefined,
  client: undefined as { key: string; client: PortalClient } | undefined,
  failDetail: '',
  last: { list: 0, statusJson: 0, grid: 0, reach: 0, signin: 0, lastKnownAt: 0, pressAccess: 0, pressSetup: 0, carry: 0 },
  busy: { list: false, grid: false, reach: false, statusJson: false, setup: false, push: false, signedIn: false, press: false },
  lastToolbar: '',
  lastKnownJson: '',
  pollEvery: 0,
  /**
   * the start of a connect line under way (its sitting id), 0 when none: claimed before the first await
   * of startConnect, so a press and the panel's tick carrying the same press never type two lines
   */
  startId: 0,
  /** student presses being carried out now (Connect, Stop, Sign in to Claude…): the tick carries nothing meanwhile */
  pressDepth: 0,
  /** 12.0.0: the direct way */
  direct: {
    providers: undefined as { key: string; list: BridgeProvider[] } | undefined,
    probing: false,
    probingNow: undefined as Promise<BridgeNote> | undefined,
    lastProbe: 0,
    probeDetail: undefined as string[] | undefined,
    foundAt: undefined as number | undefined,
    downloadedAt: undefined as number | undefined,
    /** undefined: not read yet; null: no file for this computer */
    download: undefined as HelperDownload | null | undefined,
    key: undefined as { at: number; state: KeyState } | undefined,
    portal: undefined as { key: string; portal: SshPortal } | undefined,
    sheet: undefined as SignInFlow | undefined,
    /** a press waits on a direct sign-in: the sheet is shown */
    sheetWanted: false,
    /** the sign-in the sheet asks for is a Claude one (a press of Sign in to Claude, or a Connect that needs it) */
    claudeWanted: false,
    /** the grid's ssh door did not answer through the bridge */
    unreachable: false,
    enrolledAt: undefined as number | undefined,
    protectOutcome: undefined as 'on' | 'cancelled' | 'unsupported' | 'failed' | undefined,
    /** when the first-run card's Turn on worked: "Protected." holds PROTECTED_HOLD_MS before the moment moves on */
    protectedAt: undefined as number | undefined,
    /** what `version` through the gate last said of Claude Code's sign-in on the grid */
    claude: undefined as 'yes' | 'no' | 'unknown' | undefined,
    /** the probe running now is the student's own Check again */
    probingByHand: false,
    /** Check again was pressed since the installer was saved */
    checkedByHand: false,
    /** the page's last Unlock did not unlock */
    unlockFailed: false,
    /** "Use GlobalProtect instead" was pressed: the fallback moment is shown once, even without a waiting press */
    fallbackWanted: false,
  },
};

/** the presses whose handling keeps the tick from carrying a kept press at the same moment */
const PRESS_KINDS: ReadonlySet<Action['kind']> = new Set(['connect', 'sign-in-claude', 'stop', 'restrict', 'retry', 'cancel']);

let runChain: Promise<unknown> = Promise.resolve();

/**
 * Every write of the run record (session RUN_KEY) goes through here, one at a time: `fn` sees the
 * record as it is now, never a copy read before an await, and returns the next one (undefined: leave it
 * as it is; null: remove it). A listing, the scheduler's answer, a Connect's queued step and a Stop can
 * all land within the same second; none of them may write back a copy that another has moved on from.
 */
function mutateRun(fn: (cur: RunState | undefined) => RunState | null | undefined | Promise<RunState | null | undefined>): Promise<RunState | undefined> {
  const next = runChain.then(async () => {
    const cur = await session.get<RunState>(RUN_KEY);
    const out = await fn(cur);
    if (out === null) {
      await session.remove(RUN_KEY);
      return undefined;
    }
    if (out === undefined) return cur;
    await session.set(RUN_KEY, out);
    return out;
  });
  runChain = next.catch(() => undefined);
  return next;
}

/** the same run (its folder): a listing or an answer about one run is never written into another */
const sameRun = (a: RunState | undefined, b: RunState | undefined): boolean => !!a && !!b && a.stateDir === b.stateDir && a.run === b.run;

let leftovers: Promise<unknown> | undefined;
const dropLeftoversOnce = (): Promise<unknown> => (leftovers ??= dropAnthropicLeftovers().catch(() => undefined));
let accessInFlight: Promise<AccessOutcome> | undefined;

export default defineBackground({
  // Firefox MV2: a persistent background keeps the alarm and message listeners simple; ignored on MV3
  persistent: true,
  main() {
    void dropLeftoversOnce();
    void setPanelBehavior();
    void unregisterOldScripts();
    browser.storage.onChanged.addListener((changes, area) => {
      // the first request to the lab follows the acceptance of the agreement, never precedes it
      if (area === 'local' && changes[TERMS_KEY] && recordInForce(changes[TERMS_KEY]?.newValue) && !recordInForce(changes[TERMS_KEY]?.oldValue)) {
        void refreshKillListNow();
        void checkAccessNow('terms');
      }
      if (area === 'local' && (changes[PREFS_KEY] || changes[PORTAL_KEY] || changes[TERMS_KEY] || changes[STATEMENTS_KEY])) schedulePush();
      // the welcome page's press, written inside its click: the panel opening beside it says "Almost there."
      if (area === 'session' && changes[WELCOME_PRESS_KEY]) schedulePush();
    });
    browser.runtime.onInstalled.addListener(async (details) => {
      // the options page shows the welcome until the agreement is accepted
      if (details.reason === 'install') await browser.runtime.openOptionsPage().catch(() => undefined);
      await ensureAlarms();
      await dropLeftoversOnce();
      await unregisterOldScripts();
    });
    browser.runtime.onStartup?.addListener(async () => {
      await ensureAlarms();
      await dropLeftoversOnce();
    });
    void ensureAlarms();

    // a browser with no side panel: the toolbar opens the panel page another way
    if (!(browser as unknown as { sidePanel?: unknown }).sidePanel) {
      const b = browser as unknown as { action?: { onClicked: { addListener(fn: () => void): void } }; browserAction?: { onClicked: { addListener(fn: () => void): void } }; sidebarAction?: { open(): Promise<void> } };
      (b.action ?? b.browserAction)?.onClicked.addListener(() => {
        if (b.sidebarAction) void b.sidebarAction.open().catch(() => browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html') }));
        else void browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html') });
      });
    }

    browser.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === POLL_ALARM) await backgroundPoll();
      else if (alarm.name === SIGNIN_ALARM) await signinAlarm();
      else if (alarm.name === KILLLIST_ALARM) await refreshKillListNow({ skipIfFetchedWithinMs: KILLLIST_ALARM_SKIP_MS });
      else if (alarm.name === ACCESS_ALARM) await checkAccessNow('alarm');
    });

    browser.runtime.onMessage.addListener((message: unknown, sender): Promise<Answer> | undefined => {
      // the OWASP rule: check who is talking before reading what they say
      if (sender.id !== browser.runtime.id) return undefined;
      const msg = message as Request;
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return undefined;
      return handle(msg, sender).catch((e) => fail(e));
    });

    browser.runtime.onConnect.addListener((port) => {
      const p = port as unknown as ViewPort;
      if (p.sender?.id !== browser.runtime.id || p.name !== VIEW_PORT) return;
      onViewPort(p);
    });

    browser.tabs.onUpdated.addListener((tabId, info, tab) => void onTabUpdated(tabId, info as { status?: string; url?: string }, tab as { url?: string; windowId?: number }));
    browser.tabs.onRemoved.addListener((tabId) => void onTabRemoved(tabId));

    const a = browser.action as unknown as { getUserSettings?: () => Promise<{ isOnToolbar?: boolean }>; onUserSettingsChanged?: { addListener(fn: (s: { isOnToolbar?: boolean }) => void): void } } | undefined;
    void a
      ?.getUserSettings?.()
      .then((s) => (mem.pinned = !!s.isOnToolbar))
      .catch(() => undefined);
    a?.onUserSettingsChanged?.addListener((s) => void onPinChanged(!!s.isOnToolbar));

    schedulePush();
  },
});

// ---- small helpers -----------------------------------------------------------------------------------

const nowIso = () => new Date().toISOString();

async function setPanelBehavior(): Promise<void> {
  const sp = (browser as unknown as { sidePanel?: { setPanelBehavior(o: { openPanelOnActionClick: boolean }): Promise<void> } }).sidePanel;
  await sp?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
}

/** 11.0.0 registers no page script; one an earlier build left (10.0.0 registered it for the portal) goes */
async function unregisterOldScripts(): Promise<void> {
  try {
    const all = await browser.scripting.getRegisteredContentScripts();
    // 10.0.0 registered SCRIPT_ID for the portal (and builds before 7.0.0 another id); 11.0.0 registers none
    const ids = all.map((s) => s.id);
    if (ids.length) await browser.scripting.unregisterContentScripts({ ids });
    void SCRIPT_ID;
  } catch {
    /* none, or this browser keeps none */
  }
}

async function ensureAlarms(): Promise<void> {
  if (!(await browser.alarms.get(POLL_ALARM))) await setPollEvery(1);
  if (!(await browser.alarms.get(KILLLIST_ALARM))) await browser.alarms.create(KILLLIST_ALARM, { delayInMinutes: 1, periodInMinutes: KILLLIST_PERIOD_MINUTES });
  if (!(await browser.alarms.get(ACCESS_ALARM))) await browser.alarms.create(ACCESS_ALARM, { delayInMinutes: 2, periodInMinutes: ACCESS_PERIOD_MINUTES });
}

/** the background's own alarm: every 30 s from Connect until online, then every 60 s */
async function setPollEvery(minutes: number): Promise<void> {
  if (mem.pollEvery === minutes && (await browser.alarms.get(POLL_ALARM))) return;
  mem.pollEvery = minutes;
  await browser.alarms.create(POLL_ALARM, { periodInMinutes: minutes });
}

async function settingsNow(): Promise<PortalSettings | undefined> {
  return acceptedSettings(await local.get<PortalSettings>(PORTAL_KEY));
}

async function termsInForce(): Promise<boolean> {
  return recordInForce(await local.get(TERMS_KEY));
}

/** the site profile this build carries for a site (cached) */
async function siteProfile(site: string): Promise<SiteProfile | undefined> {
  if (mem.profile?.site === site) return mem.profile.profile;
  const profile = await bundledProfile(site, (p) => fetch(assetUrl(p)));
  mem.profile = { site, profile };
  return profile;
}

/** the words the site profile gives (D20 when there is none) */
function siteWords(profile: SiteProfile | undefined, workerName: string): SiteWords {
  return {
    ...(profile?.vpn_app ? { vpnApp: profile.vpn_app } : {}),
    ...(profile?.vpn_portal ? { vpnPortal: profile.vpn_portal } : {}),
    title: sessionTitleFor(profile?.session_title, workerName),
    hours: Number(profile?.worker_defaults?.hours) || 8,
    ...(profile?.grid_account_help_url ? { gridAccountHelpUrl: profile.grid_account_help_url } : {}),
    ...(profile?.vpn_help_url ? { vpnHelpUrl: profile.vpn_help_url } : {}),
  };
}

/** the portal client of this background: credentials "include", the shell from here (direct) */
async function directClient(): Promise<PortalClient | undefined> {
  const s = await settingsNow();
  if (!s) return undefined;
  const profile = await siteProfile(s.site);
  const key = `${s.origin}|${s.shell_host}|${profile?.vpn_app ?? ''}`;
  if (mem.client?.key === key) return mem.client.client;
  const audit = new Audit(local, { revocation: async () => local.get<{ revoked: boolean; message: string }>(REVOKED_KEY) });
  const net = { fetch: (input: string, init?: RequestInit) => fetch(input, init), WebSocket: globalThis.WebSocket as unknown as WsConstructor };
  const client = new PortalClient(s.origin, net, audit, { shellHost: s.shell_host, credentials: 'include', vpnApp: profile?.vpn_app, via: 'extension' });
  mem.client = { key, client };
  return client;
}

async function channelNow(): Promise<ChannelNote | undefined> {
  const s = await settingsNow();
  const c = await local.get<ChannelNote>(CHANNEL_KEY);
  return c && s && c.origin === s.origin ? c : undefined;
}

/**
 * The tool's full path for this account: the bundled profile's shared_install, or, for a portal this
 * build carries no profile for, the folder the account's own marker names (~/.hpcworker/shared).
 */
async function sharedDirNow(): Promise<string | undefined> {
  const s = await settingsNow();
  if (!s) return undefined;
  const key = `${s.origin}|${s.site}`;
  if (mem.sharedDir?.key === key && mem.sharedDir.dir) return mem.sharedDir.dir;
  let dir = sharedRootOf((await siteProfile(s.site))?.shared_install);
  if (!dir && (await modeNow()) === 'vpn') {
    try {
      const c = await directClient();
      const home = c ? await c.home() : undefined;
      if (c && home) dir = sharedRootOf(((await c.readFileIfExists(paths.sharedMarker(home))) ?? '').trim());
    } catch {
      dir = undefined;
    }
  }
  mem.sharedDir = { key, dir };
  return dir;
}

/** the site name connect is given: the portal's (a bundled profile's name), else the account's own profile's */
async function siteForConnect(s: PortalSettings): Promise<string> {
  if (await siteProfile(s.site)) return s.site;
  try {
    const c = await directClient();
    const ctx = c ? await clusterContext(c) : undefined;
    if (ctx?.site && /^[a-z0-9-]{1,32}$/.test(ctx.site)) return ctx.site;
  } catch {
    /* the portal's own name stands */
  }
  return s.site;
}

/**
 * Run something that needs the shell: from this background in direct mode, or through a page script
 * in a portal tab (the sign-in tab kept, or one opened inactive and closed) in tab mode.
 */
async function withShell<T>(fn: (p: PortalApi) => Promise<T>, o: { viaTabId?: number } = {}): Promise<T> {
  const s = await settingsNow();
  if (!s) throw new Error('no portal connected');
  // 12.0.0: on the direct way every line goes through the gate (a line it has no verb for is refused before it is sent)
  if ((await modeNow()) === 'direct') return fn(await sshPortal());
  const ch = await channelNow();
  if (ch?.mode === 'tab') {
    mem.workingInTab++;
    schedulePush();
    // a tab of Beethoven's already on the portal (the grid terminal of the key step) carries it, else the kept sign-in tab, else one opened for this
    const kept = o.viaTabId ?? mem.keptTabId;
    try {
      return await withPortalTab(tabHost(s.origin), { origin: s.origin, ...(mem.panelWindowId !== undefined ? { windowId: mem.panelWindowId } : {}), ...(kept !== undefined ? { keptTabId: kept } : {}) }, (_id, p) => fn(p));
    } finally {
      mem.workingInTab--;
      schedulePush();
    }
  }
  const c = await directClient();
  if (!c) throw new Error('no portal connected');
  return fn(c);
}

async function activity(text: string): Promise<void> {
  await session.set(ACTIVITY_KEY, addActivity(await session.get<ActivityEntry[]>(ACTIVITY_KEY), text, nowIso()));
}

async function once(patch: Partial<OnceNotes>): Promise<OnceNotes> {
  const cur = (await local.get<OnceNotes>(ONCE_KEY)) ?? {};
  const next = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([k]) => !(cur as Record<string, unknown>)[k])) };
  await local.set(ONCE_KEY, next);
  return next;
}

function toast(text: string): void {
  mem.toast = { text, until: Date.now() + 2_400 };
  schedulePush();
}

// ---- the facts and the views ---------------------------------------------------------------------------

async function buildFacts(): Promise<Facts> {
  const now = Date.now();
  const L = await local.many([TERMS_KEY, PORTAL_KEY, PREFS_KEY, ACCESS_KEY, SERVICES_KEY, IDENTITY_KEY, STATEMENTS_KEY, LAST_KNOWN_KEY, CHANNEL_KEY, WAIT_HISTORY_KEY, TOUR_SEEN_KEY, ONCE_KEY, KILLLIST_KEY]);
  const S = await session.many([GRID_KEY, PRESS_KEY, RUN_KEY, ANTHROPIC_TAB_KEY, WELCOME_PRESS_KEY, ...(mem.logOpen ? [ACTIVITY_KEY] : [])]);
  const settings = acceptedSettings(L[PORTAL_KEY] as PortalSettings | undefined);
  const prefs: Prefs = { ...DEFAULT_PREFS, ...((L[PREFS_KEY] as Partial<Prefs> | undefined) ?? {}) };
  const granted = settings ? await connectApi.containsOrigin(settings.origin).catch(() => false) : false;
  const profile = settings ? await siteProfile(settings.site) : await siteProfile(DEFAULT_SITE);
  const grid = (S[GRID_KEY] as GridNote | undefined) ?? { reach: 'unknown', session: 'unknown', checked_at: '' };
  const account = grid.account ?? (L[IDENTITY_KEY] as IdentityNote | undefined)?.username;
  const verdict = killListVerdict(L[KILLLIST_KEY] as StoredKillList | undefined, version());
  const access = accessFact({ record: L[ACCESS_KEY] as AccessRecord | undefined, services: L[SERVICES_KEY] as StoredServices | undefined, accessId: account, portal: settings?.hostname, now: new Date(now), versionRevoked: verdict.versionRevoked, revokedMessage: verdict.message, checking: mem.accessChecking });
  const run = S[RUN_KEY] as RunState | undefined;
  const channel = L[CHANNEL_KEY] as ChannelNote | undefined;
  const words = siteWords(profile, prefs.worker_name);
  const rf = runFacts(run, now);
  const log = mem.logOpen ? mergeLog(S[ACTIVITY_KEY] as ActivityEntry[] | undefined, run?.progress_tail, rf.title ?? words.title) : undefined;
  // a Claude sign-in this background no longer holds (the service worker was stopped mid-sitting):
  // Anthropic's tab is still on record, and nothing on the grid says the sign-in finished
  const interrupted = !!S[ANTHROPIC_TAB_KEY] && !mem.sitting && !mem.startId && !mem.connect.inFlight && mem.connect.signin !== 'signed-in' && !rf.claude?.loggedIn;
  const press = S[WELCOME_PRESS_KEY] as { at?: string } | undefined;
  const pressAt = press?.at ? Date.parse(press.at) : NaN;
  return {
    now,
    terms: recordInForce(L[TERMS_KEY]),
    ...(settings ? { portal: { origin: settings.origin, hostname: settings.hostname, site: settings.site } } : {}),
    granted,
    site: words,
    grid: { reach: grid.reach, session: grid.session, ...(account ? { account } : {}), ...(mem.lookingSince !== undefined ? { lookingSince: mem.lookingSince } : {}), ...(mem.answeredAt !== undefined ? { answeredAt: mem.answeredAt } : {}) },
    signin: mem.signin,
    ...(channel && settings && channel.origin === settings.origin ? { channel } : {}),
    access,
    setup: mem.setup,
    statement: { inForce: !!statementFor(L[STATEMENTS_KEY] as Statements | undefined, prefs.worker_name), workerName: prefs.worker_name, ...(mem.restricted ? { restricted: true } : {}) },
    ...(S[PRESS_KEY] ? { press: S[PRESS_KEY] as PendingPress } : {}),
    connect: interrupted ? { ...mem.connect, interrupted: true } : mem.connect,
    welcome: { state: mem.welcome.state, ...(Number.isFinite(pressAt) ? { pressAt } : {}) },
    ...(mem.loginSetup ? { loginSetup: { phase: mem.loginSetup.phase, line: mem.loginSetup.line } } : {}),
    run: rf,
    ...(L[LAST_KNOWN_KEY] && (L[LAST_KNOWN_KEY] as LastKnown).worker_name === prefs.worker_name ? { lastKnown: L[LAST_KNOWN_KEY] as LastKnown } : {}),
    waits: (L[WAIT_HISTORY_KEY] as WaitHistory | undefined)?.minutes ?? [],
    once: (L[ONCE_KEY] as OnceNotes | undefined) ?? {},
    ...(L[TOUR_SEEN_KEY] ? { tourSeen: L[TOUR_SEEN_KEY] as TourSeen } : {}),
    prefs,
    ...(mem.pinned !== undefined ? { pinned: mem.pinned } : {}),
    stopping: mem.stopping,
    workingInTab: mem.workingInTab > 0,
    ...(log ? { log } : {}),
    ...(mem.toast && mem.toast.until > now ? { toast: mem.toast.text } : {}),
    ...(mem.onlineAnnouncedAt !== undefined ? { onlineAnnouncedAt: mem.onlineAnnouncedAt } : {}),
    ...(mem.tourFromMenu ? { tourFromMenu: true } : {}),
    direct: await directFacts(prefs, profile, settings, now),
  };
}

async function viewFor(surface: Surface, f: Facts): Promise<SurfaceView> {
  switch (surface) {
    case 'panel':
      return { surface: 'panel', view: panelView(f) };
    case 'welcome': {
      const settings = await settingsNow();
      const def = defaultPortalFrom(await siteProfile(DEFAULT_SITE));
      const portal = settings ? { origin: settings.origin, hostname: settings.hostname } : def ? { origin: def.origin, hostname: def.hostname } : { origin: 'https://ondemand.grid.wayne.edu', hostname: 'ondemand.grid.wayne.edu' };
      const state: WelcomeView['state'] = f.terms && mem.welcome.state === 'idle' && settings ? 'handoff' : mem.welcome.state;
      return { surface: 'welcome', view: welcomeView({ portal, site: f.site, state, ...(mem.welcome.problem ? { problem: mem.welcome.problem } : {}), ...(state === 'handoff' && firstRunDone(f) ? { hero: home(f).hero } : state === 'handoff' ? { hero: (({ live: _l, ...h }) => h)(heroOf(f)) } : {}), licenseUrl: browser.runtime.getURL('/LICENSE.txt' as never), privacyUrl: browser.runtime.getURL('/PRIVACY.md' as never) }) };
    }
    case 'details': {
      const settings = await settingsNow();
      const report = await session.get<DiagReport>(CHECKS_KEY);
      const audit = (await local.get<{ records?: Array<Record<string, unknown>> }>(AUDIT_KEY))?.records ?? [];
      const direct = await directDetails();
      const dv = detailsView({
          reports: report?.reports,
          running: mem.checksRunning,
          run: await session.get<RunState>(RUN_KEY),
          ...(settings ? { settings, profile: await siteProfile(settings.site) } : {}),
          ...(f.channel ? { channel: f.channel } : {}),
          audit: audit.slice(-60).map((r) => `${String(r.ts ?? '')} ${String(r.method ?? '')} ${String(r.endpoint ?? '')} ${String(r.outcome ?? '')}${r.via ? ` (${String(r.via)})` : ''}`),
          now: f.now,
        });
      return { surface: 'details', view: { ...dv, direct } };
    }
    case 'settings': {
      const terms = await local.get<TermsRecord>(TERMS_KEY);
      const audit = (await local.get<{ records?: unknown[] }>(AUDIT_KEY))?.records ?? [];
      const drive = !!(await local.get<Checklist>(CHECKLIST_KEY))?.drive_connected_at;
      const settings = await settingsNow();
      const sv = settingsView({ prefs: f.prefs, ...(settings ? { settings } : {}), ...(recordInForce(terms) ? { terms } : {}), auditCount: audit.length, driveConnected: drive, hashes: recordInForce(terms) ? [`LICENSE.txt ${terms.license_sha256}`, `PRIVACY.md ${terms.privacy_sha256}`] : [], installId: await installId() });
      return { surface: 'settings', view: { ...sv, connection: await connectionSettings(f.prefs) } };
    }
  }
}

let pushQueued = false;
let pushChain: Promise<void> = Promise.resolve();

/** recompute the views and send each open page its own when it changed; set the toolbar; keep the last known state */
function schedulePush(): void {
  if (pushQueued) return;
  pushQueued = true;
  pushChain = pushChain
    .then(() => new Promise<void>((r) => setTimeout(r, 0)))
    .then(async () => {
      pushQueued = false;
      const f = await buildFacts();
      await reflect(f);
      for (const [port, sub] of mem.ports) {
        try {
          const view = await viewFor(sub.surface, f);
          const json = JSON.stringify(view);
          if (json === sub.last) continue;
          sub.last = json;
          port.postMessage({ type: 'view', view });
        } catch {
          /* the page went away */
        }
      }
    })
    .catch(() => {
      pushQueued = false;
    });
}

/** the toolbar (badge, title, the lit icon) and the last known state, from the facts */
async function reflect(f: Facts): Promise<void> {
  const tb = toolbarView(f);
  const key = JSON.stringify(tb);
  if (key !== mem.lastToolbar) {
    mem.lastToolbar = key;
    const act = (browser.action ?? (browser as unknown as { browserAction?: typeof browser.action }).browserAction) as typeof browser.action | undefined;
    try {
      await act?.setBadgeText({ text: tb.badge?.text ?? '' });
      if (tb.badge) await act?.setBadgeBackgroundColor({ color: BADGE_COLORS[tb.badge.color] });
      await act?.setTitle({ title: tb.title });
      await act?.setIcon({ path: tb.lit ? LIT_ICONS : PLAIN_ICONS }).catch(() => act?.setIcon({ path: PLAIN_ICONS }));
    } catch {
      /* a browser without one of these */
    }
  }
  // the last known state, kept across browser restarts so the panel shows it at once
  const lk = lastKnownOf(f);
  if (lk) {
    const json = JSON.stringify(lk);
    if (json !== mem.lastKnownJson || f.now - mem.last.lastKnownAt > 30_000) {
      mem.lastKnownJson = json;
      mem.last.lastKnownAt = f.now;
      await local.set(LAST_KNOWN_KEY, { ...lk, seen_at: new Date(f.now).toISOString() } satisfies LastKnown);
    }
  }
  // the pin tip is shown once the worker is online and the icon is not pinned
  if (f.run.phase === 'online' && f.pinned === false && !f.once.pin_tip_shown_at) await once({ pin_tip_shown_at: nowIso() });
}

function onViewPort(port: ViewPort): void {
  mem.ports.set(port, { surface: 'panel' });
  port.onMessage.addListener((m: unknown) => {
    const msg = m as ViewIn;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'subscribe') {
      const sub = mem.ports.get(port);
      if (!sub) return;
      sub.surface = msg.surface;
      sub.windowId = msg.windowId;
      sub.last = undefined;
      if (msg.surface === 'panel' && msg.windowId !== undefined) mem.panelWindowId = msg.windowId;
      // 12.0.0: while the panel is open the direct way keeps one connection for its reads
      if (msg.surface === 'panel') mem.direct.portal?.portal.hold(true);
      schedulePush();
    } else if (msg.type === 'tick') void tick();
  });
  port.onDisconnect.addListener(() => {
    mem.ports.delete(port);
    if (![...mem.ports.values()].some((s) => s.surface === 'panel')) {
      // the log is closed every time the panel opens
      mem.logOpen = false;
      mem.tourFromMenu = false;
      mem.direct.portal?.portal.hold(false);
    }
  });
}

/** a page is open: the panel's 2-second timer drives the watch, the cadence and the clocks */
async function tick(): Promise<void> {
  const now = Date.now();
  if (!(await termsInForce())) return schedulePush();
  const settings = await settingsNow();
  if (!settings) return schedulePush();
  const grid = await session.get<GridNote>(GRID_KEY);
  const mode = await modeNow();
  // 12.0.0: the bridges, looked for again while the direct way waits on one (every 3 s for ten minutes
  // after the installer was saved, else every 15 s), and once in five minutes when one was found
  if (mode !== 'vpn' && !mem.direct.probing) {
    const B = await session.get<BridgeNote>(BRIDGE_KEY);
    const since = now - mem.direct.lastProbe;
    const eager = mem.direct.downloadedAt !== undefined && now - mem.direct.downloadedAt < 10 * 60_000;
    if (!B || (B.chosen === 'none' && since >= (eager ? 3_000 : 15_000)) || (B.chosen !== 'none' && since >= 5 * 60_000)) void probeBridges();
  }
  // the grid sign-in: a dashboard GET on each tick while a sign-in tab is watched
  if (mode === 'setup') {
    /* the direct way's moments carry it; no portal check */
  } else if (mem.signin.waiting && now - mem.last.signin >= SIGNIN_WATCH_MS) {
    mem.last.signin = now;
    void checkGrid('watch');
  }
  // GlobalProtect: is the grid answering yet?
  else if (mode === 'vpn' && (grid?.reach === 'no-route' || grid?.session === 'unreachable') && now - mem.last.reach >= REACH_EVERY_MS) void recheckReach();
  // the Grid row's live check, once a minute
  else if (now - mem.last.grid >= GRID_LIVE_MS) void checkGrid('minute');
  const run = await session.get<RunState>(RUN_KEY);
  const rf = runFacts(run, now);
  const starting = mem.connect.inFlight || ['queued', 'got-computer', 'connecting', 'slow', 'reconnecting', 'needs-claude', 'needs-consent', 'renewing'].includes(rf.phase);
  if (grid?.session === 'signed-in' && now - mem.last.list >= (starting ? LIST_STARTING_MS : LIST_IDLE_MS)) void pollRun();
  const pressWaiting = !!(await session.get<PendingPress>(PRESS_KEY));
  // the scheduler's reason, once a minute while in line; never while a press of the student's waits or runs.
  // 13.0.0: while renewing too: framework 13's `worker status` asks about the successor a job that ended named,
  // and says "stopped" when it is gone (before, such a run read as "Reconnecting…" for good)
  if (grid?.session === 'signed-in' && (rf.phase === 'queued' || rf.phase === 'renewing') && now - mem.last.statusJson >= STATUS_JSON_MS && !pressWaiting && !mem.stopping && !mem.startId && mem.pressDepth === 0) void refreshStatusJson();
  // a press kept for later goes ahead by itself once what it waits on is there (never beside a press being handled now)
  if (grid?.session === 'signed-in' && !mem.sitting && !mem.startId && mem.pressDepth === 0 && now - mem.last.carry >= PRESS_RETRY_MS && pressWaiting) {
    mem.last.carry = now;
    void carryPress();
  }
  schedulePush();
}

/** the alarm, with or without a page open: the run's files only (no shell, no scheduler) */
async function backgroundPoll(): Promise<void> {
  if (!(await termsInForce()) || !(await settingsNow())) return;
  const grid = await session.get<GridNote>(GRID_KEY);
  if (grid?.session === 'signed-in' || mem.ports.size === 0) await pollRun();
  schedulePush();
}

async function signinAlarm(): Promise<void> {
  if (!mem.signin.waiting && !(await session.get<OpenedTab>(SIGNIN_TAB_KEY))) {
    await browser.alarms.clear(SIGNIN_ALARM);
    return;
  }
  await checkGrid('alarm');
}

// ---- messages ---------------------------------------------------------------------------------------

async function handle(msg: Request, sender: { tab?: { id?: number }; url?: string }): Promise<Answer> {
  switch (msg.type) {
    case 'action':
      return succeed(await act(msg.action));
    case 'view.get':
      return succeed(await viewFor(msg.surface, await buildFacts()));
    case 'panel.opened':
      if (msg.windowId !== undefined) mem.panelWindowId = msg.windowId;
      mem.logOpen = false;
      void panelOpened();
      return succeed(true);
    case 'terminal.shell-up': {
      const rec = await session.get<OpenedTab>(TERMINAL_TAB_KEY);
      if (rec && sender.tab?.id === rec.tabId) void mem.loginSetup?.shellUp();
      return succeed(true);
    }
    case 'portal.hello':
      // 11.0.0 loads the page script into its own tabs only; a hello says nothing it does not know
      return succeed({ registered: false });
    case 'portal.ping':
      return succeed(!!(await directClient()));
    case 'portal.tab':
      return succeed(undefined);
    case 'portal.call': {
      if (!PORTAL_OPS.includes(msg.op)) return fail(new Error(`unknown portal operation ${String(msg.op)}`));
      const c = await directClient();
      if (!c) return fail(new Error('no portal connected'));
      const fn = c[msg.op] as (...a: unknown[]) => Promise<unknown>;
      return succeed(await fn.apply(c, msg.args ?? []));
    }
    case 'run.get':
      return succeed(await session.get<RunState>(RUN_KEY));
    case 'run.refresh':
      await pollRun(true);
      return succeed(await session.get<RunState>(RUN_KEY));
    case 'run.open':
      return succeed(await openSession());
    case 'run.clear':
      await mutateRun(() => null);
      return succeed(undefined);
    case 'run.set':
    case 'run.stopped':
    case 'worker.start':
      return fail(new Error('11.0.0 starts and stops the worker through the panel actions'));
    case 'killlist.refresh':
      return succeed(await refreshKillListNow());
    case 'access.check':
      return succeed(await checkAccessNow(msg.force ? 'retry' : 'open'));
    default:
      return fail(new Error(`unhandled message ${(msg as { type: string }).type}`));
  }
}

/** the panel on load: the access re-check LICENSE 3(a) ties to opening it (after a day or after a no), and the live grid check */
async function panelOpened(): Promise<void> {
  if (!(await termsInForce())) return;
  await checkGrid('open');
  void checkAccessNow('open');
  void pollRun(true);
}

async function onPinChanged(pinned: boolean): Promise<void> {
  const was = mem.pinned;
  mem.pinned = pinned;
  if (pinned && was === false) {
    const o = (await local.get<OnceNotes>(ONCE_KEY)) ?? {};
    if (o.pin_tip_shown_at) await once({ pin_tip_done_at: nowIso() });
  }
  schedulePush();
}

// ---- actions ----------------------------------------------------------------------------------------

/** what a page may ask before the agreement is accepted: nothing that reaches the network or opens a tab of Beethoven's own doing */
const BEFORE_TERMS: ReadonlySet<Action['kind']> = new Set(['agree', 'use-portal', 'open-settings', 'open-help', 'open-details', 'set-pref', 'tour', 'dismiss', 'log', 'audit', 'copy-details', 'drive-connected']);

async function act(a: Action): Promise<unknown> {
  // PRIVACY.md: nothing is sent anywhere before the agreement; the pages offer nothing else then, and
  // the background holds to it whatever a page asks
  if (!BEFORE_TERMS.has(a.kind) && !(await termsInForce())) throw new Error(TERMS_REFUSAL);
  const press = PRESS_KINDS.has(a.kind);
  if (press) mem.pressDepth++;
  try {
    return await actInner(a);
  } finally {
    if (press) mem.pressDepth = Math.max(0, mem.pressDepth - 1);
    schedulePush();
  }
}

async function actInner(a: Action): Promise<unknown> {
  switch (a.kind) {
    case 'agree':
      return onAgree(a);
    case 'use-portal':
    case 'change-portal':
      return onUsePortal(a.origin, a.granted, a.kind === 'change-portal');
    case 'sign-in-grid':
      if (a.windowId !== undefined) mem.panelWindowId = a.windowId;
      // 12.0.0: on the direct way the grid's sign-in is Beethoven's own sheet, never the portal's box
      if ((await modeNow()) !== 'vpn') {
        mem.direct.sheetWanted = true;
        if (!(await session.get<BridgeNote>(BRIDGE_KEY))) void probeBridges();
        return { opened: true } satisfies ActionResults['sign-in-grid'];
      }
      return { opened: await openSigninTab('press') } satisfies ActionResults['sign-in-grid'];
    case 'retry-grid': {
      const r = await recheckReach();
      const s = r === 'answers' ? await checkGrid('retry') : 'unreachable';
      return { reach: r, session: s === 'signed-in' ? 'signed-in' : s === 'unreachable' ? 'unreachable' : 'signed-out' } satisfies ActionResults['retry-grid'];
    }
    case 'ask-access': {
      const f = await buildFacts();
      const url = f.access.requestUrl || requestUrl(undefined, f.grid.account);
      return { opened: !!(await openTab(url, { active: true, ...(mem.panelWindowId !== undefined ? { windowId: mem.panelWindowId } : {}) })) } satisfies ActionResults['ask-access'];
    }
    case 'retry-access': {
      await checkAccessNow('retry');
      const f = await buildFacts();
      void carryPress();
      return { approved: f.access.ok } satisfies ActionResults['retry-access'];
    }
    case 'update':
      return { opened: !!(await openTab(`https://chromewebstore.google.com/detail/${browser.runtime.id}`, { active: true })) } satisfies ActionResults['update'];
    case 'copy-details':
      return { text: await detailsText() } satisfies ActionResults['copy-details'];
    case 'restrict':
      return pressRestrict(a.workerName);
    case 'connect':
      return pressConnect(a.statement);
    case 'cancel':
      return cancelPress();
    case 'stop':
      return pressStop();
    case 'sign-in-claude':
      return pressSignInClaude(!!a.fresh);
    case 'paste-code':
      return pasteCode(a.code);
    case 'reopen-claude-tab': {
      const url = mem.sitting?.authUrl;
      if (!url) return { opened: false } satisfies ActionResults['reopen-claude-tab'];
      mem.connect = { ...mem.connect, claudeTabClosed: false };
      return { opened: await openAnthropicTab(url) } satisfies ActionResults['reopen-claude-tab'];
    }
    case 'retry':
      return retry();
    case 'open-session':
      return openSession();
    case 'new-session': {
      const f = await buildFacts();
      const link = f.run.link ?? f.lastKnown?.environment_url;
      if (!isEnvironmentUrl(link)) return { opened: false, firstTime: false } satisfies ActionResults['new-session'];
      const o = (await local.get<OnceNotes>(ONCE_KEY)) ?? {};
      const firstTime = !o.new_session_tip_at;
      if (firstTime) {
        await once({ new_session_tip_at: nowIso() });
        toast(WORDS.home.newSessionTip);
      }
      return { opened: !!(await openTab(link, { active: true, anthropicOk: true, ...(mem.panelWindowId !== undefined ? { windowId: mem.panelWindowId } : {}) })), firstTime } satisfies ActionResults['new-session'];
    }
    case 'open-files':
      return { opened: await openFiles() } satisfies ActionResults['open-files'];
    case 'open-settings':
      await browser.runtime.openOptionsPage().catch(() => undefined);
      // an options tab still drawing the welcome page (the direct way never navigated it away) turns into Settings
      void browser.runtime.sendMessage({ type: 'show-settings' }).catch(() => undefined);
      return { opened: true } satisfies ActionResults['open-settings'];
    case 'open-details':
      return { opened: true } satisfies ActionResults['open-details'];
    case 'open-help':
      return { opened: !!(await openTab(HELP_URL, { active: true })) } satisfies ActionResults['open-help'];
    case 'tour':
      if (a.event === 'start') mem.tourFromMenu = true;
      // the once-only tour below the queue began: noted as shown (no card for it later), not as the menu's
      else if (a.event === 'auto') await once({ tour_auto_played_at: nowIso() });
      else {
        mem.tourFromMenu = false;
        await local.set(TOUR_SEEN_KEY, { seen_at: nowIso(), completed: a.event === 'done' } satisfies TourSeen);
      }
      return { recorded: true } satisfies ActionResults['tour'];
    case 'dismiss':
      await once(a.card === 'try-asking' ? { try_asking_dismissed_at: nowIso() } : a.card === 'pin-tip' ? { pin_tip_done_at: nowIso() } : { tour_card_dismissed_at: nowIso() });
      return { recorded: true } satisfies ActionResults['dismiss'];
    case 'log': {
      mem.logOpen = a.open;
      if (!a.open) return { lines: [] } satisfies ActionResults['log'];
      await pollRun(true, { progress: true });
      const f = await buildFacts();
      return { lines: f.log ?? [] } satisfies ActionResults['log'];
    }
    case 'open-terminal-for-login-setup':
      if (a.windowId !== undefined) mem.panelWindowId = a.windowId;
      return { opened: (await mem.loginSetup?.open()) ?? false } satisfies ActionResults['open-terminal-for-login-setup'];
    case 'login-setup-in': {
      const r = await mem.loginSetup?.imIn();
      return { typed: !!r?.typed, ...(r ? { how: r.how } : {}) } satisfies ActionResults['login-setup-in'];
    }
    case 'run-checks':
      return { done: await runChecks() } satisfies ActionResults['run-checks'];
    case 'copy-report': {
      const rep = await session.get<DiagReport>(CHECKS_KEY);
      return { text: rep ? formatReport(rep) : '' } satisfies ActionResults['copy-report'];
    }
    case 'check-compute-node':
      return { submitted: await checkComputeNode() } satisfies ActionResults['check-compute-node'];
    case 'set-pref': {
      const cur = await loadPrefs();
      const next = { ...cur, ...a.prefs };
      if (next.worker_name !== cur.worker_name) {
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(next.worker_name)) return { saved: false } satisfies ActionResults['set-pref'];
        // another worker: its own run, its own statement
        await mutateRun(() => null);
        mem.restricted = false;
      }
      await local.set(PREFS_KEY, next);
      if (next.connection !== cur.connection) {
        if (next.connection !== 'vpn') await directAgain();
        await writeGrid({ session: 'unknown' });
        void checkGrid('set-pref');
      }
      return { saved: true } satisfies ActionResults['set-pref'];
    }
    case 'disconnect':
      await cancelPress();
      await disconnectPortal();
      mem.client = undefined;
      mem.sharedDir = undefined;
      mem.setup = { state: 'unknown' };
      return { disconnected: true } satisfies ActionResults['disconnect'];
    case 'audit': {
      if (a.op === 'clear') {
        await clearRecordsKeepingClocks(local);
        return { cleared: true } satisfies ActionResults['audit'];
      }
      const audit = new Audit(local);
      return { text: await audit.exportText() } satisfies ActionResults['audit'];
    }
    case 'drive-connected':
      await local.set(CHECKLIST_KEY, a.done ? ({ drive_connected_at: nowIso() } satisfies Checklist) : ({} satisfies Checklist));
      return { recorded: true } satisfies ActionResults['drive-connected'];
    // ---- 12.0.0: the direct way ----
    case 'grid-signin-account':
      return signinAccount(a.account);
    case 'grid-signin-answer': {
      const r = mem.direct.sheet?.answer(a.text);
      return { sent: !!r?.sent, ...(r && r.waiting ? { waiting: r.waiting } : {}) } satisfies ActionResults['grid-signin-answer'];
    }
    case 'grid-signin-retry': {
      await session.remove(ROUTE_KEY);
      mem.direct.sheetWanted = true;
      const flow = mem.direct.sheet;
      if (flow?.state.account) {
        const started = flow.retry();
        if (started) void flow.done().then((out) => (out ? onSheetDone(flow, out) : onSheetEnded(flow)));
        return { started } satisfies ActionResults['grid-signin-retry'];
      }
      flow?.cancel();
      return { started: false } satisfies ActionResults['grid-signin-retry'];
    }
    case 'grid-signin-change':
      mem.direct.sheet?.cancel();
      return { closed: true } satisfies ActionResults['grid-signin-change'];
    case 'grid-signin-continue':
      await writeDirect({ enrolled_seen_at: nowIso() });
      mem.direct.enrolledAt = undefined;
      void carryPress();
      return { recorded: true } satisfies ActionResults['grid-signin-continue'];
    case 'use-vpn': {
      // the GlobalProtect way for this computer until "Try the direct way again" or Settings' "Direct when
      // possible"; the fallback moment comes first (its Continue opens the grid's own sign-in box)
      await writeDirect({ vpn_chosen_at: nowIso() }, ['fallback_seen_at']);
      await session.remove(ROUTE_KEY);
      mem.direct.sheet?.dispose();
      mem.direct.sheet = undefined;
      mem.direct.sheetWanted = false;
      mem.direct.claudeWanted = false;
      mem.direct.fallbackWanted = true;
      mem.connect = { ...mem.connect, failure: undefined };
      await writeGrid({ session: 'unknown' });
      await activity(LOG_WORDS.usingVpn(siteWords(await profileNow(), (await loadPrefs()).worker_name).vpnApp ?? 'GlobalProtect'));
      schedulePush();
      return { recorded: true } satisfies ActionResults['use-vpn'];
    }
    case 'try-direct': {
      const n = await (await directAgain()).probe;
      mem.direct.sheetWanted = true;
      void checkGrid('try-direct');
      return { bridge: n.chosen } satisfies ActionResults['try-direct'];
    }
    case 'fallback-continue': {
      await writeDirect({ fallback_seen_at: nowIso() });
      mem.direct.fallbackWanted = false;
      await writeGrid({ session: 'unknown' });
      // the 11.0.0 way from here: GlobalProtect's reach, the portal's sign-in (its own box in a tab when the
      // browser holds none), then the press that was waiting
      void (async () => {
        const r = await recheckReach();
        const word = r === 'answers' ? await checkGrid('fallback') : 'unreachable';
        if (word === 'signed-out' || word === 'not-ood') await openSigninTab('press', undefined, mem.panelWindowId).catch(() => false);
        await carryPress();
      })();
      return { recorded: true } satisfies ActionResults['fallback-continue'];
    }
    case 'no-grid-code':
      // the student says the account has no grid code yet: the route choice (its 2FA Setup notice above it).
      // The run of code refusals is dropped: once a code is set up, a later refusal is first taken for a typo
      // again, never pushed toward a second 2FA Setup (which would replace the code just made)
      mem.direct.sheet?.cancel();
      await session.set(ROUTE_KEY, { route: 'choose', at: nowIso() } satisfies RouteNote);
      return { recorded: true } satisfies ActionResults['no-grid-code'];
    case 'choose-route':
      await session.set(ROUTE_KEY, { route: a.route, at: nowIso() } satisfies RouteNote);
      return { recorded: true } satisfies ActionResults['choose-route'];
    case 'route-back':
      await session.set(ROUTE_KEY, { route: 'choose', at: nowIso() } satisfies RouteNote);
      return { recorded: true } satisfies ActionResults['route-back'];
    case 'bridge-downloaded':
      mem.direct.downloadedAt = Date.now();
      mem.direct.checkedByHand = false;
      void probeBridges();
      return { looking: true } satisfies ActionResults['bridge-downloaded'];
    case 'check-bridge': {
      // the student's own Check again: only this turns the button, and only after it may "Not found yet" show
      mem.direct.probingByHand = true;
      schedulePush();
      let n: BridgeNote;
      try {
        n = await probeBridges();
      } finally {
        mem.direct.probingByHand = false;
        mem.direct.checkedByHand = true;
      }
      if (n.chosen !== 'none') void carryPress();
      return { bridge: n.chosen, ...(n.helper_version ? { helperVersion: n.helper_version } : {}) } satisfies ActionResults['check-bridge'];
    }
    case 'set-connection': {
      const cur = await loadPrefs();
      await local.set(PREFS_KEY, { ...cur, connection: a.connection } satisfies Prefs);
      // "Direct when possible": an earlier "Use GlobalProtect instead" no longer holds; the bridges are looked for again
      if (a.connection === 'direct') await directAgain();
      await writeGrid({ session: 'unknown' });
      void checkGrid('set-connection');
      return { saved: true } satisfies ActionResults['set-connection'];
    }
    case 'protect-key': {
      mem.direct.protectOutcome = a.outcome === 'off' ? undefined : a.outcome;
      const k = await keyStateNow(true);
      mem.direct.portal = undefined;
      if (a.on && a.outcome === 'on') {
        // the card says "Protected." a moment (PROTECTED_HOLD_MS), then the waiting press carries on
        const offered = !(await local.get<DirectNote>(DIRECT_KEY))?.protect_offer_done_at;
        await writeDirect({ protect_offer_done_at: nowIso() });
        if (offered) {
          mem.direct.protectedAt = Date.now();
          setTimeout(() => {
            mem.direct.protectedAt = undefined;
            schedulePush();
            void carryPress();
          }, PROTECTED_HOLD_MS + 50);
        }
        await activity(LOG_WORDS.keyProtected);
      } else if (!a.on && a.outcome === 'off') await activity(LOG_WORDS.keyUnprotected);
      return { protected: k.wrapped } satisfies ActionResults['protect-key'];
    }
    case 'protect-key-later':
      await writeDirect({ protect_offer_done_at: nowIso() });
      mem.direct.protectOutcome = undefined;
      mem.direct.protectedAt = undefined;
      void carryPress();
      return { recorded: true } satisfies ActionResults['protect-key-later'];
    case 'unlock-key': {
      const k = await keyStateNow(true);
      mem.direct.portal = undefined;
      if (a.outcome === 'unlocked' && !k.locked) {
        mem.direct.unlockFailed = false;
        void checkGrid('unlock').then(() => carryPress());
        return { unlocked: true } satisfies ActionResults['unlock-key'];
      }
      // an Unlock that did not unlock (from the home's Grid row too): the unlock sheet says so, with its ways out
      if (a.outcome === 'failed' || a.outcome === 'cancelled') {
        mem.direct.unlockFailed = a.outcome === 'failed';
        if (k.locked) mem.direct.sheetWanted = true;
        schedulePush();
      }
      return { unlocked: false } satisfies ActionResults['unlock-key'];
    }
    case 'forget-computer':
      return forgetComputer();
  }
}

// ---- the welcome page -------------------------------------------------------------------------------

/**
 * After the welcome page's one press: the page already opened the panel, asked Chrome for the site
 * and wrote the acceptance record, all inside the click. Then: the portal is remembered, the lab's two
 * daily files are fetched (storage.onChanged on the record), the grid's reachability is checked, and
 * either the browser already holds a grid sign-in (moment 5 is skipped) or this same tab becomes the
 * grid's own sign-in box.
 */
async function onAgree(a: Extract<Action, { kind: 'agree' }>): Promise<ActionResults['agree']> {
  const no = { navigated: false, signedInAlready: false };
  if (a.windowId !== undefined) mem.panelWindowId = a.windowId;
  mem.welcomeTab = { ...(a.tabId !== undefined ? { tabId: a.tabId } : {}), ...(a.windowId !== undefined ? { windowId: a.windowId } : {}) };
  // Chrome's box has been answered: the panel no longer says "Waiting for Chrome…"
  await session.remove(WELCOME_PRESS_KEY).catch(() => undefined);
  if (!(await termsInForce())) {
    mem.welcome = { state: 'save-failed', problem: undefined };
    return no;
  }
  if (!a.granted) {
    mem.welcome = { state: 'denied', problem: undefined };
    return no;
  }
  let origin: string;
  try {
    origin = normaliseOrigin(a.origin);
  } catch (e) {
    mem.welcome = { state: 'denied', problem: isAnthropicAddress(a.origin) ? WORDS.welcome.anthropicRefused : (e as Error).message };
    return no;
  }
  await rememberPortal(origin);
  const noPanel = !a.panelOpened && hasPanel();
  mem.welcome = { state: noPanel ? 'no-panel' : 'opening', problem: undefined };
  schedulePush();
  // 12.0.0 (D3): the direct way first. The panel carries its moments (the helper, the sign-in sheet);
  // the welcome tab is not navigated to the portal's sign-in
  if ((await loadPrefs()).connection !== 'vpn') {
    await probeBridges();
    if ((await modeNow()) !== 'vpn') {
      if (!noPanel) mem.welcome = { state: 'handoff', problem: undefined };
      return no;
    }
  }
  // the panel carries GlobalProtect's moment; the welcome page hands over to it, and this same tab
  // becomes the sign-in once the grid answers (afterReach)
  const handoff = () => {
    if (!noPanel) mem.welcome = { state: 'handoff', problem: undefined };
  };
  const r = await recheckReach();
  if (r === 'no-route') {
    handoff();
    return no;
  }
  const s = await checkGrid('agree');
  if (s === 'signed-in') {
    mem.welcome = { state: 'handoff', problem: undefined };
    return { navigated: false, signedInAlready: true };
  }
  if (s === 'unreachable') {
    handoff();
    return no;
  }
  const opened = await openSigninTab('welcome', a.tabId, a.windowId);
  if (!opened) mem.welcome = { state: 'handoff', problem: undefined };
  return { navigated: opened && a.tabId !== undefined, signedInAlready: false };
}

/** store the portal the student granted (its site from the bundled profile that names it, else from its hostname) */
async function rememberPortal(origin: string): Promise<PortalSettings> {
  const hostname = new URL(origin).hostname;
  const def = defaultPortalFrom(await siteProfile(DEFAULT_SITE));
  const site = def && def.origin === origin ? def.site : siteFromHostname(hostname);
  const profile = await siteProfile(site);
  const prev = await settingsNow();
  const s: PortalSettings = prev && prev.origin === origin ? prev : { origin, hostname, connected_at: nowIso(), shell_host: profile?.ood_shell_host || 'default', site };
  const out = await savePortal(s);
  if (out.changed) {
    mem.client = undefined;
    mem.sharedDir = undefined;
    mem.setup = { state: 'unknown' };
    mem.signin = { waiting: false };
  }
  return s;
}

async function onUsePortal(raw: string, granted: boolean, settingsPage: boolean): Promise<{ origin: string }> {
  let origin = '';
  try {
    origin = normaliseOrigin(raw);
  } catch (e) {
    mem.welcome = { state: 'denied', problem: isAnthropicAddress(raw) ? WORDS.welcome.anthropicRefused : (e as Error).message };
    return { origin: '' };
  }
  if (!granted) {
    mem.welcome = { state: 'denied', problem: WORDS.welcome.denied(new URL(origin).hostname) };
    return { origin };
  }
  await rememberPortal(origin);
  mem.welcome = { state: 'idle', problem: undefined };
  // after acceptance (Settings' "Change", or the panel's "Allow again" when the grant had been taken
  // away), the portal is checked at once; before it, nothing is sent
  if (await termsInForce()) {
    if (settingsPage) await local.remove(CHANNEL_KEY);
    void recheckReach().then((r) => (r === 'answers' ? checkGrid('change') : undefined));
  }
  return { origin };
}

// ---- the grid: reachability, sign-in, the channel ----------------------------------------------------

async function writeGrid(patch: Partial<GridNote>): Promise<GridNote> {
  const cur = (await session.get<GridNote>(GRID_KEY)) ?? { reach: 'unknown', session: 'unknown', checked_at: '' };
  const next: GridNote = { ...cur, ...patch, checked_at: nowIso() };
  await session.set(GRID_KEY, next);
  return next;
}

/** the credential-free check (net.ts reach), only after acceptance; "Connected." when it starts answering */
async function recheckReach(): Promise<'answers' | 'no-route'> {
  const s = await settingsNow();
  if (!s || !(await termsInForce())) return 'no-route';
  // the direct way checks its own door (checkGridDirect); the portal's reach is the 11.0.0 way's
  if ((await modeNow()) !== 'vpn') return 'answers';
  if (mem.busy.reach) return ((await session.get<GridNote>(GRID_KEY))?.reach as 'answers' | 'no-route' | undefined) ?? 'no-route';
  mem.busy.reach = true;
  mem.last.reach = Date.now();
  try {
    const r = await reach(s.origin, (i, init) => fetch(i, init));
    const grid = await session.get<GridNote>(GRID_KEY);
    const before = grid?.reach;
    if (r === 'no-route') {
      mem.lookingSince ??= Date.now();
      mem.answeredAt = undefined;
      await writeGrid({ reach: 'no-route' });
    } else {
      const wasLooking = before === 'no-route' || mem.lookingSince !== undefined;
      if (wasLooking) mem.answeredAt = Date.now();
      mem.lookingSince = undefined;
      await writeGrid({ reach: 'answers' });
      // the grid answers again: its sign-in is checked (after "Connected." has been held a moment)
      if (wasLooking || grid?.session === 'unreachable') setTimeout(() => void afterReach(), wasLooking ? 750 : 0);
    }
    schedulePush();
    return r;
  } finally {
    mem.busy.reach = false;
  }
}

/** the grid answers after GlobalProtect: check the sign-in, and open the sign-in box if it is needed for the first run or a waiting press */
async function afterReach(): Promise<void> {
  const s = await checkGrid('reach');
  if (s !== 'signed-out') return;
  const press = await session.get<PendingPress>(PRESS_KEY);
  const f = await buildFacts();
  if (!press && firstRunDone(f)) return;
  // the welcome tab becomes the sign-in only while the welcome page is still what it shows; a tab the
  // student has since used for something else is theirs, and a new tab opens instead (AM7)
  const wt = mem.welcomeTab;
  const still = welcomeStillIn(wt?.tabId);
  await openSigninTab(still ? 'welcome' : 'press', still ? wt?.tabId : undefined, wt?.windowId);
}

/** remember the account the dashboard showed, and bind it once to the acceptance record */
async function rememberIdentity(s: SessionInfo): Promise<void> {
  if (!s.signedIn || !s.username) return;
  await local.set(IDENTITY_KEY, { username: s.username, seen_at: s.checkedAt } satisfies IdentityNote);
  const t = await local.get<TermsRecord>(TERMS_KEY);
  if (recordInForce(t) && !t.bound_account) await local.set(TERMS_KEY, bindAccount(t, s.username));
}

/** one dashboard GET from this background: signed in, signed out, unreachable (never "Failed to fetch") */
async function checkGrid(reason: string): Promise<'signed-in' | 'signed-out' | 'unreachable' | 'not-ood' | 'unknown'> {
  if (!(await termsInForce())) return 'unknown';
  // 12.0.0: the direct way asks the gate with the key; while it is being set up there is nothing to ask
  const mode = await modeNow();
  if (mode === 'direct') return checkGridDirect(reason);
  if (mode === 'setup') return 'unknown';
  const c = await directClient();
  if (!c) return 'unknown';
  if (mem.busy.grid) return ((await session.get<GridNote>(GRID_KEY))?.session as 'signed-in' | 'signed-out' | 'unreachable' | 'not-ood' | undefined) ?? 'unknown';
  mem.busy.grid = true;
  mem.last.grid = Date.now();
  try {
    const before = (await session.get<GridNote>(GRID_KEY))?.session;
    const s = await c.session();
    // a cold per-user server is signed in; the next check reads it
    const word = s.state === 'cold' ? before ?? 'unknown' : s.state;
    await writeGrid({ session: word as GridNote['session'], ...(s.state === 'unreachable' ? {} : { reach: 'answers' }), ...(s.username ? { account: s.username } : {}) });
    if (s.signedIn) await rememberIdentity(s);
    if (s.state === 'signed-in' && before !== 'signed-in') void onSignedIn(reason);
    else if (s.state === 'signed-in' && mem.signin.waiting) void onSignedIn(reason);
    if (s.state === 'unreachable') mem.lookingSince ??= Date.now();
    schedulePush();
    return word as 'signed-in' | 'signed-out' | 'unreachable' | 'not-ood' | 'unknown';
  } catch {
    return 'unknown';
  } finally {
    mem.busy.grid = false;
  }
}

/**
 * Open the grid's sign-in: the welcome tab itself (first run), or one tab in front in the panel's
 * window for a press. Watched by tabs.onUpdated, the panel's tick and a 30-second alarm.
 */
async function openSigninTab(purpose: 'welcome' | 'press', tabId?: number, windowId?: number): Promise<boolean> {
  const s = await settingsNow();
  if (!s) return false;
  const url = `${s.origin}${DASHBOARD}`;
  const existing = await session.get<OpenedTab>(SIGNIN_TAB_KEY);
  // one sign-in tab at a time: reload the one Beethoven already opened (its loads are counted afresh),
  // only while it is still where Beethoven left it (on the portal); one that has moved on is the student's
  if (existing) {
    const now = await tabNow(existing.tabId);
    if (now && stillWhereLeft(existing, now)) {
      await session.set(SIGNIN_TAB_KEY, { ...existing, loaded: false, loads_after: 0 } satisfies OpenedTab);
      await browser.tabs.update(existing.tabId, { url, active: true }).catch(() => undefined);
      mem.signin = { waiting: true };
      await browser.alarms.create(SIGNIN_ALARM, { periodInMinutes: 0.5 });
      return true;
    }
    await session.remove(SIGNIN_TAB_KEY);
  }
  let rec: OpenedTab | undefined;
  if (purpose === 'welcome' && tabId !== undefined) {
    try {
      await browser.tabs.update(tabId, { url });
      rec = { tabId, windowId: windowId ?? mem.panelWindowId ?? -1, url, opened_at: nowIso(), purpose: 'welcome' };
    } catch {
      rec = undefined;
    }
    // the welcome tab is used once
    mem.welcomeTab = undefined;
  }
  if (!rec) {
    const win = windowId ?? mem.panelWindowId;
    const ret = await activeTabIn(win);
    const t = await openTab(url, { active: true, ...(win !== undefined ? { windowId: win } : {}) });
    if (!t) return false;
    rec = { tabId: t.tabId, windowId: t.windowId, url, opened_at: nowIso(), purpose: 'press', ...(ret !== undefined ? { return_tab_id: ret } : {}) };
  }
  await session.set(SIGNIN_TAB_KEY, rec);
  mem.signin = { waiting: true };
  await browser.alarms.create(SIGNIN_ALARM, { periodInMinutes: 0.5 });
  schedulePush();
  return true;
}

/**
 * Signed in to the grid: the drawn check, the channel test (once per origin), the sign-in tab closed
 * under the guards (kept, out of the way, in tab mode), then approval, setup and any waiting press.
 */
async function onSignedIn(reason: string): Promise<void> {
  if (mem.busy.signedIn) return;
  mem.busy.signedIn = true;
  try {
    const grid = await session.get<GridNote>(GRID_KEY);
    const wasWaiting = mem.signin.waiting;
    mem.signin = { waiting: false, signedInAt: Date.now() };
    const direct = (await modeNow()) === 'direct';
    if (grid?.account && !direct) await activity(LOG_WORDS.gridSignedIn(grid.account));
    let ch = await channelNow();
    if (!ch && !direct) ch = await runChannelTest();
    const rec = await session.get<OpenedTab>(SIGNIN_TAB_KEY);
    if (rec) {
      if (ch?.mode === 'tab') {
        // tab mode: the sign-in tab carries the shell's lines; it is kept out of the way and closed when the work ends
        mem.keptTabId = rec.tabId;
        await browser.tabs.update(rec.tabId, { autoDiscardable: false } as never).catch(() => undefined);
        if (rec.return_tab_id !== undefined) await focusTab(rec.return_tab_id).catch(() => false);
      } else {
        await closeUnderGuards(rec);
      }
      await session.remove(SIGNIN_TAB_KEY);
    }
    await browser.alarms.clear(SIGNIN_ALARM);
    schedulePush();
    void reason;
    void wasWaiting;
    await checkAccessNow('signin');
    await ensureSetup();
    await carryPress();
    void pollRun(true).then(() => maybeKeepRunning());
  } finally {
    mem.busy.signedIn = false;
  }
}

/** the channel test after the first sign-in (core/channel.ts), stored per origin */
async function runChannelTest(): Promise<ChannelNote | undefined> {
  const s = await settingsNow();
  const c = await directClient();
  if (!s || !c) return undefined;
  try {
    const keep = mem.keptTabId ?? (await session.get<OpenedTab>(SIGNIN_TAB_KEY))?.tabId;
    const v = await testChannel(c, async () => {
      const host = tabHost(s.origin);
      if (keep !== undefined && (await host.onPortal(keep)) && (await readyScript(host, keep))) return (await tabPortal(host, keep).shellTest()) as Awaited<ReturnType<PortalApi['shellTest']>>;
      return withPortalTab(host, { origin: s.origin, ...(mem.panelWindowId !== undefined ? { windowId: mem.panelWindowId } : {}) }, (_id, p) => p.shellTest());
    });
    const note: ChannelNote = { origin: s.origin, mode: v.mode, shell: v.shell, tested_at: nowIso() };
    await local.set(CHANNEL_KEY, note);
    return note;
  } catch {
    return undefined;
  }
}

async function setShellWord(shell: ChannelNote['shell']): Promise<void> {
  const ch = await channelNow();
  const s = await settingsNow();
  if (!s) return;
  await local.set(CHANNEL_KEY, { origin: s.origin, mode: ch?.mode ?? 'direct', shell, tested_at: nowIso() } satisfies ChannelNote);
}

// ---- tabs Beethoven opened ---------------------------------------------------------------------------

async function onTabUpdated(tabId: number, info: { status?: string; url?: string }, tab: { url?: string; windowId?: number }): Promise<void> {
  // every tab load in the browser wakes this: one read of the four records, and nothing more for a tab not Beethoven's
  if (!info.status) return;
  const T = await session.many([SIGNIN_TAB_KEY, ANTHROPIC_TAB_KEY, CLAUDE_TAB_KEY, TERMINAL_TAB_KEY]);
  if (![SIGNIN_TAB_KEY, ANTHROPIC_TAB_KEY, CLAUDE_TAB_KEY, TERMINAL_TAB_KEY].some((k) => (T[k] as OpenedTab | undefined)?.tabId === tabId)) return;
  const signin = T[SIGNIN_TAB_KEY] as OpenedTab | undefined;
  if (signin && signin.tabId === tabId && info.status) {
    const rec = noteLoad(signin, info.status);
    if (rec !== signin) await session.set(SIGNIN_TAB_KEY, rec);
    if (info.status !== 'complete') return;
    const s = await settingsNow();
    let path = '';
    let onPortal = false;
    try {
      const u = new URL(tab.url ?? '');
      path = u.pathname;
      onPortal = !!s && u.origin === s.origin;
    } catch {
      /* not visible: another site (a sign-in page elsewhere) */
    }
    if (onPortal && path === '/public/start.html') {
      mem.signin = { ...mem.signin, problem: 'start-page' };
      schedulePush();
      return;
    }
    const word = await checkGrid('tab-complete');
    // Measured in Chromium 153 (scratchpad/v11/core/authexp): the first load completes with Chrome's
    // box still up over the portal's 401; a Cancel and a wrong password each load the tab once more,
    // still 401. So only a later load with no sign-in says "not yet", and neither cause is claimed.
    if (word === 'signed-out' && onPortal && (rec.loads_after ?? 0) >= 1) mem.signin = { waiting: true, problem: 'cancelled' };
    schedulePush();
    return;
  }
  const anth = await session.get<AnthropicTab>(ANTHROPIC_TAB_KEY);
  if (anth && anth.tabId === tabId && info.status) {
    await session.set(ANTHROPIC_TAB_KEY, noteLoad(anth, info.status));
    return;
  }
  const claude = await session.get<OpenedTab>(CLAUDE_TAB_KEY);
  if (claude && claude.tabId === tabId && info.status) {
    await session.set(CLAUDE_TAB_KEY, noteLoad(claude, info.status));
    return;
  }
  const term = await session.get<OpenedTab>(TERMINAL_TAB_KEY);
  if (term && term.tabId === tabId && info.status === 'complete') await watchTerminal(term);
}

async function onTabRemoved(tabId: number): Promise<void> {
  const signin = await session.get<OpenedTab>(SIGNIN_TAB_KEY);
  if (signin?.tabId === tabId) {
    await session.remove(SIGNIN_TAB_KEY);
    const grid = await session.get<GridNote>(GRID_KEY);
    if (grid?.session !== 'signed-in') mem.signin = { waiting: false, problem: 'tab-closed' };
    await browser.alarms.clear(SIGNIN_ALARM);
  }
  const anth = await session.get<AnthropicTab>(ANTHROPIC_TAB_KEY);
  if (anth?.tabId === tabId) {
    await session.remove(ANTHROPIC_TAB_KEY);
    if (mem.sitting && (mem.connect.signin === 'link' || mem.connect.signin === 'checking')) mem.connect = { ...mem.connect, claudeTabClosed: true };
  }
  const claude = await session.get<OpenedTab>(CLAUDE_TAB_KEY);
  if (claude?.tabId === tabId) await session.remove(CLAUDE_TAB_KEY);
  const term = await session.get<OpenedTab>(TERMINAL_TAB_KEY);
  if (term?.tabId === tabId) {
    await session.remove(TERMINAL_TAB_KEY);
    void mem.loginSetup?.tabClosed();
  }
  if (mem.keptTabId === tabId) mem.keptTabId = undefined;
  schedulePush();
}

/** close the portal tab tab mode kept, once the work ends (online or stopped) */
async function releaseKeptTab(): Promise<void> {
  const id = mem.keptTabId;
  if (id === undefined) return;
  mem.keptTabId = undefined;
  const s = await settingsNow();
  if (!s) return;
  const now = await tabNow(id);
  if (!now) return;
  await closeUnderGuards({ tabId: id, windowId: now.windowId, url: `${s.origin}${DASHBOARD}`, opened_at: nowIso(), purpose: 'press' });
}

// ---- access, kill-list --------------------------------------------------------------------------------

/** what an access check came to, for a page that asked (Details, Settings) */
export interface AccessOutcome {
  /** the service was asked this time (false: a cache held, or nothing to ask with yet) */
  asked: boolean;
  /** the bare reason; the page that shows it puts the label in front (licensing/access.ts accessOutcomeWords) */
  detail: string;
  approved?: boolean;
}

/** the one place the lab's access service is asked (licensing/access.ts does the asking); never before acceptance */
function checkAccessNow(trigger: AccessTrigger): Promise<AccessOutcome> {
  if (accessInFlight) return accessInFlight;
  accessInFlight = (async (): Promise<AccessOutcome> => {
    // PRIVACY.md and LICENSE.txt: no request to the lab before the agreement is accepted
    if (!(await termsInForce())) return { asked: false, detail: NOT_ASKED_TERMS };
    const settings = await settingsNow();
    if (!settings) return { asked: false, detail: NOT_ASKED_NO_PORTAL };
    const account = (await session.get<GridNote>(GRID_KEY))?.account ?? (await local.get<IdentityNote>(IDENTITY_KEY))?.username;
    if (!account) return { asked: false, detail: NOT_ASKED_NO_ACCOUNT };
    mem.accessChecking = true;
    schedulePush();
    const previous = await local.get<AccessRecord>(ACCESS_KEY);
    try {
      const services = await local.get<StoredServices>(SERVICES_KEY);
      const out = await checkAccess({ previous, services, accessId: account, portal: settings.hostname, version: version(), installId: await installId(), fetchFn: fetch, force: accessForced(trigger) });
      if (out.services) await local.set(SERVICES_KEY, out.services);
      await local.set(ACCESS_KEY, out.record);
      if (out.record.approved && !previous?.approved) await activity(LOG_WORDS.approved);
      return { asked: out.asked, detail: out.detail, approved: out.record.approved };
    } catch (e) {
      // the record on file stands
      return { asked: false, detail: (e as Error).message, approved: previous?.approved };
    } finally {
      mem.accessChecking = false;
      schedulePush();
    }
  })();
  accessInFlight.finally(() => (accessInFlight = undefined)).catch(() => undefined);
  return accessInFlight;
}

async function refreshKillListNow(opts: { skipIfFetchedWithinMs?: number } = {}): Promise<{ detail: string; revoked: boolean }> {
  // PRIVACY.md and LICENSE.txt: the extension makes no request to the lab before the agreement is accepted
  if (!(await termsInForce())) return { detail: 'not fetched: the agreement has not been accepted yet', revoked: false };
  const previous = await local.get<StoredKillList>(KILLLIST_KEY);
  if (opts.skipIfFetchedWithinMs && previous && Date.now() - new Date(previous.fetched_at).getTime() < opts.skipIfFetchedWithinMs) {
    return { detail: 'not fetched: the list on file is less than an hour old', revoked: killListVerdict(previous, version()).versionRevoked };
  }
  const out = await refreshKillList(previous, BUNDLED_KEYS, fetch);
  if (out.fresh && out.current) await local.set(KILLLIST_KEY, out.current);
  const verdict = killListVerdict(out.current, version());
  await local.set(REVOKED_KEY, { revoked: verdict.versionRevoked, message: verdict.message, checked_at: nowIso() });
  return { detail: out.detail, revoked: verdict.versionRevoked };
}

// ---- setup ("Your grid account is ready") ---------------------------------------------------------------

/** after approval: does the account run the lab's shared copy? If not, one shell line sets it up (moment 6) */
async function ensureSetup(): Promise<void> {
  if (mem.setup.state === 'ready' || mem.busy.setup) return;
  const f = await buildFacts();
  if (!f.access.ok || f.grid.session !== 'signed-in') return;
  if (connectionMode(f) === 'direct') {
    // the gate has no install verb: the first direct sign-in ran install --shared, and connect sets the account up itself if it must
    mem.setup = { state: 'ready', detail: 'direct: connect sets the account up itself if it must' };
    schedulePush();
    return;
  }
  mem.busy.setup = true;
  try {
    mem.setup = { state: 'checking' };
    schedulePush();
    const dir = await sharedDirNow();
    const s = await settingsNow();
    if (!dir || !s) {
      mem.setup = { state: 'no-shared', detail: `no shared copy of the tool is known for the site "${s?.site ?? ''}"` };
      mem.failDetail = mem.setup.detail ?? '';
      return;
    }
    const c = await directClient();
    const uses = c ? await usesSharedCopy(c, dir) : undefined;
    if (uses === true) {
      mem.setup = { state: 'ready' };
      await activity(LOG_WORDS.ready);
      return;
    }
    if (uses === undefined) {
      // the Files app could not tell: connect sets the account up itself (its step 2), and says so
      mem.setup = { state: 'ready', detail: 'not confirmed through the Files app; connect sets the account up itself if it must' };
      return;
    }
    const ch = await channelNow();
    if (ch?.shell === 'password') {
      // the key step comes with the student's next press; connect sets the account up itself after it
      mem.setup = { state: 'unknown' };
      return;
    }
    mem.setup = { state: 'setting-up' };
    schedulePush();
    const site = await siteForConnect(s);
    try {
      const r = await withShell((p) => withFloor(() => p.shell(commands.installShared(dir, site), { timeoutMs: 120_000 })));
      if (r.exitCode === 0) {
        mem.setup = { state: 'ready' };
        await activity(LOG_WORDS.ready);
      } else {
        mem.setup = { state: 'failed', detail: `the setup line ended with exit ${r.exitCode}: ${r.output.slice(-300)}` };
        mem.failDetail = mem.setup.detail ?? '';
      }
    } catch (e) {
      if (isPasswordError(e)) {
        await setShellWord('password');
        mem.setup = { state: 'unknown' };
      } else {
        mem.setup = { state: 'failed', detail: (e as Error).message };
        mem.failDetail = (e as Error).message;
      }
    }
  } finally {
    mem.busy.setup = false;
    schedulePush();
  }
}

// ---- presses ------------------------------------------------------------------------------------------

/**
 * What a press needs before it can go: the grid signed in (else one sign-in tab, and the press waits),
 * the approval, the setup, and a shell that does not ask for a password (else the key step).
 */
async function readyForPress(kind: PendingPress['kind']): Promise<{ go: boolean; waiting?: 'grid' | 'approval' | 'setup' | 'login-setup'; drop?: boolean }> {
  // 12.0.0: while the direct way is being set up, a press waits on it (the helper, the sheet, an unlock)
  const mode = await modeNow();
  if (mode === 'setup') {
    if (kind === 'open-files') return { go: false, drop: true };
    mem.direct.sheetWanted = true;
    if (kind === 'sign-in-claude') mem.direct.claudeWanted = true;
    if (!(await session.get<BridgeNote>(BRIDGE_KEY))) void probeBridges();
    schedulePush();
    return { go: false, waiting: 'grid' };
  }
  if (mode === 'direct') {
    const g = await checkGridDirect('press');
    if (g === 'unreachable') {
      // the fallback moment says so; Continue there carries the press on the 11.0.0 way
      mem.direct.unreachable = true;
      schedulePush();
      return { go: false, waiting: 'grid' };
    }
    if (g !== 'signed-in') {
      mem.direct.sheetWanted = true;
      if (kind === 'sign-in-claude') mem.direct.claudeWanted = true;
      schedulePush();
      return { go: false, waiting: 'grid' };
    }
    if (kind === 'open-files') return { go: true };
    const f = await buildFacts();
    if (kind === 'connect' || kind === 'sign-in-claude' || kind === 'restrict') {
      if (!f.access.ok) {
        if (f.access.state === 'checking' && f.access.accessId) {
          const now = Date.now();
          if (now - mem.last.pressAccess >= PRESS_RETRY_MS) {
            mem.last.pressAccess = now;
            void checkAccessNow('press').then(() => carryPress());
          }
          return { go: false, waiting: 'approval' };
        }
        return { go: false, drop: true };
      }
      if (mem.setup.state !== 'ready') mem.setup = { state: 'ready', detail: 'direct: connect sets the account up itself if it must' };
    }
    return { go: true };
  }
  const g = await checkGrid('press');
  if (g === 'unreachable') return { go: false, drop: true };
  if (g !== 'signed-in') {
    await openSigninTab('press');
    return { go: false, waiting: 'grid' };
  }
  if (kind === 'open-files') return { go: true };
  const f = await buildFacts();
  const now = Date.now();
  // a worker is started, signed in or marked restricted through the lab's copy in an account set up for it
  if (kind === 'connect' || kind === 'sign-in-claude' || kind === 'restrict') {
    if (!f.access.ok) {
      // the service is asked for this press once; the press then waits for its answer (the panel's tick carries it on)
      if (f.access.state === 'checking' && f.access.accessId) {
        if (now - mem.last.pressAccess >= PRESS_RETRY_MS) {
          mem.last.pressAccess = now;
          void checkAccessNow('press').then(() => carryPress());
        }
        return { go: false, waiting: 'approval' };
      }
      return { go: false, drop: true };
    }
    if (mem.setup.state !== 'ready') {
      const ch = await channelNow();
      if (ch?.shell !== 'password') {
        if (mem.setup.state === 'no-shared' || mem.setup.state === 'failed') return { go: false, drop: true };
        if (now - mem.last.pressSetup >= PRESS_RETRY_MS) {
          mem.last.pressSetup = now;
          void ensureSetup().then(() => carryPress());
        }
        return { go: false, waiting: 'setup' };
      }
    }
  }
  const ch = await channelNow();
  if (ch?.shell === 'password') {
    offerLoginSetup();
    return { go: false, waiting: 'login-setup' };
  }
  return { go: true };
}

/** a press kept while the grid, the approval, the setup or the key step was not ready: it goes ahead by itself */
async function carryPress(): Promise<void> {
  if (mem.busy.press) return;
  const p = await session.get<PendingPress>(PRESS_KEY);
  if (!p) return;
  mem.busy.press = true;
  try {
    const r = await readyForPress(p.kind);
    if (r.drop) {
      await session.remove(PRESS_KEY);
      return;
    }
    if (!r.go) return;
    await session.remove(PRESS_KEY);
    if (p.kind === 'connect') await startConnect('auto');
    else if (p.kind === 'sign-in-claude') await startConnect(p.fresh ? 'fresh' : 'always');
    else if (p.kind === 'stop') await doStop();
    else if (p.kind === 'restrict') await doRestrict((await loadPrefs()).worker_name);
    else if (p.kind === 'open-files') await openFiles();
  } finally {
    mem.busy.press = false;
    schedulePush();
  }
}

/** Connect: the statement (when the press made it), then one connect line carried through to "You're online." */
async function pressConnect(statement?: { tick: string; lines: string[]; buttonLabel: string }): Promise<ActionResults['connect']> {
  const prefs = await loadPrefs();
  if (statement) {
    const all = (await local.get<Statements>(STATEMENTS_KEY)) ?? {};
    const ack = makeAcknowledgement(prefs.worker_name, nowIso(), statement);
    await local.set(STATEMENTS_KEY, { ...all, [ack.work_dir]: ack } satisfies Statements);
  }
  // one connect at a time: a start or a sitting under way is this press's own
  if (mem.sitting || mem.startId) return { started: true };
  mem.connect = { ...freshConnect() };
  await session.set(PRESS_KEY, { kind: 'connect', at: nowIso() } satisfies PendingPress);
  const r = await readyForPress('connect');
  if (r.drop) {
    await session.remove(PRESS_KEY);
    return { started: false };
  }
  if (!r.go) return { started: false, kept: true, ...(r.waiting ? { waiting: r.waiting } : {}) };
  await session.remove(PRESS_KEY);
  return { started: await startConnect('auto') };
}

/** "Sign in to Claude" / "Sign in again" / "Use another account": the same connect line, with the sitting asked for */
async function pressSignInClaude(fresh: boolean): Promise<ActionResults['sign-in-claude']> {
  // a sitting (or the start of one) already under way gives way to this one
  cancelStart();
  if (mem.sitting) {
    mem.sitting.gate.close();
    mem.sitting.close();
    mem.sitting = undefined;
  }
  mem.connect = { ...freshConnect() };
  await session.set(PRESS_KEY, { kind: 'sign-in-claude', ...(fresh ? { fresh: true } : {}), at: nowIso() } satisfies PendingPress);
  const r = await readyForPress('sign-in-claude');
  if (r.drop) {
    await session.remove(PRESS_KEY);
    return { started: false };
  }
  if (!r.go) return { started: false, ...(r.waiting === 'grid' || r.waiting === 'login-setup' ? { waiting: r.waiting } : {}) };
  await session.remove(PRESS_KEY);
  return { started: await startConnect(fresh ? 'fresh' : 'always') };
}

/** a connect line not typed yet is not typed at all (its floor wait ends; a shell it opened is closed before the line) */
function cancelStart(): void {
  mem.startId = 0;
}

async function cancelPress(): Promise<ActionResults['cancel']> {
  const had = !!(await session.get<PendingPress>(PRESS_KEY)) || !!mem.sitting || !!mem.startId;
  cancelStart();
  await session.remove(PRESS_KEY);
  if (mem.sitting) {
    mem.sitting.gate.close();
    mem.sitting.close();
    mem.sitting = undefined;
  }
  mem.loginSetup?.stop();
  mem.loginSetup = undefined;
  mem.connect = { ...freshConnect() };
  mem.direct.sheetWanted = false;
  mem.direct.claudeWanted = false;
  return { cancelled: had };
}

async function retry(): Promise<ActionResults['retry']> {
  const f = await buildFacts();
  const failure = mem.connect.failure;
  if (failure === 'signin-node' || failure === 'signin-code' || failure === 'signin-timeout') return { started: (await pressSignInClaude(false)).started };
  if (failure || f.run.phase === 'error' || f.run.phase === 'stopped' || f.run.phase === 'ended' || !f.run.present) {
    if (!f.access.ok) {
      await checkAccessNow('retry');
      return { started: false };
    }
    return { started: (await pressConnect()).started };
  }
  if (f.grid.session !== 'signed-in') {
    await recheckReach();
    await checkGrid('retry');
  }
  return { started: false };
}

// ---- the connect sitting ------------------------------------------------------------------------------

/**
 * Type the one connect line and hold its sitting: here (direct), or behind CONNECT_PORT in a portal
 * tab's page script (tab mode). The code is typed through the gate, once, and never kept.
 */
async function startConnect(login: LoginMode): Promise<boolean> {
  // claimed before the first await: a second caller in the same moment (the press, the tick carrying
  // it, "Keep my worker running") finds it taken and types nothing
  if (mem.sitting || mem.startId) return true;
  const id = ++mem.sittingSeq;
  mem.startId = id;
  try {
    return await startConnectClaimed(id, login);
  } finally {
    if (mem.startId === id) mem.startId = 0;
  }
}

async function startConnectClaimed(id: number, login: LoginMode): Promise<boolean> {
  const s = await settingsNow();
  if (!s || mem.sitting) return false;
  const prefs = await loadPrefs();
  const dir = await sharedDirNow();
  if (!dir) {
    mem.connect = { ...freshConnect(), failure: 'setup' };
    return false;
  }
  const ack = statementFor(await local.get<Statements>(STATEMENTS_KEY), prefs.worker_name);
  const opts: ConnectOptions = {
    name: prefs.worker_name,
    site: await siteForConnect(s),
    ...(ack ? { installId: await installId() } : {}),
    login,
    permissionMode: prefs.permission_mode,
    chain: prefs.auto_start,
  };
  let line: string;
  try {
    line = connectLine(dir, opts);
  } catch (e) {
    mem.connect = { ...freshConnect(), failure: 'other' };
    mem.failDetail = (e as Error).message;
    return false;
  }
  if (mem.startId !== id) return false;
  mem.connect = { ...freshConnect(), inFlight: true, pressedAt: Date.now() };
  mem.restricted = false;
  await mutateRun((cur) => (cur && cur.stopped_by_student ? { ...cur, stopped_by_student: false } : undefined));
  schedulePush();
  // 12.0.0: the direct way. Through the gate when no Claude sign-in is wanted (it is always --login
  // never there); a Claude sign-in runs connect in the student's own signed-in session (held from a
  // sign-in a moment ago, or the sheet first)
  if ((await modeNow()) === 'direct') {
    const needsClaude = login === 'always' || login === 'fresh' || (login === 'auto' && mem.direct.claude === 'no');
    const held = !!mem.direct.sheet?.holding();
    if (!needsClaude && !(login === 'auto' && held && mem.direct.claude !== 'yes')) {
      const gateOpts: ConnectOptions = { ...opts, login: 'never' };
      return startGateConnect(id, gateOpts);
    }
    return startSshSitting(id, line, login);
  }
  const ch = await channelNow();
  return ch?.mode === 'tab' ? startTabSitting(id, s, opts, dir, login) : startDirectSitting(id, line, login);
}

async function startDirectSitting(id: number, line: string, login: LoginMode): Promise<boolean> {
  const c = await directClient();
  if (!c) return false;
  // events that arrive before the sitting is registered (none should: the line is typed after the
  // prompt settles) are kept and handed on in order once it is
  let registered = false;
  const early: ConnectEvent[] = [];
  const watcher = new ConnectWatcher((ev) => (registered ? void onConnectEvent(id, ev) : void early.push(ev)));
  let shell: ShellSession;
  try {
    // the floor's wait is given up the moment the start is (Stop, Cancel, another sign-in)
    shell = await withFloor(() => c.openLoginShell(line, (text) => watcher.feed(text)), undefined, () => mem.startId === id);
  } catch (e) {
    if (mem.startId !== id) {
      mem.connect = { ...mem.connect, inFlight: false };
      schedulePush();
      return false;
    }
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) {
      // the grid sign-in lapsed: the press waits for it, as any press does (the sign-in tab, then on by itself)
      mem.connect = { ...freshConnect() };
      await writeGrid({ session: 'signed-out' });
      await session.set(PRESS_KEY, { kind: login === 'auto' || login === 'never' ? 'connect' : 'sign-in-claude', ...(login === 'fresh' ? { fresh: true } : {}), at: nowIso() } satisfies PendingPress);
      await openSigninTab('press');
      schedulePush();
      return false;
    }
    mem.connect = { ...mem.connect, inFlight: false, failure: 'closed' };
    mem.failDetail = (e as Error).message;
    schedulePush();
    return false;
  }
  if (mem.startId !== id || mem.sitting) {
    // given up while the shell opened (or another sitting won): closed before its line is typed
    shell.close();
    if (mem.startId !== id) mem.connect = { ...mem.connect, inFlight: false };
    schedulePush();
    return false;
  }
  const gate = new CodeGate((input) => shell.send(input));
  mem.sitting = { id, mode: 'direct', login, gate, close: () => shell.close() };
  registered = true;
  for (const ev of early.splice(0)) await onConnectEvent(id, ev);
  void shell.done.then((end) => onSittingEnd(id, end.reason, watcher.tail));
  return true;
}

async function startTabSitting(id: number, s: PortalSettings, opts: ConnectOptions, dir: string, login: LoginMode): Promise<boolean> {
  const host = tabHost(s.origin);
  let tabId = mem.keptTabId;
  let ownTab = false;
  try {
    if (tabId === undefined || !(await host.onPortal(tabId))) {
      tabId = await host.openInactive(`${s.origin}${DASHBOARD}`, mem.panelWindowId);
      ownTab = true;
      await host.keep(tabId).catch(() => undefined);
    }
    if (!(await readyScript(host, tabId))) throw new Error('the page script did not answer in the portal tab');
  } catch (e) {
    if (ownTab && tabId !== undefined) await host.close(tabId).catch(() => undefined);
    mem.connect = { ...mem.connect, inFlight: false, failure: 'closed' };
    mem.failDetail = (e as Error).message;
    return false;
  }
  if (mem.startId !== id) {
    // given up while the portal tab opened: nothing is typed
    if (ownTab) await host.close(tabId).catch(() => undefined);
    mem.connect = { ...mem.connect, inFlight: false };
    return false;
  }
  const port = browser.tabs.connect(tabId, { name: CONNECT_PORT });
  const gate = new CodeGate((input) => {
    try {
      port.postMessage({ type: 'input', text: input });
    } catch {
      /* the tab is gone */
    }
  });
  const theTab = tabId;
  mem.sitting = {
    id,
    mode: 'tab',
    login,
    gate,
    tabId: theTab,
    ownTab,
    close: () => {
      try {
        port.postMessage({ type: 'close' });
        port.disconnect();
      } catch {
        /* gone */
      }
    },
  };
  mem.workingInTab++;
  let ended = false;
  const finish = (reason: string) => {
    if (ended) return;
    ended = true;
    mem.workingInTab = Math.max(0, mem.workingInTab - 1);
    if (ownTab) void host.close(theTab).catch(() => undefined);
    void onSittingEnd(id, reason, []);
  };
  port.onMessage.addListener((m: unknown) => {
    const msg = m as ConnectOut;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'event') void onConnectEvent(id, msg.event);
    else if (msg.type === 'password') finish('password');
    else if (msg.type === 'closed') finish(msg.reason);
    else if (msg.type === 'error') {
      mem.failDetail = msg.message;
      finish('closed');
    }
  });
  port.onDisconnect.addListener(() => finish('closed'));
  port.postMessage({ type: 'connect', options: opts, sharedDir: dir });
  return true;
}

/** what the connect line said; the views follow from mem.connect */
async function onConnectEvent(id: number, ev: ConnectEvent): Promise<void> {
  const sit = mem.sitting;
  if (!sit || sit.id !== id) return;
  sit.gate.onEvent(ev);
  const c = mem.connect;
  switch (ev.kind) {
    case 'step': {
      const st = ev.step;
      switch (st.step) {
        case 'setup':
          if (mem.setup.state !== 'ready') {
            mem.setup = { state: 'ready' };
            await activity(LOG_WORDS.ready);
          }
          break;
        case 'consent': {
          const prefs = await loadPrefs();
          const all = (await local.get<Statements>(STATEMENTS_KEY)) ?? {};
          const ack = statementFor(all, prefs.worker_name);
          if (ack) await local.set(STATEMENTS_KEY, { ...all, [ack.work_dir]: withConsentRecorded(ack) } satisfies Statements);
          break;
        }
        case 'queued':
          // the run record first, then the moment: a listing that runs between the two must find the Connect's record
          await recordQueued(st.job, st.fresh, st.runDir);
          mem.connect = { ...mem.connect, queued: true };
          break;
        case 'signin':
          mem.connect = { ...c, signin: 'asked' };
          break;
        case 'signed-in': {
          const allowed = planAllowsRemoteControl(st.plan);
          mem.connect = { ...c, signin: 'signed-in', signedIn: { ...(st.email ? { email: st.email } : {}), ...(st.plan ? { plan: st.plan } : {}), at: Date.now() }, badCode: false, ...(allowed ? {} : { noPlan: true }) };
          if (allowed) await activity(LOG_WORDS.claudeSignedIn(planWord(st.plan) ?? 'Claude'));
          await closeAnthropicTab();
          // already signed in on the grid (no link was shown): the Claude moment never appears, a toast says who (spec moment 8)
          if (!c.linkShown && allowed) {
            const plan = planWord(st.plan);
            toast(plan ? WORDS.claude.signedIn(st.email ?? 'your account', plan) : `Signed in as ${st.email ?? 'your account'}`);
          }
          // the drawn check holds 3 s, then the panel moves on
          setTimeout(() => schedulePush(), 3_100);
          break;
        }
        case 'done':
          mem.connect = { ...mem.connect, inFlight: false };
          break;
        case 'failed':
          mem.connect = { ...mem.connect, inFlight: false, failure: st.code };
          mem.failDetail = st.detail;
          if (st.code === 'restricted') mem.restricted = true;
          if (st.code === 'setup') mem.setup = { state: 'failed', detail: st.detail };
          break;
      }
      break;
    }
    case 'signin-wait':
      mem.connect = { ...c, signinWaitSince: Date.now() };
      break;
    case 'signin-node': {
      const { signinWaitSince: _w, ...rest } = c;
      mem.connect = rest;
      break;
    }
    case 'auth-url':
      sit.authUrl = ev.url;
      mem.connect = { ...c, signin: 'link', claudeTabClosed: false, linkShown: true };
      await openAnthropicTab(ev.url);
      break;
    case 'code-prompt':
      if (c.signin === 'asked') mem.connect = { ...c, signin: 'link' };
      break;
    case 'code-received':
      mem.connect = { ...c, signin: 'checking', badCode: false };
      break;
    case 'code-rejected':
      mem.connect = { ...c, signin: 'link', badCode: true };
      break;
    default:
      break;
  }
  schedulePush();
}

/** the sitting's socket closed: a password before anything was typed means the key step (AM2) */
async function onSittingEnd(id: number, reason: string, tail: string[]): Promise<void> {
  const sit = mem.sitting;
  if (!sit || sit.id !== id) return;
  sit.gate.close();
  mem.sitting = undefined;
  if (reason === 'password') {
    mem.connect = { ...freshConnect(), failure: 'password' };
    await setShellWord('password');
    await session.set(PRESS_KEY, { kind: sit.login === 'auto' || sit.login === 'never' ? 'connect' : 'sign-in-claude', ...(sit.login === 'fresh' ? { fresh: true } : {}), at: nowIso() } satisfies PendingPress);
    offerLoginSetup();
  } else if (mem.connect.inFlight) {
    // the socket closed with no done or failed
    const c = mem.connect;
    if (c.queued) {
      // the worker keeps its place; a sign-in cut short shows as its own problem, the job says the rest
      mem.connect = { ...c, inFlight: false, ...(c.signin === 'link' || c.signin === 'checking' ? { failure: 'signin-timeout' as ConnectFailure } : {}) };
    } else {
      mem.connect = { ...c, inFlight: false, failure: 'closed' };
      mem.failDetail = tail.slice(-20).join('\n');
    }
  }
  schedulePush();
}

/** `HPCW-STEP queued <job> new|kept <run dir>`: the run, at once, and its folder listed within a second */
async function recordQueued(job: string, fresh: boolean, runDir: string | undefined): Promise<void> {
  const prefs = await loadPrefs();
  const prev = await session.get<RunState>(RUN_KEY);
  let stateDir = prev?.stateDir;
  let name = prefs.worker_name;
  if (runDir) {
    const i = runDir.replace(/\/+$/, '').lastIndexOf('/');
    if (i > 0) {
      stateDir = runDir.slice(0, i);
      name = runDir.slice(i + 1) || name;
    }
  }
  if (!stateDir) {
    try {
      const c = await directClient();
      if (c) stateDir = (await clusterContext(c)).stateDir;
    } catch {
      /* found at the next listing */
    }
  }
  if (!stateDir) return;
  const dir = stateDir;
  // merged into the record as it is now: a listing that found this run meanwhile (started_by "found")
  // keeps what it read, and gains what only the Connect knows (pressed, started_by)
  await mutateRun((cur) => {
    const same = cur && cur.job === job && cur.stateDir === dir && cur.run === name;
    return same
      ? { ...cur, pressed: !!cur.pressed || fresh, started_by: cur.started_by === 'found' || !cur.started_by ? 'connect' : cur.started_by, stopped_by_student: false }
      : { stateDir: dir, run: name, job, set_at: nowIso(), started_by: 'connect', pressed: fresh, stopped_by_student: false };
  });
  if (fresh) await activity(LOG_WORDS.asked);
  await setPollEvery(0.5);
  mem.last.list = 0;
  void pollRun(true);
}

/** Anthropic's sign-in page, in a new tab in the panel's window; only an https link on claude.ai or claude.com reaches here */
async function openAnthropicTab(url: string): Promise<boolean> {
  const win = mem.panelWindowId;
  const ret = await activeTabIn(win);
  const t = await openTab(url, { active: true, anthropicOk: true, ...(win !== undefined ? { windowId: win } : {}) });
  if (!t) return false;
  let origin = 'https://claude.ai';
  try {
    origin = new URL(url).origin;
  } catch {
    /* keep */
  }
  // the authorize link itself is not stored: only where the tab is, to count its loads
  await session.set(ANTHROPIC_TAB_KEY, { tabId: t.tabId, windowId: t.windowId, url: origin, opened_at: nowIso(), purpose: 'anthropic', ...(ret !== undefined ? { return_tab_id: ret } : {}) } satisfies AnthropicTab);
  return true;
}

/** the code, typed once into the sitting through the gate and forgotten; the tab's loads from now on decide whether it may be closed */
async function pasteCode(code: string): Promise<ActionResults['paste-code']> {
  const sit = mem.sitting;
  if (!sit) return { typed: false };
  const out = sit.gate.submit(code);
  if (out === 'bad') {
    mem.connect = { ...mem.connect, badCode: true };
    return { typed: false };
  }
  if (out !== 'typed' && out !== 'held') return { typed: false };
  mem.connect = { ...mem.connect, badCode: false, ...(out === 'typed' ? { signin: 'checking' as const } : {}) };
  const anth = await session.get<AnthropicTab>(ANTHROPIC_TAB_KEY);
  if (anth) await session.set(ANTHROPIC_TAB_KEY, { ...anth, pasted_at: nowIso(), loads_since_paste: 0 } satisfies AnthropicTab);
  return { typed: true };
}

/** SIGNED-IN: Anthropic's tab closes itself, if it has started no new load since the paste; focus returns to the tab that was in front */
async function closeAnthropicTab(): Promise<void> {
  const anth = await session.get<AnthropicTab>(ANTHROPIC_TAB_KEY);
  if (!anth) return;
  await closeUnderGuards(anth);
  await session.remove(ANTHROPIC_TAB_KEY);
}

// ---- AM2: the one-time key step ---------------------------------------------------------------------

function offerLoginSetup(): void {
  if (mem.loginSetup && mem.loginSetup.phase !== 'done') return;
  void (async () => {
    const dir = await sharedDirNow();
    if (!dir) {
      mem.connect = { ...freshConnect(), failure: 'setup' };
      schedulePush();
      return;
    }
    const line = commands.loginSetup(dir);
    // the line is typed for the student only when its path is the site profile's own shared copy (a
    // portal this build carries no profile for gets the copy-and-paste way: the line, never typed by Beethoven)
    const s = await settingsNow();
    const profiled = !!s && sharedRootOf((await siteProfile(s.site))?.shared_install) === dir;
    mem.loginSetup = new LoginSetupFlow(line, {
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      openTerminal: openTerminalTab,
      type: profiled ? typeInTerminal : async () => ({ typed: false, how: 'unsupported', why: 'unsupported' }),
      test: async () => {
        try {
          // tab mode: the grid terminal tab itself carries the test (no portal tab opened and closed every few seconds)
          const term = await session.get<OpenedTab>(TERMINAL_TAB_KEY);
          return await withShell((p) => p.shellTest(), term ? { viaTabId: term.tabId } : {});
        } catch (e) {
          return isPasswordError(e) ? 'password' : 'error';
        }
      },
      terminalOpen: async () => {
        const rec = await session.get<OpenedTab>(TERMINAL_TAB_KEY);
        return !!rec && !!(await tabNow(rec.tabId));
      },
      closeTerminal: async () => {
        const rec = await session.get<OpenedTab>(TERMINAL_TAB_KEY);
        if (rec) await closeUnderGuards(rec);
        await session.remove(TERMINAL_TAB_KEY);
      },
      changed: () => schedulePush(),
      done: () => {
        void (async () => {
          await setShellWord('ok');
          await activity(LOG_WORDS.keyStepDone);
          mem.connect = { ...freshConnect() };
          schedulePush();
          setTimeout(() => {
            mem.loginSetup = undefined;
            schedulePush();
            void ensureSetup().then(() => carryPress());
          }, KEY_DONE_HOLD_MS);
        })();
      },
    });
    schedulePush();
  })();
}

/** "Open the grid terminal": the university's own terminal page, in front, in the panel's window */
async function openTerminalTab(): Promise<boolean> {
  const s = await settingsNow();
  if (!s) return false;
  const url = shellPageUrl(s.origin, s.shell_host || 'default');
  const old = await session.get<OpenedTab>(TERMINAL_TAB_KEY);
  if (old && (await tabNow(old.tabId))) {
    await focusTab(old.tabId, old.windowId);
    return true;
  }
  const win = mem.panelWindowId;
  const ret = await activeTabIn(win);
  const t = await openTab(url, { active: true, ...(win !== undefined ? { windowId: win } : {}) });
  if (!t) return false;
  await session.set(TERMINAL_TAB_KEY, { tabId: t.tabId, windowId: t.windowId, url, opened_at: nowIso(), purpose: 'terminal', ...(ret !== undefined ? { return_tab_id: ret } : {}) } satisfies OpenedTab);
  return true;
}

/** the terminal page loaded: Beethoven's page script goes into that one tab, and watches the title only */
async function watchTerminal(rec: OpenedTab): Promise<void> {
  const s = await settingsNow();
  if (!s) return;
  const account = (await session.get<GridNote>(GRID_KEY))?.account ?? (await local.get<IdentityNote>(IDENTITY_KEY))?.username;
  try {
    if (!(await connectApi.ping(rec.tabId).catch(() => false))) await connectApi.inject(rec.tabId, s.origin);
    for (let i = 0; i < 12; i++) {
      if (await connectApi.ping(rec.tabId).catch(() => false)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (account) await browser.tabs.sendMessage(rec.tabId, { type: 'terminal.watch', account } satisfies Request);
  } catch {
    /* the student presses "I'm in" */
  }
}

/** after "I'm in" (or the title's sign): the page script types the one line; it refuses any other */
async function typeInTerminal(line: string): Promise<TerminalTyped> {
  const rec = await session.get<OpenedTab>(TERMINAL_TAB_KEY);
  const s = await settingsNow();
  if (!rec || !s) return { typed: false, how: 'unsupported', why: 'unsupported' };
  if (!(await connectApi.ping(rec.tabId).catch(() => false))) {
    await connectApi.inject(rec.tabId, s.origin).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 400));
  }
  const a = (await browser.tabs.sendMessage(rec.tabId, { type: 'terminal.type', line } satisfies Request)) as Answer<TerminalTyped> | undefined;
  return unwrap(a);
}

// ---- stop, restrict, files ---------------------------------------------------------------------------

async function pressStop(): Promise<ActionResults['stop']> {
  // a connect line not typed yet never is
  cancelStart();
  if (mem.sitting) {
    mem.sitting.gate.close();
    mem.sitting.close();
    mem.sitting = undefined;
    mem.connect = { ...freshConnect() };
  }
  await session.set(PRESS_KEY, { kind: 'stop', at: nowIso() } satisfies PendingPress);
  const r = await readyForPress('stop');
  if (r.drop) {
    await session.remove(PRESS_KEY);
    return { stopped: false };
  }
  if (!r.go) return { stopped: false };
  await session.remove(PRESS_KEY);
  return { stopped: await doStop() };
}

/** `worker stop` alone, through the shell; "Stopping…" until the job is gone */
async function doStop(): Promise<boolean> {
  const dir = await sharedDirNow();
  const prefs = await loadPrefs();
  const run = await session.get<RunState>(RUN_KEY);
  const name = run?.run ?? prefs.worker_name;
  if (!dir) return false;
  mem.stopping = true;
  schedulePush();
  try {
    const out = await withShell((p) => stopByShell(p, dir, name));
    await mutateRun((cur) => (cur ? { ...cur, stopped_by_student: true } : undefined));
    await pollRun(true);
    if (out.stopped) await activity(LOG_WORDS.stopped);
    await releaseKeptTab();
    await setPollEvery(1);
    return out.stopped;
  } catch (e) {
    if (isPasswordError(e)) {
      await setShellWord('password');
      await session.set(PRESS_KEY, { kind: 'stop', at: nowIso() } satisfies PendingPress);
      offerLoginSetup();
    }
    return false;
  } finally {
    mem.stopping = false;
    schedulePush();
  }
}

async function pressRestrict(workerName: string): Promise<ActionResults['restrict']> {
  const prefs = await loadPrefs();
  if (workerName !== prefs.worker_name) return { marked: false };
  await session.set(PRESS_KEY, { kind: 'restrict', at: nowIso() } satisfies PendingPress);
  const r = await readyForPress('restrict');
  if (!r.go) {
    if (r.drop) await session.remove(PRESS_KEY);
    return { marked: false };
  }
  await session.remove(PRESS_KEY);
  return { marked: await doRestrict(workerName) };
}

async function doRestrict(name: string): Promise<boolean> {
  const dir = await sharedDirNow();
  if (!dir) return false;
  try {
    const out = await withShell((p) => restrictByShell(p, dir, name));
    if (out.marked) mem.restricted = true;
    return out.marked;
  } catch (e) {
    if (isPasswordError(e)) {
      await setShellWord('password');
      await session.set(PRESS_KEY, { kind: 'restrict', at: nowIso() } satisfies PendingPress);
      offerLoginSetup();
    }
    return false;
  }
}

/** "Your files": the worker's folder in the portal's Files app, in a tab (the browser asks for its sign-in there itself when it holds none) */
async function openFiles(): Promise<boolean> {
  const s = await settingsNow();
  if (!s) return false;
  const run = await session.get<RunState>(RUN_KEY);
  const prefs = await loadPrefs();
  let target = '';
  if (run) target = paths.workspace(run.stateDir, run.run);
  else {
    try {
      const c = await directClient();
      if (c) target = paths.workspace((await clusterContext(c)).stateDir, prefs.worker_name);
    } catch {
      target = '';
    }
  }
  const url = `${s.origin}/pun/sys/dashboard/files/fs${target.split('/').map(encodeURIComponent).join('/')}`;
  return !!(await openTab(url, { active: true, ...(mem.panelWindowId !== undefined ? { windowId: mem.panelWindowId } : {}) }));
}

// ---- the run's files ---------------------------------------------------------------------------------

/** find the worker's run on the grid when this browser session has none (after a browser restart) */
async function discoverRun(c: PortalClient): Promise<RunState | undefined> {
  const prefs = await loadPrefs();
  try {
    const ctx = await clusterContext(c);
    const text = await c.readFileIfExists(paths.status(ctx.stateDir, prefs.worker_name));
    if (!text) return undefined;
    const st = JSON.parse(text) as StatusFile;
    if (!st.job) return undefined;
    return { stateDir: ctx.stateDir, run: prefs.worker_name, job: String(st.job), ...(ctx.site ? { site: ctx.site } : {}), set_at: nowIso(), started_by: 'found', ...(st.next_job ? { next_job: String(st.next_job) } : {}) };
  } catch {
    return undefined;
  }
}

/** list the run folder and download only what changed (status.json, connection.json by modified_at; the node file once; progress.log when Show log or Details wants it) */
async function pollRun(force = false, want: { progress?: boolean } = {}): Promise<void> {
  if (mem.busy.list) return;
  const grid = await session.get<GridNote>(GRID_KEY);
  if (!force && grid?.session !== 'signed-in' && mem.ports.size > 0) return;
  // 12.0.0: the direct way reads the run file by file through the gate; nothing while it is being set up
  const mode = await modeNow();
  if (mode === 'setup') return;
  if (mode === 'direct') {
    if (!(await termsInForce())) return;
    mem.busy.list = true;
    mem.last.list = Date.now();
    try {
      await pollRunDirect(want);
    } catch {
      /* the next tick reads again */
    } finally {
      mem.busy.list = false;
      schedulePush();
    }
    return;
  }
  const c = await directClient();
  if (!c || !(await termsInForce())) return;
  mem.busy.list = true;
  mem.last.list = Date.now();
  try {
    let snap = await session.get<RunState>(RUN_KEY);
    if (!snap) {
      if (grid?.session !== 'signed-in') return;
      // never while a Connect is under way: its own record is on its way (recordQueued), and a record
      // found here would carry none of what only the press knows
      if (mem.connect.inFlight || mem.sitting || mem.startId) return;
      const found = await discoverRun(c);
      if (!found) return;
      // written only while there is still no record (a Connect may have written its own meanwhile)
      snap = await mutateRun((cur) => (cur ? undefined : found));
      if (!snap) return;
    }
    const detailsOpen = [...mem.ports.values()].some((p) => p.surface === 'details');
    let listing;
    const asked = Date.now();
    try {
      listing = await c.listDir(paths.run(snap.stateDir, snap.run));
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401 || status === 403) await writeGrid({ session: 'signed-out' });
      const why = (e as Error).message;
      await mutateRun((cur) => (sameRun(cur, snap) ? { ...cur!, error: why } : undefined));
      return;
    }
    const answered = Date.now();
    const rawLink = environmentLinkOf(snap);
    const needRc = detailsOpen || (snap.status?.state === 'running' && !rawLink);
    const plan = listingPlan(snap, listing.files, { progress: mem.logOpen || detailsOpen || !!want.progress, rc: needRc });
    // what this listing read, downloaded outside the queue and applied inside it to the record as it is then
    const read: { status?: StatusFile; connection?: ConnectionFile; node?: string; progress?: string; rc?: string } = {};
    if (plan.status) {
      const t = await c.readFileIfExists(paths.status(snap.stateDir, snap.run)).catch(() => undefined);
      if (t) {
        try {
          read.status = JSON.parse(t) as StatusFile;
        } catch {
          /* a file caught mid-write; the next listing reads it */
        }
      }
    }
    if (plan.connection) {
      const t = await c.readFileIfExists(paths.connection(snap.stateDir, snap.run)).catch(() => undefined);
      if (t) {
        try {
          read.connection = JSON.parse(t) as ConnectionFile;
        } catch {
          /* next time */
        }
      }
    }
    if (plan.node) {
      const t = await c.readFileIfExists(paths.node(snap.stateDir, snap.run)).catch(() => undefined);
      if (t) read.node = t.trim().slice(0, 100);
    }
    if (plan.progress) read.progress = await c.readFileIfExists(paths.progressLog(snap.stateDir, snap.run)).catch(() => undefined);
    if (plan.rc) read.rc = await c.readFileIfExists(paths.rcLog(snap.stateDir, snap.run)).catch(() => undefined);
    // the grid's clock against this computer's, from the Files app's own Date (R5, R12 and the timers compare like with like)
    const offset = clockOffset(listing.serverDate, asked, answered);
    const newer = (mtime: number | undefined, had: number | undefined) => mtime !== undefined && (had === undefined || mtime >= had);
    const run = await mutateRun((cur) => {
      if (!sameRun(cur, snap)) return undefined;
      let r = cur!;
      if (read.status && newer(plan.mtimes.status, r.status_mtime)) r = applyStatus(r, read.status, plan.mtimes.status).run;
      if (read.connection && newer(plan.mtimes.connection, r.connection_mtime)) r = applyConnection(r, read.connection, plan.mtimes.connection).run;
      if (plan.node && newer(plan.mtimes.node, r.node_mtime)) r = { ...r, node_mtime: plan.mtimes.node, ...(read.node ? { node: read.node } : {}) };
      if (read.progress !== undefined && newer(plan.mtimes.progress, r.progress_mtime)) r = { ...r, progress_tail: read.progress.split('\n').filter(Boolean).slice(-40), progress_mtime: plan.mtimes.progress };
      if (read.rc !== undefined && newer(plan.mtimes.rc, r.rc_mtime)) {
        const reg = parseRegistration(read.rc);
        r = { ...r, rc_tail: read.rc.slice(-4000), rc_mtime: plan.mtimes.rc, ...(reg.session_name || reg.environment_url ? { registration: reg } : {}) };
      }
      const keepOffset = offset === undefined ? r.clock_offset_ms : r.clock_offset_ms !== undefined && Math.abs(offset - r.clock_offset_ms) <= CLOCK_JITTER_MS ? r.clock_offset_ms : offset;
      return { ...r, listed_at: nowIso(), error: undefined, ...(keepOffset !== undefined ? { clock_offset_ms: keepOffset } : {}) };
    });
    if (run) await afterRead();
  } finally {
    mem.busy.list = false;
    schedulePush();
  }
}

/** a difference this small between the two clocks is noise (the Date header has whole seconds); a larger one is kept */
const CLOCK_JITTER_MS = 3_000;

/** the grid's clock minus this computer's, in ms, from a response's Date header and when it was asked and answered; 0 inside the jitter */
function clockOffset(serverDate: string | undefined, asked: number, answered: number): number | undefined {
  if (!serverDate) return undefined;
  const server = Date.parse(serverDate);
  if (!Number.isFinite(server)) return undefined;
  // the header carries whole seconds: its true moment is on average half a second later
  const off = server + 500 - (asked + answered) / 2;
  return Math.abs(off) <= CLOCK_JITTER_MS ? 0 : Math.round(off);
}

/** `worker status --json`, once a minute while queued (13.0.0: or renewing) with a page open: the scheduler's reason and estimate, and from framework 13 whether a renewal's successor is still there (direct only: tab mode would open a portal tab every minute) */
async function refreshStatusJson(): Promise<void> {
  if (mem.busy.statusJson) return;
  const direct = (await modeNow()) === 'direct';
  const ch = await channelNow();
  if (ch?.mode === 'tab' && !direct) return;
  mem.busy.statusJson = true;
  mem.last.statusJson = Date.now();
  try {
    const snap = await session.get<RunState>(RUN_KEY);
    const dir = await sharedDirNow();
    const c: PortalApi | undefined = direct ? await sshPortal() : await directClient();
    if (!snap || !dir || !c) return;
    // asked only while the run is still in line (or renewing) and no press of the student's waits or runs
    const asking = (r: RunState) => ['queued', 'renewing'].includes(runFacts(r, Date.now()).phase);
    if (!asking(snap) || mem.stopping || mem.startId || mem.pressDepth > 0 || (await session.get<PendingPress>(PRESS_KEY))) return;
    // still wanted when it goes: in line or renewing, the same job, and no press of the student's waiting or under way
    const still = async () => {
      const cur = await session.get<RunState>(RUN_KEY);
      return !!cur && sameRun(cur, snap) && cur.job === snap.job && asking(cur) && !mem.stopping && !mem.startId && mem.pressDepth === 0 && !(await session.get<PendingPress>(PRESS_KEY));
    };
    const sj = await statusByShell(c, dir, snap.run, undefined, still).catch(() => undefined);
    if (!sj) return;
    let say: string | undefined;
    await mutateRun((cur) => {
      // merged into the record as it is now, for the same job only, and only while it is still in line:
      // never a copy from before the floor's wait written back over what the listings read since
      if (!sameRun(cur, snap) || cur!.job !== snap.job) return undefined;
      let next: RunState = { ...cur!, scheduler: sj.scheduler, status_json_at: nowIso() };
      const st = cur!.status?.state;
      // framework 13: a job that ended naming its successor ("preempted") reads "stopped" once the successor is gone
      if (sj.status && (!st || st === 'queued' || st === 'preempted')) next = applyStatus(next, sj.status).run;
      // "In line: …" in Show log, once per job and reason class (D25), for a job in line (never a renewal's successor)
      if (sj.scheduler && sj.scheduler.state === 'PENDING' && st !== 'preempted') {
        const tag = `${next.job}|${reasonClass(sj.scheduler.reason)}`;
        if (next.reason_logged !== tag) {
          next = { ...next, reason_logged: tag };
          say = LOG_WORDS.inLine[reasonClass(sj.scheduler.reason)];
        }
      }
      return next;
    });
    if (say) await activity(say);
  } finally {
    mem.busy.statusJson = false;
    schedulePush();
  }
}

/** what a read changed: the wait history, going online (open once, the burst, the first online), stopping, the alarm's cadence; decided on the record as it is now, once */
async function afterRead(): Promise<void> {
  const now = Date.now();
  const prefs = await loadPrefs();
  let open: string | undefined;
  let online = false;
  let waited: number | undefined;
  let gotComputer = false;
  let titled: string | undefined;
  const run = await mutateRun((cur) => {
    if (!cur) return undefined;
    const rf = runFacts(cur, now);
    let r = cur;
    let changed = false;
    // the wait, once per job the student's Connect submitted
    if (rf.gotComputerAt && rf.pressed && r.wait_recorded_job !== r.job) {
      waited = waitMinutes(rf);
      r = { ...r, wait_recorded_job: r.job };
      gotComputer = true;
      changed = true;
    }
    if (rf.phase === 'online' && r.online_announced_job !== r.job) {
      r = { ...r, online_announced_job: r.job };
      changed = true;
      online = true;
      titled = rf.title;
      if (r.started_by !== 'found' || rf.pressed) mem.onlineAnnouncedAt = now;
      if (rf.pressed && prefs.open_claude_on_connect && rf.link && r.opened_env !== rf.link) {
        r = { ...r, opened_env: rf.link };
        open = rf.link;
      }
    }
    return changed ? r : undefined;
  });
  if (waited !== undefined) {
    const h = await local.get<WaitHistory>(WAIT_HISTORY_KEY);
    await local.set(WAIT_HISTORY_KEY, { minutes: addWait(h?.minutes, waited) } satisfies WaitHistory);
  }
  if (gotComputer) await activity(LOG_WORDS.gotComputer);
  if (online) {
    await once({ first_online_at: nowIso() });
    await activity(LOG_WORDS.online(titled ?? sessionTitleFor((await siteProfile((await settingsNow())?.site ?? DEFAULT_SITE))?.session_title, prefs.worker_name)));
    if (open) await openSessionTab(open);
    await releaseKeptTab();
    setTimeout(() => schedulePush(), 4_100);
  }
  const rf = runFacts(run, Date.now());
  await setPollEvery(rf.phase === 'online' || rf.phase === 'stopped' || rf.phase === 'ended' || rf.phase === 'error' || rf.phase === 'none' ? 1 : 0.5);
}

/** "Keep my worker running": a worker that ended without the student's Stop is started again on the grid sign-in, with no sign-in sitting and no tab */
async function maybeKeepRunning(): Promise<void> {
  const prefs = await loadPrefs();
  if (!prefs.auto_start || mem.sitting) return;
  const f = await buildFacts();
  const run = await session.get<RunState>(RUN_KEY);
  if (!run || run.stopped_by_student || f.run.phase !== 'ended') return;
  if (!f.statement.inForce || !f.access.ok || mem.setup.state !== 'ready') return;
  const ch = await channelNow();
  if (ch?.shell === 'password') return;
  await startConnect('never');
}

// ---- claude.ai --------------------------------------------------------------------------------------

/** open the environment link in one new tab and remember it (claude.ai's tab is never closed by Beethoven) */
async function openSessionTab(link: string): Promise<boolean> {
  if (!isEnvironmentUrl(link)) return false;
  const win = mem.panelWindowId;
  const t = await openTab(link, { active: true, anthropicOk: true, ...(win !== undefined ? { windowId: win } : {}) });
  if (!t) return false;
  await session.set(CLAUDE_TAB_KEY, { tabId: t.tabId, windowId: t.windowId, url: 'https://claude.ai/code', opened_at: nowIso(), purpose: 'session', loaded: false, loads_after: 0 } satisfies OpenedTab);
  return true;
}

/** "Open my session": the claude.ai tab Beethoven opened when it has had no new load since, else one new tab; never two; never needs the grid */
async function openSession(): Promise<ActionResults['open-session']> {
  const f = await buildFacts();
  const link = f.run.link ?? f.lastKnown?.environment_url;
  if (!isEnvironmentUrl(link)) return { focused: false, opened: false };
  const rec = await session.get<OpenedTab>(CLAUDE_TAB_KEY);
  const exists = rec ? !!(await tabNow(rec.tabId)) : false;
  if (rec && sessionTabDecision(rec, exists) === 'focus') {
    const ok = await focusTab(rec.tabId, rec.windowId);
    if (ok) return { focused: true, opened: false };
  }
  return { focused: false, opened: await openSessionTab(link) };
}


// ---- 12.0.0: the direct way (ssh through a bridge; docs/V12_CONTRACT.md) -------------------------------
//
// D3's order: a browser-only bridge (none known: a named stub), a relay the site profile names (none at
// Wayne State), the helper that comes inside Beethoven (offered for a one-time install when it does not
// answer), and only when none is there, or the student chooses it, the 11.0.0 way through GlobalProtect.
// The first direct sign-in is Beethoven's own sheet (core/signin.ts); then this computer's key, through
// the gate, carries every action (core/sshChannel.ts). A Claude sign-in always needs the student's own
// password and code (the gate cannot sign a worker in): the session of a sign-in that just happened is
// held for it, or the sheet is shown again.

/** the providers in D3's order, made once */
function bridgeProviders(profile: SiteProfile | undefined): BridgeProvider[] {
  const relay = relayConfigFrom(profile);
  const key = relay ? relay.url : '-';
  if (mem.direct.providers?.key !== key) {
    mem.direct.providers = { key, list: [new StoreExtensionBridge(), new RelayBridge(relay, globalThis.WebSocket as unknown as WsLikeCtor | undefined), helperBridge()] };
  }
  return mem.direct.providers.list;
}

/** the grid's ssh door as the site profile names it (the bundled profile; Wayne State's pin by default) */
function doorOf(profile: SiteProfile | undefined): { host: string; port: number; pin: string } {
  const pin = typeof profile?.ssh_host_key === 'string' && /^SHA256:[A-Za-z0-9+/]{43}$/.test(profile.ssh_host_key) ? profile.ssh_host_key : GRID_HOST_KEY_PIN;
  const host = typeof profile?.ssh_host === 'string' && /^[a-z0-9.-]+$/.test(profile.ssh_host) ? profile.ssh_host : GRID_HOST;
  const port = Number.isInteger(profile?.ssh_port) && profile!.ssh_port! > 0 && profile!.ssh_port! < 65536 ? profile!.ssh_port! : GRID_PORT;
  return { host, port, pin };
}

async function profileNow(): Promise<SiteProfile | undefined> {
  const s = await settingsNow();
  return siteProfile(s?.site ?? DEFAULT_SITE);
}

/** probe the bridges in D3's order and keep what was found (session BRIDGE_KEY); "Helper found." when it answers for the first time */
async function probeBridges(): Promise<BridgeNote> {
  if (mem.direct.probingNow) return mem.direct.probingNow;
  mem.direct.probing = true;
  schedulePush();
  mem.direct.probingNow = (async () => {
    const before = await session.get<BridgeNote>(BRIDGE_KEY);
    const choice = await chooseBridge(bridgeProviders(await profileNow()));
    const p = (id: string) => choice.probes.find((x) => x.id === id);
    const helper = p('helper');
    const note: BridgeNote = {
      chosen: choice.chosen,
      store: 'not-available',
      relay: p('relay')?.state === 'available' ? 'available' : p('relay')?.state === 'not-configured' ? 'not-configured' : 'not-available',
      helper: helper ? (helper.state === 'available' ? 'available' : helper.state === 'not-installed' ? 'not-installed' : helper.state === 'broken' ? 'broken' : 'not-available') : before?.helper ?? 'not-available',
      ...(helper?.helper ? { helper_version: helper.helper.version, ...(helper.helper.os === 'windows' || helper.helper.os === 'mac' || helper.helper.os === 'linux' ? { helper_os: helper.helper.os } : {}), ...(helper.helper.kind === 'script' || helper.helper.kind === 'binary' ? { helper_kind: helper.helper.kind } : {}) } : {}),
      reach22: choice.chosen === before?.chosen ? before?.reach22 ?? 'unknown' : 'unknown',
      checked_at: nowIso(),
    };
    mem.direct.probeDetail = choice.probes.map((x) => `${x.id}: ${x.state} (${x.detail})`);
    await session.set(BRIDGE_KEY, note);
    if (note.chosen !== 'none' && (before?.chosen ?? 'none') === 'none') {
      mem.direct.foundAt = Date.now();
      mem.direct.unreachable = false;
      setTimeout(() => schedulePush(), FOUND_HOLD_MS + 50);
    }
    return note;
  })();
  try {
    return await mem.direct.probingNow;
  } finally {
    mem.direct.probingNow = undefined;
    mem.direct.probing = false;
    mem.direct.lastProbe = Date.now();
    schedulePush();
  }
}

/**
 * The direct way again (Settings' "Direct when possible", "Try the direct way again"): an earlier "Use
 * GlobalProtect instead" and its fallback no longer hold, the door is taken as unknown, and the bridges
 * are looked for (the probe, returned for whoever waits on it).
 */
async function directAgain(): Promise<{ probe: Promise<BridgeNote> }> {
  await writeDirect({}, ['vpn_chosen_at', 'fallback_seen_at']);
  mem.direct.unreachable = false;
  mem.direct.fallbackWanted = false;
  const probe = probeBridges();
  probe.catch(() => undefined);
  return { probe };
}

/** the chosen bridge's provider (probing first when nothing is known); a BridgeError when there is none */
async function chosenBridge(): Promise<BridgeProvider> {
  let note = await session.get<BridgeNote>(BRIDGE_KEY);
  if (!note) note = await probeBridges();
  const p = bridgeProviders(await profileNow()).find((x) => x.id === note!.chosen);
  if (!p) throw new BridgeError('not-installed', 'no bridge on this computer');
  return p;
}

/** this computer's key, as the facts need it (cached; re-read after any change) */
async function keyStateNow(force = false): Promise<KeyState> {
  if (!force && mem.direct.key && Date.now() - mem.direct.key.at < 30_000) return mem.direct.key.state;
  const state = await keyState(browserKeyring()).catch(() => ({ present: false, wrapped: false, locked: false, enrolled: false }) as KeyState);
  mem.direct.key = { at: Date.now(), state };
  return state;
}

/** which way the grid is reached now (steps.ts connectionMode on what is stored) */
async function modeNow(): Promise<'direct' | 'vpn' | 'setup'> {
  const prefs = await loadPrefs();
  const D = (await local.get<DirectNote>(DIRECT_KEY)) ?? {};
  const B = await session.get<BridgeNote>(BRIDGE_KEY);
  const k = await keyStateNow();
  return connectionMode({ direct: { ...directBase(prefs, D, B, k) } });
}

/** the part of DirectFacts connectionMode reads */
function directBase(prefs: Prefs, D: DirectNote, B: BridgeNote | undefined, k: KeyState): DirectFacts {
  return {
    pref: prefs.connection ?? 'direct',
    vpnChosen: !!D.vpn_chosen_at,
    bridge: B ? B.chosen : 'unknown',
    helper: { state: B ? (B.helper === 'available' ? 'available' : B.helper === 'not-installed' ? 'not-installed' : B.helper === 'broken' ? 'broken' : 'not-available') : 'unknown', ...(B?.helper_version ? { version: B.helper_version } : {}) },
    probing: mem.direct.probing,
    key: { present: k.present, wrapped: k.wrapped, locked: k.locked, enrolled: k.enrolled && (!D.account || !k.account || k.account === D.account), ...(k.keyType ? { keyType: k.keyType } : {}), ...(k.fingerprint ? { fingerprint: k.fingerprint } : {}) },
    unreachable: mem.direct.unreachable || B?.reach22 === 'no-route',
    ...(D.account ? { account: D.account } : {}),
    sheetWanted: mem.direct.sheetWanted,
    enrolledSeen: true,
    protectOffer: false,
    fallbackSeen: !!D.fallback_seen_at,
    links: { globalProtect: DIRECT_LINKS.globalProtect, gridCode: DIRECT_LINKS.gridCode, gridSite: 'https://ondemand.grid.wayne.edu/pun/sys/dashboard/' },
  };
}

/** the direct facts for the views */
async function directFacts(prefs: Prefs, profile: SiteProfile | undefined, settings: PortalSettings | undefined, now: number): Promise<DirectFacts> {
  const D = (await local.get<DirectNote>(DIRECT_KEY)) ?? {};
  const B = await session.get<BridgeNote>(BRIDGE_KEY);
  const R = await session.get<RouteNote>(ROUTE_KEY);
  const k = await keyStateNow();
  const base = directBase(prefs, D, B, k);
  const download = await helperDownloadNow();
  const enrolledAt = mem.direct.enrolledAt;
  return {
    ...base,
    ...(mem.direct.foundAt !== undefined && now - mem.direct.foundAt < FOUND_HOLD_MS + 500 ? { foundAt: mem.direct.foundAt } : {}),
    ...(mem.direct.downloadedAt !== undefined ? { downloadedAt: mem.direct.downloadedAt } : {}),
    ...(download ? { download } : {}),
    ...(mem.direct.sheet ? { sheet: mem.direct.sheet.state } : {}),
    ...(R ? { route: R.route } : {}),
    ...(enrolledAt !== undefined ? { enrolledAt } : {}),
    enrolledSeen: !!D.enrolled_seen_at && (!D.enrolled_at || D.enrolled_seen_at >= D.enrolled_at),
    protectOffer: (!!D.enrolled_at && !D.protect_offer_done_at && k.present && !k.wrapped) || (mem.direct.protectedAt !== undefined && now - mem.direct.protectedAt < PROTECTED_HOLD_MS),
    ...(mem.direct.protectOutcome ? { protectOutcome: mem.direct.protectOutcome } : {}),
    ...(mem.direct.probingByHand ? { probingByHand: true } : {}),
    ...(mem.direct.checkedByHand ? { checkedByHand: true } : {}),
    ...(mem.direct.unlockFailed ? { unlockFailed: true } : {}),
    // "Use GlobalProtect instead" wants the fallback moment even when no press waits
    ...(mem.direct.fallbackWanted && D.vpn_chosen_at && !D.fallback_seen_at ? { sheetWanted: true } : {}),
    links: {
      globalProtect: profile?.vpn_help_url || DIRECT_LINKS.globalProtect,
      gridCode: profile?.grid_2fa_help_url || DIRECT_LINKS.gridCode,
      gridSite: settings ? `${settings.origin}${DASHBOARD}` : `${profile?.ood_base_url ?? 'https://ondemand.grid.wayne.edu'}${DASHBOARD}`,
    },
  };
}

/** this computer's installer from the package's bridge manifest */
async function helperDownloadNow(): Promise<HelperDownload | undefined> {
  if (mem.direct.download !== undefined) return mem.direct.download || undefined;
  const os = await helperOs();
  const m = await bridgeManifest();
  const dl = helperDownloadFor(m, os, (p) => assetUrl(p));
  mem.direct.download = dl ?? null;
  return dl;
}

/** the direct portal: the gate's verbs over ssh with this computer's key */
async function sshPortal(): Promise<SshPortal> {
  const profile = await profileNow();
  const door = doorOf(profile);
  const key = `${door.host}:${door.port}|${door.pin}`;
  if (mem.direct.portal?.key === key) return mem.direct.portal.portal;
  const audit = new Audit(local, { revocation: async () => local.get<{ revoked: boolean; message: string }>(REVOKED_KEY) });
  const portal = new SshPortal({
    bridge: chosenBridge,
    identity: () => loadIdentity(browserKeyring()),
    account: async () => (await local.get<DirectNote>(DIRECT_KEY))?.account,
    audit,
    pin: door.pin,
    host: door.host,
    port: door.port,
  });
  mem.direct.portal?.portal.hold(false);
  mem.direct.portal = { key, portal };
  portal.hold([...mem.ports.values()].some((p) => p.surface === 'panel'));
  return portal;
}

async function writeDirect(patch: Partial<DirectNote>, drop: Array<keyof DirectNote> = []): Promise<DirectNote> {
  const cur = (await local.get<DirectNote>(DIRECT_KEY)) ?? {};
  const next: DirectNote = { ...cur, ...patch };
  for (const k of drop) delete next[k];
  await local.set(DIRECT_KEY, next);
  return next;
}

/** one gate `version` with the key: the Grid row, the account for the approval check, Claude Code's sign-in on the grid */
async function checkGridDirect(reason: string): Promise<'signed-in' | 'signed-out' | 'unreachable' | 'unknown'> {
  if (mem.busy.grid) return ((await session.get<GridNote>(GRID_KEY))?.session as 'signed-in' | 'signed-out' | 'unreachable' | undefined) ?? 'unknown';
  mem.busy.grid = true;
  mem.last.grid = Date.now();
  try {
    const before = (await session.get<GridNote>(GRID_KEY))?.session;
    const sp = await sshPortal();
    let word: 'signed-in' | 'signed-out' | 'unreachable';
    let account: string | undefined;
    try {
      const v = await sp.version();
      word = 'signed-in';
      account = v.account;
      mem.direct.unreachable = false;
      mem.direct.claude = v.claude;
    } catch (e) {
      const f = directFailureOf(e);
      mem.failDetail = `direct: ${f}: ${(e as Error).message}`;
      if (f === 'locked') {
        word = 'signed-out';
      } else if (f === 'key-refused' || f === 'key-expired' || f === 'no-key') {
        // the grid no longer takes this key: the next press asks for a sign-in, which enrols it again
        word = 'signed-out';
        await markNotEnrolled();
      } else if (f === 'no-bridge') {
        await probeBridges();
        word = 'unreachable';
      } else {
        word = 'unreachable';
        mem.direct.unreachable = true;
      }
    }
    await writeGrid({ session: word, ...(word === 'unreachable' ? {} : { reach: 'answers' }), ...(account ? { account } : {}) });
    // the door's answer through the bridge, for Details and the fallback (a key refused still means the door answered)
    const B = await session.get<BridgeNote>(BRIDGE_KEY);
    if (B) await session.set(BRIDGE_KEY, { ...B, reach22: word === 'unreachable' ? (mem.direct.unreachable ? 'no-route' : B.reach22) : 'answers' } satisfies BridgeNote);
    if (account) {
      await local.set(IDENTITY_KEY, { username: account, seen_at: nowIso() } satisfies IdentityNote);
      const t = await local.get<TermsRecord>(TERMS_KEY);
      if (recordInForce(t) && !t.bound_account) await local.set(TERMS_KEY, bindAccount(t, account));
    }
    if (word === 'signed-in' && before !== 'signed-in') void onSignedIn(reason);
    schedulePush();
    return word;
  } finally {
    mem.busy.grid = false;
  }
}

/** the grid no longer takes this computer's key (refused, expired, or forgotten elsewhere) */
async function markNotEnrolled(): Promise<void> {
  const r = await browserKeyring().store.get().catch(() => undefined);
  if (r?.enrolled_at) {
    const { enrolled_at: _e, ...rest } = r;
    await browserKeyring().store.put(rest as typeof r);
  }
  await writeDirect({}, ['enrolled_at']);
  await keyStateNow(true);
}

/** the sheet, made for its purpose (a Claude sign-in when a press waits on one) */
function sheetFlow(purpose: 'enrol' | 'claude'): SignInFlow {
  const cur = mem.direct.sheet;
  if (cur && (cur.state.phase === 'prompt' || cur.state.phase === 'working' || cur.state.phase === 'connecting')) return cur;
  if (cur && cur.state.purpose === purpose && !cur.holding()) return cur;
  cur?.dispose();
  const flow = new SignInFlow(
    {
      bridge: chosenBridge,
      keyring: browserKeyring(),
      sharedDir: sharedDirNow,
      site: async () => {
        const s = await settingsNow();
        return s && (await siteProfile(s.site)) ? s.site : undefined;
      },
      verify: async (account, identity) => {
        // a second connection, made with the new key for the account the grid just accepted (nothing is
        // recorded yet, so this portal is the check's own and is dropped after it)
        mem.direct.portal = undefined;
        await keyStateNow(true);
        const door = doorOf(await profileNow());
        const audit = new Audit(local, { revocation: async () => local.get<{ revoked: boolean; message: string }>(REVOKED_KEY) });
        const check = new SshPortal({ bridge: chosenBridge, identity: async () => identity, account: async () => account, audit, pin: door.pin, host: door.host, port: door.port });
        return check.version();
      },
      changed: () => schedulePush(),
      audit: new Audit(local, { revocation: async () => local.get<{ revoked: boolean; message: string }>(REVOKED_KEY) }),
      refusals: {
        get: async (account) => ((await session.get<RefusalNote>(REFUSALS_KEY)) ?? {})[account],
        set: async (account, note) => {
          const all = (await session.get<RefusalNote>(REFUSALS_KEY)) ?? {};
          await session.set(REFUSALS_KEY, { ...all, [account]: note } satisfies RefusalNote);
        },
        clear: async (account) => {
          const all = (await session.get<RefusalNote>(REFUSALS_KEY)) ?? {};
          if (!(account in all)) return;
          delete all[account];
          await session.set(REFUSALS_KEY, all);
        },
      },
      ...(() => {
        const door = doorOf(mem.profile?.profile);
        return { pin: door.pin, host: door.host, port: door.port };
      })(),
    },
    purpose,
    undefined,
  );
  mem.direct.sheet = flow;
  return flow;
}

/** the sheet's AccessID: the sign-in starts; when it ends well the account is recorded and the waiting press carries on */
async function signinAccount(account: string): Promise<ActionResults['grid-signin-account']> {
  const note = await session.get<BridgeNote>(BRIDGE_KEY);
  if (!note || note.chosen === 'none') {
    const n = await probeBridges();
    if (n.chosen === 'none') return { started: false, error: 'no-bridge' };
  }
  const press = await session.get<PendingPress>(PRESS_KEY);
  const purpose = mem.direct.claudeWanted || press?.kind === 'sign-in-claude' ? 'claude' : 'enrol';
  const flow = sheetFlow(purpose);
  if (flow.state.phase === 'prompt' || flow.state.phase === 'working') return { started: false, error: 'busy' };
  if (!flow.start(account)) return { started: false, error: 'account' };
  void flow.done().then((out) => (out ? onSheetDone(flow, out) : onSheetEnded(flow)));
  return { started: true };
}

async function onSheetEnded(flow: SignInFlow): Promise<void> {
  // three refusals: Try again comes back by itself once the cooldown has passed
  const at = flow.state.phase === 'stopped' ? flow.state.retryAt : undefined;
  if (at !== undefined && at > Date.now()) setTimeout(() => schedulePush(), Math.min(at - Date.now() + 100, 20 * 60_000));
  // for Details and "Copy details" only
  if (flow.state.detail) mem.failDetail = `direct sign-in: ${flow.state.failure ?? flow.state.phase}: ${flow.state.detail}`;
  schedulePush();
}

/** the grid accepted the sign-in and the key works: the account is recorded, then the approval check, then the waiting press */
async function onSheetDone(flow: SignInFlow, out: SignInOutcome): Promise<void> {
  const k = await keyStateNow(true);
  const now = nowIso();
  await writeDirect({ account: out.account, account_recorded_at: now, enrolled_at: now, ...(k.fingerprint ? { key_fp: k.fingerprint } : {}) }, ['vpn_chosen_at']);
  await session.remove(ROUTE_KEY);
  mem.direct.enrolledAt = Date.now();
  mem.direct.sheetWanted = false;
  mem.direct.unreachable = false;
  mem.direct.claude = out.version.claude;
  mem.direct.portal = undefined;
  if (out.setupReady) mem.setup = { state: 'ready' };
  await activity(LOG_WORDS.directSignedIn(out.account));
  await activity(LOG_WORDS.computerSetUp);
  await writeGrid({ session: 'signed-in', reach: 'answers', account: out.account });
  await local.set(IDENTITY_KEY, { username: out.account, seen_at: now } satisfies IdentityNote);
  const t = await local.get<TermsRecord>(TERMS_KEY);
  if (recordInForce(t) && !t.bound_account) await local.set(TERMS_KEY, bindAccount(t, out.account));
  setTimeout(() => schedulePush(), ENROLLED_HOLD_MS + 50);
  schedulePush();
  // the approval check goes only now, after the grid accepted the account
  await checkAccessNow('signin');
  if (mem.setup.state !== 'ready') mem.setup = { state: 'ready', detail: 'direct: connect sets the account up itself if it must' };
  void flow;
  await carryPress();
  void pollRun(true);
}

/** "Forget this computer": the grid's line through the gate (when it can be reached), then the key here */
async function forgetComputer(): Promise<ActionResults['forget-computer']> {
  let onGrid: ActionResults['forget-computer']['onGrid'] = 'not-reached';
  const k = await keyStateNow(true);
  if (k.present && k.enrolled && !k.locked) {
    try {
      // a refused floor (a shell-class line a moment ago) is waited out, never taken for "not reached"
      const sp = await sshPortal();
      const r = await withFloor(() => sp.forget());
      onGrid = r === 'stuck' ? 'not-reached' : r;
    } catch {
      onGrid = 'not-reached';
    }
  }
  mem.direct.sheet?.dispose();
  mem.direct.sheet = undefined;
  mem.direct.portal?.portal.hold(false);
  mem.direct.portal = undefined;
  await forgetKey(browserKeyring()).catch(() => undefined);
  await keyStateNow(true);
  await writeDirect({}, ['enrolled_at', 'key_fp', 'protect_offer_done_at', 'enrolled_seen_at']);
  mem.direct.enrolledAt = undefined;
  if ((await modeNow()) !== 'vpn') await writeGrid({ session: 'unknown' });
  await activity(LOG_WORDS.computerForgotten);
  return { forgotten: true, onGrid };
}

/** the Claude sign-in sitting on the direct way: in the held session of a sign-in that just happened, else the sheet first */
async function startSshSitting(id: number, line: string, login: LoginMode): Promise<boolean> {
  const flow = mem.direct.sheet;
  if (!flow || !flow.holding()) {
    // a sign-in first; the press waits for it and carries on by itself
    mem.connect = { ...mem.connect, inFlight: false };
    mem.direct.claudeWanted = true;
    mem.direct.sheetWanted = true;
    await session.set(PRESS_KEY, { kind: login === 'auto' || login === 'never' ? 'connect' : 'sign-in-claude', ...(login === 'fresh' ? { fresh: true } : {}), at: nowIso() } satisfies PendingPress);
    const f = sheetFlow('claude');
    if (f.state.phase === 'done' || f.state.phase === 'failed' || f.state.phase === 'stopped') f.cancel();
    schedulePush();
    return false;
  }
  mem.direct.claudeWanted = false;
  let registered = false;
  const early: ConnectEvent[] = [];
  const watcher = new ConnectWatcher((ev) => (registered ? void onConnectEvent(id, ev) : void early.push(ev)));
  let shell: ShellSession;
  try {
    // the floor's wait is given up the moment the start is (Stop, Cancel, another sign-in)
    shell = await withFloor(() => flow.openSitting(line, (text) => watcher.feed(text)), undefined, () => mem.startId === id);
  } catch (e) {
    mem.connect = { ...mem.connect, inFlight: false, failure: 'closed' };
    mem.failDetail = (e as Error).message;
    schedulePush();
    return false;
  }
  if (mem.startId !== id || mem.sitting) {
    shell.close();
    if (mem.startId !== id) mem.connect = { ...mem.connect, inFlight: false };
    schedulePush();
    return false;
  }
  const gate = new CodeGate((input) => shell.send(input));
  mem.sitting = { id, mode: 'ssh', login, gate, close: () => shell.close() };
  registered = true;
  for (const ev of early.splice(0)) await onConnectEvent(id, ev);
  void shell.done.then((end) => {
    if (mem.direct.sheet === flow) {
      mem.direct.sheet = undefined;
      flow.dispose();
    }
    void onSittingEnd(id, end.reason, watcher.tail);
  });
  return true;
}

/** connect through the gate (--login never): its step lines are read as a sitting's would be */
async function startGateConnect(id: number, opts: ConnectOptions): Promise<boolean> {
  const sp = await sshPortal();
  const gate = new CodeGate(() => undefined);
  mem.sitting = { id, mode: 'ssh', login: 'never', gate, close: () => undefined };
  let r: { lines: string[]; exitStatus: number | null };
  try {
    r = await withFloor(() => sp.connectGate({ name: opts.name, site: opts.site, ...(opts.installId ? { installId: opts.installId } : {}), permissionMode: opts.permissionMode, chain: opts.chain }), undefined, () => mem.startId === id);
  } catch (e) {
    const f = directFailureOf(e);
    mem.failDetail = `direct connect: ${f}: ${(e as Error).message}`;
    if (f === 'key-refused' || f === 'key-expired') await markNotEnrolled();
    if (f === 'unreachable' || f === 'timeout' || f === 'dropped') mem.direct.unreachable = f === 'unreachable';
    // the gate's caps and an old copy have their own sentences (steps.ts connectProblem)
    const own: ConnectFailure | undefined =
      f === 'old-copy' ? 'old-copy' : f === 'limit' ? ((e as DirectError).limit === 'names' ? 'limit-names' : (e as DirectError).limit === 'hourly' ? 'limit-hourly' : 'limit-busy') : undefined;
    void onSittingEnd(id, 'closed', []).then(() => {
      if (own && mem.startId === id) {
        mem.connect = { ...mem.connect, inFlight: false, failure: own };
        schedulePush();
      }
    });
    return false;
  }
  const watcher = new ConnectWatcher((ev) => void onConnectEvent(id, ev));
  watcher.feed(r.lines.join('\n') + '\n');
  void onSittingEnd(id, 'closed', watcher.tail);
  return true;
}

/** the run's files on the direct way: one connection (the held one while the panel is open), one read per file */
async function pollRunDirect(want: { progress?: boolean }): Promise<void> {
  const sp = await sshPortal();
  const prefs = await loadPrefs();
  let snap = await session.get<RunState>(RUN_KEY);
  if (!snap) {
    if (mem.connect.inFlight || mem.sitting || mem.startId) return;
    const dir = await sharedDirNow();
    if (!dir) return;
    const sj = await statusByShell(sp, dir, prefs.worker_name).catch(() => undefined);
    if (!sj || !sj.job || !sj.state_dir) return;
    const found: RunState = { stateDir: sj.state_dir, run: sj.run || prefs.worker_name, job: String(sj.job), set_at: nowIso(), started_by: 'found', ...(sj.next_job ? { next_job: String(sj.next_job) } : {}) };
    snap = await mutateRun((cur) => (cur ? undefined : found));
    if (!snap) return;
  }
  const detailsOpen = [...mem.ports.values()].some((p) => p.surface === 'details');
  const st = snap.status?.state;
  const files: GateFile[] = ['status.json'];
  if (!environmentLinkOf(snap) || st === 'online' || st === 'running') files.push('connection.json');
  if (!snap.node) files.push('node');
  if (mem.logOpen || detailsOpen || want.progress) files.push('progress.log');
  // rc.log (the worker's raw terminal) is not one of the gate's files: on the direct way the link comes from connection.json and status.json
  let read: Partial<Record<GateFile, string>>;
  try {
    read = await sp.readRun(snap.run, files);
  } catch (e) {
    const f = directFailureOf(e);
    if (f === 'key-refused' || f === 'key-expired') {
      await markNotEnrolled();
      await writeGrid({ session: 'signed-out' });
    } else if (f === 'unreachable' || f === 'timeout') await writeGrid({ session: 'unreachable' });
    const why = (e as Error).message;
    await mutateRun((cur) => (sameRun(cur, snap) ? { ...cur!, error: why } : undefined));
    return;
  }
  const mtime = Math.floor(Date.now() / 1000);
  // the account's ~/.bashrc may print before the gate's bytes: the JSON is found after it, node is its last line
  const status = parseGateJson<StatusFile>(read['status.json']);
  const connection = parseGateJson<ConnectionFile>(read['connection.json']);
  const node = gateText(read.node, 'node');
  const progress = gateText(read['progress.log'], 'progress.log');
  const run = await mutateRun((cur) => {
    if (!sameRun(cur, snap)) return undefined;
    let r = cur!;
    // the gate's read has no modified time: the heartbeat is the file's own, the read's moment only proof of a new one (facts.ts applyStatusRead)
    if (status) r = applyStatusRead(r, status, mtime).run;
    if (connection) r = applyConnection(r, connection, mtime).run;
    if (node) r = { ...r, node_mtime: mtime, node: node.slice(0, 100) };
    if (progress !== undefined) r = { ...r, progress_tail: progress.split('\n').filter(Boolean).slice(-40), progress_mtime: mtime };
    return { ...r, listed_at: nowIso(), error: undefined };
  });
  if (run) await afterRead();
}

/** Settings' "Connection" */
async function connectionSettings(prefs: Prefs): Promise<ConnectionSettingsView> {
  const W = WORDS.direct.settings;
  const k = await keyStateNow();
  const B = await session.get<BridgeNote>(BRIDGE_KEY);
  const download = await helperDownloadNow();
  const installed = B?.helper === 'available';
  return {
    title: W.title,
    mode: { label: W.modeLabel, value: prefs.connection ?? 'direct', options: [{ value: 'direct', label: W.modes.direct }, { value: 'vpn', label: W.modes.vpn }] },
    protectKey: { label: W.protectKey, note: W.protectKeyNote, value: k.wrapped, available: mem.direct.protectOutcome !== 'unsupported', present: k.present, ...(k.present && !k.wrapped ? { laterNote: W.protectLaterNote } : {}) },
    keyLine: !k.present ? W.keyNone : k.wrapped ? W.keyProtected : W.keyPlain,
    forget: { label: W.forget, note: W.forgetNote, confirm: W.forgetConfirm, button: { label: W.forgetButton, tone: 'text', action: { kind: 'forget-computer' } }, disabled: !k.present, ...(k.locked && k.enrolled ? { locked: true } : {}) },
    helper: { label: W.helper, text: installed && B?.helper_version ? W.helperInstalled(B.helper_version) : W.helperMissing, installed, ...(download ? { download } : {}), checkAgain: { label: WORDS.direct.installHelper.checkAgain, tone: 'text', action: { kind: 'check-bridge' } } },
  };
}

/** Details' direct section, for the lab lead */
async function directDetails(): Promise<DirectDetails> {
  const profile = await profileNow();
  const door = doorOf(profile);
  const mode = await modeNow();
  const k = await keyStateNow();
  const B = await session.get<BridgeNote>(BRIDGE_KEY);
  const D = (await local.get<DirectNote>(DIRECT_KEY)) ?? {};
  const dl = await helperDownloadNow();
  return {
    mode: mode === 'direct' ? 'direct (ssh through a bridge, the browser key, the gate)' : mode === 'vpn' ? 'vpn (11.0.0: the portal through GlobalProtect)' : 'setup (the direct way needs the student)',
    bridges: mem.direct.probeDetail ?? (B ? [`chosen: ${B.chosen}`, `relay: ${B.relay}`, `helper: ${B.helper}${B.helper_version ? ` (${B.helper_version}, ${B.helper_kind ?? '-'}, ${B.helper_os ?? '-'})` : ''}`] : ['not probed yet']),
    pin: door.pin,
    host: `${door.host}:${door.port}`,
    key: k.present ? `${k.keyType ?? k.alg ?? '?'} ${k.fingerprint ?? ''}, protected: ${k.wrapped ? 'yes' : 'no'}${k.locked ? ' (locked)' : ''}, enrolled: ${k.enrolledAt ?? 'no'}` : 'none',
    reach: B ? `${B.reach22} (${B.checked_at})` : 'not checked',
    ...(D.account ? { account: D.account } : {}),
    ...(dl ? { helperFile: `${dl.file}${dl.bytes ? ` ${dl.bytes} bytes` : ''}${dl.sha256 ? ` sha256 ${dl.sha256}` : ''}` } : {}),
    unproven: WORDS.details.directUnproven,
  };
}

// ---- Details ------------------------------------------------------------------------------------------

async function runChecks(): Promise<boolean> {
  if (mem.checksRunning) return false;
  mem.checksRunning = true;
  schedulePush();
  try {
    const settings = await settingsNow();
    const client = await directClient();
    const ctx: DiagCtx = {
      env: {
        version: version(),
        now: () => new Date(),
        local,
        session,
        hasOriginPermission: (o) => connectApi.containsOrigin(o),
        portal: () => client,
      },
      ...(settings ? { settings } : {}),
      prefs: await loadPrefs(),
      cache: {},
    };
    const rep = await runDiagnostics(buildNodes(), ctx, { timeoutMs: 60_000 });
    await session.set(CHECKS_KEY, rep);
    return true;
  } finally {
    mem.checksRunning = false;
    schedulePush();
  }
}

/** "Check a compute node": the probe job, Details only */
async function checkComputeNode(): Promise<boolean> {
  try {
    const r = await withShell((p) => withFloor(() => p.shell(commands.probe(), { timeoutMs: 90_000 })));
    const job = parseJobId(r.output);
    if (job) await local.set(PROBE_KEY, { submitted_at: nowIso(), job } satisfies ProbeNote);
    return !!job;
  } catch {
    return false;
  }
}

/** "Copy details": the reason for the lab lead, in the tool's own words (Details-grade text) */
async function detailsText(): Promise<string> {
  const s = await settingsNow();
  const ch = await channelNow();
  const grid = await session.get<GridNote>(GRID_KEY);
  const run = await session.get<RunState>(RUN_KEY);
  return [
    `Beethoven ${version()} at ${s?.hostname ?? 'no portal'} (site profile ${s?.site ?? '-'}), account ${grid?.account ?? '-'}`,
    `channel: ${ch ? `${ch.mode}, shell ${ch.shell}` : 'not tested'}`,
    `setup: ${mem.setup.state}${mem.setup.detail ? ` (${mem.setup.detail})` : ''}`,
    `direct way: ${await modeNow()}; bridge ${(await session.get<BridgeNote>(BRIDGE_KEY))?.chosen ?? 'not probed'}; key ${(await keyStateNow()).present ? 'present' : 'none'}`,
    `last failure: ${mem.connect.failure ?? 'none'}${mem.failDetail ? `: ${mem.failDetail}` : ''}`,
    run ? `run: ${run.run} job ${run.job}${run.status ? ` state ${run.status.state}` : ''}` : 'run: none',
  ].join('\n');
}

