#!/usr/bin/env node
// The mock portal by itself, without the extension: every route and mode Beethoven 11.0.0 relies on,
// checked against docs/V11_CONTRACT.md with the extension's own parsers and command builders
// (src/core/contract.ts, imported as TypeScript). Prints one PASS or FAIL line per check and exits 1 on
// any FAIL.
//
//   node e2e/mock-selftest.mjs                 every section but the long sitting (about 3 minutes)
//   node e2e/mock-selftest.mjs --only keyless  one section (basic, cookie, origin, idle, connect, queue,
//                                              failures, clock, keyless, terminal, access, legacy)
//   node e2e/mock-selftest.mjs --long          also the 11-minute sitting, code pasted at 10:30 (AM4, D32)
//
// The terminal section loads the Shell page in Playwright's Chromium (headless; PLAYWRIGHT_DIR or the
// scratchpad copy) and types into it from an isolated world, as Beethoven's page script would.
import { register } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import { createMockPortal } from '../mock-ood/server.mjs';

register('./lib/ts-hooks.mjs', import.meta.url);
const C = await import('../src/core/contract.ts');

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const LONG = args.includes('--long');
const SHARED_WAYNE = '/rs/rs_grp_oschome/shared/beethoven/hpcworker/current';
const INSTALL = '0123456789abcdef0123456789abcdef';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ANSI = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[()][A-Za-z0-9]|\r/g;
const clean = (s) => s.replace(ANSI, '');

let passed = 0;
let failed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) passed++;
  else {
    failed++;
    failures.push(name);
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
}

const authHeaders = (m) => (m.auth === 'basic' ? { Authorization: m.basicAuth } : { Cookie: m.cookie });

async function get(m, p, headers = authHeaders(m), init = {}) {
  return fetch(`${m.origin}${p}`, { redirect: 'manual', headers, ...init });
}

/** a shell as the extension's background opens one: the page for the token, then the socket */
async function openShell(m, { origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', host = 'default', headers = authHeaders(m) } = {}) {
  const page = await (await get(m, `/pun/sys/shell/ssh/${host}`, headers)).text();
  const csrf = /csrf=([^"]+)"/.exec(page)?.[1];
  const ws = new WebSocket(`${m.origin.replace(/^http/, 'ws')}/pun/sys/shell/ssh/${host}?csrf=${csrf}`, { headers: { ...headers, ...(origin ? { Origin: origin } : {}) } });
  let raw = '';
  const closed = new Promise((resolve) => {
    ws.on('close', (code, reason) => resolve({ code, reason: String(reason) }));
    ws.on('unexpected-response', (_req, res) => resolve({ code: -1, status: res.statusCode, headers: res.headers }));
    ws.on('error', () => {});
  });
  ws.on('message', (d) => (raw += d.toString()));
  const opened = await Promise.race([new Promise((r) => ws.on('open', () => r(true))), closed.then(() => false), sleep(10_000).then(() => false)]);
  const sh = {
    ws,
    opened,
    closed,
    get raw() {
      return raw;
    },
    get text() {
      return clean(raw);
    },
    send: (obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj)),
    type: (s) => ws.readyState === 1 && ws.send(JSON.stringify({ input: s })),
    async waitFor(re, ms = 15_000, from = 0) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        const m2 = re.exec(clean(raw).slice(from));
        if (m2) return m2;
        if (ws.readyState > 1) break;
        await sleep(50);
      }
      return re.exec(clean(raw).slice(from)) ?? undefined;
    },
    /** type one line at the prompt and return what it printed before the next prompt */
    async run(line, ms = 30_000) {
      const from = clean(raw).length;
      sh.type(`${line}\r`);
      const got = await sh.waitFor(/\n([\s\S]*?)\[\S+@\S+ ~\]\$ $/, ms, from);
      return got ? got[1].replace(/\n$/, '') : `(no prompt within ${ms} ms) ${clean(raw).slice(from)}`;
    },
    close: () => ws.close(),
  };
  return sh;
}

/** each line a connect sitting prints, parsed by the extension's own parser, until the socket closes */
async function connectTranscript(m, line, { onEvent, ms = 120_000 } = {}) {
  const sh = await openShell(m);
  await sh.waitFor(/\$ $/, 10_000);
  const events = [];
  let seen = 0;
  const from = sh.text.length;
  sh.type(`${line}\r`);
  const t0 = Date.now();
  let end;
  sh.closed.then((c) => (end = c));
  while (Date.now() - t0 < ms) {
    const lines = sh.text.slice(from).split('\n');
    const whole = end ? lines : lines.slice(0, -1);
    for (; seen < whole.length; seen++) {
      const ev = C.parseConnectLine(whole[seen]);
      if (ev) {
        events.push({ ...ev, at: Date.now() - t0 });
        await onEvent?.(ev, sh, events);
      }
    }
    if (end) break;
    await sleep(50);
  }
  return { events, close: await Promise.race([sh.closed, sleep(2000).then(() => undefined)]), text: sh.text.slice(from), sh };
}

const steps = (events) => events.filter((e) => e.kind === 'step').map((e) => e.step);
const readOn = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};
const statusOf = (m, name = 'worker', rs = true) => JSON.parse(readOn(path.join(rs ? m.rsRoot.dir : path.join(m.home, '.hpcworker', 'state'), ...(rs ? ['hpcworker'] : []), name, 'status.json')) ?? 'null');
const runDirOf = (m, name = 'worker', rs = true) => path.join(rs ? path.join(m.rsRoot.dir, 'hpcworker') : path.join(m.home, '.hpcworker', 'state'), name);
async function until(fn, ms, every = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(every);
  }
  return fn();
}
const section = (name) => !only || only === name;
const mocks = [];
async function mock(opts) {
  const m = await createMockPortal({ port: 0, user: 'st1234', ...opts });
  mocks.push(m);
  return m;
}

