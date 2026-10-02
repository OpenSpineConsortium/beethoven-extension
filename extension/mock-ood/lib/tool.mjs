#!/usr/bin/env node
// The framework 10 verbs of the mock's stand-in tool (bin/hpcworker hands them here), speaking
// docs/V11_CONTRACT.md to the character where the extension parses: the same lines, the same files,
// the same field names. It submits nothing to a real scheduler; the job table (lib/jobs.mjs) and the
// job simulator (lib/jobsim.mjs, driven by the mock portal's clock) play the cluster.
//
//   connect [--name N] [--profile SITE] [--consent ID] [--login auto|always|fresh|never]
//           [--permission-mode default|acceptEdits|plan] [--no-chain]          (contract section 5)
//   start  --name N [--permission-mode M] [--no-chain]   worker start, framework 10 (the queued file)
//   status --name N [--json] [--details]                 worker status (section 6)
//   stop   --name N                                      worker stop (section 7.1)
//   restrict --name N                                    worker restrict (section 7.2)
//   consent-record ID                                    claude consent --record (section 7.3)
//   login-setup [--remove]                               the one-time key step (section 8; AM2)
//
// Knobs (environment; the server passes its options this way): MOCK_QUEUE_S (seconds in line, default
// 0), MOCK_QUEUE_REASON (Priority), MOCK_QUEUE_EXPECT (estimate | none), MOCK_START_S (computer to
// online, default 4), MOCK_SIGNIN_WAIT_S (the sign-in computer's wait, default 1), MOCK_ALLOC_WAIT_S
// (its budget, 600), MOCK_CODE_WAIT_S (the code budget; default min(600, 840 - elapsed), at least
// 120), MOCK_KEEPALIVE_S (20), MOCK_PLAN (max), MOCK_EMAIL (<user>@wayne.edu), MOCK_LOGIN_FAIL=1 (the
// first code ends the sitting: signin-code), MOCK_CODE_REJECT=n (the first n codes are "not accepted;
// paste it again"), MOCK_CONSENT=false, MOCK_SBATCH_FAIL=1, MOCK_RENEW_S, MOCK_RENEW_QUEUE_S (10),
// MOCK_ABANDON_S (the profile's login_abandon_s, else 1200), MOCK_RECONNECT_AFTER_S, MOCK_CLIENT_ID.
//
// The pasted code is read from standard input and never printed, logged or kept.
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, promises as fs, readFileSync, statSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {
  accountProfile,
  claudeState,
  consentFile,
  env,
  homeReal,
  homeShown,
  hwReal,
  iso,
  num,
  progress,
  PROGRESS,
  readJson,
  readStatus,
  real,
  requestedName,
  sessionName,
  envId,
  envUrl,
  setClaudeState,
  shown,
  stateDirShown,
  STATE_WORDS,
  titleFor,
  trimProgress,
  user,
  writeStatus,
} from './common.mjs';
import { mutateJobs, nextJobNumber, noteSchedulerCall, readJobs, slurmTime, writeWhole } from './jobs.mjs';

const LAUNCHER_TAG = '# hpcworker launcher for a shared copy (managed: "hpcworker install" rewrites this file)';
const KEEPALIVE = 'HPCW-LOGIN: still waiting';
const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastOut = Date.now();
function say(line) {
  process.stdout.write(`${line}\n`);
  lastOut = Date.now();
}
function err(line) {
  process.stderr.write(`${line}\n`);
}
function done(code) {
  // let stdout drain before leaving (a pipe on Windows)
  process.stdout.write('', () => process.exit(code));
}

function flags(args, spec) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const k = a.slice(2);
    if (!(k in spec)) return { error: `unknown option ${a}` };
    if (spec[k] === 'bool') out[k] = true;
    else {
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) return { error: `${a} needs a value` };
      out[k] = v;
      i++;
    }
  }
  return out;
}

const profileNow = () => accountProfile();
const sdShown = (profile = profileNow()) => stateDirShown(profile);
const runShown = (name, profile) => `${sdShown(profile)}/${name}`;
const runReal = (name, profile) => real(runShown(name, profile));
const partitionWords = (p) => `${p?.partition_cpu_batch || p?.partition_cpu || 'secp'}/${p?.qos_batch || p?.qos_cpu || 'secondary'}`;

/** is a job of this run alive (in line or running)? one look at the table, over job.id and next.id */
async function aliveJob(rd) {
  const ids = [];
  try {
    ids.push(readFileSync(path.join(rd, 'job.id'), 'utf8').trim());
  } catch {
    /* none */
  }
  try {
    ids.push(readFileSync(path.join(rd, 'next.id'), 'utf8').trim().split(/\s+/)[0]);
  } catch {
    /* none */
  }
  await noteSchedulerCall(homeReal(), `squeue -h -j ${ids.filter(Boolean).join(',')} (worker start)`);
  const jobs = await readJobs(homeReal());
  for (const id of ids.filter(Boolean)) {
    const j = jobs.find((x) => String(x.pbsid) === id);
    if (j && !(j.sim?.kind === 'successor')) return j;
  }
  return undefined;
}

