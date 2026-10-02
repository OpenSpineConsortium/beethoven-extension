// What the mock's framework 10 stand-in (lib/tool.mjs) and its job simulator (lib/jobsim.mjs) share:
// where a path the portal shows lives on disk, the status.json document with every framework 10 field
// in a fixed order (docs/V11_CONTRACT.md, "status.json"), progress.log's fixed sentences, the
// registration block Claude Code prints, and the mock account's Claude sign-in.
//
// Paths. The portal shows the student /home/<user>, the lab's shared copy at its own folder, and at
// Wayne State a state folder under /rs/rs_grp_oschome/<user>. On disk each is a temporary folder; the
// server hands their pairs over in MOCK_ROOTS ([{v, r}], r a path Node can open). `real(v)` maps a
// path the portal shows onto disk; `shown(r)` maps back, so whatever the stand-in prints or writes
// into a status file reads like the cluster.
import crypto from 'node:crypto';
import { promises as fs, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeWhole } from './jobs.mjs';

export function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}
export const num = (name, fallback) => {
  const n = Number(env(name, ''));
  return Number.isFinite(n) && env(name, '') !== '' ? n : fallback;
};

/** the folder pairs the portal shows and their places on disk, longest virtual prefix first */
export function roots() {
  let list = [];
  try {
    list = JSON.parse(env('MOCK_ROOTS', '[]'));
  } catch {
    list = [];
  }
  const home = env('MOCK_HOME', '');
  const shown = env('MOCK_DISPLAY_HOME', '');
  if (home && shown && !list.some((x) => x.v === shown)) list.push({ v: shown, r: home });
  return list.filter((x) => x && x.v && x.r).sort((a, b) => b.v.length - a.v.length);
}

/** a path as the portal shows it -> where it is on disk (unchanged when no root covers it) */
export function real(v) {
  const s = String(v).replace(/\\/g, '/');
  for (const { v: pre, r } of roots()) {
    if (s === pre || s.startsWith(`${pre}/`)) return path.join(r, s.slice(pre.length));
  }
  return s;
}

/** a path on disk -> as the portal shows it */
export function shown(r) {
  const s = path.resolve(String(r));
  // the longest folder on disk first: an extra root may sit inside the home's folder
  for (const { v, r: pre } of roots().sort((a, b) => path.resolve(b.r).length - path.resolve(a.r).length)) {
    const p = path.resolve(pre);
    if (s === p) return v;
    if (s.startsWith(p + path.sep)) return `${v}/${s.slice(p.length + 1).split(path.sep).join('/')}`;
  }
  return s.split(path.sep).join('/');
}

export const user = () => env('MOCK_USER', env('USER', 'student'));
export const homeShown = () => env('MOCK_DISPLAY_HOME', `/home/${user()}`);
export const homeReal = () => env('MOCK_HOME', process.env.HOME || '.');
export const hwReal = () => path.join(homeReal(), '.hpcworker');
export const now = () => new Date();
export const iso = (d = new Date()) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');

export function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** the account's profile.json, or undefined */
export const accountProfile = () => readJson(path.join(hwReal(), 'profile.json'));

/** shared_state_dir with $HOME and $USER expanded, as the portal shows it */
export function stateDirShown(profile = accountProfile()) {
  const raw = String(profile?.shared_state_dir || '$HOME/.hpcworker');
  return raw.replace(/\$\{?HOME\}?/g, homeShown()).replace(/\$\{?USER\}?/g, user()).replace(/\/+$/, '');
}

/** the session title the job asks Claude Code for: the profile's session_title, " · <name>" for a worker not named "worker" (framework 10) */
export function titleFor(profile, name) {
  const base = profile?.session_title || 'Grid worker';
  return name === 'worker' ? base : `${base} · ${name}`;
}

/** framework 9's requested name when the profile has no session_title (the mock's own profile), else the title */
export function requestedName(profile, name, job) {
  return profile?.session_title ? titleFor(profile, name) : `${profile?.site || 'mock'}-${job}`;
}

// the environment id is stable per machine (Claude Code keys it to remoteControlMachineId); here per mock home
export function envId() {
  return env('MOCK_ENV_ID', `env_01${crypto.createHash('md5').update(homeShown() + homeReal()).digest('hex').slice(0, 24)}`);
}
export const envUrl = () => `https://claude.ai/code?environment=${envId()}`;

/** Claude Code names the session itself: <node>-<word>-<word>; fixed words per worker name so tests can predict them */
export function sessionName(name) {
  const adj = ['hazy', 'quiet', 'amber', 'brisk'];
  const noun = ['meadow', 'harbor', 'ridge', 'lantern'];
  const n = [...String(name)].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
  return `node01-${adj[n % 4]}-${noun[Math.floor(n / 4) % 4]}`;
}

/** exactly what `claude remote-control` 2.1.283 prints after its QR code */
export function registrationBlock(session, link = envUrl()) {
  return `
  █▀▀▀▀▀█ ▄▀▄▀ █▀▀▀▀▀█
  █ ███ █ ▀ █▄ █ ███ █
  █ ▀▀▀ █ ▄▀▀▄ █ ▀▀▀ █
  ▀▀▀▀▀▀▀ ▀ ▀ ▀ ▀▀▀▀▀▀▀

·✔︎· Connected · phone · HEAD
    Capacity: 1/32 · New sessions will be created in the current directory
    ${session}
Continue coding in the Claude mobile app or ${link}
Or ask Claude to work in this folder from your projects on claude.ai
`;
}

