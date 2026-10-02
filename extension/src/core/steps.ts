// The views, as pure functions of the facts (11.0.0). journey(f) is the first run, moment by moment
// (welcome, globalprotect, grid, statement, connect, claude, login-setup, queue, starting, online);
// home(f) is the panel after it, one headline state with exactly one primary. panelView(f) picks
// between them and the note that the agreement is not accepted yet; toolbarView(f) is the badge,
// tooltip and lit icon. Every sentence comes from model.ts WORDS (and the agreement's and the
// statement's own modules); nothing here touches the browser, the grid or the clock (f.now is the
// clock), so the whole sequence is tested in Node.
//
// What a student never reads here: job or successor numbers, node, partition, QoS, "scheduler",
// "probe", "heartbeat", a countdown for a wait Beethoven imposes on itself, "Failed to fetch", or raw
// shell output. The words come from the state, the reason class and the failure code (D14).
import type { ChannelNote, KnownState, LastKnown, OnceNotes, PendingPress, Prefs, TourSeen } from './keys';
import { DIRECT_LINKS, formatAgo, formatClock, LOG_WORDS, WORDS, type Action, type WelcomeMoment, type BridgeId, type BridgeState, type ButtonView, type ChecklistRow, type ConnectFailure, type DirectMoment, type HelperDownload, type HeroState, type HeroView, type HomePrimary, type HomeView, type JourneyView, type LoginSetupMoment, type LogLine, type Orb, type PanelView, type ProblemView, type QrLink, type SheetPrompt, type StatusRows, type ToolbarView, type TourView, type TrackView, type WelcomeView } from './model';
import type { SheetState } from './signin';
import { planWord, type ReasonClass, type StopReason } from './contract';
import { PLAN_CLASS_DISCLOSURE, SHORT_STATEMENT, STATEMENT_BUTTON, STATEMENT_TICK } from './disclosure';
import { SUMMARY, TERMS_REFUSAL, ticks } from './terms';
import type { AccessFact } from '../licensing/access';

// ---- the facts ---------------------------------------------------------------------------------------

/** what the site profile gives the words (contract.ts SiteProfile, read by the background) */
export interface SiteWords {
  /** the VPN app's name ("GlobalProtect"); absent: the words for a portal with no site profile (D20) */
  vpnApp?: string;
  /** the VPN's address the student types into the app ("protect.wayne.edu") */
  vpnPortal?: string;
  /** the session title ("Wayne State grid") */
  title: string;
  /** a job's hours: "Your worker restarts itself every 8 hours" */
  hours: number;
  gridAccountHelpUrl?: string;
  vpnHelpUrl?: string;
}

export interface GridFacts {
  /** the credential-free check: the grid answered, no route, or not asked yet */
  reach: 'answers' | 'no-route' | 'unknown';
  /** the dashboard GET: signed in, signed out (401, or sent elsewhere), unreachable, not an OnDemand portal, or not asked yet */
  session: 'signed-in' | 'signed-out' | 'unreachable' | 'not-ood' | 'unknown';
  /** the AccessID the dashboard showed */
  account?: string;
  /** when the GlobalProtect moment began looking (ms): "Still looking" after 45 s */
  lookingSince?: number;
  /** when the grid answered after it had not (ms): "Connected." is held 700 ms */
  answeredAt?: number;
}

export interface SigninFacts {
  /** a grid sign-in tab Beethoven opened or navigated is being watched */
  waiting: boolean;
  /** what happened to it: a second load with no sign-in (Cancel or a wrong password; "cancelled"), the tab closed, or the portal's start page instead of the box */
  problem?: 'cancelled' | 'tab-closed' | 'start-page';
  /** when the dashboard first answered signed in, for the drawn check (ms) */
  signedInAt?: number;
}

export interface SetupFacts {
  /** whether the account runs the lab's shared copy: not known yet, being checked, ready, being set up, no usable shared copy, or the setup line failed */
  state: 'unknown' | 'checking' | 'ready' | 'setting-up' | 'no-shared' | 'failed';
  /** for Details and "Copy details" only */
  detail?: string;
}

/** the connect line in flight and what it has said (core/login.ts ConnectWatcher events) */
export interface ConnectFacts {
  inFlight: boolean;
  pressedAt?: number;
  /** HPCW-STEP queued was seen */
  queued: boolean;
  /**
   * the Claude sign-in: none (not needed or not started), asked (HPCW-STEP signin, waiting for its
   * computer), link (Anthropic's page is open, the box waits), checking (code typed), signed-in
   */
  signin: 'none' | 'asked' | 'link' | 'checking' | 'signed-in';
  /** "HPCW-LOGIN: requesting a compute node" was seen and no "on <host>;" since (ms) */
  signinWaitSince?: number;
  signedIn?: { email?: string; plan?: string; at: number };
  failure?: ConnectFailure;
  /** the code was refused; the sitting asks again */
  badCode?: boolean;
  /** the plan Claude Code named cannot host Remote Control */
  noPlan?: boolean;
  /** Anthropic's tab was closed before the sign-in finished */
  claudeTabClosed?: boolean;
  /** this sitting showed Anthropic's link (the student was on the Claude moment): only then does "Signed in as … · Max" hold that moment */
  linkShown?: boolean;
  /** Anthropic's tab is on record but no sitting holds it any more (the browser stopped Beethoven's background mid-sign-in) */
  interrupted?: boolean;
}

export type RunPhase = 'none' | 'queued' | 'got-computer' | 'connecting' | 'slow' | 'reconnecting' | 'needs-claude' | 'needs-consent' | 'online' | 'renewing' | 'ended' | 'stopped' | 'error';

/** the run as the files say (core/facts.ts runFacts applies R1 to R13) */
export interface RunFacts {
  present: boolean;
  phase: RunPhase;
  /** a job of the run is alive as far as its files say (queued counts, R2) */
  live: boolean;
  /** R12: a live state whose heartbeat is over 3 minutes old reads as last known */
  stale: boolean;
  submittedAt?: string;
  gotComputerAt?: string;
  onlineAt?: string;
  endsAt?: string;
  renewal: boolean;
  chain: boolean;
  reason: ReasonClass;
  /** a real future time from the scheduler (D12) */
  expectedStart?: string;
  /** the environment link, checked */
  link?: string;
  /** state online with a link that is not a claude.ai/code environment link */
  badLink?: boolean;
  title?: string;
  /** when the run's files were last read (ms) */
  checkedAt?: number;
  /** R11: claude_login under 5 minutes old */
  claude?: { loggedIn: boolean; plan?: string; email?: string };
  stopReason?: StopReason;
  /** the student's Connect started this run (open once, "ready N min after you asked", the wait history) */
  pressed: boolean;
  /** R13: online_at − submitted_at in whole minutes (renewal false) */
  readyMinutes?: number;
}

export interface Facts {
  /** the clock, ms */
  now: number;
  terms: boolean;
  /** the connected portal; absent until "Agree and continue" (or "Use this portal") was granted */
  portal?: { origin: string; hostname: string; site: string };
  /** the browser still grants the portal's origin */
  granted: boolean;
  site: SiteWords;
  grid: GridFacts;
  signin: SigninFacts;
  channel?: ChannelNote;
  access: AccessFact;
  setup: SetupFacts;
  statement: { inForce: boolean; workerName: string; restricted?: boolean };
  /** a press waiting for the grid ("Connecting when ready…") */
  press?: PendingPress;
  connect: ConnectFacts;
  /** AM2's one-time key step, while it is shown */
  loginSetup?: { phase: LoginSetupMoment['phase']; line: string };
  run: RunFacts;
  lastKnown?: LastKnown;
  /** the last five waits in minutes, newest last */
  waits: number[];
  once: OnceNotes;
  tourSeen?: TourSeen;
  prefs: Prefs;
  /** action.getUserSettings().isOnToolbar; undefined where the browser cannot say */
  pinned?: boolean;
  /** Stop was pressed and the job is not gone yet */
  stopping: boolean;
  /** tab mode: a background tab carries an action now */
  workingInTab: boolean;
  /** Show log's lines, while it is open */
  log?: LogLine[];
  /** a toast the core asks for once */
  toast?: string;
  /** when the worker went online in front of the panel (ms): "You're online." with the burst for 4 s */
  onlineAnnouncedAt?: number;
  /** the tour is playing from the menu */
  tourFromMenu?: boolean;
  /** the welcome page's press as the background knows it: its state, and when "Agree and continue" was pressed (session WELCOME_PRESS_KEY, ms) */
  welcome?: { state: WelcomeView['state']; pressAt?: number };
  /** 12.0.0: the direct way. Absent: the 11.0.0 way exactly (GlobalProtect and the portal) */
  direct?: DirectFacts;
}

/** 12.0.0: what the direct way stands on (docs/V12_CONTRACT.md "Facts") */
export interface DirectFacts {
  /** Settings' "Connection": Direct when possible (direct) or GlobalProtect only (vpn) */
  pref: 'direct' | 'vpn';
  /** "Use GlobalProtect instead" was pressed (DIRECT_KEY vpn_chosen_at) */
  vpnChosen: boolean;
  /** the first bridge available in D3's order, none, or not probed yet */
  bridge: BridgeId | 'none' | 'unknown';
  /** the bundled helper: what its probe found, and its hello's version */
  helper: { state: BridgeState; version?: string };
  /** a probe of the bridges runs now */
  probing: boolean;
  /** that probe is the student's own Check again (only then the button turns) */
  probingByHand?: boolean;
  /** the student pressed Check again since the installer was saved ("Not found yet" only after that, or after ten minutes) */
  checkedByHand?: boolean;
  /** the page's last Unlock did not unlock ("That didn't unlock. Try again." on the unlock sheet) */
  unlockFailed?: boolean;
  /** the helper answered for the first time a moment ago ("Helper found." with the drawn check) */
  foundAt?: number;
  /** the student saved the installer (the background looks for the helper every few seconds) */
  downloadedAt?: number;
  /** this computer's installer, from public/bridge/manifest.json */
  download?: HelperDownload;
  /** this computer's key: present, protected (opt-in), locked this browser session, enrolled on the grid */
  key: { present: boolean; wrapped: boolean; locked: boolean; enrolled: boolean; keyType?: string; fingerprint?: string };
  /** the grid's ssh door through the bridge (or the last direct check could not reach it) */
  unreachable: boolean;
  /** the account the grid accepted on the direct way */
  account?: string;
  /** the sign-in sheet in flight (core/signin.ts), or the moment the student opened it */
  sheet?: SheetState;
  /** the sheet is wanted now (a press waits on a sign-in, or the first run reached it) */
  sheetWanted: boolean;
  /** the 2FA route: the choice, or the steps of one */
  route?: 'choose' | 'laptop' | 'phone';
  /** "This computer is set up." is shown until Continue, this long after enrolment */
  enrolledAt?: number;
  enrolledSeen: boolean;
  /** the one-time protection card after enrolment is not answered yet */
  protectOffer: boolean;
  /** what the page's passkey step came to, for the card's last line */
  protectOutcome?: 'on' | 'cancelled' | 'unsupported' | 'failed';
  /** the student continued past the fallback moment into GlobalProtect */
  fallbackSeen: boolean;
  /** the university's pages the codes open (the site profile's, else Wayne State's own) */
  links: { globalProtect: string; gridCode: string; gridSite: string };
}

