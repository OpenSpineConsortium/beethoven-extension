// Every storage key in one place, split by where it lives and how long it lasts.
//
// storage.local (survives restarts; nothing secret and no credential ever):
export const PORTAL_KEY = 'bridge.portal'; //   {origin, hostname, connected_at, shell_host, site}
export const PREFS_KEY = 'bridge.prefs'; //      {worker_name, permission_mode, auto_start, open_claude_on_connect, project_url}
export const KILLLIST_KEY = 'bridge.killlist'; // the last verified kill-list, {fetched_at, list}
export const REVOKED_KEY = 'bridge.revoked'; //  {revoked, message}: what the chokepoint consults before a command
export const ACCESS_KEY = 'bridge.access'; //    the access service's last word on this account at this portal (licensing/access.ts AccessRecord)
export const SERVICES_KEY = 'bridge.services'; // services.json as last read, {fetched_at, access_check, request_page}
export const INSTALL_ID_KEY = 'bridge.install_id'; // 32 random hex characters, made once per installation (ext/storage.ts installId); sent in the approval check, so the service sees which installations ask about an account
export const IDENTITY_KEY = 'bridge.identity'; // {username, seen_at}: the account name the portal's dashboard last showed for the signed-in session (never typed)
export const CHECKLIST_KEY = 'bridge.checklist'; // {drive_connected_at}: the student's own "done" ticks for steps outside this extension
export const STATEMENTS_KEY = 'bridge.statements'; // {[workspaces/<name>]: Acknowledgement}: the data statement, per workspace, with the text version it was made on
export const OPENED_KEY = 'bridge.opened'; //    {urls: [...]}: environment links this browser profile already opened by itself
export const LOGIN_SEEN_KEY = 'bridge.loginSeen'; // {at, detail}: when the login terminal in this browser last reported SIGNED-IN
export const PROBE_KEY = 'bridge.probe'; //      {submitted_at, job}: the probe job the strip submitted by itself, so it is not submitted again while it runs
export const INSTALL_KEY = 'bridge.install'; //  {attempted_at, ok, detail, dir, note}: the last install, so Details can say which copy it set up, or why the lab's could not be used
// 11.0.0 (framework/contract-text/V11_CONTRACT.md, "Storage"); each is named in PRIVACY.md version 9:
export const LAST_KNOWN_KEY = 'bridge.lastKnown'; // LastKnown: the worker's last known state, title, link and when, so the panel shows it at once and "Open my session" works with no grid
export const CHANNEL_KEY = 'bridge.channel'; //      ChannelNote: how this browser reaches the portal ("direct" from the background, or "tab")
export const WAIT_HISTORY_KEY = 'bridge.waits'; //  WaitHistory: the last five waits for a computer, in whole minutes ("Last time: 6 min.")
export const TOUR_SEEN_KEY = 'bridge.tourSeen'; //  TourSeen: that the tour was seen
export const ONCE_KEY = 'bridge.once'; //            OnceNotes: which one-time tips were shown or dismissed (pin tip, Try asking, the tour card, the New session toast)
// 16.0.0: the direct way (12.0.0 to 15.0.0) is gone, and with it its storage. What a build before 16.0.0 left behind is
// removed once, on the first run after the update (background.ts cleanupDirectWay): the keys below, and the IndexedDB
// database that held the browser's wrapped key. Before 'bridge.direct' goes, the fact that this computer's key was added
// to the student's grid account is kept (never the key, which 16.0.0 cannot read: the database is dropped whole), so
// Settings can say that an earlier version left a key there and when.
export const OLD_DIRECT_LOCAL_KEYS = ['bridge.direct'] as const;
export const OLD_DIRECT_SESSION_KEYS = ['bridge.bridges', 'bridge.keyUnlock', 'bridge.route', 'bridge.refusals'] as const;
export const OLD_KEY_DB = 'beethoven-key';
export const OLD_KEY_KEY = 'bridge.oldKey'; //          OldKeyNote: a key an earlier version added to the grid account, until the student presses "Forget"
// 19.0.0: Beethoven signs in to the grid (PRIVACY.md version 13). Nothing secret here either: the saved password itself
// is ciphertext in the IndexedDB database 'beethoven-signin' (core/vault.ts SIGNIN_DB), never in storage.local, which
// the portal page's script can read. Not one of these names is in OLD_DIRECT_LOCAL_KEYS, OLD_DIRECT_SESSION_KEYS or OLD_KEY_DB.
export const SIGNIN_NOTE_KEY = 'bridge.signin'; //       SigninNote: a saved grid sign-in exists, for whom, and how its last tries went
export const SIGNIN_NOPRF_KEY = 'bridge.signinNoPrf'; // SigninNoPrf: a passkey on this computer could not lock a password, so the sheet offers no Remember
// 25.0.0: the right-click entry (PRIVACY.md version 20). Kept across restarts so Open in Beethoven works with no grid and no VPN.
export const MENU_KEY = 'bridge.menu'; //               core/workers.ts MenuWorkers: the workers the last read found online, with each one's link and the account its status file reports
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
export const WORKERS_KEY = 'bridge.workers'; //  core/workers.ts WorkerList: every worker of the student's on the grid, as their status.json files said (session storage)
export const CLAUDE_TAB_KEY = 'bridge.claudeTab'; //  OpenedTab: the claude.ai tab Beethoven opened for "Open my session" (session storage: a tab id means nothing after a restart)
export const PROJECT_TAB_KEY = 'bridge.projectTab'; // OpenedTab: the claude.ai tab Beethoven opened for the project's page (21.0.0, "Open my project"), its own record so each address keeps one tab
export const TERMINAL_TAB_KEY = 'bridge.terminalTab'; // OpenedTab: the grid's terminal tab Beethoven opened for the one-time key step (AM2)
export const ACTIVITY_KEY = 'bridge.activity'; //     ActivityEntry[]: Beethoven's own plain-words events for Show log, oldest first, at most ACTIVITY_MAX
export const GRID_KEY = 'bridge.grid'; //             GridNote: whether the grid answers and whether the browser holds a grid sign-in, as last checked
export const PRESS_KEY = 'bridge.press'; //           PendingPress: a press kept until the grid can carry it ("Connecting when ready…")
export const WELCOME_PRESS_KEY = 'bridge.welcomePress'; // {at}: the welcome page's "Agree and continue" was pressed, written inside the click before Chrome asks, so the panel opening beside it can say "Almost there." instead of "not accepted yet"
// 19.0.0 (memory only, trusted contexts: the portal page's script never sees storage.session, and its access level is never changed):
export const SIGNIN_UNLOCK_KEY = 'bridge.signinUnlock'; // SigninUnlock: the passkey's output that opens the saved password, until the browser closes or Beethoven reloads
export const SIGNIN_ONCE_KEY = 'bridge.signinOnce'; //     SigninOnce: a password typed without Remember, for one attempt and at most two minutes
export const SIGNIN_STATE_KEY = 'bridge.signinState'; //   SigninState: which requests were given the password and how the last tries went; nothing typed
// 23.0.0 (session): the version Chrome has downloaded from the store, kept until Beethoven restarts into it (core/update.ts); a restart clears it
export const UPDATE_READY_KEY = 'bridge.updateReady';

