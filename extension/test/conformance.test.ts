// The extension against hpcworker's export `contract` as this repository pins it (framework/contract/,
// taken by interface/pull.sh; interface/README.md): the interface standard's rule 4. Every constant
// contract.ts types by hand from the contract is held equal to the pinned file (the line patterns, the
// failure codes and exit statuses, the values a command line carries, the progress sentences, the
// sign-in verdict); every command the extension types is one cli.json lists, or is named below with the
// reason it is not; and every vector hpcworker's real writer produced goes through the reader the
// extension really uses, with what it must read. The pinned grammar is also run as an independent
// reader over each vector line and some near misses of it, and the extension must read each the same.
// Only tests read framework/contract/; nothing of it enters the package (test/hygiene.test.ts).
// 16.0.0 removed the direct way, the one way that typed the gate's verbs and read its answers: the gate
// and key families and the gate vectors are read by no code any more, and the last test names them so.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  clean,
  commands,
  consentSourceWords,
  DEFAULT_WORKER_NAME,
  INSTALL_RE,
  isClaudeAuthUrl,
  isClaudeCodeLink,
  isSubscriptionSignIn,
  KEEPALIVE_LINE,
  LOGIN_RE,
  LOGIN_SETUP_DONE,
  LOGIN_SETUP_NOTHING,
  LOGIN_SETUP_REMOVED,
  LOGINS,
  MODES,
  parseConnectLine,
  parseProgressLine,
  parseStatusJson,
  parseStepLine,
  PROGRESS,
  PROGRESS_LINE_RE,
  SITE_RE,
  STEP_EXIT,
  STEP_RE,
  WORKER_NAME_RE,
  type ConnectEvent,
  type ConnectionFile,
  type ProgressKind,
  type StatusFile,
  type StatusJson,
  type StopReason,
  type WorkerState,
} from '../src/core/contract';
import { applyConnection, applyStatus, claudeLinkOf, runFacts, type RunState } from '../src/core/facts';
import { ConnectWatcher } from '../src/core/login';
import { INSTALL_ID_RE } from '../src/licensing/access';