/**
 * worker start, framework 10: one look at the scheduler; when nothing of the run is alive, submit and
 * write the queued status.json right after the scheduler accepted (contract 9.2), remove the node file,
 * trim progress.log and append "Asked the grid for a computer". Returns {job, fresh} or throws {refused}.
 */
async function startWorker({ name, permissionMode, chain, profile }) {
  const sdS = sdShown(profile);
  const rdS = `${sdS}/${name}`;
  const rd = real(rdS);
  const wsS = `${sdS}/workspaces/${name}`;
  if (existsSync(path.join(real(wsS), '.restricted'))) throw Object.assign(new Error(`refusing to start: the workspace ${wsS} is marked restricted (remove .restricted yourself if that no longer applies)`), { restricted: wsS });
  await fs.mkdir(rd, { recursive: true });
  await fs.mkdir(real(wsS), { recursive: true });
  const alive = await aliveJob(rd);
  if (alive) return { job: String(alive.pbsid), fresh: false, rdS, state: alive.status === 'queued' ? 'PENDING' : 'RUNNING on node01' };
  if (env('MOCK_SBATCH_FAIL', '') === '1') throw Object.assign(new Error('sbatch: error: Batch job submission failed: Invalid qos specification'), { refused: true });
  const now = Date.now();
  const queueS = Math.max(0, num('MOCK_QUEUE_S', 0));
  const site = profile?.site || 'mock';
  const hours = Number(profile?.worker_defaults?.hours) || 8;
  const title = titleFor(profile, name);
  const sim = {
    kind: 'worker',
    run: name,
    rd,
    site,
    title,
    home: homeReal(),
    user: user(),
    submitted_at: now,
    start_at: now + queueS * 1000,
    start_s: Math.max(0, num('MOCK_START_S', 4)),
    reason: env('MOCK_QUEUE_REASON', 'Priority'),
    expected: env('MOCK_QUEUE_EXPECT', 'estimate') === 'none' ? 'none' : 'estimate',
    phase: 'pending',
    renew_s: num('MOCK_RENEW_S', hours * 3600),
    renew_queue_s: num('MOCK_RENEW_QUEUE_S', 10),
    chain,
    renewal: false,
    permission_mode: permissionMode,
    claude_default: env('MOCK_LOGGED_IN', 'true') !== 'false',
    consent_default: env('MOCK_CONSENT', 'true') !== 'false',
    abandon_s: num('MOCK_ABANDON_S', Number(profile?.login_abandon_s) || 1200),
    reconnect_after_s: num('MOCK_RECONNECT_AFTER_S', 0),
    env_url: envUrl(),
    env_id: envId(),
    session: sessionName(name),
    workspaceShown: wsS,
    rcLogShown: `${rdS}/rc.log`,
    tokenShown: `${rdS}/job.token`,
  };
  const id = await mutateJobs(homeReal(), (jobs) => {
    const nid = nextJobNumber(jobs);
    sim.requested = requestedName(profile, name, nid);
    jobs.push({ cluster: 'mock', cluster_title: 'Mock Cluster', status: 'queued', pbsid: nid, jobname: `hpcw_${name}`, account: 'lab', queue: profile?.partition_cpu_batch || profile?.partition_cpu || 'reqp', walltime_used: '00:00:00', username: user(), extended_available: false, nodes: [], delete_path: `/pun/sys/dashboard/activejobs?cluster=mock&pbsid=${nid}`, sim });
    return nid;
  });
  await fs.writeFile(path.join(rd, 'job.id'), `${id}\n`);
  for (const f of ['node', 'stop', 'stop.done', 'next.id', 'connection.json']) await fs.rm(path.join(rd, f), { force: true });
  const consent = existsSync(consentFile()) ? 'marker' : sim.consent_default ? 'claude_config' : 'none';
  // the queued file, keys in the contract's order (9.2)
  const t = iso(now);
  await writeWhole(
    path.join(rd, 'status.json'),
    `${JSON.stringify({ version: 10, site, run: name, job: id, node: '', state: 'queued', message: STATE_WORDS.queued.message, needs: 'nothing', hint: STATE_WORDS.queued.hint, submitted_at: t, updated_at: t, title, requested_name: sim.requested, renewal: false, chain, next_job: '', consent: consent !== 'none', consent_source: consent, scheduler_state: '', reason: '', expected_start: '', checked_at: '' })}\n`,
  );
  await trimProgress(rd);
  await progress(rd, PROGRESS.asked, new Date(now));
  return { job: id, fresh: true, rdS, partition: partitionWords(profile), hours };
}

// ---- connect -----------------------------------------------------------------------------------------

function sharedReady() {
  const want = env('MOCK_SHARED_INSTALL', '');
  try {
    const marker = readFileSync(path.join(hwReal(), 'shared'), 'utf8').split('\n')[0].trim();
    const launcher = readFileSync(path.join(hwReal(), 'bin', 'hpcworker'), 'utf8').split('\n')[1];
    return !!want && marker === want && launcher === LAUNCHER_TAG && existsSync(path.join(hwReal(), 'profile.json'));
  } catch {
    return false;
  }
}