/** how long "This computer is set up." holds when Continue is not pressed */
export const ENROLLED_HOLD_MS = 4_000;
/** how long "Helper found." holds before the sheet */
export const FOUND_HOLD_MS = 1_200;
/** how long the protection card holds "Protected." after Turn on, before the moment moves on */
export const PROTECTED_HOLD_MS = 2_500;

/**
 * 12.0.0: which way the grid is reached now. "vpn": the 11.0.0 way (GlobalProtect and the portal),
 * exactly; "direct": ssh with this computer's key, through the bridge; "setup": the direct way is being
 * set up or needs the student (a bridge to install, a sign-in, a code to set up, an unlock).
 */
export function connectionMode(f: Pick<Facts, 'direct'>): 'direct' | 'vpn' | 'setup' {
  const d = f.direct;
  if (!d || d.pref === 'vpn' || d.vpnChosen) return 'vpn';
  if (d.unreachable && d.fallbackSeen) return 'vpn';
  if (d.bridge === 'none' || d.bridge === 'unknown') return 'setup';
  if (!d.key.present || !d.key.enrolled || d.key.locked) return 'setup';
  return 'direct';
}

// ---- small pieces ----------------------------------------------------------------------------------

/** how long "You're online." holds before the home */
export const ONLINE_HOLD_MS = 4_000;
/** "Still looking" after this long */
export const STILL_LOOKING_MS = 45_000;
/** "Connected." is held this long */
export const CONNECTED_HOLD_MS = 700;
/** "The grid is busy. Still finding a computer for the sign-in…" after this long */
export const SIGNIN_BUSY_MS = 2 * 60_000;
/** the queue's subline adds "The grid is busy today…" past this long */
export const BUSY_TODAY_MS = 15 * 60_000;
/** "Signed in as … · Max" is shown this long */
export const SIGNED_IN_HOLD_MS = 3_000;
/** the welcome page's press is taken as under way (Chrome's box up) this long */
export const WELCOME_PRESS_MS = 3 * 60_000;
/** "Signed in as st1234." with the drawn check */
export const GRID_SIGNED_IN_HOLD_MS = 1_500;
/** Try asking shows for the first 3 days */
export const TRY_ASKING_MS = 3 * 24 * 60 * 60_000;
/** "Pinned." is shown this long after the pin */
export const PINNED_HOLD_MS = 4_000;

const ms = (iso: string | undefined): number | undefined => {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : undefined;
};

function vpnApp(f: Facts): string {
  return f.site.vpnApp ?? 'your VPN';
}

function button(label: string, tone: ButtonView['tone'], action?: Action, extra: Partial<ButtonView> = {}): ButtonView {
  return { label, tone, ...(action ? { action } : {}), ...extra };
}

/** the four-node track: done before `current`, the current one turning (or, `failed`, still and brick), the rest hollow; current 4 = all done */
export function track(current: 0 | 1 | 2 | 3 | 4, failed = false): TrackView {
  const node = (i: number) => ({ label: WORDS.track[i]!, state: (i < current ? 'done' : i === current ? (failed ? 'failed' : 'current') : 'future') as 'done' | 'current' | 'future' | 'failed' });
  return [node(0), node(1), node(2), node(3)];
}

/**
 * A wait that ended in a failure of the connect line, as the waiting moment's new headline (the title)
 * and what to do (the body and its button): "The grid didn't take the request." and "The grid didn't
 * find a computer for the sign-in." / "Your worker keeps its place in line." The other failures are the
 * statement's or the Claude moment's (connectProblem).
 */
export function endedWait(failure: ConnectFailure | undefined): ProblemView | undefined {
  switch (failure) {
    case undefined:
    case 'password':
      return undefined;
    case 'signin-node':
      return { title: WORDS.connect.noSigninTitle, body: WORDS.connect.keepsPlace, button: button(WORDS.connect.tryAgain, 'ink', { kind: 'sign-in-claude' }) };
    case 'setup':
    case 'restricted':
    case 'signin-code':
    case 'signin-timeout':
    case 'limit-names':
    case 'limit-hourly':
    case 'limit-busy':
    case 'old-copy':
      return connectProblem(failure);
    default:
      return { title: WORDS.connect.refused, body: WORDS.connect.refusedNext, button: button(WORDS.connect.tryAgain, 'ink', { kind: 'retry' }) };
  }
}

/** "Signed in as alex@wayne.edu · Max", or without the plan when Claude Code named none */
function signedInClaude(s: { email?: string; plan?: string }): string {
  const plan = planWord(s.plan);
  return plan ? WORDS.claude.signedIn(s.email ?? 'your account', plan) : `Signed in as ${s.email ?? 'your account'}`;
}

/** the share of minutes in the queue so far */
function minutesSince(f: Facts, iso: string | undefined): number {
  const t = ms(iso);
  return t === undefined ? 0 : Math.max(0, Math.floor((f.now - t) / 60_000));
}

/** a press that needs the student at the grid's sign-in box, or the first run before the sign-in */
function needsGridSignin(f: Facts): boolean {
  return f.grid.session !== 'signed-in';
}

/** the access problem of moment 6, in the student's words; undefined while approved or still being checked */
export function accessProblem(f: Facts): ProblemView | undefined {
  const a = f.access;
  if (a.ok) return undefined;
  const account = a.accessId ?? f.grid.account ?? 'This account';
  switch (a.state) {
    case 'checking':
      return undefined;
    case 'denied':
    case 'withdrawn':
      return { title: WORDS.statement.notApproved.title, body: WORDS.statement.notApproved.body(account), button: button(WORDS.statement.notApproved.button, 'ink', { kind: 'ask-access' }) };
    case 'other-installation':
      return { title: WORDS.statement.otherInstallation.title, body: WORDS.statement.otherInstallation.body(account) };
    case 'other-account':
      return { title: WORDS.statement.otherAccount.title, body: WORDS.statement.otherAccount.body };
    case 'update-required':
    case 'version-revoked':
      return { title: WORDS.statement.withdrawn.title, body: WORDS.statement.withdrawn.body, button: button(WORDS.statement.withdrawn.button, 'ink', { kind: 'update' }) };
    case 'no-identity':
    case 'unreachable':
    case 'failed':
    case 'lapsed':
    default:
      return { body: WORDS.statement.accessUnreachable.body, button: button(WORDS.statement.accessUnreachable.button, 'ink', { kind: 'retry-access' }) };
  }
}

/** the connect line's failure, in the words of the contract's table (§5.3) */
export function connectProblem(failure: ConnectFailure | undefined): ProblemView | undefined {
  switch (failure) {
    case undefined:
      return undefined;
    case 'setup':
      return { body: WORDS.statement.noSharedCopy.body, button: button(WORDS.statement.noSharedCopy.button, 'ink', { kind: 'copy-details' }) };
    case 'restricted':
      return { body: WORDS.statement.restricted.body };
    case 'signin-node':
      return { body: WORDS.connect.noSigninComputer, button: button(WORDS.connect.tryAgain, 'ink', { kind: 'sign-in-claude' }) };
    case 'signin-code':
      return { body: WORDS.claude.badCode, button: button(WORDS.claude.signInAgain, 'ink', { kind: 'sign-in-claude' }) };
    case 'signin-timeout':
      return { body: WORDS.claude.timedOut, button: button(WORDS.claude.signInAgain, 'ink', { kind: 'sign-in-claude' }) };
    case 'password':
      // the one-time key step takes over (AM2); nothing to say here
      return undefined;
    case 'limit-names':
      return { body: WORDS.direct.gate.names, button: button(WORDS.direct.signin.useVpn('GlobalProtect'), 'ink', { kind: 'use-vpn' }) };
    case 'limit-hourly':
      return { body: WORDS.direct.gate.hourly, button: button(WORDS.direct.signin.useVpn('GlobalProtect'), 'ink', { kind: 'use-vpn' }) };
    case 'limit-busy':
      return { body: WORDS.direct.gate.busy, button: button(WORDS.connect.tryAgain, 'ink', { kind: 'retry' }) };
    case 'old-copy':
      return { body: WORDS.direct.gate.oldCopy, button: button(WORDS.direct.signin.useVpn('GlobalProtect'), 'ink', { kind: 'use-vpn' }) };
    case 'refused':
    case 'signin':
    case 'usage':
    case 'other':
    case 'closed':
    default:
      return { body: WORDS.connect.refused, button: button(WORDS.connect.tryAgain, 'ink', { kind: 'retry' }) };
  }
}

/** the failures that belong to the Claude sign-in moment rather than to the connect moment */
const CLAUDE_FAILURES: ReadonlySet<ConnectFailure> = new Set(['signin-code', 'signin-timeout']);

// ---- which moment ----------------------------------------------------------------------------------

