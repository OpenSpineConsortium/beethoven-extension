// Uploads a built Beethoven package to its Chrome Web Store item and, with --publish, submits it for
// review: the maintainer's last release step, run on his own computer after npm run zip
// (docs/store/SUBMISSION.md). greg, 2026-10-04 19:26Z: "i want the chrome extension to automatically
// upload the newest version to the chrome marketplace when its ready." Until 15.0.0 it lived in
// helper/release/ beside the bridge's release script; 16.0.0 removed the bridge and kept this.
//
//   node extension/scripts/publish-store.mjs sign-in [--client FILE]
//   node extension/scripts/publish-store.mjs status  --publisher ID --item ID
//   node extension/scripts/publish-store.mjs upload  --publisher ID --item ID --zip FILE [--publish]
//   node extension/scripts/publish-store.mjs publish --publisher ID --item ID
//
// Never in CI: a Google sign-in held as a CI secret is the standing credential this project keeps out
// of CI altogether.
//
// The sign-in is Google's installed-app loopback flow: a "Desktop app" OAuth client, a one-shot listener
// on 127.0.0.1 at an ephemeral port, PKCE (S256) and a random state. The store's API page reaches a
// refresh token through the OAuth 2.0 Playground, which hands the token to a third-party page; this tool
// never does. --client is the JSON Google Cloud downloads for the client, needed the first time only.
// The client's id and secret and the refresh token are kept in <vendor>/chrome-web-store/ (client.json,
// token.json; mode 0600, folder 0700), vendor being BEETHOVEN_VENDOR_DIR, else ASHLEY_VENDOR_DIR, else
// ~/.beethoven-vendor: the folder the signing keys already live in, which never enters a repository (one
// inside this checkout is refused). An access token lives in memory for one run.
//
// The client secret, the refresh token, the access token, the authorization code and the PKCE verifier
// never appear in argv, in stdout or stderr, in an error message or in a file outside the vendor folder:
// the command line takes paths and identifiers only, and every line printed goes through say() or tell(),
// which replace each of those values (and its URL-encoded forms) wherever an answer echoes one. A JSON
// parse error is never printed for a file that holds one, because Node quotes the text it choked on.
//
// Before any request, upload checks the zip: a zip, whose manifest.json is Manifest V3 with
// extension/package.json's version, no "key" (a pinned development identity) and no localhost, 127.x or
// [::1] origin (a development build).
//
// The answers of upload, fetchStatus and publish are not described on the store's API page, so nothing
// here depends on one of their field names: HTTP 2xx is success and anything else failure, with the
// body's error message; every answer is printed as its top-level keys, any field whose name says state or
// status, and then the body. One generic guard sits on top: an upload or publish that answers 2xx but
// carries a state-like field reading as a failure, or a non-empty field named like an error, stops the
// run there, because a 2xx that says "failed" is exactly the wrong-but-plausible state. The exact shapes
// are not yet measured.
//
// Exit codes: 0 every call answered 2xx; 1 a call failed, was cut off or answered with a failure;
// 2 refused before any request (arguments, the zip, the vendor folder, BEETHOVEN_CWS_TEST_BASE);
// 3 a sign-in is needed (none saved, or Google answered invalid_grant: it expires the refresh tokens of
// an app in "Testing" after seven days; whether that applies to this app is not yet measured).
//
// For the tests (extension/test/publishStore.test.ts): BEETHOVEN_CWS_TEST_BASE=http://127.0.0.1:<port>
// sends what would go to the three Google hosts to a stand-in on this computer, and any other value is
// refused, so a stray variable can never carry the saved token to another host. BEETHOVEN_NO_OPEN=1
// keeps sign-in from starting a browser, so the test can play the browser itself.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const ME = 'node extension/scripts/publish-store.mjs';
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const SIGN_IN_MS = 5 * 60_000;

class Stop extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const FAILED = 1;
const REFUSED = 2;
const SIGN_IN = 3;

// ---- what is never printed ----------------------------------------------------------------