// ---- basic: the live portal's sign-in, the start page, the CSP header --------------------------------
if (section('basic')) {
  console.log('\n# HTTP Basic (MOCK_AUTH=basic), as the live portal answered on 2026-10-01');
  const m = await mock({ auth: 'basic', sharedInstall: SHARED_WAYNE });
  const root = await fetch(`${m.origin}/`, { redirect: 'manual' });
  check('GET / answers 302 to /public/start.html without credentials', root.status === 302 && root.headers.get('location') === '/public/start.html', `${root.status} ${root.headers.get('location')}`);
  const start = await fetch(`${m.origin}/public/start.html`);
  const startText = await start.text();
  check('the start page is public and carries "LOGIN TO ONDEMAND" to the dashboard', start.status === 200 && /href="\/pun\/sys\/dashboard"[^>]*>LOGIN TO ONDEMAND</.test(startText));
  const none = await fetch(`${m.origin}/pun/sys/dashboard/`, { redirect: 'manual' });
  check('the dashboard without credentials: 401 with WWW-Authenticate: Basic realm="private"', none.status === 401 && none.headers.get('www-authenticate') === 'Basic realm="private"', `${none.status} ${none.headers.get('www-authenticate')}`);
  check("the 401 body is Apache's own page", /<title>401 Unauthorized<\/title>/.test(await none.text()));
  const bad = await fetch(`${m.origin}/pun/sys/dashboard/`, { headers: { Authorization: `Basic ${Buffer.from('st1234:wrong').toString('base64')}` } });
  check('a wrong password: 401 again', bad.status === 401);
  const other = await fetch(`${m.origin}/pun/sys/dashboard/`, { headers: { Authorization: `Basic ${Buffer.from('zz9999:mockpass').toString('base64')}` } });
  check('another account name: 401', other.status === 401);
  const good = await get(m, '/pun/sys/dashboard/');
  const dash = await good.text();
  check('the dashboard signed in: 200, "Logged in as st1234", the form token', good.status === 200 && dash.includes('Logged in as st1234') && /<meta name="csrf-token" content="[^"]+"/.test(dash));
  check("HTML pages carry Content-Security-Policy: frame-ancestors 'self'", good.headers.get('content-security-policy') === "frame-ancestors 'self'", good.headers.get('content-security-policy'));
  const fav = await fetch(`${m.origin}/favicon.ico`);
  check('every other path sits behind the sign-in too (favicon 401)', fav.status === 401);
  const files = await get(m, `/pun/sys/dashboard/files/fs/home/st1234`, { ...authHeaders(m), Accept: 'application/json' });
  const listing = await files.json();
  check('the Files listing of the home answers JSON when signed in', files.status === 200 && Array.isArray(listing.files) && listing.path === '/home/st1234');
  const rs = await get(m, `/pun/sys/dashboard/files/fs/rs/rs_grp_oschome/st1234`, { ...authHeaders(m), Accept: 'application/json' });
  check("Wayne State's state folder /rs/rs_grp_oschome/st1234 is served by the Files routes", rs.status === 200 && (await rs.json()).path === '/rs/rs_grp_oschome/st1234');
  const missing = await get(m, `/pun/sys/dashboard/files/fs/home/st1234/nothing.json?download=1`);
  check('a missing download answers 200 with an HTML page (the live Files app)', missing.status === 200 && /text\/html/.test(missing.headers.get('content-type') ?? ''));
  const shared = await get(m, `/pun/sys/dashboard/files/fs${SHARED_WAYNE}/profiles/wayne.json?download=1`);
  const wp = JSON.parse(await shared.text());
  check("the lab's shared copy carries the Wayne State profile with framework 10's keys", wp.site === 'wayne' && wp.session_title === 'Wayne State grid' && wp.shared_install === SHARED_WAYNE && wp.shared_state_dir === '/rs/rs_grp_oschome/$USER/hpcworker' && wp.login_abandon_s === 1200, `${wp.session_title} ${wp.shared_install}`);
  const noAuthWs = await openShell(m, { headers: {} });
  const c401 = await noAuthWs.closed;
  check('the shell handshake without credentials: 401 with the Basic challenge', !noAuthWs.opened && c401.status === 401 && c401.headers?.['www-authenticate'] === 'Basic realm="private"', JSON.stringify({ status: c401.status }));
  const ok = await openShell(m);
  await ok.waitFor(/\$ $/, 10_000);
  check('the shell handshake with the browser-added Basic credentials opens, an extension Origin passes', ok.opened && /\[st1234@login1 ~\]\$ $/.test(ok.text));
  check('each prompt sets the title as RHEL bash does: ESC ] 0 ; st1234@login1:~ BEL', ok.raw.includes('\x1b]0;st1234@login1:~\x07'));
  check('the shell carries SSH_CONNECTION from the OnDemand server (10.0.0.1)', /^10\.0\.0\.1 52341 10\.0\.0\.2 22$/m.test(await ok.run('echo "$SSH_CONNECTION"')));
  check("no agent marker of this machine reaches the student's shell", (await ok.run('echo "[${CLAUDECODE:-}${CLAUDE_CODE_ENTRYPOINT:-}]"')).includes('[]'));
  ok.close();
  const reqs = (await (await fetch(`${m.origin}/_mock/log`)).json()).requests;
  check('/_mock/log records each request with the sign-in it carried and the answer', reqs.some((r) => r.path === '/pun/sys/dashboard/' && r.auth === 'none' && r.status === 401) && reqs.some((r) => r.path === '/pun/sys/dashboard/' && r.auth === 'good' && r.status === 200) && reqs.some((r) => r.kind === 'ws' && r.status === 101 && r.path.includes('csrf=[redacted]')));
}

// ---- cookie: 10.0.0's mode and its SameSite switch -----------------------------------------------------
if (section('cookie')) {
  console.log('\n# cookie mode (the default) and --samesite');
  for (const [ss, want] of [
    [undefined, /SameSite=Lax(?!;\s*Secure)/],
    ['none', /SameSite=None; Secure/],
    ['strict', /SameSite=Strict/],
  ]) {
    const m = await mock({ ...(ss ? { sameSite: ss } : {}) });
    const r = await fetch(`${m.origin}/login?go=1`, { redirect: 'manual' });
    check(`the sign-in stand-in sets the session cookie with ${ss ?? 'the default (lax)'}`, r.status === 302 && want.test(r.headers.get('set-cookie') ?? ''), r.headers.get('set-cookie'));
    const d = await fetch(`${m.origin}/pun/sys/dashboard/`, { redirect: 'manual' });
    check(`without the cookie the dashboard redirects to the sign-in (${ss ?? 'lax'})`, d.status === 302 && /^\/login\?redirect=/.test(d.headers.get('location') ?? ''));
  }
}

// ---- the Shell's origin rule ---------------------------------------------------------------------------
if (section('origin')) {
  console.log("\n# the Shell's origin rule (OOD: refuse only an http(s) Origin that differs from the portal's)");
  const m = await mock({});
  for (const [o2, refused] of [
    ['chrome-extension://abcdefghijklmnopabcdefghijklmnop', false],
    ['https://evil.example', true],
    ['http://evil.example', true],
    [undefined, false],
  ]) {
    const sh = await openShell(m, { origin: o2 });
    const c = sh.opened ? ((await sh.waitFor(/\$ $/, 4000)) ? 'prompt' : await Promise.race([sh.closed, sleep(2000).then(() => 'nothing')])) : await sh.closed;
    const wasRefused = c && typeof c === 'object' && c.code === 3146 && c.reason === 'Invalid Origin.';
    check(`Origin ${o2 ?? '(none)'}: ${refused ? 'refused with 3146 "Invalid Origin."' : 'accepted'}`, refused ? wasRefused : c === 'prompt', JSON.stringify(c));
    sh.close();
  }
  const same = await openShell(m, { origin: m.origin });
  check("the portal's own Origin is accepted", (await same.waitFor(/\$ $/, 4000)) !== undefined);
  same.close();
}

