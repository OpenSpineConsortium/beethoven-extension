#!/usr/bin/env node
// A mock Open OnDemand portal for tests, for the browser harness (e2e/) and for loading the extension
// unpacked. It implements the endpoints the extension uses with the shapes the research notes document
// from OSC/ondemand:
//
//   GET  /                                     302: /public/start.html (auth basic, as the live portal answers) or the dashboard (cookie)
//   GET  /public/start.html                    the portal's public start page with its "LOGIN TO ONDEMAND" link
//   GET  /login[?go=1]                         cookie mode: the sign-in stand-in (sets the session cookie, SameSite as --samesite)
//   GET  /pun/sys/dashboard/                   dashboard HTML: <meta name="csrf-token">, "Logged in as <user>", "Open OnDemand"
//   GET  /pun/sys/dashboard/files              302 to files/fs<home>
//   GET  /pun/sys/dashboard/files/fs/<path>    Accept: application/json -> index.json.jbuilder fields; ?download=1 -> body
//   PUT  /pun/sys/dashboard/files/fs/<path>    X-CSRF-Token + Rails Origin check; ?dir=true, ?touch=true
//   GET  /pun/sys/dashboard/activejobs.json    {"data":[[...]],"errors":[]}
//   DELETE /pun/sys/dashboard/activejobs       ?cluster=&pbsid=, CSRF + Origin, 302 on success
//   GET  /pun/sys/dashboard/projects           200 HTML
//   GET  /pun/sys/myjobs/workflows.json        404 unless --job-composer
//   GET  /pun/sys/shell/ssh/<host>             the shell page with "csrf=<token>" in its inline script; with
//                                              --terminal xterm (the default with --keyless) a working terminal:
//                                              an xterm.js-style helper textarea taking keys, a paste event and an
//                                              insertText input event, the title set from the shell's OSC 0/2
//   WSS  /pun/sys/shell/ssh/<host>?csrf=       {"input"} / {"resize"} frames in, raw PTY text out; 3146 closes;
//                                              "{}" is parsed and ignored and is no activity, as in OOD 4.1
//   GET  /rnode/<host>/<port>/                 404 (proxy off) or 503 "Failed to connect to host:port" (--rnode enabled)
//   GET  /nginx/init?redir=                    the cold-PUN redirect (--cold)
//
// Signing in. The default is 10.0.0's cookie mode (an identity-provider stand-in at /login sets a
// session cookie; --samesite lax|none|strict, lax by default, and lax or strict cannot travel on an
// extension's WebSocket, which forces Beethoven's tab mode). --auth basic (MOCK_AUTH=basic) plays the
// live portal as it answered on 2026-10-01: every /pun/ request and the shell's WebSocket handshake
// get "401 Unauthorized" with 'WWW-Authenticate: Basic realm="private"' unless the browser sends
// Basic credentials for --user and --password (MOCK_PASSWORD, default mockpass), so Chrome shows its
// own sign-in box; "/" answers 302 to /public/start.html. HTML pages carry a CSP frame-ancestors header.
//
// The shell. Each typed line runs in a real bash (Git Bash on Windows) with the mock's scheduler
// commands (bin/) first on PATH, so the shell semantics the extension relies on are real; only the
// cluster is fake. While a command runs, typed lines go to its standard input (the pasted code of a
// sign-in sitting), not echoed while that command is a sign-in (the sitting's terminal has echo off).
// A line starting with `exec` ends the session when its command ends, as a replaced login shell
// does; OOD closes the socket with no code when ssh ends. Each prompt sets the terminal title as
// RHEL's bash does for an xterm ("ESC ] 0 ; st1234@login1:~ BEL"; --no-shell-title turns it off).
// OnDemand's idle rule: a socket with no input and no output for --shell-idle seconds (default 300,
// OOD_SHELL_INACTIVE_TIMEOUT_MS) or older than --shell-max seconds (3600) is terminated at the next
// sweep (every --shell-sweep seconds, 30). Shells carry SSH_CONNECTION from 10.0.0.1 (the OnDemand
// server, as the login node sees it), and no agent marker of the machine running the mock.
//
// The keyless account (--keyless, MOCK_SHELL_KEYLESS=1; AM2): until `hpcworker login-setup` has put
// a line with "beethoven-login-setup" and from="10.0.0.1" in ~/.ssh/authorized_keys, every shell
// first prints "<user>@login1's password: " and waits for a line: the password gives the usual
// "Last login" and prompt; a wrong one "Permission denied, please try again." and the prompt again;
// three wrong ones end the session. Nothing typed there is echoed or recorded.
//
// The job clock. A worker framework 10's stand-in submitted waits in line --queue seconds
// (MOCK_QUEUE_S) with --queue-reason (MOCK_QUEUE_REASON, Priority), then gets a computer, waits for
// the account's Claude sign-in and comes online (lib/jobsim.mjs, once a second).
//
// Beside the portal, for tests and the harness only, a stand-in for Licensor's access service with
// the wire contract the extension codes to (src/licensing/access.ts). No build points at it: the
// extension reads the address from services.json on Licensor's site, and a test or the harness hands
// it this one instead.
//   GET  /beethoven/services.json              {"access_check": "<origin>/beethoven/access_check", ...}, CORS open
//   POST /beethoven/access_check               text/plain JSON {v, access_id, portal, product, version, install_id} ->
//                                              --access list (default): for the ids in --approve (default st1234),
//                                              one installation each: the first install_id asking binds the account
//                                              (--seat id=install binds one beforehand), and it gets 200
//                                              {"approved":true,...}; another gets reason "other_installation"; an
//                                              installation bound to another approved account gets "other_account";
//                                              none gets "update_required" (unless --install-optional); 200
//                                              {"approved":false,...} for any other id; 400 malformed; 429 past
//                                              --access-limit. --access approved | denied | other-installation |
//                                              other-account | update-required | withdrawn (a "no" after a "yes": the
//                                              extension's record then says withdrawn) | down (503) answers that for
//                                              every account; /_mock/access?mode= changes it while running.
//
// For the harness (never part of a real portal; no sign-in): GET /_mock/log (every request and
// WebSocket, with the sign-in it carried and its answer; every shell with the command lines typed at
// its prompt, never what was typed into a running command or at the password prompt), GET
// /_mock/state, GET|POST /_mock/access?mode=..., POST /_mock/reset.
//
// Two behaviours measured on the live portal (ondemand.grid.wayne.edu, 2026-09-29) are reproduced:
// the first /pun/ request after a while answers 500 "Error: Server Error ... try again in 30 seconds"
// once (the per-user nginx starting; --cold-pun MS sets the idle time), and a ?download=1 of a file
// that does not exist answers 200 with an HTML page, not 404.
//
// The Files routes are jailed to a virtual home (/home/<user>) mapped onto a directory on disk, a
// state folder at /rs/rs_grp_oschome/<user> (Wayne State's site profile keeps its runs there) mapped
// onto <home>/.mock-ood/rs, and the lab's shared copy (below). The seeded tool prints and records
// these paths in place of their real places (MOCK_DISPLAY_HOME), so what the extension shows of the
// tool's output reads like a cluster wherever the mock runs.
//
// The lab's shared copy of the tool (framework 5), the only way Beethoven 8.0.0 and later set an
// account up (the package carries no copy of the tool): with option sharedInstall (the CLI: always)
// a second directory on disk, seeded with the stand-in tool, a VERSION (--shared-version, default 5)
// and profiles/mock.json and profiles/wayne.json naming the shared path, is served read-only by the
// Files routes at that virtual path, and a typed line that names the path runs against that
// directory. The path is --shared-install PATH, else MOCK_SHARED_INSTALL=PATH in the server's
// environment, else /lab/shared/hpcworker/current. --shared-unreadable (sharedReadable: false) plays a
// student outside the lab's group: the Files routes answer 403 there and bash cannot open the
// launcher (No such file or directory, exit 127).
//
// The CLI (the store reviewer's recipe) starts the home already set up on that shared copy (option
// seedShared): the stand-in's own `install --shared` runs once at start, so the account has the
// launcher, the marker and the profile. Other homes: --shared-install [PATH] leaves the account not
// set up, so Beethoven sets it up (open the mock as https://ondemand.wayne.localhost:<port> with
// --shared-install /rs/rs_grp_oschome/shared/beethoven/hpcworker/current: the site is then "wayne"
// and the bundled profile names that path); --fresh-home leaves it not set up with the default path;
// --own-copy gives it the stand-in as its own copy, as a build before 8.0.0 left it (option
// seedInstalled); --shared-unreadable leaves it not set up.
//
// The only dependency is `ws`. Node 22.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { advance } from './lib/jobsim.mjs';
import { readJobs, removeJob, stateDir as mockStateDir } from './lib/jobs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(here, 'bin');
// bash passes over a file on PATH that is not executable and runs the next one, so a stand-in that lost its
// mode (a checkout from Windows) would hand the shell to the host's real sbatch, squeue or scancel: on a
// cluster node that is a real job (measured on Wayne State's kbt2, 2026-10-03). They are made executable here
for (const f of fs.readdirSync(BIN)) { try { fs.chmodSync(path.join(BIN, f), 0o755); } catch { /* Windows: no modes */ } }
const LIB = path.join(here, 'lib');
const COOKIE = 'mock_session';
/** what the login node sees as the client of every ssh the Shell app makes: the OnDemand server */
export const SSH_CLIENT = '10.0.0.1';
/** the access service stand-in's answers for every account (besides "list", the per-account default) */
export const ACCESS_MODES = ['list', 'approved', 'denied', 'other-installation', 'other-account', 'update-required', 'withdrawn', 'down'];