const secrets = new Set();
/** marks a value as secret from here on, and hands it back */
function keep(v) {
  if (typeof v === 'string' && v.length >= 4) secrets.add(v);
  return v;
}
function redact(text) {
  let t = String(text);
  for (const s of [...secrets].sort((a, b) => b.length - a.length)) {
    for (const form of new Set([s, encodeURIComponent(s), new URLSearchParams({ v: s }).toString().slice(2), JSON.stringify(s).slice(1, -1)])) {
      t = t.split(form).join('[redacted]');
    }
  }
  // a backstop for a token this run never held (an answer quoting another one); the exact values above are what is relied on
  return t.replace(/\bya29\.[0-9A-Za-z._-]{20,}/g, '[redacted]').replace(/\b1\/\/[0-9A-Za-z._-]{20,}/g, '[redacted]');
}
const say = (msg) => process.stdout.write(redact(msg) + '\n');
const tell = (msg) => process.stderr.write(redact(msg) + '\n');

// ---- arguments ----------------------------------------------------------------------------

const COMMANDS = {
  'sign-in': { values: ['--client'], flags: [] },
  status: { values: ['--publisher', '--item'], flags: [] },
  upload: { values: ['--publisher', '--item', '--zip'], flags: ['--publish'] },
  publish: { values: ['--publisher', '--item'], flags: [] },
};
const USAGE = [
  `${ME} sign-in [--client FILE]`,
  `${ME} status  --publisher ID --item ID`,
  `${ME} upload  --publisher ID --item ID --zip FILE [--publish]`,
  `${ME} publish --publisher ID --item ID`,
].join('\n');

function parse(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') return { command: 'help' };
  const spec = COMMANDS[command];
  // a value is never echoed back here: whatever was typed by mistake might be a secret
  if (!spec) throw new Stop(REFUSED, `unknown command; the commands are:\n${USAGE}`);
  const o = { command, values: {}, flags: new Set() };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (spec.flags.includes(a)) { o.flags.add(a); continue; }
    if (!spec.values.includes(a)) throw new Stop(REFUSED, `${command} takes ${[...spec.values, ...spec.flags].join(', ') || 'no options'}; argument ${i + 1} is none of them (this tool takes paths and identifiers only, never a token or a secret)`);
    if (a in o.values) throw new Stop(REFUSED, `${a} is given twice`);
    const v = rest[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Stop(REFUSED, `${a} needs a value`);
    o.values[a] = v;
    i++;
  }
  for (const a of spec.values) {
    if (a !== '--client' && !(a in o.values)) throw new Stop(REFUSED, `${command} needs ${a}:\n${USAGE}`);
  }
  // both end up in a request path, so only characters that cannot leave it are taken
  const publisher = o.values['--publisher'];
  if (publisher !== undefined && !/^[A-Za-z0-9._-]{1,128}$/.test(publisher)) throw new Stop(REFUSED, '--publisher is the publisher ID from the developer dashboard (Publisher > Settings): letters, digits, ".", "_" and "-"');
  const item = o.values['--item'];
  if (item !== undefined && !/^[a-p]{32}$/.test(item)) throw new Stop(REFUSED, '--item is the item\'s ID: 32 letters, a to p');
  return o;
}

// ---- where requests go --------------------------------------------------------------------

function bases() {
  const t = process.env.BEETHOVEN_CWS_TEST_BASE;
  if (t === undefined || t === '') {
    return { accounts: 'https://accounts.google.com', oauth: 'https://oauth2.googleapis.com', store: 'https://chromewebstore.googleapis.com' };
  }
  const m = /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})$/.exec(t);
  if (!m || Number(m[1]) > 65535) throw new Stop(REFUSED, 'BEETHOVEN_CWS_TEST_BASE is taken only as http://127.0.0.1:<port>, a stand-in on this computer; unset it to reach Google');
  tell(`publish-store: BEETHOVEN_CWS_TEST_BASE is set: every request goes to the stand-in at ${t}, none to Google`);
  return { accounts: t, oauth: t, store: t };
}

// ---- the vendor folder --------------------------------------------------------------------

function real(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}
function storeDir() {
  const vendor = path.resolve(process.env.BEETHOVEN_VENDOR_DIR || process.env.ASHLEY_VENDOR_DIR || path.join(os.homedir(), '.beethoven-vendor'));
  // the nearest folder that exists decides, so a link into the checkout is caught before anything is made
  let probe = vendor;
  while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
  const rel = path.relative(real(REPO), path.join(real(probe), path.relative(probe, vendor)));
  if (rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))) {
    throw new Stop(REFUSED, `the vendor folder ${vendor} is inside this repository, and the Google sign-in must never be where git can see it; point BEETHOVEN_VENDOR_DIR at a folder outside it`);
  }
  return path.join(vendor, 'chrome-web-store');
}