// ---- OnDemand's idle rule, and "{}" ---------------------------------------------------------------------
if (section('idle')) {
  console.log('\n# OnDemand idle limit (here 2 s, swept every 0.5 s): "{}" is no activity, input and output are');
  const m = await mock({ shellIdleS: 2, shellSweepS: 0.5 });
  const quiet = await openShell(m);
  const busy = await openShell(m);
  await quiet.waitFor(/\$ $/);
  await busy.waitFor(/\$ $/);
  const t0 = Date.now();
  const tick = setInterval(() => {
    quiet.send({});
    busy.type('\x7f');
  }, 400);
  const qc = await Promise.race([quiet.closed, sleep(6000).then(() => undefined)]);
  const quietMs = Date.now() - t0;
  await sleep(Math.max(0, 4500 - quietMs));
  clearInterval(tick);
  check('a shell sent only "{}" every 0.4 s is terminated after the idle limit (1006)', qc?.code === 1006 && quietMs >= 1900 && quietMs <= 3500, `${qc?.code} after ${quietMs} ms`);
  check('a shell with input every 0.4 s is still open after 4.5 s', busy.ws.readyState === 1);
  const st = await (await fetch(`${m.origin}/_mock/state`)).json();
  check('the "{}" frames were counted and ignored', st.keepaliveFrames >= 4 && st.fatal === 0 && st.idleKills >= 1, `keepalives ${st.keepaliveFrames}, idle kills ${st.idleKills}`);
  busy.close();
}

