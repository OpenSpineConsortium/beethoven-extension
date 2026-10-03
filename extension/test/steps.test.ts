// The two machines of 11.0.0 against the specification's own words: journey(f) moment by moment
// (welcome, GlobalProtect, the grid sign-in, "Where your work goes", Connect, the Claude sign-in, the
// one-time key step, the queue, starting, online), and home(f) for every row of the "Waiting and status"
// table, with exactly one primary or none, the three status rows, the foot row, Try asking and the
// one-time cards; the toolbar's badge, title and lit icon; and panelView's choice between them. Every
// sentence is the spec's, character for character. A last test sweeps many views for the words a
// student must never read.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, type LastKnown } from '../src/core/keys';
import { formatClock, type HomeView, type JourneyView, type PanelView } from '../src/core/model';
import { SHORT_STATEMENT, STATEMENT_TICK, PLAN_CLASS_DISCLOSURE } from '../src/core/disclosure';
import { home, journey, lastKnownOf, momentOf, newSessionLinkOf, panelView, toolbarView, type Facts, type RunFacts } from '../src/core/steps';
import { TERMS_REFUSAL } from '../src/core/terms';
import { accessFact, type AccessRecord } from '../src/licensing/access';
import type { StatusFile } from '../src/core/contract';
import { runFacts, type RunState } from '../src/core/facts';