function readSecretJson(file) {
  if (!fs.existsSync(file)) return undefined;
  if (process.platform !== 'win32') {
    const mode = fs.statSync(file).mode & 0o777;
    if (mode & 0o077) throw new Stop(REFUSED, `${file} can be read by other accounts on this computer (mode ${mode.toString(8)}); run chmod 600 on it, then this command again`);
  }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeSecretJson(file, value) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  // an existing file keeps its mode through open(); tighten it before the new secret goes in
  if (fs.existsSync(file)) fs.chmodSync(file, 0o600);
  const fd = fs.openSync(file, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); } finally { fs.closeSync(fd); }
  fs.chmodSync(file, 0o600);
}

const usable = (v) => typeof v === 'string' && v.length > 0 && !/\s/.test(v);

/** the saved client and refresh token, or a Stop that says to sign in */
function savedSignIn(dir) {
  const first = `run ${ME} sign-in --client <the Desktop app client file Google Cloud downloads> once, then this command again`;
  const client = readSecretJson(path.join(dir, 'client.json'));
  const token = readSecretJson(path.join(dir, 'token.json'));
  if (client === undefined || token === undefined) throw new Stop(SIGN_IN, `no Google sign-in is saved in ${dir}; ${first}`);
  if (!client || !usable(client.client_id) || !usable(client.client_secret) || !token || !usable(token.refresh_token)) {
    throw new Stop(SIGN_IN, `the sign-in saved in ${dir} is not what sign-in writes; ${first}`);
  }
  keep(client.client_secret);
  keep(token.refresh_token);
  return { client, token };
}

// ---- requests -----------------------------------------------------------------------------