function runSharedInstall(site) {
  const dir = env('MOCK_SHARED_REAL', '');
  const r = spawnSync(env('MOCK_BASH', 'bash'), [`${dir}/bin/hpcworker`, 'install', '--shared', dir, '--profile', site], { env: process.env, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** the latest status.json of any run in the state folder saying the account is signed in to Claude (D5) */
async function newestSignedIn(profile) {
  const sd = real(sdShown(profile));
  let best;
  let entries = [];
  try {
    entries = await fs.readdir(sd, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const f = path.join(sd, e.name, 'status.json');
    try {
      const st = statSync(f);
      const j = readJson(f);
      if (j?.claude_login && (!best || st.mtimeMs > best.t)) best = { t: st.mtimeMs, login: j.claude_login };
    } catch {
      /* not a run */
    }
  }
  return best?.login?.loggedIn ? best.login : undefined;
}

function lineReader() {
  const queue = [];
  let waiter;
  let ended = false;
  let buf = '';
  process.stdin.setEncoding('utf8');
  const push = (l) => {
    if (waiter) {
      const w = waiter;
      waiter = undefined;
      w(l);
    } else queue.push(l);
  };
  process.stdin.on('data', (d) => {
    buf += d;
    let m;
    while ((m = /\r?\n/.exec(buf))) {
      push(buf.slice(0, m.index));
      buf = buf.slice(m.index + m[0].length);
    }
  });
  process.stdin.on('end', () => {
    ended = true;
    if (waiter) {
      const w = waiter;
      waiter = undefined;
      w(null);
    }
  });
  return {
    /** a line, undefined after ms with none, null when the terminal closed */
    next(ms) {
      if (queue.length) return Promise.resolve(queue.shift());
      if (ended) return Promise.resolve(null);
      return new Promise((res) => {
        const t = setTimeout(() => {
          waiter = undefined;
          res(undefined);
        }, Math.max(0, ms));
        waiter = (l) => {
          clearTimeout(t);
          res(l);
        };
      });
    },
  };
}

/** wait ms, printing the keepalive whenever 20 s pass with nothing printed */
async function waitAlive(ms, keepMs) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const quiet = Date.now() - lastOut;
    if (quiet >= keepMs) {
      say(KEEPALIVE);
      continue;
    }
    await sleep(Math.min(end - Date.now(), keepMs - quiet));
  }
}

function authUrl() {
  const b64 = (n) => crypto.randomBytes(n).toString('base64url');
  const client = env('MOCK_CLIENT_ID', 'mock-client-0000');
  return `https://claude.ai/oauth/authorize?code=true&client_id=${client}&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=org%3Acreate_api_key+user%3Aprofile+user%3Ainference&code_challenge=${b64(32)}&code_challenge_method=S256&state=${b64(32)}`;
}

/** a code Claude Code would take: printable, no spaces, at least six letters or digits */
const goodCode = (c) => /^[\x21-\x7e]+$/.test(c) && (c.match(/[A-Za-z0-9]/g) ?? []).length >= 6;

async function connect(args) {
  const t0 = Date.now();
  const f = flags(args, { name: 'v', profile: 'v', consent: 'v', login: 'v', 'permission-mode': 'v', 'no-chain': 'bool' });
  const usage = (why) => {
    say(`HPCW-STEP failed usage ${why}`);
    return done(2);
  };
  if (f.error) return usage(f.error);
  if (f._.length) return usage(`unexpected argument ${f._[0]}`);
  const name = f.name ?? 'worker';
  if (!NAME_RE.test(name)) return usage('the worker name is letters, digits, _ or - (at most 32)');
  if (f.profile !== undefined && !/^[a-z0-9-]{1,32}$/.test(f.profile)) return usage('the site profile name is lower-case letters, digits or -');
  if (f.consent !== undefined && !/^[0-9a-f]{32}$/.test(f.consent)) return usage("--consent needs this installation's 32-character id");
  const login = f.login ?? 'auto';
  if (!['auto', 'always', 'fresh', 'never'].includes(login)) return usage('--login is auto, always, fresh or never');
  let profile = profileNow();
  const mode = f['permission-mode'] ?? profile?.worker_defaults?.permission_mode ?? 'default';
  if (!['default', 'acceptEdits', 'plan'].includes(mode)) return usage('--permission-mode is default, acceptEdits or plan');
  const keepMs = Math.max(1, num('MOCK_KEEPALIVE_S', 20)) * 1000;

  // setup: the account on the lab's shared copy
  if (sharedReady()) say('HPCW-STEP setup ready');
  else {
    const site = f.profile ?? profile?.site;
    if (!site) return usage('this account is not set up yet: --profile SITE names the site profile');
    const r = runSharedInstall(site);
    if (r.code !== 0) {
      const why = (r.out.split('\n').map((l) => l.trim()).filter(Boolean).find((l) => l.startsWith('hpcworker: ')) ?? r.out.trim().split('\n').pop() ?? 'the install failed').replace(/^hpcworker: /, '');
      say(`HPCW-STEP failed setup ${why}`);
      return done(3);
    }
    profile = profileNow();
    say('HPCW-STEP setup changed');
  }

  // consent: the Remote Control answer, atomically, mode 0600
  if (f.consent) {
    try {
      const file = consentFile();
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(`${file}.part`, `yes ${iso()} ${f.consent}\n`, { mode: 0o600 });
      await fs.rename(`${file}.part`, file);
      say('HPCW-STEP consent');
    } catch {
      say('HPCW-STEP failed other could not write the Remote Control answer');
      return done(1);
    }
  }

  // restricted
  const wsS = `${sdShown(profile)}/workspaces/${name}`;
  const restrictedByProfile = profile?.restricted === true || (Array.isArray(profile?.restricted_workspaces) && (profile.restricted_workspaces.includes(name) || profile.restricted_workspaces.includes('*')));
  if (restrictedByProfile || existsSync(path.join(real(wsS), '.restricted'))) {
    say(`HPCW-STEP failed restricted the workspace ${wsS} is marked restricted`);
    return done(4);
  }

  // the worker
  try {
    const w = await startWorker({ name, permissionMode: mode, chain: !f['no-chain'], profile });
    say(`HPCW-STEP queued ${w.job} ${w.fresh ? 'new' : 'kept'} ${w.rdS}`);
  } catch (e) {
    if (e.restricted) {
      say(`HPCW-STEP failed restricted the workspace ${e.restricted} is marked restricted`);
      return done(4);
    }
    say(`HPCW-STEP failed refused ${String(e.message).split('\n')[0]}`);
    return done(5);
  }

  // the Claude sign-in
  if (login !== 'never') {
    const known = login === 'auto' ? await newestSignedIn(profile) : undefined;
    if (known) say(`HPCW-STEP signed-in ${known.email || '-'} ${known.subscriptionType || '-'}`);
    else {
      say('HPCW-STEP signin');
      const r = await sitting(login, keepMs, t0);
      if (!r.ok) {
        say(`HPCW-LOGIN-FAILED: ${r.why}`);
        say(`HPCW-STEP failed ${r.code} ${r.why}`);
        return done(r.code === 'signin-node' ? 6 : 7);
      }
      say(`HPCW-STEP signed-in ${r.email} ${r.plan}`);
    }
  }
  say('HPCW-STEP done');
  return done(0);
}

/** the plain sign-in sitting (contract 5.4), with the keepalive (5.5) and the budget (5.6) */
async function sitting(login, keepMs, t0) {
  say('HPCW-LOGIN: requesting a compute node');
  const allocBudget = num('MOCK_ALLOC_WAIT_S', 600) * 1000;
  const allocWait = num('MOCK_SIGNIN_WAIT_S', 1) * 1000;
  if (allocWait >= allocBudget) {
    await waitAlive(allocBudget, keepMs);
    return { ok: false, code: 'signin-node', why: `no computer for the sign-in within ${Math.round(allocBudget / 60000)} minutes; your worker keeps its place in line` };
  }
  await waitAlive(allocWait, keepMs);
  say('HPCW-LOGIN: on node02; checking whether you are signed in already');
  if (login === 'fresh') await setClaudeState({ loggedIn: false, email: '', subscriptionType: '' });
  const email = env('MOCK_EMAIL', `${user()}@wayne.edu`);
  const plan = env('MOCK_PLAN', 'max');
  const already = claudeState();
  if (login !== 'fresh' && already.loggedIn) {
    say(`SIGNED-IN ${already.email || email} ${already.subscriptionType || plan}`);
    return { ok: true, email: already.email || email, plan: already.subscriptionType || plan };
  }
  say("HPCW-LOGIN: starting Claude Code's sign-in; waiting for the sign-in link");
  await waitAlive(1000, keepMs);
  say(`AUTH-URL: ${authUrl()}`);
  say('HPCW-LOGIN: paste the code from that page');
  const elapsed = Date.now() - t0;
  const budget = env('MOCK_CODE_WAIT_S', '') !== '' ? num('MOCK_CODE_WAIT_S', 600) * 1000 : Math.max(120_000, Math.min(600_000, 840_000 - elapsed));
  const deadline = Date.now() + budget;
  let rejects = Math.max(0, num('MOCK_CODE_REJECT', 0));
  const reader = lineReader();
  while (Date.now() < deadline) {
    const quiet = Date.now() - lastOut;
    if (quiet >= keepMs) {
      say(KEEPALIVE);
      continue;
    }
    const line = await reader.next(Math.min(deadline - Date.now(), keepMs - quiet));
    if (line === undefined) continue;
    if (line === null) return { ok: false, code: 'signin', why: 'the terminal closed before the sign-in finished' };
    const code = line.trim();
    if (!code) continue;
    say('HPCW-LOGIN: code received, checking');
    await sleep(800);
    if (env('MOCK_LOGIN_FAIL', '') === '1') return { ok: false, code: 'signin-code', why: 'Claude Code did not accept the code; copy it again from the Claude page' };
    if (rejects > 0 || !goodCode(code)) {
      rejects = Math.max(0, rejects - 1);
      say('HPCW-LOGIN: that code was not accepted; paste it again');
      continue;
    }
    await setClaudeState({ loggedIn: true, email, subscriptionType: plan });
    say(`SIGNED-IN ${email} ${plan}`);
    return { ok: true, email, plan };
  }
  return { ok: false, code: 'signin-timeout', why: `no code arrived within ${Math.round(budget / 60000)} minutes` };
}

// ---- worker start / status / stop / restrict ----------------------------------------------------------

async function cmdStart(args) {
  const f = flags(args, { name: 'v', 'permission-mode': 'v', 'no-chain': 'bool', wait: 'v' });
  if (f.error) {
    err(`hpcworker: ${f.error}`);
    return done(2);
  }
  const name = f.name ?? 'worker';
  const profile = profileNow();
  if (!profile) {
    err(`hpcworker: no profile at ${homeShown()}/.hpcworker/profile.json: run 'hpcworker install --profile wayne' (or 'hpcworker install --discover')`);
    return done(1);
  }
  try {
    const w = await startWorker({ name, permissionMode: f['permission-mode'] ?? 'default', chain: !f['no-chain'], profile });
    if (!w.fresh) say(`worker ${name} already has job ${w.job} (${w.state}); nothing submitted`);
    else {
      say(`worker ${name} submitted as job ${w.job} (${w.partition}, ${w.hours} h). It is in line for a computer.`);
      say(`watch it with: hpcworker worker status --name ${name}   (reads ${w.rdS}/status.json and progress.log)`);
    }
    return done(0);
  } catch (e) {
    err(e.refused ? `hpcworker: the scheduler refused the worker: ${e.message}` : `hpcworker: ${e.message}`);
    return done(1);
  }
}

const minutesSince = (isoTime, now = Date.now()) => Math.max(0, Math.round((now - Date.parse(isoTime)) / 60000));

/** the first line for a person (contract section 6) */
export function personLine(st) {
  if (!st) return 'Your worker has been asked for and has not reported yet.';
  switch (st.state) {
    case 'queued':
      return `Your worker is in line for a computer (${st.submitted_at ? minutesSince(st.submitted_at) : 0} min so far).`;
    case 'starting':
    case 'running':
    case 'need_consent':
      return 'Your worker has a computer and is connecting to Claude.';
    case 'online':
      return !st.renewal && st.online_at && st.submitted_at ? `Your worker is online (ready ${minutesSince(st.submitted_at, Date.parse(st.online_at))} min after you asked).` : 'Your worker is online.';
    case 'need_login':
      return 'Your worker is waiting for your Claude sign-in.';
    case 'preempted':
      return st.next_job ? 'Your worker is renewing itself; it is back in a few minutes.' : 'Your worker has ended. hpcworker connect starts it again.';
    case 'stopped':
      return st.stop_reason === 'login_abandoned' ? 'Your worker stopped: waiting for your Claude sign-in timed out.' : 'Your worker is stopped.';
    case 'error':
      return `Your worker couldn't start: ${st.message || 'unknown'}`;
    default:
      return 'Your worker has been asked for and has not reported yet.';
  }
}

/** Slurm's %S as ISO-8601 UTC when it is a time in the future, else "" (D12) */
function futureIso(s) {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)$/.exec(String(s ?? '').trim());
  if (!m) return '';
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])).getTime();
  return t > Date.now() ? iso(t) : '';
}

