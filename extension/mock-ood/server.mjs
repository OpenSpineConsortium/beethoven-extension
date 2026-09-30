#!/usr/bin/env node
// A mock Open OnDemand portal for tests and for loading the extension unpacked. It implements the
// endpoints the extension uses with the shapes the research notes document from OSC/ondemand:
//
//   GET  /login[?go=1]                         sign-in stand-in (sets the session cookie)
//   GET  /pun/sys/dashboard/                   dashboard HTML: <meta name="csrf-token">, "Logged in as <user>", "Open OnDemand"
//   GET  /pun/sys/dashboard/files              302 to files/fs<home>
//   GET  /pun/sys/dashboard/files/fs/<path>    Accept: application/json -> index.json.jbuilder fields; ?download=1 -> body
//   PUT  /pun/sys/dashboard/files/fs/<path>    X-CSRF-Token + Rails Origin check; ?dir=true, ?touch=true
//   GET  /pun/sys/dashboard/activejobs.json    {"data":[[...]],"errors":[]}
//   DELETE /pun/sys/dashboard/activejobs       ?cluster=&pbsid=, CSRF + Origin, 302 on success
//   GET  /pun/sys/dashboard/projects           200 HTML
//   GET  /pun/sys/myjobs/workflows.json        404 unless --job-composer
//   GET  /pun/sys/shell/ssh/<host>             the shell page with "csrf=<token>" in its inline script
//   WSS  /pun/sys/shell/ssh/<host>?csrf=       {"input"} / {"resize"} frames in, raw PTY text out; 3146 closes
//   GET  /rnode/<host>/<port>/                 404 (proxy off) or 503 "Failed to connect to host:port" (--rnode enabled)
//   GET  /nginx/init?redir=                    the cold-PUN redirect (--cold)
//
// Beside the portal, for tests only, a stand-in for Licensor's access service with the wire
// contract the extension codes to (src/licensing/access.ts). No build points at it: the extension
// reads the address from services.json on Licensor's site, and a test hands it this one instead.
//   GET  /beethoven/services.json              {"access_check": "<origin>/beethoven/access_check", ...}, CORS open
//   POST /beethoven/access_check               text/plain JSON {v, access_id, portal, product, version} ->
//                                              200 {"approved":true,...} for the ids in --approve (default st1234),
//                                              200 {"approved":false,...} otherwise; 400 malformed; 429 past --access-limit
//
// Two behaviours measured on the live portal (ondemand.grid.wayne.edu, 2026-09-29) are reproduced:
// the first /pun/ request after a while answers 500 "Error: Server Error ... try again in 30 seconds"
// once (the per-user nginx starting; --cold-pun MS sets the idle time), and a ?download=1 of a file
// that does not exist answers 200 with an HTML page, not 404.
//
// The fake PTY is a real bash (Git Bash on Windows) running each typed line with the mock's
// scheduler commands (bin/) first on PATH, so the shell semantics the extension relies on are
// real; only the cluster is fake. While a command runs, typed lines go to its standard input, so
// the seeded tool's `claude login --plain` can take the pasted code. The Files routes are jailed
// to a virtual home (/home/<user>) mapped onto a directory on disk, and the seeded tool prints
// and records that virtual home in place of the directory's real path (MOCK_DISPLAY_HOME), so
// what the extension shows of the tool's output reads like a cluster wherever the mock runs.
//
// The lab's shared copy of the tool (framework 5), for the shared-install tests: with
// --shared-install [PATH] (option sharedInstall) a second directory on disk, seeded with the stand-in
// tool, a VERSION (--shared-version, default 5) and profiles/mock.json naming PATH, is served
// read-only by the Files routes at the virtual PATH (default /lab/shared/hpcworker/current), and a
// typed line that names PATH runs against that directory. --shared-unreadable (sharedReadable:
// false) plays a student outside the lab's group: the Files routes answer 403 there and bash cannot
// open the launcher (No such file or directory, exit 127). MOCK_SHARED_INSTALL=PATH in the server's
// environment does what --shared-install PATH does. Without either nothing changes.
//
// The CLI (the store reviewer's recipe) starts the home with the stand-in set up as the account's own
// copy of the tool: ~/.hpcworker/profile.json and ~/.hpcworker/VERSION at the version the build carries
// (public/framework/files/VERSION), so the strip finds the tool installed and current and uploads
// nothing (option seedInstalled). Without it the strip would upload the real framework and run its
// install, which has no profile for a mock site and refuses, and whose jobs the stand-in scheduler never
// runs. --fresh-home starts with the stand-in command only (the upload path, up to that refusal);
// --shared-install never seeds an own copy, so the shared install runs.
//
// The only dependency is `ws`. Node 22.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { readJobs, removeJob } from './lib/jobs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(here, 'bin');
const LIB = path.join(here, 'lib');
const COOKIE = 'mock_session';