/**
 * 12.0.0: the direct way's moment, or undefined when the 11.0.0 moments carry on. `wanted`: the first
 * run, or a press of the student's that waits on the grid; without it only what is already under way
 * (a sign-in, the route choice, the hold after enrolment, the one-time protection card) is shown.
 */
export function directMoment(f: Facts, wanted = true): DirectMoment | undefined {
  const d = f.direct;
  if (!d || d.pref === 'vpn') return undefined;
  const s = d.sheet;
  if (d.route) return d.route === 'choose' ? 'choose-route' : 'code-setup';
  if (s && s.phase !== 'account' && s.phase !== 'done') return 'sign-in-sheet';
  if (d.enrolledAt !== undefined && !d.enrolledSeen && f.now - d.enrolledAt < ENROLLED_HOLD_MS) return 'enrolled';
  // the card holds "Protected." a moment after Turn on (the key is wrapped by then)
  if (d.protectOffer && d.key.present && d.key.enrolled && (!d.key.wrapped || d.protectOutcome === 'on')) return 'protect-key-optional';
  // "Use GlobalProtect instead": the fallback moment once (Continue opens the grid's own sign-in box), then the 11.0.0 moments
  if (d.vpnChosen) return d.fallbackSeen || (!wanted && !d.sheetWanted) ? undefined : 'fallback-to-vpn';
  if (!wanted && !d.sheetWanted) return undefined;
  if (d.unreachable) return d.fallbackSeen ? undefined : 'fallback-to-vpn';
  if (d.bridge === 'none') return 'install-helper';
  if (d.foundAt !== undefined && f.now - d.foundAt < FOUND_HOLD_MS) return 'install-helper';
  if (d.bridge === 'unknown') return d.probing || !d.key.enrolled ? 'sign-in-sheet' : undefined;
  if (!d.key.present || !d.key.enrolled || d.key.locked || d.sheetWanted) return 'sign-in-sheet';
  return undefined;
}

/** the moment the student must act in now, outside the first run's order: grid sign-in for a press, the Claude sign-in, the key step */
function studentMoment(f: Facts): JourneyView['moment'] | undefined {
  const dm = directMoment(f, !!f.press);
  if (dm) return dm;
  // the direct way carries the grid: the portal's sign-in box is not this moment's
  if (connectionMode(f) === 'direct' && f.press && needsGridSignin(f) && f.grid.session !== 'unreachable') return 'sign-in-sheet';
  if (f.loginSetup) return 'login-setup';
  if (f.signin.waiting || (f.press && needsGridSignin(f) && f.grid.session !== 'unreachable' && f.grid.reach !== 'no-route')) return 'grid';
  if (claudeNeedsStudent(f)) return 'claude';
  // the data statement before a worker starts (LICENSE 5(e)): a new worker name, a new text, or an
  // account carried over from 10.0.0 shows the card again before its Connect
  if (!f.statement.inForce && f.grid.session === 'signed-in' && !f.connect.inFlight && (!f.run.live || f.run.phase === 'needs-consent')) return 'statement';
  return undefined;
}

function claudeNeedsStudent(f: Facts): boolean {
  const c = f.connect;
  if (c.interrupted || c.noPlan || c.claudeTabClosed) return true;
  if (c.failure && CLAUDE_FAILURES.has(c.failure)) return true;
  if (c.signin === 'link' || c.signin === 'checking') return true;
  // "Signed in as … · Max" holds the moment a little, only when the student was on it (spec moment 8:
  // already signed in on the grid, this moment never appears; a toast says who)
  return c.signin === 'signed-in' && !!c.linkShown && !!c.signedIn && f.now - c.signedIn.at < SIGNED_IN_HOLD_MS;
}

/** the welcome moment's state: Chrome's box up after the press, Deny, nothing pressed yet, or the grant taken away after the first run */
function welcomeState(f: Facts): WelcomeMoment['state'] {
  const pressed = f.welcome?.pressAt !== undefined && f.now - f.welcome.pressAt < WELCOME_PRESS_MS;
  if (f.terms && f.portal && !f.granted && firstRunDone(f)) return 'revoked';
  if (f.welcome?.state === 'denied') return 'denied';
  if (f.welcome?.state === 'save-failed') return 'finish';
  if (pressed || f.welcome?.state === 'opening') return 'waiting';
  return 'finish';
}

/** the first run's moment */
export function momentOf(f: Facts): JourneyView['moment'] {
  if (!f.portal || !f.granted) return 'welcome';
  // 12.0.0: the direct way first (D3); its moments come where GlobalProtect's and the grid sign-in's came
  const dm = directMoment(f);
  if (dm) return dm;
  if (connectionMode(f) === 'direct' && needsGridSignin(f)) return 'sign-in-sheet';
  if (f.loginSetup) return 'login-setup';
  if (needsGridSignin(f)) {
    // "Connected." is held 700 ms before the sign-in moment
    if (f.grid.answeredAt !== undefined && f.now - f.grid.answeredAt < CONNECTED_HOLD_MS) return 'globalprotect';
    if (f.grid.reach === 'no-route' || f.grid.session === 'unreachable') return 'globalprotect';
    return 'grid';
  }
  // the drawn check holds a moment after the sign-in
  if (f.signin.signedInAt !== undefined && f.now - f.signin.signedInAt < GRID_SIGNED_IN_HOLD_MS && !f.connect.inFlight && !f.run.present) return 'grid';
  if (claudeNeedsStudent(f)) return 'claude';
  const c = f.connect;
  if (c.inFlight && !c.queued) return 'connect';
  if (f.run.present && f.run.phase !== 'none') {
    switch (f.run.phase) {
      case 'queued':
        return 'queue';
      case 'got-computer':
      case 'connecting':
      case 'slow':
      case 'reconnecting':
      case 'needs-claude':
      case 'needs-consent':
      case 'renewing':
        return 'starting';
      case 'online':
        return 'online';
      case 'error':
        return c.queued ? 'queue' : 'connect';
      default:
        break;
    }
  }
  if (c.queued) return 'queue';
  // a refusal before anything was queued stays on the connect moment with its reason; the
  // workspace and setup refusals belong to the statement, and a password to the key step
  if (c.failure && !c.inFlight && c.pressedAt !== undefined && c.failure !== 'setup' && c.failure !== 'restricted' && c.failure !== 'password') return 'connect';
  return 'statement';
}

// ---- the journey -----------------------------------------------------------------------------------

