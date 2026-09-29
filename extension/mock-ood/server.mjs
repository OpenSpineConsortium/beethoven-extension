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
// The fake PTY is a real bash (Git Bash on Windows) running each typed line with the mock's
// scheduler commands (bin/) first on PATH, so the shell semantics the extension relies on are
// real; only the cluster is fake. The Files routes are jailed to a virtual home (/home/<user>)
// mapped onto a directory on disk.
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
    jobComposer: false,
    shellHosts: ['default', 'login1', 'login2'],
    seedTool: true,
    tls: undefined,
    log: () => {},
    ...opts,
  };
  const realHome = o.home ? path.resolve(o.home) : fs.mkdtempSync(path.join(os.tmpdir(), 'mock-ood-home-'));
  fs.mkdirSync(realHome, { recursive: true });
  const virtualHome = `/home/${o.user}`;
  if (o.seedTool) {
    const dir = path.join(realHome, '.hpcworker', 'bin');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(BIN, 'hpcworker'), path.join(dir, 'hpcworker'));
  }
  const bash = findBash();
  const railsToken = crypto.randomBytes(32).toString('base64');
  const shellSecret = crypto.randomBytes(24).toString('base64url');
  const state = { coldDone: !o.cold, shells: 0, frames: 0, fatal: 0 };
  const log = o.log;

  // the shell app's tokens: salt-hash, verified against a per-process secret (the csrf module's shape)
  const shellToken = () => {
    const salt = crypto.randomBytes(8).toString('hex');
    return `${salt}-${crypto.createHash('sha1').update(`${salt}-${shellSecret}`).digest('hex')}`;
  };
  const shellTokenValid = (t) => {
    const m = /^([a-f0-9]+)-([a-f0-9]+)$/.exec(String(t ?? ''));
    return !!m && crypto.createHash('sha1').update(`${m[1]}-${shellSecret}`).digest('hex') === m[2];
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
    // everything else sits behind the portal's authentication (Apache + mod_auth_openidc)
    if (!hasCookie(req)) return redirect(res, `/login?redirect=${encodeURIComponent(p)}`);
    if (p === '/nginx/init') {
      state.coldDone = true;
      return redirect(res, url.searchParams.get('redir') || '/pun/sys/dashboard/');
    }
    if (p.startsWith('/pun/') && !state.coldDone) return redirect(res, `/nginx/init?redir=${encodeURIComponent(p)}`);

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
      const real = toReal(virtualPath);
      if (!real) return send(res, 403, JSON.stringify({ error_message: 'path not allowed by the mock (outside the virtual home)' }));
      if (req.method === 'GET') {
        if (!fs.existsSync(real)) return send(res, 404, html('Not Found', `<h1>${virtualPath} does not exist</h1>`));
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
      USER: o.user,
      TERM: 'xterm-16color',
    };
    const runLine = (l) => {
      if (!l.trim()) return prompt();
      if (/^\s*exit(\s+\d+)?\s*$/.test(l)) return ws.close(1000);
      child = spawn(bash, ['-c', `export PATH="$MOCK_BIN:$MOCK_NODE_DIR:$PATH"; cd "$HOME"\n${l}`], { env, cwd: realHome, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      const pipe = (s) => s.on('data', (d) => out(d.toString('utf8').replace(/\r?\n/g, '\r\n')));
      pipe(child.stdout);
      pipe(child.stderr);
      child.on('close', () => {
        child = null;
        // a trailing `exit` ends the login shell, which ends the ssh, which closes the socket
        if (/(^|[;&|]\s*)exit(\s+\d+)?\s*$/.test(l.trim())) ws.close(1000);
        else prompt();
      });
      child.on('error', (e) => out(`bash: ${e.message}\r\n`));
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
            runLine(l);
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
    user: o.user,
    railsToken,
    state,
    cookie: `${COOKIE}=1`,
    async close() {
      for (const c of wss.clients) c.terminate();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// CLI: node mock-ood/server.mjs [--port N] [--host H] [--home DIR] [--user NAME] [--rnode enabled] [--no-clusters] [--cold] [--no-cookie] [--job-composer] [--cert F --key F]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const val = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
  const portal = await createMockPortal({
    port: Number(val('--port', 8080)),
    host: val('--host', '127.0.0.1'),
    home: val('--home', undefined),
    user: val('--user', 'student'),
    rnode: val('--rnode', 'disabled'),
    noClusters: a.includes('--no-clusters'),
    cold: a.includes('--cold'),
    requireCookie: !a.includes('--no-cookie'),
    jobComposer: a.includes('--job-composer'),
    tls: a.includes('--cert') ? { cert: val('--cert'), key: val('--key') } : undefined,
    log: (s) => console.log(`  ${s}`),
  });
  console.log(`mock Open OnDemand portal at ${portal.origin}`);
  console.log(`  sign in:   ${portal.origin}/login   (then the dashboard is ${portal.origin}/pun/sys/dashboard/)`);
  console.log(`  home dir:  ${portal.home}  (shown to the extension as ${portal.virtualHome})`);
  console.log(`  user:      ${portal.user}`);
  console.log(`  shell:     ${portal.origin}/pun/sys/shell/ssh/default`);
  console.log('  Ctrl-C to stop');
}