const NOW = Date.parse('2026-10-01T13:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const ORIGIN = 'https://ondemand.grid.wayne.edu';
const HOST = 'ondemand.grid.wayne.edu';
const LINK = 'https://claude.ai/code?environment=env_01AbCdEf';

const record = (extra: Partial<AccessRecord> = {}): AccessRecord => ({ v: 1, access_id: 'st1234', portal: HOST, approved: true, checked_at: ago(60 * MIN), until: null, last_attempt_at: ago(60 * MIN), ...extra });
const access = (r: AccessRecord | undefined, extra: { checking?: boolean } = {}) => accessFact({ record: r, accessId: 'st1234', portal: HOST, now: new Date(NOW), ...extra });

const NO_RUN: RunFacts = { present: false, phase: 'none', live: false, stale: false, renewal: false, chain: true, reason: 'line', pressed: false };

type Over = Partial<Omit<Facts, 'grid' | 'signin' | 'connect' | 'run' | 'site' | 'statement' | 'once' | 'setup'>> & {
  grid?: Partial<Facts['grid']>;
  signin?: Partial<Facts['signin']>;
  connect?: Partial<Facts['connect']>;
  run?: Partial<RunFacts>;
  site?: Partial<Facts['site']>;
  statement?: Partial<Facts['statement']>;
  once?: Facts['once'];
  setup?: Facts['setup'];
};

/** a student signed in to the grid, approved, set up, statement made, no worker yet, past the first run unless `once` says otherwise */
function facts(o: Over = {}): Facts {
  const base: Facts = {
    now: NOW,
    terms: true,
    portal: { origin: ORIGIN, hostname: HOST, site: 'wayne' },
    granted: true,
    site: { vpnApp: 'GlobalProtect', vpnPortal: 'protect.wayne.edu', title: 'Wayne State grid', hours: 8 },
    grid: { reach: 'answers', session: 'signed-in', account: 'st1234' },
    signin: { waiting: false },
    channel: { origin: ORIGIN, mode: 'direct', shell: 'ok', tested_at: ago(MIN) },
    access: access(record()),
    setup: { state: 'ready' },
    statement: { inForce: true, workerName: 'worker' },
    connect: { inFlight: false, queued: false, signin: 'none' },
    run: NO_RUN,
    waits: [],
    once: { first_online_at: ago(60 * MIN) },
    prefs: DEFAULT_PREFS,
    stopping: false,
    workingInTab: false,
  };
  return {
    ...base,
    ...o,
    grid: { ...base.grid, ...(o.grid ?? {}) },
    signin: { ...base.signin, ...(o.signin ?? {}) },
    connect: { ...base.connect, ...(o.connect ?? {}) },
    run: { ...base.run, ...(o.run ?? {}) },
    site: { ...base.site, ...(o.site ?? {}) },
    statement: { ...base.statement, ...(o.statement ?? {}) },
    once: o.once ?? base.once,
    setup: o.setup ?? base.setup,
  };
}

/** a live run as the files say, read 10 s ago */
const run = (r: Partial<RunFacts>): Partial<RunFacts> => ({ present: true, live: true, checkedAt: NOW - 10_000, pressed: true, ...r });
const firstRun = { once: {} };

const J = <M extends JourneyView['moment']>(f: Facts, m?: M) => journey(f, m) as Extract<JourneyView, { moment: M }>;

describe('journey: the first run, moment by moment', () => {
  it('welcome: the panel before the portal is granted', () => {
    expect(momentOf(facts({ ...firstRun, portal: undefined, granted: false }))).toBe('welcome');
  });

  it('GlobalProtect: only when the grid does not answer; looking, then still looking after 45 s, then "Connected." for 700 ms', () => {
    const f = facts({ ...firstRun, grid: { reach: 'no-route', session: 'unknown', lookingSince: NOW - 5_000 } });
    expect(momentOf(f)).toBe('globalprotect');
    const gp = J(f, 'globalprotect');
    expect(gp).toMatchObject({ title: 'Turn on GlobalProtect.', body: 'Open GlobalProtect and connect to protect.wayne.edu. Then approve the sign-in on your phone.', chip: 'protect.wayne.edu', status: { state: 'looking', text: 'Looking for the grid…' } });
    const still = J(facts({ ...firstRun, grid: { reach: 'no-route', session: 'unknown', lookingSince: NOW - 46_000 } }), 'globalprotect');
    expect(still.status).toEqual({ state: 'still', text: 'Still looking. Check that GlobalProtect says Connected.' });
    const connected = facts({ ...firstRun, grid: { reach: 'answers', session: 'signed-out', answeredAt: NOW - 300 } });
    expect(momentOf(connected)).toBe('globalprotect');
    expect(J(connected, 'globalprotect').status).toEqual({ state: 'connected', text: 'Connected.' });
    expect(momentOf(facts({ ...firstRun, grid: { reach: 'answers', session: 'signed-out', answeredAt: NOW - 800 } }))).toBe('grid');
  });

  it('GlobalProtect with no site profile says "your VPN" (D20)', () => {
    const gp = J(facts({ ...firstRun, site: { vpnApp: undefined, vpnPortal: undefined }, grid: { reach: 'no-route', session: 'unknown' } }), 'globalprotect');
    expect(gp.title).toBe('Turn on your VPN.');
    expect(gp.body).toBe("Connect to your university's VPN.");
    expect(gp.chip).toBeUndefined();
  });

  it('the grid sign-in: Chrome\'s own box, then "Signed in as st1234." with the drawn check', () => {
    const f = facts({ ...firstRun, grid: { session: 'signed-out', account: undefined }, signin: { waiting: true } });
    expect(momentOf(f)).toBe('grid');
    const g = J(f, 'grid');
    expect(g.title).toBe('Sign in to the grid');
    expect(g.body).toBe('Use your AccessID and password in the box Chrome shows. Beethoven never sees them.');
    expect(g.problem).toBeUndefined();
    const done = facts({ ...firstRun, signin: { waiting: false, signedInAt: NOW - 500 } });
    expect(momentOf(done)).toBe('grid');
    expect(J(done, 'grid').signedIn).toBe('Signed in as st1234.');
    expect(momentOf(facts({ ...firstRun, signin: { waiting: false, signedInAt: NOW - 2_000 } }))).toBe('statement');
  });

  it('the grid sign-in when it goes wrong, never "Failed to fetch"', () => {
    const p = (signin: Partial<Facts['signin']>, grid: Partial<Facts['grid']> = { session: 'signed-out' }) => J(facts({ ...firstRun, grid, signin }), 'grid').problem;
    expect(p({ waiting: true, problem: 'cancelled' })).toEqual({ body: 'Not signed in yet.', button: { label: 'Sign in again', tone: 'ink', action: { kind: 'sign-in-grid' } } });
    expect(p({ waiting: false, problem: 'tab-closed' })).toEqual({ body: 'The sign-in tab was closed.', button: { label: 'Sign in again', tone: 'ink', action: { kind: 'sign-in-grid' } } });
    expect(p({ waiting: true, problem: 'start-page' })).toEqual({ body: 'Press LOGIN TO ONDEMAND on the grid page.' });
    expect(p({ waiting: true }, { session: 'unreachable' })).toEqual({ body: "Can't reach the grid. Is GlobalProtect on?", button: { label: 'Try again', tone: 'ink', action: { kind: 'retry-grid' } } });
    expect(p({ waiting: true }, { session: 'not-ood' })).toEqual({ body: "This doesn't look like an OnDemand portal.", button: { label: 'Use another portal', tone: 'ink', action: { kind: 'open-settings' } } });
  });

  it('where your work goes: the four lines, the fold, the tick, Connect and the checklist that ticks itself', () => {
    const s = J(facts({ ...firstRun, statement: { inForce: false } }), 'statement');
    expect(s.title).toBe('Where your work goes');
    expect(s.lines).toEqual([...SHORT_STATEMENT]);
    expect(s.lines).toEqual(['Claude sees the files your worker reads and what its commands print.', 'Anthropic keeps the chat under your plan: 30 days, or 5 years if you allow training.', 'No business associate agreement (HIPAA) covers a personal plan.', "It uses your Claude plan's limits."]);
    expect(s.tick).toBe("I'll keep FERPA, IRB, health and export-controlled data out of my worker, and turn on Remote Control for it.");
    expect(s.tick).toBe(STATEMENT_TICK);
    expect(s.more.sentences).toEqual(PLAN_CLASS_DISCLOSURE);
    expect(s.more.workerName).toBe('Worker name: worker');
    expect(s.more.markRestricted).toMatchObject({ label: 'Mark this workspace restricted', action: { kind: 'restrict', workerName: 'worker' } });
    expect(s.connect).toEqual({ label: 'Connect', tone: 'ink', action: { kind: 'connect', statement: { tick: STATEMENT_TICK, lines: [...SHORT_STATEMENT], buttonLabel: 'Connect' } } });
    expect(s.checklist).toEqual([
      { text: 'Signed in as st1234', state: 'done' },
      { text: 'Approved', state: 'done' },
      { text: 'Your grid account is ready', state: 'done' },
    ]);
    expect(s.problem).toBeUndefined();
    const checking = J(facts({ ...firstRun, access: access(undefined, { checking: true }), setup: { state: 'unknown' } }), 'statement');
    expect(checking.checklist.map((r) => r.state)).toEqual(['done', 'now', 'next']);
    const setting = J(facts({ ...firstRun, setup: { state: 'setting-up' } }), 'statement');
    expect(setting.checklist.map((r) => r.state)).toEqual(['done', 'done', 'now']);
    const kept = J(facts({ ...firstRun, press: { kind: 'connect', at: ago(1000) } }), 'statement');
    expect(kept.connect).toMatchObject({ label: 'Connecting when ready…', busy: true });
  });

  it('where your work goes when it goes wrong: the title and body change', () => {
    const p = (o: Over) => {
      const s = J(facts({ ...firstRun, ...o }), 'statement');
      return { title: s.title, ...s.problem };
    };
    expect(p({ access: access(record({ approved: false, until: undefined })) })).toEqual({ title: 'Ask for access', body: "st1234 isn't approved for Beethoven yet. Beethoven checks again when you open it.", button: { label: 'Ask for access', tone: 'ink', action: { kind: 'ask-access' } } });
    expect(p({ access: access(record({ approved: false, until: undefined, reason: 'other_installation' })) })).toEqual({ title: 'Ask your lab lead', body: 'st1234 is set up on another computer. Your lab lead can move it here.' });
    expect(p({ access: access(record({ approved: false, until: undefined, reason: 'other_account' })) })).toEqual({ title: 'Ask your lab lead', body: 'This browser is set up for another AccessID. Ask your lab lead.' });
    expect(p({ access: access(record({ approved: false, until: undefined, reason: 'update_required' })) })).toEqual({ title: 'Update Beethoven', body: 'This version is out of date.', button: { label: 'Update', tone: 'ink', action: { kind: 'update' } } });
    expect(p({ access: access({ v: 1, access_id: 'st1234', portal: HOST, last_attempt_at: ago(MIN), last_error: 'no answer' }) })).toEqual({ title: 'Where your work goes', body: "Can't check your approval right now.", button: { label: 'Try again', tone: 'ink', action: { kind: 'retry-access' } } });
    expect(p({ setup: { state: 'no-shared' } })).toEqual({ title: 'Where your work goes', body: "Your grid account can't use the lab's copy yet. Ask your lab lead.", button: { label: 'Copy details', tone: 'ink', action: { kind: 'copy-details' } } });
    expect(p({ statement: { restricted: true } })).toEqual({ title: 'Where your work goes', body: 'This workspace is marked restricted. Choose another under More about your data.' });
  });

  it('connect: "Asking the grid for a computer…" over the track, then the busy line after 2 min, and a refusal with Try again', () => {
    const f = facts({ ...firstRun, connect: { inFlight: true, pressedAt: NOW - 5_000 } });
    expect(momentOf(f)).toBe('connect');
    const c = J(f, 'connect');
    expect(c.hero).toBe('Asking the grid for a computer…');
    expect(c.sub).toBe('Getting your Claude sign-in ready…');
    expect(c.track.map((n) => `${n.label}:${n.state}`)).toEqual(['Asked:current', 'In line:future', 'Starting:future', 'Online:future']);
    expect(J(facts({ ...firstRun, connect: { inFlight: true, signinWaitSince: NOW - 2 * MIN - 1 } }), 'connect').sub).toBe('The grid is busy. Still finding a computer for the sign-in…');
    const refused = facts({ ...firstRun, connect: { inFlight: false, pressedAt: NOW - 30_000, failure: 'refused' } });
    expect(momentOf(refused)).toBe('connect');
    // the wait has ended: the refusal is the moment's headline, with what to do and Try again; the track's node stops, brick
    expect(J(refused, 'connect').problem).toEqual({ title: "The grid didn't take the request.", body: 'Try again in a minute. If it happens again, Details for your lab lead has the reason.', button: { label: 'Try again', tone: 'ink', action: { kind: 'retry' } } });
    expect(J(refused, 'connect').track[0].state).toBe('failed');
    const noNode = facts({ ...firstRun, connect: { inFlight: false, queued: true, pressedAt: NOW - 30_000, failure: 'signin-node' }, run: run({ phase: 'queued', submittedAt: ago(MIN) }) });
    const q = J(noNode, 'queue');
    expect(q.problem).toEqual({ title: "The grid didn't find a computer for the sign-in.", body: 'Your worker keeps its place in line.', button: { label: 'Try again', tone: 'ink', action: { kind: 'sign-in-claude' } } });
    expect(q.timer).toBeUndefined();
  });

  it('the Claude sign-in: the box, the worker already in line, then "Signed in as … · Max" for 3 s', () => {
    const f = facts({ ...firstRun, connect: { inFlight: true, queued: true, signin: 'link' }, run: run({ phase: 'queued', submittedAt: ago(72_000) }) });
    expect(momentOf(f)).toBe('claude');
    const c = J(f, 'claude');
    expect(c.title).toBe('Sign in to Claude');
    expect(c.body).toBe('Approve in the Claude tab, then paste the code here.');
    expect(c.box).toEqual({ placeholder: 'Paste code', focus: true, checking: false, continueLabel: 'Continue' });
    expect(c.reopen).toEqual({ label: 'Open the Claude tab again', tone: 'link', action: { kind: 'reopen-claude-tab' } });
    expect(c.inLine).toEqual({ since: ago(72_000) });
    expect(J(facts({ ...firstRun, connect: { inFlight: true, queued: true, signin: 'checking' } }), 'claude').box.checking).toBe(true);
    // the student was on the moment (the link was shown): "Signed in as … · Max" holds it 3 s
    const signed = facts({ ...firstRun, connect: { inFlight: true, queued: true, linkShown: true, signin: 'signed-in', signedIn: { email: 'alex@wayne.edu', plan: 'max', at: NOW - 1_000 } }, run: run({ phase: 'queued', submittedAt: ago(90_000) }) });
    expect(momentOf(signed)).toBe('claude');
    expect(J(signed, 'claude').signedIn).toBe('Signed in as alex@wayne.edu · Max');
    expect(J(signed, 'claude').body).toBe('Approve in the Claude tab, then paste the code here.');
    // already signed in on the grid (no link shown): the moment never appears (spec moment 8; a toast says who)
    expect(momentOf(facts({ ...firstRun, connect: { inFlight: true, queued: true, signin: 'signed-in', signedIn: { email: 'a', plan: 'max', at: NOW - 1_000 } }, run: run({ phase: 'queued', submittedAt: ago(90_000) }) }))).toBe('queue');
    // the sign-in the background lost (stopped mid-sitting): a plain sentence and Sign in again
    const lost = J(facts({ ...firstRun, connect: { inFlight: false, queued: true, interrupted: true } }), 'claude');
    expect(lost.problem).toEqual({ body: 'The sign-in stopped before it finished.', button: { label: 'Sign in again', tone: 'ink', action: { kind: 'sign-in-claude' } } });
    expect(momentOf(facts({ ...firstRun, connect: { inFlight: false, queued: true, signin: 'signed-in', signedIn: { email: 'a', plan: 'max', at: NOW - 3_500 } }, run: run({ phase: 'queued', submittedAt: ago(90_000) }) }))).toBe('queue');
  });

  it('the Claude sign-in when it goes wrong', () => {
    const p = (c: Partial<Facts['connect']>) => J(facts({ ...firstRun, connect: { queued: true, signin: 'link', ...c } }), 'claude').problem;
    expect(p({ badCode: true })).toEqual({ body: "That code didn't work. Copy it again from the Claude tab." });
    expect(p({ failure: 'signin-timeout' })).toEqual({ body: 'The sign-in timed out.', button: { label: 'Sign in again', tone: 'ink', action: { kind: 'sign-in-claude' } } });
    expect(p({ claudeTabClosed: true })).toEqual({ body: 'The Claude tab was closed.', button: { label: 'Open it again', tone: 'ink', action: { kind: 'reopen-claude-tab' } } });
    expect(p({ noPlan: true, signin: 'signed-in', signedIn: { email: 'a@b.c', plan: 'free', at: NOW } })).toEqual({ body: 'This Claude account has no Pro or Max plan. Remote Control needs one.', button: { label: 'Use another account', tone: 'ink', action: { kind: 'sign-in-claude', fresh: true } } });
  });

  it('the one-time key step (AM2), each phase in its words', () => {
    const line = 'bash /rs/rs_grp_oschome/shared/beethoven/hpcworker/current/bin/hpcworker login-setup';
    const ls = (phase: NonNullable<Facts['loginSetup']>['phase']) => J(facts({ ...firstRun, loginSetup: { phase, line } }), 'login-setup');
    expect(momentOf(facts({ ...firstRun, loginSetup: { phase: 'offer', line } }))).toBe('login-setup');
    expect(ls('offer')).toEqual({ moment: 'login-setup', phase: 'offer', title: 'One more thing, once.', body: "Type your grid password in the grid's own terminal. Beethoven never sees it.", button: { label: 'Open the grid terminal', tone: 'ink', action: { kind: 'open-terminal-for-login-setup' } }, line });
    expect(ls('password')).toMatchObject({ body: 'Type your password in the terminal, then press Enter.', button: { label: "I'm in", action: { kind: 'login-setup-in' } } });
    expect(ls('checking')).toMatchObject({ body: 'Checking…' });
    expect(ls('checking').button).toBeUndefined();
    expect(ls('done')).toMatchObject({ body: "Done. You won't need this again." });
    expect(ls('paste')).toMatchObject({ body: 'Paste, then press Enter.', fold: { label: 'What does the line do?', line, explain: "It makes a key in your grid account that only the grid's own website can use, so it stops asking." } });
    expect(ls('closed')).toMatchObject({ body: 'Not done yet.', button: { label: 'Open the grid terminal' } });
  });

  it('in line: the clock from submitted_at, the estimate or the last wait, the busy line past 15 min, and the reason classes', () => {
    const q = (r: Partial<RunFacts>, o: Over = {}) => J(facts({ ...firstRun, connect: { queued: true }, ...o, run: run({ phase: 'queued', submittedAt: ago(161_000), ...r }) }), 'queue');
    const plain = q({});
    expect(plain.hero).toBe('In line for a computer');
    expect(plain.timer).toEqual({ since: ago(161_000) });
    expect(plain.sub).toEqual(['It starts as soon as one is free. You can close this panel.']);
    expect(plain.track.map((n) => n.state)).toEqual(['done', 'current', 'future', 'future']);
    const est = NOW + 12 * MIN;
    expect(q({ expectedStart: new Date(est).toISOString() }).sub).toEqual(['It starts as soon as one is free. You can close this panel.', `Expected around ${formatClock(est, true)}.`]);
    expect(q({}, { waits: [9, 6] }).sub[1]).toBe('Last time: 6 min.');
    expect(q({ submittedAt: ago(16 * MIN) }).sub[1]).toBe('The grid is busy today. Your worker is still in line.');
    expect(q({ reason: 'share' })).toMatchObject({ hero: 'Waiting for your share of the grid', sub: ['It starts when your other grid jobs finish.'] });
    expect(q({ reason: 'maintenance' })).toMatchObject({ hero: 'The grid is under maintenance', sub: ["Your worker starts when it's back."] });
    // the wait has ended: its own headline, no clock, Try again (the reason is under Show log)
    expect(q({ phase: 'error' }, { connect: { queued: true } }).problem).toEqual({ title: "Your worker couldn't start.", body: '', button: { label: 'Try again', tone: 'ink', action: { kind: 'retry' } } });
    expect(q({ phase: 'error' }, { connect: { queued: true } }).timer).toBeUndefined();
    expect(q({}, { grid: { session: 'unreachable' } }).problem).toEqual({ body: "Can't reach the grid. Is GlobalProtect on? Your worker keeps its place in line." });
  });

  it('the tour plays during the first wait in which nothing is asked of the student, never during the Claude sign-in', () => {
    const v = (c: Partial<Facts['connect']>, extra: Over = {}) => panelView(facts({ ...firstRun, connect: { queued: true, ...c }, run: run({ phase: 'queued', submittedAt: ago(60_000) }), ...extra }));
    const playing = v({ signin: 'signed-in', signedIn: { at: NOW - 10_000 } });
    expect(playing.kind === 'journey' && playing.journey.moment).toBe('queue');
    expect(playing.kind === 'journey' && playing.overlays.tour?.source).toBe('auto');
    const asked = v({ signin: 'asked' });
    expect(asked.kind === 'journey' && asked.overlays.tour).toBeUndefined();
    const seen = v({ signin: 'none' }, { tourSeen: { seen_at: ago(MIN), completed: true } });
    expect(seen.kind === 'journey' && seen.overlays.tour).toBeUndefined();
  });

  it('starting: got a computer (with its clock), connecting, slow, needs a sign-in, reconnecting', () => {
    const s = (r: Partial<RunFacts>) => J(facts({ ...firstRun, connect: { queued: true }, run: run(r) }), 'starting');
    expect(momentOf(facts({ ...firstRun, run: run({ phase: 'got-computer', gotComputerAt: ago(20_000) }) }))).toBe('starting');
    expect(s({ phase: 'got-computer', gotComputerAt: ago(20_000) })).toMatchObject({ hero: 'Starting', sub: 'Got a computer. Connecting to Claude…', timer: { since: ago(20_000) } });
    expect(s({ phase: 'connecting' })).toMatchObject({ hero: 'Starting', sub: 'Connecting to Claude…' });
    expect(s({ phase: 'slow' }).problem).toEqual({ body: 'Still connecting. This is taking longer than usual.', button: { label: 'Show log', tone: 'link', action: { kind: 'log', open: true } } });
    expect(s({ phase: 'needs-claude' }).problem).toEqual({ body: 'Sign in to Claude to finish.', button: { label: 'Sign in to Claude', tone: 'ink', action: { kind: 'sign-in-claude' } } });
    expect(s({ phase: 'reconnecting' }).problem).toEqual({ body: 'Reconnecting…' });
  });

  it('online: "You\'re online." with the minutes since the press, the teal "Open my session", the burst, and the pin tip', () => {
    const f = facts({ ...firstRun, run: run({ phase: 'online', link: LINK, readyMinutes: 7, onlineAt: ago(5_000) }), onlineAnnouncedAt: NOW - 1_000, pinned: false });
    expect(momentOf(f)).toBe('online');
    const o = J(f, 'online');
    expect(o.hero).toBe("You're online.");
    expect(o.sub).toBe('Ready in Claude, 7 min after you asked. Look for Wayne State grid.');
    expect(o.primary).toEqual({ label: 'Open my session', tone: 'teal', action: { kind: 'open-session' } });
    expect(o.burst).toBe(true);
    expect(o.track.every((n) => n.state === 'done')).toBe(true);
    expect(o.pinTip).toEqual({ text: 'Keep Beethoven one click away: the puzzle icon, then the pin.', done: false });
    const pinned = J(facts({ ...firstRun, run: run({ phase: 'online', link: LINK, readyMinutes: 7 }), pinned: true, once: { pin_tip_shown_at: ago(5_000), pin_tip_done_at: ago(1_000) } }), 'online');
    expect(pinned.pinTip).toEqual({ text: 'Pinned.', done: true });
    const bad = J(facts({ ...firstRun, run: run({ phase: 'online', badLink: true }) }), 'online');
    expect(bad.sub).toBe('Online, but the link looks wrong. Open claude.ai/code and look for Wayne State grid.');
  });
});

describe('home: the waiting and status table, one primary or none', () => {
  const hv = (o: Over) => home(facts(o));

  it('asked: the connect line in flight; no primary; badge "…" ochre', () => {
    const f = facts({ connect: { inFlight: true } });
    const h = home(f);
    expect(h.hero).toMatchObject({ state: 'asked', orb: 'waiting', word: 'Asking the grid for a computer…' });
    expect(h.primary).toBeUndefined();
    expect(h.rows.worker).toEqual({ state: 'asked', text: 'Asking…' });
    expect(toolbarView(f)).toEqual({ badge: { text: '…', color: 'ochre' }, title: 'Beethoven · Starting', lit: false });
  });

  it('in line: the clock before the sentence, "Asked at", Cancel, and the minutes on the toolbar', () => {
    const f = facts({ run: run({ phase: 'queued', submittedAt: ago(3 * MIN + 12_000) }) });
    const h = home(f);
    expect(h.hero).toMatchObject({ state: 'queued', orb: 'waiting', word: 'In line for a computer', sub: 'It starts as soon as one is free.', timer: { since: ago(3 * MIN + 12_000) }, timerPlace: 'before' });
    expect(h.primary).toBeUndefined();
    expect(h.track?.map((n) => n.state)).toEqual(['done', 'current', 'future', 'future']);
    expect(h.rows.worker).toEqual({ state: 'queued', text: 'In line · 3 min' });
    expect(h.foot.left).toBe(`Asked at ${formatClock(ago(3 * MIN + 12_000), true)}`);
    expect(h.foot.right).toEqual({ label: 'Cancel', tone: 'text', action: { kind: 'stop' } });
    expect(toolbarView(f)).toEqual({ badge: { text: '3m', color: 'ochre' }, title: 'Beethoven · In line for 3 min', lit: false });
    expect(hv({ run: run({ phase: 'queued', submittedAt: ago(MIN), expectedStart: new Date(NOW + 12 * MIN).toISOString() }) }).hero.sub).toBe(`It starts as soon as one is free. Expected around ${formatClock(NOW + 12 * MIN, true)}.`);
    expect(hv({ waits: [6], run: run({ phase: 'queued', submittedAt: ago(MIN) }) }).hero.sub).toBe('It starts as soon as one is free. Last time: 6 min.');
    expect(hv({ run: run({ phase: 'queued', submittedAt: ago(16 * MIN) }) }).hero.sub).toBe('It starts as soon as one is free. The grid is busy today. Your worker is still in line.');
    expect(hv({ run: run({ phase: 'queued', reason: 'share', submittedAt: ago(MIN) }) }).hero).toMatchObject({ state: 'queued-share', word: 'Waiting for your share of the grid', sub: 'It starts when your other grid jobs finish.' });
    expect(hv({ run: run({ phase: 'queued', reason: 'maintenance', submittedAt: ago(MIN) }) }).hero).toMatchObject({ state: 'queued-maintenance', word: 'The grid is under maintenance', sub: "Your worker starts when it's back." });
    // a chain successor: no clock counted from hours ago (R10)
    expect(hv({ run: run({ phase: 'queued', renewal: true }) }).hero.timer).toBeUndefined();
  });

  it('starting: got a computer (the clock after), connecting, slow, reconnecting, renewing', () => {
    expect(hv({ run: run({ phase: 'got-computer', gotComputerAt: ago(20_000) }) }).hero).toMatchObject({ state: 'got-computer', orb: 'starting', word: 'Starting', sub: 'Got a computer. Connecting to Claude…', timer: { since: ago(20_000) }, timerPlace: 'after' });
    expect(hv({ run: run({ phase: 'connecting' }) }).hero).toMatchObject({ word: 'Starting', sub: 'Connecting to Claude…' });
    expect(hv({ run: run({ phase: 'slow' }) }).hero).toMatchObject({ word: 'Still connecting', sub: 'This is taking longer than usual.' });
    const rec = facts({ run: run({ phase: 'reconnecting' }) });
    expect(home(rec).hero).toMatchObject({ word: 'Reconnecting', sub: 'Claude dropped the connection. Trying again.' });
    expect(toolbarView(rec).badge).toEqual({ text: '…', color: 'ochre' });
    expect(hv({ run: run({ phase: 'renewing' }) }).hero).toMatchObject({ word: 'Renewing', sub: 'Your worker restarts itself every 8 hours. Back in a few minutes.' });
    for (const phase of ['got-computer', 'connecting', 'slow', 'reconnecting', 'renewing'] as const) expect(hv({ run: run({ phase }) }).primary, phase).toBeUndefined();
  });

  it('needs you: "Sign in to Claude to finish." with its one primary and the "!" badge', () => {
    const f = facts({ run: run({ phase: 'needs-claude', claude: { loggedIn: false } }) });
    const h = home(f);
    expect(h.hero).toMatchObject({ word: 'Needs you', sub: 'Sign in to Claude to finish.', orb: 'needs' });
    expect(h.primary).toEqual({ kind: 'sign-in-claude', button: { label: 'Sign in to Claude', tone: 'ink', action: { kind: 'sign-in-claude' } } });
    expect(h.rows.claude).toEqual({ state: 'needs', text: 'Needs sign-in', link: { label: 'Sign in', tone: 'link', action: { kind: 'sign-in-claude' } } });
    expect(toolbarView(f)).toMatchObject({ badge: { text: '!', color: 'ochre' }, title: 'Beethoven · Needs you' });
  });

  it('online: the lit icon, "Open my session", the secondary row, the rows, "Renews itself at" and Stop with its confirmation', () => {
    const ends = NOW + 3 * 60 * MIN;
    const f = facts({ run: run({ phase: 'online', link: LINK, onlineAt: ago((2 * 60 + 14) * MIN), endsAt: new Date(ends).toISOString(), claude: { loggedIn: true, plan: 'max' } }) });
    const h = home(f);
    expect(h.hero).toMatchObject({ state: 'online', orb: 'online', word: 'Online', sub: 'Wayne State grid · up 2 h 14 min' });
    expect(h.primary).toEqual({ kind: 'open-session', button: { label: 'Open my session', tone: 'teal', action: { kind: 'open-session' } } });
    expect(h.secondary).toEqual({ newSession: { label: 'New session', tone: 'outline', action: { kind: 'new-session' } }, copyLink: 'Copy link', phone: 'Phone' });
    expect(h.link).toBe(LINK);
    expect(h.rows).toEqual({ grid: { state: 'signed-in', text: 'Signed in as st1234' }, claude: { state: 'signed-in', text: 'Signed in · Max' }, worker: { state: 'online', text: 'Online · checked 10 s ago' } });
    expect(h.foot).toEqual({ left: `Renews itself at ${formatClock(ends, true)}`, right: { label: 'Stop', tone: 'text', action: { kind: 'stop' } }, confirm: { text: 'Stop your worker? Open sessions end.', stop: { label: 'Stop', tone: 'text', action: { kind: 'stop' } }, keep: 'Keep it' }, stopping: false });
    expect(toolbarView(f)).toEqual({ title: 'Beethoven · Online for 2 h 14 min', lit: true });
    expect(h.track).toBeUndefined();
    expect(home(facts({ ...f, stopping: true } as Over)).foot.stopping).toBe(true);
  });

  it('online just now: "You\'re online." with the burst, for 4 s', () => {
    const h = hv({ run: run({ phase: 'online', link: LINK, readyMinutes: 7 }), onlineAnnouncedAt: NOW - 1_000 });
    expect(h.hero).toMatchObject({ state: 'online-new', word: "You're online.", sub: 'Ready in Claude, 7 min after you asked. Look for Wayne State grid.', burst: true });
    expect(hv({ run: run({ phase: 'online', link: LINK }), onlineAnnouncedAt: NOW - 5_000 }).hero.state).toBe('online');
  });

  it('stopped: Connect with its one-line reminder; no badge', () => {
    const f = facts({ run: run({ phase: 'stopped', live: false }) });
    const h = home(f);
    expect(h.hero).toMatchObject({ state: 'stopped', orb: 'stopped', word: 'Stopped', sub: 'Connect to start Claude on the grid.' });
    expect(h.primary).toEqual({ kind: 'connect', button: { label: 'Connect', tone: 'ink', action: { kind: 'connect' } }, reminder: "Your worker's files and output go to Anthropic. Keep restricted data out." });
    expect(h.foot.right).toBeUndefined();
    expect(toolbarView(f)).toEqual({ title: 'Beethoven', lit: false });
  });

  it("couldn't start: one plain reason and Try again; the brick badge", () => {
    const f = facts({ run: run({ phase: 'error', live: false }) });
    const h = home(f);
    expect(h.hero).toMatchObject({ state: 'error', orb: 'error', word: "Couldn't start", sub: "Your worker couldn't start." });
    expect(h.primary).toEqual({ kind: 'retry', button: { label: 'Try again', tone: 'ink', action: { kind: 'retry' } } });
    expect(toolbarView(f)).toEqual({ badge: { text: '!', color: 'brick' }, title: "Beethoven · Couldn't start", lit: false });
    expect(hv({ connect: { failure: 'refused', pressedAt: NOW - MIN } }).hero).toMatchObject({ state: 'error', sub: "The grid didn't take the request." });
  });

  it('signed out of the grid: the last known state "As of …", the Grid row\'s Sign in, and "Open my session" from the stored link', () => {
    const lk: LastKnown = { worker_name: 'worker', state: 'online', title: 'Wayne State grid', environment_url: LINK, seen_at: ago(4 * 60 * MIN), online_since: ago(18 * 60 * MIN) };
    const h = hv({ grid: { session: 'signed-out', account: 'st1234' }, lastKnown: lk });
    expect(h.hero).toMatchObject({ state: 'online', word: 'Online', asOf: `As of ${formatClock(lk.seen_at, true)}. Sign in to the grid to see it live.` });
    expect(h.rows.grid).toEqual({ state: 'signed-out', text: 'Signed out', link: { label: 'Sign in', tone: 'link', action: { kind: 'sign-in-grid' } } });
    expect(h.rows.worker).toEqual({ state: 'as-of', text: `As of ${formatClock(lk.seen_at, true)} · online` });
    expect(h.rows.claude).toEqual({ state: 'unknown', text: 'Not checked yet' });
    expect(h.primary?.kind).toBe('open-session');
    expect(h.link).toBe(LINK);
    expect(h.foot.right).toBeUndefined();
  });

  it("can't reach the grid: \"Is GlobalProtect on? Your worker keeps running.\" when it was last seen online; \"Open my session\" still works", () => {
    const lk: LastKnown = { worker_name: 'worker', state: 'online', environment_url: LINK, seen_at: ago(30 * MIN) };
    const h = hv({ grid: { reach: 'no-route', session: 'unreachable' }, lastKnown: lk });
    expect(h.hero).toMatchObject({ state: 'unreachable', word: "Can't reach the grid", sub: 'Is GlobalProtect on? Your worker keeps running.' });
    // the hero asks about GlobalProtect; the row says only that
    expect(h.rows.grid).toEqual({ state: 'unreachable', text: "Can't reach" });
    expect(h.primary?.kind).toBe('open-session');
  });

  it('before the first check of a browser session, the rows say "Checking…" and "Not checked yet", and the stored state shows at once', () => {
    const lk: LastKnown = { worker_name: 'worker', state: 'online', environment_url: LINK, seen_at: ago(30 * MIN) };
    const h = hv({ grid: { reach: 'unknown', session: 'unknown', account: undefined }, lastKnown: lk });
    expect(h.rows.grid).toEqual({ state: 'checking', text: 'Checking…' });
    expect(h.rows.claude.text).toBe('Not checked yet');
    expect(h.hero.word).toBe('Online');
    expect(h.hero.asOf).toBeUndefined();
  });

  it('Try asking for the first 3 days online, until dismissed; the tour card once; the menu', () => {
    const online = run({ phase: 'online', link: LINK });
    const h = hv({ run: online, once: { first_online_at: ago(60 * MIN) } });
    expect(h.tryAsking).toEqual({ eyebrow: 'Try asking', prompts: ['Is the female pelvis relatively wider?', "What's in my workspace? Suggest a first analysis.", "Write a Slurm job for my script, submit it, and tell me when it's done."], copied: 'Copied. Paste it in Claude.', dismiss: { kind: 'dismiss', card: 'try-asking' } });
    expect(hv({ run: online, once: { first_online_at: ago(4 * 24 * 60 * MIN) } }).tryAsking).toBeUndefined();
    expect(hv({ run: online, once: { first_online_at: ago(MIN), try_asking_dismissed_at: ago(1) } }).tryAsking).toBeUndefined();
    expect(h.cards).toEqual([{ id: 'tour-card', text: 'See what it can do · 16 s', open: { kind: 'tour', event: 'start' }, dismiss: { kind: 'dismiss', card: 'tour-card' } }]);
    expect(hv({ run: online, tourSeen: { seen_at: ago(1), completed: false } }).cards).toEqual([]);
    expect(h.header.menu.map((m) => m.label)).toEqual(['See what it can do', 'Your files', 'Settings', 'Details for your lab lead', 'Copy debug log', 'Help']);
    expect(h.header.moreLabel).toBe('More');
    expect(h.log).toEqual({ show: 'Show log ›', hide: 'Hide log', copy: 'Copy log' });
  });

  it('exactly one primary in the states that have one, and none while asked, in line, starting or renewing', () => {
    const want: Array<[Partial<RunFacts>, HomeView['primary'] extends infer P ? (P extends { kind: infer K } ? K | undefined : never) : never]> = [
      [{ phase: 'online', link: LINK }, 'open-session'],
      [{ phase: 'stopped', live: false }, 'connect'],
      [{ phase: 'needs-claude' }, 'sign-in-claude'],
      [{ phase: 'needs-consent' }, 'connect'],
      [{ phase: 'error', live: false }, 'retry'],
      [{ phase: 'queued', submittedAt: ago(MIN) }, undefined],
      [{ phase: 'got-computer' }, undefined],
      [{ phase: 'connecting' }, undefined],
      [{ phase: 'renewing' }, undefined],
    ];
    for (const [r, kind] of want) expect(hv({ run: run(r) }).primary?.kind, r.phase).toBe(kind);
  });
});

describe('the panel', () => {
  it('before the agreement: "Finish on the welcome page" with TERMS_REFUSAL and one button; never that sentence while the press is under way', () => {
    const v = panelView(facts({ terms: false }));
    expect(v).toMatchObject({ kind: 'journey', journey: { moment: 'welcome', state: 'finish', title: 'Finish on the welcome page', body: TERMS_REFUSAL, button: { label: 'Open the welcome page', tone: 'ink', action: { kind: 'open-settings' } } } });
    expect(TERMS_REFUSAL).toBe("The Beethoven terms haven't been accepted in this browser yet. Open Beethoven's welcome page to accept them.");
    // the panel opened by the press itself, Chrome's box up: "Almost there."
    const pressed = panelView(facts({ terms: false, welcome: { state: 'idle', pressAt: NOW - 2_000 } }));
    expect(pressed).toMatchObject({ kind: 'journey', journey: { moment: 'welcome', state: 'waiting', title: 'Almost there.', body: "Choose Allow in Chrome's box. Beethoven carries on here.", status: 'Waiting for Chrome…' } });
    expect(JSON.stringify(pressed)).not.toContain("haven't been accepted");
    // Deny: the record is saved, the portal is not
    const denied = panelView(facts({ ...firstRun, terms: true, portal: undefined, granted: false, welcome: { state: 'denied' } }));
    expect(denied).toMatchObject({ kind: 'journey', journey: { moment: 'welcome', state: 'denied', body: 'Choose Try again on the welcome page.' } });
  });

  it("after the first run, Chrome's grant of the portal taken away: one press puts it back, not a VPN sentence", () => {
    const v = panelView(facts({ granted: false }));
    expect(v).toMatchObject({ kind: 'journey', journey: { moment: 'welcome', state: 'revoked', title: 'Allow Beethoven again', origin: 'https://ondemand.grid.wayne.edu', button: { label: 'Allow again', action: { kind: 'use-portal', origin: 'https://ondemand.grid.wayne.edu', granted: false } } } });
    expect(JSON.stringify(v)).not.toContain('GlobalProtect');
  });

  it('the journey until the first time online, then the home; a moment that needs the student comes back over the home', () => {
    expect(panelView(facts({ ...firstRun, statement: { inForce: false } })).kind).toBe('journey');
    expect(panelView(facts({ run: run({ phase: 'stopped', live: false }) })).kind).toBe('home');
    const signin = panelView(facts({ grid: { session: 'signed-out' }, signin: { waiting: true }, press: { kind: 'connect', at: ago(1) } }));
    expect(signin.kind === 'journey' && signin.journey.moment).toBe('grid');
    const claude = panelView(facts({ connect: { inFlight: true, queued: true, signin: 'link' }, run: run({ phase: 'queued', submittedAt: ago(MIN) }) }));
    expect(claude.kind === 'journey' && claude.journey.moment).toBe('claude');
    const key = panelView(facts({ loginSetup: { phase: 'offer', line: 'bash /a/bin/hpcworker login-setup' } }));
    expect(key.kind === 'journey' && key.journey.moment).toBe('login-setup');
    const online = panelView(facts({ run: run({ phase: 'online', link: LINK, readyMinutes: 7 }), onlineAnnouncedAt: NOW - 2_000 }));
    expect(online.kind === 'journey' && online.journey.moment).toBe('online');
    expect(panelView(facts({ run: run({ phase: 'online', link: LINK }), onlineAnnouncedAt: NOW - 4_500 })).kind).toBe('home');
  });

  it('after the first run, the data statement comes back before a Connect when it is not in force (a new worker name, a new text)', () => {
    const v = panelView(facts({ statement: { inForce: false, workerName: 'thesis' }, run: run({ phase: 'stopped', live: false }) }));
    expect(v.kind === 'journey' && v.journey.moment).toBe('statement');
    expect(v.kind === 'journey' && v.journey.moment === 'statement' && v.journey.more.workerName).toBe('Worker name: thesis');
    // a live worker is not interrupted; one that needs the Remote Control answer is
    expect(panelView(facts({ statement: { inForce: false }, run: run({ phase: 'online', link: LINK }) })).kind).toBe('home');
    const consent = panelView(facts({ statement: { inForce: false }, run: run({ phase: 'needs-consent' }) }));
    expect(consent.kind === 'journey' && consent.journey.moment).toBe('statement');
    // signed out: the home, with its Sign in
    expect(panelView(facts({ statement: { inForce: false }, grid: { session: 'signed-out' }, run: run({ phase: 'stopped', live: false }) })).kind).toBe('home');
  });

  it('a press while the grid cannot be reached opens no sign-in moment; the home says it cannot reach the grid', () => {
    const v = panelView(facts({ grid: { reach: 'no-route', session: 'unreachable' }, press: { kind: 'connect', at: ago(1) } }));
    expect(v.kind).toBe('home');
  });
});

// The words a student never reads (spec: hygiene). The allow-list is the spec's own sentences that
// carry one of them: the third Try asking prompt and the share subline (contract §2), the tour's third
// caption, and the grid moment's start-page and not-OnDemand sentences.
describe('no internal words reach a student', () => {
  const BANNED = /\b(job|jobs|node|partition|heartbeat|shell|portal tab|probe|scheduler|hpcworker|OnDemand)\b|Failed to fetch/i;
  const ALLOWED = ["Write a Slurm job for my script, submit it, and tell me when it's done.", 'It starts when your other grid jobs finish.', 'Big jobs run on the grid, not your laptop.', 'Press LOGIN TO ONDEMAND on the grid page.', "This doesn't look like an OnDemand portal."];
  const strings = (v: unknown, out: string[] = []): string[] => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'line' && k !== 'action' && k !== 'link' && k !== 'since' && k !== 'at' && k !== 'assets') strings(x, out);
    return out;
  };
  it('in any moment or home state', () => {
    const views: PanelView[] = [];
    const runs: Array<Partial<RunFacts>> = [{ phase: 'queued', submittedAt: ago(MIN) }, { phase: 'queued', reason: 'share' }, { phase: 'queued', reason: 'maintenance', submittedAt: ago(20 * MIN) }, { phase: 'got-computer', gotComputerAt: ago(1) }, { phase: 'connecting' }, { phase: 'slow' }, { phase: 'reconnecting' }, { phase: 'needs-claude' }, { phase: 'needs-consent' }, { phase: 'online', link: LINK, readyMinutes: 3 }, { phase: 'renewing' }, { phase: 'stopped' }, { phase: 'error' }];
    for (const r of runs) {
      views.push(panelView(facts({ run: run(r) })));
      views.push(panelView(facts({ ...firstRun, connect: { queued: true }, run: run(r) })));
    }
    for (const g of ['signed-out', 'unreachable', 'not-ood', 'unknown'] as const) views.push(panelView(facts({ ...firstRun, grid: { session: g }, signin: { waiting: true } })));
    for (const failure of ['refused', 'signin-node', 'signin-code', 'signin-timeout', 'setup', 'restricted', 'closed', 'other'] as const) views.push(panelView(facts({ ...firstRun, connect: { failure, pressedAt: NOW - 1 } })));
    views.push(panelView(facts({ ...firstRun, connect: { inFlight: true } })));
    for (const phase of ['offer', 'password', 'checking', 'done', 'paste', 'closed'] as const) views.push(panelView(facts({ loginSetup: { phase, line: 'bash /a/bin/hpcworker login-setup' } })));
    const hits = views.flatMap((v) => strings(v)).filter((s) => BANNED.test(s) && !ALLOWED.includes(s));
    expect([...new Set(hits)]).toEqual([]);
  });
});

