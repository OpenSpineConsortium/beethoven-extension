// The framework 10 contract as the extension reads it (docs/V11_CONTRACT.md): the command lines it
// types (connect, worker status --json, worker stop, worker restrict, claude consent --record) and the
// one it lets the student's own terminal run (login-setup), the HPCW-STEP grammar, the connect
// sitting's lines with the keepalive tolerated wherever it lands, progress.log, worker status --json,
// login-setup's outcome, the reason classes, the plan words, the pasted code's shape, the session title
// and the shared formatters. The architect's 71 scratch cases (scratchpad/v11/contract/check.ts), as tests.
import { describe, expect, it } from 'vitest';
import { commands, isLoginSetupLine, KEEPALIVE_LINE, LOGIN_SETUP_DONE, loginSetupOutcome, parseConnectLine, parseProgressLine, parseStatusJson, parseStepLine, planAllowsRemoteControl, planWord, plausibleCode, reasonClass, sessionTitleFor, withoutKeepalive } from '../src/core/contract';
import { defaultPortalFrom } from '../src/core/keys';
import { formatAgo, formatClock, formatTimer, formatUp, WORDS } from '../src/core/model';

const SHARED = '/rs/rs_grp_oschome/shared/beethoven/hpcworker/current';
const ID = '0123456789abcdef0123456789abcdef';

describe('the lines 11.0.0 types', () => {
  it('connect names the shared copy by its full path, with the consent only when given, and --no-chain when the chain is off', () => {
    expect(commands.connect(SHARED, { name: 'worker', site: 'wayne', installId: ID, login: 'auto', permissionMode: 'default', chain: true })).toBe(`exec bash '${SHARED}/bin/hpcworker' connect --name 'worker' --profile 'wayne' --consent '${ID}' --login 'auto' --permission-mode 'default'`);
    expect(commands.connect(SHARED, { name: 'w2', site: 'wayne', login: 'fresh', permissionMode: 'plan', chain: false })).toBe(`exec bash '${SHARED}/bin/hpcworker' connect --name 'w2' --profile 'wayne' --login 'fresh' --permission-mode 'plan' --no-chain`);
  });

  it('refuses a bad name, a dot-dot shared folder, a bad site, id, login or mode before anything is typed', () => {
    const ok = { name: 'worker', site: 'wayne', login: 'auto' as const, permissionMode: 'default' as const, chain: true };
    expect(() => commands.connect(SHARED, { ...ok, name: "w'; rm -rf ~" })).toThrow();
    expect(() => commands.connect('/rs/../etc', ok)).toThrow();
    expect(() => commands.connect(SHARED, { ...ok, site: 'Wayne State' })).toThrow();
    expect(() => commands.connect(SHARED, { ...ok, installId: 'nothex' })).toThrow();
    expect(() => commands.connect(SHARED, { ...ok, login: 'maybe' as never })).toThrow();
    expect(() => commands.connect(SHARED, { ...ok, permissionMode: 'yolo' as never })).toThrow();
  });

  it('types the short verbs through the shared copy', () => {
    expect(commands.statusJson(SHARED, 'worker')).toBe(`bash '${SHARED}/bin/hpcworker' worker status --name 'worker' --json`);
    expect(commands.stop(SHARED, 'worker')).toBe(`bash '${SHARED}/bin/hpcworker' worker stop --name 'worker'`);
    expect(commands.restrict(SHARED, 'worker')).toBe(`bash '${SHARED}/bin/hpcworker' worker restrict --name 'worker'`);
    expect(commands.consentRecord(SHARED, ID)).toBe(`bash '${SHARED}/bin/hpcworker' claude consent --record '${ID}'`);
  });

  it('the login-setup line is the only line a terminal page is ever typed into, and nothing else passes for it', () => {
    const ls = commands.loginSetup(SHARED);
    expect(ls).toBe(`bash ${SHARED}/bin/hpcworker login-setup`);
    expect(isLoginSetupLine(ls)).toBe(true);
    expect(isLoginSetupLine('bash /rs/../bin/hpcworker login-setup')).toBe(false);
    expect(isLoginSetupLine(`${ls}; rm x`)).toBe(false);
    expect(isLoginSetupLine(`${ls} --remove`)).toBe(false);
    expect(isLoginSetupLine(`bash '${SHARED}/bin/hpcworker' login-setup`)).toBe(false);
    expect(isLoginSetupLine(undefined)).toBe(false);
  });
});