const posix = (p) => (process.platform === 'win32' ? p.replace(/^([A-Za-z]):[\\/]/, (_m, d) => `/${d.toLowerCase()}/`).replace(/\\/g, '/') : p);

function findBash() {
  if (process.env.MOCK_BASH) return process.env.MOCK_BASH;
  if (process.platform === 'win32') {
    for (const c of ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe']) if (fs.existsSync(c)) return c;
  }
  return 'bash';
}

const html = (title, body, head = '') => `<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>\n`;

/** Apache's own 401 page */
const APACHE_401 = '<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">\n<html><head>\n<title>401 Unauthorized</title>\n</head><body>\n<h1>Unauthorized</h1>\n<p>This server could not verify that you\nare authorized to access the document\nrequested.  Either you supplied the wrong\ncredentials (e.g., bad password), or your\nbrowser doesn\'t understand how to supply\nthe credentials required.</p>\n</body></html>\n';

/** environment variables that mark an agent at the keyboard on the machine running the mock; a student's shell has none */
const AGENT_VARS = /^(CLAUDECODE|CLAUDE_CODE_ENTRYPOINT|HPCW_AGENT|[A-Z]+_(REQUEST_ID|WORKER|JOB))$/;

/** the site profile the lab's shared copy carries for Wayne State: the framework's own, with the keys framework 10 adds when the file does not have them yet */
function wayneProfile(sharedVirtual) {
  let p = {};
  for (const f of [path.resolve(here, '../../framework/profiles/wayne.json'), path.resolve(here, '../public/profiles/wayne.json')]) {
    try {
      p = JSON.parse(fs.readFileSync(f, 'utf8'));
      break;
    } catch {
      /* the next */
    }
  }
  const defaults = {
    site: 'wayne',
    scheduler: 'slurm',
    submit_host: 'warrior',
    shared_state_dir: '/rs/rs_grp_oschome/$USER/hpcworker',
    ood_base_url: 'https://ondemand.grid.wayne.edu',
    ood_shell_host: '',
    vpn_required: true,
    vpn_portal: 'protect.wayne.edu',
    vpn_app: 'GlobalProtect',
    ood_auth: 'http-basic',
    session_title: 'Wayne State grid',
    login_abandon_s: 1200,
    worker_defaults: { cpus: 2, mem: '8G', hours: 8, permission_mode: 'default', capacity: 4 },
  };
  return { schema_version: 1, ...defaults, ...p, ...Object.fromEntries(Object.entries(defaults).filter(([k]) => p[k] === undefined)), shared_install: sharedVirtual };
}

export async function createMockPortal(opts = {}) {
  const o = {
    host: '127.0.0.1',
    port: 0,
    user: 'student',
    home: undefined,
    /** "cookie" (10.0.0's mock) or "basic" (the live portal: Chrome's own sign-in box) */
    auth: 'cookie',
    /** the Basic password; undefined: MOCK_PASSWORD, else mockpass */
    password: undefined,
    /** the session cookie's SameSite: lax (10.0.0's mock), none (with Secure), strict */
    sameSite: 'lax',
    requireCookie: true,
    noClusters: false,
    rnode: 'disabled',
    uploads: true,
    cold: false,
    /** ms of no /pun/ traffic after which the next /pun/ request answers 500 once; 0 = never cold */
    coldPun: 0,
    jobComposer: false,
    shellHosts: ['default', 'login1', 'login2'],
    seedTool: true,
    /** with seedTool: set the stand-in up as the account's own copy (profile.json and VERSION), as a build before 8.0.0 left an account */
    seedInstalled: false,
    /** with sharedInstall (and a readable copy): the account already set up on the lab's shared copy, by the stand-in's own install --shared; seedTool is then ignored */
    seedShared: false,
    /** the virtual path of the lab's shared copy of the tool (framework 5 shared_install); undefined = the site keeps none */
    sharedInstall: undefined,
    /** false plays an account outside the lab's group: the Files routes answer 403 and bash cannot open the launcher */
    sharedReadable: true,
    /** the shared copy's VERSION */
    sharedVersion: '5',
    /** the home the seeded tool prints and writes into its status files in place of the real one; default: the virtual home */
    displayHome: undefined,
    /** the account names the access-service stand-in approves */
    approved: ['st1234'],
    /** answers past this many access checks are 429 (0 = no limit) */
    accessLimit: 0,
    /** installations already bound, {access_id: install_id}; the stand-in binds the rest as they first ask */
    seats: {},
    /** false plays the service with REQUIRE_INSTALL_ID "0": an approved account asking without an installation identifier is approved and bound to nothing */
    requireInstallId: true,
    /** the access stand-in's answer for every account: ACCESS_MODES; "list" is the per-account default above */
    accessMode: 'list',
    /** AM2: the account has no key the Shell can use; every shell asks for the password until login-setup has run */
    keyless: false,
    /** the Shell page: "stub" (10.0.0's: the token script only), "xterm" (a working terminal with the helper textarea), "hterm" (a working terminal without it); default xterm when keyless */
    terminal: undefined,
    /** each prompt sets the terminal title (OSC 0) as RHEL's bash does */
    shellTitle: true,
    /** each prompt turns bracketed paste on (bash 5.1 and later; CentOS 7's bash 4.2 does not) */
    bracketedPaste: false,
    /** OnDemand's inactivity limit, its maximum session and how often it looks (seconds) */
    shellIdleS: 300,
    shellMaxS: 3600,
    shellSweepS: 30,
    /** run the job clock (lib/jobsim.mjs) once a second */
    simulate: true,
    /** knobs of the stand-in tool, passed to the shell as MOCK_*; undefined keeps the server's own environment */
    queueS: undefined,
    queueReason: undefined,
    queueExpect: undefined,
    startS: undefined,
    signinWaitS: undefined,
    allocWaitS: undefined,
    codeWaitS: undefined,
    keepaliveS: undefined,
    plan: undefined,
    email: undefined,
    /** the account starts signed in to Claude (MOCK_LOGGED_IN); undefined keeps the environment's (default true) */
    claudeSignedIn: undefined,
    loginFail: undefined,
    codeReject: undefined,
    consent: undefined,
    sbatchFail: undefined,
    renewS: undefined,
    renewQueueS: undefined,
    abandonS: undefined,
    reconnectAfterS: undefined,
    tls: undefined,
    log: () => {},
    ...opts,
  };
  if (o.terminal === undefined) o.terminal = o.keyless ? 'xterm' : 'stub';
  const password = o.password ?? process.env.MOCK_PASSWORD ?? 'mockpass';
  const realHome = o.home ? path.resolve(o.home) : fs.mkdtempSync(path.join(os.tmpdir(), 'mock-ood-home-'));
  fs.mkdirSync(realHome, { recursive: true });
  const virtualHome = `/home/${o.user}`;
  const displayHome = o.displayHome ?? process.env.MOCK_DISPLAY_HOME ?? virtualHome;
  // Wayne State's state folder, inside the mock home's own folder on disk so a kept home keeps it
  const rsVirtual = `/rs/rs_grp_oschome/${o.user}`;
  const rsReal = path.join(mockStateDir(realHome), 'rs');
  fs.mkdirSync(rsReal, { recursive: true });
  // the lab's shared copy: a directory on disk beside the home, seeded with the stand-in tool
  // the option, else MOCK_SHARED_INSTALL in the server's environment (as MOCK_DISPLAY_HOME is read)
  const sharedOpt = o.sharedInstall ?? process.env.MOCK_SHARED_INSTALL;
  const sharedVirtual = sharedOpt ? String(sharedOpt).replace(/\/+$/, '') : undefined;
  // an outsider was never set up on the shared copy, so there is nothing to seed for one
  const seedShared = !!(o.seedShared && sharedVirtual && o.sharedReadable);
  if (o.seedTool && !seedShared) {
    const dir = path.join(realHome, '.hpcworker', 'bin');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(BIN, 'hpcworker'), path.join(dir, 'hpcworker'));
    if (o.seedInstalled) {
      // the account's own copy, as a build before 8.0.0 left it: the stand-in's own default profile, and the version the stand-in says it is
      const hw = path.join(realHome, '.hpcworker');
      const profile = path.join(hw, 'profile.json');
      if (!fs.existsSync(profile)) fs.writeFileSync(profile, `${JSON.stringify({ schema_version: 1, site: 'mock', scheduler: 'slurm', partition_cpu: 'secp', qos_cpu: 'secondary', shared_state_dir: '$HOME/.hpcworker/state', claude_config_dir: '$HOME/.claude', login_node_rules: { max_processes: 20, poll_floor_seconds: 60 }, worker_defaults: { cpus: 2, mem: '8G', hours: 8, permission_mode: 'default', capacity: 4 } })}\n`);
      const version = path.join(hw, 'VERSION');
      if (!fs.existsSync(version)) fs.writeFileSync(version, '1\n');
    }
  }
  let sharedReal;
  if (sharedVirtual) {
    // a kept home (--home) keeps its shared copy beside it, so the account's launcher still finds it after a restart
    sharedReal = o.home ? `${realHome}.shared` : fs.mkdtempSync(path.join(os.tmpdir(), 'mock-ood-shared-'));
    for (const d of ['bin', 'lib', 'jobs', 'profiles']) fs.mkdirSync(path.join(sharedReal, d), { recursive: true });
    fs.copyFileSync(path.join(BIN, 'hpcworker'), path.join(sharedReal, 'bin', 'hpcworker'));
    fs.writeFileSync(path.join(sharedReal, 'VERSION'), `${o.sharedVersion}\n`);
    fs.writeFileSync(path.join(sharedReal, 'README.md'), "The stand-in for the lab's shared copy of the tool (mock-ood).\n");
    fs.writeFileSync(path.join(sharedReal, 'profiles', 'mock.json'), `${JSON.stringify({ schema_version: 1, site: 'mock', scheduler: 'slurm', partition_cpu: 'secp', qos_cpu: 'secondary', shared_state_dir: '$HOME/.hpcworker/state', shared_install: sharedVirtual, claude_config_dir: '$HOME/.claude' })}\n`);
    fs.writeFileSync(path.join(sharedReal, 'profiles', 'wayne.json'), `${JSON.stringify(wayneProfile(sharedVirtual), null, 1)}\n`);
  }
  /** what bash is handed for the shared path: the directory, or, for an outsider, a path that is not there */
  const sharedForShell = sharedReal ? posix(o.sharedReadable ? sharedReal : `${sharedReal}.unreadable`) : undefined;
  const bash = findBash();
  /** the stand-in tool's knobs from the options; anything left undefined comes from the server's own environment */
  const knobs = Object.fromEntries(
    Object.entries({
      MOCK_QUEUE_S: o.queueS,
      MOCK_QUEUE_REASON: o.queueReason,
      MOCK_QUEUE_EXPECT: o.queueExpect,
      MOCK_START_S: o.startS,
      MOCK_SIGNIN_WAIT_S: o.signinWaitS,
      MOCK_ALLOC_WAIT_S: o.allocWaitS,
      MOCK_CODE_WAIT_S: o.codeWaitS,
      MOCK_KEEPALIVE_S: o.keepaliveS,
      MOCK_PLAN: o.plan,
      MOCK_EMAIL: o.email,
      MOCK_LOGGED_IN: o.claudeSignedIn === undefined ? undefined : String(!!o.claudeSignedIn),
      MOCK_LOGIN_FAIL: o.loginFail === undefined ? undefined : o.loginFail ? '1' : '0',
      MOCK_CODE_REJECT: o.codeReject,
      MOCK_CONSENT: o.consent === undefined ? undefined : String(!!o.consent),
      MOCK_SBATCH_FAIL: o.sbatchFail === undefined ? undefined : o.sbatchFail ? '1' : '0',
      MOCK_RENEW_S: o.renewS,
      MOCK_RENEW_QUEUE_S: o.renewQueueS,
      MOCK_ABANDON_S: o.abandonS,
      MOCK_RECONNECT_AFTER_S: o.reconnectAfterS,
    })
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
  /** the environment every command of the shell (and the setup at start) runs with */
  const toolEnv = (loginHost = 'login1') => {
    const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !AGENT_VARS.test(k)));
    return {
      ...base,
      ...knobs,
      HOME: posix(realHome),
      MOCK_HOME: realHome,
      MOCK_LIB: LIB,
      MOCK_BIN: posix(BIN),
      MOCK_NODE_DIR: posix(path.dirname(process.execPath)),
      MOCK_USER: o.user,
      MOCK_DISPLAY_HOME: displayHome,
      MOCK_BASH: bash,
      MOCK_TTY: '1',
      MOCK_LOGIN_HOST: loginHost,
      MOCK_ROOTS: JSON.stringify([{ v: rsVirtual, r: rsReal }, ...(sharedReal ? [{ v: sharedVirtual, r: sharedReal }] : [])]),
      MOCK_ROOTS_SH: `${rsVirtual}=${posix(rsReal)};`,
      SSH_CONNECTION: `${SSH_CLIENT} 52341 10.0.0.2 22`,
      ...(sharedVirtual ? { MOCK_SHARED_INSTALL: sharedVirtual, MOCK_SHARED_REAL: sharedForShell, MOCK_SHARED_REAL_WIN: sharedReal } : {}),
      USER: o.user,
      LOGNAME: o.user,
      TERM: 'xterm-16color',
      // Git for Windows' bash rewrites every "/..." value into "C:/Program Files/Git/..." when it starts a
      // native program (node, for lib/tool.mjs); the mock's own paths are cluster paths and must arrive as they are
      MSYS2_ENV_CONV_EXCL: 'MOCK_',
    };
  };
  if (seedShared) {
    // the account already set up on the lab's copy: the stand-in's own install --shared, run once, so
    // the launcher, the marker and the profile are exactly what the install the strip types would write
    const r = spawnSync(bash, ['-c', 'bash "$MOCK_SHARED_REAL/bin/hpcworker" install --shared "$MOCK_SHARED_REAL" --profile mock'], {
      env: toolEnv(),
      cwd: realHome,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60_000,
    });
    if (r.status !== 0) throw new Error(`mock-ood: setting the home up on the shared copy failed (exit ${r.status}): ${(r.stderr || r.stdout || r.error?.message || '').trim()}`);
  }
  const railsToken = crypto.randomBytes(32).toString('base64');
  const shellSecret = crypto.randomBytes(24).toString('base64url');
  const seats = Object.fromEntries(Object.entries(o.seats ?? {}).map(([k, v]) => [String(k).toLowerCase(), String(v).toLowerCase()]));
  const state = {
    coldDone: !o.cold,
    shells: 0,
    frames: 0,
    fatal: 0,
    coldHits: 0,
    punWarmUntil: 0,
    accessChecks: 0,
    accessBodies: [],
    accessHeaders: [],
    seats,
    conflicts: {},
    accessMode: o.accessMode,
    /** "{}" frames the shell took (parsed, ignored, not activity) */
    keepaliveFrames: 0,
    /** shells OnDemand's idle or maximum-time rule terminated */
    idleKills: 0,
    passwordPrompts: 0,
    passwordFailures: 0,
    /** lines that arrived at a password prompt and looked like a command (the setup line typed too early) */
    typedAtPasswordPrompt: 0,
    /** every request and WebSocket, newest last (at most 3000) */
    requests: [],
    /** every shell (at most 500) */
    shellLog: [],
    simulator: [],
  };
  const log = o.log;
  const note = (rec) => {
    state.requests.push(rec);
    if (state.requests.length > 3000) state.requests.splice(0, state.requests.length - 3000);
  };

  // the access-service stand-in: the D3 contract, byte for byte, with the one-installation rule of 8.0.0, so the extension's client is tested against it
  const accessHeaders = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  const accessJson = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...accessHeaders });
    res.end(JSON.stringify(body));
  };
  const accessCheck = async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...accessHeaders, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '600' });
      return res.end();
    }
    if (req.method !== 'POST') return accessJson(res, 405, { error: 'POST an access check here' });
    state.accessChecks++;
    state.accessHeaders.push({ 'content-type': req.headers['content-type'] ?? '', origin: req.headers.origin ?? '', cookie: req.headers.cookie ?? '' });
    if (o.accessLimit > 0 && state.accessChecks > o.accessLimit) return accessJson(res, 429, { error: 'too many requests from this connection today; try again tomorrow' });
    let j;
    try {
      j = JSON.parse((await readBody(req)).toString('utf8'));
    } catch {
      return accessJson(res, 400, { error: 'not JSON' });
    }
    if (!j || typeof j !== 'object' || j.v !== 1 || typeof j.access_id !== 'string' || typeof j.portal !== 'string' || j.product !== 'bridge' || typeof j.version !== 'string') return accessJson(res, 400, { error: 'the body needs v, access_id, portal, product and version' });
    if (j.install_id !== undefined && (typeof j.install_id !== 'string' || !/^[0-9a-f]{32}$/i.test(j.install_id))) return accessJson(res, 400, { error: 'install_id is the 32 hexadecimal characters the extension made when it was installed' });
    state.accessBodies.push(j);
    const id = j.access_id.toLowerCase();
    const no = (extra = {}) => accessJson(res, 200, { approved: false, access_id: id, requestPage: 'https://openspineconsortium.com/beethoven/request.html', ...extra });
    const yes = () => accessJson(res, 200, { approved: true, access_id: id, checked: new Date().toISOString(), until: null });
    switch (state.accessMode) {
      case 'approved':
        return yes();
      case 'denied':
      case 'withdrawn':
        return no();
      case 'other-installation':
        return no({ reason: 'other_installation' });
      case 'other-account':
        return no({ reason: 'other_account' });
      case 'update-required':
        return no({ reason: 'update_required' });
      case 'down':
        return accessJson(res, 503, { error: 'the access service is not answering (mock)' });
      default:
        break;
    }
    if (!o.approved.includes(id)) return no();
    // one approved account, one installation: the first to ask is bound; another is refused and counted, the seat unchanged;
    // and one installation, one account: an installation another account's seat names is refused for this one
    const install = typeof j.install_id === 'string' ? j.install_id.toLowerCase() : '';
    if (install) {
      if (!state.seats[id]) {
        if (Object.entries(state.seats).some(([other, bound]) => other !== id && bound === install)) return no({ reason: 'other_account' });
        state.seats[id] = install;
      } else if (state.seats[id] !== install) {
        state.conflicts[id] = (state.conflicts[id] ?? 0) + 1;
        return no({ reason: 'other_installation' });
      }
    } else if (o.requireInstallId) return no({ reason: 'update_required' });
    return yes();
  };

  // the shell app's tokens: salt-hash, verified against a per-process secret (the csrf module's shape)
  const shellToken = () => {
    const salt = crypto.randomBytes(8).toString('hex');
    return `${salt}-${crypto.createHash('sha1').update(`${salt}-${shellSecret}`).digest('hex')}`;
  };
  const shellTokenValid = (t) => {
    const m = /^([a-f0-9]+)-([a-f0-9]+)$/.exec(String(t ?? ''));
    return !!m && crypto.createHash('sha1').update(`${m[1]}-${shellSecret}`).digest('hex') === m[2];
  };

  /** the shared copy's virtual path onto its directory: undefined when outside it */
  const sharedToReal = (virtualPath) => {
    if (!sharedVirtual) return undefined;
    const v = decodeURIComponent(virtualPath);
    if (v !== sharedVirtual && !v.startsWith(`${sharedVirtual}/`)) return undefined;
    const real = path.resolve(sharedReal, v.slice(sharedVirtual.length).replace(/^\/+/, ''));
    if (real !== sharedReal && !real.startsWith(sharedReal + path.sep)) return undefined;
    return real;
  };

  /** a virtual path in the home or in the /rs state folder onto disk: undefined when outside both */
  const toReal = (virtualPath) => {
    const v = decodeURIComponent(virtualPath);
    for (const [vroot, rroot] of [
      [rsVirtual, rsReal],
      [virtualHome, realHome],
    ]) {
      if (v !== vroot && !v.startsWith(`${vroot}/`)) continue;
      const rel = v.slice(vroot.length).replace(/^\/+/, '');
      const real = path.resolve(rroot, rel);
      if (real !== rroot && !real.startsWith(rroot + path.sep)) return undefined;
      return real;
    }
    return undefined;
  };

  const hasCookie = (req) => !o.requireCookie || /(?:^|;\s*)mock_session=1(?:;|$)/.test(req.headers.cookie ?? '');
  /** the Basic credentials a request carries, as "good", "bad" or "none" */
  const basicState = (req) => {
    const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(req.headers.authorization ?? '');
    if (!m) return 'none';
    const [u, ...rest] = Buffer.from(m[1], 'base64').toString('utf8').split(':');
    return u === o.user && rest.join(':') === password ? 'good' : 'bad';
  };
  const authOf = (req) => (o.auth === 'basic' ? basicState(req) : hasCookie(req) ? (o.requireCookie ? 'cookie' : 'open') : 'none');
  const signedIn = (req) => (o.auth === 'basic' ? basicState(req) === 'good' : hasCookie(req));
  const serverOrigin = (req) => `${o.tls ? 'https' : 'http'}://${req.headers.host}`;
  const send = (res, status, body, headers = {}) => {
    const isHtml = typeof body === 'string' && body.startsWith('<!DOCTYPE');
    res.writeHead(status, { 'Content-Type': isHtml ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8', ...(isHtml ? { 'Content-Security-Policy': "frame-ancestors 'self'" } : {}), ...headers });
    res.end(body);
  };
  const redirect = (res, to) => {
    res.writeHead(302, { Location: to, 'Content-Type': 'text/html' });
    res.end(html('Redirecting', `<a href="${to}">Redirecting</a>`));
  };
  const unauthorized = (res) => {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="private"', 'Content-Type': 'text/html; charset=iso-8859-1', Server: 'Apache/2.4.34 (mock-ood)' });
    res.end(APACHE_401);
  };
  // Rails: request.origin.nil? || request.origin == request.base_url, then the token
  const railsWriteAllowed = (req) => {
    const origin = req.headers.origin;
    if (origin && origin !== serverOrigin(req)) return false;
    return req.headers['x-csrf-token'] === railsToken;
  };
  const invalidAuthenticity = (res) => send(res, 422, html('Error', '<h1>ActionController::InvalidAuthenticityToken</h1>'));
  const readBody = (req) =>
    new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });

  const dashboardHtml = () =>
    html(
      'Dashboard - Open OnDemand',
      `<meta name="csrf-param" content="authenticity_token" />\n<meta name="csrf-token" content="${railsToken}" />\n<nav class="navbar"><a class="navbar-brand" href="/pun/sys/dashboard/">Mock University OnDemand</a><ul class="navbar-nav"><li class="nav-item"><a class="nav-link" href="/pun/sys/dashboard/files/fs${virtualHome}">Files</a></li><li class="nav-item"><a class="nav-link" href="/pun/sys/dashboard/activejobs">Jobs</a></li><li class="nav-item"><a class="nav-link" href="/pun/sys/shell/ssh/default">Clusters</a></li><li class="nav-item dropdown"><a class="nav-link dropdown-toggle" href="#" id="navbarDropdown">Logged in as ${o.user}</a></li><li><a class="nav-link" href="/logout">Log Out</a></li></ul></nav>\n<main><h1>Mock University OnDemand</h1><p>Welcome to the mock portal.</p></main>\n<footer><p>Powered by <a href="https://openondemand.org/">Open OnDemand</a> version 4.2.5 (mock)</p></footer>`,
    );

  const startPageHtml = () =>
    html(
      'Open OnDemand',
      `<main style="font-family:sans-serif;max-width:640px;margin:10vh auto;text-align:center"><h1>Mock University OnDemand</h1><p>OnDemand provides an integrated, single access point for all of your HPC resources.</p><p><a class="btn btn-primary btn-lg" href="/pun/sys/dashboard" style="display:inline-block;padding:12px 28px;background:#1f4e79;color:#fff;text-decoration:none;border-radius:4px;font-weight:600">LOGIN TO ONDEMAND</a></p></main>`,
    );

  /** the inline script every Shell page carries: the WebSocket address with the token, as OOD's own page builds it */
  const urlScript = (host) => `\n  function get_url() {\n    var base = document.URL.replace(/^http/, 'ws').replace(/#.*$/, '');\n    var separator = '?';\n    if(base.includes('?')){ separator = '&'; }\n    return base + separator + "csrf=${shellToken()}";\n  }\n  var host = "${host}";\n`;

  /**
   * A working terminal page. kind "xterm": the input is xterm.js's helper textarea
   * (textarea.xterm-helper-textarea), which takes keydown, a paste event's text/plain and an input
   * event with inputType insertText, as xterm.js does; kind "hterm": a terminal whose input is
   * another element (an older OnDemand), so a page script finds no helper textarea. The title starts
   * as "Shell" and follows the shell's OSC 0 and 2 sequences.
   */
  const terminalPageHtml = (host, kind) => {
    const inputTag = kind === 'xterm' ? '<textarea class="xterm-helper-textarea" aria-label="Terminal input" aria-multiline="false" autocorrect="off" autocapitalize="off" spellcheck="false" tabindex="0"></textarea>' : '<textarea id="hterm-input" class="hterm-input" aria-label="Terminal input" autocorrect="off" autocapitalize="off" spellcheck="false" tabindex="0"></textarea>';
    const cls = kind === 'xterm' ? 'terminal xterm' : 'hterm';
    return `<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>Shell</title><style>html,body{margin:0;height:100%;background:#111;color:#ddd}#terminal{box-sizing:border-box;height:100%;overflow:auto;padding:8px;font:14px/1.35 Consolas,Menlo,monospace;cursor:text}#screen{margin:0;white-space:pre-wrap;word-break:break-all}#terminal textarea{position:absolute;left:-9999em;top:0;width:1px;height:1px;opacity:0}</style></head><body><div id="terminal" class="${cls}"><div class="${kind === 'xterm' ? 'xterm-screen' : 'hterm-screen'}"><pre id="screen"></pre></div>${inputTag}</div>\n<script>${urlScript(host)}
  (function () {
    var screen = document.getElementById('screen');
    var input = document.querySelector('#terminal textarea');
    var text = '';
    var pending = '';
    var bracketed = false;
    var ws = new WebSocket(get_url());
    function render() {
      if (text.length > 40000) text = text.slice(-30000);
      screen.textContent = text;
      var t = document.getElementById('terminal');
      t.scrollTop = t.scrollHeight;
    }
    function write(data) {
      data = pending + data;
      pending = '';
      for (var i = 0; i < data.length; i++) {
        var c = data[i];
        if (c === '\\x1b') {
          var rest = data.slice(i);
          var osc = /^\\x1b\\](\\d+);([^\\x07\\x1b]*)(\\x07|\\x1b\\\\)/.exec(rest);
          if (osc) { if (osc[1] === '0' || osc[1] === '2') document.title = osc[2]; i += osc[0].length - 1; continue; }
          var csi = /^\\x1b\\[([0-9;?]*)([ -\\/]*)([@-~])/.exec(rest);
          if (csi) { if (csi[1] === '?2004') bracketed = csi[3] === 'h'; i += csi[0].length - 1; continue; }
          if (rest.length < 256 && /^\\x1b[\\]\\[]/.test(rest)) { pending = rest; break; }
          continue;
        }
        if (c === '\\r') continue;
        if (c === '\\b') { text = text.slice(0, -1); continue; }
        text += c;
      }
      render();
    }
    function send(s) { if (ws.readyState === 1) ws.send(JSON.stringify({ input: s })); }
    input.addEventListener('keydown', function (e) {
      if (e.isComposing) return;
      var k = e.key, s = null;
      if ((e.ctrlKey || e.metaKey) && (k === 'v' || k === 'V')) return;
      if (k === 'Enter') s = '\\r';
      else if (k === 'Backspace') s = '\\x7f';
      else if (k === 'Tab') s = '\\t';
      else if (k === 'Escape') s = '\\x1b';
      else if (e.ctrlKey && !e.altKey && k.length === 1 && /[a-z]/i.test(k)) s = String.fromCharCode(k.toUpperCase().charCodeAt(0) - 64);
      else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) s = k;
      if (s !== null) { e.preventDefault(); send(s); }
    });
    input.addEventListener('input', function (e) {
      if (e.inputType === 'insertText' && e.data && !e.isComposing) send(e.data);
      input.value = '';
    });
    input.addEventListener('paste', function (e) {
      var t = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
      e.preventDefault();
      if (!t) return;
      t = t.replace(/\\r?\\n/g, '\\r');
      if (bracketed) t = '\\x1b[200~' + t + '\\x1b[201~';
      send(t);
      input.value = '';
    });
    document.getElementById('terminal').addEventListener('mouseup', function () { input.focus(); });
    ws.onmessage = function (ev) { write(typeof ev.data === 'string' ? ev.data : ''); };
    ws.onopen = function () { input.focus(); };
    ws.onclose = function (ev) { write('\\r\\n[the connection to the shell closed' + (ev.code && ev.code !== 1005 ? ' (' + ev.code + (ev.reason ? ': ' + ev.reason : '') + ')' : '') + ']\\r\\n'); };
    input.focus();
  })();
</script></body></html>\n`;
  };

  const shellPageHtml = (host) => (o.terminal === 'xterm' || o.terminal === 'hterm' ? terminalPageHtml(host, o.terminal) : html('Shell - Open OnDemand', `<div id="terminal"></div>\n<script>${urlScript(host)}</script>`));

  const listingJson = (virtualPath, real) => {
    const entries = fs.readdirSync(real, { withFileTypes: true });
    const files = [];
    for (const e of entries) {
      const full = path.join(real, e.name);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      const vp = `${virtualPath.replace(/\/$/, '')}/${e.name}`;
      files.push({
        id: `dev-${st.ino || 0}`,
        type: e.isDirectory() ? 'd' : 'f',
        name: e.name,
        url: `/pun/sys/dashboard/files/fs${vp}`,
        download_url: `/pun/sys/dashboard/files/fs${vp}?download=1`,
        edit_url: `/pun/sys/dashboard/files/edit/fs${vp}`,
        size: st.size,
        human_size: `${st.size} B`,
        modified_at: Math.floor(st.mtimeMs / 1000),
        owner: o.user,
        mode: st.mode,
      });
    }
    return {
      path: virtualPath,
      page_title: virtualPath,
      url: `/pun/sys/dashboard/files/fs${virtualPath}`,
      shell_url: `/pun/sys/shell/ssh/default${virtualPath}`,
      files_path: '/pun/sys/dashboard/files',
      ...(o.uploads ? { files_upload_path: '/pun/sys/dashboard/files/upload/fs' } : {}),
      filesystem: 'fs',
      files,
      time: 0.002,
    };
  };

  const loginSetupDone = () => {
    try {
      return fs
        .readFileSync(path.join(realHome, '.ssh', 'authorized_keys'), 'utf8')
        .split('\n')
        .some((l) => /\sbeethoven-login-setup\s/.test(` ${l} `) && (/from="([^"]*)"/.exec(l)?.[1] ?? '').split(',').includes(SSH_CLIENT));
    } catch {
      return false;
    }
  };

  const redact = (s) => s.replace(/([?&]csrf=)[^&]+/g, '$1[redacted]');

  /** the harness's view of the mock: /_mock/... (no sign-in; never part of a real portal) */
  const mockRoute = async (req, res, url) => {
    const p = url.pathname;
    const json = (body) => send(res, 200, JSON.stringify(body), { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    if (p === '/_mock/log') return json({ requests: state.requests, shells: state.shellLog });
    if (p === '/_mock/access') {
      const mode = url.searchParams.get('mode');
      if (mode) {
        if (!ACCESS_MODES.includes(mode)) return send(res, 400, JSON.stringify({ error: `mode is one of ${ACCESS_MODES.join(', ')}` }));
        state.accessMode = mode;
      }
      return json({ mode: state.accessMode });
    }
    if (p === '/_mock/reset' && req.method === 'POST') {
      state.requests.length = 0;
      state.shellLog.length = 0;
      return json({ ok: true });
    }
    if (p === '/_mock/state') {
      let schedulerCalls = 0;
      try {
        schedulerCalls = fs.readFileSync(path.join(mockStateDir(realHome), 'scheduler.log'), 'utf8').split('\n').filter(Boolean).length;
      } catch {
        /* none */
      }
      let claude = null;
      try {
        claude = JSON.parse(fs.readFileSync(path.join(mockStateDir(realHome), 'claude.json'), 'utf8'));
      } catch {
        /* never signed in through the mock */
      }
      return json({
        auth: o.auth,
        user: o.user,
        keyless: o.keyless,
        terminal: o.terminal,
        loginSetupDone: loginSetupDone(),
        accessMode: state.accessMode,
        shells: state.shells,
        frames: state.frames,
        keepaliveFrames: state.keepaliveFrames,
        idleKills: state.idleKills,
        passwordPrompts: state.passwordPrompts,
        passwordFailures: state.passwordFailures,
        typedAtPasswordPrompt: state.typedAtPasswordPrompt,
        accessChecks: state.accessChecks,
        accessBodies: state.accessBodies,
        fatal: state.fatal,
        schedulerCalls,
        claude,
        jobs: (await readJobs(realHome)).map((j) => ({ id: j.pbsid, status: j.status, name: j.jobname, kind: j.sim?.kind, phase: j.sim?.phase })),
        home: realHome,
        virtualHome,
        sharedInstall: sharedVirtual ?? null,
        simulator: state.simulator.slice(-50),
      });
    }
    return send(res, 404, JSON.stringify({ error: 'no such mock route' }));
  };

  async function handle(req, res) {
    const url = new URL(req.url, serverOrigin(req));
    const p = url.pathname;
    log(`${req.method} ${p}${url.search}`);
    if (!p.startsWith('/_mock/')) {
      const rec = { t: new Date().toISOString(), kind: 'http', method: req.method, path: redact(`${p}${url.search}`), auth: authOf(req), origin: req.headers.origin ?? '', site: req.headers['sec-fetch-site'] ?? '', mode: req.headers['sec-fetch-mode'] ?? '', status: 0 };
      res.on('finish', () => {
        rec.status = res.statusCode;
        note(rec);
      });
    }
    if (p.startsWith('/_mock/')) return mockRoute(req, res, url);
    if (p === '/public/start.html' || p === '/public' || p === '/public/') return send(res, 200, startPageHtml());
    if (p === '/login' && o.auth !== 'basic') {
      if (url.searchParams.get('go') === '1') {
        const ss = { none: 'None', lax: 'Lax', strict: 'Strict' }[String(o.sameSite).toLowerCase()] ?? 'Lax';
        const secure = o.tls || ss === 'None' ? '; Secure' : '';
        res.setHeader('Set-Cookie', `${COOKIE}=1; Path=/; HttpOnly; SameSite=${ss}${secure}`);
        return redirect(res, url.searchParams.get('redirect') || '/pun/sys/dashboard/');
      }
      return send(res, 200, html('Sign in - Mock IdP', `<h1>Mock University sign-in</h1><p>This stands in for your university's identity provider.</p><p><a href="/login?go=1&redirect=${encodeURIComponent(url.searchParams.get('redirect') || '/pun/sys/dashboard/')}">Sign in as ${o.user}</a></p>`));
    }
    if (p === '/logout' && o.auth !== 'basic') {
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0`);
      return redirect(res, '/login');
    }
    if (p === '/') return redirect(res, o.auth === 'basic' ? '/public/start.html' : '/pun/sys/dashboard/');
    // the access-service stand-in is not the portal: no portal cookie, CORS open, as Licensor's Worker answers
    if (p === '/beethoven/services.json') return send(res, 200, JSON.stringify({ access_check: `${serverOrigin(req)}/beethoven/access_check`, request_page: 'https://openspineconsortium.com/beethoven/request.html' }), { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=600' });
    if (p === '/beethoven/access_check') return accessCheck(req, res);
    // everything else sits behind the portal's authentication (Apache + Basic, or mod_auth_openidc's cookie)
    if (o.auth === 'basic') {
      if (!signedIn(req)) return unauthorized(res);
    } else if (!hasCookie(req)) return redirect(res, `/login?redirect=${encodeURIComponent(p)}`);
    if (p === '/nginx/init') {
      state.coldDone = true;
      return redirect(res, url.searchParams.get('redir') || '/pun/sys/dashboard/');
    }
    if (p.startsWith('/pun/') && !state.coldDone) return redirect(res, `/nginx/init?redir=${encodeURIComponent(p)}`);
    if (o.coldPun > 0 && p.startsWith('/pun/')) {
      // the PUN idled out: this one request meets the nginx that is still starting
      const now = Date.now();
      const cold = now > state.punWarmUntil;
      state.punWarmUntil = now + o.coldPun;
      if (cold) {
        state.coldHits++;
        return send(res, 500, html('Error', '<h1>Error: Server Error</h1><p>Something went wrong. Please try again in 30 seconds.</p>'));
      }
    }

    if (p === '/pun/sys/dashboard' || p === '/pun/sys/dashboard/') return send(res, 200, dashboardHtml());
    if (p === '/pun/sys/dashboard/files') return redirect(res, `/pun/sys/dashboard/files/fs${virtualHome}`);
    if (p === '/pun/sys/dashboard/projects') return send(res, 200, html('Projects - Open OnDemand', '<h1>Projects</h1>'));
    if (p === '/pun/sys/dashboard/activejobs' && req.method === 'GET') return send(res, 200, html('Active Jobs - Open OnDemand', '<h1>Active Jobs</h1>'));
    if (p === '/pun/sys/dashboard/activejobs.json') {
      const jobs = await readJobs(realHome);
      const filter = url.searchParams.get('jobfilter');
      const mine = (filter === 'user' ? jobs.filter((j) => j.username === o.user) : jobs).map(({ sim: _sim, ...j }) => j);
      return send(res, 200, JSON.stringify({ data: [mine], errors: o.noClusters ? ['No clusters configured for Active Jobs'] : [] }), { 'Cache-Control': 'no-store' });
    }
    if (p === '/pun/sys/dashboard/activejobs' && req.method === 'DELETE') {
      if (!railsWriteAllowed(req)) return invalidAuthenticity(res);
      // a client that follows the 302 with another DELETE (no pbsid) must not loop for ever
      if (!url.searchParams.get('pbsid')) return send(res, 400, html('Bad Request', '<h1>pbsid missing</h1>'));
      await removeJob(realHome, url.searchParams.get('pbsid'));
      return redirect(res, '/pun/sys/dashboard/activejobs');
    }
    if (p === '/pun/sys/myjobs/workflows.json') return o.jobComposer ? send(res, 200, '[]') : send(res, 404, html('Not Found', '<h1>Not Found</h1>'));
    if (p.startsWith('/pun/sys/dashboard/files/fs')) {
      const virtualPath = p.slice('/pun/sys/dashboard/files/fs'.length) || '/';
      const shared = sharedToReal(virtualPath);
      // the lab's copy: readable by members, never writable through the portal; an outsider gets 403 as on the lab volume
      if (shared && (!o.sharedReadable || req.method !== 'GET')) return send(res, 403, JSON.stringify({ error_message: o.sharedReadable ? "the lab's shared copy is read-only" : 'Permission denied' }));
      const real = shared ?? toReal(virtualPath);
      if (!real) return send(res, 403, JSON.stringify({ error_message: 'path not allowed by the mock (outside the virtual home)' }));
      if (req.method === 'GET') {
        if (!fs.existsSync(real)) {
          // the live Files app answers a download of a missing file with 200 and its own page (58,730 bytes measured)
          if (url.searchParams.has('download')) return send(res, 200, html('Files - Open OnDemand', `<div class="alert alert-danger">File not found: ${virtualPath}</div>${'<p>filler</p>\n'.repeat(400)}`));
          return send(res, 404, html('Not Found', `<h1>${virtualPath} does not exist</h1>`));
        }
        const st = fs.statSync(real);
        if (url.searchParams.has('download')) {
          if (st.isDirectory()) return send(res, 500, JSON.stringify({ error_message: 'zip download not implemented in the mock' }), { 'X-OOD-Failure-Reason': 'zip not implemented' });
          // read whole (a stream would hold the file open, and on Windows a writer's rename would then fail)
          const body = fs.readFileSync(real);
          res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length });
          return res.end(body);
        }
        const wantsJson = String(req.headers.accept ?? '').split(',').map((s) => s.trim()).includes('application/json');
        if (!st.isDirectory()) return wantsJson ? send(res, 200, JSON.stringify({ error_message: 'not a directory' })) : send(res, 200, html('File', `<pre>${virtualPath}</pre>`));
        return wantsJson ? send(res, 200, JSON.stringify(listingJson(virtualPath, real)), { 'Cache-Control': 'no-store' }) : send(res, 200, html('Files - Open OnDemand', `<h1>${virtualPath}</h1>`));
      }
      if (req.method === 'PUT') {
        if (!railsWriteAllowed(req)) return invalidAuthenticity(res);
        try {
          if (url.searchParams.get('dir') === 'true') {
            if (fs.existsSync(real)) return send(res, 500, JSON.stringify({ error_message: 'File exists' }));
            fs.mkdirSync(real);
          } else if (url.searchParams.get('touch') === 'true') {
            fs.closeSync(fs.openSync(real, 'a'));
          } else {
            const body = await readBody(req);
            fs.mkdirSync(path.dirname(real), { recursive: true });
            fs.writeFileSync(real, body);
          }
          return send(res, 200, '{}');
        } catch (e) {
          return send(res, 500, JSON.stringify({ error_message: e.message }));
        }
      }
    }
    if (p === '/pun/sys/shell' || p === '/pun/sys/shell/' || p === '/pun/sys/shell/ssh') return redirect(res, '/pun/sys/shell/ssh/default');
    const shell = /^\/pun\/sys\/shell\/ssh\/([^/?]+)/.exec(p);
    if (shell && req.method === 'GET') return send(res, 200, shellPageHtml(shell[1]));
    const rnode = /^\/rnode\/([^/]+)\/(\d+)(\/.*)?$/.exec(p);
    if (rnode) {
      if (o.rnode !== 'enabled') return send(res, 404, html('404 Not Found', '<h1>Not Found</h1><p>The requested URL was not found on this server.</p><hr><address>Apache/2.4 Server</address>'));
      return send(res, 503, html('503 Service Unavailable', `Failed to connect to ${rnode[1]}:${rnode[2]}`));
    }
    return send(res, 404, html('Not Found', '<h1>Not Found</h1>'));
  }

  const server = o.tls ? https.createServer({ cert: fs.readFileSync(o.tls.cert), key: fs.readFileSync(o.tls.key) }, (q, s) => void handle(q, s)) : http.createServer((q, s) => void handle(q, s));
  const wss = new WebSocketServer({ noServer: true });
  /** the open shells, for OnDemand's inactivity sweep */
  const live = new Set();

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, serverOrigin(req));
    const rec = { t: new Date().toISOString(), kind: 'ws', method: 'GET', path: redact(`${url.pathname}${url.search}`), auth: authOf(req), origin: req.headers.origin ?? '', site: '', mode: 'websocket', status: 0 };
    note(rec);
    if (o.auth === 'basic' && !signedIn(req)) {
      // Apache answers the handshake as it answers a page: 401 with the Basic challenge
      rec.status = 401;
      socket.write('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="private"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (o.auth !== 'basic' && !hasCookie(req)) {
      // Apache answers the upgrade with the sign-in redirect; the client sees a failed handshake
      rec.status = 302;
      socket.write('HTTP/1.1 302 Found\r\nLocation: /login\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const m = /^\/pun\/sys\/shell\/ssh\/([^/?]+)/.exec(url.pathname);
    if (!m) {
      rec.status = 404;
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    rec.status = 101;
    wss.handleUpgrade(req, socket, head, (ws) => connection(ws, req, m[1]));
  });

  function connection(ws, req, host) {
    state.shells++;
    const token = (req.url.match(/csrf=([^&]*)/) || [])[1];
    const clientOrigin = req.headers.origin;
    const origin = serverOrigin(req);
    const rec = { id: state.shells, host, origin: clientOrigin ?? '', opened: new Date().toISOString(), closed: null, closeCode: null, closeReason: '', ended: '', password: 'none', lines: [], inputFrames: 0, keepalives: 0, bytesToCommand: 0 };
    state.shellLog.push(rec);
    if (state.shellLog.length > 500) state.shellLog.splice(0, state.shellLog.length - 500);
    // the four gates, in app.js order, each closing with 3146 and its exact reason string. The origin
    // rule is OnDemand's: an Origin is refused only when it starts with "http" and differs from the
    // portal's own (an extension's chrome-extension://... Origin passes, as on the live portal)
    let authError = null;
    if (o.noClusters) authError = 'No clusters defined.';
    else if (clientOrigin && clientOrigin.startsWith('http') && origin && clientOrigin !== origin) authError = 'Invalid Origin.';
    else if (!shellTokenValid(token)) authError = 'Bad CSRF Token.';
    else if (!o.shellHosts.includes(host)) authError = `Host "${host}" not specified in allowlist or cluster configs.`;
    if (authError) {
      log(`shell refused: ${authError}`);
      rec.closed = new Date().toISOString();
      rec.closeCode = 3146;
      rec.closeReason = authError;
      ws.close(3146, authError);
      return;
    }
    const realHost = host === 'default' ? 'login1' : host;
    const entry = { ws, rec, last: Date.now(), started: Date.now() };
    live.add(entry);
    const out = (s) => {
      if (ws.readyState === 1) {
        ws.send(s);
        entry.last = Date.now();
      }
    };
    /** ssh ending: OnDemand's term.onExit closes the socket with no code */
    const hangUp = (why) => {
      rec.ended = why;
      if (ws.readyState === 0 || ws.readyState === 1) ws.close();
    };
    const prompt = () => out(`${o.shellTitle ? `\x1b]0;${o.user}@${realHost}:~\x07` : ''}${o.bracketedPaste ? '\x1b[?2004h' : ''}[${o.user}@${realHost} ~]$ `);
    let line = '';
    let child = null;
    let childEcho = true;
    let inPaste = false;
    const env = toolEnv(realHost);
    const greet = () => {
      out(`Last login: ${new Date().toUTCString()} from ${SSH_CLIENT}\r\n`);
      prompt();
    };
    // the keyless account: ssh asks for the password until login-setup has run
    let phase = o.keyless && !loginSetupDone() ? 'password' : 'shell';
    let tries = 0;
    const askPassword = () => out(`${o.user}@${realHost}'s password: `);
    if (phase === 'password') {
      rec.password = 'asked';
      state.passwordPrompts++;
      askPassword();
    } else greet();

    const runLine = (l) => {
      if (!l.trim()) return prompt();
      if (/^\s*exit(\s+\d+)?\s*$/.test(l)) return hangUp('exit');
      rec.lines.push(redact(l).slice(0, 600));
      // a line naming the lab's shared copy runs against its directory on disk (or, for an outsider, a path that is not there)
      const cmd = sharedVirtual ? l.split(sharedVirtual).join(sharedForShell) : l;
      // the sign-in sittings run with echo off (the pasted code is never shown)
      childEcho = !/hpcworker'?\s+(connect|claude\s+login)\b/.test(l);
      const replaces = /^\s*exec\s/.test(l);
      if (o.bracketedPaste) out('\x1b[?2004l');
      child = spawn(bash, ['-c', `export PATH="$MOCK_BIN:$MOCK_NODE_DIR:$PATH"; cd "$HOME"\n${cmd}`], { env, cwd: realHome, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      const pipe = (s) => s.on('data', (d) => out(d.toString('utf8').replace(/\r?\n/g, '\r\n')));
      pipe(child.stdout);
      pipe(child.stderr);
      child.stdin.on('error', () => {});
      child.on('close', () => {
        child = null;
        // a trailing `exit` ends the login shell, and an `exec` line replaced it: either ends the ssh, which closes the socket
        if (replaces) hangUp('exec');
        else if (/(^|[;&|]\s*)exit(\s+\d+)?\s*$/.test(l.trim())) hangUp('exit');
        else prompt();
      });
      child.on('error', (e) => out(`bash: ${e.message}\r\n`));
    };
    // a line typed while a command runs is that command's standard input (the pasted code of a sign-in)
    const feedChild = (l) => {
      rec.bytesToCommand += l.length + 1;
      try {
        child.stdin.write(`${l}\n`);
      } catch {
        /* the command ended first */
      }
    };
    const enterPassword = (pw) => {
      out('\r\n');
      if (pw === password) {
        phase = 'shell';
        rec.password = 'accepted';
        greet();
        return;
      }
      tries++;
      state.passwordFailures++;
      // a command line arriving at the password prompt: something typed before the shell was up
      if (/hpcworker|login-setup|\s/.test(pw)) state.typedAtPasswordPrompt++;
      if (tries >= 3) {
        rec.password = 'refused';
        out(`${o.user}@${realHost}: Permission denied (publickey,gssapi-keyex,gssapi-with-mic,password).\r\n`);
        return hangUp('password');
      }
      out('Permission denied, please try again.\r\n');
      askPassword();
    };
    ws.on('message', (msg, isBinary) => {
      state.frames++;
      let m;
      try {
        m = JSON.parse(isBinary ? msg.toString('utf8') : msg.toString());
      } catch {
        // the real app.js does JSON.parse(msg) with no try: this would take the process down
        state.fatal++;
        log('FATAL: a non-JSON frame reached the shell; the real app would have crashed');
        ws.close(1011, 'non-JSON frame (the real shell app would have crashed)');
        return;
      }
      if (m && typeof m.input === 'string' && m.input) {
        rec.inputFrames++;
        entry.last = Date.now();
        let s = m.input;
        // bracketed paste: the markers go, and a newline inside the paste is part of the line, not Enter
        s = s.replace(/\x1b\[200~/g, () => ((inPaste = true), '')).replace(/\x1b\[201~/g, () => ((inPaste = false), ''));
        for (const ch of s) {
          if (phase === 'password') {
            if (ch === '\r' || ch === '\n') {
              const pw = line;
              line = '';
              enterPassword(pw);
            } else if (ch === '\x03') {
              out('^C\r\n');
              hangUp('interrupted');
              return;
            } else if (ch === '\x7f' || ch === '\b') line = line.slice(0, -1);
            else line += ch; // never echoed
            continue;
          }
          if ((ch === '\r' || ch === '\n') && !inPaste) {
            out('\r\n');
            const l = line;
            line = '';
            if (child) feedChild(l);
            else runLine(l);
          } else if (ch === '\x03' && child) {
            child.kill();
          } else if (ch === '\x7f' || ch === '\b') {
            line = line.slice(0, -1);
            if (!child || childEcho) out('\b \b');
          } else {
            line += ch === '\r' ? '\n' : ch;
            if (!child || childEcho) out(ch);
          }
        }
      } else if (m && !m.input && !m.resize) {
        // "{}": OnDemand parses it and does nothing, and it is no activity
        state.keepaliveFrames++;
        rec.keepalives++;
      }
      if (m && m.resize) {
        /* accepted and ignored, as a PTY resize would be */
      }
    });
    ws.on('close', (code, reason) => {
      live.delete(entry);
      rec.closed = new Date().toISOString();
      rec.closeCode ??= code;
      rec.closeReason ||= String(reason ?? '');
      if (child) child.kill();
    });
  }

  // OnDemand's sweep: a shell idle past the limit or older than the maximum is terminated (the client sees 1006)
  const sweep = setInterval(
    () => {
      const now = Date.now();
      for (const e of live) {
        const idle = now - e.last > o.shellIdleS * 1000;
        const old = now - e.started > o.shellMaxS * 1000;
        if (idle || old) {
          state.idleKills++;
          e.rec.ended = idle ? 'idle' : 'max';
          live.delete(e);
          e.ws.terminate();
        }
      }
    },
    Math.max(200, o.shellSweepS * 1000),
  );
  sweep.unref();

  // the job clock: framework 10's worker jobs move through the line, the start and online
  let ticking = false;
  const clock = o.simulate
    ? setInterval(async () => {
        if (ticking) return;
        ticking = true;
        try {
          const jobs = await readJobs(realHome);
          if (jobs.some((j) => j.sim?.kind === 'worker')) {
            const changed = await advance(realHome);
            for (const c of changed) {
              state.simulator.push(`${new Date().toISOString()} ${c}`);
              log(`job clock: ${c}`);
            }
            if (state.simulator.length > 500) state.simulator.splice(0, state.simulator.length - 500);
          }
        } catch (e) {
          log(`job clock: ${e.message}`);
        } finally {
          ticking = false;
        }
      }, 1000)
    : undefined;
  clock?.unref();

  await new Promise((resolve) => server.listen(o.port, o.host, resolve));
  const port = server.address().port;
  const origin = `${o.tls ? 'https' : 'http'}://${o.host === '0.0.0.0' ? 'localhost' : o.host}:${port}`;
  return {
    origin,
    port,
    home: realHome,
    virtualHome,
    displayHome,
    user: o.user,
    approved: o.approved,
    railsToken,
    state,
    cookie: `${COOKIE}=1`,
    /** the Authorization header of a signed-in request in auth basic */
    basicAuth: `Basic ${Buffer.from(`${o.user}:${password}`).toString('base64')}`,
    auth: o.auth,
    /** the lab's shared copy as the portal shows it (the virtual path), when the mock keeps one */
    sharedInstall: sharedVirtual,
    /** the directory on disk behind it */
    sharedDir: sharedReal,
    /** Wayne State's state folder as the portal shows it, and where it is on disk */
    rsRoot: { virtual: rsVirtual, dir: rsReal },
    async close() {
      clearInterval(sweep);
      if (clock) clearInterval(clock);
      for (const c of wss.clients) c.terminate();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/** where the CLI keeps the lab's shared copy when neither --shared-install PATH nor MOCK_SHARED_INSTALL names one */
export const DEFAULT_SHARED_INSTALL = '/lab/shared/hpcworker/current';

/**
 * The options the CLI starts the mock with, from its arguments and environment. Exported so the
 * test of the store reviewer's recipe starts exactly what the recipe's command line starts.
 * The lab's shared copy is always there; the home is set up on it unless another home is asked for.
 * The stand-in tool's knobs (MOCK_QUEUE_S and the rest) reach it through the server's environment.
 */
export function cliOptions(a, env = process.env) {
  const val = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
  const n = (k, envName, d) => {
    const v = Number(val(k, env[envName] ?? d));
    return Number.isFinite(v) ? v : d;
  };
  // --shared-install takes an optional path: the next argument unless it is another flag
  const sharedArg = a.includes('--shared-install') ? (val('--shared-install', '') ?? '') : undefined;
  const sharedInstall = sharedArg && !sharedArg.startsWith('--') ? sharedArg : env.MOCK_SHARED_INSTALL || DEFAULT_SHARED_INSTALL;
  const ownCopy = a.includes('--own-copy');
  const sharedReadable = !a.includes('--shared-unreadable');
  const keyless = a.includes('--keyless') || env.MOCK_SHELL_KEYLESS === '1';
  return {
    port: Number(val('--port', 8080)),
    host: val('--host', '127.0.0.1'),
    home: val('--home', undefined),
    displayHome: val('--display-home', undefined),
    user: val('--user', 'student'),
    auth: String(val('--auth', env.MOCK_AUTH || 'cookie')).toLowerCase() === 'basic' ? 'basic' : 'cookie',
    password: val('--password', env.MOCK_PASSWORD || undefined),
    sameSite: String(val('--samesite', env.MOCK_SAMESITE || 'lax')).toLowerCase(),
    approved: String(val('--approve', 'st1234')).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    accessLimit: Number(val('--access-limit', 0)) || 0,
    accessMode: val('--access', env.MOCK_ACCESS || 'list'),
    // --seat st1234=<32 hex>[,id=install]: an installation already bound, so the next one to ask is refused
    seats: Object.fromEntries(String(val('--seat', '')).split(',').map((s) => s.trim().toLowerCase().split('=')).filter((kv) => kv.length === 2 && kv[0] && kv[1])),
    requireInstallId: !a.includes('--install-optional'),
    rnode: val('--rnode', 'disabled'),
    noClusters: a.includes('--no-clusters'),
    cold: a.includes('--cold'),
    coldPun: Number(val('--cold-pun', 0)) || 0,
    requireCookie: !a.includes('--no-cookie'),
    jobComposer: a.includes('--job-composer'),
    sharedInstall,
    sharedReadable,
    sharedVersion: val('--shared-version', '5'),
    // the reviewer's recipe: the home already set up on the shared copy, unless another home is asked for
    seedShared: sharedArg === undefined && !a.includes('--fresh-home') && !ownCopy && sharedReadable,
    // the stand-in in the account only as its own copy (--own-copy); every other home starts empty or on the shared copy
    seedTool: ownCopy,
    seedInstalled: ownCopy,
    keyless,
    terminal: val('--terminal', env.MOCK_TERMINAL || undefined),
    shellTitle: !a.includes('--no-shell-title') && env.MOCK_SHELL_TITLE !== '0',
    bracketedPaste: a.includes('--bracketed-paste') || env.MOCK_BRACKETED_PASTE === '1',
    shellIdleS: n('--shell-idle', 'MOCK_SHELL_IDLE_S', 300),
    shellMaxS: n('--shell-max', 'MOCK_SHELL_MAX_S', 3600),
    shellSweepS: n('--shell-sweep', 'MOCK_SHELL_SWEEP_S', 30),
    queueS: val('--queue', undefined),
    queueReason: val('--queue-reason', undefined),
    tls: a.includes('--cert') ? { cert: val('--cert'), key: val('--key') } : undefined,
  };
}

// CLI: node mock-ood/server.mjs [--port N] [--host H] [--home DIR] [--display-home DIR] [--user NAME] [--auth basic|cookie] [--password P] [--samesite lax|none|strict] [--approve a,b] [--access MODE] [--access-limit N] [--seat id=install] [--install-optional] [--rnode enabled] [--no-clusters] [--cold] [--cold-pun MS] [--no-cookie] [--job-composer] [--shared-install [PATH]] [--shared-version N] [--shared-unreadable] [--fresh-home] [--own-copy] [--keyless] [--terminal stub|xterm|hterm] [--no-shell-title] [--bracketed-paste] [--shell-idle S] [--shell-max S] [--shell-sweep S] [--queue S] [--queue-reason R] [--cert F --key F]
// The environment carries the same switches (MOCK_AUTH, MOCK_PASSWORD, MOCK_SAMESITE, MOCK_ACCESS, MOCK_SHELL_KEYLESS, MOCK_TERMINAL, MOCK_SHELL_IDLE_S, ...) and the stand-in tool's knobs (MOCK_QUEUE_S, MOCK_QUEUE_REASON, MOCK_START_S, MOCK_SIGNIN_WAIT_S, MOCK_CODE_WAIT_S, MOCK_PLAN, MOCK_LOGGED_IN, MOCK_LOGIN_FAIL, ...).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opts = cliOptions(a);
  const portal = await createMockPortal({ ...opts, log: (s) => console.log(`  ${s}`) });
  const home = opts.seedShared
    ? "set up on the lab's shared copy (launcher, marker, profile), as after the install the strip types; the strip runs no install"
    : opts.seedInstalled
      ? "the stand-in as the account's own copy, as a build before 8.0.0 left it"
      : `not set up (Beethoven sets it up when the site's bundled profile names ${portal.sharedInstall}: open the mock at https://ondemand.wayne.localhost:${portal.port} for wayne with --shared-install /rs/rs_grp_oschome/shared/beethoven/hpcworker/current; otherwise it says the lab's shared copy is needed)`;
  console.log(`mock Open OnDemand portal at ${portal.origin}`);
  console.log(opts.auth === 'basic' ? `  sign in:   the browser's own sign-in box (HTTP Basic, realm "private"): ${portal.user} / ${opts.password ? '(--password)' : 'mockpass'}; ${portal.origin}/ answers 302 to /public/start.html` : `  sign in:   ${portal.origin}/login   (then the dashboard is ${portal.origin}/pun/sys/dashboard/); cookie SameSite=${opts.sameSite}`);
  console.log(`  home dir:  ${portal.home}  (shown to the extension as ${portal.virtualHome}; the seeded tool prints it as ${portal.displayHome}; ${portal.rsRoot.virtual} is ${portal.rsRoot.dir})`);
  console.log(`  shared:    ${portal.sharedDir} (the lab's shared copy of the stand-in tool, shown as ${portal.sharedInstall}${opts.sharedReadable ? '' : '; this account cannot read it'})`);
  console.log(`  tool:      ${home}`);
  console.log(`  user:      ${portal.user}`);
  console.log(`  shell:     ${portal.origin}/pun/sys/shell/ssh/default${opts.keyless ? ' (keyless: asks for the password until hpcworker login-setup has run)' : ''}; idle limit ${opts.shellIdleS} s`);
  console.log(`  queue:     ${process.env.MOCK_QUEUE_S || opts.queueS || 0} s in line (${process.env.MOCK_QUEUE_REASON || opts.queueReason || 'Priority'}) for a worker framework 10 submits`);
  console.log(`  access:    ${portal.origin}/beethoven/access_check (tests only; ${opts.accessMode === 'list' ? `approves ${portal.approved.join(', ') || 'nobody'}, one installation each${Object.keys(portal.state.seats).length ? `; already bound: ${Object.keys(portal.state.seats).join(', ')}` : ''}${opts.requireInstallId ? '' : '; a check without an installation identifier is approved'}` : `answers "${opts.accessMode}" for everyone`}); /_mock/access?mode= changes it`);
  console.log(`  harness:   ${portal.origin}/_mock/log and /_mock/state`);
  console.log('  Ctrl-C to stop');
}