export function journey(f: Facts, moment: JourneyView['moment'] = momentOf(f)): JourneyView {
  switch (moment) {
    case 'welcome': {
      const W = WORDS.welcomeMoment;
      const st = welcomeState(f);
      switch (st) {
        case 'waiting':
          return { moment: 'welcome', state: st, title: W.almostTitle, body: W.almostBody, status: W.waiting };
        case 'denied':
          return { moment: 'welcome', state: st, title: W.almostTitle, body: W.deniedBody };
        case 'revoked':
          return { moment: 'welcome', state: st, title: W.revokedTitle, body: W.revokedBody(f.portal!.hostname), button: button(W.revokedButton, 'ink', { kind: 'use-portal', origin: f.portal!.origin, granted: false }), origin: f.portal!.origin };
        case 'finish':
        default:
          return { moment: 'welcome', state: 'finish', title: W.finishTitle, body: TERMS_REFUSAL, button: button(WORDS.termsNeeded.button, 'ink', { kind: 'open-settings' }) };
      }
    }

    case 'globalprotect': {
      const app = f.site.vpnApp;
      const connected = f.grid.answeredAt !== undefined && f.now - f.grid.answeredAt < CONNECTED_HOLD_MS;
      const still = !connected && f.grid.lookingSince !== undefined && f.now - f.grid.lookingSince >= STILL_LOOKING_MS;
      return {
        moment: 'globalprotect',
        title: app ? WORDS.globalprotect.title(app) : WORDS.globalprotect.titleNoProfile,
        body: app && f.site.vpnPortal ? WORDS.globalprotect.body(app, f.site.vpnPortal) : WORDS.globalprotect.bodyNoProfile,
        ...(f.site.vpnPortal ? { chip: f.site.vpnPortal } : {}),
        status: connected ? { state: 'connected', text: WORDS.globalprotect.connected } : still ? { state: 'still', text: WORDS.globalprotect.still(vpnApp(f)) } : { state: 'looking', text: WORDS.globalprotect.looking },
      };
    }

    case 'grid': {
      let problem: ProblemView | undefined;
      if (f.grid.session === 'unreachable') problem = { body: WORDS.grid.unreachable(vpnApp(f)), button: button(WORDS.grid.tryAgain, 'ink', { kind: 'retry-grid' }) };
      else if (f.grid.session === 'not-ood') problem = { body: WORDS.grid.notOod, button: button(WORDS.grid.useAnother, 'ink', { kind: 'open-settings' }) };
      // a second load of the sign-in tab with no sign-in: Cancel in Chrome's box, or a wrong password
      // (the two look the same to an extension, so neither is claimed)
      else if (f.signin.problem === 'cancelled') problem = { body: WORDS.grid.notYet, button: button(WORDS.grid.signInAgain, 'ink', { kind: 'sign-in-grid' }) };
      else if (f.signin.problem === 'tab-closed') problem = { body: WORDS.grid.tabClosed, button: button(WORDS.grid.signInAgain, 'ink', { kind: 'sign-in-grid' }) };
      else if (f.signin.problem === 'start-page') problem = { body: WORDS.grid.startPage };
      else if (!f.signin.waiting && f.grid.session === 'signed-out' && f.signin.signedInAt === undefined) problem = { body: WORDS.home.gridSignedOut, button: button(WORDS.grid.signInAgain, 'ink', { kind: 'sign-in-grid' }) };
      const signedIn = f.grid.session === 'signed-in' && f.grid.account ? WORDS.grid.signedIn(f.grid.account) : undefined;
      return { moment: 'grid', title: WORDS.grid.title, body: WORDS.grid.body, ...(signedIn ? { signedIn } : {}), ...(problem && !signedIn ? { problem } : {}) };
    }

    case 'statement': {
      const account = f.grid.account ?? '';
      const approved = f.access.ok;
      const checking = !f.access.ok && f.access.state === 'checking';
      const setupNow = f.setup.state === 'checking' || f.setup.state === 'setting-up';
      const checklist: [ChecklistRow, ChecklistRow, ChecklistRow] = [
        { text: WORDS.statement.rowSignedIn(account), state: f.grid.session === 'signed-in' ? 'done' : 'now' },
        { text: WORDS.statement.rowApproved, state: approved ? 'done' : checking ? 'now' : 'next' },
        { text: WORDS.statement.rowReady, state: f.setup.state === 'ready' ? 'done' : setupNow || (approved && f.setup.state === 'unknown') ? 'now' : 'next' },
      ];
      let problem = accessProblem(f);
      if (!problem && (f.setup.state === 'no-shared' || f.setup.state === 'failed')) problem = connectProblem('setup');
      if (!problem && f.statement.restricted) problem = connectProblem('restricted');
      if (!problem && f.connect.failure === 'restricted') problem = connectProblem('restricted');
      if (!problem && f.connect.failure === 'setup') problem = connectProblem('setup');
      const pressed = f.press?.kind === 'connect';
      return {
        moment: 'statement',
        title: problem?.title ?? WORDS.statement.title,
        lines: [...SHORT_STATEMENT],
        more: {
          sentences: [...PLAN_CLASS_DISCLOSURE],
          workerName: WORDS.statement.workerName(f.statement.workerName),
          change: button(WORDS.statement.change, 'link', { kind: 'open-settings' }),
          markRestricted: button(WORDS.statement.markRestricted, 'link', { kind: 'restrict', workerName: f.statement.workerName }),
        },
        tick: STATEMENT_TICK,
        connect: button(pressed ? WORDS.statement.connectingWhenReady : WORDS.statement.connect, 'ink', { kind: 'connect', statement: { tick: STATEMENT_TICK, lines: [...SHORT_STATEMENT], buttonLabel: STATEMENT_BUTTON } }, pressed ? { busy: true } : {}),
        checklist,
        ...(problem ? { problem } : {}),
      };
    }

    case 'connect': {
      const waitingNode = f.connect.signinWaitSince !== undefined && f.now - f.connect.signinWaitSince >= SIGNIN_BUSY_MS;
      const problem = f.connect.inFlight ? undefined : endedWait(f.connect.failure ?? (f.run.phase === 'error' ? 'other' : undefined));
      return {
        moment: 'connect',
        hero: WORDS.connect.hero,
        track: problem?.title ? track(0, true) : track(0),
        sub: waitingNode ? WORDS.connect.busy : WORDS.connect.gettingSignin,
        ...(problem ? { problem } : {}),
      };
    }

    case 'claude': {
      const c = f.connect;
      let problem: ProblemView | undefined;
      if (c.interrupted) problem = { body: WORDS.claude.interrupted, button: button(WORDS.claude.signInAgain, 'ink', { kind: 'sign-in-claude' }) };
      else if (c.noPlan) problem = { body: WORDS.claude.noPlan, button: button(WORDS.claude.useAnother, 'ink', { kind: 'sign-in-claude', fresh: true }) };
      else if (c.failure === 'signin-timeout') problem = { body: WORDS.claude.timedOut, button: button(WORDS.claude.signInAgain, 'ink', { kind: 'sign-in-claude' }) };
      else if (c.failure === 'signin-code') problem = { body: WORDS.claude.badCode, button: button(WORDS.claude.signInAgain, 'ink', { kind: 'sign-in-claude' }) };
      else if (c.claudeTabClosed) problem = { body: WORDS.claude.tabClosed, button: button(WORDS.claude.openAgain, 'ink', { kind: 'reopen-claude-tab' }) };
      else if (c.badCode) problem = { body: WORDS.claude.badCode };
      const signedIn = c.signin === 'signed-in' && c.signedIn && !c.noPlan ? signedInClaude(c.signedIn) : undefined;
      return {
        moment: 'claude',
        title: WORDS.claude.title,
        body: WORDS.claude.body,
        box: { placeholder: WORDS.claude.placeholder, focus: c.signin === 'link', checking: c.signin === 'checking', continueLabel: WORDS.claude.continue },
        reopen: button(WORDS.claude.reopen, 'link', { kind: 'reopen-claude-tab' }),
        ...(c.queued && f.run.submittedAt ? { inLine: { since: f.run.submittedAt } } : {}),
        ...(signedIn ? { signedIn } : {}),
        ...(problem ? { problem } : {}),
      };
    }

    case 'login-setup':
      return loginSetupMoment(f.loginSetup ?? { phase: 'offer', line: '' });

    case 'choose-route':
    case 'install-helper':
    case 'sign-in-sheet':
    case 'code-setup':
    case 'enrolled':
    case 'fallback-to-vpn':
    case 'protect-key-optional':
      return directJourney(f, moment);

    case 'queue': {
      const r = f.run;
      const hero = r.reason === 'share' ? WORDS.queue.shareHero : r.reason === 'maintenance' ? WORDS.queue.maintenanceHero : WORDS.queue.hero;
      const sub: string[] = [r.reason === 'share' ? WORDS.queue.shareSub : r.reason === 'maintenance' ? WORDS.queue.maintenanceSub : WORDS.queue.sub];
      const extra = queueExtra(f);
      if (extra) sub.push(extra);
      if (f.connect.signin === 'asked' && f.connect.signinWaitSince !== undefined && f.now - f.connect.signinWaitSince >= SIGNIN_BUSY_MS) sub.push(WORDS.connect.busy);
      let problem: ProblemView | undefined;
      // a wait that has ended says so in its headline, without the clock (the reason is under Show log)
      if (r.phase === 'error') problem = { title: WORDS.queue.couldntStartTitle, body: '', button: button(WORDS.queue.tryAgain, 'ink', { kind: 'retry' }) };
      else if (f.connect.failure === 'signin-node') problem = endedWait('signin-node');
      else if (f.grid.session === 'unreachable') problem = { body: WORDS.queue.unreachable(vpnApp(f)) };
      const ended = !!problem?.title;
      return {
        moment: 'queue',
        hero,
        ...(ended ? {} : { timer: { since: r.submittedAt ?? new Date(f.connect.pressedAt ?? f.now).toISOString() } }),
        sub: ended ? [] : sub,
        reason: r.reason,
        track: ended && r.phase === 'error' ? track(1, true) : track(1),
        ...(problem ? { problem } : {}),
      };
    }

    case 'starting': {
      const r = f.run;
      let problem: ProblemView | undefined;
      if (r.phase === 'slow') problem = { body: WORDS.starting.slowMoment, button: button(WORDS.starting.showLog, 'link', { kind: 'log', open: true }) };
      else if (r.phase === 'needs-claude') problem = { body: WORDS.starting.needsSignin, button: button(WORDS.starting.signInClaude, 'ink', { kind: 'sign-in-claude' }) };
      else if (r.phase === 'needs-consent') problem = { body: WORDS.home.needsConsentSub, button: button(WORDS.home.connect, 'ink', { kind: 'connect' }) };
      else if (r.phase === 'reconnecting' || r.phase === 'renewing') problem = { body: WORDS.starting.reconnectingMoment };
      const got = r.phase === 'got-computer' && !!r.gotComputerAt;
      return { moment: 'starting', hero: WORDS.starting.hero, sub: got ? WORDS.starting.gotComputer : WORDS.starting.connecting, ...(got ? { timer: { since: r.gotComputerAt! } } : {}), track: track(2), ...(problem ? { problem } : {}) };
    }

    case 'online': {
      const r = f.run;
      const title = r.title ?? f.site.title;
      const since = ms(r.onlineAt) ?? ms(f.lastKnown?.online_since);
      const sub = r.badLink ? WORDS.online.badLink(title) : r.readyMinutes !== undefined ? WORDS.online.ready(r.readyMinutes, title) : since !== undefined ? WORDS.home.onlineSub(title, f.now - since) : title;
      const pinTip = pinTipOf(f);
      return {
        moment: 'online',
        hero: WORDS.online.hero,
        sub,
        primary: button(WORDS.online.open, 'teal', { kind: 'open-session' }, r.link ? {} : { disabled: true }),
        track: track(4),
        burst: f.onlineAnnouncedAt !== undefined && f.now - f.onlineAnnouncedAt < ONLINE_HOLD_MS,
        ...(pinTip ? { pinTip } : {}),
      };
    }
  }
}

// ---- 12.0.0: the direct way's moments -------------------------------------------------------------

const NO_DIRECT: DirectFacts = {
  pref: 'direct',
  vpnChosen: false,
  bridge: 'unknown',
  helper: { state: 'unknown' },
  probing: false,
  key: { present: false, wrapped: false, locked: false, enrolled: false },
  unreachable: false,
  sheetWanted: false,
  enrolledSeen: true,
  protectOffer: false,
  fallbackSeen: false,
  links: { globalProtect: DIRECT_LINKS.globalProtect, gridCode: DIRECT_LINKS.gridCode, gridSite: 'https://ondemand.grid.wayne.edu/pun/sys/dashboard/' },
};

