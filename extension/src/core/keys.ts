// Every storage key in one place, split by where it lives and how long it lasts.
//
// storage.local (survives restarts; nothing secret and no credential ever):
export const PORTAL_KEY = 'bridge.portal'; //   {origin, hostname, connected_at, shell_host, site}
export const PREFS_KEY = 'bridge.prefs'; //      {worker_name, permission_mode, auto_start, open_claude_on_connect}
export const KILLLIST_KEY = 'bridge.killlist'; // the last verified kill-list, {fetched_at, list}
export const REVOKED_KEY = 'bridge.revoked'; //  {revoked, message}: what the chokepoint consults before a command
export const ACCESS_KEY = 'bridge.access'; //    the access service's last word on this account at this portal (licensing/access.ts AccessRecord)
export const SERVICES_KEY = 'bridge.services'; // services.json as last read, {fetched_at, access_check, request_page}
export const INSTALL_ID_KEY = 'bridge.install_id'; // 32 random hex characters, made once per installation (ext/storage.ts installId); sent in the approval check
export const IDENTITY_KEY = 'bridge.identity'; // {username, seen_at}: the account name the portal's dashboard last showed for the signed-in session (never typed)
export const CHECKLIST_KEY = 'bridge.checklist'; // {drive_connected_at}: the student's own "done" ticks for steps outside this extension
export const STATEMENTS_KEY = 'bridge.statements'; // {[workspaces/<name>]: Acknowledgement}: the data statement, per workspace, with the text version it was made on
export const OPENED_KEY = 'bridge.opened'; //    {urls: [...]}: environment links this browser profile already opened by itself
export const LOGIN_SEEN_KEY = 'bridge.loginSeen'; // {at, detail}: when the login terminal in this browser last reported SIGNED-IN
export const PROBE_KEY = 'bridge.probe'; //      {submitted_at, job}: the probe job the strip submitted by itself, so it is not submitted again while it runs
export const INSTALL_KEY = 'bridge.install'; //  {attempted_at, ok, detail, dir, note}: the last install, so Details can say which copy it set up, or why the lab's could not be used
// 11.0.0 (docs/V11_CONTRACT.md, "Storage"); each is named in PRIVACY.md version 9:
export const LAST_KNOWN_KEY = 'bridge.lastKnown'; // LastKnown: the worker's last known state, title, link and when, so the panel shows it at once and "Open my session" works with no grid
export const CHANNEL_KEY = 'bridge.channel'; //      ChannelNote: how this browser reaches the portal ("direct" from the background, or "tab")
export const WAIT_HISTORY_KEY = 'bridge.waits'; //  WaitHistory: the last five waits for a computer, in whole minutes ("Last time: 6 min.")
export const TOUR_SEEN_KEY = 'bridge.tourSeen'; //  TourSeen: that the tour was seen
export const ONCE_KEY = 'bridge.once'; //            OnceNotes: which one-time tips were shown or dismissed (pin tip, Try asking, the tour card, the New session toast)
// 12.0.0 (docs/V12_CONTRACT.md, "Storage"); each is named in PRIVACY.md version 10:
export const DIRECT_KEY = 'bridge.direct'; //          DirectNote: the direct way on this computer: the account the grid accepted, when this computer's key was enrolled, its fingerprint, the student's choice of GlobalProtect, the one-time protection card
// The browser's key itself is NOT in storage.local: it lives in IndexedDB ('beethoven-key', core/keyring.ts KEY_DB), as a
// key wrapped by a non-extractable browser key (the default) or by the student's passkey (opt-in), never in the clear.
// TERMS_KEY ('bridge.terms') and TERMS_HISTORY_KEY ('bridge.termsHistory', the earlier acceptance records, kept out of force) are in terms.ts; AUDIT_KEY ('bridge.audit') in audit.ts.
//
// storage.session (cleared when the browser closes):
export const PORTAL_TAB_KEY = 'bridge.portalTab'; // {tabId, origin}: the tab whose page script answers
export const RUN_KEY = 'bridge.run'; //             {stateDir, run, job, site, status, connection, rc_tail, updated, error}
export const CHECKS_KEY = 'bridge.checks'; //       the last diagnostics report
export const SESSION_SEEN_KEY = 'bridge.sessionSeen'; // {checked_at}: when check 4 last passed
export const AUTO_START_KEY = 'bridge.autoStart'; // {attempted_at, outcome}: what the last automatic start did
export const CLICK_KEY = 'bridge.click'; //         {tabId, origin, path, looksLikeOod, granted, at}: the tab the toolbar button was last clicked from (10.0.0; unused from 11.0.0)
// 11.0.0:
export const SIGNIN_TAB_KEY = 'bridge.signinTab'; //  OpenedTab: the grid sign-in tab Beethoven opened or navigated (the welcome tab, or one opened for a press)
export const ANTHROPIC_TAB_KEY = 'bridge.anthropicTab'; // AnthropicTab: Anthropic's sign-in tab Beethoven opened, and whether it has started a new load since the paste
export const CLAUDE_TAB_KEY = 'bridge.claudeTab'; //  OpenedTab: the claude.ai tab Beethoven opened for "Open my session" (session storage: a tab id means nothing after a restart)
export const TERMINAL_TAB_KEY = 'bridge.terminalTab'; // OpenedTab: the grid's terminal tab Beethoven opened for the one-time key step (AM2)
export const ACTIVITY_KEY = 'bridge.activity'; //     ActivityEntry[]: Beethoven's own plain-words events for Show log, oldest first, at most ACTIVITY_MAX
export const GRID_KEY = 'bridge.grid'; //             GridNote: whether the grid answers and whether the browser holds a grid sign-in, as last checked
export const PRESS_KEY = 'bridge.press'; //           PendingPress: a press kept until the grid can carry it ("Connecting when ready…")
export const WELCOME_PRESS_KEY = 'bridge.welcomePress'; // {at}: the welcome page's "Agree and continue" was pressed, written inside the click before Chrome asks, so the panel opening beside it can say "Almost there." instead of "not accepted yet"
// 12.0.0:
export const BRIDGE_KEY = 'bridge.bridges'; //        BridgeNote: what the last probe of the bridges found (which one is used, the helper's version) and whether the grid answered on its ssh port
export const KEY_UNLOCK_KEY = 'bridge.keyUnlock'; //  {secret}: only while the key is protected by a passkey and was unlocked this browser session: the passkey's output that opens it (memory only, never on disk; never readable by a page script)
export const ROUTE_KEY = 'bridge.route'; //           RouteNote: the 2FA route the student chose (laptop or phone) while the code setup is shown
export const REFUSALS_KEY = 'bridge.refusals'; //     RefusalNote: per AccessID, how many sign-ins the grid refused in a row and when the last was (so three refusals stop the sheet for a cooldown, across Try again); never a password or code