// ---- progress.log: "<ISO-8601 UTC> <sentence>", one write per line, the fixed sentences of the contract

export const PROGRESS = {
  asked: 'Asked the grid for a computer',
  got: 'Got a computer',
  connecting: 'Connecting to Claude',
  online: (link) => `Online: ${link}`,
  waitingSignin: 'Waiting for your Claude sign-in',
  reconnecting: 'Reconnecting',
  renewing: 'Renewing',
  ended: 'Ended',
  stopped: 'Stopped',
  abandoned: 'Stopped: waiting for your Claude sign-in timed out',
  error: (msg) => `Couldn't start: ${msg}`,
};

export async function progress(runDir, sentence, at = new Date()) {
  await fs.mkdir(runDir, { recursive: true });
  await fs.appendFile(path.join(runDir, 'progress.log'), `${iso(at)} ${sentence}\n`);
}

/** worker start trims progress.log to its last 400 lines before it appends */
export async function trimProgress(runDir, keep = 400) {
  const f = path.join(runDir, 'progress.log');
  try {
    const lines = (await fs.readFile(f, 'utf8')).split('\n').filter(Boolean);
    if (lines.length > keep) await writeWhole(f, `${lines.slice(-keep).join('\n')}\n`);
  } catch {
    /* none yet */
  }
}

// ---- status.json, framework 10 (every field, in one order)

const ORDER = ['version', 'site', 'run', 'job', 'node', 'pid', 'state', 'message', 'needs', 'hint', 'submitted_at', 'got_computer_at', 'started_at', 'online_at', 'ends_at', 'renewal', 'updated_at', 'title', 'session_name', 'requested_name', 'environment_url', 'environment_id', 'session_url', 'claude_login', 'consent', 'consent_source', 'workspace_trusted', 'rc_alive', 'resumed', 'tmux', 'restarts', 'chain', 'next_job', 'chain_note', 'scheduler_in_worker', 'scheduler_note', 'workspace', 'rc_log', 'token_path', 'stop_reason', 'scheduler_state', 'reason', 'expected_start', 'checked_at'];

export function ordered(doc) {
  const out = {};
  for (const k of ORDER) if (doc[k] !== undefined) out[k] = doc[k];
  for (const k of Object.keys(doc)) if (!(k in out) && doc[k] !== undefined) out[k] = doc[k];
  return out;
}

export async function writeStatus(runDir, doc) {
  await fs.mkdir(runDir, { recursive: true });
  await writeWhole(path.join(runDir, 'status.json'), `${JSON.stringify(ordered(doc))}\n`);
}

export const readStatus = (runDir) => readJson(path.join(runDir, 'status.json'));

/** the words the job writes for each state (message for Details, hint for a person at a terminal) */
export const STATE_WORDS = {
  queued: { message: 'waiting for a computer', needs: 'nothing', hint: 'Your worker is in line for a computer.' },
  starting: { message: 'starting Claude Code Remote Control', needs: 'nothing', hint: 'Your worker has a computer and is connecting to Claude.' },
  need_login: { message: 'waiting for your Claude sign-in', needs: 'login', hint: 'Sign in to Claude to finish: hpcworker connect, or Sign in to Claude in Beethoven.' },
  need_consent: { message: 'waiting for your answer to "Enable Remote Control?"', needs: 'consent', hint: 'Press Connect in Beethoven, or run hpcworker claude consent.' },
  online: { message: '', needs: 'nothing', hint: 'Your worker is online.' },
  stopped: { message: 'stopped at your request', needs: 'nothing', hint: 'Your worker is stopped.' },
  preempted: { message: 'renewing: the next job takes over', needs: 'nothing', hint: 'Your worker is renewing itself; it is back in a few minutes.' },
  error: { message: 'the job could not start', needs: 'nothing', hint: "Your worker couldn't start." },
};

// ---- the mock account's Claude sign-in (Claude Code's own credentials on the real grid; a file here)

const claudeFile = (home) => path.join(home, '.mock-ood', 'claude.json');

/**
 * {loggedIn, email, subscriptionType}: the file when there is one, else the default the account
 * started with (MOCK_LOGGED_IN, default signed in, as the 10.0.0 stand-in reported). `home` is the
 * mock home on disk; the server's simulator passes it, the stand-in's commands read MOCK_HOME.
 */
export function claudeState(home = homeReal(), loggedInDefault = env('MOCK_LOGGED_IN', 'true') !== 'false', who = user()) {
  const f = readJson(claudeFile(home));
  if (f && typeof f.loggedIn === 'boolean') return f;
  return { loggedIn: loggedInDefault, email: loggedInDefault ? env('MOCK_EMAIL', `${who}@wayne.edu`) : '', subscriptionType: loggedInDefault ? env('MOCK_PLAN', 'max') : '' };
}

export async function setClaudeState(s, home = homeReal()) {
  await fs.mkdir(path.dirname(claudeFile(home)), { recursive: true });
  await writeWhole(claudeFile(home), `${JSON.stringify({ ...s, at: iso() })}\n`);
}

export const consentFile = (home = homeReal()) => path.join(home, '.hpcworker', 'consent');
export const hasConsentMarker = (home = homeReal()) => existsSync(consentFile(home));