// 2026-10-02 evening (docs/V12_STATUS.md, "the direct-way hang"): a run found already in the worker folder
// whose heartbeat stopped (R12, stale) and that this browser has never seen alive, or a run whose job ended, is
// not a worker coming up. The first run's moment showed "Starting · Connecting to Claude…" (or "In line for a
// computer") from it, with no button, and nothing was ever sent. 13.0.0 (the review, M1): only such a found run
// is shown with Connect; a run of the student's own Connect that is merely quiet keeps its phase, because the
// worker writes nothing for up to about three minutes between "starting" and its main loop on a cold node
// (framework/jobs/worker.sbatch.tpl), and R7's "Still connecting" is the answer then.
describe('a run that has gone quiet or ended never holds a waiting moment without a way on', () => {
  const offersConnect = (v: unknown) => /"kind":"connect"/.test(JSON.stringify(v));
  /** a run found already in the folder whose file this browser never saw change (RunFacts.neverSeenAlive) */
  const found = (r: Partial<RunFacts>) => run({ pressed: false, neverSeenAlive: true, ...r });

  it('the first run: a found run never seen alive, stale (its heartbeat over three minutes old), gives Connect, not "Starting"', () => {
    for (const phase of ['connecting', 'slow', 'got-computer', 'reconnecting', 'needs-claude', 'online'] as const) {
      const f = facts({ ...firstRun, run: found({ phase, live: false, stale: true, link: phase === 'online' ? LINK : undefined }) });
      expect(momentOf(f)).toBe('statement');
      expect(offersConnect(journey(f))).toBe(true);
    }
  });

  it("M1, the first run: a run of the student's own Connect that is only quiet keeps its phase, with no Connect", () => {
    // in line, then the worker's cold-node gap: "Still connecting" (R7), never the statement
    const slow = facts({ ...firstRun, connect: { queued: true }, run: run({ phase: 'slow', live: false, stale: true }) });
    expect(momentOf(slow)).toBe('starting');
    expect(J(slow, 'starting').problem?.body).toBe('Still connecting. This is taking longer than usual.');
    expect(offersConnect(journey(slow))).toBe(false);
    for (const phase of ['connecting', 'got-computer', 'reconnecting'] as const) {
      const f = facts({ ...firstRun, run: run({ phase, live: false, stale: true }) });
      expect(momentOf(f)).toBe('starting');
      expect(offersConnect(journey(f))).toBe(false);
    }
    // a found run this browser has seen alive (its file changed between two reads) that went quiet: the same
    expect(momentOf(facts({ ...firstRun, run: run({ phase: 'slow', live: false, stale: true, pressed: false }) }))).toBe('starting');
  });

  it('the first run: a live run is still shown coming up, with no Connect', () => {
    const f = facts({ ...firstRun, run: run({ phase: 'connecting' }) });
    expect(momentOf(f)).toBe('starting');
    expect(J(f, 'starting').sub).toBe('Connecting to Claude…');
    expect(offersConnect(journey(f))).toBe(false);
    // found and not yet seen to change, but its heartbeat fresh: coming up too
    expect(momentOf(facts({ ...firstRun, run: found({ phase: 'connecting' }) }))).toBe('starting');
  });

  it('the first run: "In line for a computer" is not held by an earlier Connect once its run has stopped or ended, or is a found run never seen alive', () => {
    expect(momentOf(facts({ ...firstRun, connect: { queued: true }, run: run({ phase: 'stopped', live: false }) }))).toBe('statement');
    expect(momentOf(facts({ ...firstRun, connect: { queued: true }, run: run({ phase: 'ended', live: false }) }))).toBe('statement');
    expect(momentOf(facts({ ...firstRun, connect: { queued: true }, run: found({ phase: 'connecting', live: false, stale: true }) }))).toBe('statement');
    // still in line while the Connect's job has not been read yet, or is in line
    expect(momentOf(facts({ ...firstRun, connect: { queued: true } }))).toBe('queue');
    expect(momentOf(facts({ ...firstRun, connect: { queued: true }, run: run({ phase: 'queued' }) }))).toBe('queue');
  });

  it('the home: a found run never seen alive shows its last known state, and Connect; not while stopping (m1)', () => {
    const lk: LastKnown = { worker_name: 'worker', state: 'starting', title: 'Wayne State grid', seen_at: ago(30 * MIN) };
    const withKnown = home(facts({ lastKnown: lk, run: found({ phase: 'connecting', live: false, stale: true }) }));
    expect(withKnown.hero.state).toBe('connecting');
    expect(withKnown.primary?.kind).toBe('connect');
    // m1: a Stop under way offers no Connect beside it
    expect(home(facts({ stopping: true, lastKnown: lk, run: found({ phase: 'connecting', live: false, stale: true }) })).primary).toBeUndefined();
    // M1: a run of the student's own that is only quiet keeps its last known state with no primary, as before
    expect(home(facts({ lastKnown: lk, run: run({ phase: 'slow', live: false, stale: true }) })).primary).toBeUndefined();
    // a live one coming up has no primary (the spec: none while asked, in line, starting or renewing)
    expect(home(facts({ run: run({ phase: 'connecting' }) })).primary).toBeUndefined();
  });

  it('m2: a stale run with no last known state is not shown live: hero "Stopped", Connect, and a plain toolbar agree', () => {
    for (const r of [found({ phase: 'connecting', live: false, stale: true }), found({ phase: 'online', live: false, stale: true, link: LINK })]) {
      const f = facts({ run: r });
      const h = home(f);
      expect(h.hero).toMatchObject({ state: 'unknown', orb: 'stopped', word: 'Stopped' });
      expect(h.primary?.kind).toBe('connect');
      expect(h.track).toBeUndefined();
      expect(h.foot.right).toBeUndefined();
      const tb = toolbarView(f);
      expect(tb.badge).toBeUndefined();
      expect(tb).toMatchObject({ title: 'Beethoven', lit: false });
      // and the first run's toolbar agrees with its Connect
      expect(toolbarView(facts({ ...firstRun, run: r })).badge).toBeUndefined();
    }
  });

  it("the review of 13.0.0, 1: a stale run of the student's own, or a found run seen alive, with no last known state keeps its phase's hero, not live, and gets no Connect", () => {
    // the student's own Connect, phase slow, stale, no last known state: "Still connecting", never "Stopped" with Connect
    const own = facts({ run: run({ phase: 'slow', live: false, stale: true }) });
    const h = home(own);
    expect(h.hero).toMatchObject({ state: 'slow', word: 'Still connecting', sub: 'This is taking longer than usual.' });
    expect(h.primary).toBeUndefined();
    expect(offersConnect(h)).toBe(false);
    expect(h.track).toBeUndefined();
    expect(h.foot.right).toBeUndefined();
    expect(toolbarView(own)).toEqual({ title: 'Beethoven', lit: false });
    // not live: nothing is recorded as last known from it
    expect(lastKnownOf(own)).toBeUndefined();
    // the other quiet phases of the student's own run, and a found run this browser has seen alive: the same
    for (const r of [
      run({ phase: 'connecting', live: false, stale: true }),
      run({ phase: 'got-computer', live: false, stale: true }),
      run({ phase: 'reconnecting', live: false, stale: true }),
      run({ phase: 'slow', live: false, stale: true, pressed: false }),
    ]) {
      const v = home(facts({ run: r }));
      expect(v.hero.state).not.toBe('unknown');
      expect(v.hero.word).not.toBe('Stopped');
      expect(offersConnect(v)).toBe(false);
    }
    // a found run never seen alive is the one that reads "Stopped" with Connect (m2)
    expect(home(facts({ run: found({ phase: 'slow', live: false, stale: true }) })).primary?.kind).toBe('connect');
  });

  it('the review of 13.0.0, 2: on the home a stale found run never seen alive gets Connect whatever its last known state, and its "As of" asks for no sign-in', () => {
    const at = ago(30 * MIN);
    const clock = formatClock(at, true);
    const stale = found({ phase: 'online', live: false, stale: true, link: LINK });
    for (const state of ['online', 'needs-you', 'error', 'renewing', 'queued', 'starting', 'stopped'] as const) {
      const lk: LastKnown = { worker_name: 'worker', state, title: 'Wayne State grid', environment_url: LINK, seen_at: at };
      const h = home(facts({ lastKnown: lk, run: stale }));
      expect(h.primary?.kind, state).toBe('connect');
      expect(h.hero.asOf, state).toBe(`As of ${clock}. Your worker isn't answering now.`);
      expect(JSON.stringify(h), state).not.toContain('Sign in to the grid');
    }
    const lkOnline: LastKnown = { worker_name: 'worker', state: 'online', title: 'Wayne State grid', environment_url: LINK, seen_at: at };
    // a Stop under way: the last known state's own primary (online: Open my session), never Connect beside the Stop (m1)
    expect(home(facts({ stopping: true, lastKnown: lkOnline, run: stale })).primary?.kind).toBe('open-session');
    // a Connect in flight: none of its own
    expect(home(facts({ connect: { inFlight: true }, lastKnown: lkOnline, run: stale })).primary?.kind).not.toBe('connect');
    // M1: the student's own run, or a found one seen alive, keeps the last known state's own primary
    expect(home(facts({ lastKnown: lkOnline, run: run({ phase: 'online', live: false, stale: true, link: LINK }) })).primary?.kind).toBe('open-session');
    expect(home(facts({ lastKnown: lkOnline, run: run({ phase: 'online', live: false, stale: true, link: LINK, pressed: false }) })).primary?.kind).toBe('open-session');
    expect(home(facts({ lastKnown: { ...lkOnline, state: 'needs-you' }, run: run({ phase: 'needs-claude', live: false, stale: true }) })).primary?.kind).toBe('sign-in-claude');
    // signed in, so the "As of" of the student's own stale run asks for no sign-in either
    expect(home(facts({ lastKnown: lkOnline, run: run({ phase: 'online', live: false, stale: true, link: LINK }) })).hero.asOf).toBe(`As of ${clock}. Your worker isn't answering now.`);
    // signed out of the grid: no Connect from a heartbeat it cannot see, and the "As of" asks for the sign-in as before
    const out = home(facts({ grid: { session: 'signed-out' }, lastKnown: lkOnline, run: stale }));
    expect(out.primary?.kind).toBe('open-session');
    expect(out.hero.asOf).toBe(`As of ${clock}. Sign in to the grid to see it live.`);
  });
});

