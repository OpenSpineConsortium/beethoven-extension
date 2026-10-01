// Gathering the facts the strip's state machine decides on: from storage (terms, the access
// service's last answer, statement, preferences), from the browser (the grant, the page script
// answering), and from the cluster through the portal page script (the tool installed, probe.json,
// the restricted marker, the scheduler clock). Reads only: nothing here starts, installs, writes
// or asks the network; the access service is asked by the background alone, and only the record it
// left is read here. The transient part (what the panel is doing right now) is handed in by the
// caller, so the same function serves the panel and the background's automatic start.
import type { KV } from './audit';
import { isAnthropicAddress } from './connect';
import { isEnvironmentUrl, LAUNCHER_TAG, paths, probeVerdict, profileRestricts, sharedRootOf, stateDirFrom, type ProbeFile, type StatusFile, type ConnectionFile, type Registration } from './contract';
import { ackSubject, statementFor, type Statements } from './disclosure';
import { noSharedForSite } from './install';
import { ACCESS_KEY, IDENTITY_KEY, KILLLIST_KEY, LOGIN_SEEN_KEY, OPENED_KEY, PROBE_KEY, SERVICES_KEY, STATEMENTS_KEY, type ClickNote, type IdentityNote, type LoginSeen, type OpenedLinks, type PortalSettings, type Prefs, type ProbeNote } from './keys';
import type { PortalApi } from './portal';
import { LOGIN_SEEN_FRESH_MS, type Facts } from './steps';
import { recordInForce, TERMS_KEY } from './terms';
import { workerLive } from './worker';
import { accessFact, type AccessRecord, type StoredServices } from '../licensing/access';
import { killListVerdict, type StoredKillList } from '../licensing/killlist';

/** the run as the background keeps it (background.ts RunState), the part the facts need */
export interface RunLike {
  stateDir: string;
  run: string;
  job: string;
  set_at?: string;
  started_by?: 'button' | 'auto' | 'strip';
  status?: StatusFile;
  connection?: ConnectionFile;
  registration?: Registration;
  stopped_by_student?: boolean;
}

/** what the caller is doing right now, which no store records */
export interface Transient {
  warm?: Facts['warm'];
  /** the strip asked the background for an access check and waits for its answer */
  accessChecking?: boolean;
  /** the background could not ask the access service, in one sentence (cleared at the next attempt) */
  accessFailed?: string;
  installing?: boolean;
  installFailed?: string;
  /** the last install in this panel found the lab's shared copy unusable from this account, in the student's words (install.ts noShared) */
  installNoShared?: string;
  probeSubmitting?: boolean;
  probeFailed?: string;
  loginInProgress?: boolean;
  loginFailed?: string;
  starting?: boolean;
  startFailed?: string;
  /** the student pressed the start button; kept while the floor is waited out, cleared once the start went through or failed */
  startRequested?: boolean;
}

export interface FactsEnv {
  version: string;
  now(): number;
  local: KV;
  settings?: PortalSettings;
  prefs: Prefs;
  granted(origin: string): Promise<boolean>;
  alive(): Promise<boolean>;
  portal(): PortalApi | undefined;
  run?: RunLike;
  click?: ClickNote;
  transient: Transient;
  /** the shared folder the bundled profile of this site names (install.ts bundledSharedInstall); absent or undefined: the site has none */
  bundledSharedInstall?(site: string): Promise<string | undefined>;
}

/**
 * The lab's shared copy the marker names, with its VERSION as the portal's Files app reads it. The
 * read has its own error handling: a student outside the lab's group, or a Files app that does not
 * serve the lab volume, answers 403 or 500 here, and that must not make the whole portal look
 * asleep. The copy is not set up again for it either: the shell, not the Files app, is what runs it.
 */
async function sharedCopy(portal: PortalApi, marker: string): Promise<NonNullable<Facts['install']['shared']>> {
  const dir = sharedRootOf(marker);
  if (!dir) return { dir: marker.slice(0, 200), unreadable: 'the marker file does not name a folder' };
  try {
    const v = ((await portal.readFileIfExists(paths.sharedVersion(dir))) ?? '').trim();
    if (/^\d+$/.test(v)) return { dir, version: v };
    return { dir, unreadable: v ? 'its VERSION file does not hold a whole number' : "the portal's Files app finds no VERSION file there" };
  } catch (e) {
    return { dir, unreadable: `the portal's Files app could not read its VERSION file (${(e as Error).message})` };
  }
}

/** what was learned on the way, for the actions that follow */
export interface Gathered {
  facts: Facts;
  home?: string;
  user?: string;
  stateDir?: string;
  profile?: string;
  probe?: ProbeFile;
  /** the acknowledgement's consent marker was written to the cluster (or is not needed) */
  consentWritten?: boolean;
}

/** an origin's hostname, or the origin itself when it does not parse */
function hostnameOf(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}