/** one of the direct way's moments as the page draws it */
export function directJourney(f: Facts, moment: DirectMoment): JourneyView {
  const d = f.direct ?? NO_DIRECT;
  const app = vpnApp(f);
  const useVpn = button(WORDS.direct.signin.useVpn(app), 'text', { kind: 'use-vpn' });
  switch (moment) {
    case 'install-helper': {
      const W = WORDS.direct.installHelper;
      const dl = d.download;
      const found = d.foundAt !== undefined && f.now - d.foundAt < FOUND_HOLD_MS;
      // right after the download Beethoven looks by itself every few seconds: that is waiting, not a failure;
      // "Not found yet" only once the student pressed Check again, or the eager ten minutes are over
      const eager = d.downloadedAt !== undefined && f.now - d.downloadedAt < 10 * 60_000 && !d.checkedByHand;
      const status: Extract<JourneyView, { moment: 'install-helper' }>['status'] = found
        ? { state: 'found', text: W.found }
        : d.probing && d.probingByHand
          ? { state: 'looking', text: W.checking }
          : d.helper.state === 'broken'
            ? { state: 'broken', text: W.broken }
            : d.downloadedAt !== undefined
              ? eager
                ? { state: 'waiting', text: W.waiting }
                : { state: 'not-found', text: W.notFound }
              : { state: 'idle' };
      return {
        moment: 'install-helper',
        title: W.title,
        body: dl ? W.body : `${W.body} ${W.noDownload}`,
        ...(dl ? { download: { ...dl, label: W.download(dl.osLabel), fileLine: dl.size ? W.fileLine(dl.file, dl.size) : dl.file } } : {}),
        steps: dl ? (dl.open ? W.stepsNamed[dl.os](dl.open) : [...W.steps[dl.os]]) : [],
        ...(dl && W.osNote[dl.os] ? { osNote: W.osNote[dl.os]! } : {}),
        unsignedNote: W.unsignedNote,
        status,
        checkAgain: button(W.checkAgain, 'outline', { kind: 'check-bridge' }, d.probing && d.probingByHand ? { busy: true } : {}),
        useVpn: button(W.useVpn(app), 'text', { kind: 'use-vpn' }),
      };
    }

    case 'sign-in-sheet':
      return signInSheet(f, d, useVpn);

    case 'choose-route': {
      const W = WORDS.direct.chooseRoute;
      return {
        moment: 'choose-route',
        title: W.title,
        body: W.body,
        options: [
          { id: 'laptop', title: W.laptop.title, detail: W.laptop.detail, button: button(W.laptop.button, 'ink', { kind: 'choose-route', route: 'laptop' }) },
          { id: 'phone', title: W.phone.title, detail: W.phone.detail, button: button(W.phone.button, 'outline', { kind: 'choose-route', route: 'phone' }) },
        ],
        useVpn,
        warning: WORDS.direct.codeSetup.warning,
      };
    }

    case 'code-setup': {
      const W = WORDS.direct.codeSetup;
      const route = d.route === 'phone' ? 'phone' : 'laptop';
      const apps: QrLink[] = [
        { id: 'authenticator-ios', label: `${W.qr.authenticator} · ${W.qr.iphone}`, url: DIRECT_LINKS.authenticatorIos },
        { id: 'authenticator-android', label: `${W.qr.authenticator} · ${W.qr.android}`, url: DIRECT_LINKS.authenticatorAndroid },
      ];
      const qr: QrLink[] =
        route === 'phone'
          ? [
              { id: 'globalprotect-ios', label: `${W.qr.globalprotect} · ${W.qr.iphone}`, url: DIRECT_LINKS.globalProtectIos },
              { id: 'globalprotect-android', label: `${W.qr.globalprotect} · ${W.qr.android}`, url: DIRECT_LINKS.globalProtectAndroid },
              ...apps,
              { id: 'grid-code', label: W.qr.gridCode, url: d.links.gridCode },
            ]
          : [{ id: 'grid-code', label: W.qr.gridCode, url: d.links.gridCode }, ...apps, { id: 'grid-site', label: W.openSite, url: d.links.gridSite }];
      return {
        moment: 'code-setup',
        route,
        title: route === 'phone' ? W.phoneTitle : W.laptopTitle,
        steps: [...(route === 'phone' ? W.phoneSteps : W.laptopSteps)],
        qr,
        warning: W.warning,
        done: button(W.done, 'ink', { kind: 'grid-signin-retry' }),
        back: button(W.back, 'text', { kind: 'route-back' }),
        useVpn,
      };
    }

    case 'enrolled': {
      const W = WORDS.direct.enrolled;
      return { moment: 'enrolled', title: W.title, body: W.body, ...(d.account ? { account: d.account } : {}), continue: button(W.continue, 'ink', { kind: 'grid-signin-continue' }) };
    }

    case 'protect-key-optional': {
      const W = WORDS.direct.protectKey;
      const outcome = d.protectOutcome === 'on' ? W.turnedOn : d.protectOutcome === 'cancelled' || d.protectOutcome === 'failed' ? W.cancelled : d.protectOutcome === 'unsupported' ? W.unsupported : undefined;
      return {
        moment: 'protect-key-optional',
        title: d.protectOutcome === 'on' ? W.titleOn : W.title,
        body: W.body,
        on: { label: W.on, busyLabel: W.turningOn, available: d.protectOutcome !== 'unsupported' },
        notNow: button(d.protectOutcome === 'on' ? WORDS.direct.enrolled.continue : W.notNow, 'text', { kind: 'protect-key-later' }),
        ...(outcome ? { outcome } : {}),
      };
    }

    case 'fallback-to-vpn': {
      const W = WORDS.direct.fallback;
      return {
        moment: 'fallback-to-vpn',
        title: W.title(app),
        body: d.unreachable ? `${WORDS.direct.signin.unreachable} ${W.body(app)}` : W.body(app),
        continue: button(W.continue, 'ink', { kind: 'fallback-continue' }),
        tryDirect: button(W.tryDirect, 'text', { kind: 'try-direct' }),
      };
    }
  }
}

/** the sign-in sheet: the AccessID, then the grid's own prompts as they arrive, then the work, or why it stopped */
function signInSheet(f: Facts, d: DirectFacts, useVpn: ButtonView): JourneyView {
  const W = WORDS.direct.signin;
  const app = vpnApp(f);
  const s = d.sheet;
  const value = s?.account ?? d.account;
  const account = { label: W.accountLabel, placeholder: W.accountPlaceholder, ...(value ? { value } : {}) };
  const purpose = s?.purpose ?? 'enrol';
  // the page sends grid-signin-account with the field's value (account phase), grid-signin-answer with each prompt's (prompt phase)
  const submit = button(W.continue, 'ink');
  const cancel = button(W.cancel, 'text', { kind: 'grid-signin-change' });
  const base = { moment: 'sign-in-sheet' as const, title: W.title, account, privacy: W.privacy, submit, cancel, purpose };
  const tryAgain = button(W.tryAgain, 'ink', { kind: 'grid-signin-retry' });
  if (d.key.locked && (!s || s.phase === 'account')) {
    // the page runs the unlock inside the click on its button (core/keyring.ts), then sends unlock-key; a
    // passkey that is gone (Windows Hello reset, the passkey deleted) has its way out: forget this computer
    // here (a new key replaces the grid's line at the next sign-in), or GlobalProtect
    return {
      ...base,
      phase: 'unlock',
      title: W.unlockTitle,
      status: W.unlockBody,
      submit: button(W.unlock, 'ink'),
      useVpn,
      ...(d.unlockFailed ? { problem: { body: W.unlockFailed } } : {}),
      secondary: button(W.cantUnlock, 'text', { kind: 'forget-computer' }),
    };
  }
  if (!s || s.phase === 'account') {
    if (!s && connectionMode(f) === 'direct') return { ...base, phase: 'connecting', status: W.connecting };
    if (!s && d.bridge === 'unknown') return { ...base, phase: 'connecting', status: W.connecting };
    return {
      ...base,
      phase: 'account',
      useVpn,
      ...(d.key.present ? {} : { protect: { label: WORDS.direct.settings.protectKey, note: WORDS.direct.settings.protectKeyNote, available: d.protectOutcome !== 'unsupported' } }),
    };
  }
  switch (s.phase) {
    case 'connecting':
      return { ...base, phase: 'connecting', status: W.connecting };
    case 'prompt': {
      const prompts: SheetPrompt[] = (s.prompts ?? []).map((p) => ({ text: p.text, echo: p.echo, kind: p.kind, ...(p.kind === 'code' ? { hint: W.codeHint } : {}) }));
      return { ...base, phase: 'prompt', prompts, ...(s.instruction ? { instruction: s.instruction } : {}), ...(s.notAccepted ? { notice: W.notAccepted } : {}), useVpn };
    }
    case 'working': {
      const status = s.work === 'setting-up' ? W.settingUp : s.work === 'checking' ? W.checking : s.work === 'claude' ? W.signingInClaude : W.working;
      return { ...base, phase: 'working', status };
    }
    case 'stopped': {
      // GlobalProtect is the way on now; Try again only once the cooldown has passed (the core refuses it before then too)
      const waiting = s.retryAt !== undefined && f.now < s.retryAt;
      const again = waiting ? button(W.tryAgainAt(formatClock(s.retryAt!, true)), 'text', undefined, { disabled: true }) : button(W.tryAgain, 'text', { kind: 'grid-signin-retry' });
      return { ...base, phase: 'stopped', problem: { title: W.stoppedTitle, body: W.stoppedBody(app), button: button(W.useVpn(app), 'ink', { kind: 'use-vpn' }) }, secondary: again };
    }
    case 'code-refused': {
      // the grid's text names both causes: type the code again (first), or say there is no grid code yet (then the route choice);
      // the second time in a row, "I don't have a grid code yet" comes first
      const again = button(W.codeAgain, 'ink', { kind: 'grid-signin-retry' });
      const none = button(W.noCode, 'ink', { kind: 'no-grid-code' });
      const twice = (s.codeRefusals ?? 0) >= 2;
      return {
        ...base,
        phase: 'code-refused',
        problem: { title: W.codeRefusedTitle, body: W.codeRefused, button: twice ? none : again },
        secondary: { ...(twice ? again : none), tone: 'text' },
        useVpn,
      };
    }
    case 'failed': {
      let problem: ProblemView;
      switch (s.failure) {
        case 'wrong-grid':
          // nothing was sent; a quiet Try again checks the grid's identity once more
          problem = { title: W.wrongGridTitle, body: W.wrongGrid, button: button(W.tryAgain, 'text', { kind: 'grid-signin-retry' }) };
          break;
        case 'key-not-taken':
          problem = { title: W.keyNotTakenTitle, body: W.keyNotTaken, button: tryAgain };
          break;
        case 'key-refused':
          problem = { title: W.keyNotTakenTitle, body: W.keyRefused(s.keyRefusal ?? ''), button: tryAgain };
          break;
        case 'key-store':
          problem = { title: W.keyStoreTitle, body: W.keyStore, button: tryAgain };
          break;
        case 'old-copy':
          problem = { title: W.keyNotTakenTitle, body: W.oldCopy };
          break;
        case 'no-shared':
          problem = { body: WORDS.statement.noSharedCopy.body, button: button(WORDS.statement.noSharedCopy.button, 'ink', { kind: 'copy-details' }) };
          break;
        case 'locked':
          problem = { body: W.unlockBody };
          break;
        case 'unreachable':
        case 'no-bridge':
        case 'unsupported':
          problem = { title: W.unreachableTitle, body: W.unreachableBody, button: tryAgain };
          break;
        case 'dropped':
        default:
          problem = { title: W.droppedTitle, body: W.dropped, button: tryAgain };
      }
      return { ...base, phase: 'failed', problem, useVpn };
    }
    default:
      return { ...base, phase: 'working', status: W.working };
  }
}