export interface PortalSettings {
  origin: string;
  hostname: string;
  connected_at: string;
  /** the Shell app host segment; "default" lets the portal pick */
  shell_host: string;
  /** the site profile name handed to `hpcworker install --profile` and used in the session name */
  site: string;
}

export interface Prefs {
  /** the worker's name: its run directory and workspace are named after it (hpcworker worker start --name) */
  worker_name: string;
  /** Settings, "Your worker": "Ask before each command" (default) / "Accept edits" (acceptEdits) / "Plan only" (plan) */
  permission_mode: 'default' | 'acceptEdits' | 'plan';
  /**
   * 11.0.0: "Keep my worker running" (the stored name is kept so a 10.0.0 profile carries over): the
   * always-on chain (off adds --no-chain to connect), plus a start through connect when the grid
   * sign-in is seen and the worker ended without the student's Stop. Never opens a tab by itself;
   * a stopped or failed worker is never started this way. (10.0.0: "start my worker when I open my portal".)
   */
  auto_start: boolean;
  /** 11.0.0: "Open Claude when my worker is ready": opens the environment link once, only for a Connect the student pressed */
  open_claude_on_connect: boolean;
  /** 11.0.0: Settings, "Appearance": "Cream" (cream, the default whatever the system says) / "Match system" (system). Optional so a 10.0.0 profile reads as cream. */
  appearance?: Appearance;
  /** 12.0.0: Settings, "Connection": "Direct when possible" (direct, the default; absent reads as direct) / "GlobalProtect only" (vpn) */
  connection?: 'direct' | 'vpn';
}