// ---- connect: the first run on a fresh Wayne-like account, the queue, status, restrict, stop -------------
if (section('connect') || section('queue')) {
  console.log('\n# connect on a fresh account (the Wayne State profile from the shared copy), 25 s in line, signed out of Claude');
  const m = await mock({ auth: 'basic', sharedInstall: SHARED_WAYNE, queueS: 25, startS: 2, claudeSignedIn: false, keepaliveS: 2, codeWaitS: 60 });
  const line = C.commands.connect(SHARED_WAYNE, { name: 'worker', site: 'wayne', installId: INSTALL, login: 'auto', permissionMode: 'default', chain: true });
  check('the connect line is the contract builder\'s', line.startsWith(`exec bash '${SHARED_WAYNE}/bin/hpcworker' connect --name 'worker' --profile 'wayne' --consent '${INSTALL}' --login 'auto'`), line);
  const CODE = 'AbCdEf123456#mockstate';
  let pastedAt = 0;
  const r = await connectTranscript(m, line, {
    onEvent: async (ev, sh) => {
      if (ev.kind === 'code-prompt' && !pastedAt) {
        await sleep(5000); // the student is on Anthropic's page: keepalive lines arrive meanwhile
        pastedAt = Date.now();
        sh.type(`${CODE}\r`);
      }
    },
  });
  const st = steps(r.events);
  const kinds = r.events.map((e) => (e.kind === 'step' ? `step:${e.step.step}` : e.kind));
  check('HPCW-STEP lines in the contract order: setup changed, consent, queued new, signin, signed-in, done', JSON.stringify(st.map((s) => s.step)) === JSON.stringify(['setup', 'consent', 'queued', 'signin', 'signed-in', 'done']), kinds.join(' '));
  const q = st.find((s) => s.step === 'queued');
  check('queued carries the job and the run folder /rs/rs_grp_oschome/st1234/hpcworker/worker', !!q && /^\d+$/.test(q.job) && q.fresh === true && q.runDir === '/rs/rs_grp_oschome/st1234/hpcworker/worker', JSON.stringify(q));
  check('setup changed (the account was not on the shared copy)', st[0]?.step === 'setup' && st[0].changed === true);
  const au = r.events.find((e) => e.kind === 'auth-url');
  check('AUTH-URL is an https claude.ai authorize link with the mock client id', !!au && C.isClaudeAuthUrl(au.url) && /^https:\/\/claude\.ai\/oauth\/authorize\?code=true&client_id=mock-client-0000&/.test(au.url), au?.url?.slice(0, 90));
  check('the sitting reports its computer and the code prompt', kinds.includes('signin-wait') && kinds.includes('signin-node') && kinds.includes('code-prompt') && kinds.includes('code-received'));
  const keep = r.events.filter((e) => e.kind === 'keepalive');
  check('keepalive lines (MOCK_KEEPALIVE_S=2 here; 20 by default) while the student is away', keep.length >= 2, `${keep.length} keepalives`);
  const si = st.find((s) => s.step === 'signed-in');
  check('signed-in st1234@wayne.edu max', si?.email === 'st1234@wayne.edu' && si?.plan === 'max', JSON.stringify(si));
  check('the pasted code is never echoed or printed', !r.text.includes(CODE) && !r.text.includes('AbCdEf123456'));
  check('the session ends with the exec\'d connect: the socket closes with no code (1005), as OnDemand closes it', r.close?.code === 1005, JSON.stringify(r.close));
  const rd = runDirOf(m);
  const s0 = statusOf(m);
  check('status.json says queued, with submitted_at, title "Wayne State grid", renewal false', s0?.state === 'queued' && /Z$/.test(s0.submitted_at) && s0.title === 'Wayne State grid' && s0.renewal === false && s0.version === 10, JSON.stringify(s0)?.slice(0, 160));
  check('the queued file has the contract keys in order', Object.keys(s0 ?? {}).slice(0, 9).join(',') === 'version,site,run,job,node,state,message,needs,hint', Object.keys(s0 ?? {}).join(','));
  check('the consent marker is "yes <ISO> <install id>"', new RegExp(`^yes 20\\d\\d-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ ${INSTALL}\\n$`).test(readOn(path.join(m.home, '.hpcworker', 'consent')) ?? ''));
  const prog0 = (readOn(path.join(rd, 'progress.log')) ?? '').trim().split('\n').map(C.parseProgressLine);
  check('progress.log: "Asked the grid for a computer"', prog0[0]?.kind === 'asked', JSON.stringify(prog0));
  const sh = await openShell(m);
  await sh.waitFor(/\$ $/);
  const sq = await sh.run(`squeue -h -j ${q.job} -o '%T|%r|%S|%N'`);
  check("squeue -h -j <job> -o '%T|%r|%S|%N' answers PENDING|Priority|<start>|", /^PENDING\|Priority\|\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\|$/.test(sq), sq);
  const sj = C.parseStatusJson(await sh.run(C.commands.statusJson(SHARED_WAYNE, 'worker')));
  check('worker status --json: v 1, the scheduler PENDING Priority with a future expected start', sj?.v === 1 && sj.scheduler?.state === 'PENDING' && sj.scheduler.reason === 'Priority' && Date.parse(sj.scheduler.expected_start) > Date.now() && sj.state_dir === '/rs/rs_grp_oschome/st1234/hpcworker', JSON.stringify(sj?.scheduler));
  check('its person line: "Your worker is in line for a computer (N min so far)."', /^Your worker is in line for a computer \(\d+ min so far\)\.$/.test(sj?.line ?? ''), sj?.line);
  const s1 = statusOf(m);
  check('worker status wrote the scheduler fields into the queued status.json', s1?.state === 'queued' && s1.scheduler_state === 'PENDING' && s1.reason === 'Priority' && !!s1.expected_start && !!s1.checked_at);
  const aj = await (await get(m, '/pun/sys/dashboard/activejobs.json?jobfilter=user')).json();
  check('Active Jobs lists the job as queued, with no node', aj.data[0].some((j) => j.pbsid === q.job && j.status === 'queued' && j.nodes.length === 0 && !('sim' in j)));
  // the clock: got a computer, then online (the sign-in happened in the sitting)
  const got = await until(() => fs.existsSync(path.join(rd, 'node')) && statusOf(m)?.state === 'starting' && statusOf(m), 40_000);
  check('when its time in line is over: the node file, status starting with got_computer_at and ends_at', !!got && /Z$/.test(got.got_computer_at) && Date.parse(got.ends_at) - Date.parse(got.got_computer_at) === 8 * 3600_000, JSON.stringify(got)?.slice(0, 120));
  const on = await until(() => statusOf(m)?.state === 'online' && statusOf(m), 15_000);
  check('then online: the environment link, online_at, claude_login signed in, consent from the marker', !!on && C.isEnvironmentUrl(on.environment_url) && /Z$/.test(on.online_at) && on.claude_login?.loggedIn === true && on.consent_source === 'marker', JSON.stringify(on)?.slice(0, 140));
  const conn = JSON.parse(readOn(path.join(rd, 'connection.json')) ?? 'null');
  check('connection.json with the title and the same link', conn?.title === 'Wayne State grid' && conn.environment_url === on?.environment_url && conn.requested_name === 'Wayne State grid');
  check('rc.log carries the registration block parseRegistration reads', C.parseRegistration(readOn(path.join(rd, 'rc.log')) ?? '').environment_url === on?.environment_url);
  const prog = (readOn(path.join(rd, 'progress.log')) ?? '').trim().split('\n').map(C.parseProgressLine);
  check('progress.log: asked, got a computer, connecting, online with the link', JSON.stringify(prog.map((p) => p?.kind)) === JSON.stringify(['asked', 'got-computer', 'connecting', 'online']) && prog[3]?.arg === on?.environment_url, JSON.stringify(prog.map((p) => p?.kind)));
  check("the job's output says \"<H:MM> Online. Open in Claude: <link>\"", new RegExp(`^\\d{1,2}:\\d\\d Online\\. Open in Claude: ${on?.environment_url.replace(/[?]/g, '\\?')}`).test(readOn(path.join(rd, `slurm_${q.job}.out`)) ?? ''));
  const sj2 = C.parseStatusJson(await sh.run(C.commands.statusJson(SHARED_WAYNE, 'worker')));
  check('worker status --json once online: no scheduler question, "Your worker is online (ready N min after you asked)."', sj2?.scheduler === null && /^Your worker is online \(ready \d+ min after you asked\)\.$/.test(sj2?.line ?? ''), sj2?.line);
  check('the chain queued a successor (next.id, next_job)', /^\d+ \d+$/.test((readOn(path.join(rd, 'next.id')) ?? '').trim()) && !!on?.next_job);
  // a second connect: kept, and the sign-in skipped (D5)
  const again = await connectTranscript(m, C.commands.connect(SHARED_WAYNE, { name: 'worker', site: 'wayne', login: 'auto', permissionMode: 'default', chain: true }));
  const st2 = steps(again.events);
  check('a second connect: setup ready, queued kept (nothing submitted), signed-in without a sitting, done', JSON.stringify(st2.map((s) => s.step)) === JSON.stringify(['setup', 'queued', 'signed-in', 'done']) && st2[0].changed === false && st2[1].fresh === false && st2[1].job === q.job, JSON.stringify(st2));
  // restrict, then connect refuses
  const rs1 = await sh.run(C.commands.restrict(SHARED_WAYNE, 'worker'));
  const rs2 = await sh.run(C.commands.restrict(SHARED_WAYNE, 'worker'));
  check('worker restrict: "marked restricted (<marker>)", then "already marked restricted"', /^worker worker: marked restricted \(\/rs\/rs_grp_oschome\/st1234\/hpcworker\/workspaces\/worker\/\.restricted\); it will not start there until the marker is removed$/m.test(rs1) && /^worker \S+: already marked restricted/m.test(rs2), `${rs1} | ${rs2}`);
  const refused = await connectTranscript(m, C.commands.connect(SHARED_WAYNE, { name: 'worker', site: 'wayne', login: 'never', permissionMode: 'default', chain: true }));
  const rf = steps(refused.events).pop();
  check('connect on a restricted workspace: HPCW-STEP failed restricted', rf?.step === 'failed' && rf.code === 'restricted', JSON.stringify(rf));
  // stop
  const stop = await sh.run(C.commands.stop(SHARED_WAYNE, 'worker'));
  check('worker stop: "worker worker: stopped (...; the chain ended)"', /^worker \S+: stopped \(the job left on its own; cancelled at the scheduler: \d+; the chain ended\)$/m.test(stop), stop);
  const s3 = statusOf(m);
  check('status stopped with stop_reason request; progress "Stopped"; stop.done; the job and its successor gone', s3?.state === 'stopped' && s3.stop_reason === 'request' && /Stopped$/.test((readOn(path.join(rd, 'progress.log')) ?? '').trim()) && fs.existsSync(path.join(rd, 'stop.done')) && (await (await get(m, '/pun/sys/dashboard/activejobs.json')).json()).data[0].length === 0);
  const rec = await sh.run(C.commands.consentRecord(SHARED_WAYNE, INSTALL));
  check('claude consent --record: "recorded in /home/st1234/.hpcworker/consent (fallback marker): ..."', rec === 'recorded in /home/st1234/.hpcworker/consent (fallback marker): your workers may now host Remote Control', rec);
  const badRec = await sh.run(`bash '${SHARED_WAYNE}/bin/hpcworker' claude consent --record nothex; echo "exit $?"`);
  check('claude consent --record with a bad id: the sentence and exit 2', /claude consent --record needs this installation's 32-character id\nexit 2$/.test(badRec), badRec);
  const sched = (readOn(path.join(m.home, '.mock-ood', 'scheduler.log')) ?? '').trim().split('\n');
  check('scheduler questions are logged for the cadence checks (/_mock/state schedulerCalls)', sched.length >= 3, `${sched.length} lines`);
  sh.close();
}

// ---- queue reasons, no estimate, a job the grid dropped ------------------------------------------------------
if (section('queue')) {
  console.log('\n# reason classes, no estimate, GONE');
  const m = await mock({ sharedInstall: '/lab/shared/hpcworker/current', seedShared: true, queueS: 600, queueReason: 'QOSMaxJobsPerUserLimit', queueExpect: 'none' });
  const r = await connectTranscript(m, C.commands.connect('/lab/shared/hpcworker/current', { name: 'worker', site: 'mock', login: 'never', permissionMode: 'default', chain: true }));
  const q = steps(r.events).find((s) => s.step === 'queued');
  check('connect --login never: setup ready, queued new, done; no sitting', JSON.stringify(steps(r.events).map((s) => s.step)) === JSON.stringify(['setup', 'queued', 'done']), JSON.stringify(steps(r.events)));
  const sh = await openShell(m);
  await sh.waitFor(/\$ $/);
  const sj = C.parseStatusJson(await sh.run(C.commands.statusJson('/lab/shared/hpcworker/current', 'worker')));
  check('worker status --json: reason QOSMaxJobsPerUserLimit (class "share"), no expected start (N/A)', sj?.scheduler?.reason === 'QOSMaxJobsPerUserLimit' && C.reasonClass(sj.scheduler.reason) === 'share' && sj.scheduler.expected_start === '', JSON.stringify(sj?.scheduler));
  // the grid drops it: cancelled at the scheduler, no node file
  const del = await fetch(`${m.origin}/pun/sys/dashboard/activejobs?cluster=mock&pbsid=${q.job}`, { method: 'DELETE', redirect: 'manual', headers: { Cookie: m.cookie, 'X-CSRF-Token': m.railsToken } });
  const sj2 = C.parseStatusJson(await sh.run(C.commands.statusJson('/lab/shared/hpcworker/current', 'worker')));
  check('a queued job squeue no longer lists: scheduler GONE, status error "the grid ended the request before it started"', del.status === 302 && sj2?.scheduler?.state === 'GONE' && sj2.status?.state === 'error' && sj2.status.message === 'the grid ended the request before it started' && /^Your worker couldn't start: the grid ended the request before it started$/.test(sj2.line), JSON.stringify(sj2?.status)?.slice(0, 120));
  const last = (readOn(path.join(m.home, '.hpcworker', 'state', 'worker', 'progress.log')) ?? '').trim().split('\n').pop();
  check('progress.log: "Couldn\'t start: the grid ended the request before it started"', C.parseProgressLine(last)?.kind === 'error', last);
  for (const [reason, cls] of [
    ['Priority', 'line'],
    ['Resources', 'line'],
    ['AssocGrpCPULimit', 'share'],
    ['ReqNodeNotAvail, UnavailableNodes:asx[01-04]', 'maintenance'],
  ]) check(`reason ${reason} reads as "${cls}"`, C.reasonClass(reason) === cls);
  sh.close();
}

// ---- the sign-in's failures and modes ---------------------------------------------------------------------
if (section('failures')) {
  console.log('\n# sign-in failures and modes (environment knobs per sitting)');
  const m = await mock({ sharedInstall: '/lab/shared/hpcworker/current', seedShared: true, claudeSignedIn: false, keepaliveS: 1 });
  const line = (login = 'always', name = 'worker') => C.commands.connect('/lab/shared/hpcworker/current', { name, site: 'mock', login, permissionMode: 'default', chain: true });
  const withEnv = async (vars, fn) => {
    const old = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
    Object.assign(process.env, vars);
    try {
      return await fn();
    } finally {
      for (const [k, v] of Object.entries(old)) if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  const paste = (codes) => {
    let i = 0;
    return async (ev, sh) => {
      if ((ev.kind === 'code-prompt' || ev.kind === 'code-rejected') && i < codes.length) {
        await sleep(300);
        sh.type(`${codes[i++]}\r`);
      }
    };
  };
  let r = await withEnv({ MOCK_CODE_REJECT: '1' }, () => connectTranscript(m, line('always', 'a1'), { onEvent: paste(['FIRST1234567', 'SECOND123456']) }));
  check('MOCK_CODE_REJECT=1: "that code was not accepted; paste it again", then the next code signs in', r.events.some((e) => e.kind === 'code-rejected') && steps(r.events).some((s) => s.step === 'signed-in'), r.events.map((e) => e.kind).join(' '));
  r = await withEnv({ MOCK_PLAN: 'free' }, () => connectTranscript(m, line('fresh', 'a2'), { onEvent: paste(['THIRD1234567']) }));
  const fr = steps(r.events).find((s) => s.step === 'signed-in');
  check('--login fresh signs out first and asks again; MOCK_PLAN=free says "free" (the panel refuses it)', fr?.plan === 'free' && r.events.some((e) => e.kind === 'auth-url') && !C.planAllowsRemoteControl(fr.plan), JSON.stringify(fr));
  r = await withEnv({ MOCK_LOGIN_FAIL: '1' }, () => connectTranscript(m, line('fresh', 'a3'), { onEvent: paste(['FOURTH123456']) }));
  let f = steps(r.events).pop();
  check('MOCK_LOGIN_FAIL=1: HPCW-LOGIN-FAILED, then HPCW-STEP failed signin-code', f?.step === 'failed' && f.code === 'signin-code' && r.events.some((e) => e.kind === 'login-failed'), JSON.stringify(f));
  r = await withEnv({ MOCK_SIGNIN_WAIT_S: '5', MOCK_ALLOC_WAIT_S: '3' }, () => connectTranscript(m, line('fresh', 'a4')));
  f = steps(r.events).pop();
  check('no computer for the sign-in within the budget: failed signin-node, with keepalives meanwhile', f?.code === 'signin-node' && r.events.filter((e) => e.kind === 'keepalive').length >= 2, `${JSON.stringify(f)} keepalives ${r.events.filter((e) => e.kind === 'keepalive').length}`);
  r = await withEnv({ MOCK_CODE_WAIT_S: '3' }, () => connectTranscript(m, line('fresh', 'a5')));
  f = steps(r.events).pop();
  check('no code within the budget: failed signin-timeout', f?.code === 'signin-timeout', JSON.stringify(f));
  r = await withEnv({ MOCK_SBATCH_FAIL: '1' }, () => connectTranscript(m, line('never', 'a6')));
  f = steps(r.events).pop();
  check('the scheduler refuses: failed refused with sbatch\'s own words', f?.code === 'refused' && /^sbatch: error: Batch job submission failed: Invalid qos specification$/.test(f.detail), JSON.stringify(f));
  const usage = await connectTranscript(m, `exec bash '/lab/shared/hpcworker/current/bin/hpcworker' connect --name 'bad name'`);
  check('a bad flag value: failed usage, nothing done', steps(usage.events).pop()?.code === 'usage');
}

// ---- the job clock: need_login and its abandon, renewal, reconnect -------------------------------------------
if (section('clock')) {
  console.log('\n# the job clock: the sign-in abandon, a renewal, a Remote Control restart');
  const m = await mock({ sharedInstall: '/lab/shared/hpcworker/current', seedShared: true, claudeSignedIn: false, queueS: 1, startS: 1, abandonS: 5 });
  await connectTranscript(m, C.commands.connect('/lab/shared/hpcworker/current', { name: 'worker', site: 'mock', login: 'never', permissionMode: 'default', chain: true }));
  const rd = runDirOf(m, 'worker', false);
  const nl = await until(() => statusOf(m, 'worker', false)?.state === 'need_login' && statusOf(m, 'worker', false), 15_000);
  check('signed out of Claude: status need_login, needs login, "Waiting for your Claude sign-in"', nl?.needs === 'login' && /Waiting for your Claude sign-in$/m.test(readOn(path.join(rd, 'progress.log')) ?? ''));
  const ab = await until(async () => {
    const s = statusOf(m, 'worker', false);
    const lastLine = (readOn(path.join(rd, 'progress.log')) ?? '').trim().split('\n').pop();
    const left = (await (await get(m, '/pun/sys/dashboard/activejobs.json')).json()).data[0].length;
    return s?.state === 'stopped' && C.parseProgressLine(lastLine)?.kind === 'signin-abandoned' && left === 0 && s;
  }, 15_000);
  check('past login_abandon_s (here 5 s): stopped, stop_reason login_abandoned, "Stopped: waiting for your Claude sign-in timed out", nothing left in line', ab?.stop_reason === 'login_abandoned', JSON.stringify(ab)?.slice(0, 100));
  const m2 = await mock({ sharedInstall: '/lab/shared/hpcworker/current', seedShared: true, queueS: 1, startS: 1, renewS: 6, renewQueueS: 2, reconnectAfterS: 2 });
  const r2 = await connectTranscript(m2, C.commands.connect('/lab/shared/hpcworker/current', { name: 'worker', site: 'mock', login: 'never', permissionMode: 'default', chain: true }));
  const first = steps(r2.events).find((s) => s.step === 'queued')?.job;
  const rc = await until(() => {
    const s = statusOf(m2, 'worker', false);
    return s?.state === 'starting' && s.restarts === 1 && s.online_at && s;
  }, 15_000, 100);
  check('MOCK_RECONNECT_AFTER_S: starting with restarts 1 and online_at kept (R6), "Reconnecting"', !!rc && /Reconnecting$/m.test(readOn(path.join(runDirOf(m2, 'worker', false), 'progress.log')) ?? ''));
  const pre = await until(() => statusOf(m2, 'worker', false)?.state === 'preempted' && statusOf(m2, 'worker', false), 15_000, 100);
  check('at the wall time (here 6 s): preempted with next_job, "Renewing"', !!pre?.next_job && /Renewing$/m.test(readOn(path.join(runDirOf(m2, 'worker', false), 'progress.log')) ?? ''), JSON.stringify(pre)?.slice(0, 100));
  const ren = await until(() => {
    const s = statusOf(m2, 'worker', false);
    return s?.state === 'online' && s.job !== first && s;
  }, 20_000);
  check('the successor starts with renewal true, its own job id in job.id, and comes online', ren?.renewal === true && ren.job === pre?.next_job && (readOn(path.join(runDirOf(m2, 'worker', false), 'job.id')) ?? '').trim() === ren.job, JSON.stringify({ job: ren?.job, renewal: ren?.renewal }));
}

// ---- the keyless account and login-setup (AM2) ------------------------------------------------------------------
if (section('keyless')) {
  console.log('\n# the keyless account (MOCK_SHELL_KEYLESS=1) and hpcworker login-setup');
  const m = await mock({ auth: 'basic', keyless: true, sharedInstall: '/lab/shared/hpcworker/current', seedShared: true });
  const setup = C.commands.loginSetup('/lab/shared/hpcworker/current');
  check("the setup line passes the page script's own check (isLoginSetupLine)", C.isLoginSetupLine(setup), setup);
  const sh = await openShell(m);
  const pw = await sh.waitFor(/st1234@login1's password: $/, 8000);
  check("a shell first asks \"st1234@login1's password: \", which shell.ts's /password:/ catches", !!pw && /password:|passphrase|Permission denied/i.test(sh.text) && !/\$ $/.test(sh.text));
  sh.type('not-the-password\r');
  await sh.waitFor(/Permission denied, please try again\.\nst1234@login1's password: $/, 5000);
  check('a wrong password: "Permission denied, please try again." and the prompt again; nothing typed is shown', /Permission denied, please try again\./.test(sh.text) && !sh.text.includes('not-the-password'));
  sh.type(`${setup}\r`);
  await sh.waitFor(/password: [\s\S]*password: [\s\S]*password: $/, 5000);
  let st = await (await fetch(`${m.origin}/_mock/state`)).json();
  check('the setup line arriving at the password prompt is counted (typedAtPasswordPrompt) and runs nothing', st.typedAtPasswordPrompt === 1 && !fs.existsSync(path.join(m.home, '.ssh', 'authorized_keys')));
  sh.type('mockpass\r');
  await sh.waitFor(/Last login: [^\n]+\n\[st1234@login1 ~\]\$ $/, 5000);
  check('the right password: "Last login", the prompt, and the title ESC ] 0 ; st1234@login1:~', /\[st1234@login1 ~\]\$ $/.test(sh.text) && sh.raw.includes('\x1b]0;st1234@login1:~\x07') && !sh.text.includes('mockpass'));
  const out = await sh.run(setup);
  check('login-setup ends with "Done. The grid will not ask again." (loginSetupOutcome)', C.loginSetupOutcome(out).done, out);
  const ak = readOn(path.join(m.home, '.ssh', 'authorized_keys')) ?? '';
  check('authorized_keys: one line, from="10.0.0.1",no-agent-forwarding,no-port-forwarding,no-X11-forwarding ssh-ed25519 ... beethoven-login-setup st1234 <date>', /^from="10\.0\.0\.1",no-agent-forwarding,no-port-forwarding,no-X11-forwarding ssh-ed25519 \S+ beethoven-login-setup st1234 \d{4}-\d\d-\d\d$/.test(ak.trim()) && ak.trim().split('\n').length === 1, ak.trim().slice(0, 120));
  const cfg = readOn(path.join(m.home, '.ssh', 'config')) ?? '';
  check('~/.ssh/config: the managed block for the login host, our key first, then the default keys', cfg.includes('# >>> beethoven login-setup (managed; "hpcworker login-setup --remove" removes this block) >>>') && /Host login1 login1\.cluster\.mock\n    IdentityFile ~\/\.ssh\/beethoven_ed25519\n    IdentityFile ~\/\.ssh\/id_rsa\n/.test(cfg) && cfg.trim().endsWith('# <<< beethoven login-setup <<<'), cfg.split('\n')[1]);
  check('the key: ~/.ssh/beethoven_ed25519 and .pub with the comment, nothing printed of it', fs.existsSync(path.join(m.home, '.ssh', 'beethoven_ed25519')) && / beethoven-login-setup st1234 /.test(readOn(path.join(m.home, '.ssh', 'beethoven_ed25519.pub')) ?? '') && !/PRIVATE KEY|ssh-ed25519 AAAA/.test(out));
  const again = await sh.run(setup);
  check('a second run keeps the key and the one line ("Kept the key made earlier"), and is done', /Kept the key made earlier/.test(again) && C.loginSetupOutcome(again).done && (readOn(path.join(m.home, '.ssh', 'authorized_keys')) ?? '').trim().split('\n').length === 1);
  sh.close();
  const sh2 = await openShell(m);
  await sh2.waitFor(/\$ $|password: $/, 8000);
  check('a new shell no longer asks for the password', /\[st1234@login1 ~\]\$ $/.test(sh2.text) && !/password:/.test(sh2.text));
  st = await (await fetch(`${m.origin}/_mock/state`)).json();
  check('/_mock/state says loginSetupDone', st.loginSetupDone === true);
  // the refusals, run directly with the environment each needs
  const tool = path.resolve(here, '../mock-ood/lib/tool.mjs');
  const direct = (extra, drop = []) => {
    // a student's terminal: none of the agent markers of the machine running this test
    const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_ENTRYPOINT|HPCW_AGENT|[A-Z]+_(REQUEST_ID|WORKER|JOB))$/.test(k)));
    const env = { ...base, MOCK_HOME: m.home, MOCK_USER: 'st1234', MOCK_DISPLAY_HOME: '/home/st1234', MOCK_TTY: '1', ...extra };
    for (const k of drop) delete env[k];
    const r = spawnSync(process.execPath, [tool, 'login-setup'], { env, encoding: 'utf8' });
    return { code: r.status, out: (r.stdout ?? '').trim() };
  };
  let d = direct({}, ['SSH_CONNECTION', 'CLAUDECODE']);
  check('outside an ssh session: "Stopped: this is not a session that came in through ssh, so there is no address to allow." exit 2', d.code === 2 && d.out === 'Stopped: this is not a session that came in through ssh, so there is no address to allow.', JSON.stringify(d));
  d = direct({ SSH_CONNECTION: '127.0.0.1 40000 127.0.0.1 22' }, ['CLAUDECODE']);
  check('from the same computer: exit 2 with its sentence', d.code === 2 && d.out === "Stopped: this session came from this same computer, not from the grid's website.");
  d = direct({ SSH_CONNECTION: '10.0.0.1 40000 10.0.0.2 22', CLAUDECODE: '1' });
  check('under Claude Code: exit 2 with its sentence', d.code === 2 && /^Stopped: this changes how your account signs in/.test(d.out));
  d = direct({ SSH_CONNECTION: '10.0.0.1 40000 10.0.0.2 22', MOCK_HOME_MODE: '0777' }, ['CLAUDECODE']);
  check('a home writable by others: exit 3 with its sentence', d.code === 3 && d.out === 'Stopped: your home folder can be written by others, so the grid would ignore any key in it.');
  d = direct({ SSH_CONNECTION: '10.0.0.7 40000 10.0.0.2 22' }, ['CLAUDECODE']);
  const ak2 = readOn(path.join(m.home, '.ssh', 'authorized_keys')) ?? '';
  check('a run from a second OnDemand server adds its address to the same line', d.code === 0 && /^from="10\.0\.0\.1,10\.0\.0\.7",/.test(ak2.trim()) && ak2.trim().split('\n').length === 1, ak2.trim().slice(0, 40));
  fs.writeFileSync(path.join(m.home, '.ssh', 'authorized_keys'), `ssh-rsa AAAAB3Nza... someone@laptop\n${ak2}`);
  const rm = spawnSync(process.execPath, [tool, 'login-setup', '--remove'], { env: { ...process.env, MOCK_HOME: m.home, MOCK_USER: 'st1234' }, encoding: 'utf8' });
  const left = readOn(path.join(m.home, '.ssh', 'authorized_keys')) ?? '';
  check('--remove: "Done. Removed Beethoven\'s grid key."; the student\'s own line stays; our key files and block go', rm.stdout.trim() === "Done. Removed Beethoven's grid key." && left.trim() === 'ssh-rsa AAAAB3Nza... someone@laptop' && !fs.existsSync(path.join(m.home, '.ssh', 'beethoven_ed25519')) && !(readOn(path.join(m.home, '.ssh', 'config')) ?? '').includes('beethoven'), rm.stdout.trim());
  const rm2 = spawnSync(process.execPath, [tool, 'login-setup', '--remove'], { env: { ...process.env, MOCK_HOME: m.home, MOCK_USER: 'st1234' }, encoding: 'utf8' });
  check('--remove again: "Nothing to remove."', rm2.stdout.trim() === 'Nothing to remove.');
  fs.writeFileSync(path.join(m.home, '.ssh', 'beethoven_ed25519.pub'), 'ssh-ed25519 AAAA someone-else\n');
  d = direct({ SSH_CONNECTION: '10.0.0.1 40000 10.0.0.2 22' }, ['CLAUDECODE']);
  check('a key of that name not made by the tool: exit 6, nothing changed', d.code === 6 && /was not made by this tool; nothing was changed\.$/.test(d.out));
  fs.rmSync(path.join(m.home, '.ssh', 'beethoven_ed25519.pub'));
  const sh3 = await openShell(m);
  await sh3.waitFor(/password: $/, 8000);
  sh3.type('x\r');
  await sh3.waitFor(/again\.\n[^\n]*password: $/, 4000);
  sh3.type('y\r');
  await sh3.waitFor(/again\.\n[^\n]*password: [\s\S]*again\.\n[^\n]*password: $/, 4000);
  sh3.type('z\r');
  const c3 = await Promise.race([sh3.closed, sleep(5000).then(() => undefined)]);
  check('after --remove the password is asked again; three wrong ones end the session ("Permission denied (publickey,...password).")', /Permission denied \(publickey,gssapi-keyex,gssapi-with-mic,password\)\./.test(sh3.text) && c3?.code === 1005, JSON.stringify(c3));
}

// ---- the terminal page in a browser (AM2's page script) --------------------------------------------------------
if (section('terminal')) {
  console.log("\n# the Shell page as a real terminal, typed into from an isolated world as Beethoven's page script would");
  const pwDir = process.env.PLAYWRIGHT_DIR || 'C:/Users/grego/AppData/Local/Temp/claude/c--Users-grego-OneDrive-Desktop-CTSpinoPelvic1K-1/0599380b-0d32-4e19-b5be-65bdd1017566/scratchpad/pw/node_modules/playwright';
  let chromium;
  try {
    ({ chromium } = await import(pathToFileURL(path.join(pwDir, 'index.mjs')).href));
  } catch (e) {
    check('Playwright is available for the terminal section', false, `${pwDir}: ${e.message}`);
  }
  if (chromium) {
    for (const bracketed of [false, true]) {
      const m = await mock({ auth: 'basic', keyless: true, sharedInstall: '/lab/shared/hpcworker/current', seedShared: true, bracketedPaste: bracketed });
      const browser = await chromium.launch({ headless: true });
      const ctx = await browser.newContext({ httpCredentials: { username: 'st1234', password: 'mockpass' } });
      const page = await ctx.newPage();
      await page.goto(`${m.origin}/pun/sys/shell/ssh/default`);
      const label = bracketed ? ' (bracketed paste on)' : '';
      check(`the page starts with the title "Shell" and an xterm.js helper textarea${label}`, (await page.title()) === 'Shell' && (await page.locator('textarea.xterm-helper-textarea').count()) === 1);
      await page.waitForFunction(() => /password: $/.test(document.getElementById('screen').textContent), null, { timeout: 8000 });
      check(`the terminal shows the password prompt; the title stays "Shell" there${label}`, (await page.title()) === 'Shell');
      await page.locator('textarea.xterm-helper-textarea').focus();
      await page.keyboard.type('mockpass');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.title !== 'Shell', null, { timeout: 8000 }).catch(() => {});
      check(`typed keys reach the shell; once it is up the title is "st1234@login1:~" (D31: begins "<AccessID>@")${label}`, (await page.title()) === 'st1234@login1:~' && !(await page.locator('#screen').textContent()).includes('mockpass'), await page.title());
      // Beethoven's page script runs in an isolated world: dispatch the paste and the Enter from one
      const cdp = await ctx.newCDPSession(page);
      const frameId = (await cdp.send('Page.getFrameTree')).frameTree.frame.id;
      const { executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId, worldName: 'beethoven-page-script' });
      const line = C.commands.loginSetup('/lab/shared/hpcworker/current');
      const typed = await cdp.send('Runtime.evaluate', {
        contextId: executionContextId,
        returnByValue: true,
        expression: `(() => {
          const ta = document.querySelector('textarea.xterm-helper-textarea');
          if (!ta) return { typed: false, how: 'unsupported' };
          ta.focus();
          const dt = new DataTransfer();
          dt.setData('text/plain', ${JSON.stringify(line)});
          ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
          ta.dispatchEvent(new InputEvent('input', { data: '\\r', inputType: 'insertText', bubbles: true }));
          return { typed: true, how: 'xterm' };
        })()`,
      });
      check(`the paste event and the insertText Enter dispatched from an isolated world are taken${label}`, typed.result.value?.typed === true);
      await page.waitForFunction(() => /Done\. The grid will not ask again\./.test(document.getElementById('screen').textContent), null, { timeout: 20_000 }).catch(() => {});
      const screen = await page.locator('#screen').textContent();
      check(`the line ran in the terminal and ended "Done. The grid will not ask again."${label}`, /Done\. The grid will not ask again\./.test(screen), screen.split('\n').slice(-3).join(' | '));
      const sh = await openShell(m);
      await sh.waitFor(/\$ $|password: $/, 8000);
      check(`the background's next shell no longer meets the password${label}`, /\$ $/.test(sh.text));
      sh.close();
      await browser.close();
    }
    const mh = await mock({ auth: 'basic', keyless: true, terminal: 'hterm', sharedInstall: '/lab/shared/hpcworker/current', seedShared: true });
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ httpCredentials: { username: 'st1234', password: 'mockpass' } });
    const page = await ctx.newPage();
    await page.goto(`${mh.origin}/pun/sys/shell/ssh/default`);
    check('--terminal hterm: a working terminal without the xterm.js helper textarea (the page script answers "unsupported")', (await page.locator('textarea.xterm-helper-textarea').count()) === 0 && (await page.locator('#hterm-input').count()) === 1);
    await browser.close();
  }
}