const CONTRACT = fileURLToPath(new URL('../../framework/contract/', import.meta.url));
const json = <T>(rel: string): T => JSON.parse(readFileSync(path.join(CONTRACT, rel), 'utf8')) as T;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** an answer as the readers see it: control sequences out, one trimmed line per line (contract.ts's own reading until 16.0.0) */
const contractLines = (output: string): string[] => clean(output).split('\n').map((l) => l.trim()).filter(Boolean);

interface Line {
  id: string;
  pattern: string;
  exit?: number;
}
interface Family {
  lines?: Line[];
  failure_codes?: Record<string, number>;
  unknown_code_reads_as?: string;
  keepalive?: string;
  line_pattern?: string;
  sentences?: Array<{ id: string; text: string; argument?: string }>;
}
interface Schema {
  required?: string[];
  properties: Record<string, { enum?: string[]; properties?: Record<string, unknown>; required?: string[] }>;
  $defs?: Record<string, { pattern?: string; required?: string[]; properties?: Record<string, unknown> }>;
}
interface Vector {
  vector: string;
  kind: 'command' | 'file';
  command?: string;
  exit?: number;
  stdout?: string[];
  stderr?: string[];
  file?: string;
  json?: Record<string, unknown>;
  lines?: string[];
}

const LINES = json<{ families: Record<string, Family> }>('lines.json').families;
const CLI = json<{
  values: Record<string, { pattern?: string; enum?: string[]; default?: string }>;
  commands: Array<{ id: string; line: string }>;
  gate: { verbs: Array<{ id: string; line: string }>; limits: { exit: number } };
}>('cli.json');
const RULES = json<{ subscription_signin: { read_keys: string[] }; signin_cases: Array<{ input: string; verdict: 'subscription' | 'other' | 'none' }> }>('rules.json');
const STATUS = json<Schema>('status.schema.json');
const CONNECTION = json<Schema>('connection.schema.json');
const WORKER_STATUS = json<Schema>('worker-status.schema.json');
const VECTORS: Vector[] = readdirSync(path.join(CONTRACT, 'vectors'))
  .filter((n) => n.endsWith('.json'))
  .sort()
  .map((n) => json<Vector>(`vectors/${n}`));
const vector = (name: string): Vector => {
  const v = VECTORS.find((x) => x.vector === name);
  if (!v) throw new Error(`framework/contract/vectors has no ${name}`);
  return v;
};
const family = (id: string): Family => {
  const f = LINES[id];
  if (!f) throw new Error(`lines.json has no family ${id}`);
  return f;
};
const linesOf = (id: string): Line[] => family(id).lines ?? [];
const sourceOf = (rx: Record<string, RegExp>) => Object.fromEntries(Object.entries(rx).map(([k, r]) => [k, r.source]));
const SHARED = '/rs/rs_grp_oschome/shared/beethoven/hpcworker/current';
const ID = '0123456789abcdef0123456789abcdef';

describe('the line patterns contract.ts types are lines.json\'s, character for character', () => {
  it('reads the families it uses, and says which ones it does not', () => {
    // version: the extension reads the shared copy's VERSION file, and never runs `hpcworker version`;
    // gate and key: the direct way's answers over ssh, typed and read by no code since 16.0.0
    expect(Object.keys(LINES).sort()).toEqual(['gate', 'key', 'login', 'login-setup', 'progress', 'step', 'version']);
  });

  it('step: every line, whole', () => {
    expect(sourceOf(STEP_RE)).toEqual(Object.fromEntries(linesOf('step').map((l) => [l.id, l.pattern])));
  });

  it('login: every line, whole, and the keepalive', () => {
    expect(sourceOf(LOGIN_RE)).toEqual(Object.fromEntries(linesOf('login').map((l) => [l.id, l.pattern])));
    expect(KEEPALIVE_LINE).toBe(family('login').keepalive);
  });

  it('progress: the line pattern and the fixed sentences, those with an argument taking one', () => {
    const p = family('progress');
    expect(PROGRESS_LINE_RE.source).toBe(p.line_pattern);
    expect(PROGRESS).toEqual(Object.fromEntries((p.sentences ?? []).map((s) => [s.id, s.text])));
    for (const s of p.sentences ?? []) {
      expect(parseProgressLine(`2026-10-01T12:00:00Z ${s.text}`), s.id).toEqual({ at: '2026-10-01T12:00:00Z', kind: s.id });
      const withArg = parseProgressLine(`2026-10-01T12:00:00Z ${s.text}: more`);
      if (s.argument) expect(withArg, s.id).toEqual({ at: '2026-10-01T12:00:00Z', kind: s.id, arg: 'more' });
      else expect(withArg?.kind, `${s.id} takes no argument`).not.toBe(s.id);
    }
  });

  it('login-setup: the three last lines, exactly', () => {
    const pinned = Object.fromEntries(linesOf('login-setup').map((l) => [l.id, l.pattern]));
    expect({ done: `^${esc(LOGIN_SETUP_DONE)}$`, removed: `^${esc(LOGIN_SETUP_REMOVED)}$`, nothing: `^${esc(LOGIN_SETUP_NOTHING)}$` }).toEqual(pinned);
  });
});

describe('failure codes and exit statuses', () => {
  const step = family('step');
  it('connect exits 0 after done, else with its failure code\'s status', () => {
    const { done, ...codes } = STEP_EXIT;
    expect(done).toBe(0);
    expect(codes).toEqual(step.failure_codes);
  });

  it('reads every failure code as itself, and an unknown one as other', () => {
    for (const code of Object.keys(step.failure_codes ?? {})) expect(parseStepLine(`HPCW-STEP failed ${code} a sentence`), code).toEqual({ step: 'failed', code, detail: 'a sentence' });
    expect(step.unknown_code_reads_as).toBe('other');
    expect(parseStepLine('HPCW-STEP failed not-a-code-yet a sentence')).toEqual({ step: 'failed', code: 'other', detail: 'a sentence' });
  });
});

/** a cli.json line as a regular expression: <value> by its pattern or enum (or `fill`), [..] optional, the rest literal */
function templateRe(line: string, fill: Record<string, string>): RegExp {
  const value = (name: string): string => {
    if (name in fill) return esc(fill[name]!);
    const v = CLI.values[name];
    if (v?.pattern) return `(?:${v.pattern.replace(/^\^/, '').replace(/\$$/, '')})`;
    if (v?.enum) return `(?:${v.enum.map(esc).join('|')})`;
    if (name.includes('|')) return `(?:${name.split('|').map((n) => (n in fill || n in CLI.values ? value(n) : esc(n))).join('|')})`;
    throw new Error(`cli.json names no value ${name}`);
  };
  let out = '';
  // "a [b] c" reads "a c" without b: the space before an optional part belongs to it
  for (const tok of line.replace(/ \[/g, '[ ').match(/<[a-z_|-]+>|\[|\]|[^<[\]]+/g) ?? []) {
    if (tok === '[') out += '(?:';
    else if (tok === ']') out += ')?';
    else if (tok.startsWith('<')) out += value(tok.slice(1, -1));
    else out += esc(tok);
  }
  return new RegExp(`^${out}$`);
}

const cliLine = (id: string) => CLI.commands.find((c) => c.id === id)?.line ?? '';
const TOOL = { tool: `${SHARED}/bin/hpcworker`, shared_install: SHARED };

/**
 * Each builder of `commands` and the cli.json command it types. The others type a line cli.json does not
 * list, each named with its reason; a builder on neither list fails, and so does a stale entry.
 */
const TYPED: Record<string, string> = { connect: 'connect', statusJson: 'worker-status', stop: 'worker-stop', restrict: 'worker-restrict', consentRecord: 'consent-record', installShared: 'install-shared', loginSetup: 'login-setup' };
const NOT_IN_CLI: Record<string, string> = {
  discover: "typed by checks.ts (the login node's discovery) through ~/.hpcworker/bin: kept by framework 10 for 10.0.0 (framework/contract-text/V11_CONTRACT.md section 19), not in cli.json",
  probe: 'typed by background.ts (the compute-node check): the same section 19, not in cli.json',
  claudeLoginPlain: "typed by portal.content.ts's login port (the plain sitting of framework 9, read by LoginWatcher): the same section 19, not in cli.json",
  workerStart: 'typed by no code under src/ (the mock portal\'s tests only): section 19',
  workerStop: 'typed by no code under src/ (the mock portal\'s tests only): section 19',
  diag: 'typed by no code under src/ (audit.test.ts only)',
  claudeLogin: 'typed by no code under src/ (audit.test.ts only): the sitting a student types in the portal\'s own Shell tab',
  claudeConsent: 'typed by no code under src/ (audit.test.ts only): the alias that explains',
};

describe('the commands it types, against cli.json', () => {
  it('holds the values cli.json checks, pattern for pattern', () => {
    expect(WORKER_NAME_RE.source).toBe(CLI.values.name?.pattern);
    expect(DEFAULT_WORKER_NAME).toBe(CLI.values.name?.default);
    expect(SITE_RE.source).toBe(CLI.values.site?.pattern);
    expect(INSTALL_RE.source).toBe(CLI.values.install_id?.pattern);
    expect(INSTALL_ID_RE.source).toBe(CLI.values.install_id?.pattern);
    expect([...LOGINS]).toEqual(CLI.values.login?.enum);
    expect([...MODES]).toEqual(CLI.values.permission_mode?.enum);
    // the build refuses a profile whose name the commands could not carry (scripts/sync-profiles.mjs)
    const sync = readFileSync(fileURLToPath(new URL('../scripts/sync-profiles.mjs', import.meta.url)), 'utf8');
    expect(/if \(!\/(.+?)\/\.test\(site\)\)/.exec(sync)?.[1]).toBe(CLI.values.site?.pattern);
  });

  it('every builder is a cli.json command, or is named with its reason', () => {
    // browserKeyAddLine, the enrolment line framework 11 runs in the student's own signed-in session: lines.json's
    // key family reads its answer and framework/contract-text/V12_CONTRACT.md names it, but cli.json lists no
    // browser-key command (this fails once it does, so the line is then checked like the others)
    expect(CLI.commands.filter((c) => c.line.includes('browser-key'))).toEqual([]);
    expect(Object.keys(commands).sort()).toEqual([...Object.keys(TYPED), ...Object.keys(NOT_IN_CLI)].sort());
    for (const cmd of Object.values(TYPED)) expect(cliLine(cmd), cmd).not.toBe('');
  });

  it('types each cli.json line as cli.json writes it, for every value it may carry', () => {
    const connect = templateRe(cliLine('connect'), TOOL);
    for (const name of ['worker', 'w_2', 'A-b', '-x', 'x'.repeat(32)])
      for (const installId of [undefined, ID])
        for (const login of LOGINS)
          for (const permissionMode of MODES)
            for (const chain of [true, false]) {
              const line = commands.connect(SHARED, { name, site: 'wayne', login, permissionMode, chain, ...(installId ? { installId } : {}) });
              expect(connect.test(line), line).toBe(true);
            }
    expect(templateRe(cliLine('worker-status'), TOOL).test(commands.statusJson(SHARED, 'worker'))).toBe(true);
    expect(templateRe(cliLine('worker-stop'), TOOL).test(commands.stop(SHARED, 'w_2'))).toBe(true);
    expect(templateRe(cliLine('worker-restrict'), TOOL).test(commands.restrict(SHARED, 'worker'))).toBe(true);
    expect(templateRe(cliLine('consent-record'), TOOL).test(commands.consentRecord(SHARED, ID))).toBe(true);
    expect(templateRe(cliLine('install-shared'), TOOL).test(commands.installShared(SHARED, 'wayne'))).toBe(true);
    expect(templateRe(cliLine('login-setup'), TOOL).test(commands.loginSetup(SHARED))).toBe(true);
  });

  it('refuses before anything is typed a value cli.json would refuse', () => {
    const ok = { name: 'worker', site: 'wayne', login: 'auto' as const, permissionMode: 'default' as const, chain: true };
    for (const name of ['', 'a b', "w'x", 'x'.repeat(33)]) {
      expect(() => commands.connect(SHARED, { ...ok, name }), name).toThrow();
      expect(() => commands.statusJson(SHARED, name), name).toThrow();
      expect(() => commands.stop(SHARED, name), name).toThrow();
      expect(() => commands.restrict(SHARED, name), name).toThrow();
    }
    // a site name that begins with "-": cli.json refuses it, and until 2026-10-07 connect and the install typed it
    for (const site of ['-wayne', 'Wayne', '', 'a'.repeat(33)]) {
      expect(() => commands.connect(SHARED, { ...ok, site }), site).toThrow();
      expect(() => commands.installShared(SHARED, site), site).toThrow();
    }
    expect(() => commands.installShared('relative/x', 'wayne')).toThrow();
    for (const bad of ['xyz', ID.toUpperCase(), `${ID}0`]) expect(() => commands.consentRecord(SHARED, bad), bad).toThrow();
  });
});

describe('the sign-in verdict, against rules.json', () => {
  it('reads the four keys rules.json names, and only those', () => {
    const read = { loggedIn: true, authMethod: true, apiProvider: true, apiKeySource: true } satisfies Record<keyof NonNullable<Parameters<typeof isSubscriptionSignIn>[0]>, true>;
    expect(Object.keys(read).sort()).toEqual([...RULES.subscription_signin.read_keys].sort());
  });

  it.each(RULES.signin_cases.map((c) => [c.input || '(nothing)', c] as const))('%s', (_label, c) => {
    let status: Parameters<typeof isSubscriptionSignIn>[0];
    try {
      status = JSON.parse(c.input) as typeof status;
    } catch {
      status = undefined;
    }
    // other counts as no sign-in everywhere: only a subscription is signed in
    expect(isSubscriptionSignIn(status)).toBe(c.verdict === 'subscription');
  });
});

describe('the files and the status line it reads, against the schemas', () => {
  const props = (s: Schema) => Object.keys(s.properties).sort();
  const within = (keys: string[], allowed: string[]) => keys.filter((k) => !allowed.includes(k));

  it('status.json: every field StatusFile reads is the schema\'s, and its states and reasons are the schema\'s', () => {
    const fields = {
      version: true, site: true, run: true, job: true, node: true, pid: true, state: true, message: true, needs: true, hint: true, started_at: true, updated_at: true,
      session_name: true, requested_name: true, environment_url: true, environment_id: true, session_url: true, claude_login: true, consent: true, consent_source: true,
      workspace_trusted: true, rc_alive: true, resumed: true, tmux: true, restarts: true, chain: true, next_job: true, chain_note: true, workspace: true, rc_log: true,
      token_path: true, scheduler_in_worker: true, scheduler_note: true, submitted_at: true, got_computer_at: true, online_at: true, ends_at: true, renewal: true, title: true,
      stop_reason: true, scheduler_state: true, reason: true, expected_start: true, checked_at: true,
    } satisfies Record<keyof StatusFile, true>;
    expect(within(Object.keys(fields), props(STATUS))).toEqual([]);
    const login = { loggedIn: true, email: true, subscriptionType: true, checked_at: true } satisfies Record<keyof NonNullable<StatusFile['claude_login']>, true>;
    expect(within(Object.keys(login), Object.keys(STATUS.properties.claude_login?.properties ?? {}))).toEqual([]);
    // 'unknown' is the extension's own word for a file it could not read, never one the framework writes
    const states = { queued: true, starting: true, need_login: true, need_consent: true, running: true, online: true, stopped: true, preempted: true, error: true } satisfies Record<Exclude<WorkerState, 'unknown'>, true>;
    expect(Object.keys(states).sort()).toEqual([...(STATUS.properties.state?.enum ?? [])].sort());
    const reasons = { request: true, login_abandoned: true, successor_gone: true } satisfies Record<StopReason, true>;
    expect(Object.keys(reasons).sort()).toEqual([...(STATUS.properties.stop_reason?.enum ?? [])].sort());
    // each answer's source in the student's words, never the generic one an unknown source gets
    for (const src of STATUS.properties.consent_source?.enum ?? []) expect(consentSourceWords(src), src).not.toBe('recorded');
  });

  it('connection.json: every field ConnectionFile reads is the schema\'s', () => {
    const fields = {
      session_name: true, requested_name: true, environment_url: true, environment_id: true, session_url: true, node: true, job: true, pid: true, started_at: true,
      token_path: true, workspace: true, rc_log: true, permission_mode: true, capacity: true, resumed: true, next_job: true, title: true, online_at: true,
    } satisfies Record<keyof ConnectionFile, true>;
    expect(within(Object.keys(fields), props(CONNECTION))).toEqual([]);
    expect([...MODES]).toEqual(CONNECTION.properties.permission_mode?.enum);
  });

  it('worker status --json: StatusJson is the schema\'s line, field for field', () => {
    const fields = { v: true, run: true, job: true, next_job: true, state_dir: true, status: true, connection: true, scheduler: true, line: true } satisfies Record<keyof StatusJson, true>;
    expect(Object.keys(fields).sort()).toEqual([...(WORKER_STATUS.$defs?.fields?.required ?? [])].sort());
    const scheduler = { state: true, reason: true, expected_start: true, node: true, checked_at: true } satisfies Record<keyof NonNullable<StatusJson['scheduler']>, true>;
    expect(Object.keys(scheduler).sort()).toEqual([...(WORKER_STATUS.$defs?.scheduler?.required ?? [])].sort());
  });

  it('opens exactly the links the schema allows', () => {
    const link = new RegExp(STATUS.$defs?.claude_link_or_empty?.pattern ?? '$^');
    const samples = [
      'https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt',
      'https://claude.com/code?environment=env_01XzAN32jsbL8W1PAFSvitBt',
      'https://claude.ai/code/session_01N4abc',
      'https://claude.com/code/session_01N4abc',
      'http://claude.ai/code?environment=env_01',
      'https://claude.ai/code?environment=env_',
      'https://claude.ai/code?environment=env_01 ',
      'https://claude.ai/code?environment=env_01&x=1',
      'https://claude.ai.example/code?environment=env_01',
      'https://claude.ai/code/session_01/../x',
      'https://claude.ai/code',
    ];
    for (const s of samples) expect(isClaudeCodeLink(s), s).toBe(link.test(s));
    expect(isClaudeCodeLink('')).toBe(false);
  });
});

// ---- every vector, through the extension's own readers ---------------------------------------------

/** the pinned grammar as its own reader: what lines.json says one connect line is (the step and login families), or undefined for text */
function pinnedConnectKind(raw: string): string | undefined {
  const keepalive = family('login').keepalive ?? '';
  let l = contractLines(raw)[0] ?? '';
  if (!l) return undefined;
  l = l.split(keepalive).join('').trim();
  if (!l) return 'keepalive';
  for (const s of linesOf('step')) {
    const m = new RegExp(s.pattern).exec(l);
    if (!m) continue;
    if (s.id !== 'failed') return `step:${s.id}`;
    return `step:failed:${Object.prototype.hasOwnProperty.call(family('step').failure_codes ?? {}, m[1]!) ? m[1] : family('step').unknown_code_reads_as}`;
  }
  const kinds: Record<string, string> = { requesting: 'signin-wait', 'on-node': 'signin-node', starting: 'progress', menu: 'progress', 'code-prompt': 'code-prompt', 'code-received': 'code-received', 'code-refused': 'code-rejected', keepalive: 'keepalive', 'signed-in': 'signed-in', failed: 'login-failed', other: 'progress' };
  for (const s of linesOf('login')) {
    const m = new RegExp(s.pattern).exec(l);
    if (!m) continue;
    if (s.id === 'auth-url') return isClaudeAuthUrl(m[1]) ? 'auth-url' : 'refused-url';
    return kinds[s.id];
  }
  return undefined;
}

/** the extension's reading of the same line, in the same words */
function connectKind(e: ConnectEvent | undefined): string | undefined {
  if (!e) return undefined;
  if (e.kind !== 'step') return e.kind;
  return e.step.step === 'failed' ? `step:failed:${e.step.code}` : `step:${e.step.step}`;
}

/** a line and some near misses of it: words after it, a prompt before it, a full stop at its end */
const nearMisses = (l: string) => [l, `${l} x`, `> ${l}`, `${l}.`, `${l}${KEEPALIVE_LINE}`];

const CONNECT_VECTORS = VECTORS.filter((v) => v.kind === 'command' && v.vector.startsWith('connect-'));

describe('the connect vectors, through ConnectWatcher', () => {
  it('has them', () => {
    expect(CONNECT_VECTORS.length).toBeGreaterThan(10);
  });

  it.each(CONNECT_VECTORS.map((v) => [v.vector, v] as const))('%s', (_name, v) => {
    const lines = v.stdout ?? [];
    // what the grammar says, up to and including the first done or failed step (nothing after it is read)
    const want: string[] = [];
    for (const l of lines) {
      const k = pinnedConnectKind(l);
      if (k && k !== 'keepalive') want.push(k);
      if (k === 'step:done' || k?.startsWith('step:failed:')) break;
    }
    // as the portal's terminal brings it (CR LF) and as plain lines
    for (const text of [lines.map((l) => `${l}\r\n`).join(''), `${lines.join('\n')}\n`]) {
      const w = new ConnectWatcher();
      w.feed(text);
      expect(w.events.map(connectKind)).toEqual(want);
      const last = w.events.filter((e) => e.kind === 'step').pop();
      expect(last?.kind === 'step' && (last.step.step === 'done' || last.step.step === 'failed'), 'the sitting ends with done or failed').toBe(true);
      if (last?.kind !== 'step') continue;
      // the exit status lines.json gives the last step line
      expect(last.step.step === 'failed' ? STEP_EXIT[last.step.code] : STEP_EXIT.done).toBe(v.exit);
      for (const e of w.events) {
        if (e.kind === 'auth-url') expect(isClaudeAuthUrl(e.url)).toBe(true);
        if (e.kind === 'step' && e.step.step === 'queued') expect(e.step.job).toMatch(/^[0-9]+$/);
      }
    }
  });

  it('reads each vector line and its near misses as the grammar does', () => {
    const all = [...new Set(CONNECT_VECTORS.flatMap((v) => v.stdout ?? []))];
    for (const line of all.flatMap(nearMisses)) expect(connectKind(parseConnectLine(line)), line).toBe(pinnedConnectKind(line));
  });

  it('takes what the steps carry', () => {
    const steps = (name: string) => (vector(name).stdout ?? []).map((l) => parseStepLine(l)).filter(Boolean);
    expect(steps('connect-first-run')).toEqual([
      { step: 'setup', changed: true },
      { step: 'consent' },
      { step: 'queued', job: '40501234', fresh: true, runDir: '/scratch/home/state/worker' },
      { step: 'signin' },
      { step: 'signed-in', email: 'st1234@wayne.edu', plan: 'max' },
      { step: 'done' },
    ]);
    expect(steps('connect-kept')).toContainEqual({ step: 'queued', job: '40500019', fresh: false, runDir: '/scratch/home/state/worker' });
    expect(steps('connect-failed-refused').pop()).toEqual({ step: 'failed', code: 'refused', detail: 'sbatch: error: Batch job submission failed: Invalid qos specification' });
  });
});

describe('the status line, the files and the gate\'s answers, through the readers the extension uses', () => {
  const NOW = Date.parse('2026-10-01T12:00:30Z');
  const fresh = (job: string): RunState => ({ stateDir: '/scratch/state', run: 'worker', job });
  const file = <T>(name: string): T => vector(name).json as T;

  it('status.json, as the portal\'s Files app brings it', () => {
    const cases: Array<[string, string, Partial<ReturnType<typeof runFacts>>]> = [
      ['status-queued', '40501234', { phase: 'queued', live: true }],
      ['status-online', '4242', { phase: 'online', live: true, link: 'https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt', claude: { loggedIn: true, plan: 'max', email: 'st1234@wayne.edu' } }],
      ['status-stopped', '4242', { phase: 'stopped', live: false, stopReason: 'request' }],
    ];
    for (const [name, job, want] of cases) {
      const viaFiles = applyStatus(fresh(job), file<StatusFile>(name), NOW / 1000);
      expect(viaFiles.taken, name).toBe(true);
      expect(runFacts(viaFiles.run, NOW), name).toMatchObject(want);
    }
    // R1: the file of another job says nothing about this run
    expect(applyStatus(fresh('1'), file<StatusFile>('status-online')).taken).toBe(false);
  });

  it('connection.json: the link, for this job only', () => {
    const conn = file<ConnectionFile>('connection-online');
    const r = applyConnection(fresh('4242'), conn);
    expect(r.taken).toBe(true);
    expect(claudeLinkOf(r.run)).toBe('https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt');
    const online = applyStatus(r.run, file<StatusFile>('status-online')).run;
    expect(runFacts(online, NOW)).toMatchObject({ phase: 'online', link: 'https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt', onlineAt: '2026-10-01T12:00:00.000Z' });
    expect(applyConnection(fresh('1'), conn).taken).toBe(false);
  });

  it('worker status --json, from the portal\'s shell', () => {
    for (const name of ['worker-status-queued']) {
      const v = vector(name);
      const j = parseStatusJson(`${(v.stdout ?? []).join('\n')}\n${(v.stderr ?? []).join('\n')}`);
      expect(j, name).toMatchObject({ v: 1, run: 'worker', job: '40501234', next_job: '', status: { state: 'queued' }, connection: null, scheduler: { state: 'PENDING', reason: 'Priority' } });
      const run = { ...applyStatus(fresh('40501234'), j!.status!).run, scheduler: j!.scheduler };
      expect(runFacts(run, NOW), name).toMatchObject({ phase: 'queued', live: true, reason: 'line' });
    }
    const missing = vector('worker-status-missing');
    expect(parseStatusJson(`${(missing.stdout ?? []).join('\n')}\n${(missing.stderr ?? []).join('\n')}`)).toBeUndefined();
  });

  it('progress.log, as a file', () => {
    const kinds = (lines: string[]) => lines.map((l) => parseProgressLine(l)).map((p) => (p ? (p.arg ? `${p.kind}: ${p.arg}` : p.kind) : undefined));
    expect(kinds(vector('progress-queued').lines ?? [])).toEqual(['asked']);
    expect(kinds(vector('progress-stopped').lines ?? [])).toEqual(['asked', 'got-computer', 'connecting', 'online: https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt', 'stopped']);
    // each line as the grammar reads it: the longest sentence that matches
    const pinned = (l: string): string | undefined => {
      const m = new RegExp(family('progress').line_pattern ?? '$^').exec(l);
      if (!m) return undefined;
      const s = [...(family('progress').sentences ?? [])].sort((a, b) => b.text.length - a.text.length).find((x) => m[2] === x.text || (x.argument && m[2]!.startsWith(`${x.text}: `)));
      return s?.id;
    };
    for (const l of [...(vector('progress-stopped').lines ?? [])].flatMap(nearMisses)) expect(parseProgressLine(l)?.kind as ProgressKind | undefined, l).toBe(pinned(l));
  });
});

describe('every vector is read here, or named with the reason it is not', () => {
  const READ = new Set([
    ...CONNECT_VECTORS.map((v) => v.vector),
    'connection-online', 'progress-queued', 'progress-stopped', 'status-online', 'status-queued', 'status-stopped', 'worker-status-missing', 'worker-status-queued',
  ]);
  const GATE = 'the gate\'s answer over ssh, read only on the direct way, which 16.0.0 removed: no code types a gate line or reads one';
  const NOT_READ: Record<string, string> = {
    'version-shared': 'the extension never runs `hpcworker version`: it reads the shared copy\'s VERSION file',
    'gate-connect': GATE,
    'gate-read-missing': GATE,
    'gate-read-progress': GATE,
    'gate-refused': GATE,
    'gate-status': GATE,
    'gate-version': GATE,
  };
  it('has no vector it neither reads nor names', () => {
    expect(VECTORS.map((v) => v.vector).filter((n) => !READ.has(n) && !(n in NOT_READ))).toEqual([]);
    expect([...READ, ...Object.keys(NOT_READ)].filter((n) => !VECTORS.some((v) => v.vector === n))).toEqual([]);
  });
});