async function cmdStatus(args) {
  const f = flags(args, { name: 'v', json: 'bool', details: 'bool' });
  const name = f.name ?? 'worker';
  const profile = profileNow();
  const sdS = sdShown(profile);
  const rd = real(`${sdS}/${name}`);
  if (!existsSync(rd)) {
    err(`hpcworker: no worker named ${name} (hpcworker worker start)`);
    return done(1);
  }
  let st = readStatus(rd) ?? null;
  const job = (() => {
    try {
      return readFileSync(path.join(rd, 'job.id'), 'utf8').trim();
    } catch {
      return '';
    }
  })();
  const nextJob = (() => {
    try {
      return readFileSync(path.join(rd, 'next.id'), 'utf8').trim().split(/\s+/)[0] ?? '';
    } catch {
      return '';
    }
  })();
  const nodeFile = existsSync(path.join(rd, 'node'));
  let scheduler = null;
  if ((st?.state === 'queued' || (!st && job)) && !nodeFile && job) {
    // the one scheduler question: squeue -h -j <job> -o '%T|%r|%S|%N'
    await noteSchedulerCall(homeReal(), `squeue -h -j ${job} -o %T|%r|%S|%N (worker status)`);
    const jobs = await readJobs(homeReal());
    const j = jobs.find((x) => String(x.pbsid) === job);
    const checked = iso();
    if (j) {
      const pending = j.status === 'queued';
      const raw = pending ? (j.sim?.expected === 'none' || !j.sim?.start_at ? 'N/A' : slurmTime(Math.max(j.sim.start_at, Date.now()))) : slurmTime(j.sim?.got_at ?? Date.now());
      scheduler = { state: pending ? 'PENDING' : 'RUNNING', reason: pending ? j.sim?.reason || 'Priority' : 'None', expected_start: futureIso(raw), node: pending ? '' : (j.nodes ?? []).join(','), checked_at: checked };
      const again = readStatus(rd);
      if (again?.state === 'queued' && again.job === job && !existsSync(path.join(rd, 'node'))) {
        st = { ...again, scheduler_state: scheduler.state, reason: scheduler.reason, expected_start: scheduler.expected_start, checked_at: checked, ...(scheduler.state === 'RUNNING' && !again.got_computer_at ? { got_computer_at: checked } : {}) };
        await writeStatus(rd, st);
      }
    } else {
      scheduler = { state: 'GONE', reason: '', expected_start: '', node: '', checked_at: checked };
      if (st?.state === 'queued' || !st) {
        st = { ...(st ?? { version: 10, run: name, job }), state: 'error', message: 'the grid ended the request before it started', needs: 'nothing', hint: STATE_WORDS.error.hint, updated_at: checked, scheduler_state: 'GONE', checked_at: checked };
        await writeStatus(rd, st);
        await progress(rd, PROGRESS.error('the grid ended the request before it started'));
      }
    }
  }
  const line = personLine(st);
  if (f.json) {
    say(JSON.stringify({ v: 1, run: name, job, next_job: nextJob, state_dir: sdS, status: st, connection: readJson(path.join(rd, 'connection.json')) ?? null, scheduler, line }));
    return done(0);
  }
  say(line);
  if (f.details) say(`worker ${name}: ${st?.state ?? 'unknown'} (job ${job || '-'}${st?.node ? ` on ${st.node}` : ''}); session ${st?.session_name ?? '-'}; ${st?.environment_url || '-'}`);
  if (st?.state === 'online' && st.environment_url) say(`Open in Claude: ${st.environment_url}  Look for ${st.title || titleFor(profile, name)}.`);
  return done(0);
}