/** the queue subline's second sentence: the scheduler's estimate when it gives a future one, else the last wait in this browser */
function queueExtra(f: Facts): string | undefined {
  const parts: string[] = [];
  const est = ms(f.run.expectedStart);
  if (est !== undefined && est > f.now) parts.push(WORDS.queue.expected(formatClock(est, true)));
  else if (f.waits.length) parts.push(WORDS.queue.lastTime(f.waits[f.waits.length - 1]!));
  const since = ms(f.run.submittedAt);
  if (since !== undefined && f.now - since >= BUSY_TODAY_MS) parts.push(WORDS.queue.busyToday);
  return parts.length ? parts.join(' ') : undefined;
}

export function loginSetupMoment(s: { phase: LoginSetupMoment['phase']; line: string }): LoginSetupMoment {
  const W = WORDS.loginSetup;
  const open = button(W.open, 'ink', { kind: 'open-terminal-for-login-setup' });
  switch (s.phase) {
    case 'offer':
      return { moment: 'login-setup', phase: 'offer', title: W.title, body: W.body, button: open, line: s.line };
    case 'password':
      return { moment: 'login-setup', phase: 'password', title: W.title, body: W.typePassword, button: button(W.imIn, 'ink', { kind: 'login-setup-in' }), line: s.line };
    case 'checking':
      return { moment: 'login-setup', phase: 'checking', title: W.title, body: W.checking, line: s.line };
    case 'done':
      return { moment: 'login-setup', phase: 'done', title: W.title, body: W.done, line: s.line };
    case 'paste':
      return { moment: 'login-setup', phase: 'paste', title: W.title, body: W.paste, line: s.line, fold: { label: W.whatLine, line: s.line, explain: W.lineExplain } };
    case 'closed':
      return { moment: 'login-setup', phase: 'closed', title: W.title, body: W.notYet, button: open, line: s.line };
  }
}

function pinTipOf(f: Facts): { text: string; done: boolean } | undefined {
  const done = f.once.pin_tip_done_at ? ms(f.once.pin_tip_done_at) : undefined;
  // "Pinned." only for a pin seen (action.onUserSettingsChanged), never for the tip's ×
  if (done !== undefined) return f.pinned === true && f.now - done < PINNED_HOLD_MS && f.once.pin_tip_shown_at ? { text: WORDS.online.pinned, done: true } : undefined;
  if (f.pinned === false) return { text: WORDS.online.pinTip, done: false };
  return undefined;
}

// ---- the home --------------------------------------------------------------------------------------

/** the run's facts are live: the grid is signed in and the files were read in the last two minutes */
function runIsLive(f: Facts): boolean {
  return f.grid.session === 'signed-in' && f.run.present && f.run.checkedAt !== undefined && f.now - f.run.checkedAt < 2 * 60_000 && !f.run.stale;
}

/** the known state a hero state maps to (LAST_KNOWN_KEY, the Worker row's word) */
export function knownOf(state: HeroState): KnownState {
  switch (state) {
    case 'asked':
      return 'asked';
    case 'queued':
    case 'queued-share':
    case 'queued-maintenance':
      return 'queued';
    case 'got-computer':
    case 'connecting':
    case 'slow':
    case 'reconnecting':
      return 'starting';
    case 'needs-claude':
    case 'needs-consent':
      return 'needs-you';
    case 'online-new':
    case 'online':
      return 'online';
    case 'renewing':
      return 'renewing';
    case 'stopping':
    case 'stopped':
      return 'stopped';
    case 'error':
      return 'error';
    default:
      return 'unknown';
  }
}

function orbOf(state: HeroState): Orb {
  switch (state) {
    case 'online':
    case 'online-new':
      return 'online';
    case 'asked':
    case 'queued':
    case 'queued-share':
    case 'queued-maintenance':
      return 'waiting';
    case 'got-computer':
    case 'connecting':
    case 'slow':
    case 'reconnecting':
    case 'renewing':
    case 'stopping':
      return 'starting';
    case 'needs-claude':
    case 'needs-consent':
      return 'needs';
    case 'error':
      return 'error';
    default:
      return 'stopped';
  }
}

/** the live hero state from the run and the connect line */
function liveState(f: Facts): HeroState {
  if (f.connect.inFlight && !f.connect.queued) return 'asked';
  const r = f.run;
  switch (r.phase) {
    case 'queued':
      return r.reason === 'share' ? 'queued-share' : r.reason === 'maintenance' ? 'queued-maintenance' : 'queued';
    case 'got-computer':
      return 'got-computer';
    case 'connecting':
      return 'connecting';
    case 'slow':
      return 'slow';
    case 'reconnecting':
      return 'reconnecting';
    case 'needs-claude':
      return 'needs-claude';
    case 'needs-consent':
      return 'needs-consent';
    case 'online':
      return f.onlineAnnouncedAt !== undefined && f.now - f.onlineAnnouncedAt < ONLINE_HOLD_MS ? 'online-new' : 'online';
    case 'renewing':
      return 'renewing';
    case 'error':
      return 'error';
    case 'stopped':
    case 'ended':
      return 'stopped';
    default:
      if (f.connect.failure && f.connect.failure !== 'password') return 'error';
      return f.connect.queued ? 'queued' : 'stopped';
  }
}

/** the hero from a stored state (last known), for a grid that cannot be read now */
function knownHeroState(k: KnownState | undefined): HeroState {
  switch (k) {
    case 'asked':
      return 'asked';
    case 'queued':
      return 'queued';
    case 'starting':
      return 'connecting';
    case 'needs-you':
      return 'needs-claude';
    case 'online':
      return 'online';
    case 'renewing':
      return 'renewing';
    case 'stopped':
      return 'stopped';
    case 'error':
      return 'error';
    default:
      return 'unknown';
  }
}

/** the hero, and whether it is the last known state rather than a live one */
export function heroOf(f: Facts): HeroView & { live: boolean } {
  const title = f.run.title ?? f.lastKnown?.title ?? f.site.title;
  const app = vpnApp(f);
  const live = runIsLive(f) || (f.connect.inFlight && f.grid.session === 'signed-in');
  if (!live) {
    const k = f.lastKnown?.state;
    const asOfClock = f.lastKnown?.seen_at ? formatClock(f.lastKnown.seen_at, true) : undefined;
    if (f.grid.session === 'unreachable' || f.grid.reach === 'no-route') {
      // 12.0.0: on the direct way the VPN is not the question
      if (connectionMode(f) === 'direct') return { state: 'unreachable', orb: 'stopped', word: WORDS.home.unreachableHero, sub: WORDS.direct.unreachableSub, announce: WORDS.home.unreachableHero, live: false };
      if (k === 'online' || k === 'starting' || k === 'queued' || k === 'renewing' || k === 'needs-you') {
        return { state: 'unreachable', orb: 'stopped', word: WORDS.home.unreachableHero, sub: WORDS.home.unreachableSub(app), announce: WORDS.home.unreachableHero, live: false };
      }
      return { state: 'unreachable', orb: 'stopped', word: WORDS.home.unreachableHero, sub: `Is ${app} on?`, announce: WORDS.home.unreachableHero, live: false };
    }
    if (f.lastKnown && (f.grid.session === 'signed-out' || f.grid.session === 'unknown' || f.run.stale || !f.run.present)) {
      const s = knownHeroState(k);
      const base = staticHero(f, s === 'online-new' ? 'online' : s, title);
      return { ...base, ...(asOfClock && f.grid.session !== 'unknown' ? { asOf: WORDS.home.asOf(asOfClock) } : {}), live: false };
    }
  }
  const s = liveState(f);
  return { ...liveHero(f, s, title), live: true };
}

/** a hero for a state whose words need no live clock (the last known state) */
function staticHero(f: Facts, s: HeroState, title: string): HeroView {
  const H = WORDS.home;
  const at = (word: string, sub?: string): HeroView => ({ state: s, orb: orbOf(s), word, ...(sub ? { sub } : {}), announce: word });
  switch (s) {
    case 'online':
    case 'online-new': {
      const since = ms(f.lastKnown?.online_since);
      return at(H.onlineHero, since !== undefined ? H.onlineSub(title, f.now - since) : title);
    }
    case 'queued':
    case 'queued-share':
    case 'queued-maintenance':
      return at(WORDS.queue.hero);
    case 'asked':
      return at(WORDS.connect.hero);
    case 'got-computer':
    case 'connecting':
    case 'slow':
    case 'reconnecting':
      return at(WORDS.starting.hero);
    case 'needs-claude':
    case 'needs-consent':
      return at(H.needsHero, H.needsSub);
    case 'renewing':
      return at(H.renewingHero, H.renewingSub(f.site.hours));
    case 'error':
      return at(H.errorHero, WORDS.queue.couldntStart);
    case 'stopped':
    case 'stopping':
    case 'unknown':
    default:
      return { state: s === 'unknown' ? 'unknown' : 'stopped', orb: 'stopped', word: H.stoppedHero, sub: H.stoppedSub, announce: H.stoppedHero };
  }
}

