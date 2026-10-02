// End to end in a real browser: Chromium (Playwright's Chrome for Testing) loads a tiny test
// extension that asks for the bridge with chrome.runtime.connectNative, exactly as Beethoven will,
// so Chromium itself finds the installed manifest, checks allowed_origins and starts the host.
// The page then speaks protocol 1 through the bridge to a local echo server.
//
//   node test/e2e-chromium.mjs make-extension --dir DIR        prints the test extension's id
//   node test/e2e-chromium.mjs run --dir DIR --host-dir INSTALLED_BRIDGE_DIR --playwright PATH
//
// The extension's id is fixed by the public key in its manifest ("key"), which this script makes,
// so the bridge can be built for it before the browser starts. Nothing here touches a real
// browser profile: the browser runs on a fresh profile folder under DIR.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { echoServer } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const cmd = args[0];
const dir = path.resolve(opt('--dir') || 'e2e-work');
const extDir = path.join(dir, 'ext');

function extensionId(spkiDer) {
  const hex = crypto.createHash('sha256').update(spkiDer).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

const PAGE_JS = `
// Runs on the test extension's own page. Every step is reported to the window, which the test reads.
const out = { steps: [] };
const q = new URLSearchParams(location.search);
const echoPort = Number(q.get('port'));
function step(s) { out.steps.push(s); }
const port = chrome.runtime.connectNative('com.openspineconsortium.beethoven.bridge');
const inbox = [];
let waiter = null;
port.onMessage.addListener((m) => { inbox.push(m); if (waiter) { const w = waiter; waiter = null; w(); } });
port.onDisconnect.addListener(() => { out.disconnected = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'disconnected'; if (waiter) { const w = waiter; waiter = null; w(); } });
async function next(pred, ms = 30000) {
  const t0 = Date.now();
  for (;;) {
    const i = inbox.findIndex(pred);
    if (i >= 0) return inbox.splice(i, 1)[0];
    if (out.disconnected) throw new Error('port disconnected: ' + out.disconnected);
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => { waiter = r; setTimeout(r, 200); });
  }
}
(async () => {
  const t0 = performance.now();
  port.postMessage({ t: 'hello', v: 1 });
  const h = await next((m) => m.t === 'hello');
  out.hello = h;
  out.helloMs = Math.round(performance.now() - t0);
  step('hello');
  port.postMessage({ t: 'open', id: 'e1', host: '127.0.0.1', port: echoPort });
  const o = await next((m) => m.id === 'e1');
  if (o.t !== 'opened') throw new Error('open: ' + JSON.stringify(o));
  step('opened');
  const bytes = new Uint8Array(100000);
  for (let i = 0; i < bytes.length; i += 65536) crypto.getRandomValues(bytes.subarray(i, i + 65536));
  let b64 = '';
  for (let i = 0; i < bytes.length; i += 30000) b64 += btoa(String.fromCharCode(...bytes.subarray(i, i + 30000)));
  // 100000 bytes in three data messages of whole base64 quads
  const parts = [b64.slice(0, 40000), b64.slice(40000, 80000), b64.slice(80000)];
  for (const p of parts) port.postMessage({ t: 'data', id: 'e1', b64: p });
  let got = 0;
  const chunks = [];
  while (got < bytes.length) {
    const d = await next((m) => m.t === 'data' && m.id === 'e1');
    const raw = atob(d.b64);
    got += raw.length;
    chunks.push(raw);
  }
  const back = chunks.join('');
  let same = back.length === bytes.length;
  for (let i = 0; same && i < bytes.length; i++) if (back.charCodeAt(i) !== bytes[i]) same = false;
  out.echoSame = same;
  step('echo');
  port.postMessage({ t: 'open', id: 'e2', host: 'evil.example.com', port: 22 });
  out.refused = await next((m) => m.id === 'e2');
  step('refused');
  port.postMessage({ t: 'close', id: 'e1' });
  out.closed = await next((m) => m.t === 'closed' && m.id === 'e1');
  step('closed');
  port.disconnect();
  out.done = true;
})().catch((e) => { out.error = String(e && e.message || e); }).finally(() => { window.__result = out; });
`;

if (cmd === 'make-extension') {
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const der = publicKey.export({ type: 'spki', format: 'der' });
  const id = extensionId(der);
  fs.mkdirSync(extDir, { recursive: true });
  fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: 'Beethoven bridge test',
    version: '1.0.0',
    key: der.toString('base64'),
    permissions: ['nativeMessaging'],
  }, null, 2));
  fs.writeFileSync(path.join(extDir, 'page.html'), '<!doctype html><meta charset="utf-8"><title>bridge test</title><script src="page.js"></script>\n');
  fs.writeFileSync(path.join(extDir, 'page.js'), PAGE_JS);
  fs.writeFileSync(path.join(dir, 'extension-id.txt'), id + '\n');
  console.log(id);
  process.exit(0);
}

if (cmd === 'run') {
  const id = fs.readFileSync(path.join(dir, 'extension-id.txt'), 'utf8').trim();
  const hostDir = path.resolve(opt('--host-dir'));
  const pw = await import(pathToFileURL(path.join(path.resolve(opt('--playwright')), 'index.mjs')).href);
  const echo = await echoServer();
  const allowFile = path.join(hostDir, 'allow.txt');
  const hadAllow = fs.existsSync(allowFile) ? fs.readFileSync(allowFile) : null;
  fs.writeFileSync(allowFile, `127.0.0.1:${echo.port}\n`);
  const profile = path.join(dir, 'profile');
  fs.rmSync(profile, { recursive: true, force: true });
  let ctx;
  let result;
  try {
    ctx = await pw.chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
    });
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${id}/page.html?port=${echo.port}`);
    await page.waitForFunction(() => window.__result !== undefined, null, { timeout: 90000 });
    result = await page.evaluate(() => window.__result);
  } catch (e) {
    result = { error: `browser: ${e.message}` };
  } finally {
    if (ctx) await ctx.close();
    echo.close();
    if (hadAllow) fs.writeFileSync(allowFile, hadAllow); else fs.rmSync(allowFile, { force: true });
  }
  const ok = result.done && result.echoSame && result.hello?.helper && result.refused?.reason === 'not_allowed' && result.closed?.reason === 'local';
  console.log(JSON.stringify(result));
  console.log(ok ? `RESULT OK: Chromium started the installed bridge (${result.hello.os}/${result.hello.runtime} ${result.hello.helper}) in ${result.helloMs} ms, echoed 100000 bytes, refused an unlisted host, closed`
    : `RESULT FAIL: ${result.error || 'see the steps above'}`);
  process.exit(ok ? 0 : 1);
}

console.error('usage: e2e-chromium.mjs make-extension|run --dir DIR [...]');
process.exit(2);