// ---- the access stand-in ---------------------------------------------------------------------------------------
if (section('access')) {
  console.log("\n# the stand-in for the lab's access service (never the live one)");
  const m = await mock({});
  const ask = async (id = 'st1234', install = INSTALL) => {
    const r = await fetch(`${m.origin}/beethoven/access_check`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ v: 1, access_id: id, portal: 'localhost', product: 'bridge', version: '11.0.0', install_id: install }) });
    return { status: r.status, body: await r.json() };
  };
  const svc = await (await fetch(`${m.origin}/beethoven/services.json`)).json();
  check('services.json names the stand-in', svc.access_check === `${m.origin}/beethoven/access_check`);
  let a = await ask();
  check('list mode: st1234 approved and bound to this installation', a.body.approved === true);
  a = await ask('st1234', 'f'.repeat(32));
  check('list mode: another installation for st1234 gets reason other_installation', a.body.approved === false && a.body.reason === 'other_installation');
  a = await ask('zz9999');
  check('list mode: an account not on the list is not approved, with the request page', a.body.approved === false && !a.body.reason && a.body.requestPage === 'https://openspineconsortium.com/beethoven/request.html');
  for (const [mode, want] of [
    ['approved', (b) => b.approved === true],
    ['denied', (b) => b.approved === false && !b.reason],
    ['other-installation', (b) => b.reason === 'other_installation'],
    ['other-account', (b) => b.reason === 'other_account'],
    ['update-required', (b) => b.reason === 'update_required'],
    ['withdrawn', (b) => b.approved === false && !b.reason],
  ]) {
    await fetch(`${m.origin}/_mock/access?mode=${mode}`);
    a = await ask();
    check(`/_mock/access?mode=${mode}: ${JSON.stringify(a.body).slice(0, 80)}`, a.status === 200 && want(a.body));
  }
  await fetch(`${m.origin}/_mock/access?mode=down`);
  a = await ask();
  check('/_mock/access?mode=down: 503 (the service cannot be reached)', a.status === 503);
  const bad = await fetch(`${m.origin}/_mock/access?mode=nonsense`);
  check('an unknown mode is refused', bad.status === 400);
}