function liveHero(f: Facts, s: HeroState, title: string): HeroView {
  const H = WORDS.home;
  const r = f.run;
  const hero = (word: string, extra: Partial<HeroView> = {}): HeroView => ({ state: s, orb: orbOf(s), word, announce: word, ...extra });
  switch (s) {
    case 'asked':
      return hero(WORDS.connect.hero);
    case 'queued':
    case 'queued-share':
    case 'queued-maintenance': {
      const word = s === 'queued-share' ? WORDS.queue.shareHero : s === 'queued-maintenance' ? WORDS.queue.maintenanceHero : WORDS.queue.hero;
      const first = s === 'queued-share' ? WORDS.queue.shareSub : s === 'queued-maintenance' ? WORDS.queue.maintenanceSub : WORDS.queue.homeSub;
      const extra = queueExtra(f);
      const sub = extra ? `${first} ${extra}` : first;
      // the timer is the hero while in line (spec: no primary while asked, in line, starting or renewing);
      // a chain successor shows no queue clock counted from hours ago (R10)
      return r.submittedAt && !r.renewal ? hero(word, { sub, timer: { since: r.submittedAt }, timerPlace: 'before' }) : hero(word, { sub });
    }
    case 'got-computer':
      return r.gotComputerAt ? hero(WORDS.starting.hero, { sub: WORDS.starting.gotComputer, timer: { since: r.gotComputerAt }, timerPlace: 'after' }) : hero(WORDS.starting.hero, { sub: WORDS.starting.gotComputer });
    case 'connecting':
      return hero(WORDS.starting.hero, { sub: WORDS.starting.connecting });
    case 'slow':
      return hero(WORDS.starting.slowHero, { sub: WORDS.starting.slowSub });
    case 'reconnecting':
      return hero(H.reconnectingHero, { sub: H.reconnectingSub });
    case 'needs-claude':
      return hero(H.needsHero, { sub: H.needsSub });
    case 'needs-consent':
      return hero(H.needsHero, { sub: H.needsConsentSub });
    case 'online-new': {
      const since = ms(r.onlineAt) ?? ms(f.lastKnown?.online_since);
      return hero(WORDS.online.hero, { sub: r.readyMinutes !== undefined ? WORDS.online.ready(r.readyMinutes, title) : since !== undefined ? H.onlineSub(title, f.now - since) : title, burst: true, announce: WORDS.online.hero });
    }
    case 'online': {
      // "up …" only from a time the grid gave; never counted from this moment
      const since = ms(r.onlineAt) ?? ms(f.lastKnown?.online_since);
      return hero(H.onlineHero, { sub: r.badLink ? WORDS.online.badLink(title) : since !== undefined ? H.onlineSub(title, f.now - since) : title, ...(since !== undefined ? { timer: { since: new Date(since).toISOString() } } : {}) });
    }
    case 'renewing':
      return hero(H.renewingHero, { sub: H.renewingSub(f.site.hours) });
    case 'error':
      return hero(H.errorHero, { sub: connectProblem(f.connect.failure)?.body ?? WORDS.queue.couldntStart });
    case 'stopped':
    default:
      return hero(H.stoppedHero, { sub: H.stoppedSub });
  }
}

function primaryOf(f: Facts, hero: HeroView): HomePrimary | undefined {
  const H = WORDS.home;
  const link = f.run.link ?? f.lastKnown?.environment_url;
  const open: HomePrimary = { kind: 'open-session', button: button(H.openSession, 'teal', { kind: 'open-session' }) };
  const connect: HomePrimary = { kind: 'connect', button: button(f.press?.kind === 'connect' ? WORDS.statement.connectingWhenReady : H.connect, 'ink', { kind: 'connect' }, f.press?.kind === 'connect' ? { busy: true } : {}), reminder: H.connectReminder };
  switch (hero.state) {
    case 'online':
    case 'online-new':
      return link ? open : undefined;
    case 'needs-claude':
      return { kind: 'sign-in-claude', button: button(H.signInClaude, 'ink', { kind: 'sign-in-claude' }) };
    case 'needs-consent':
      return connect;
    case 'error':
      return { kind: 'retry', button: button(H.tryAgain, 'ink', { kind: 'retry' }) };
    case 'stopped':
    case 'unknown':
      return connect;
    case 'unreachable':
      return f.lastKnown?.state === 'online' && link ? open : connect;
    default:
      return undefined;
  }
}

function rowsOf(f: Facts, hero: HeroView & { live: boolean }): StatusRows {
  const H = WORDS.home;
  const g = f.grid;
  const grid: StatusRows['grid'] =
    g.session === 'signed-in'
      ? { state: 'signed-in', text: H.gridSignedIn(g.account ?? '') }
      : g.session === 'unreachable' || g.reach === 'no-route'
        ? { state: 'unreachable', text: H.gridUnreachable }
        : g.session === 'signed-out' || g.session === 'not-ood'
          ? { state: 'signed-out', text: H.gridSignedOut, link: button(H.gridSignIn, 'link', { kind: 'sign-in-grid' }) }
          : { state: 'checking', text: H.checking };
  // 12.0.0: how the grid is reached, beside the account
  if (f.direct) {
    const mode = connectionMode(f);
    const via: NonNullable<StatusRows['grid']['via']> = mode === 'vpn' ? { mode: 'vpn', text: WORDS.direct.rowVpn(vpnApp(f)) } : { mode: 'direct', text: WORDS.direct.rowDirect };
    if (f.direct.key.locked && mode !== 'vpn') via.locked = { text: WORDS.direct.rowLocked, unlock: WORDS.direct.rowUnlock };
    grid.via = via;
  }
  const c = f.run.claude;
  const claude: StatusRows['claude'] =
    c && hero.live
      ? c.loggedIn
        ? { state: 'signed-in', text: planWord(c.plan) ? H.claudeSignedIn(planWord(c.plan)!) : H.claudeSignedIn('Claude') }
        : { state: 'needs', text: H.claudeNeeds, link: button(H.claudeSignIn, 'link', { kind: 'sign-in-claude' }) }
      : f.run.phase === 'needs-claude' && hero.live
        ? { state: 'needs', text: H.claudeNeeds, link: button(H.claudeSignIn, 'link', { kind: 'sign-in-claude' }) }
        : { state: 'unknown', text: H.unknown };
  let worker: StatusRows['worker'];
  if (!hero.live) {
    const k = f.lastKnown?.state ?? 'unknown';
    const word = k === 'online' ? 'online' : k === 'queued' ? 'in line' : k === 'starting' ? 'starting' : k === 'renewing' ? 'renewing' : k === 'needs-you' ? 'needs you' : k === 'error' ? "couldn't start" : 'stopped';
    worker = f.lastKnown?.seen_at && f.grid.session !== 'unknown' ? { state: 'as-of', text: H.workerAsOf(formatClock(f.lastKnown.seen_at, true), word) } : f.lastKnown ? { state: k, text: workerWord(k, f) } : { state: 'unknown', text: H.checking };
  } else {
    const k = knownOf(hero.state);
    worker = { state: k, text: workerWord(k, f, hero.state) };
  }
  return { grid, claude, worker };
}

function workerWord(k: KnownState, f: Facts, hero?: HeroState): string {
  const H = WORDS.home;
  switch (k) {
    case 'online':
      return H.workerOnline(formatAgo(f.now - (f.run.checkedAt ?? f.now)));
    case 'queued':
      return H.workerInLine(minutesSince(f, f.run.submittedAt));
    case 'asked':
      return H.workerAsking;
    case 'starting':
      return hero === 'reconnecting' ? H.reconnectingHero : H.workerStarting;
    case 'renewing':
      return H.workerRenewing;
    case 'needs-you':
      return H.workerNeeds;
    case 'error':
      return H.workerError;
    case 'stopped':
      return H.workerStopped;
    default:
      return H.checking;
  }
}

/** the home panel */
export function home(f: Facts): HomeView {
  const H = WORDS.home;
  const hero = heroOf(f);
  const { live, ...heroView } = hero;
  const title = f.run.title ?? f.lastKnown?.title ?? f.site.title;
  const link = f.run.link ?? f.lastKnown?.environment_url;
  const onlineNow = hero.state === 'online' || hero.state === 'online-new';
  const lastOnline = !live && f.lastKnown?.state === 'online';
  const k = knownOf(hero.state);
  const waiting = hero.state === 'asked' || k === 'queued' || k === 'starting' || hero.state === 'renewing';
  // the track stays, all done, while "You're online." holds, and folds away when the home settles into "Online"
  const trackNow = hero.state === 'asked' ? 0 : k === 'queued' ? 1 : k === 'starting' ? 2 : hero.state === 'online-new' ? 4 : undefined;
  const r = f.run;
  const endsAt = ms(r.endsAt ?? f.lastKnown?.ends_at);
  const foot: HomeView['foot'] = {
    ...(live && (onlineNow || k === 'starting' || k === 'needs-you') && endsAt !== undefined && r.chain ? { left: H.renews(formatClock(endsAt, true)) } : live && k === 'queued' && r.submittedAt ? { left: H.asked(formatClock(r.submittedAt, true)) } : {}),
    ...(live && (onlineNow || k === 'starting' || k === 'needs-you' || hero.state === 'renewing') ? { right: button(H.stop, 'text', { kind: 'stop' }) } : live && k === 'queued' ? { right: button(H.cancel, 'text', { kind: 'stop' }) } : {}),
    // "Cancel" while in line gives up a place in line, and no session exists yet to end
    confirm: live && k === 'queued' ? { text: H.confirmCancel, stop: button(H.confirmCancelButton, 'text', { kind: 'stop' }), keep: H.keep } : { text: H.confirm, stop: button(H.confirmStop, 'text', { kind: 'stop' }), keep: H.keep },
    stopping: f.stopping,
  };
  const firstOnline = ms(f.once.first_online_at);
  const tryAsking = onlineNow && firstOnline !== undefined && f.now - firstOnline < TRY_ASKING_MS && !f.once.try_asking_dismissed_at ? { eyebrow: H.tryAsking, prompts: H.prompts, copied: H.promptCopied, dismiss: { kind: 'dismiss', card: 'try-asking' } as Action } : undefined;
  // at most one one-time card at a time, so the home fits 360 x 658 with the log closed: the pin tip first
  // (it is about this browser, once), then the tour's card
  const cards: HomeView['cards'] = [];
  const pin = onlineNow ? pinTipOf(f) : undefined;
  if (pin) cards.push({ id: 'pin-tip', text: pin.text, ...(pin.done ? { done: true } : {}), dismiss: { kind: 'dismiss', card: 'pin-tip' } });
  else if (onlineNow && !f.tourSeen && !f.once.tour_auto_played_at && !f.once.tour_card_dismissed_at) cards.push({ id: 'tour-card', text: H.tourCard, open: { kind: 'tour', event: 'start' }, dismiss: { kind: 'dismiss', card: 'tour-card' } });
  return {
    header: {
      wordmark: WORDS.product,
      moreLabel: H.more,
      menu: [
        { label: H.menu.tour, action: { kind: 'tour', event: 'start' } },
        { label: H.menu.files, action: { kind: 'open-files' } },
        { label: H.menu.settings, action: { kind: 'open-settings' } },
        { label: H.menu.details, action: { kind: 'open-details' } },
        { label: H.menu.help, action: { kind: 'open-help' } },
      ],
    },
    hero: heroView,
    ...((waiting || hero.state === 'online-new') && trackNow !== undefined && live ? { track: track(trackNow as 0 | 1 | 2 | 4) } : {}),
    ...(() => {
      const p = primaryOf(f, hero);
      return p ? { primary: p } : {};
    })(),
    ...((onlineNow || lastOnline) && link ? { secondary: { newSession: button(H.newSession, 'outline', { kind: 'new-session' }), copyLink: H.copyLink, phone: H.phone } } : {}),
    ...(link ? { link } : {}),
    title,
    rows: rowsOf(f, hero),
    foot,
    ...(tryAsking ? { tryAsking } : {}),
    cards,
    log: { show: H.showLog, hide: H.hideLog, copy: H.copyLog, ...(f.log ? { lines: f.log } : {}) },
    ...(f.toast ? { toast: f.toast } : {}),
  };
}