/** <html data-theme>: "cream" always light; "system" follows prefers-color-scheme */
export type Appearance = 'cream' | 'system';

// ---- 11.0.0 storage shapes ------------------------------------------------------------------------

/** the hero state names the core computes (model.ts HeroState), as stored */
export type KnownState = 'asked' | 'queued' | 'starting' | 'needs-you' | 'online' | 'renewing' | 'stopped' | 'error' | 'unknown';

/**
 * LAST_KNOWN_KEY (local). What the panel shows the moment it opens, before any live check, and what
 * "Open my session" needs with no grid and no VPN. Written on every state change the background sees.
 * Nothing secret: the link is the student's own claude.ai address.
 */
export interface LastKnown {
  /** the worker's name this belongs to */
  worker_name: string;
  state: KnownState;
  /** the session title ("Wayne State grid") */
  title?: string;
  /**
   * the worker's link, either form since 14.0.0: https://claude.ai/code?environment=env_…, or the session link
   * https://claude.ai/code/session_… Claude Code prints when it resumes a session (claude.com for either). Only a link
   * contract.ts isClaudeCodeLink takes is stored (it comes from facts.ts claudeLinkOf), and it is checked again before it
   * is opened. The name is 11.0.0's, kept so a record stored by 13.0.0 still reads.
   */
  environment_url?: string;
  /**
   * 14.0.0: an environment link the run reported with it (steps.ts newSessionLinkOf), where New session opens; absent when
   * only a resumed session's own link was reported. It may differ from environment_url, which holds the run's own link.
   */
  new_session_url?: string;
  /** when this state was seen (ISO): "As of 9:02 AM" */
  seen_at: string;
  /** status.json online_at of the job last seen online: "up 2 h 14 min" */
  online_since?: string;
  /** status.json ends_at, when the chain is on: "Renews itself at 4:50 PM" */
  ends_at?: string;
  /** the AccessID the grid showed with it */
  account?: string;
}

/** CHANNEL_KEY (local): the channel test's verdict, per portal origin */
export interface ChannelNote {
  origin: string;
  /** "direct": the background's own requests carry the browser's grid sign-in; "tab": they do not, so actions run through a portal tab */
  mode: 'direct' | 'tab';
  /** the portal's shell reached a prompt without a password ("ok"), or asked for one ("password": the one-time key step, AM2) */
  shell: 'ok' | 'password' | 'unknown';
  tested_at: string;
}

/** WAIT_HISTORY_KEY (local): whole minutes from submitted_at to got_computer_at, newest last, at most five; only for a Connect the student pressed */
export interface WaitHistory {
  minutes: number[];
}

/** TOUR_SEEN_KEY (local) */
export interface TourSeen {
  seen_at: string;
  /** played to its end (true) or skipped (false) */
  completed: boolean;
}

/** ONCE_KEY (local): one-time cards and toasts */
export interface OnceNotes {
  /** the first time this browser saw the worker online: "Try asking" shows for 3 days from here */
  first_online_at?: string;
  try_asking_dismissed_at?: string;
  pin_tip_shown_at?: string;
  /** the pin tip changed to "Pinned." (action.onUserSettingsChanged) or was dismissed */
  pin_tip_done_at?: string;
  tour_card_dismissed_at?: string;
  /** the once-only tour began playing below the queue (its card is then not offered on the first online home) */
  tour_auto_played_at?: string;
  /** "Start a new session there. It runs on your worker." was shown */
  new_session_tip_at?: string;
}