export interface PortalSettings {
  origin: string;
  hostname: string;
  connected_at: string;
  /** the Shell app host segment; "default" lets the portal pick */
  shell_host: string;
  /**
   * The site profile name handed to `hpcworker install --profile` and used in the session name: the
   * deployment whose own profile declares this portal (17.0.0, core/deployments.ts), or "" for a
   * portal no bundled profile declares (then the account's own profile names the site, or nothing is
   * typed). A record of 11.0.0 to 16.0.0 may carry a name guessed from the host name.
   */
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
  /**
   * 21.0.0: Settings, "Your project on claude.ai": the project's address as contract.ts projectLinkOf keeps it
   * (https://claude.ai/code/project/<id>); absent while none is named. A project cannot take a session the worker
   * started by itself; it reaches the worker's folder when the student asks for the task there (Work locally) and
   * allows the folder on the card. So with one named, the home's primary is "Open my project" and the tab opened
   * when a worker the student started comes online is the project's page, in place of the worker's own link;
   * New session, Copy link and Phone keep the worker's link.
   */
  project_url?: string;
  /**
   * 24.0.0: Settings, "Your Claude account in this browser": the e-mail of the Claude account this Chrome profile is signed
   * in to on claude.ai, picked from the accounts the student's workers report (core/workers.ts accountsOf); absent while
   * none is picked, and then every worker is offered in this browser. Beethoven never reads claude.ai to learn it.
   */
  claude_account?: string;
  // 12.0.0 to 15.0.0 stored `connection: 'direct' | 'vpn'` here; 16.0.0 has one way, ignores a stored value and removes it on its first run (background.ts cleanupDirectWay).
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
  /** 21.0.0: the card offering Settings for a project's address, below the online home while none is named, was dismissed */
  project_card_dismissed_at?: string;
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

/**
 * PRESS_KEY (session): a press that waits for the grid (sign-in, approval, setup, or the one-time key
 * step) and goes ahead by itself. A press a build before 15.0.0 kept may still carry `fresh: true`
 * ("Use another account", connect --login fresh): the read ignores fields it does not name, and the
 * press goes ahead as a plain sign-in, the only kind 15.0.0 asks for (framework 17 refuses a sign-out).
 */
export interface PendingPress {
  kind: 'connect' | 'stop' | 'sign-in-claude' | 'restrict' | 'open-files';
  at: string;
  /** 19.0.0: the shell's 401 already ran one sign-in check for this press (no tab, never twice) */
  shell401?: boolean;
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

// ---- 16.0.0 storage shapes ------------------------------------------------------------------------

/**
 * OLD_KEY_KEY (local). Written once, from the 'bridge.direct' record a build before 16.0.0 left, when
 * that record said this computer's key had been added to the student's grid account. Nothing secret:
 * the fingerprint and the dates, never the key (16.0.0 drops the database that held it, unread).
 */
export interface OldKeyNote {
  /** the AccessID the earlier version recorded with the key */
  account?: string;
  /** the key's SSH fingerprint (SHA256:…) */
  key_fp?: string;
  /** when the key was added on the grid, as the earlier version recorded it */
  enrolled_at?: string;
  /** when 16.0.0 found the record and wrote this note */
  noted_at: string;
}

// ---- 19.0.0 storage shapes: Beethoven signs in ----------------------------------------------------

/**
 * SIGNIN_NOTE_KEY (local): present only while a saved sign-in exists. A page writes it whole when it
 * seals a password (origin, username, saved_at, cred and nothing else, so a new seal clears the tries);
 * the background only adds or changes the attempt and outcome fields below, read-modify-write, and only
 * while the stored note's seal is the one it expects. Nothing secret: the credential id is the passkey's name.
 */
export interface SigninNote {
  origin: string;
  /** the AccessID typed into the sheet (the Basic-auth user name; never the approval check's account) */
  username: string;
  saved_at: string;
  /** base64url credential id of the passkey whose output opens the record; not secret */
  cred: string;
  /** when Beethoven last gave the saved password to the grid */
  attempt_at?: string;
  /**
   * when Beethoven gave the grid a password the student typed while this one was saved, until that answer's
   * outcome comes: a browser closed before it came puts this one on hold (stopped_at), since the record may
   * hold the very password the grid was given. A time only, never what was typed
   */
  typed_attempt_at?: string;
  /** when the grid last took it */
  proven_at?: string;
  /** when the grid last turned it down: no automatic sign-in with it again until a new seal */
  refused_at?: string;
  /**
   * when automatic sign-ins with it were put on hold without it being turned down itself: a password the
   * student typed was turned down while this one was saved, or a try's outcome could no longer be told (a
   * sign-in made in Chrome's box meanwhile, or the browser closed before the grid replied). Lifted by a
   * typed password that works (the same one keeps the record, another replaces it) or by a new seal
   */
  stopped_at?: string;
  /** refusals in a row, of the saved or a typed password, while this sign-in was saved */
  refusals?: number;
  /** the realm of the grid's challenge when it took it */
  realm?: string;
}

/** SIGNIN_NOPRF_KEY (local): when a passkey on this computer gave no PRF output, and the operating system's name */
export interface SigninNoPrf {
  at: string;
  os: string;
}

/** SIGNIN_UNLOCK_KEY (session): base64 of the 32 bytes the passkey gave, and the credential they belong to */
export interface SigninUnlock {
  prf: string;
  cred: string;
}

/** SIGNIN_ONCE_KEY (session): a typed password for one attempt; removed after it, right or wrong, and by the alarm after two minutes */
export interface SigninOnce {
  origin: string;
  username: string;
  password: string;
  at: string;
}

/**
 * SIGNIN_STATE_KEY (session): the background's record of its own answers, so a worker restart keeps the
 * one-wrong-try rule. `sent` holds the request ids given the password (the last 20): Chrome asks again
 * for the same id when the grid turns the password down, and that repeat is the refusal.
 */
export interface SigninState {
  sent: string[];
  /**
   * an answer whose outcome is not known yet: when it was given, and which password it was (the saved
   * one's seal, saved_at; a one-shot's time of typing); `tainted` once a sign-in was asked for again on
   * the portal meanwhile, so a later reading signed in may be another password's doing
   */
  pending?: { requestId: string; at: string; source: 'once' | 'saved'; seal?: string; onceAt?: string; tainted?: boolean };
  /** the last refusal, until the student gives a password again: when it came, and when and with which seal the refused answer was given */
  refused?: { at: string; source: 'once' | 'saved'; given?: string; seal?: string };
  /**
   * the last answer whose outcome could no longer be told: when, which source, when it was given and the
   * seal it gave. It holds the saved sign-in at once, as the note's stopped_at does once written, so a slow
   * or failed write of the note never lets that password go again (I1): the seal given, or for a typed
   * answer any seal made before it
   */
  held?: { at: string; source: 'once' | 'saved'; given: string; seal?: string };
  refusals: number;
  realm?: string;
}

export const DEFAULT_PREFS: Prefs = { worker_name: 'worker', permission_mode: 'default', auto_start: true, open_claude_on_connect: true, appearance: 'cream' };

// 11.0.0's defaultPortalFrom (the bundled profile's portal as {origin, hostname, site}) and
// siteFromHostname ("ondemand.grid.wayne.edu" -> "wayne", a guess) went in 17.0.0: the portal the
// welcome page offers is the picked deployment's (core/deployments.ts portalOf), and the site stored
// with a granted portal is the one whose own profile declares it (deploymentOfPortal), or none.
