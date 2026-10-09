// extension/scripts/publish-store.mjs, the maintainer's upload to the Chrome Web Store, run as a process
// against a stand-in on 127.0.0.1 that plays Google's token endpoint and the store's fetchStatus, upload
// and publish, and records every request. What is checked is the tool's own work: the zip checks refuse
// before any request, the requests are the documented methods and paths with the bearer token, a sign-in
// Google no longer accepts says to sign in again, a refusal prints its error with every secret taken
// out, a test base other than 127.0.0.1 is refused, the saved files are 0600 in a 0700 folder, and the
// loopback sign-in end to end with this test playing the browser (BEETHOVEN_NO_OPEN=1 keeps the tool
// from starting one). The answers' bodies here are invented: the store's page does not describe them,
// and the tool reads none of their field names. Nothing here reaches Google; the whole flow against the
// real store is not yet measured.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const TOOL = path.join(REPO, 'extension', 'scripts', 'publish-store.mjs');
const VERSION = (JSON.parse(fs.readFileSync(path.join(REPO, 'extension', 'package.json'), 'utf8')) as { version: string }).version;
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const PUBLISHER = '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0';
const ITEM = 'abcdefghijklmnopabcdefghijklmnop';
const POSIX = process.platform !== 'win32';

// planted secrets: none of them may ever show in what the tool prints
const tag = crypto.randomBytes(8).toString('hex');
const CLIENT_ID = `planted-client-${tag}.apps.googleusercontent.com`;
const CLIENT_SECRET = `GOCSPX-planted-secret-${tag}`;
const REFRESH = `1//planted-refresh-${tag}-xyz`;
const ACCESS = `ya29.planted-access-${tag}-xyz`;
const CODE = `4/planted-code-${tag}`;
const planted = [CLIENT_SECRET, REFRESH, ACCESS, CODE];

interface Seen { method: string; url: string; headers: http.IncomingHttpHeaders; body: Buffer }
interface Answer { status: number; body: unknown }
interface Plan { refresh: Answer; exchange: Answer; status: Answer; upload: Answer; publish: Answer }
interface Result { code: number | null; out: string; err: string }

const fresh = (): Plan => ({
  refresh: { status: 200, body: { access_token: ACCESS, expires_in: 3599, scope: SCOPE, token_type: 'Bearer' } },
  exchange: { status: 200, body: { access_token: ACCESS, expires_in: 3599, refresh_token: REFRESH, scope: SCOPE, token_type: 'Bearer' } },
  status: { status: 200, body: { name: `publishers/${PUBLISHER}/items/${ITEM}`, itemId: ITEM, submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } } },
  upload: { status: 200, body: { name: `publishers/${PUBLISHER}/items/${ITEM}`, itemId: ITEM, crxVersion: VERSION, uploadState: 'SUCCEEDED' } },
  publish: { status: 200, body: { name: `publishers/${PUBLISHER}/items/${ITEM}`, itemId: ITEM, state: 'PENDING_REVIEW' } },
});

let plan: Plan = fresh();
let seen: Seen[] = [];
let server: http.Server;
let BASE = '';
const made: string[] = [];

function route(method: string, url: string, body: Buffer): Answer {
  const item = `publishers/${PUBLISHER}/items/${ITEM}`;
  if (method === 'POST' && url === '/token') {
    const grant = new URLSearchParams(body.toString('utf8')).get('grant_type');
    if (grant === 'refresh_token') return plan.refresh;
    if (grant === 'authorization_code') return plan.exchange;
    return { status: 400, body: { error: 'unsupported_grant_type' } };
  }
  if (method === 'GET' && url === `/v2/${item}:fetchStatus`) return plan.status;
  if (method === 'POST' && url === `/upload/v2/${item}:upload`) return plan.upload;
  if (method === 'POST' && url === `/v2/${item}:publish`) return plan.publish;
  return { status: 404, body: { error: { code: 404, message: 'not a path the stand-in knows', status: 'NOT_FOUND' } } };
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      const a = route(req.method ?? '', req.url ?? '', body);
      res.writeHead(a.status, { 'Content-Type': 'application/json' });
      res.end(typeof a.body === 'string' ? a.body : JSON.stringify(a.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});
beforeEach(() => {
  plan = fresh();
  seen = [];
});

function tmp(label: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `beethoven-cws-${label}-`));
  made.push(d);
  return d;
}

