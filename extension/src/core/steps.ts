// The flight strip's state machine. One pure function turns the facts the panel has gathered
// into the one step the student is on: what the status line says, whether the extension acts by
// itself now (auto) and what it does, or the ONE button the student is offered. Steps come in a
// fixed order and the first one not satisfied is the step. Nothing here touches the browser or
// the portal, so the whole sequence is tested in Node.
//
// Order: portal tab open -> portal awake and signed in -> terms accepted -> access approved ->
// tool installed -> probe run -> signed in to Claude on the cluster -> data statement -> worker
// started -> worker online -> open in Claude.
import type { WorkerState } from './contract';
import type { AccessFact } from '../licensing/access';
import { PRODUCT_NAME } from './terms';

export type StepId = 'portal' | 'warm' | 'terms' | 'access' | 'install' | 'probe' | 'login' | 'statement' | 'start' | 'online' | 'open';

export const STEP_ORDER: StepId[] = ['portal', 'warm', 'terms', 'access', 'install', 'probe', 'login', 'statement', 'start', 'online', 'open'];

/** the student's words for each step, for the strip's counter */
export const STEP_TITLES: Record<StepId, string> = {
  portal: 'Your portal',
  warm: 'Waking up your portal',
  terms: 'The agreement',
  access: 'Your access',
  install: 'Setting up the cluster',
  probe: 'Checking a compute node',
  login: 'Signing in to Claude on the cluster',
  statement: 'Where your work goes',
  start: 'Starting your worker',
  online: 'Waiting for your worker',
  open: 'Open in Claude',
};

/** what the extension does by itself, or what the one button does */
export type Action = 'connect' | 'open-setup' | 'open-portal' | 'warm' | 'accept-terms' | 'check-access' | 'retry-access' | 'ask-access' | 'install' | 'probe' | 'login' | 'acknowledge' | 'start' | 'poll' | 'open-claude' | 'retry-warm' | 'retry-install' | 'retry-probe' | 'retry-login' | 'retry-start';

export interface Facts {
  portal: {
    connected: boolean;
    granted: boolean;
    alive: boolean;
    hostname?: string;
    /** the tab the toolbar button was clicked from, when it looks like Open OnDemand and is not connected */
    candidate?: { origin: string; hostname: string; tabId: number };
  };
  warm: {
    state: 'unknown' | 'warming' | 'warm' | 'cold' | 'unreachable' | 'signed-out';
    detail?: string;
  };
  terms: boolean;
  /** the access service's word on the signed-in account (licensing/access.ts accessFact), from storage; never a network call here */
  access: AccessFact;
  install: {
    /** undefined until the home directory has been listed */
    installed?: boolean;
    /** the tool on the cluster is older than the one this build carries (~/.hpcworker/VERSION against the bundled VERSION); never set for the lab's shared copy */
    outdated?: { installed: string; bundled: string };
    /** the account runs the lab's shared copy (~/.hpcworker/shared names its folder); its VERSION as the Files app read it, or why it could not be read */
    shared?: { dir: string; version?: string; unreadable?: string };
    /** the account's own copy's VERSION (~/.hpcworker/VERSION), when it runs its own copy */
    version?: string;
    /** the shared folder the bundled site profile names: the install links to it instead of uploading */
    sharedRoot?: string;
    installing?: boolean;
    failed?: string;
  };
  probe: {
    /** undefined until the state directory has been read */
    present?: boolean;
    /** the probe's own verdict on the compute node (container runs, egress, node temp) */
    ok?: boolean;
    detail?: string;
    /** a probe job was submitted by the strip this recently (ms since epoch) */
    submittedAt?: number;
    submitting?: boolean;
    failed?: string;
  };
  login: {
    /** undefined when nothing has said either way yet */
    loggedIn?: boolean;
    detail?: string;
    /** when the login terminal in this browser last reported SIGNED-IN (ms since epoch) */
    seenAt?: number;
    /** the login terminal is open in the panel */
    inProgress?: boolean;
    failed?: string;
  };
  statement: {
    acknowledged: boolean;
    workerName: string;
    /** when the consent marker was written on the cluster for this statement (ms since epoch) */
    consentWrittenAt?: number;
    /** why the workspace may not host a worker, when it may not */
    restricted?: string;
  };
  run: {
    present: boolean;
    live: boolean;
    state?: WorkerState;
    /** the job's own word on what the student must do now (status.json "needs": login | consent | nothing) */
    needs?: string;
    /** the job's one sentence for that */
    hint?: string;
    job?: string;
    message?: string;
    /** the environment link, already checked to be a claude.ai/code link */
    url?: string;
    sessionName?: string;
    nextJob?: string;
    /** when the run was recorded here (ms since epoch) */
    setAt?: number;
    /** a start is in flight */
    starting?: boolean;
    failed?: string;
    /** ms until the scheduler may be asked again (0 when now) */
    schedulerWaitMs: number;
    /** the student pressed Stop: a stopped worker stays stopped until they start it */
    stoppedByStudent?: boolean;
    /** the student pressed the start button: a stopped or failed run may be started again (waiting out the floor if it must) */
    startRequested?: boolean;
  };
  /** this environment link was already opened by the extension in this browser */
  opened: boolean;
  /** the setting "open claude.ai when the worker connects" */
  autoOpen: boolean;
}