// 14.0.0 (framework 14): a worker that resumed an earlier session prints that session's own link, not the environment
// link, and framework 14 writes it as session_url with environment_url "". On 2026-10-03 the panel showed "Starting ·
// Connecting to Claude…" for such a worker, online all along. These views are made from the run record through
// facts.ts runFacts, as the background makes them.
describe("14.0.0: a worker online on a resumed session's own link", () => {
  const SES = 'https://claude.ai/code/session_01N4R9mLRJ5wFbf1oaDe5pyj';
  const record = (status: StatusFile, extra: Partial<RunState> = {}): RunState => ({ stateDir: '/rs/rs_grp_oschome/go2432/hpcworker', run: 'worker', job: '40554211', set_at: ago(10 * MIN), started_by: 'connect', pressed: true, listed_at: ago(10_000), status, ...extra });
  const sessionFile = (o: Partial<StatusFile> = {}): StatusFile => ({
    version: 14,
    state: 'online',
    job: '40554211',
    node: 'asx15',
    submitted_at: ago(10 * MIN),
    got_computer_at: ago(6 * MIN),
    online_at: ago(3 * MIN),
    updated_at: ago(15_000),
    title: 'Wayne State grid',
    resumed: true,
    session_url: SES,
    environment_url: '',
    environment_id: '',
    ...o,
  });

  it('the first run: "You\'re online." with Open my session; framework 13\'s file of the same worker held "Starting · Connecting to Claude…"', () => {
    const rf = runFacts(record(sessionFile()), NOW);
    expect(rf).toMatchObject({ phase: 'online', live: true, link: SES, readyMinutes: 7 });
    const f = facts({ ...firstRun, connect: { queued: true }, run: rf, onlineAnnouncedAt: NOW - 1_000 });
    expect(momentOf(f)).toBe('online');
    const o = J(f, 'online');
    expect(o.hero).toBe("You're online.");
    expect(o.primary).toEqual({ label: 'Open my session', tone: 'teal', action: { kind: 'open-session' } });
    // the same worker as framework 13 wrote it: online, both links "" — the hang of that morning
    const rf13 = runFacts(record(sessionFile({ session_url: '', environment_url: '' })), NOW);
    expect(rf13).toMatchObject({ phase: 'connecting', live: true });
    const f13 = facts({ ...firstRun, connect: { queued: true }, run: rf13 });
    expect(momentOf(f13)).toBe('starting');
    expect(J(f13, 'starting')).toMatchObject({ hero: 'Starting', sub: 'Connecting to Claude…' });
  });

  it('the home: Online, Open my session, Copy link and Phone with the session link, and no New session (that worker serves the one session)', () => {
    const f = facts({ run: runFacts(record(sessionFile()), NOW) });
    const h = home(f);
    expect(h.hero).toMatchObject({ state: 'online', word: 'Online' });
    expect(h.primary).toEqual({ kind: 'open-session', button: { label: 'Open my session', tone: 'teal', action: { kind: 'open-session' } } });
    expect(h.secondary).toEqual({ copyLink: 'Copy link', phone: 'Phone' });
    expect(h.link).toBe(SES);
    expect(toolbarView(f)).toMatchObject({ lit: true });
    // the environment form keeps New session
    const env = home(facts({ run: runFacts(record(sessionFile({ session_url: LINK, environment_url: LINK, environment_id: 'env_01AbCdEf' })), NOW) }));
    expect(env.secondary).toEqual({ newSession: { label: 'New session', tone: 'outline', action: { kind: 'new-session' } }, copyLink: 'Copy link', phone: 'Phone' });
    expect(env.link).toBe(LINK);
  });

  it('the last known state keeps the session link, and the home opens it signed out of the grid', () => {
    const lk = lastKnownOf(facts({ run: runFacts(record(sessionFile()), NOW) }));
    expect(lk).toMatchObject({ state: 'online', environment_url: SES });
    const h = home(facts({ grid: { session: 'signed-out', account: 'st1234' }, lastKnown: { ...lk!, seen_at: ago(30 * MIN) } }));
    expect(h.hero).toMatchObject({ state: 'online', word: 'Online' });
    expect(h.primary?.kind).toBe('open-session');
    expect(h.link).toBe(SES);
    expect(h.secondary).toEqual({ copyLink: 'Copy link', phone: 'Phone' });
  });

  it('New session whenever an environment link was reported, whichever link is the run\'s own; the last known state keeps it', () => {
    const NEW_SESSION = { label: 'New session', tone: 'outline', action: { kind: 'new-session' } };
    // framework 14 wrote both: the session's own link first (Open my session, Copy link), the environment link for New session
    const both = facts({ run: runFacts(record(sessionFile({ environment_url: LINK, environment_id: 'env_01AbCdEf' })), NOW) });
    expect(both.run).toMatchObject({ link: SES, environmentLink: LINK });
    const h = home(both);
    expect(h.link).toBe(SES);
    expect(h.primary?.kind).toBe('open-session');
    expect(h.secondary).toEqual({ newSession: NEW_SESSION, copyLink: 'Copy link', phone: 'Phone' });
    expect(newSessionLinkOf(both)).toBe(LINK);
    // the environment link from connection.json, or from rc.log's registration, while status.json names only the session's
    for (const extra of [{ connection: { job: '40554211', session_url: SES, environment_url: LINK } }, { registration: { session_url: SES, environment_url: LINK } }] as Partial<RunState>[]) {
      const f = facts({ run: runFacts(record(sessionFile(), extra), NOW) });
      expect(home(f).secondary?.newSession, JSON.stringify(extra)).toEqual(NEW_SESSION);
      expect(newSessionLinkOf(f)).toBe(LINK);
    }
    // the session's link alone: no New session, and nowhere for the background to open one
    expect(newSessionLinkOf(facts({ run: runFacts(record(sessionFile()), NOW) }))).toBeUndefined();
    // the last known state keeps the environment link beside the session's, and the home offers New session from it
    const lk = lastKnownOf(both);
    expect(lk).toMatchObject({ state: 'online', environment_url: SES, new_session_url: LINK });
    const off = facts({ grid: { session: 'signed-out', account: 'st1234' }, lastKnown: { ...lk!, seen_at: ago(30 * MIN) } });
    expect(home(off).secondary).toEqual({ newSession: NEW_SESSION, copyLink: 'Copy link', phone: 'Phone' });
    expect(newSessionLinkOf(off)).toBe(LINK);
    // a record 13.0.0 or the first 14.0.0 build stored: its environment link in environment_url still counts; a session link there does not
    expect(newSessionLinkOf({ run: NO_RUN, lastKnown: { worker_name: 'worker', state: 'online', environment_url: LINK, seen_at: ago(MIN) } })).toBe(LINK);
    expect(newSessionLinkOf({ run: NO_RUN, lastKnown: { worker_name: 'worker', state: 'online', environment_url: SES, seen_at: ago(MIN) } })).toBeUndefined();
    // a lookalike stored as new_session_url is no environment link
    expect(newSessionLinkOf({ run: NO_RUN, lastKnown: { worker_name: 'worker', state: 'online', environment_url: SES, new_session_url: 'https://claude.ai.evil.example/code?environment=env_01', seen_at: ago(MIN) } })).toBeUndefined();
  });

  it("More has Copy debug log on the home (the first run's menu is the panel's own, ui/panel.ts journeyMenu)", () => {
    const h = home(facts({ run: runFacts(record(sessionFile()), NOW) }));
    expect(h.header.menu.find((m) => m.label === 'Copy debug log')?.action).toEqual({ kind: 'copy-debug-log' });
  });
});