/** SIGNIN_TAB_KEY, CLAUDE_TAB_KEY, TERMINAL_TAB_KEY (session): a tab Beethoven opened or navigated itself, so it may bring it forward or close it */
export interface OpenedTab {
  tabId: number;
  windowId: number;
  /** the URL Beethoven loaded; the tab is closed only while tabs.get still shows it on this origin (and path, for the terminal) */
  url: string;
  opened_at: string;
  /** "welcome": the welcome tab, navigated to the grid; "press": opened for a press; "session": claude.ai; "terminal": the grid's terminal (AM2); "anthropic": Anthropic's sign-in page (ANTHROPIC_TAB_KEY) */
  purpose: 'welcome' | 'press' | 'session' | 'terminal' | 'anthropic';
  /** the tab that was in front before, to return focus to */
  return_tab_id?: number;
  /** tabs.onUpdated status "loading" events seen after Beethoven's own load completed (claude.ai: bring forward only while 0) */
  loads_after?: number;
  /** Beethoven's own load completed (status "complete" seen once) */
  loaded?: boolean;
}

/** ANTHROPIC_TAB_KEY (session) */
export interface AnthropicTab extends OpenedTab {
  /** when the student's code was typed into the sitting; the tab is closed on SIGNED-IN only while loads_since_paste is 0 */
  pasted_at?: string;
  loads_since_paste?: number;
}

/** ACTIVITY_KEY (session): one Show log line from Beethoven itself (the worker's own lines come from progress.log) */
export interface ActivityEntry {
  /** ISO-8601 */
  at: string;
  /** the plain words, from model.ts LOG_WORDS; never a job id, node, path or shell output */
  text: string;
}

/** at most this many ActivityEntry are kept (oldest dropped) */
export const ACTIVITY_MAX = 200;

/** GRID_KEY (session): the last reachability and sign-in checks */
export interface GridNote {
  /** the credential-free no-cors request: the grid answered, or there was no route (GlobalProtect off), or not asked yet */
  reach: 'answers' | 'no-route' | 'unknown';
  /** the background GET of the dashboard: 200 with "Logged in as" (signed-in), 401 or a redirect off the origin (signed-out), a network error or 5 s timeout (unreachable) */
  session: 'signed-in' | 'signed-out' | 'unreachable' | 'unknown';
  /** the AccessID the dashboard showed */
  account?: string;
  checked_at: string;
}

/** PRESS_KEY (session): a press that waits for the grid (sign-in, approval, setup, or the one-time key step) and goes ahead by itself */
export interface PendingPress {
  kind: 'connect' | 'stop' | 'sign-in-claude' | 'restrict' | 'open-files';
  /** "Use another account": connect --login fresh */
  fresh?: boolean;
  at: string;
}

/** the account name the portal's dashboard showed ("Logged in as <name>"), and when; the only identity the extension ever uses */
export interface IdentityNote {
  username: string;
  seen_at?: string;
}

export interface Checklist {
  /** when the student ticked "Google Drive is connected in claude.ai" */
  drive_connected_at?: string;
}

export interface AutoStartNote {
  attempted_at: string;
  outcome: string;
}

export interface LoginSeen {
  /** when the login terminal reported SIGNED-IN in this browser */
  at: string;
  detail?: string;
}

export interface ProbeNote {
  submitted_at: string;
  job?: string;
}

export interface InstallNote {
  attempted_at: string;
  ok: boolean;
  detail: string;
  /** the shared folder the site profile names, when it names one */
  dir?: string;
  /** one line for Details when the lab's shared copy could not be used (builds up to 7.0.0 wrote it when they put the tool in the student's own account instead) */
  note?: string;
}