// ---- 10.0.0's stand-in kept -------------------------------------------------------------------------------------
if (section('legacy')) {
  console.log("\n# 10.0.0's instant start kept when no queue knob is set (the 10.0.0 tests and reviewer recipe)");
  const m = await mock({ sharedInstall: '/lab/shared/hpcworker/current', seedShared: true });
  const sh = await openShell(m);
  await sh.waitFor(/\$ $/);
  const out = await sh.run(C.commands.workerStart('worker', 'default'));
  const s = statusOf(m, 'worker', false);
  check('worker start (10.0.0 line): "submitted as job <id>" and online at once, with framework 10 fields added', C.parseJobId(out) && s?.state === 'online' && s.requested_name === `mock-${C.parseJobId(out)}` && s.title === 'Grid worker' && !!s.online_at, out.split('\n')[0]);
  const again = await sh.run(C.commands.workerStart('worker', 'default'));
  check('a second start finds the job: "already has job <id> (...); nothing submitted"', /already has job \d+ \(RUNNING on node01\); nothing submitted/.test(again), again);
  const plain = await sh.run(`${C.commands.claudeLoginPlain} < /dev/null; echo "exit $?"`);
  check('claude login --plain still prints no keepalive', !plain.includes('HPCW-LOGIN: still waiting'));
  sh.close();
}