async function call(method, url, { headers = {}, form, body, timeoutMs = 60_000 } = {}) {
  const h = { ...headers };
  let payload = body;
  if (form) {
    h['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form).toString();
  }
  let res;
  try {
    // a redirect is never followed: the bearer token goes to the one address named here and nowhere else
    res = await fetch(url, { method, headers: h, body: payload, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const why = e?.name === 'TimeoutError' ? `no answer within ${timeoutMs / 1000} s` : e?.cause?.code || e?.cause?.message || e?.message || 'the request failed';
    throw new Stop(FAILED, `${method} ${new URL(url).host}${new URL(url).pathname}: ${why}`);
  }
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, ok: res.status >= 200 && res.status < 300, text, json };
}

/** the error an answer gives: OAuth's error/error_description, a Google API's error.message, else the body */
function errorOf(r) {
  const j = r.json;
  if (j && typeof j === 'object') {
    if (typeof j.error === 'string') return typeof j.error_description === 'string' ? `${j.error}: ${j.error_description}` : j.error;
    if (j.error && typeof j.error === 'object') {
      const parts = [j.error.status, j.error.message].filter((x) => typeof x === 'string' && x);
      if (parts.length) return parts.join(': ');
    }
  }
  const t = r.text.trim();
  return t ? (t.length > 500 ? `${t.slice(0, 500)}...` : t) : 'an empty body';
}

const STATE_KEY = /state|status/i;
const ERROR_KEY = /error/i;
const FAILED_WORD = /fail|error|invalid|reject/i;

/** every field, at any depth, whose name says state or status and whose value is a plain value */
function stateFields(j) {
  const out = [];
  const visit = (v, at, depth) => {
    if (depth > 8 || v === null || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      const p = Array.isArray(v) ? `${at}[${k}]` : at ? `${at}.${k}` : k;
      if (!Array.isArray(v) && STATE_KEY.test(k) && ['string', 'number', 'boolean'].includes(typeof x)) out.push([p, String(x)]);
      else visit(x, p, depth + 1);
    }
  };
  visit(j, '', 0);
  return out;
}

/** why a 2xx answer still reads as a failure, or undefined; generic, since the shapes are not yet measured */
function failureIn(j) {
  for (const [p, v] of stateFields(j)) if (FAILED_WORD.test(v)) return `${p} is ${v}`;
  let found;
  const visit = (v, at, depth) => {
    if (found || depth > 8 || v === null || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      const p = Array.isArray(v) ? `${at}[${k}]` : at ? `${at}.${k}` : k;
      const filled = x !== null && x !== false && x !== 0 && x !== '' && !(Array.isArray(x) && !x.length) && !(typeof x === 'object' && !Array.isArray(x) && !Object.keys(x).length);
      if (!Array.isArray(v) && ERROR_KEY.test(k) && filled) { found = `${p} is not empty`; return; }
      visit(x, p, depth + 1);
    }
  };
  visit(j, '', 0);
  return found;
}

function report(label, r) {
  say(`${label}: HTTP ${r.status}`);
  const j = r.json;
  if (j && typeof j === 'object' && !Array.isArray(j)) {
    say(`  top-level keys: ${Object.keys(j).join(', ') || '(none)'}`);
    for (const [p, v] of stateFields(j)) say(`  ${p}: ${v}`);
  }
  const body = j !== undefined ? JSON.stringify(j, null, 2) : r.text.trim();
  if (body) {
    const shown = body.length > 8000 ? `${body.slice(0, 8000)}\n... (${body.length - 8000} more characters)` : body;
    for (const line of shown.split('\n')) say(`  | ${line}`);
  }
}

async function accessToken(b, s) {
  const r = await call('POST', `${b.oauth}/token`, {
    form: { client_id: s.client.client_id, client_secret: s.client.client_secret, grant_type: 'refresh_token', refresh_token: s.token.refresh_token },
  });
  if (!r.ok) {
    const since = typeof s.token.saved_at === 'string' ? ` (saved ${s.token.saved_at})` : '';
    if (r.json && r.json.error === 'invalid_grant') throw new Stop(SIGN_IN, `Google no longer accepts the saved sign-in${since}, so run ${ME} sign-in again (one visit in the browser) and then this command again.`);
    throw new Stop(FAILED, `Google did not renew the sign-in: HTTP ${r.status}, ${errorOf(r)}`);
  }
  const at = r.json && r.json.access_token;
  if (!usable(at)) throw new Stop(FAILED, `Google answered the renewal with HTTP ${r.status} but no access token`);
  return keep(at);
}

const itemPath = (b, o) => `${b.store}/v2/publishers/${o.values['--publisher']}/items/${o.values['--item']}`;

async function submit(b, o, access) {
  const r = await call('POST', `${itemPath(b, o)}:publish`, { headers: { Authorization: `Bearer ${access}` } });
  report('publish', r);
  if (!r.ok) throw new Stop(FAILED, `the store did not take the submission: HTTP ${r.status}, ${errorOf(r)}`);
  const bad = failureIn(r.json);
  if (bad) throw new Stop(FAILED, `the submission answered HTTP ${r.status}, but ${bad}; read the answer above and the item in the developer dashboard`);
  say('Submitted for review. Google reviews every upload; the item goes out to its testers when the review passes (status shows where it stands).');
}

// ---- the zip ------------------------------------------------------------------------------

/** a zip's entries from its central directory; undefined when the file is not a zip */
function readZip(buf) {
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) return undefined;
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) return undefined;
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  if (count === 0xffff || at === 0xffffffff) throw new Error('it is a ZIP64 archive, which no extension package needs');
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) throw new Error(`its central directory is damaged at entry ${i + 1}`);
    const flags = buf.readUInt16LE(at + 8);
    const e = { method: buf.readUInt16LE(at + 10), crc: buf.readUInt32LE(at + 16), csize: buf.readUInt32LE(at + 20), size: buf.readUInt32LE(at + 24), local: buf.readUInt32LE(at + 42) };
    const nameLen = buf.readUInt16LE(at + 28);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
    if (name.endsWith('/')) continue;
    if (flags & 1) throw new Error(`${name} is encrypted`);
    // two entries of one name: which one the store would take is not something to guess
    if (entries.has(name)) throw new Error(`${name} is in it twice`);
    entries.set(name, e);
  }
  const read = (name) => {
    const e = entries.get(name);
    if (buf.readUInt32LE(e.local) !== 0x04034b50) throw new Error(`${name} has no local header where the directory says`);
    const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
    const raw = buf.subarray(start, start + e.csize);
    let data;
    if (e.method === 0) data = Buffer.from(raw);
    else if (e.method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`${name} uses compression method ${e.method}`);
    if (data.length !== e.size || (zlib.crc32(data) >>> 0) !== e.crc) throw new Error(`${name} does not match its checksum`);
    return data;
  };
  return { entries, read };
}