export interface StripView {
  step: StepId;
  index: number;
  total: number;
  title: string;
  /** the one status line */
  status: string;
  /** the ONE button, only when the student must act */
  primary?: { label: string; action: Action };
  /** what the extension does by itself now, when nothing needs the student */
  auto?: Action;
  /** the auto action must wait this long first (the 60 s scheduler floor) */
  waitMs?: number;
  /** the strip shows an input for this step (the statement, the login terminal) */
  input?: 'statement' | 'terminal';
  /** everything is green: the green button is shown */
  done: boolean;
  tone: 'info' | 'busy' | 'wait' | 'fail' | 'ok';
}

/** a run recorded this recently may still be queued with no status.json yet */
export const FRESH_RUN_MS = 10 * 60_000;
/** a probe submitted this recently is still running or queued; do not submit another */
export const PROBE_PATIENCE_MS = 15 * 60_000;
/** a sign-in made from this browser this recently counts as signed in, whatever an older file says */
export const LOGIN_SEEN_FRESH_MS = 10 * 60_000;
/** a job still saying need_login this long after that sign-in did not get it (it re-asks every 60 s): the login step returns */
export const LOGIN_RECHECK_PATIENCE_MS = 3 * 60_000;
/** a consent marker written this recently has not been seen by the job yet (it re-reads the marker every heartbeat) */
export const CONSENT_PATIENCE_MS = 3 * 60_000;

function view(step: StepId, rest: Omit<StripView, 'step' | 'index' | 'total' | 'title' | 'done'> & { done?: boolean }): StripView {
  return { step, index: STEP_ORDER.indexOf(step) + 1, total: STEP_ORDER.length, title: STEP_TITLES[step], done: false, ...rest };
}