describe('the HPCW-STEP grammar', () => {
  it.each([
    ['HPCW-STEP setup ready', { step: 'setup', changed: false }],
    ['HPCW-STEP setup changed', { step: 'setup', changed: true }],
    ['HPCW-STEP setup', { step: 'setup', changed: false }],
    ['HPCW-STEP consent', { step: 'consent' }],
    ['HPCW-STEP queued 40501234 new /rs/rs_grp_oschome/st1234/hpcworker/worker', { step: 'queued', job: '40501234', fresh: true, runDir: '/rs/rs_grp_oschome/st1234/hpcworker/worker' }],
    ['HPCW-STEP queued 40501234 kept', { step: 'queued', job: '40501234', fresh: false }],
    ['HPCW-STEP signin', { step: 'signin' }],
    ['HPCW-STEP signed-in alex@wayne.edu max', { step: 'signed-in', email: 'alex@wayne.edu', plan: 'max' }],
    ['HPCW-STEP signed-in - -', { step: 'signed-in' }],
    ['HPCW-STEP done', { step: 'done' }],
    ['HPCW-STEP failed refused sbatch: error: invalid partition specified', { step: 'failed', code: 'refused', detail: 'sbatch: error: invalid partition specified' }],
    ['HPCW-STEP failed weird thing', { step: 'failed', code: 'other', detail: 'thing' }],
  ])('%s', (line, want) => {
    expect(JSON.parse(JSON.stringify(parseStepLine(line)))).toEqual(want);
  });

  it('is not fooled by a near miss', () => {
    expect(parseStepLine('HPCW-STEPS queued 1 new')).toBeUndefined();
    expect(parseStepLine('echo HPCW-STEP done')).toBeUndefined();
  });
});

describe('the connect sitting', () => {
  it('reads the keepalive alone, and glued to another line', () => {
    expect(parseConnectLine(KEEPALIVE_LINE)).toEqual({ kind: 'keepalive' });
    expect(parseConnectLine('HPCW-LOGIN: on asx3; checking whether you are signed in alreadyHPCW-LOGIN: still waiting')).toEqual({ kind: 'signin-node' });
    expect(withoutKeepalive(`AUTH-URL: https://claude.ai/oauth/authorize?x=1${KEEPALIVE_LINE}`)).toBe('AUTH-URL: https://claude.ai/oauth/authorize?x=1');
  });

  it.each([
    ['HPCW-LOGIN: requesting a compute node', { kind: 'signin-wait' }],
    ['AUTH-URL: https://claude.ai/oauth/authorize?code=true', { kind: 'auth-url', url: 'https://claude.ai/oauth/authorize?code=true' }],
    ['AUTH-URL: https://evil.example/oauth/authorize', { kind: 'refused-url' }],
    ['HPCW-LOGIN: paste the code from that page', { kind: 'code-prompt' }],
    ['HPCW-LOGIN: code received, checking', { kind: 'code-received' }],
    ['HPCW-LOGIN: that code was not accepted; paste it again', { kind: 'code-rejected' }],
    ['SIGNED-IN alex@wayne.edu pro', { kind: 'signed-in', email: 'alex@wayne.edu', plan: 'pro' }],
    ['HPCW-LOGIN-FAILED: no code arrived within 10 minutes; start the sign-in again', { kind: 'login-failed', detail: 'no code arrived within 10 minutes; start the sign-in again' }],
    ['HPCW-LOGIN: a menu appeared; chose the first entry', { kind: 'progress', detail: 'a menu appeared; chose the first entry' }],
  ])('%s', (line, want) => {
    expect(parseConnectLine(line)).toEqual(want);
  });

  it('ignores the shell\'s own text', () => {
    expect(parseConnectLine('[st1234@warrior ~]$ ')).toBeUndefined();
    expect(parseConnectLine('')).toBeUndefined();
  });
});