/** the tool as a child process: async, because the stand-in answers from this same process */
function start(args: string[], env: Record<string, string> = {}): { done: Promise<Result>; stdout: () => string } {
  const home = tmp('home');
  const base: Record<string, string | undefined> = { ...process.env, HOME: home, USERPROFILE: home, BEETHOVEN_NO_OPEN: '1', BEETHOVEN_CWS_TEST_BASE: BASE };
  delete base.BEETHOVEN_VENDOR_DIR;
  delete base.ASHLEY_VENDOR_DIR;
  const child = spawn(process.execPath, [TOOL, ...args], { env: { ...base, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.setEncoding('utf8').on('data', (d: string) => { out += d; });
  child.stderr.setEncoding('utf8').on('data', (d: string) => { err += d; });
  const done = new Promise<Result>((resolve) => child.on('close', (code) => resolve({ code, out, err })));
  return { done, stdout: () => out };
}

/** a finished run, already held to the secrets rule */
async function run(args: string[], env: Record<string, string> = {}, extra: string[] = []): Promise<Result> {
  const r = await start(args, env).done;
  expect(leaks(r, extra)).toEqual([]);
  return r;
}

const leaks = (r: Result, extra: string[] = []) => [...planted, ...extra].filter((s) => r.out.includes(s) || r.err.includes(s));

/** a vendor folder holding the sign-in exactly as sign-in writes it */
function vendor(label: string, mode = 0o600): string {
  const v = tmp(`vendor-${label}`);
  const dir = path.join(v, 'chrome-web-store');
  fs.mkdirSync(dir, { mode: 0o700 });
  const put = (name: string, value: unknown) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n', { mode });
    fs.chmodSync(p, mode);
  };
  put('client.json', { client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
  put('token.json', { refresh_token: REFRESH, scope: SCOPE, saved_at: '2026-10-04T19:30:00.000Z' });
  return v;
}

// ---- fabricated packages ------------------------------------------------------------------------

function zip(files: Record<string, Buffer | string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data) >>> 0;
    const body = zlib.deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

interface Pkg { manifest: Record<string, unknown>; files: Record<string, Buffer | string> }

/** a release package as npm run zip leaves it; `mutate` turns it wrong */
function pkg(label: string, mutate?: (p: Pkg) => void): string {
  const p: Pkg = {
    manifest: { manifest_version: 3, name: 'Beethoven', version: VERSION, permissions: ['storage', 'alarms', 'scripting', 'sidePanel', 'webRequest', 'webRequestAuthProvider'], optional_host_permissions: ['https://*/*'] },
    files: { 'background.js': 'console.log(1);\n', 'chunks/panel.js': crypto.randomBytes(3000) },
  };
  mutate?.(p);
  const file = path.join(tmp(`zip-${label}`), `beethoven-${VERSION}-chrome.zip`);
  fs.writeFileSync(file, zip({ 'manifest.json': JSON.stringify(p.manifest), ...p.files }));
  return file;
}

const UPLOAD = (z: string, ...more: string[]) => ['upload', '--publisher', PUBLISHER, '--item', ITEM, '--zip', z, ...more];
const requests = () => seen.map((s) => `${s.method} ${s.url}`);
const form = (s: Seen) => Object.fromEntries(new URLSearchParams(s.body.toString('utf8')));

// ---- the zip, before any request ------------------------------------------------------------------

describe('upload refuses a package before any request', () => {
  const cases: Array<{ label: string; mutate?: (p: Pkg) => void; says: RegExp; raw?: (file: string) => void }> = [
    { label: 'another version', mutate: (p) => { p.manifest.version = '13.0.0'; }, says: /its version is "13\.0\.0", and extension\/package\.json says/ },
    { label: 'a "key" field', mutate: (p) => { p.manifest.key = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA'; }, says: /has a "key" field/ },
    { label: 'a localhost permission (a development build)', mutate: (p) => { p.manifest.optional_host_permissions = ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*']; }, says: /names http:\/\/localhost\/\*, http:\/\/127\.0\.0\.1\/\*, so it is a development build/ },
    { label: 'a Manifest V2 package (the Firefox zip)', mutate: (p) => { p.manifest.manifest_version = 2; }, says: /manifest_version is 2/ },
    { label: 'no manifest.json at the top (a folder zipped one level up)', raw: (f) => { fs.writeFileSync(f, zip({ 'chrome-mv3/manifest.json': '{}' })); }, says: /no manifest\.json at its top level/ },
    { label: 'a file that is not a zip', raw: (f) => { fs.writeFileSync(f, 'not a zip at all'); }, says: /is not a zip file/ },
  ];
  for (const c of cases) {
    it(`refuses ${c.label}: exit 2, one plain sentence, no request`, async () => {
      const file = pkg('refuse', c.mutate);
      c.raw?.(file);
      const r = await run(UPLOAD(file, '--publish'), { BEETHOVEN_VENDOR_DIR: vendor('refuse') });
      expect(r.code, r.err).toBe(2);
      expect(r.err).toMatch(c.says);
      expect(r.err).toContain('is not uploaded: ');
      expect(r.out).toBe('');
      expect(seen).toEqual([]);
    });
  }

  it('a package that passes the checks but no saved sign-in: exit 3 and the sign-in sentence, no request', async () => {
    const r = await run(UPLOAD(pkg('nosignin')), { BEETHOVEN_VENDOR_DIR: tmp('empty-vendor') });
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/no Google sign-in is saved in .*; run node extension\/scripts\/publish-store\.mjs sign-in --client </);
    expect(seen).toEqual([]);
  });
});

// ---- the requests --------------------------------------------------------------------------------

describe('upload, publish and status against the stand-in', () => {
  it('upload --publish sends exactly the token renewal, the upload and the publish, with the bearer token', async () => {
    const file = pkg('full');
    const r = await run(UPLOAD(file, '--publish'), { BEETHOVEN_VENDOR_DIR: vendor('full') });
    expect(r.code, r.err).toBe(0);
    expect(requests()).toEqual([
      'POST /token',
      `POST /upload/v2/publishers/${PUBLISHER}/items/${ITEM}:upload`,
      `POST /v2/publishers/${PUBLISHER}/items/${ITEM}:publish`,
    ]);
    const [token, up, pub] = seen as [Seen, Seen, Seen];
    expect(token.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(form(token)).toEqual({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: REFRESH });
    expect(token.headers.authorization).toBeUndefined();
    expect(up.headers.authorization).toBe(`Bearer ${ACCESS}`);
    expect(up.body.equals(fs.readFileSync(file))).toBe(true);
    expect(pub.headers.authorization).toBe(`Bearer ${ACCESS}`);
    expect(pub.body.length).toBe(0);
    // what the tool printed: the package, then each answer's keys and state-like fields, generically
    expect(r.out).toContain(`beethoven-${VERSION}-chrome.zip: Beethoven ${VERSION}, ${fs.statSync(file).size} bytes, sha256 ${sha256(fs.readFileSync(file))}`);
    expect(r.out).toContain('upload: HTTP 200');
    expect(r.out).toContain('  top-level keys: name, itemId, crxVersion, uploadState');
    expect(r.out).toContain('  uploadState: SUCCEEDED');
    expect(r.out).toContain('publish: HTTP 200');
    expect(r.out).toContain('  state: PENDING_REVIEW');
    expect(r.out).toContain('Submitted for review.');
  });

  it('upload without --publish stops after the upload and names the publish command', async () => {
    const r = await run(UPLOAD(pkg('nopublish')), { BEETHOVEN_VENDOR_DIR: vendor('nopublish') });
    expect(r.code, r.err).toBe(0);
    expect(requests()).toEqual(['POST /token', `POST /upload/v2/publishers/${PUBLISHER}/items/${ITEM}:upload`]);
    expect(r.out).toContain(`Uploaded, not submitted. Submit it with: node extension/scripts/publish-store.mjs publish --publisher ${PUBLISHER} --item ${ITEM}`);
  });

  it('publish alone renews the token and submits', async () => {
    const r = await run(['publish', '--publisher', PUBLISHER, '--item', ITEM], { BEETHOVEN_VENDOR_DIR: vendor('publish') });
    expect(r.code, r.err).toBe(0);
    expect(requests()).toEqual(['POST /token', `POST /v2/publishers/${PUBLISHER}/items/${ITEM}:publish`]);
    expect(seen[1]!.headers.authorization).toBe(`Bearer ${ACCESS}`);
  });

  it('status is GET fetchStatus with the bearer token, printed generically', async () => {
    const r = await run(['status', '--publisher', PUBLISHER, '--item', ITEM], { BEETHOVEN_VENDOR_DIR: vendor('status') });
    expect(r.code, r.err).toBe(0);
    expect(requests()).toEqual(['POST /token', `GET /v2/publishers/${PUBLISHER}/items/${ITEM}:fetchStatus`]);
    expect(seen[1]!.headers.authorization).toBe(`Bearer ${ACCESS}`);
    expect(r.out).toContain('fetchStatus: HTTP 200');
    expect(r.out).toContain('  submittedItemRevisionStatus.state: PENDING_REVIEW');
    expect(r.out).toContain('  |   "itemId": "abcdefghijklmnopabcdefghijklmnop",');
  });

  it('invalid_grant from the renewal: exit 3, one sentence to sign in again, nothing uploaded', async () => {
    plan.refresh = { status: 400, body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } };
    const r = await run(UPLOAD(pkg('expired'), '--publish'), { BEETHOVEN_VENDOR_DIR: vendor('expired') });
    expect(r.code).toBe(3);
    expect(r.err).toContain('publish-store: Google no longer accepts the saved sign-in (saved 2026-10-04T19:30:00.000Z), so run node extension/scripts/publish-store.mjs sign-in again (one visit in the browser) and then this command again.');
    expect(requests()).toEqual(['POST /token']);
  });

  it('a 4xx from the upload: non-zero exit, the error printed with every secret it echoes redacted, no publish', async () => {
    plan.upload = {
      status: 403,
      body: { error: { code: 403, message: `The caller does not have permission (echo: Bearer ${ACCESS}, ${encodeURIComponent(REFRESH)}, ${CLIENT_SECRET})`, status: 'PERMISSION_DENIED' } },
    };
    const r = await run(UPLOAD(pkg('denied'), '--publish'), { BEETHOVEN_VENDOR_DIR: vendor('denied') });
    expect(r.code).toBe(1);
    expect(r.err).toContain('publish-store: the store refused the upload: HTTP 403, PERMISSION_DENIED: The caller does not have permission (echo: Bearer [redacted], [redacted], [redacted])');
    expect(r.out).toContain('upload: HTTP 403');
    expect(requests()).toEqual(['POST /token', `POST /upload/v2/publishers/${PUBLISHER}/items/${ITEM}:upload`]);
  });

  it('a 2xx upload whose answer reads as a failure stops before the publish', async () => {
    // invented names: the guard keys on "state", "status" and "error" in any field name, not on these
    plan.upload = { status: 200, body: { uploadState: 'FAILED', itemError: [{ error_detail: 'the manifest is invalid' }] } };
    const r = await run(UPLOAD(pkg('failed'), '--publish'), { BEETHOVEN_VENDOR_DIR: vendor('failed') });
    expect(r.code).toBe(1);
    expect(r.err).toContain('the upload answered HTTP 200, but uploadState is FAILED; nothing was submitted');
    expect(requests()).toEqual(['POST /token', `POST /upload/v2/publishers/${PUBLISHER}/items/${ITEM}:upload`]);
  });

  it('a 5xx from the publish after a good upload: exit 1 and the publish command still works on its own', async () => {
    plan.publish = { status: 503, body: 'Service Unavailable' };
    const r = await run(UPLOAD(pkg('pub503'), '--publish'), { BEETHOVEN_VENDOR_DIR: vendor('pub503') });
    expect(r.code).toBe(1);
    expect(r.err).toContain('the store did not take the submission: HTTP 503, Service Unavailable');
    expect(seen).toHaveLength(3);
  });

  it.skipIf(!POSIX)('refuses a saved sign-in other accounts can read, before any request', async () => {
    const r = await run(['status', '--publisher', PUBLISHER, '--item', ITEM], { BEETHOVEN_VENDOR_DIR: vendor('loose', 0o644) });
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/client\.json can be read by other accounts on this computer \(mode 644\); run chmod 600/);
    expect(seen).toEqual([]);
  });

  it('refuses a vendor folder inside the repository, and makes nothing there', async () => {
    const inside = path.join(REPO, 'extension', 'scripts', `vendor-never-${tag}`);
    const client = path.join(tmp('client-inside'), 'client.json');
    fs.writeFileSync(client, JSON.stringify({ installed: { client_id: CLIENT_ID, client_secret: CLIENT_SECRET } }));
    const r = await run(['sign-in', '--client', client], { BEETHOVEN_VENDOR_DIR: inside });
    expect(r.code).toBe(2);
    expect(r.err).toContain('is inside this repository');
    expect(fs.existsSync(inside)).toBe(false);
    expect(seen).toEqual([]);
  });

  it('takes paths and identifiers only: an unknown option is refused without echoing it', async () => {
    const r = await run(['status', '--publisher', PUBLISHER, '--item', ITEM, '--token', ACCESS], { BEETHOVEN_VENDOR_DIR: vendor('argv') });
    expect(r.code).toBe(2);
    expect(r.err).toContain('argument 5 is none of them');
    const bad = await run(['status', '--publisher', 'a/b', '--item', ITEM], { BEETHOVEN_VENDOR_DIR: vendor('argv2') });
    expect(bad.code).toBe(2);
    expect(seen).toEqual([]);
  });
});

// ---- the test base -------------------------------------------------------------------------------

describe('BEETHOVEN_CWS_TEST_BASE', () => {
  it('is refused for anything but http://127.0.0.1:<port>, before any request', async () => {
    const port = BASE.split(':').pop()!;
    const refused = [
      `http://localhost:${port}`,
      `https://127.0.0.1:${port}`,
      `http://127.0.0.1:${port}/`,
      `http://127.0.0.1:${port}/v2`,
      'http://127.0.0.1',
      `http://127.0.0.2:${port}`,
      `http://[::1]:${port}`,
      `http://127.0.0.1.example.com:${port}`,
      `http://user@127.0.0.1:${port}`,
      'http://127.0.0.1:99999',
      'https://chromewebstore.googleapis.com',
    ];
    const v = vendor('base');
    for (const value of refused) {
      const r = await run(['status', '--publisher', PUBLISHER, '--item', ITEM], { BEETHOVEN_VENDOR_DIR: v, BEETHOVEN_CWS_TEST_BASE: value });
      expect(r.code, value).toBe(2);
      expect(r.err, value).toContain('BEETHOVEN_CWS_TEST_BASE is taken only as http://127.0.0.1:<port>');
    }
    expect(seen).toEqual([]);
    const ok = await run(['status', '--publisher', PUBLISHER, '--item', ITEM], { BEETHOVEN_VENDOR_DIR: v });
    expect(ok.code, ok.err).toBe(0);
    expect(ok.err).toContain(`every request goes to the stand-in at ${BASE}, none to Google`);
  });
});

// ---- the sign-in ---------------------------------------------------------------------------------

describe('sign-in, the loopback flow, with this test as the browser', () => {
  it('prints the consent address, refuses a wrong state, takes the right one, exchanges the code with PKCE and saves 0600 files', async () => {
    const v = path.join(tmp('vendor-signin'), 'vendor');
    const downloads = tmp('downloads');
    const clientFile = path.join(downloads, 'client_secret_planted.apps.googleusercontent.com.json');
    fs.writeFileSync(clientFile, JSON.stringify({
      installed: {
        client_id: CLIENT_ID, project_id: 'beethoven-release', auth_uri: 'https://accounts.google.com/o/oauth2/auth', token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs', client_secret: CLIENT_SECRET, redirect_uris: ['http://localhost'],
      },
    }));
    const p = start(['sign-in', '--client', clientFile], { BEETHOVEN_VENDOR_DIR: v });

    // the address the student's browser would open
    let consent: URL | undefined;
    for (let i = 0; i < 200 && !consent; i++) {
      const m = /(http:\/\/127\.0\.0\.1:\d+\/o\/oauth2\/v2\/auth\?\S+)/.exec(p.stdout());
      if (m) consent = new URL(m[1]!);
      else await new Promise((r) => setTimeout(r, 25));
    }
    expect(consent, 'the consent address was printed').toBeDefined();
    const q = consent!.searchParams;
    expect(consent!.origin).toBe(BASE);
    expect(q.get('client_id')).toBe(CLIENT_ID);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('scope')).toBe(SCOPE);
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('prompt')).toBe('consent');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(q.get('state')).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const redirect = q.get('redirect_uri')!;
    expect(redirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(consent!.toString()).not.toContain(encodeURIComponent(CLIENT_SECRET));

    // the browser's favicon, an answer from some other sign-in, then Google's real answer
    expect((await fetch(`${redirect}/favicon.ico`)).status).toBe(404);
    const wrong = await fetch(`${redirect}/?state=not-this-one&code=${encodeURIComponent(`4/other-${tag}`)}`);
    expect(wrong.status).toBe(400);
    expect(await wrong.text()).toContain('does not belong to the sign-in that is running');
    expect(seen).toEqual([]);
    const right = await fetch(`${redirect}/?state=${q.get('state')}&code=${encodeURIComponent(CODE)}&scope=${encodeURIComponent(SCOPE)}`);
    expect(right.status).toBe(200);
    expect(await right.text()).toBe('Signed in. You can close this tab.\n');
    expect(right.headers.get('content-type')).toBe('text/plain; charset=utf-8');

    const r = await p.done;
    expect(r.code, r.err).toBe(0);
    expect(r.err).toContain('refused an answer whose state is not this sign-in\'s');
    expect(requests()).toEqual(['POST /token']);
    const f = form(seen[0]!);
    expect(Object.keys(f).sort()).toEqual(['client_id', 'client_secret', 'code', 'code_verifier', 'grant_type', 'redirect_uri']);
    expect(f).toMatchObject({ grant_type: 'authorization_code', code: CODE, redirect_uri: redirect, client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
    expect(crypto.createHash('sha256').update(f.code_verifier!).digest('base64url')).toBe(q.get('code_challenge'));
    expect(leaks(r, [f.code_verifier!])).toEqual([]);
    expect(r.out).toContain('Signed in. The sign-in is saved in ');
    expect(r.out).toContain(`delete it from ${downloads}`);

    const dir = path.join(v, 'chrome-web-store');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'client.json'), 'utf8'))).toEqual({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
    const token = JSON.parse(fs.readFileSync(path.join(dir, 'token.json'), 'utf8')) as Record<string, string>;
    expect(token.refresh_token).toBe(REFRESH);
    expect(Object.keys(token).sort()).toEqual(['refresh_token', 'saved_at', 'scope']);
    // the access token from the exchange is never kept
    expect(fs.readdirSync(dir).sort()).toEqual(['client.json', 'token.json']);
    for (const n of fs.readdirSync(dir)) expect(fs.readFileSync(path.join(dir, n), 'utf8')).not.toContain(ACCESS);
    if (POSIX) {
      expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(path.join(dir, 'client.json')).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.join(dir, 'token.json')).mode & 0o777).toBe(0o600);
    }

    // what the sign-in saved is what status uses
    seen = [];
    const s = await run(['status', '--publisher', PUBLISHER, '--item', ITEM], { BEETHOVEN_VENDOR_DIR: v });
    expect(s.code, s.err).toBe(0);
    expect(form(seen[0]!)).toEqual({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: REFRESH });
  });

  it('a second sign-in reuses the saved client, tightens a loosened file, and an error answer from Google ends it', async () => {
    const v = vendor('again');
    const tokenFile = path.join(v, 'chrome-web-store', 'token.json');
    const p = start(['sign-in'], { BEETHOVEN_VENDOR_DIR: v });
    let consent: URL | undefined;
    for (let i = 0; i < 200 && !consent; i++) {
      const m = /(http:\/\/127\.0\.0\.1:\d+\/o\/oauth2\/v2\/auth\?\S+)/.exec(p.stdout());
      if (m) consent = new URL(m[1]!);
      else await new Promise((r) => setTimeout(r, 25));
    }
    expect(consent).toBeDefined();
    const redirect = consent!.searchParams.get('redirect_uri')!;
    const res = await fetch(`${redirect}/?state=${consent!.searchParams.get('state')}&error=access_denied`);
    expect(res.status).toBe(200);
    const r = await p.done;
    expect(r.code).toBe(1);
    expect(r.err).toContain('Google did not sign you in (access_denied); run sign-in again');
    expect(seen).toEqual([]);
    expect(leaks(r)).toEqual([]);
    // the saved sign-in is left as it was
    expect((JSON.parse(fs.readFileSync(tokenFile, 'utf8')) as Record<string, string>).refresh_token).toBe(REFRESH);

    if (POSIX) {
      fs.chmodSync(tokenFile, 0o640);
      plan.exchange = { status: 200, body: { access_token: ACCESS, refresh_token: `${REFRESH}-2`, scope: SCOPE, token_type: 'Bearer' } };
      // a sign-in over a loosened token.json writes the new one 0600
      const q = start(['sign-in'], { BEETHOVEN_VENDOR_DIR: v });
      let c2: URL | undefined;
      for (let i = 0; i < 200 && !c2; i++) {
        const m = /(http:\/\/127\.0\.0\.1:\d+\/o\/oauth2\/v2\/auth\?\S+)/.exec(q.stdout());
        if (m) c2 = new URL(m[1]!);
        else await new Promise((r2) => setTimeout(r2, 25));
      }
      await fetch(`${c2!.searchParams.get('redirect_uri')}/?state=${c2!.searchParams.get('state')}&code=${encodeURIComponent(CODE)}`);
      const r2 = await q.done;
      expect(r2.code, r2.err).toBe(0);
      expect(leaks(r2, [`${REFRESH}-2`])).toEqual([]);
      expect(fs.statSync(tokenFile).mode & 0o777).toBe(0o600);
      expect((JSON.parse(fs.readFileSync(tokenFile, 'utf8')) as Record<string, string>).refresh_token).toBe(`${REFRESH}-2`);
    }
  });

  it('refuses a "Web application" client file and saves nothing', async () => {
    const v = path.join(tmp('vendor-web'), 'vendor');
    const clientFile = path.join(tmp('web'), 'client.json');
    fs.writeFileSync(clientFile, JSON.stringify({ web: { client_id: CLIENT_ID, client_secret: CLIENT_SECRET } }));
    const r = await run(['sign-in', '--client', clientFile], { BEETHOVEN_VENDOR_DIR: v });
    expect(r.code).toBe(2);
    expect(r.err).toContain('is a "Web application" client; this tool needs a "Desktop app" client');
    expect(fs.existsSync(v)).toBe(false);
    expect(seen).toEqual([]);
  });
});