async function cmdStop(args) {
  const f = flags(args, { name: 'v' });
  const name = f.name ?? 'worker';
  const profile = profileNow();
  const rd = real(`${sdShown(profile)}/${name}`);
  if (!existsSync(rd)) {
    err(`hpcworker: no worker named ${name}`);
    return done(1);
  }
  await fs.writeFile(path.join(rd, 'stop'), '');
  const read = (n) => {
    try {
      return readFileSync(path.join(rd, n), 'utf8').trim();
    } catch {
      return '';
    }
  };
  const job = read('job.id');
  const next = read('next.id').split(/\s+/)[0] ?? '';
  await noteSchedulerCall(homeReal(), `squeue -h -j ${[job, next].filter(Boolean).join(',')} (worker stop)`);
  const out = await mutateJobs(homeReal(), async (jobs) => {
    const main = jobs.find((x) => String(x.pbsid) === job);
    const succ = jobs.find((x) => String(x.pbsid) === next);
    const started = main && main.status !== 'queued';
    const cancelled = [main && !started ? job : '', succ ? next : ''].filter(Boolean);
    const keep = jobs.filter((x) => x !== main && x !== succ);
    jobs.length = 0;
    jobs.push(...keep);
    const st = readStatus(rd);
    if (st && st.state !== 'stopped') {
      await writeStatus(rd, { ...st, state: 'stopped', message: 'stopped at your request', needs: 'nothing', hint: STATE_WORDS.stopped.hint, stop_reason: 'request', rc_alive: false, next_job: '', updated_at: iso() });
      await progress(rd, PROGRESS.stopped);
    }
    await fs.writeFile(path.join(rd, 'stop.done'), '');
    await fs.rm(path.join(rd, 'next.id'), { force: true });
    return { started: !!started, had: !!main, cancelled };
  });
  const how = out.started || !out.had ? 'the job left on its own' : 'it had not started';
  say(`worker ${name}: stopped (${how}${out.cancelled.length ? `; cancelled at the scheduler: ${out.cancelled.join(', ')}` : ''}; the chain ended)`);
  return done(0);
}