describe('progress.log, worker status --json and login-setup', () => {
  it('reads the fixed sentences, longest first, and leaves any other line to Details', () => {
    expect(parseProgressLine('2026-10-01T12:44:05Z Asked the grid for a computer')).toEqual({ at: '2026-10-01T12:44:05Z', kind: 'asked' });
    expect(parseProgressLine('2026-10-01T12:51:00Z Online: https://claude.ai/code?environment=env_01abc')).toEqual({ at: '2026-10-01T12:51:00Z', kind: 'online', arg: 'https://claude.ai/code?environment=env_01abc' });
    expect(parseProgressLine('2026-10-01T13:10:00Z Stopped: waiting for your Claude sign-in timed out')).toEqual({ at: '2026-10-01T13:10:00Z', kind: 'signin-abandoned' });
    expect(parseProgressLine('2026-10-01T13:10:00Z Stopped')).toEqual({ at: '2026-10-01T13:10:00Z', kind: 'stopped' });
    expect(parseProgressLine("2026-10-01T13:10:00Z Couldn't start: image is not readable")).toEqual({ at: '2026-10-01T13:10:00Z', kind: 'error', arg: 'image is not readable' });
    expect(parseProgressLine('2026-10-01T13:10:00Z Something else')).toBeUndefined();
  });

  it('finds the one JSON line of worker status --json among the shell\'s noise', () => {
    expect(parseStatusJson('noise\n{"v":1,"run":"worker","job":"1","next_job":"","state_dir":"/s","status":null,"connection":null,"scheduler":null,"line":"x"}\n')?.run).toBe('worker');
    expect(parseStatusJson('{"v":2,"run":"worker"}')).toBeUndefined();
    expect(parseStatusJson('nothing')).toBeUndefined();
  });

  it('login-setup succeeded only on its exact last line', () => {
    expect(loginSetupOutcome(`made a key\n${LOGIN_SETUP_DONE}\n`).done).toBe(true);
    expect(loginSetupOutcome('Stopped: this is not a session that came in through ssh, so there is no address to allow.').done).toBe(false);
  });
});

describe('the small words', () => {
  it('classes the reason, names the plan, refuses only a named plan without Remote Control', () => {
    expect(reasonClass('Priority')).toBe('line');
    expect(reasonClass('')).toBe('line');
    expect(reasonClass('QOSMaxJobsPerUserLimit')).toBe('share');
    expect(reasonClass('AssocGrpCPULimit')).toBe('share');
    expect(reasonClass('ReqNodeNotAvail, Reserved for maintenance')).toBe('maintenance');
    expect(reasonClass('Reservation')).toBe('maintenance');
    expect(planWord('max')).toBe('Max');
    expect(planWord('-')).toBeUndefined();
    expect(planAllowsRemoteControl('free')).toBe(false);
    expect(planAllowsRemoteControl('-')).toBe(true);
    expect(planAllowsRemoteControl('pro')).toBe(true);
  });

  it('takes a pasted code only in the shape of one', () => {
    expect(plausibleCode('  abcDEF123#state-xyz  ')).toBe('abcDEF123#state-xyz');
    expect(plausibleCode('abc def 123456')).toBeUndefined();
    expect(plausibleCode('short')).toBeUndefined();
    expect(plausibleCode('é'.repeat(10))).toBeUndefined();
  });

  it('titles the session, formats the clocks and offers the profile\'s portal', () => {
    expect(sessionTitleFor('Wayne State grid', 'worker')).toBe('Wayne State grid');
    expect(sessionTitleFor('Wayne State grid', 'gpu')).toBe('Wayne State grid · gpu');
    expect(sessionTitleFor(undefined, 'worker')).toBe('Grid worker');
    expect(formatTimer(161_000)).toBe('2:41');
    expect(formatTimer(3_761_000)).toBe('1:02:41');
    expect(formatUp((2 * 60 + 14) * 60_000)).toBe('2 h 14 min');
    expect(formatAgo(20_000)).toBe('20 s');
    expect(formatClock(new Date(2026, 9, 1, 16, 50), true)).toBe('4:50 PM');
    expect(formatClock(new Date(2026, 9, 1, 9, 12), false)).toBe('9:12');
    expect(formatClock(new Date(2026, 9, 1, 0, 5), true)).toBe('12:05 AM');
    expect(WORDS.claude.signedIn('alex@wayne.edu', 'Max')).toBe('Signed in as alex@wayne.edu · Max');
    expect(defaultPortalFrom({ ood_base_url: 'https://ondemand.grid.wayne.edu', site: 'wayne' })).toEqual({ origin: 'https://ondemand.grid.wayne.edu', hostname: 'ondemand.grid.wayne.edu', site: 'wayne' });
    expect(defaultPortalFrom({ ood_base_url: 'http://x.edu' })).toBeUndefined();
  });
});