export function decide(f: Facts, now = Date.now()): StripView {
  // 1. the portal tab
  if (!f.portal.connected) {
    if (f.portal.candidate) return view('portal', { status: `This tab is ${f.portal.candidate.hostname}. Connect it as your portal; the browser will ask you to allow that one site.`, primary: { label: 'Connect this portal', action: 'connect' }, tone: 'info' });
    return view('portal', { status: `Open your Open OnDemand portal in a tab and click the ${PRODUCT_NAME} button there.`, primary: { label: 'Setup page', action: 'open-setup' }, tone: 'info' });
  }
  if (!f.portal.granted) return view('portal', { status: `Access to ${f.portal.hostname ?? 'your portal'} was taken away in the browser. Allow it again.`, primary: { label: 'Allow the portal again', action: 'connect' }, tone: 'fail' });
  if (!f.portal.alive) return view('portal', { status: `Open ${f.portal.hostname ?? 'your portal'} in a tab and keep it open; ${PRODUCT_NAME} works from that tab.`, primary: { label: 'Open my portal', action: 'open-portal' }, tone: 'info' });

  // 2. the portal is awake and signed in
  switch (f.warm.state) {
    case 'unknown':
      return view('warm', { status: 'Waking up your portal...', auto: 'warm', tone: 'busy' });
    case 'warming':
      return view('warm', { status: 'Waking up your portal...', tone: 'busy' });
    case 'cold':
      return view('warm', { status: f.warm.detail ?? 'Your portal did not wake up. Try again in a moment.', primary: { label: 'Try again', action: 'retry-warm' }, tone: 'fail' });
    case 'unreachable':
      return view('warm', { status: f.warm.detail ?? 'Your portal could not be reached. Connect the VPN and open the portal in a tab.', primary: { label: 'Open my portal', action: 'open-portal' }, tone: 'fail' });
    case 'signed-out':
      return view('warm', { status: f.warm.detail ?? 'Sign in to your portal in its tab, then come back here.', primary: { label: 'Open my portal', action: 'open-portal' }, tone: 'wait' });
    case 'warm':
      break;
  }

  // 3. the agreement, once per browser profile
  if (!f.terms) return view('terms', { status: 'Read and accept the agreement once; it opens on the setup page.', primary: { label: 'Read the agreement', action: 'accept-terms' }, tone: 'info' });

  // 4. approval by Licensor's access service, for the account the portal shows; read-only checks
  // are not blocked on it, the worker is. The background asks the service (check-access); the
  // strip only ever offers the request page (ask-access) or a fresh attempt (retry-access).
  const a = f.access;
  if (!a.ok) {
    switch (a.state) {
      case 'version-revoked':
        return view('access', { status: a.detail, tone: 'fail' });
      case 'checking':
        return view('access', { status: 'Checking your access...', auto: a.needsCheck ? 'check-access' : undefined, tone: 'busy' });
      case 'denied':
        return view('access', { status: `Your account ${a.accessId ?? ''}${a.portal ? ` at ${a.portal}` : ''} is not on the approved list yet. Ask for access; once it is approved, click the ${PRODUCT_NAME} button again.`, primary: { label: 'Ask for access', action: 'ask-access' }, tone: 'info' });
      case 'withdrawn':
        return view('access', { status: a.detail, primary: { label: 'Ask again', action: 'ask-access' }, tone: 'fail' });
      case 'no-identity':
        return view('access', { status: "Your portal's dashboard does not show who is signed in, so your access cannot be checked. Open the portal in a tab, sign in there, and try again.", primary: { label: 'Check again', action: 'retry-access' }, tone: 'fail' });
      case 'lapsed':
      case 'unreachable':
      case 'failed':
      default:
        return view('access', { status: a.detail, primary: { label: a.state === 'lapsed' ? 'Check again' : 'Try again', action: 'retry-access' }, tone: 'fail' });
    }
  }

  // 5. the tool on the cluster: the lab's shared copy where the site keeps one (nothing uploaded),
  // else the student's own copy (uploaded); the line says which
  const lab = !!f.install.sharedRoot;
  if (f.install.installing) return view('install', { status: lab ? "Setting up the cluster (pointing your account at your lab's shared copy of the tool)..." : 'Setting up the cluster (uploading the tool and installing it once)...', tone: 'busy' });
  if (f.install.failed) return view('install', { status: `Setting up the cluster failed: ${f.install.failed}`, primary: { label: 'Try again', action: 'retry-install' }, tone: 'fail' });
  if (f.install.installed === undefined) return view('install', { status: 'Looking at your cluster home...', auto: 'poll', tone: 'busy' });
  if (!f.install.installed) return view('install', { status: lab ? "Setting up the cluster with your lab's shared copy of the tool..." : 'Setting up the cluster...', auto: 'install', tone: 'busy' });
  // an older own copy is set up again: the same way (upload, one install line), or, where the lab
  // keeps a shared copy, by moving to that; either way the tool keeps the profile
  if (f.install.outdated) return view('install', { status: lab ? `Moving your account to your lab's shared copy of the tool (your own copy is version ${f.install.outdated.installed})...` : `Updating the tool on the cluster (version ${f.install.outdated.installed} to ${f.install.outdated.bundled})...`, auto: 'install', tone: 'busy' });

  // 6. the probe: once, in the background
  if (f.probe.submitting) return view('probe', { status: 'Asking for a compute node to check (a short job (ten minutes at most))...', tone: 'busy' });
  if (f.probe.failed) return view('probe', { status: `The check job could not be submitted: ${f.probe.failed}`, primary: { label: 'Try again', action: 'retry-probe' }, tone: 'fail' });
  if (f.probe.present === undefined) return view('probe', { status: 'Reading what the compute node said...', auto: 'poll', tone: 'busy' });
  if (!f.probe.present) {
    if (f.probe.submittedAt && now - f.probe.submittedAt < PROBE_PATIENCE_MS) return view('probe', { status: 'Checking a compute node (about ten minutes; you can leave this open)...', auto: 'poll', tone: 'busy' });
    if (f.run.schedulerWaitMs > 0) return view('probe', { status: `Checking a compute node in ${Math.ceil(f.run.schedulerWaitMs / 1000)} s (the scheduler is asked at most once a minute)...`, auto: 'probe', waitMs: f.run.schedulerWaitMs, tone: 'wait' });
    return view('probe', { status: 'Checking a compute node (a short job (ten minutes at most))...', auto: 'probe', tone: 'busy' });
  }
  if (f.probe.ok === false) return view('probe', { status: f.probe.detail ?? 'The compute node check failed.', primary: { label: 'Check again', action: 'retry-probe' }, tone: 'fail' });

  // 7. signed in to Claude on the cluster. A live job's own word (need_login, needs=login) wins over
  // an old probe; a sign-in made from this browser in the last minutes wins over a stale file; and a
  // job that still says need_login right after that sign-in is given three minutes to re-ask (it
  // does so every 60 s) before the login step returns. A dead run's last need_login is not a fact
  // about now: the start step handles it.
  const jobLive = f.run.present && f.run.live;
  const seenAgo = f.login.seenAt !== undefined ? now - f.login.seenAt : Infinity;
  const signedInHere = seenAgo < LOGIN_SEEN_FRESH_MS;
  const jobNeedsLogin = jobLive && (f.run.state === 'need_login' || f.run.needs === 'login');
  if (jobNeedsLogin && signedInHere && seenAgo < LOGIN_RECHECK_PATIENCE_MS && !f.login.inProgress && !f.login.failed) {
    return view('login', { status: 'Signed in; your worker re-checks within a minute...', auto: 'poll', tone: 'busy' });
  }
  if (jobNeedsLogin || (f.login.loggedIn !== true && !signedInHere)) {
    if (f.login.inProgress) return view('login', { status: 'Sign in to Claude in the tab that opened, then paste the code it shows below.', input: 'terminal', tone: 'wait' });
    if (f.login.failed) return view('login', { status: f.login.failed, input: 'terminal', primary: { label: 'Try again', action: 'retry-login' }, tone: 'fail' });
    // the sitting starts an allocation on the login node: a scheduler call, once a minute, waited out rather than refused
    if (f.run.schedulerWaitMs > 0) return view('login', { status: `Signing in to Claude on the cluster in ${Math.ceil(f.run.schedulerWaitMs / 1000)} s (the scheduler is asked at most once a minute)...`, input: 'terminal', auto: 'login', waitMs: f.run.schedulerWaitMs, tone: 'wait' });
    return view('login', { status: jobNeedsLogin ? `${f.run.hint ?? 'Your worker is waiting for your Claude sign-in on the cluster.'} Signing in...` : 'Signing in to Claude on the cluster: a compute node is asked for, then Anthropic\'s sign-in page opens...', input: 'terminal', auto: 'login', tone: 'busy' });
  }

  // 8. the data statement, per workspace; the job's needs=consent brings it back so the marker is
  // written again, unless the marker was written moments ago and the job has not re-read it yet
  if (f.statement.restricted) return view('statement', { status: f.statement.restricted, tone: 'fail' });
  const needConsent = f.run.state === 'need_consent' || (jobLive && f.run.needs === 'consent');
  const markerFresh = f.statement.consentWrittenAt !== undefined && now - f.statement.consentWrittenAt < CONSENT_PATIENCE_MS;
  if (f.statement.acknowledged && needConsent && markerFresh) return view('statement', { status: 'Your answer is written for your worker; it picks it up within a minute...', auto: 'poll', tone: 'busy' });
  if (!f.statement.acknowledged || needConsent) {
    return view('statement', { status: needConsent ? `${f.run.hint ?? 'Your worker is waiting for your answer to Claude Code\'s one-time question.'} Read this and tick the statement.` : `Read where your work goes and make the statement about worker "${f.statement.workerName}".`, input: 'statement', primary: { label: 'I have read this and the statement is true', action: 'acknowledge' }, tone: 'info' });
  }

  // 9. the start
  const freshWithoutStatus = f.run.present && !f.run.state && !!f.run.setAt && now - f.run.setAt < FRESH_RUN_MS;
  const alive = f.run.present && (f.run.live || freshWithoutStatus);
  if (!alive) {
    if (f.run.starting) return view('start', { status: 'Starting your worker (one job on the cluster)...', tone: 'busy' });
    if (f.run.failed) return view('start', { status: `Your worker could not be started: ${f.run.failed}`, primary: { label: 'Try again', action: 'retry-start' }, tone: 'fail' });
    // a stopped or failed worker waits for the student's button; once pressed, the start proceeds like any other (floor and all)
    if (f.run.stoppedByStudent && !f.run.startRequested) return view('start', { status: 'Your worker is stopped. Start it again when you want it.', primary: { label: 'Start again', action: 'start' }, tone: 'info' });
    if (f.run.state === 'error' && !f.run.startRequested) return view('start', { status: `Your worker ended with a problem: ${f.run.message ?? 'see Details'}`, primary: { label: 'Start again', action: 'retry-start' }, tone: 'fail' });
    if (f.run.state === 'preempted' && f.run.nextJob) return view('online', { status: `Your worker's job ended; job ${f.run.nextJob} takes over. Waiting for it...`, auto: 'poll', tone: 'busy' });
    if (f.run.schedulerWaitMs > 0) return view('start', { status: `Starting your worker in ${Math.ceil(f.run.schedulerWaitMs / 1000)} s (the scheduler is asked at most once a minute)...`, auto: 'start', waitMs: f.run.schedulerWaitMs, tone: 'wait' });
    return view('start', { status: 'Starting your worker...', auto: 'start', tone: 'busy' });
  }

  // 10. online: the job registers with Remote Control and writes its link
  if (!f.run.url) {
    const where = f.run.job ? ` (job ${f.run.job})` : '';
    const what = !f.run.state ? 'waiting for the job to start' : f.run.state === 'starting' ? 'the job is starting Claude Code' : f.run.state === 'running' ? 'Claude Code is registering' : f.run.state;
    return view('online', { status: `Your worker${where}: ${what}...`, auto: 'poll', tone: 'busy' });
  }

  // 11. open in Claude: once by itself, then the green button
  if (!f.opened && f.autoOpen) return view('open', { status: 'Your worker is online. Opening it in Claude...', auto: 'open-claude', tone: 'ok', done: true });
  return view('open', { status: `Your worker is online${f.run.sessionName ? `: ${f.run.sessionName}` : ''}.`, tone: 'ok', done: true });
}