async function cmdRestrict(args) {
  const f = flags(args, { name: 'v' });
  const name = f.name ?? 'worker';
  const markerS = `${sdShown()}/workspaces/${name}/.restricted`;
  const marker = real(markerS);
  if (existsSync(marker)) {
    say(`worker ${name}: already marked restricted (${markerS})`);
    return done(0);
  }
  await fs.mkdir(path.dirname(marker), { recursive: true });
  await fs.writeFile(marker, `restricted ${iso()} by hpcworker worker restrict\n`, { mode: 0o644 });
  say(`worker ${name}: marked restricted (${markerS}); it will not start there until the marker is removed`);
  return done(0);
}

async function cmdConsentRecord(args) {
  const id = args[0] ?? '';
  if (!/^[0-9a-f]{32}$/.test(id)) {
    err("hpcworker: claude consent --record needs this installation's 32-character id");
    return done(2);
  }
  const file = consentFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(`${file}.part`, `yes ${iso()} ${id}\n`, { mode: 0o600 });
  await fs.rename(`${file}.part`, file);
  say(`recorded in ${shown(file)} (fallback marker): your workers may now host Remote Control`);
  return done(0);
}

// ---- login-setup (AM2; contract section 8). UNPROVEN ON THE GRID; this is the mock's account ------

