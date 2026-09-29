// The flight strip's state machine: the steps come in the report's order, the first one not
// satisfied is the step, the extension advances by itself where nothing needs the student, the
// one button appears only where a person must act, the access step never blocks anything
// read-only, the scheduler floor makes an automatic start wait rather than skip, and the Claude
// link is opened once by itself and then offered on the green button.
import { describe, expect, it } from 'vitest';
import { CONSENT_PATIENCE_MS, decide, FRESH_RUN_MS, LOGIN_RECHECK_PATIENCE_MS, LOGIN_SEEN_FRESH_MS, PROBE_PATIENCE_MS, STEP_ORDER, type Facts, type StripView } from '../src/core/steps';
import type { AccessFact } from '../src/licensing/access';

const NOW = Date.parse('2026-09-29T12:00:00Z');
const REQUEST = 'https://openspineconsortium.com/ashley/request.html?access_id=ab1234';

/** an access fact as licensing/access.ts accessFact builds it, for one state */
function access(state: AccessFact['state'], over: Partial<AccessFact> = {}): AccessFact {
  const ok = state === 'approved' || state === 'stale';
  return { ok, state, detail: `access: ${state}`, needsCheck: !ok && state === 'checking', warn: state === 'stale', accessId: 'ab1234', portal: 'ood.example', requestUrl: REQUEST, versionRevoked: state === 'version-revoked', ...over };
}

/** toMatchObject, except that an explicit undefined means "not set" */
function same(v: StripView, want: Partial<Record<keyof StripView, unknown>>): void {
  for (const [k, x] of Object.entries(want)) {
    if (x === undefined) expect(v[k as keyof StripView], k).toBeUndefined();
    else expect(v, k).toMatchObject({ [k]: x });
  }
}

/** every step green: the worker is online and its link known */
function green(): Facts {
  return {
    portal: { connected: true, granted: true, alive: true, hostname: 'ood.example' },
    warm: { state: 'warm' },
    terms: true,
    access: access('approved', { detail: 'Access approved for ab1234 at ood.example (checked 2026-09-29 11:00 UTC)' }),
    install: { installed: true },
    probe: { present: true, ok: true, detail: 'probe on asx15' },
    login: { loggedIn: true, detail: 'signed in' },
    statement: { acknowledged: true, workerName: 'worker' },
    run: { present: true, live: true, state: 'online', job: '4243102', url: 'https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt', sessionName: 'asx10-hazy-meadow', schedulerWaitMs: 0, setAt: NOW - 5 * 60_000 },
    opened: true,
    autoOpen: true,
  };
}