// ---- the panel and the toolbar ---------------------------------------------------------------------

/** the tour's view; the page plays the bundled diagram, or skips silently if it fails to load */
export function tourView(source: 'auto' | 'menu'): TourView {
  return { source, captions: WORDS.tour.captions, sceneMs: 4000, assets: { script: '/tour/diagram.js', style: '/tour/diagram.css' }, prompts: WORDS.home.prompts };
}

/** the tour plays once during the first wait in which nothing is asked of the student, and closes when the panel needs them or the worker is online */
function autoTour(f: Facts, moment: JourneyView['moment']): boolean {
  if (f.tourSeen) return false;
  // once: a panel opened again later in the same wait does not play it again (the one playing keeps its slot)
  const began = ms(f.once.tour_auto_played_at);
  if (began !== undefined && f.now - began > 5 * 60_000) return false;
  if (moment !== 'queue') return false;
  if (f.connect.signin === 'asked' || f.connect.signin === 'link' || f.connect.signin === 'checking') return false;
  return true;
}

/** the toolbar's badge, title and icon (no permission needed) */
export function toolbarView(f: Facts): ToolbarView {
  if (!f.terms) return { title: WORDS.toolbar.plain, lit: false };
  const hero = heroOf(f);
  const T = WORDS.toolbar;
  switch (hero.state) {
    case 'online':
    case 'online-new': {
      const since = ms(f.run.onlineAt) ?? ms(f.lastKnown?.online_since);
      return { title: since !== undefined ? T.onlineFor(f.now - since) : T.online, lit: hero.live };
    }
    case 'queued':
    case 'queued-share':
    case 'queued-maintenance': {
      const m = minutesSince(f, f.run.submittedAt);
      return hero.live ? { badge: { text: `${m}m`, color: 'ochre' }, title: T.inLine(m), lit: false } : { title: T.plain, lit: false };
    }
    case 'asked':
    case 'got-computer':
    case 'connecting':
    case 'slow':
    case 'reconnecting':
    case 'renewing':
      return hero.live ? { badge: { text: '…', color: 'ochre' }, title: T.starting, lit: false } : { title: T.plain, lit: false };
    case 'needs-claude':
    case 'needs-consent':
      return { badge: { text: '!', color: 'ochre' }, title: T.needsYou, lit: false };
    case 'error':
      return { badge: { text: '!', color: 'brick' }, title: T.error, lit: false };
    default:
      return { title: T.plain, lit: false };
  }
}

/** the first run is over once this browser has seen the worker online (ONCE_KEY.first_online_at) */
export function firstRunDone(f: Facts): boolean {
  return !!f.once.first_online_at;
}

/** the side panel */
export function panelView(f: Facts): PanelView {
  // before the agreement: the welcome page carries the first moment; the panel opened beside it in the
  // same click says what is happening there ("Almost there."), never that the terms were not accepted
  // while Chrome's box is up
  if (!f.terms) return { kind: 'journey', journey: journey(f, 'welcome'), overlays: { toolbar: toolbarView(f) } };
  const toolbar = toolbarView(f);
  const overlays = (moment?: JourneyView['moment']) => ({
    toolbar,
    ...(f.workingInTab ? { workingInTab: true } : {}),
    ...(f.toast ? { toast: f.toast } : {}),
    ...(f.tourFromMenu ? { tour: tourView('menu') } : moment && autoTour(f, moment) ? { tour: tourView('auto') } : {}),
  });
  // the portal's grant taken away after the first run: one press puts it back
  if (f.portal && !f.granted && firstRunDone(f)) return { kind: 'journey', journey: journey(f, 'welcome'), overlays: overlays('welcome') };
  if (!firstRunDone(f)) {
    const moment = momentOf(f);
    return { kind: 'journey', journey: journey(f, moment), overlays: overlays(moment) };
  }
  const needs = studentMoment(f);
  if (needs) return { kind: 'journey', journey: journey(f, needs), overlays: overlays(needs) };
  if (f.onlineAnnouncedAt !== undefined && f.now - f.onlineAnnouncedAt < ONLINE_HOLD_MS && f.run.phase === 'online') return { kind: 'journey', journey: journey(f, 'online'), overlays: overlays('online') };
  return { kind: 'home', home: home(f), overlays: overlays() };
}

/** the stored state for LAST_KNOWN_KEY from the facts, when they are live; undefined when nothing live is known */
export function lastKnownOf(f: Facts): Omit<LastKnown, 'seen_at'> | undefined {
  const hero = heroOf(f);
  if (!hero.live) return undefined;
  const state = knownOf(hero.state);
  return {
    worker_name: f.statement.workerName,
    state,
    title: f.run.title ?? f.site.title,
    ...(f.run.link ? { environment_url: f.run.link } : f.lastKnown?.environment_url ? { environment_url: f.lastKnown.environment_url } : {}),
    ...(state === 'online' && f.run.onlineAt ? { online_since: f.run.onlineAt } : state === 'online' && f.lastKnown?.online_since ? { online_since: f.lastKnown.online_since } : {}),
    ...(f.run.endsAt && f.run.chain ? { ends_at: f.run.endsAt } : {}),
    ...(f.grid.account ? { account: f.grid.account } : {}),
  };
}

// ---- the welcome page ------------------------------------------------------------------------------

export interface WelcomeInput {
  /** the portal the press asks Chrome for: the profile's ood_base_url, or the one stored */
  portal: { origin: string; hostname: string };
  site: SiteWords;
  state: WelcomeView['state'];
  problem?: string;
  /** the panel's hero, mirrored in the hand-off state */
  hero?: HeroView;
  licenseUrl: string;
  privacyUrl: string;
}

export function welcomeView(i: WelcomeInput): WelcomeView {
  const W = WORDS.welcome;
  const links = [i.site.gridAccountHelpUrl ?? 'https://services.wayne.edu/TDClient/277/Portal/KB/ArticleDet?ID=20199', i.site.vpnHelpUrl ?? 'https://services.wayne.edu/TDClient/277/Portal/KB/Article/20314/Wayne-State-VPN-and-the-Global-Protect-client', 'https://claude.ai/upgrade'];
  const needs = W.needs.map((n, idx) => ({ title: n.title, detail: idx === 1 && i.site.vpnPortal ? `Connected to ${i.site.vpnPortal}.` : n.detail, link: { label: n.link, url: links[idx]! } }));
  return {
    headline: W.headline,
    subline: W.subline,
    needsTitle: W.needsTitle,
    needs,
    summaryTitle: W.summaryTitle,
    summary: [...SUMMARY],
    ticks: ticks().map((t) => ({ id: t.id, bold: t.bold, ...(t.soft ? { soft: t.soft } : {}) })),
    terms: { show: W.showTerms, hide: W.hideTerms, licenseUrl: i.licenseUrl, privacyUrl: i.privacyUrl, links: { openInTab: W.openInTab, save: W.saveCopy, print: W.print } },
    agree: { label: W.agree, busyLabel: W.opening },
    allowNote: W.allowNote(i.portal.hostname),
    footer: { nothingLeaves: W.footerNothingLeaves, otherPortal: W.footerOtherPortal },
    portal: { origin: i.portal.origin, hostname: i.portal.hostname, fieldLabel: "Your grid's address", usePortal: W.usePortal },
    state: i.state,
    ...(i.problem ? { problem: i.problem } : i.state === 'denied' ? { problem: W.denied(i.portal.hostname) } : i.state === 'no-panel' ? { problem: W.panelNotOpened } : i.state === 'save-failed' ? { problem: W.saveFailed } : {}),
    ...(i.state === 'handoff' ? { handoff: { text: W.handoff, ...(i.hero ? { hero: i.hero } : {}) } } : {}),
  };
}

// ---- Show log --------------------------------------------------------------------------------------

/** the log line words for Beethoven's own events (keys.ts ActivityEntry.text is one of these) */
export const LOG = LOG_WORDS;

/** a failure's one line for Show log (never the tool's own sentence) */
export function failureLogWords(failure: ConnectFailure): string {
  return connectProblem(failure)?.body ?? WORDS.connect.refused;
}

// ---- for the checks and Details ---------------------------------------------------------------------

/** the step names the 10.0.0 strip used are gone; Details reads these */
export function describeMoment(f: Facts): string {
  return f.terms ? (firstRunDone(f) ? `home: ${heroOf(f).state}` : `journey: ${momentOf(f)}`) : 'terms-needed';
}