const COMMENT = 'beethoven-login-setup';
const BLOCK_START = '# >>> beethoven login-setup (managed; "hpcworker login-setup --remove" removes this block) >>>';
const BLOCK_END = '# <<< beethoven login-setup <<<';
const DEFAULT_KEYS = ['id_rsa', 'id_ecdsa', 'id_ecdsa_sk', 'id_ed25519', 'id_ed25519_sk', 'id_dsa'];

function findTool(name) {
  const dirs = [env('MOCK_SSH_BIN', ''), 'C:/Program Files/Git/usr/bin', 'C:/Windows/System32/OpenSSH', '/usr/bin', '/bin'].filter(Boolean);
  for (const d of dirs) {
    for (const ext of ['', '.exe']) {
      const p = path.join(d, `${name}${ext}`);
      if (existsSync(p)) return p;
    }
  }
  const r = spawnSync(name, ['-V'], { encoding: 'utf8', windowsHide: true });
  return r.error ? undefined : name;
}

function stop(code, line) {
  say(line);
  return done(code);
}

const isLoopback = (a) => a === '::1' || /^127\./.test(a) || /^::ffff:127\./i.test(a);

/** an agent, not a person, at the keyboard: the framework's markers, or no terminal (the mock's shell has none, so the server says MOCK_TTY=1) */
function agentMarker() {
  for (const k of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'BEETHOVEN_REQUEST_ID', 'BEETHOVEN_WORKER', 'HPCW_AGENT']) if (env(k, '')) return true;
  return !(process.stdin.isTTY || env('MOCK_TTY', '') === '1');
}

/** the home folder writable by group or others (sshd's StrictModes would ignore any key in it); Windows has no such bits, so the mock reads MOCK_HOME_MODE there */
function homeWritableByOthers() {
  const m = env('MOCK_HOME_MODE', '');
  if (m) return (parseInt(m, 8) & 0o022) !== 0;
  if (process.platform === 'win32') return false;
  return (statSync(homeReal()).mode & 0o022) !== 0;
}

function hostNames(profile) {
  const names = [];
  const add = (n) => n && !names.includes(n) && names.push(n);
  if (profile?.submit_host) {
    add(profile.submit_host);
    add(`${profile.submit_host}.*`);
  }
  add(profile?.ood_shell_host || '');
  const host = env('MOCK_LOGIN_HOST', 'login1');
  add(host);
  add(`${host}.cluster.mock`);
  return names;
}

async function readText(f) {
  try {
    return await fs.readFile(f, 'utf8');
  } catch {
    return undefined;
  }
}

function withoutBlock(text) {
  const lines = text.split('\n');
  const out = [];
  let inside = false;
  for (const l of lines) {
    if (l === BLOCK_START) inside = true;
    else if (l === BLOCK_END && inside) inside = false;
    else if (!inside) out.push(l);
  }
  return out.join('\n');
}

const isOurKeyLine = (l) => new RegExp(`\\s${COMMENT}\\s`).test(` ${l} `) && /ssh-ed25519\s/.test(l);