// ---- the long sitting (AM4, D32) -------------------------------------------------------------------------------
if (LONG && (!only || only === 'long')) {
  console.log('\n# the long sitting: 11 minutes, the code pasted at 10:30, OnDemand idle limit 300 s, keepalive every 20 s');
  const m = await mock({ auth: 'basic', sharedInstall: '/lab/shared/hpcworker/current', seedShared: true, claudeSignedIn: false, codeWaitS: 700 });
  const t0 = Date.now();
  let pasted = false;
  const r = await connectTranscript(m, C.commands.connect('/lab/shared/hpcworker/current', { name: 'worker', site: 'mock', login: 'always', permissionMode: 'default', chain: true }), {
    ms: 13 * 60_000,
    onEvent: async (ev, sh) => {
      if (ev.kind === 'code-prompt' && !pasted) {
        pasted = true;
        setTimeout(() => sh.type('LONGWAIT123456\r'), Math.max(0, 630_000 - (Date.now() - t0)));
      }
    },
  });
  const keep = r.events.filter((e) => e.kind === 'keepalive');
  const gaps = keep.map((e, i) => e.at - (keep[i - 1]?.at ?? 0)).slice(1);
  check('the sitting survived OnDemand\'s 300 s idle rule with only the framework\'s keepalive lines as activity, signed in at 10:30', steps(r.events).some((s) => s.step === 'signed-in') && steps(r.events).pop()?.step === 'done', `keepalives ${keep.length}, largest gap ${Math.max(...gaps, 0)} ms, ended ${JSON.stringify(r.close)}`);
  const st = await (await fetch(`${m.origin}/_mock/state`)).json();
  check('no shell was terminated as idle', st.idleKills === 0);
}

for (const m of mocks) await m.close().catch(() => {});
console.log(`\n${passed} passed, ${failed} failed${failed ? `: ${failures.join('; ')}` : ''}`);
process.exit(failed ? 1 : 0);