/** the environment link of a run, only when it is Claude's own Code page for an environment */
export function environmentLinkOf(run: RunLike | undefined): string | undefined {
  if (!run) return undefined;
  const raw = run.connection?.environment_url ?? run.status?.environment_url ?? run.registration?.environment_url ?? run.connection?.session_url ?? run.status?.session_url;
  return isEnvironmentUrl(raw) ? raw : undefined;
}

export async function gatherFacts(env: FactsEnv): Promise<Gathered> {
  const t = env.transient;
  const now = env.now();
  const out: Gathered = { facts: emptyFacts(env) };
  const f = out.facts;

  // the portal
  const s = env.settings;
  f.portal.connected = !!s;
  f.portal.hostname = s?.hostname;
  f.portal.granted = s ? await env.granted(s.origin) : false;
  f.portal.alive = s && f.portal.granted ? await env.alive() : false;
  // a tab on an Anthropic host is never offered as a portal, whatever its path or an older note says
  if (!s && env.click) {
    if (isAnthropicAddress(env.click.origin)) f.portal.refusedTab = hostnameOf(env.click.origin);
    else if (env.click.looksLikeOod) f.portal.candidate = { origin: env.click.origin, hostname: new URL(env.click.origin).hostname, tabId: env.click.tabId };
  }

  // the browser-side facts, whatever the portal says
  f.terms = recordInForce(await env.local.get(TERMS_KEY));
  const stored = await env.local.get<StoredKillList>(KILLLIST_KEY);
  const verdict = killListVerdict(stored, env.version);
  // the account name the dashboard showed (check 4 and the background record it; nothing typed ever does)
  const observed = (await env.local.get<IdentityNote>(IDENTITY_KEY))?.username;
  const record = await env.local.get<AccessRecord>(ACCESS_KEY);
  const services = await env.local.get<StoredServices>(SERVICES_KEY);
  f.access = accessFact({ record, services, accessId: observed, portal: s?.hostname, now: new Date(now), versionRevoked: verdict.versionRevoked, revokedMessage: verdict.message, checking: t.accessChecking, failed: t.accessFailed });
  const statements = await env.local.get<Statements>(STATEMENTS_KEY);
  const ack = statementFor(statements, env.prefs.worker_name);
  f.statement.acknowledged = !!ack;
  f.statement.workerName = env.prefs.worker_name;
  if (ack?.consent_written_at) f.statement.consentWrittenAt = new Date(ack.consent_written_at).getTime();
  out.consentWritten = !!ack?.consent_written_at;
  const seen = await env.local.get<LoginSeen>(LOGIN_SEEN_KEY);
  const seenAt = seen ? new Date(seen.at).getTime() : undefined;
  const probeNote = await env.local.get<ProbeNote>(PROBE_KEY);
  if (probeNote?.submitted_at) f.probe.submittedAt = new Date(probeNote.submitted_at).getTime();
  f.autoOpen = env.prefs.open_claude_on_connect;

  // the run, as the background last read it
  const run = env.run;
  const url = environmentLinkOf(run);
  f.run = {
    present: !!run,
    live: workerLive(run?.status, now),
    state: run?.status?.state,
    needs: run?.status?.needs,
    hint: run?.status?.hint,
    job: run?.status?.job ?? run?.job,
    message: run?.status?.message,
    url,
    sessionName: run?.connection?.session_name || run?.status?.session_name || run?.registration?.session_name,
    nextJob: run?.status?.next_job || undefined,
    setAt: run?.set_at ? new Date(run.set_at).getTime() : undefined,
    starting: t.starting,
    failed: t.startFailed,
    schedulerWaitMs: 0,
    stoppedByStudent: !!run?.stopped_by_student || run?.status?.state === 'stopped',
    startRequested: t.startRequested,
  };
  if (url) {
    const opened = await env.local.get<OpenedLinks>(OPENED_KEY);
    f.opened = !!opened?.urls.includes(url);
  }

  // the cluster, only from a live, warm portal tab
  f.warm = t.warm ?? { state: 'unknown' };
  f.install = { installing: t.installing, failed: t.installFailed, ...(t.installNoShared ? { noSharedCopy: t.installNoShared } : {}) };
  f.probe = { ...f.probe, submitting: t.probeSubmitting, failed: t.probeFailed };
  f.login = { inProgress: t.loginInProgress, failed: t.loginFailed, seenAt };
  const portal = env.portal();
  if (!portal || !f.portal.alive || f.warm.state !== 'warm') return out;
  try {
    f.run.schedulerWaitMs = await portal.auditWait('scheduler');
    const home = await portal.home();
    out.home = home;
    // for paths only: the dashboard's name, else the directory's owner or its last segment
    const user = observed ?? (await portal.whoAmI()) ?? home.split('/').filter(Boolean).pop() ?? '';
    out.user = user;
    // the site's shared folder, from the profile this build carries: without one there is nothing to set up
    const sharedRoot = s && env.bundledSharedInstall ? await env.bundledSharedInstall(s.site).catch(() => undefined) : undefined;
    if (sharedRoot) f.install.sharedRoot = sharedRoot;
    f.install.installed = await portal.exists(paths.profile(home));
    if (!f.install.installed) {
      if (!sharedRoot && !f.install.noSharedCopy) f.install.noSharedCopy = noSharedForSite(s?.site);
      return out;
    }
    // which copy does the account run? The marker names the lab's shared copy, which the lab keeps current
    const marker = ((await portal.readFileIfExists(paths.sharedMarker(home))) ?? '').trim();
    // the marker alone does not prove it: a full copy uploaded over the launcher leaves the marker behind
    // and the tool then runs that copy (the framework's own rule); the launcher's second line is the tell
    // (no bin file at all with a marker is still a shared account: a failed or partial set-up is then said as such)
    const launcher = marker ? await portal.readFileIfExists(paths.bin(home)) : undefined;
    const runsTheMarker = launcher === undefined || (launcher.split('\n')[1] ?? '').trim() === LAUNCHER_TAG;
    if (marker && runsTheMarker) f.install.shared = await sharedCopy(portal, marker);
    else {
      // its own copy, set up by a build before 8.0.0: it keeps running (the framework handles it) and
      // is only named with its version; this build carries no tool to compare it with or replace it by
      const have = ((await portal.readFileIfExists(paths.version(home))) ?? '').trim();
      if (/^\d+$/.test(have)) f.install.version = have;
    }
    const profile = await portal.readFileIfExists(paths.profile(home));
    out.profile = profile;
    const stateDir = stateDirFrom(profile, { home, user });
    out.stateDir = stateDir;
    const probeText = await portal.readFileIfExists(paths.probe(stateDir));
    f.probe.present = probeText !== undefined;
    if (probeText !== undefined) {
      try {
        const p = JSON.parse(probeText) as ProbeFile;
        out.probe = p;
        const pv = probeVerdict(p);
        f.probe.ok = pv.ok;
        f.probe.detail = pv.ok ? pv.detail : pv.reason;
        // the sign-in: the probe's word, overtaken by a login made in this browser since, or by the running job's own word
        const probeAt = p.when ? new Date(p.when).getTime() : 0;
        if (p.claude_auth) {
          f.login.loggedIn = !!p.claude_auth.loggedIn;
          f.login.detail = p.claude_auth.loggedIn ? `signed in${p.claude_auth.email ? ` as ${p.claude_auth.email}` : ''}` : 'not signed in to Claude on the cluster';
        }
        if (seen && seenAt !== undefined && seenAt > probeAt) {
          f.login.loggedIn = true;
          f.login.detail = `signed in from this browser ${seen.at.slice(0, 16)}`;
        }
      } catch {
        f.probe.ok = false;
        f.probe.detail = 'The compute node check wrote a file that could not be read; run it again.';
      }
    }
    // the live job's word, unless it checked before the sign-in made from this browser (a heartbeat
    // is written every 30 s, so updated_at says nothing about when the sign-in was last asked)
    const st = run?.status;
    if (st?.claude_login && st.updated_at && f.run.live) {
      const checkedAt = new Date(st.claude_login.checked_at ?? st.updated_at).getTime();
      const seenSince = seenAt !== undefined && (seenAt > checkedAt || now - seenAt < LOGIN_SEEN_FRESH_MS);
      if (!seenSince || st.claude_login.loggedIn) {
        f.login.loggedIn = !!st.claude_login.loggedIn;
        f.login.detail = st.claude_login.loggedIn ? `signed in (your worker says so)` : 'not signed in to Claude on the cluster (your worker says so)';
      }
    }
    if (profileRestricts(profile, env.prefs.worker_name)) f.statement.restricted = `The site profile marks the workspace of worker "${env.prefs.worker_name}" restricted; no worker starts there.`;
    else if (await portal.exists(paths.restrictedMarker(stateDir, env.prefs.worker_name))) f.statement.restricted = `The workspace ${paths.workspace(stateDir, env.prefs.worker_name)} is marked restricted (.restricted file present); no worker starts there. Remove the marker yourself in the portal's Files app only if the restriction no longer applies.`;
  } catch (e) {
    // a read that failed leaves the fact unknown; the strip shows the reason rather than inventing a state
    f.warm = { state: 'cold', detail: `Your portal did not answer: ${(e as Error).message}` };
  }
  return out;
}

function emptyFacts(env: FactsEnv): Facts {
  return {
    portal: { connected: false, granted: false, alive: false },
    warm: { state: 'unknown' },
    terms: false,
    access: accessFact({ now: new Date(env.now()) }),
    install: {},
    probe: {},
    login: {},
    statement: { acknowledged: false, workerName: env.prefs.worker_name },
    run: { present: false, live: false, schedulerWaitMs: 0 },
    opened: false,
    autoOpen: env.prefs.open_claude_on_connect,
  };
}

/** the statement's subject for the current prefs, for callers that write it */
export const currentSubject = (prefs: Prefs): string => ackSubject(prefs.worker_name);