async function loginSetup(args) {
  const remove = args.includes('--remove');
  const ssh = path.join(homeReal(), '.ssh');
  const key = path.join(ssh, 'beethoven_ed25519');
  const pub = `${key}.pub`;
  const cfg = path.join(ssh, 'config');
  const ak = path.join(ssh, 'authorized_keys');
  const pubText = await readText(pub);
  const ours = !!pubText && pubText.trim().split(/\s+/)[2] === COMMENT;

  if (remove) {
    let removed = false;
    const akText = await readText(ak);
    if (akText !== undefined && akText.split('\n').some(isOurKeyLine)) {
      await fs.writeFile(ak, akText.split('\n').filter((l) => !isOurKeyLine(l)).join('\n'));
      removed = true;
    }
    const cfgText = await readText(cfg);
    if (cfgText !== undefined && cfgText.includes(BLOCK_START)) {
      await fs.writeFile(cfg, withoutBlock(cfgText).replace(/\n+$/, '\n'));
      removed = true;
    }
    if (ours) {
      await fs.rm(key, { force: true });
      await fs.rm(pub, { force: true });
      removed = true;
    }
    return stop(0, removed ? "Done. Removed Beethoven's grid key." : 'Nothing to remove.');
  }

  const sc = env('SSH_CONNECTION', '').trim().split(/\s+/).filter(Boolean);
  if (sc.length !== 4 || !net.isIP(sc[0])) return stop(2, 'Stopped: this is not a session that came in through ssh, so there is no address to allow.');
  const from = sc[0];
  if (isLoopback(from)) return stop(2, 'Stopped: this session came from this same computer, not from the grid\'s website.');
  if (agentMarker()) return stop(2, "Stopped: this changes how your account signs in, so it runs only in the grid's own terminal, not under Claude Code or another program.");
  if (homeWritableByOthers()) return stop(3, 'Stopped: your home folder can be written by others, so the grid would ignore any key in it.');
  try {
    await fs.mkdir(ssh, { recursive: true, mode: 0o700 });
    await fs.chmod(ssh, 0o700);
  } catch {
    return stop(4, 'Stopped: ~/.ssh could not be made private.');
  }

  // the key: ours is reused; anything else of that name stops the step with nothing changed
  if (!ours && (existsSync(key) || existsSync(pub))) return stop(6, 'Stopped: ~/.ssh/beethoven_ed25519 is there but was not made by this tool; nothing was changed.');
  const day = iso().slice(0, 10);
  if (!ours || !existsSync(key)) {
    const keygen = findTool('ssh-keygen');
    if (!keygen) return stop(5, 'Stopped: ssh-keygen is not available here.');
    await fs.rm(key, { force: true });
    await fs.rm(pub, { force: true });
    const r = spawnSync(keygen, ['-q', '-t', 'ed25519', '-N', '', '-C', `${COMMENT} ${user()} ${day}`, '-f', key.split(path.sep).join('/')], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
    if (r.status !== 0 || !existsSync(key) || !existsSync(pub)) return stop(5, 'Stopped: the key could not be made.');
    await fs.chmod(key, 0o600).catch(() => {});
    await fs.chmod(pub, 0o644).catch(() => {});
    say('Made a key that only the grid\'s own website can use: ~/.ssh/beethoven_ed25519');
  } else say('Kept the key made earlier: ~/.ssh/beethoven_ed25519');
  const pubLine = (await readText(pub)).trim().split(/\s+/);

  // ~/.ssh/config: one managed block, at the end, for the login host's names
  const names = hostNames(accountProfile());
  const block = [BLOCK_START, `Host ${names.join(' ')}`, '    IdentityFile ~/.ssh/beethoven_ed25519', ...DEFAULT_KEYS.map((k) => `    IdentityFile ~/.ssh/${k}`), BLOCK_END].join('\n');
  const before = await readText(cfg);
  const base = before === undefined ? '' : withoutBlock(before).replace(/\n+$/, '');
  const after = `${base ? `${base}\n\n` : ''}${block}\n`;
  try {
    if (before === undefined) await fs.writeFile(cfg, after, { mode: 0o600 });
    else await fs.writeFile(cfg, after);
    const sshBin = findTool('ssh');
    if (sshBin) {
      const g = spawnSync(sshBin, ['-G', '-F', cfg.split(path.sep).join('/'), names[0]], { encoding: 'utf8', windowsHide: true, timeout: 15_000 });
      if (g.status !== 0 || !/beethoven_ed25519/.test(g.stdout ?? '')) throw new Error('ssh -G did not list the key');
    }
  } catch {
    if (before === undefined) await fs.rm(cfg, { force: true });
    else await fs.writeFile(cfg, before);
    return stop(7, 'Stopped: ~/.ssh/config could not be updated safely; nothing was changed.');
  }
  say("The grid's website will use it to open your terminal (~/.ssh/config).");

  // ~/.ssh/authorized_keys: one line for our key, restricted to the addresses the step ran from (at most four, newest kept)
  try {
    const akText = (await readText(ak)) ?? '';
    const lines = akText.split('\n').filter((l, i, a) => !(i === a.length - 1 && l === ''));
    const old = lines.find(isOurKeyLine);
    const prev = old ? (/from="([^"]*)"/.exec(old)?.[1] ?? '').split(',').filter(Boolean) : [];
    const addrs = [...prev.filter((a) => a !== from), from].slice(-4);
    const line = `from="${addrs.join(',')}",no-agent-forwarding,no-port-forwarding,no-X11-forwarding ${pubLine[0]} ${pubLine[1]} ${pubLine.slice(2).join(' ')}`;
    const next = old ? lines.map((l) => (l === old ? line : l)) : [...lines, line];
    if (akText === '' && !existsSync(ak)) await fs.writeFile(ak, `${next.join('\n')}\n`, { mode: 0o600 });
    else await fs.writeFile(ak, `${next.join('\n')}\n`);
    await fs.chmod(ak, 0o600).catch(() => {});
    say(`Allowed it from ${addrs.join(', ')} only (~/.ssh/authorized_keys).`);
  } catch {
    return stop(7, 'Stopped: ~/.ssh/authorized_keys could not be updated; nothing was changed.');
  }
  return stop(0, 'Done. The grid will not ask again.');
}

// ---- dispatch ----------------------------------------------------------------------------------------

const [verb, ...rest] = process.argv.slice(2);
const table = { connect, start: cmdStart, status: cmdStatus, stop: cmdStop, restrict: cmdRestrict, 'consent-record': cmdConsentRecord, 'login-setup': loginSetup };
if (!table[verb]) {
  err('usage: tool.mjs connect|start|status|stop|restrict|consent-record|login-setup ...');
  process.exit(2);
}
table[verb](rest).catch((e) => {
  err(`hpcworker: ${e?.message ?? e}`);
  process.exit(1);
});