const LOCAL_ORIGIN = /:\/\/(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[::1\])(?=[:/]|$)/i;

/** the origins a development build adds, wherever a manifest can name an origin */
function localOrigins(m) {
  const lists = [m.host_permissions, m.optional_host_permissions, m.permissions, m.optional_permissions, m.externally_connectable && m.externally_connectable.matches];
  for (const k of ['content_scripts', 'web_accessible_resources']) if (Array.isArray(m[k])) for (const x of m[k]) lists.push(x && x.matches);
  const csp = m.content_security_policy;
  const strings = [...lists.filter(Array.isArray).flat(), ...(typeof csp === 'string' ? [csp] : csp && typeof csp === 'object' ? Object.values(csp) : [])];
  return [...new Set(strings.filter((s) => typeof s === 'string' && LOCAL_ORIGIN.test(s)))];
}

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function checkZip(file) {
  const name = path.basename(file);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Stop(REFUSED, `${file} is not a file`);
  const refuse = (why) => { throw new Stop(REFUSED, `${name} is not uploaded: ${why}`); };
  const buf = fs.readFileSync(file);
  let z;
  try { z = readZip(buf); } catch (e) { refuse(`it is not a zip this tool can read: ${e.message}`); }
  if (!z) refuse('it is not a zip file');
  const json = (entry) => {
    let data;
    try { data = z.read(entry); } catch (e) { refuse(e.message); }
    try { return JSON.parse(data.toString('utf8')); } catch { refuse(`its ${entry} is not JSON`); }
  };
  if (!z.entries.has('manifest.json')) refuse('it has no manifest.json at its top level, so it is not an extension package (the sources zip?)');
  const m = json('manifest.json');
  if (!m || typeof m !== 'object' || Array.isArray(m)) refuse('its manifest.json is not a JSON object');
  if (m.manifest_version !== 3) refuse(`its manifest_version is ${JSON.stringify(m.manifest_version)}, and the Chrome package is Manifest V3 (the Firefox zip?)`);
  const version = JSON.parse(fs.readFileSync(path.join(REPO, 'extension', 'package.json'), 'utf8')).version;
  if (m.version !== version) refuse(`its version is ${JSON.stringify(m.version)}, and extension/package.json says ${version}; zip this version again (npm run zip in extension/)`);
  if (Object.hasOwn(m, 'key')) refuse('its manifest.json has a "key" field, which pins a development identity; the store gives the item its own');
  const local = localOrigins(m);
  if (local.length) refuse(`its manifest names ${local.join(', ')}, so it is a development build (npm run build:dev); zip a release build with npm run zip`);
  return { buf, version };
}

// ---- the sign-in --------------------------------------------------------------------------

const b64url = (b) => b.toString('base64url');