export interface OpenedLinks {
  urls: string[];
}

/** the tab the toolbar button was clicked from, for the strip's first step */
export interface ClickNote {
  tabId: number;
  origin: string;
  path: string;
  looksLikeOod: boolean;
  granted: boolean;
  at: string;
}

// ---- 12.0.0 storage shapes ------------------------------------------------------------------------

/**
 * DIRECT_KEY (local). Nothing secret: no password, no code, no key material (the key is in IndexedDB,
 * wrapped). The account is recorded only after the grid accepted a sign-in with it.
 */
export interface DirectNote {
  /** the AccessID the grid accepted (the gate's `version` names it) */
  account?: string;
  account_recorded_at?: string;
  /** this computer's key was added on the grid and a second connection with it worked */
  enrolled_at?: string;
  /** the key's SSH fingerprint (SHA256:…), for Details */
  key_fp?: string;
  /** "Use GlobalProtect instead" was pressed: the 11.0.0 way until "Try the direct way again" */
  vpn_chosen_at?: string;
  /** the one-time "Protect the key on this computer?" card was answered (turned on, or Not now) */
  protect_offer_done_at?: string;
  /** "Continue" on "This computer is set up." */
  enrolled_seen_at?: string;
  /** the student continued past the fallback moment into GlobalProtect */
  fallback_seen_at?: string;
}

/** BRIDGE_KEY (session): the last probe of the bridges, in D3's order */
export interface BridgeNote {
  /** the first available, or none */
  chosen: 'store' | 'relay' | 'helper' | 'none';
  store: 'available' | 'not-available';
  relay: 'available' | 'not-configured' | 'not-available';
  helper: 'available' | 'not-installed' | 'broken' | 'not-available';
  /** the helper's hello: its version, operating system, kind */
  helper_version?: string;
  helper_os?: 'windows' | 'mac' | 'linux';
  helper_kind?: 'script' | 'binary';
  /** the grid's ssh port through the chosen bridge: answered with the pinned identity, no route, or not asked */
  reach22: 'answers' | 'no-route' | 'unknown';
  checked_at: string;
}

/** REFUSALS_KEY (session): AccessID -> the refusals in a row and the time of the last (ms) */
export type RefusalNote = Record<string, { count: number; at: number }>;

/** ROUTE_KEY (session) */
export interface RouteNote {
  /** choose: the route choice is up; laptop/phone: that route's steps are up */
  route: 'choose' | 'laptop' | 'phone';
  at: string;
}

export const DEFAULT_PREFS: Prefs = { worker_name: 'worker', permission_mode: 'default', auto_start: true, open_claude_on_connect: true, appearance: 'cream', connection: 'direct' };

/**
 * 11.0.0: the portal the welcome page offers before anything is stored: the bundled site profile's
 * ood_base_url (public/profiles/wayne.json), as {origin, hostname}. PortalSettings is written only
 * when the student presses "Agree and continue" or "Use this portal" and Chrome grants the origin.
 */
export function defaultPortalFrom(profile: { ood_base_url?: string; site?: string } | undefined): { origin: string; hostname: string; site: string } | undefined {
  try {
    const u = new URL(String(profile?.ood_base_url ?? ''));
    if (u.protocol !== 'https:') return undefined;
    return { origin: u.origin, hostname: u.hostname, site: profile?.site || siteFromHostname(u.hostname) };
  } catch {
    return undefined;
  }
}

/** "ondemand.grid.wayne.edu" -> "wayne": the default site profile name */
export function siteFromHostname(hostname: string): string {
  const parts = String(hostname ?? '').toLowerCase().split('.').filter(Boolean);
  if (parts.length >= 2) return (parts[parts.length - 2] ?? '').replace(/[^a-z0-9-]/g, '');
  return parts[0] ?? 'site';
}