const posix = (p) => (process.platform === 'win32' ? p.replace(/^([A-Za-z]):[\\/]/, (_m, d) => `/${d.toLowerCase()}/`).replace(/\\/g, '/') : p);

function findBash() {
  if (process.env.MOCK_BASH) return process.env.MOCK_BASH;
  if (process.platform === 'win32') {
    for (const c of ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe']) if (fs.existsSync(c)) return c;
  }
  return 'bash';
}

/** the framework VERSION the extension build carries (sync-framework's copy), else the checkout's, else 1 */
function carriedFrameworkVersion() {
  for (const f of [path.join(here, '..', 'public', 'framework', 'files', 'VERSION'), path.join(here, '..', '..', 'framework', 'VERSION')]) {
    try {
      const v = fs.readFileSync(f, 'utf8').trim();
      if (/^\d+$/.test(v)) return v;
    } catch {
      /* not there */
    }
  }
  return '1';
}

const html = (title, body) => `<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>\n`;

export async function createMockPortal(opts = {}) {
  const o = {
    host: '127.0.0.1',
    port: 0,
    user: 'student',
    home: undefined,
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
    /** with seedTool: set the stand-in up as the account's own copy (profile.json, and VERSION at the version the build carries), so the strip uploads nothing */
    seedInstalled: false,
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
    tls: undefined,
    log: () => {},
    ...opts,
  };
  const realHome = o.home ? path.resolve(o.home) : fs.mkdtempSync(path.join(os.tmpdir(), 'mock-ood-home-'));
  fs.mkdirSync(realHome, { recursive: true });
  const virtualHome = `/home/${o.user}`;
  const displayHome = o.displayHome ?? process.env.MOCK_DISPLAY_HOME ?? virtualHome;
  if (o.seedTool) {
    const dir = path.join(realHome, '.hpcworker', 'bin');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(BIN, 'hpcworker'), path.join(dir, 'hpcworker'));
    if (o.seedInstalled) {
      // the account's own copy, installed and current: the stand-in's own default profile, and the VERSION the build carries
      const hw = path.join(realHome, '.hpcworker');
      const profile = path.join(hw, 'profile.json');
      if (!fs.existsSync(profile)) fs.writeFileSync(profile, `${JSON.stringify({ schema_version: 1, site: 'mock', scheduler: 'slurm', partition_cpu: 'secp', qos_cpu: 'secondary', shared_state_dir: '$HOME/.hpcworker/state', claude_config_dir: '$HOME/.claude', login_node_rules: { max_processes: 20, poll_floor_seconds: 60 }, worker_defaults: { cpus: 2, mem: '8G', hours: 8, permission_mode: 'default', capacity: 4 } })}\n`);
      const version = path.join(hw, 'VERSION');
      if (!fs.existsSync(version)) fs.writeFileSync(version, `${carriedFrameworkVersion()}\n`);
    }
  }
  // the lab's shared copy: a directory on disk beside the home, seeded with the stand-in tool
  // the option, else MOCK_SHARED_INSTALL in the server's environment (as MOCK_DISPLAY_HOME is read)
  const sharedOpt = o.sharedInstall ?? process.env.MOCK_SHARED_INSTALL;
  const sharedVirtual = sharedOpt ? String(sharedOpt).replace(/\/+$/, '') : undefined;
  let sharedReal;
  if (sharedVirtual) {
    sharedReal = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-ood-shared-'));
    for (const d of ['bin', 'lib', 'jobs', 'profiles']) fs.mkdirSync(path.join(sharedReal, d), { recursive: true });
    fs.copyFileSync(path.join(BIN, 'hpcworker'), path.join(sharedReal, 'bin', 'hpcworker'));
    fs.writeFileSync(path.join(sharedReal, 'VERSION'), `${o.sharedVersion}\n`);
    fs.writeFileSync(path.join(sharedReal, 'README.md'), "The stand-in for the lab's shared copy of the tool (mock-ood).\n");
    fs.writeFileSync(path.join(sharedReal, 'profiles', 'mock.json'), `${JSON.stringify({ schema_version: 1, site: 'mock', scheduler: 'slurm', partition_cpu: 'secp', qos_cpu: 'secondary', shared_state_dir: '$HOME/.hpcworker/state', shared_install: sharedVirtual, claude_config_dir: '$HOME/.claude' })}\n`);
  }
  /** what bash is handed for the shared path: the directory, or, for an outsider, a path that is not there */
  const sharedForShell = sharedReal ? posix(o.sharedReadable ? sharedReal : `${sharedReal}.unreadable`) : undefined;
  const bash = findBash();
  const railsToken = crypto.randomBytes(32).toString('base64');
  const shellSecret = crypto.randomBytes(24).toString('base64url');
  const state = { coldDone: !o.cold, shells: 0, frames: 0, fatal: 0, coldHits: 0, punWarmUntil: 0, accessChecks: 0, accessBodies: [], accessHeaders: [] };
  const log = o.log;

  // the access-service stand-in: the D3 contract, byte for byte, so the extension's client is tested against it
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
    state.accessBodies.push(j);
    const id = j.access_id.toLowerCase();
    if (o.approved.includes(id)) return accessJson(res, 200, { approved: true, access_id: id, checked: new Date().toISOString(), until: null });
    return accessJson(res, 200, { approved: false, access_id: id, requestPage: 'https://openspineconsortium.com/beethoven/request.html' });
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

  const toReal = (virtualPath) => {
    const v = decodeURIComponent(virtualPath);
    if (v !== virtualHome && !v.startsWith(`${virtualHome}/`)) return undefined;
    const rel = v.slice(virtualHome.length).replace(/^\/+/, '');
    const real = path.resolve(realHome, rel);
    if (real !== realHome && !real.startsWith(realHome + path.sep)) return undefined;
    return real;
  };

  const hasCookie = (req) => !o.requireCookie || /(?:^|;\s*)mock_session=1(?:;|$)/.test(req.headers.cookie ?? '');
  const serverOrigin = (req) => `${o.tls ? 'https' : 'http'}://${req.headers.host}`;
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': typeof body === 'string' && body.startsWith('<!DOCTYPE') ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8', ...headers });
    res.end(body);
  };
  const redirect = (res, to) => {
    res.writeHead(302, { Location: to, 'Content-Type': 'text/html' });
    res.end(html('Redirecting', `<a href="${to}">Redirecting</a>`));
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

  const shellPageHtml = (host) =>
    html(
      'Shell - Open OnDemand',
      `<div id="terminal"></div>\n<script>\n  function get_url() {\n    var base = document.URL.replace(/^http/, 'ws').replace(/#.*$/, '');\n    var separator = '?';\n    if(base.includes('?')){ separator = '&'; }\n    return base + separator + "csrf=${shellToken()}";\n  }\n  var host = "${host}";\n</script>`,
    );

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

  async function handle(req, res) {
    const url = new URL(req.url, serverOrigin(req));
    const p = url.pathname;
    log(`${req.method} ${p}${url.search}`);
    if (p === '/login') {
      if (url.searchParams.get('go') === '1') {
        res.setHeader('Set-Cookie', `${COOKIE}=1; Path=/; HttpOnly; SameSite=Lax`);
        return redirect(res, url.searchParams.get('redirect') || '/pun/sys/dashboard/');
      }
      return send(res, 200, html('Sign in - Mock IdP', `<h1>Mock University sign-in</h1><p>This stands in for your university's identity provider.</p><p><a href="/login?go=1&redirect=${encodeURIComponent(url.searchParams.get('redirect') || '/pun/sys/dashboard/')}">Sign in as ${o.user}</a></p>`));
    }
    if (p === '/logout') {
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0`);
      return redirect(res, '/login');
    }
    if (p === '/' ) return redirect(res, '/pun/sys/dashboard/');
    // the access-service stand-in is not the portal: no portal cookie, CORS open, as Licensor's Worker answers
    if (p === '/beethoven/services.json') return send(res, 200, JSON.stringify({ access_check: `${serverOrigin(req)}/beethoven/access_check`, request_page: 'https://openspineconsortium.com/beethoven/request.html' }), { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=600' });
    if (p === '/beethoven/access_check') return accessCheck(req, res);
    // everything else sits behind the portal's authentication (Apache + mod_auth_openidc)
    if (!hasCookie(req)) return redirect(res, `/login?redirect=${encodeURIComponent(p)}`);
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
      const mine = filter === 'user' ? jobs.filter((j) => j.username === o.user) : jobs;
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
          res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': st.size });
          return fs.createReadStream(real).pipe(res);
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

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, serverOrigin(req));
    if (!hasCookie(req)) {
      // Apache answers the upgrade with the sign-in redirect; the client sees a failed handshake
      socket.write('HTTP/1.1 302 Found\r\nLocation: /login\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const m = /^\/pun\/sys\/shell\/ssh\/([^/?]+)/.exec(url.pathname);
    if (!m) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => connection(ws, req, m[1]));
  });

  function connection(ws, req, host) {
    state.shells++;
    const token = (req.url.match(/csrf=([^&]*)/) || [])[1];
    const clientOrigin = req.headers.origin;
    const origin = serverOrigin(req);
    // the four gates, in app.js order, each closing with 3146 and its exact reason string
    let authError = null;
    if (o.noClusters) authError = 'No clusters defined.';
    else if (clientOrigin && clientOrigin.startsWith('http') && origin && clientOrigin !== origin) authError = 'Invalid Origin.';
    else if (!shellTokenValid(token)) authError = 'Bad CSRF Token.';
    else if (!o.shellHosts.includes(host)) authError = `Host "${host}" not specified in allowlist or cluster configs.`;
    if (authError) {
      log(`shell refused: ${authError}`);
      ws.close(3146, authError);
      return;
    }
    const realHost = host === 'default' ? 'login1' : host;
    const out = (s) => {
      if (ws.readyState === 1) ws.send(s);
    };
    const prompt = () => out(`[${o.user}@${realHost} ~]$ `);
    let line = '';
    let child = null;
    const nodeDir = path.dirname(process.execPath);
    const env = {
      ...process.env,
      HOME: posix(realHome),
      MOCK_HOME: realHome,
      MOCK_LIB: LIB,
      MOCK_BIN: posix(BIN),
      MOCK_NODE_DIR: posix(nodeDir),
      MOCK_USER: o.user,
      MOCK_DISPLAY_HOME: displayHome,
      ...(sharedVirtual ? { MOCK_SHARED_INSTALL: sharedVirtual, MOCK_SHARED_REAL: sharedForShell } : {}),
      USER: o.user,
      TERM: 'xterm-16color',
    };
    const runLine = (l) => {
      if (!l.trim()) return prompt();
      if (/^\s*exit(\s+\d+)?\s*$/.test(l)) return ws.close(1000);
      // a line naming the lab's shared copy runs against its directory on disk (or, for an outsider, a path that is not there)
      const cmd = sharedVirtual ? l.split(sharedVirtual).join(sharedForShell) : l;
      child = spawn(bash, ['-c', `export PATH="$MOCK_BIN:$MOCK_NODE_DIR:$PATH"; cd "$HOME"\n${cmd}`], { env, cwd: realHome, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      const pipe = (s) => s.on('data', (d) => out(d.toString('utf8').replace(/\r?\n/g, '\r\n')));
      pipe(child.stdout);
      pipe(child.stderr);
      child.stdin.on('error', () => {});
      child.on('close', () => {
        child = null;
        // a trailing `exit` ends the login shell, which ends the ssh, which closes the socket
        if (/(^|[;&|]\s*)exit(\s+\d+)?\s*$/.test(l.trim())) ws.close(1000);
        else prompt();
      });
      child.on('error', (e) => out(`bash: ${e.message}\r\n`));
    };
    // a line typed while a command runs is that command's standard input (the pasted code of the plain login)
    const feedChild = (l) => {
      try {
        child.stdin.write(`${l}\n`);
      } catch {
        /* the command ended first */
      }
    };
    out(`Last login: ${new Date().toUTCString()} from 10.0.0.1\r\n`);
    prompt();
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
        for (const ch of m.input) {
          if (ch === '\r' || ch === '\n') {
            out('\r\n');
            const l = line;
            line = '';
            if (child) feedChild(l);
            else runLine(l);
          } else if (ch === '\x03' && child) {
            child.kill();
          } else if (ch === '\x7f' || ch === '\b') {
            line = line.slice(0, -1);
            out('\b \b');
          } else {
            line += ch;
            out(ch);
          }
        }
      }
      if (m && m.resize) {
        /* accepted and ignored, as a PTY resize would be */
      }
    });
    ws.on('close', () => {
      if (child) child.kill();
    });
  }

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
    /** the lab's shared copy as the portal shows it (the virtual path), when the mock keeps one */
    sharedInstall: sharedVirtual,
    /** the directory on disk behind it */
    sharedDir: sharedReal,
    async close() {
      for (const c of wss.clients) c.terminate();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// CLI: node mock-ood/server.mjs [--port N] [--host H] [--home DIR] [--display-home DIR] [--user NAME] [--approve a,b] [--access-limit N] [--rnode enabled] [--no-clusters] [--cold] [--cold-pun MS] [--no-cookie] [--job-composer] [--shared-install [PATH]] [--shared-version N] [--shared-unreadable] [--fresh-home] [--cert F --key F]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const val = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
  // --shared-install takes an optional path: the next argument unless it is another flag
  const sharedArg = a.includes('--shared-install') ? (val('--shared-install', '') ?? '') : undefined;
  const sharedInstall = sharedArg === undefined ? undefined : sharedArg && !sharedArg.startsWith('--') ? sharedArg : '/lab/shared/hpcworker/current';
  const portal = await createMockPortal({
    port: Number(val('--port', 8080)),
    host: val('--host', '127.0.0.1'),
    home: val('--home', undefined),
    displayHome: val('--display-home', undefined),
    user: val('--user', 'student'),
    approved: String(val('--approve', 'st1234')).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    accessLimit: Number(val('--access-limit', 0)) || 0,
    rnode: val('--rnode', 'disabled'),
    noClusters: a.includes('--no-clusters'),
    cold: a.includes('--cold'),
    coldPun: Number(val('--cold-pun', 0)) || 0,
    requireCookie: !a.includes('--no-cookie'),
    jobComposer: a.includes('--job-composer'),
    sharedInstall,
    sharedReadable: !a.includes('--shared-unreadable'),
    sharedVersion: val('--shared-version', '5'),
    // the reviewer's recipe: the stand-in set up as the account's own copy, unless a fresh home or a shared copy is asked for
    seedInstalled: !a.includes('--fresh-home') && !sharedInstall,
    tls: a.includes('--cert') ? { cert: val('--cert'), key: val('--key') } : undefined,
    log: (s) => console.log(`  ${s}`),
  });
  console.log(`mock Open OnDemand portal at ${portal.origin}`);
  console.log(`  sign in:   ${portal.origin}/login   (then the dashboard is ${portal.origin}/pun/sys/dashboard/)`);
  console.log(`  home dir:  ${portal.home}  (shown to the extension as ${portal.virtualHome}; the seeded tool prints it as ${portal.displayHome})`);
  if (portal.sharedInstall) console.log(`  shared:    ${portal.sharedDir} (the lab's shared copy, shown as ${portal.sharedInstall}${a.includes('--shared-unreadable') ? '; this account cannot read it' : ''}; the strip uses it when the site is one whose bundled profile names that path: open the mock at https://ondemand.wayne.localhost:${portal.port} for wayne, or set the site profile name in Details)`);
  else console.log(`  tool:      ${a.includes('--fresh-home') ? 'the stand-in command only (not set up: the strip uploads the real framework, whose install refuses a mock site)' : "the stand-in, set up as the account's own copy at the version the build carries"}`);
  console.log(`  user:      ${portal.user}`);
  console.log(`  shell:     ${portal.origin}/pun/sys/shell/ssh/default`);
  console.log(`  access:    ${portal.origin}/beethoven/access_check (tests only; approves ${portal.approved.join(', ') || 'nobody'})`);
  console.log('  Ctrl-C to stop');
}