function sameState(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** the one-shot listener on 127.0.0.1: resolves to { port, answer }, where answer resolves to the code */
function listen(state) {
  return new Promise((ready, failed) => {
    let settle;
    const answer = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    let done = false;
    let timer;
    const server = http.createServer((req, res) => {
      const reply = (status, text, last = false) => {
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'close' });
        if (last) res.on('finish', () => server.closeAllConnections());
        res.end(`${text}\n`);
      };
      if (done) return reply(410, 'This sign-in has already finished. You can close this tab.');
      let u;
      try { u = new URL(req.url ?? '/', 'http://127.0.0.1'); } catch { return reply(400, 'Not a sign-in answer.'); }
      // the browser's own extra requests (a favicon) are not answers; the sign-in keeps waiting
      if (req.method !== 'GET' || u.pathname !== '/') return reply(404, 'Not found.');
      if (!sameState(u.searchParams.get('state') ?? '', state)) {
        tell('publish-store: refused an answer whose state is not this sign-in\'s (an older tab, or not from Google); still waiting');
        return reply(400, 'This answer does not belong to the sign-in that is running, so it was refused. You can close this tab.');
      }
      const error = u.searchParams.get('error');
      const code = u.searchParams.get('code');
      if (error) {
        finish();
        reply(200, 'The sign-in did not finish. You can close this tab.', true);
        return settle.reject(new Stop(FAILED, `Google did not sign you in (${error.replace(/[^\w.-]/g, '').slice(0, 64)}); run sign-in again`));
      }
      if (!code) return reply(400, 'This answer carries no sign-in code.');
      keep(code);
      finish();
      reply(200, 'Signed in. You can close this tab.', true);
      settle.resolve(code);
    });
    function finish() {
      done = true;
      clearTimeout(timer);
      server.close();
      server.closeIdleConnections();
    }
    server.on('error', (e) => failed(new Stop(FAILED, `could not listen on 127.0.0.1 for the browser: ${e.code || e.message}`)));
    server.listen(0, '127.0.0.1', () => {
      timer = setTimeout(() => {
        if (done) return;
        finish();
        server.closeAllConnections();
        settle.reject(new Stop(FAILED, 'no answer from the browser within 5 minutes; run sign-in again'));
      }, SIGN_IN_MS);
      ready({ port: server.address().port, answer });
    });
  });
}

/** the system's own link opener, given an argv array, never a shell string; the printed address is the fallback */
function openInBrowser(url) {
  // the tests set this and play the browser themselves
  if (process.env.BEETHOVEN_NO_OPEN === '1') return;
  // cmd's start reads its first quoted argument as a window title, hence the empty one; the address is
  // quoted by hand (verbatim) because cmd would cut it at the first & otherwise. It holds no quote mark
  // (URLSearchParams encodes them). Not yet measured on Windows; the address printed above always works.
  const [cmd, args, extra] = process.platform === 'darwin' ? ['open', [url], {}]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', `"${url}"`], { windowsVerbatimArguments: true }]
      : ['xdg-open', [url], {}];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, ...extra });
    child.on('error', () => say('(No browser could be started from here; open the address above yourself.)'));
    child.unref();
  } catch {
    say('(No browser could be started from here; open the address above yourself.)');
  }
}

async function signIn(o) {
  const b = bases();
  const dir = storeDir();
  const clientFile = path.join(dir, 'client.json');
  let client;
  if (o.values['--client'] !== undefined) {
    const from = path.resolve(o.values['--client']);
    if (!fs.existsSync(from) || !fs.statSync(from).isFile()) throw new Stop(REFUSED, `${from} is not a file`);
    let j;
    try { j = JSON.parse(fs.readFileSync(from, 'utf8')); } catch { throw new Stop(REFUSED, `${from} is not JSON; give the file Google Cloud downloads for a Desktop app OAuth client`); }
    if (j && typeof j === 'object' && j.web && !j.installed) throw new Stop(REFUSED, `${from} is a "Web application" client; this tool needs a "Desktop app" client (its file starts with "installed")`);
    const c = j && typeof j === 'object' ? j.installed : undefined;
    if (!c || !usable(c.client_id) || !usable(c.client_secret)) throw new Stop(REFUSED, `${from} is not the file Google Cloud downloads for a Desktop app OAuth client (no "installed" with client_id and client_secret)`);
    client = { client_id: c.client_id, client_secret: keep(c.client_secret) };
    writeSecretJson(clientFile, client);
    say(`Saved the client's id and secret in ${clientFile} (mode 0600).`);
  } else {
    const c = readSecretJson(clientFile);
    if (c === undefined) throw new Stop(REFUSED, `no client is saved in ${dir} yet: the first sign-in takes --client <the Desktop app client file Google Cloud downloads>`);
    if (!c || !usable(c.client_id) || !usable(c.client_secret)) throw new Stop(REFUSED, `${clientFile} is not what sign-in writes; run sign-in --client <the Desktop app client file> again`);
    client = { client_id: c.client_id, client_secret: keep(c.client_secret) };
  }

  const verifier = keep(b64url(crypto.randomBytes(32)));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(24));
  const { port, answer } = await listen(state);
  const redirect = `http://127.0.0.1:${port}`;
  const consent = `${b.accounts}/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirect,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  })}`;
  say('Sign in with the Google account that owns Beethoven in the Chrome Web Store, and allow it to manage your extensions, at:');
  say(consent);
  openInBrowser(consent);
  say('Waiting for the browser (5 minutes at most)...');
  const code = await answer;

  const r = await call('POST', `${b.oauth}/token`, {
    form: { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect, client_id: client.client_id, client_secret: client.client_secret },
  });
  if (r.json && typeof r.json === 'object') keep(r.json.access_token);
  if (!r.ok) throw new Stop(FAILED, `Google did not complete the sign-in: HTTP ${r.status}, ${errorOf(r)}`);
  const refresh = r.json && r.json.refresh_token;
  if (!usable(refresh)) throw new Stop(FAILED, 'Google completed the sign-in but sent no refresh token, so nothing was saved; run sign-in again');
  keep(refresh);
  // with granular consent the box can be left unticked; a token without the scope would only fail later
  if (typeof r.json.scope === 'string' && !r.json.scope.split(' ').includes(SCOPE)) {
    throw new Stop(FAILED, 'the sign-in did not allow access to the Chrome Web Store, so nothing was saved; run sign-in again and tick it');
  }
  const tokenFile = path.join(dir, 'token.json');
  writeSecretJson(tokenFile, { refresh_token: refresh, scope: SCOPE, saved_at: new Date().toISOString() });
  say(`Signed in. The sign-in is saved in ${tokenFile} (mode 0600); status, upload and publish use it from now on.`);
  if (o.values['--client'] !== undefined) say(`The file given with --client still holds the client secret; it is not needed again, so delete it from ${path.dirname(path.resolve(o.values['--client']))}.`);
}