describe('the step machine', () => {
  it('lists the steps in order and ends green with the button', () => {
    expect(STEP_ORDER).toEqual(['portal', 'warm', 'terms', 'access', 'install', 'probe', 'login', 'statement', 'start', 'online', 'open']);
    const v = decide(green(), NOW);
    expect(v.step).toBe('open');
    expect(v.done).toBe(true);
    expect(v.auto).toBeUndefined();
    expect(v.primary).toBeUndefined();
    expect(v.status).toMatch(/asx10-hazy-meadow/);
    expect(v.index).toBe(11);
    expect(v.total).toBe(11);
  });

  it('opens the link by itself the first time it is seen, and not when the setting is off', () => {
    const f = green();
    f.opened = false;
    same(decide(f, NOW), { step: 'open', auto: 'open-claude', done: true });
    f.autoOpen = false;
    same(decide(f, NOW), { step: 'open', auto: undefined, done: true });
  });

  it('the portal first: connect from a portal tab, else the setup page, then keep the tab open', () => {
    const f = green();
    f.portal = { connected: false, granted: false, alive: false, candidate: { origin: 'https://ood.example', hostname: 'ood.example', tabId: 7 } };
    same(decide(f, NOW), { step: 'portal', primary: { label: 'Connect this portal', action: 'connect' } });
    f.portal = { connected: false, granted: false, alive: false };
    same(decide(f, NOW), { step: 'portal', primary: { action: 'open-setup' } });
    f.portal = { connected: true, granted: false, alive: false, hostname: 'ood.example' };
    same(decide(f, NOW), { step: 'portal', primary: { action: 'connect' }, tone: 'fail' });
    f.portal = { connected: true, granted: true, alive: false, hostname: 'ood.example' };
    const v = decide(f, NOW);
    same(v, { step: 'portal', primary: { action: 'open-portal' } });
    expect(v.status).toMatch(/keep it open/);
    expect(v.auto).toBeUndefined();
  });

  it('wakes the portal by itself, waits while warming, and hands cold or signed-out portals to the student', () => {
    const f = green();
    f.warm = { state: 'unknown' };
    same(decide(f, NOW), { step: 'warm', auto: 'warm', tone: 'busy' });
    expect(decide(f, NOW).status).toMatch(/waking up your portal/i);
    f.warm = { state: 'warming' };
    same(decide(f, NOW), { step: 'warm', auto: undefined, primary: undefined });
    f.warm = { state: 'cold', detail: 'your portal did not wake up after 4 tries (it answered 500)' };
    same(decide(f, NOW), { step: 'warm', primary: { action: 'retry-warm' }, tone: 'fail' });
    f.warm = { state: 'signed-out', detail: 'sign in' };
    same(decide(f, NOW), { step: 'warm', primary: { action: 'open-portal' } });
    f.warm = { state: 'unreachable' };
    same(decide(f, NOW), { step: 'warm', primary: { action: 'open-portal' }, tone: 'fail' });
  });

  it('the agreement once, then the access step: checking by itself, "Ask for access" when refused, "ask again" when withdrawn, no button at all for a withdrawn version', () => {
    const f = green();
    f.terms = false;
    same(decide(f, NOW), { step: 'terms', primary: { action: 'accept-terms' } });
    f.terms = true;
    // nothing on record: the background is asked, and the strip says so with no button and no input
    f.access = access('checking', { needsCheck: true });
    const checking = decide(f, NOW);
    same(checking, { step: 'access', auto: 'check-access', primary: undefined, input: undefined, tone: 'busy' });
    expect(checking.status).toMatch(/Checking your access/);
    // in flight (the strip's own attempt): busy, nothing automatic on top
    f.access = access('checking', { needsCheck: false });
    same(decide(f, NOW), { step: 'access', auto: undefined, primary: undefined, tone: 'busy' });
    // refused: the one button opens the request page with the account name; nothing is typed
    f.access = access('denied');
    const denied = decide(f, NOW);
    same(denied, { step: 'access', primary: { label: 'Ask for access', action: 'ask-access' }, input: undefined, auto: undefined, tone: 'info' });
    expect(denied.status).toMatch(/ab1234 at ood\.example is not on the approved list yet/);
    expect(denied.status).toMatch(/click the Ashley Bridge button again/);
    // withdrawn: said as such, with "ask again"
    f.access = access('withdrawn', { detail: 'Access withdrawn: ask again if you still need Ashley Bridge (your account ab1234 at ood.example is no longer on the approved list; checked 2026-09-29 11:50 UTC)' });
    const withdrawn = decide(f, NOW);
    same(withdrawn, { step: 'access', primary: { label: 'Ask again', action: 'ask-access' }, tone: 'fail' });
    expect(withdrawn.status).toMatch(/^Access withdrawn: ask again/);
    // the service silent for seven days, or never reached: a person may try again
    f.access = access('lapsed');
    same(decide(f, NOW), { step: 'access', primary: { label: 'Check again', action: 'retry-access' }, tone: 'fail' });
    f.access = access('unreachable');
    same(decide(f, NOW), { step: 'access', primary: { label: 'Try again', action: 'retry-access' }, tone: 'fail' });
    f.access = access('failed', { detail: 'Your portal has not shown who is signed in yet' });
    same(decide(f, NOW), { step: 'access', primary: { action: 'retry-access' }, status: 'Your portal has not shown who is signed in yet' });
    f.access = access('no-identity');
    const noId = decide(f, NOW);
    same(noId, { step: 'access', primary: { action: 'retry-access' }, tone: 'fail' });
    expect(noId.status).toMatch(/does not show who is signed in/);
    // a withdrawn version: no button, nothing automatic
    f.access = access('version-revoked', { detail: 'This version of Ashley Bridge has been withdrawn; update to continue.' });
    same(decide(f, NOW), { step: 'access', primary: undefined, auto: undefined, tone: 'fail' });
    // an approval past its day but within seven: the strip goes on (the background re-asks quietly)
    f.access = access('stale', { needsCheck: true });
    expect(decide(f, NOW).step).toBe('open');
  });

  it('installs the tool by itself, runs the probe once and waits for it, and asks only when a job fails', () => {
    const f = green();
    f.install = {};
    same(decide(f, NOW), { step: 'install', auto: 'poll' });
    f.install = { installed: false };
    same(decide(f, NOW), { step: 'install', auto: 'install', primary: undefined });
    f.install = { installed: false, installing: true };
    same(decide(f, NOW), { step: 'install', auto: undefined });
    f.install = { installed: false, failed: 'exit 1' };
    same(decide(f, NOW), { step: 'install', primary: { action: 'retry-install' } });
    // an older tool on the cluster is set up again by itself, saying which version becomes which
    f.install = { installed: true, outdated: { installed: '1', bundled: '2' } };
    const up = decide(f, NOW);
    same(up, { step: 'install', auto: 'install', primary: undefined });
    expect(up.status).toMatch(/version 1 to 2/);
    f.install = { installed: true, outdated: { installed: '1', bundled: '2' }, failed: 'the tool on the cluster still reports version 1 after the update to version 2 ran' };
    same(decide(f, NOW), { step: 'install', primary: { action: 'retry-install' }, auto: undefined });
    // where the lab keeps a shared copy, the same steps say so: the first set-up, the move, the wait
    const lab = '/rs/rs_grp_oschome/shared/ashley/hpcworker/current';
    f.install = { installed: false, sharedRoot: lab };
    same(decide(f, NOW), { step: 'install', auto: 'install', status: "Setting up the cluster with your lab's shared copy of the tool..." });
    f.install = { installed: false, sharedRoot: lab, installing: true };
    same(decide(f, NOW), { step: 'install', auto: undefined, status: "Setting up the cluster (pointing your account at your lab's shared copy of the tool)..." });
    f.install = { installed: true, sharedRoot: lab, version: '4', outdated: { installed: '4', bundled: '5' } };
    same(decide(f, NOW), { step: 'install', auto: 'install', status: "Moving your account to your lab's shared copy of the tool (your own copy is version 4)..." });
    // on the shared copy there is nothing to do here, whatever version it is
    f.install = { installed: true, sharedRoot: lab, shared: { dir: lab, version: '5' } };
    expect(decide(f, NOW).step).toBe('open');
    f.install = { installed: true };
    f.probe = { present: false };
    same(decide(f, NOW), { step: 'probe', auto: 'probe' });
    f.probe = { present: false, submittedAt: NOW - 60_000 };
    same(decide(f, NOW), { step: 'probe', auto: 'poll' });
    f.probe = { present: false, submittedAt: NOW - PROBE_PATIENCE_MS - 1 };
    same(decide(f, NOW), { step: 'probe', auto: 'probe' });
    // the scheduler floor: the probe is a submission, so it waits rather than being refused
    f.run.schedulerWaitMs = 41_000;
    same(decide(f, NOW), { step: 'probe', auto: 'probe', waitMs: 41_000, tone: 'wait' });
    f.run.schedulerWaitMs = 0;
    f.probe = { present: true, ok: false, detail: 'Compute nodes cannot reach Anthropic from your cluster' };
    same(decide(f, NOW), { step: 'probe', primary: { action: 'retry-probe' }, tone: 'fail' });
  });

  it('signs in through the terminal by itself, waits for the code, and offers Retry after a failure', () => {
    const f = green();
    f.login = { loggedIn: false };
    same(decide(f, NOW), { step: 'login', auto: 'login', input: 'terminal' });
    f.login = { loggedIn: false, inProgress: true };
    const v = decide(f, NOW);
    same(v, { step: 'login', input: 'terminal', auto: undefined });
    expect(v.status).toMatch(/paste the code/i);
    f.login = { loggedIn: false, failed: 'The sign-in did not complete: the code was not accepted.' };
    same(decide(f, NOW), { step: 'login', primary: { action: 'retry-login' }, tone: 'fail' });
    // a running worker that reports need_login (or needs=login) wins over an old probe that said signed in
    const g = green();
    g.run.state = 'need_login';
    same(decide(g, NOW), { step: 'login', auto: 'login' });
    const k = green();
    k.run.needs = 'login';
    k.run.hint = 'Sign in to Claude on the cluster; your worker is waiting for it.';
    const kv = decide(k, NOW);
    same(kv, { step: 'login', auto: 'login' });
    expect(kv.status).toMatch(/your worker is waiting for it/);
    // needs=consent from a live job brings the statement back so the marker is written again
    const m = green();
    m.run.needs = 'consent';
    same(decide(m, NOW), { step: 'statement', input: 'statement' });
    // no word either way yet: sign in rather than assume
    const h = green();
    h.login = {};
    expect(decide(h, NOW).step).toBe('login');
    // the sitting is a scheduler call: with the clock running it waits, it does not open
    const w = green();
    w.login = { loggedIn: false };
    w.run.schedulerWaitMs = 25_000;
    const wv = decide(w, NOW);
    same(wv, { step: 'login', auto: 'login', waitMs: 25_000, tone: 'wait' });
    expect(wv.status).toMatch(/in 25 s/);
  });

  it('after a sign-in from this browser, a job still saying need_login is given three minutes to re-ask, then the login step returns', () => {
    // signed in two minutes ago; the live job still says need_login: wait for its next check, do not open another sitting
    const f = green();
    f.run.state = 'need_login';
    f.run.needs = 'login';
    f.login = { loggedIn: false, seenAt: NOW - 2 * 60_000 };
    const v = decide(f, NOW);
    same(v, { step: 'login', auto: 'poll', primary: undefined, input: undefined });
    expect(v.status).toMatch(/Signed in; your worker re-checks within a minute/);
    // three minutes on and still need_login: the sign-in did not reach the job, so the step comes back
    f.login = { loggedIn: false, seenAt: NOW - LOGIN_RECHECK_PATIENCE_MS };
    same(decide(f, NOW), { step: 'login', auto: 'login', input: 'terminal' });
    // a recent sign-in outweighs a stale "not signed in" when no live job says otherwise
    const g = green();
    g.login = { loggedIn: false, seenAt: NOW - 5 * 60_000 };
    expect(decide(g, NOW).step).toBe('open');
    g.login = { loggedIn: false, seenAt: NOW - LOGIN_SEEN_FRESH_MS };
    expect(decide(g, NOW).step).toBe('login');
    // a dead run's last need_login is not the job's word about now: the start step handles it
    const d = green();
    d.run = { present: true, live: false, state: 'need_login', schedulerWaitMs: 0 };
    same(decide(d, NOW), { step: 'start', auto: 'start' });
    // a failed re-login is shown even inside the patience window
    const e = green();
    e.run.state = 'need_login';
    e.login = { loggedIn: false, seenAt: NOW - 60_000, failed: 'The sign-in did not complete.' };
    same(decide(e, NOW), { step: 'login', primary: { action: 'retry-login' } });
  });

  it('a consent marker written moments ago is given time to be read before the statement is asked again', () => {
    const f = green();
    f.run.needs = 'consent';
    f.statement = { acknowledged: true, workerName: 'worker', consentWrittenAt: NOW - 30_000 };
    const v = decide(f, NOW);
    same(v, { step: 'statement', auto: 'poll', input: undefined });
    expect(v.status).toMatch(/picks it up within a minute/);
    f.statement = { acknowledged: true, workerName: 'worker', consentWrittenAt: NOW - CONSENT_PATIENCE_MS };
    same(decide(f, NOW), { step: 'statement', input: 'statement', primary: { action: 'acknowledge' } });
  });

  it('the statement is the one step with a box and a button; a restricted workspace stops there', () => {
    const f = green();
    f.statement = { acknowledged: false, workerName: 'thesis' };
    const v = decide(f, NOW);
    same(v, { step: 'statement', input: 'statement', primary: { action: 'acknowledge' } });
    expect(v.status).toMatch(/"thesis"/);
    f.statement = { acknowledged: true, workerName: 'thesis', restricted: 'The workspace is marked restricted' };
    same(decide(f, NOW), { step: 'statement', tone: 'fail', primary: undefined, auto: undefined });
    const g = green();
    g.run.state = 'need_consent';
    same(decide(g, NOW), { step: 'statement', input: 'statement' });
  });

  it('starts the worker by itself, waits out the floor, keeps a stopped worker stopped, and polls a fresh run', () => {
    const f = green();
    f.run = { present: false, live: false, schedulerWaitMs: 0 };
    same(decide(f, NOW), { step: 'start', auto: 'start' });
    f.run.schedulerWaitMs = 20_000;
    same(decide(f, NOW), { step: 'start', auto: 'start', waitMs: 20_000 });
    f.run = { present: false, live: false, schedulerWaitMs: 0, starting: true };
    same(decide(f, NOW), { step: 'start', auto: undefined, primary: undefined });
    f.run = { present: false, live: false, schedulerWaitMs: 0, failed: 'the start command printed no job id' };
    same(decide(f, NOW), { step: 'start', primary: { action: 'retry-start' } });
    // a stopped or failed worker offers "Start again" and nothing automatic; the button's press makes it an ordinary start, floor included
    f.run = { present: true, live: false, state: 'stopped', schedulerWaitMs: 0, stoppedByStudent: true };
    same(decide(f, NOW), { step: 'start', primary: { label: 'Start again', action: 'start' }, auto: undefined });
    f.run.startRequested = true;
    same(decide(f, NOW), { step: 'start', auto: 'start', primary: undefined });
    f.run.schedulerWaitMs = 41_000;
    same(decide(f, NOW), { step: 'start', auto: 'start', waitMs: 41_000, tone: 'wait' });
    f.run = { present: true, live: false, state: 'error', message: 'cannot create node-local temp', schedulerWaitMs: 0 };
    same(decide(f, NOW), { step: 'start', primary: { label: 'Start again', action: 'retry-start' }, tone: 'fail' });
    f.run.startRequested = true;
    same(decide(f, NOW), { step: 'start', auto: 'start', primary: undefined });
    // just submitted, no status.json yet: wait for the job, do not start again
    f.run = { present: true, live: false, job: '4243102', schedulerWaitMs: 0, setAt: NOW - 30_000 };
    same(decide(f, NOW), { step: 'online', auto: 'poll' });
    f.run = { present: true, live: false, job: '4243102', schedulerWaitMs: 0, setAt: NOW - FRESH_RUN_MS - 1 };
    same(decide(f, NOW), { step: 'start', auto: 'start' });
    // preempted with a successor queued: wait for the successor
    f.run = { present: true, live: false, state: 'preempted', nextJob: '4243103', schedulerWaitMs: 0 };
    same(decide(f, NOW), { step: 'online', auto: 'poll' });
  });

  it('polls a live run until its link is known, then it is done', () => {
    const f = green();
    f.run.url = undefined;
    f.run.state = 'running';
    const v = decide(f, NOW);
    same(v, { step: 'online', auto: 'poll', done: false });
    expect(v.status).toMatch(/registering/);
    f.run.state = 'starting';
    expect(decide(f, NOW).status).toMatch(/starting Claude Code/);
  });
});