// ---- status, upload, publish --------------------------------------------------------------

async function status(o) {
  const b = bases();
  const s = savedSignIn(storeDir());
  const access = await accessToken(b, s);
  const r = await call('GET', `${itemPath(b, o)}:fetchStatus`, { headers: { Authorization: `Bearer ${access}` } });
  report('fetchStatus', r);
  if (!r.ok) throw new Stop(FAILED, `the store did not give the item's status: HTTP ${r.status}, ${errorOf(r)}`);
}

async function upload(o) {
  const b = bases();
  const file = path.resolve(o.values['--zip']);
  const item = o.values['--item'];
  const z = checkZip(file);
  const s = savedSignIn(storeDir());
  say(`${path.basename(file)}: Beethoven ${z.version}, ${z.buf.length} bytes, sha256 ${sha256(z.buf)}`);
  const access = await accessToken(b, s);
  const up = await call('POST', `${b.store}/upload/v2/publishers/${o.values['--publisher']}/items/${item}:upload`, {
    headers: { Authorization: `Bearer ${access}` },
    body: z.buf,
    timeoutMs: 10 * 60_000,
  });
  report('upload', up);
  if (!up.ok) throw new Stop(FAILED, `the store refused the upload: HTTP ${up.status}, ${errorOf(up)}`);
  const bad = failureIn(up.json);
  if (bad) throw new Stop(FAILED, `the upload answered HTTP ${up.status}, but ${bad}; nothing was submitted (read the answer above and the item in the developer dashboard)`);
  if (!o.flags.has('--publish')) {
    say(`Uploaded, not submitted. Submit it with: ${ME} publish --publisher ${o.values['--publisher']} --item ${item}`);
    return;
  }
  await submit(b, o, access);
}

async function publish(o) {
  const b = bases();
  const s = savedSignIn(storeDir());
  await submit(b, o, await accessToken(b, s));
}

async function main() {
  const o = parse(process.argv.slice(2));
  if (o.command === 'help') { say(USAGE); return; }
  if (o.command === 'sign-in') return signIn(o);
  if (o.command === 'status') return status(o);
  if (o.command === 'upload') return upload(o);
  return publish(o);
}

// exitCode rather than exit(): on macOS a piped stdout is written asynchronously, and exit() would cut it
main().catch((e) => {
  tell(`publish-store: ${e instanceof Stop ? e.message : `stopped: ${e && e.message ? e.message : e}`}`);
  process.exitCode = e instanceof Stop ? e.code : FAILED;
});
