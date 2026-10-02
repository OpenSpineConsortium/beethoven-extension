// The browser harness for Beethoven 11.0.0: it builds nothing. It loads the unpacked package
// (.output/chrome-mv3) into Playwright's Chromium with a fresh profile, starts the mock portal
// (mock-ood/server.mjs) as a child process, and records, for one scenario:
//   - a numbered moment for every step: the visible text of the panel and of the page in front
//     (NN-slug.txt), a screenshot of each (NN-slug.panel.png, NN-slug.page.png) and of the whole
//     browser window as it is on the screen (NN-slug.window.png: Chrome's own prompt and sign-in box
//     are only there);
//   - every request the extension and its tabs make, wherever it goes (requests.json; the mock's own
//     log of what it answered is mock-log.json), every tab opened or closed (tabs.json), every Chrome
//     permission prompt (prompts.json), and a timeline (events.log);
//   - PASS and FAIL lines against the specification's words (result.json).
//
// The side panel is driven as the real side panel: Chrome exposes it as a page target that
// Playwright does not attach, so the harness talks to it over its own DevTools socket (the browser
// runs with --remote-debugging-port): trusted mouse clicks and key presses (Input.*), screenshots
// (Page.captureScreenshot), its text (Runtime.evaluate) and its network requests (Network.*). Only
// when no side panel exists (a browser without one, or the gesture failed) does the harness open
// sidepanel.html as a tab, and the report says so.
//
// Nothing here reaches the university or Anthropic: the browser's resolver maps claude.ai,
// claude.com, anthropic.com (and subdomains), ondemand.grid.wayne.edu, *.grid.wayne.edu and
// protect.wayne.edu to NOTFOUND, Anthropic pages are answered by local stand-ins, and requests to the
// university's hosts are aborted and reported as FAIL. The lab's access service (*.workers.dev) is
// unreachable unless --live-access, and then only for the account st1234 and the portal "localhost".
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { anthropicPage } from './anthropic.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const E2E = path.resolve(here, '..');
export const EXTENSION = path.resolve(E2E, '..');
const SCRATCH = 'C:/Users/grego/AppData/Local/Temp/claude/c--Users-grego-OneDrive-Desktop-CTSpinoPelvic1K-1/0599380b-0d32-4e19-b5be-65bdd1017566/scratchpad';
export const OUT_ROOT = process.env.E2E_OUT || `${SCRATCH}/v11/e2e/out`;
export const PLAYWRIGHT_DIR = process.env.PLAYWRIGHT_DIR || `${SCRATCH}/pw/node_modules/playwright`;
/**
 * E2E_SHOTS=1: a clean copy of every moment's pictures goes to <OUT_ROOT>/../shots/_raw/<scenario>/ (the
 * panel emulated at the specification's 360 x 658 at 1x, pages in CSS pixels); curated into journey
 * order afterwards
 */
export const SHOTS = process.env.E2E_SHOTS ? path.join(OUT_ROOT, '..', 'shots', '_raw') : undefined;
export const DEFAULT_EXT = path.join(EXTENSION, '.output', 'chrome-mv3');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // the harness's own requests to the mock's self-signed certificate

export const ANTHROPIC_RE = /^(https?|wss?):\/\/([a-z0-9-]+\.)*(claude\.ai|claude\.com|anthropic\.com)\.?(:\d+)?\//i;
export const WAYNE_REAL_RE = /^(https?|wss?):\/\/([a-z0-9-]+\.)*(grid\.wayne\.edu|protect\.wayne\.edu)\.?(:\d+)?\//i;
export const LAB_RE = /^https:\/\/(www\.)?openspineconsortium\.com\//i;
export const ACCESS_RE = /^https:\/\/([a-z0-9-]+\.)*workers\.dev\//i;
const CHROME_INTERNAL = /^(chrome-extension|chrome|devtools|about|data|blob|chrome-untrusted|edge):/;

let chromium;
async function playwright() {
  if (!chromium) ({ chromium } = await import(pathToFileURL(path.join(PLAYWRIGHT_DIR, 'index.mjs')).href));
  return chromium;
}

function ps(file, args, { wait = true } = {}) {
  const argv = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(E2E, 'uia', file), ...args];
  if (wait) return spawnSync('powershell', argv, { encoding: 'utf8', windowsHide: true }).stdout?.trim() ?? '';
  return spawn('powershell', argv, { windowsHide: true });
}

/** a self-signed certificate for the mock: localhost, ondemand.wayne.localhost, 127.0.0.1 */
export function ensureCert(dir) {
  const cert = path.join(dir, 'cert.pem');
  const key = path.join(dir, 'key.pem');
  if (fs.existsSync(cert) && fs.existsSync(key)) return { cert, key };
  fs.mkdirSync(dir, { recursive: true });
  const openssl = ['C:/Program Files/Git/usr/bin/openssl.exe', 'C:/Program Files/Git/mingw64/bin/openssl.exe', 'openssl'].find((p) => p === 'openssl' || fs.existsSync(p));
  const r = spawnSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-subj', '/CN=localhost', '-days', '30', '-addext', 'subjectAltName=DNS:localhost,DNS:ondemand.wayne.localhost,IP:127.0.0.1'], { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
  if (r.status !== 0) throw new Error(`openssl failed: ${r.stderr}`);
  return { cert, key };
}

// ---- the mock portal, as a child process (so a scenario can take it down and bring it back) --------------

export class Mock {
  constructor(run, { port = 8443, args = [], env = {}, home }) {
    this.run = run;
    this.port = port;
    this.args = args;
    this.env = env;
    this.home = home ?? path.join(run.dir, 'mock-home');
    this.proc = undefined;
    this.origin = `https://127.0.0.1:${port}`;
  }
  async start() {
    const { cert, key } = ensureCert(path.join(OUT_ROOT, '_cert'));
    const argv = [path.join(EXTENSION, 'mock-ood', 'server.mjs'), '--port', String(this.port), '--host', '127.0.0.1', '--home', this.home, '--cert', cert, '--key', key, ...this.args];
    this.proc = spawn(process.execPath, argv, { env: { ...process.env, ...this.env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const logFile = path.join(this.run.dir, 'mock-server.log');
    const ready = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('the mock did not start within 60 s')), 60_000);
      const onData = (d) => {
        fs.appendFileSync(logFile, d);
        if (/mock Open OnDemand portal at/.test(String(d))) {
          clearTimeout(t);
          resolve();
        }
      };
      this.proc.stdout.on('data', onData);
      this.proc.stderr.on('data', (d) => fs.appendFileSync(logFile, d));
      this.proc.on('exit', (c) => {
        clearTimeout(t);
        reject(new Error(`the mock exited (${c}) before it was ready; see ${logFile}`));
      });
    });
    await ready;
    this.proc.removeAllListeners('exit');
    this.run.ev('MOCK', `up at ${this.origin} (${[...this.args, ...Object.entries(this.env).map(([k, v]) => `${k}=${v}`)].join(' ')}), home ${this.home}`);
    return this;
  }
  async stop() {
    if (!this.proc) return;
    await this.saveLog().catch(() => {});
    const p = this.proc;
    this.proc = undefined;
    await new Promise((r) => {
      p.on('exit', r);
      p.kill();
      setTimeout(r, 3000);
    });
    this.run.ev('MOCK', 'down');
  }
  async api(p, init) {
    const r = await fetch(`${this.origin}${p}`, init);
    return r.json();
  }
  state() {
    return this.api('/_mock/state');
  }
  setAccess(mode) {
    return this.api(`/_mock/access?mode=${encodeURIComponent(mode)}`);
  }
  async saveLog() {
    const log = await this.api('/_mock/log');
    const file = path.join(this.run.dir, 'mock-log.json');
    let prev = { requests: [], shells: [] };
    try {
      prev = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      /* first */
    }
    // the mock forgets on a restart: keep what earlier runs of it answered
    const merged = { requests: [...prev.requests.filter((r) => !log.requests.some((x) => x.t === r.t && x.path === r.path)), ...log.requests], shells: [...prev.shells.filter((s) => !log.shells.some((x) => x.opened === s.opened)), ...log.shells] };
    fs.writeFileSync(file, JSON.stringify(merged, null, 1));
    return merged;
  }
}

// ---- one scenario's record -----------------------------------------------------------------------------

export class Run {
  constructor(name, { title = name } = {}) {
    this.name = name;
    this.title = title;
    this.dir = path.join(OUT_ROOT, name);
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
    this.t0 = Date.now();
    this.n = 0;
    this.results = [];
    this.notes = [];
    this.events = path.join(this.dir, 'events.log');
    fs.writeFileSync(this.events, '');
  }
  ev(kind, text) {
    const line = `${new Date().toISOString().slice(11, 23)} +${((Date.now() - this.t0) / 1000).toFixed(1).padStart(7)} s  ${kind.padEnd(10)} ${text}`;
    console.log(line);
    fs.appendFileSync(this.events, `${line}\n`);
  }
  check(name, ok, detail = '') {
    this.results.push({ name, ok: !!ok, detail: String(detail ?? '').slice(0, 400), at: Date.now() - this.t0 });
    const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${String(detail).slice(0, 300)}` : ''}`;
    console.log(line);
    fs.appendFileSync(this.events, `${line}\n`);
    return !!ok;
  }
  note(text) {
    this.notes.push(text);
    this.ev('NOTE', text);
  }
  slug(s) {
    return `${String(++this.n).padStart(2, '0')}-${s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`;
  }
  finish(extra = {}) {
    const failed = this.results.filter((r) => !r.ok);
    const out = { scenario: this.name, title: this.title, passed: this.results.length - failed.length, failed: failed.length, results: this.results, notes: this.notes, seconds: Math.round((Date.now() - this.t0) / 1000), ...extra };
    fs.writeFileSync(path.join(this.dir, 'result.json'), JSON.stringify(out, null, 1));
    this.ev('END', `${out.passed} passed, ${out.failed} failed (${this.dir})`);
    return out;
  }
}

// ---- the side panel over its own DevTools socket ---------------------------------------------------------

/** text-based finding, run in a page: the element a person would press for a label, and its centre */
const FIND = `(spec) => {
  const norm = (s) => String(s ?? '').replace(/\\s+/g, ' ').trim();
  // visible to a person: not inside an inert or aria-hidden subtree (a closed fold, a leaving screen), no
  // ancestor faded to nothing, and not clipped away by an ancestor that hides its overflow
  const visible = (el) => {
    if (!el) return false;
    if (el.closest('[inert],[aria-hidden="true"]')) return false;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (!(r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none')) return false;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (Number(s.opacity) <= 0.01) return false;
      if (a !== el && (s.overflowX !== 'visible' || s.overflowY !== 'visible')) {
        const q = a.getBoundingClientRect();
        if (Math.min(r.right, q.right) - Math.max(r.left, q.left) <= 0 || Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) <= 0) return false;
      }
    }
    return true;
  };
  const nameOf = (el) => norm(el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].innerText) || el.innerText || el.value || el.getAttribute('title') || el.getAttribute('placeholder') || '');
  const sel = spec.selector || 'button, a[href], [role=button], [role=link], [role=menuitem], [role=checkbox], [role=switch], [role=tab], input, textarea, select, summary, label';
  const all = [...document.querySelectorAll(sel)];
  const re = spec.re ? new RegExp(spec.re, spec.flags || '') : null;
  const want = norm(spec.text);
  const hit = spec.placeholder ? (el) => el.getAttribute('placeholder') === spec.placeholder : (el) => { const n = nameOf(el); return re ? re.test(n) : n === want; };
  const pick = (xs) => (spec.last ? xs[xs.length - 1] : xs[0]);
  let el = pick(all.filter((e) => hit(e) && visible(e))) || pick(all.filter(hit));
  if (!el && want && !spec.placeholder) el = pick(all.filter((e) => visible(e) && nameOf(e).startsWith(want)));
  if (!el) return null;
  let target = el;
  if (el.tagName === 'INPUT' && /checkbox|radio/.test(el.type) && !visible(el)) target = (el.labels && el.labels[0]) || el.closest('label') || el.parentElement;
  if (el.tagName === 'LABEL' && el.control && visible(el.control)) target = el.control;
  target.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = target.getBoundingClientRect();
  const box = el.tagName === 'LABEL' && el.control ? el.control : el;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, visible: visible(target), disabled: !!box.disabled || box.getAttribute('aria-disabled') === 'true', tag: box.tagName.toLowerCase(), type: box.type || '', name: nameOf(el), checked: typeof box.checked === 'boolean' ? box.checked : null };
}`;

/** the visible text of the document, with what assistive technology is told (aria-live) */
const TEXT = `() => {
  // innerText can come back empty for a page in a background tab; textContent then stands in
  const t = document.body ? (document.body.innerText || document.body.textContent.replace(/\\s+\\n/g, '\\n')) : '';
  const live = [...document.querySelectorAll('[aria-live]')].map((e) => e.innerText.trim()).filter(Boolean);
  return { title: document.title, text: t, live };
}`;

export class CdpTarget {
  constructor(info, run, label) {
    this.info = info;
    this.run = run;
    this.label = label;
    this.id = 0;
    this.pending = new Map();
    this.requests = [];
    this.handlers = [];
  }
  async connect() {
    this.ws = new WebSocket(this.info.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = () => reject(new Error(`cannot open the DevTools socket of ${this.info.url}`));
    });
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(typeof m.data === 'string' ? m.data : Buffer.from(m.data).toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${this.label})`));
        else resolve(msg.result);
      } else if (msg.method) for (const h of this.handlers) h(msg);
    };
    this.ws.onclose = () => {
      this.closed = true;
      for (const { reject } of this.pending.values()) reject(new Error(`${this.label} closed`));
      this.pending.clear();
    };
    this.handlers.push((msg) => {
      if (msg.method === 'Network.requestWillBeSent') {
        const u = msg.params.request.url;
        if (!CHROME_INTERNAL.test(u)) this.requests.push({ t: new Date().toISOString(), from: this.label, method: msg.params.request.method, url: u });
      }
    });
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Network.enable').catch(() => {});
    return this;
  }
  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error(`${this.label} is closed`));
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out on ${this.label}`));
        }
      }, 20_000);
    });
  }
  async evaluate(fnSource, arg) {
    const expr = arg === undefined ? `(${fnSource})()` : `(${fnSource})(${JSON.stringify(arg)})`;
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: false });
    if (r.exceptionDetails) throw new Error(`${this.label}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }
  close() {
    try {
      this.ws?.close();
    } catch {
      /* gone */
    }
  }
}

/**
 * One surface the harness reads and presses: the side panel (a CdpTarget) or a Playwright page (the
 * welcome page, the grid's terminal, a stand-in). Every press is a trusted input event at the element's
 * centre, found by its visible label (the pages are plain DOM: real buttons, inputs and labels).
 */
export class Surface {
  constructor(kind, handle, run) {
    this.kind = kind; // 'panel' | 'page'
    this.h = handle;
    this.run = run;
  }
  get name() {
    return this.kind === 'panel' ? 'panel' : (this.h.url?.() ?? 'page').replace(/^chrome-extension:\/\/[a-z]+\//, '');
  }
  async eval(fnSource, arg) {
    if (this.kind === 'panel') return this.h.evaluate(fnSource, arg);
    // eslint-disable-next-line no-new-func
    return this.h.evaluate(new Function(`return (${fnSource})`)(), arg);
  }
  async texts() {
    try {
      return await this.eval(TEXT);
    } catch (e) {
      return { title: '', text: `(unreadable: ${e.message})`, live: [] };
    }
  }
  async text() {
    return (await this.texts()).text;
  }
  async find(label, opts = {}) {
    const spec = label instanceof RegExp ? { re: label.source, flags: label.flags, ...opts } : { text: label, ...opts };
    return this.eval(FIND, spec);
  }
  async waitFind(label, ms = 15_000, opts = {}) {
    const t0 = Date.now();
    let f;
    while (Date.now() - t0 < ms) {
      f = await this.find(label, opts).catch(() => null);
      if (f?.visible) return f;
      await sleep(250);
    }
    return f;
  }
  async waitText(re, ms = 15_000) {
    const t0 = Date.now();
    const test = (t) => (re instanceof RegExp ? re.test(t) : t.includes(re));
    while (Date.now() - t0 < ms) {
      const t = await this.text().catch(() => '');
      if (test(t)) return t;
      await sleep(300);
    }
    return undefined;
  }
  async clickAt(x, y) {
    if (this.kind === 'panel') {
      await this.h.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await this.h.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await this.h.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    } else {
      await this.h.bringToFront().catch(() => {});
      await this.h.mouse.click(x, y);
    }
  }
  /** press the control a person would press for this label; throws when there is none */
  async press(label, { ms = 15_000, allowDisabled = false, ...opts } = {}) {
    const f = await this.waitFind(label, ms, opts);
    if (!f) throw new Error(`no control "${label}" on the ${this.name} within ${ms} ms`);
    if (f.disabled && !allowDisabled) throw new Error(`"${f.name}" on the ${this.name} is disabled`);
    await this.clickAt(f.x, f.y);
    this.run.ev('PRESS', `${this.name}: "${f.name.slice(0, 90)}" (${f.tag}${f.type ? ` ${f.type}` : ''})`);
    return f;
  }
  async key(key, { ctrl = false } = {}) {
    const codes = { Enter: [13, 'Enter', '\r'], Escape: [27, 'Escape', ''], Tab: [9, 'Tab', ''], v: [86, 'KeyV', 'v'], a: [65, 'KeyA', 'a'] };
    const [vk, code, text] = codes[key] ?? [0, key, key];
    if (this.kind === 'panel') {
      const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: ctrl ? 2 : 0 };
      await this.h.send('Input.dispatchKeyEvent', { type: ctrl ? 'rawKeyDown' : 'keyDown', ...base, ...(ctrl ? {} : { text }), ...(ctrl && key === 'v' ? { commands: ['paste'] } : {}) });
      await this.h.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    } else await this.h.keyboard.press(ctrl ? `Control+${key.toUpperCase()}` : key);
  }
  /** a person pasting the clipboard into a box: click the box, Ctrl+V */
  async pasteInto(label, opts = {}) {
    const f = await this.press(label, opts);
    await sleep(150);
    await this.key('v', { ctrl: true });
    this.run.ev('PASTE', `${this.name}: Ctrl+V into "${f.name}"`);
    return f;
  }
  async type(text) {
    if (this.kind === 'panel') await this.h.send('Input.insertText', { text });
    else await this.h.keyboard.type(text);
  }
  async screenshot(file) {
    try {
      if (this.kind === 'panel') {
        const params = { format: 'png' };
        if (SHOTS) {
          // a 1x picture of what is on screen (CSS pixels), whatever the window's device scale
          const v = await this.h.evaluate(`() => ({ x: scrollX, y: scrollY, w: innerWidth, h: innerHeight, dpr: devicePixelRatio })`).catch(() => undefined);
          if (v && v.dpr && v.dpr !== 1) params.clip = { x: v.x, y: v.y, width: v.w, height: v.h, scale: 1 / v.dpr };
        }
        const r = await this.h.send('Page.captureScreenshot', params);
        fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      } else await this.h.screenshot({ path: file, scale: 'css' });
      return true;
    } catch (e) {
      this.run.ev('SHOT', `${this.name}: no screenshot (${e.message})`);
      return false;
    }
  }
}

/**
 * a browser profile folder with a short path: Chrome's extension storage (LevelDB, under
 * <profile>/Default/Local Extension Settings/<id>/) fails with "Unable to create writable file" once the
 * whole path passes Windows' 260 characters, and the session scratchpad is already ~130 deep. The
 * folder for a key is fixed (a short hash), so a restart keeps its profile.
 */
export const PROFILE_ROOT = process.env.E2E_PROFILES || path.join(OUT_ROOT, '..', 'p');
export function profileDir(key) {
  let h = 0;
  for (const ch of String(key)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return path.join(PROFILE_ROOT, h.toString(36));
}

// ---- the browser -----------------------------------------------------------------------------------------

export class Browser {
  constructor(run, { ext = DEFAULT_EXT, profile, cdpPort = 9339, liveAccess = false, offline = false, reducedMotion = false, colorScheme = 'light', windowSize = '1400,920', mock, portalHost = 'ondemand.wayne.localhost' } = {}) {
    Object.assign(this, { run, ext, cdpPort, liveAccess, offline, reducedMotion, colorScheme, windowSize, mock, portalHost });
    this.profile = profile ?? profileDir(run.name);
    this.requests = [];
    this.tabs = new Map();
    this.prompts = [];
    this.codes = [];
    this.harnessTabs = new Set();
    this.acceptedAt = 0;
    this.panel = undefined;
    this.panelAsTab = false;
    /** the browser sessions of one scenario (a restart starts another): their logs are saved apart */
    this.session = run.browsers = (run.browsers ?? 0) + 1;
  }

  async launch({ keepProfile = false } = {}) {
    const cr = await playwright();
    if (!keepProfile) fs.rmSync(this.profile, { recursive: true, force: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(this.ext, 'manifest.json'), 'utf8'));
    this.version = manifest.version;
    const dns = ['MAP claude.ai ~NOTFOUND', 'MAP *.claude.ai ~NOTFOUND', 'MAP claude.com ~NOTFOUND', 'MAP *.claude.com ~NOTFOUND', 'MAP anthropic.com ~NOTFOUND', 'MAP *.anthropic.com ~NOTFOUND', 'MAP ondemand.grid.wayne.edu ~NOTFOUND', 'MAP *.grid.wayne.edu ~NOTFOUND', 'MAP protect.wayne.edu ~NOTFOUND', `MAP ${this.portalHost} 127.0.0.1`];
    if (this.liveAccess && this.portalHost !== 'localhost') throw new Error('--live-access needs the portal at localhost (E2E_HOST=localhost): the live service may be asked only about st1234 at localhost');
    if (!this.liveAccess) dns.push('MAP *.workers.dev ~NOTFOUND');
    if (this.offline) dns.push('MAP openspineconsortium.com ~NOTFOUND', 'MAP www.openspineconsortium.com ~NOTFOUND');
    const args = [`--disable-extensions-except=${this.ext}`, `--load-extension=${this.ext}`, '--enable-unsafe-extension-debugging', `--remote-debugging-port=${this.cdpPort}`, `--host-resolver-rules=${dns.join(', ')}`, '--ignore-certificate-errors', `--window-size=${this.windowSize}`, '--window-position=0,0'];
    if (this.reducedMotion) args.push('--force-prefers-reduced-motion');
    this.context = await cr.launchPersistentContext(this.profile, { headless: false, viewport: null, colorScheme: this.colorScheme, ...(this.reducedMotion ? { reducedMotion: 'reduce' } : {}), args });
    this.run.ev('SETUP', `Chromium ${this.context.browser()?.version()}; package ${this.ext} version ${this.version}; ${keepProfile ? 'kept' : 'fresh'} profile ${this.profile}; access service ${this.liveAccess ? 'LIVE for st1234 at localhost only' : 'the mock stand-in (live service unreachable)'}`);
    await this.instrument();
    let sw = this.context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
    if (!sw) sw = await this.context.waitForEvent('serviceworker', { timeout: 30_000 });
    this.extId = new URL(sw.url()).host;
    const pids = ps('pid.ps1', ['-ProfileLike', this.profile.replace(/\//g, '\\')]).split(/\s+/).filter(Boolean);
    this.pid = pids[0];
    this.run.ev('SETUP', `extension ${this.extId}; browser process ${this.pid ?? '(not found: no UI Automation)'}`);
    return this;
  }

  /** every request, tab and service worker of the browser, and the routes that keep it local */
  async instrument() {
    const ctx = this.context;
    const where = (u) => (this.mock && u.startsWith(`https://${this.portalHost}:${this.mock.port}`)) || /^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u) ? 'mock' : LAB_RE.test(u) ? 'lab' : ACCESS_RE.test(u) ? 'access' : ANTHROPIC_RE.test(u) ? 'anthropic' : WAYNE_REAL_RE.test(u) ? 'UNIVERSITY' : 'other';
    ctx.on('request', (r) => {
      const u = r.url();
      if (CHROME_INTERNAL.test(u)) return;
      let from = '?';
      try {
        from = r.serviceWorker() ? 'extension service worker' : r.frame().url() || '(new tab)';
      } catch {
        /* none */
      }
      const rec = { t: new Date().toISOString(), beforeAcceptance: !this.acceptedAt, to: where(u), method: r.method(), url: u.replace(/([?&]csrf=)[^&]+/g, '$1[redacted]'), from, body: r.postData()?.slice(0, 400) };
      this.requests.push(rec);
      if (rec.to !== 'mock' || rec.beforeAcceptance) this.run.ev('REQUEST', `${rec.beforeAcceptance ? '[before acceptance] ' : ''}${rec.to}: ${rec.method} ${rec.url.slice(0, 140)} (from ${from.slice(0, 60)})${rec.body ? ` body ${rec.body}` : ''}`);
    });
    await ctx.route(ANTHROPIC_RE, (route) => {
      const u = route.request().url();
      this.run.ev('STAND-IN', `Anthropic page answered locally: ${u.slice(0, 120)}`);
      return route.fulfill({ status: 200, contentType: 'text/html', body: anthropicPage(u, this.codes) });
    });
    await ctx.route(WAYNE_REAL_RE, (route) => {
      this.run.check('nothing reaches the university', false, `a request to ${route.request().url()} was attempted and aborted`);
      return route.abort();
    });
    await ctx.route(LAB_RE, (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === '/beethoven/services.json' && !this.liveAccess && this.mock) {
        // the stand-in service: the extension asks the mock's /beethoven/access_check instead of the live service
        const body = JSON.stringify({ access_check: `https://${this.portalHost}:${this.mock.port}/beethoven/access_check`, request_page: 'https://openspineconsortium.com/beethoven/request.html' });
        this.run.ev('STAND-IN', `services.json answered locally: access_check is the mock's stand-in`);
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body });
      }
      if (u.pathname === '/beethoven/killlist.json' && !this.offline) return route.continue();
      if (/\.html$|\/$/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>Lab page (stand-in)</title><h1>${u.pathname}</h1><p>${u.search.replace(/[<>&]/g, '')}</p><p>Harness stand-in for the lab's site.</p>` });
      return route.continue();
    });
    await ctx.route(ACCESS_RE, (route) => {
      const q = route.request();
      if (!this.liveAccess) {
        this.run.check('the live access service is never asked in a stand-in run', false, `${q.method()} ${q.url()} aborted`);
        return route.abort();
      }
      let body = {};
      try {
        body = JSON.parse(q.postData() || '{}');
      } catch {
        body = { unparsable: true };
      }
      if (body.unparsable || (body.access_id !== undefined && body.access_id !== 'st1234') || (body.portal !== undefined && !/^localhost(:\d+)?$/.test(String(body.portal)))) {
        this.run.check('the live access service is asked only about st1234 at localhost', false, `aborted: ${q.postData()}`);
        return route.abort();
      }
      this.run.ev('LIVE', `${q.method()} ${q.url()} passed to the live service (st1234 at localhost)`);
      return route.continue();
    });
    // tabs, the side panel and the service worker, from the browser's own target list
    this.bcdp = await ctx.browser().newBrowserCDPSession();
    this.bcdp.on('Target.targetCreated', ({ targetInfo: t }) => this.onTarget('created', t));
    this.bcdp.on('Target.targetInfoChanged', ({ targetInfo: t }) => this.onTarget('changed', t));
    this.bcdp.on('Target.targetDestroyed', ({ targetId }) => this.onTarget('destroyed', { targetId }));
    await this.bcdp.send('Target.setDiscoverTargets', { discover: true });
  }

  onTarget(what, t) {
    const prev = this.tabs.get(t.targetId);
    if (what === 'destroyed') {
      if (!prev) return;
      prev.closedAt = Date.now() - this.run.t0;
      if (prev.type === 'page' || prev.type === 'other') this.run.ev('TAB-CLOSED', `${prev.kind}: ${prev.url.slice(0, 120)}${prev.byHarness ? ' (the harness had opened it)' : ''}`);
      if (prev.kind === 'side panel') this.panelGone = true;
      if (prev.type === 'service_worker') {
        this.workerStops = (this.workerStops ?? 0) + 1;
        this.run.ev('WORKER', `the extension's service worker stopped (${prev.url.slice(0, 80)})`);
      }
      return;
    }
    if (!['page', 'service_worker', 'other'].includes(t.type)) return;
    const kindOf = (u) => (t.type === 'service_worker' ? 'service worker' : /\/sidepanel\.html/.test(u) ? 'side panel' : /^chrome-extension:/.test(u) ? 'extension page' : 'tab');
    const kind = kindOf(t.url);
    if (!prev) {
      const rec = { targetId: t.targetId, type: t.type, kind, url: t.url, openerId: t.openerId, openedAt: Date.now() - this.run.t0, urls: [t.url], byHarness: false };
      this.tabs.set(t.targetId, rec);
      if (t.type === 'page') this.run.ev('TAB-OPENED', `${kind}: ${t.url.slice(0, 120)}`);
      if (t.type === 'service_worker' && t.url.startsWith('chrome-extension://')) this.run.ev('WORKER', `service worker running (${t.url.slice(0, 80)})`);
    } else if (t.url !== prev.url) {
      prev.url = t.url;
      prev.urls.push(t.url);
      // a target is born about:blank: what it is shows when it loads (the side panel, an extension page)
      if (prev.kind !== 'side panel') prev.kind = kindOf(t.url);
      if (t.type === 'page') this.run.ev('TAB-NAV', `${prev.kind} -> ${t.url.slice(0, 120)}`);
    }
  }

  /** a tab the harness opens itself (so the report can tell it from the extension's) */
  async newPage(url) {
    const p = await this.context.newPage();
    try {
      const s = await this.context.newCDPSession(p);
      const { targetInfo } = await s.send('Target.getTargetInfo');
      const rec = this.tabs.get(targetInfo.targetId);
      if (rec) rec.byHarness = true;
      this.harnessTabs.add(targetInfo.targetId);
      await s.detach();
    } catch {
      /* fine */
    }
    if (url) await p.goto(url).catch((e) => this.run.ev('NAV', `${url}: ${e.message.split('\n')[0]}`));
    return p;
  }

  /** the extension's service worker, for reading its storage and the toolbar (read-only use) */
  async bg(fn, arg) {
    for (let i = 0; i < 4; i++) {
      const w = this.context.serviceWorkers().filter((x) => x.url().startsWith(`chrome-extension://${this.extId}/`)).pop();
      try {
        if (!w) throw new Error('no service worker');
        return await w.evaluate(fn, arg);
      } catch (e) {
        if (i === 3) throw e;
        await sleep(600);
      }
    }
    return undefined;
  }
  storage() {
    return this.bg(async () => ({ local: await chrome.storage.local.get(null), session: await chrome.storage.session.get(null) }));
  }
  /** a trace of the extension's run record (session storage 'bridge.run'): every change of its state words, for diagnosis */
  traceRun(ms = 1000) {
    this.runTrace = [];
    let last = '';
    const tick = async () => {
      if (this.traceStopped) return;
      try {
        const r = await this.bg(async () => (await chrome.storage.session.get('bridge.run'))['bridge.run']);
        const k = r ? { state: r.status?.state, job: r.job, announced: r.online_announced_job, opened_env: !!r.opened_env, status_mtime: r.status_mtime, sched: r.scheduler?.state, stopped_by_student: r.stopped_by_student } : null;
        const j = JSON.stringify(k);
        if (j !== last) {
          last = j;
          this.runTrace.push({ at: Date.now() - this.run.t0, ...k });
          this.run.ev('RUNTRACE', j);
        }
      } catch {
        /* the worker is between lives */
      }
      setTimeout(tick, ms);
    };
    setTimeout(tick, ms);
  }
  toolbar() {
    return this.bg(async () => ({ badge: await chrome.action.getBadgeText({}), color: await chrome.action.getBadgeBackgroundColor({}), title: await chrome.action.getTitle({}) }));
  }
  permissions() {
    return this.bg(() => chrome.permissions.getAll());
  }

  /** the pages Playwright sees, newest last */
  pages() {
    return this.context.pages();
  }
  page(re) {
    return this.pages().filter((p) => re.test(p.url())).pop();
  }
  async waitPage(re, ms = 20_000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const p = this.page(re);
      if (p) return p;
      await sleep(200);
    }
    return undefined;
  }
  surface(page) {
    return new Surface('page', page, this.run);
  }

  async targets() {
    return (await fetch(`http://127.0.0.1:${this.cdpPort}/json/list`)).json();
  }
  /** the real side panel, as a surface, when Chrome has one open */
  async sidePanel(ms = 10_000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const t = (await this.targets().catch(() => [])).find((x) => x.type === 'page' && /\/sidepanel\.html/.test(x.url) && x.url.includes(this.extId));
      if (t) {
        if (this.panel && this.panel.h.info.id === t.id && !this.panel.h.closed) return this.panel;
        const target = await new CdpTarget(t, this.run, 'side panel').connect();
        this.panel = new Surface('panel', target, this.run);
        this.panelAsTab = false;
        // shots: the panel as the specification designs it, 360 x 658 CSS px; the device scale stays the
        // window's own (forcing 1x moves trusted clicks off their targets), the picture is scaled to 1x instead
        if (SHOTS) await target.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 658, deviceScaleFactor: 0, mobile: false }).catch(() => {});
        return this.panel;
      }
      await sleep(250);
    }
    return undefined;
  }
  /** where the real side panel cannot be had: sidepanel.html in a tab (the report says so) */
  async panelInTab() {
    const p = await this.newPage(`chrome-extension://${this.extId}/sidepanel.html`);
    this.panelAsTab = true;
    this.run.note('the panel was opened as a tab (sidepanel.html) because no side panel was open: the words are the same, the gestures are not');
    this.panel = this.surface(p);
    return this.panel;
  }
  /** the toolbar button, as a click on it (CDP Extensions.triggerAction on the tab in front) */
  async clickToolbar() {
    // "tab" targets are listed only when asked for by type
    const targets = (await this.bcdp.send('Target.getTargets', { filter: [{ type: 'tab' }, {}] })).targetInfos.filter((t) => (t.type === 'tab' || t.type === 'page') && !t.url.startsWith('chrome-extension://'));
    const front = this.pages().filter((p) => !p.url().startsWith('chrome-extension://')).pop();
    // Extensions.triggerAction wants the "tab" target (a tab has both a "tab" and a "page" target with one URL)
    const tabs = targets.filter((t) => t.type === 'tab');
    const target = tabs.find((t) => front && t.url === front.url()) ?? tabs[0] ?? targets.find((t) => front && t.url === front.url()) ?? targets[0];
    if (!target) throw new Error('no tab to press the toolbar button on');
    await this.bcdp.send('Extensions.triggerAction', { id: this.extId, targetId: target.targetId });
    this.run.ev('TOOLBAR', `toolbar button pressed (tab ${target.url.slice(0, 80)})`);
  }

  /** watch for Chrome's permission prompt for `seconds`, pressing `press` (Allow, Deny or None) */
  watchPrompts(press = 'Allow', seconds = 900) {
    if (!this.pid) return;
    this.stopPrompts();
    const p = ps('prompts.ps1', ['-ProcessId', String(this.pid), '-Seconds', String(seconds), '-Press', press, '-ShotDir', this.run.dir], { wait: false });
    this.promptProc = p;
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line.startsWith('PROMPT')) {
          const [, ms, win, text, buttons, action] = /^PROMPT (\d+) \| (.*?) \| (.*?) \| buttons \[(.*?)\] \| (.*)$/.exec(line) ?? [];
          const rec = { at: Date.now() - this.run.t0, window: win, text, buttons, action, policy: press };
          this.prompts.push(rec);
          this.run.ev('PROMPT', `Chrome's permission prompt: "${text}" [${buttons}] ${action}`);
        }
      }
    });
  }
  stopPrompts() {
    try {
      this.promptProc?.kill();
    } catch {
      /* gone */
    }
    this.promptProc = undefined;
  }
  /** Chrome's own sign-in box: type the account and the password through UI Automation, as a person does */
  signInBox({ user = 'st1234', pass = 'mockpass', timeout = 25, action = 'SignIn' } = {}) {
    if (!this.pid) return Promise.resolve('NONE (no browser process for UI Automation)');
    return new Promise((resolve) => {
      const shot = path.join(this.run.dir, `signin-box-${Date.now() - this.run.t0}.png`);
      const p = ps('signin.ps1', ['-ProcessId', String(this.pid), '-TimeoutSec', String(timeout), '-User', user, '-Pass', pass, '-Action', action, '-Shot', shot], { wait: false });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.on('close', () => {
        const o = out.trim().replace(/\r?\n/g, ' // ');
        this.run.ev('SIGN-IN', `Chrome's sign-in box: ${o}`);
        resolve(o);
      });
    });
  }
  windowShot(file) {
    if (!this.pid) return false;
    const out = ps('winshot.ps1', ['-ProcessId', String(this.pid), '-Out', file]);
    return /^SAVED/.test(out);
  }

  /**
   * One numbered moment: the panel's and the front page's text and screenshots, and the window as it
   * is on the screen. Returns {panel, page} texts for checks.
   */
  async moment(slug, { page, panel = true, window = true } = {}) {
    const base = path.join(this.run.dir, this.run.slug(slug));
    // shots: let a moment's 320 ms slide (and a crossfade) finish, so the picture is not mid-transition
    if (SHOTS) await sleep(450);
    const lines = [`# ${slug}`, `at +${((Date.now() - this.run.t0) / 1000).toFixed(1)} s`];
    const out = {};
    if (panel && this.panel) {
      const t = await this.panel.texts();
      out.panel = t.text;
      lines.push(`\n## panel${this.panelAsTab ? ' (opened as a tab)' : ''} — title "${t.title}"`, t.text, ...(t.live.length ? ['\n## aria-live', ...t.live] : []));
      await this.panel.screenshot(`${base}.panel.png`);
    }
    const front = page ?? this.pages().filter((p) => !/\/sidepanel\.html/.test(p.url())).pop();
    if (front) {
      try {
        const s = this.surface(front);
        const t = await s.texts();
        out.page = t.text;
        lines.push(`\n## page ${front.url().slice(0, 140)} — title "${t.title}"`, t.text.slice(0, 6000));
        await s.screenshot(`${base}.page.png`);
      } catch (e) {
        lines.push(`\n## page: unreadable (${e.message})`);
      }
    }
    try {
      const tb = await this.toolbar();
      out.toolbar = tb;
      lines.push(`\n## toolbar`, `title "${tb.title}" badge "${tb.badge}" colour ${JSON.stringify(tb.color)}`);
    } catch {
      /* the worker is asleep */
    }
    if (window) this.windowShot(`${base}.window.png`);
    fs.writeFileSync(`${base}.txt`, `${lines.join('\n')}\n`);
    if (SHOTS) {
      const dir = path.join(SHOTS, this.run.name);
      fs.mkdirSync(dir, { recursive: true });
      for (const ext of ['panel.png', 'page.png', 'window.png', 'txt']) {
        const f = `${base}.${ext}`;
        if (fs.existsSync(f)) fs.copyFileSync(f, path.join(dir, path.basename(f)));
      }
    }
    this.run.ev('MOMENT', path.basename(base));
    return out;
  }

  async save() {
    const panelReqs = this.panel?.kind === 'panel' ? this.panel.h.requests : [];
    const sfx = this.session > 1 ? `-${this.session}` : '';
    fs.writeFileSync(path.join(this.run.dir, `requests${sfx}.json`), JSON.stringify([...this.requests, ...panelReqs.map((r) => ({ ...r, to: 'from the side panel' }))], null, 1));
    fs.writeFileSync(path.join(this.run.dir, `tabs${sfx}.json`), JSON.stringify([...this.tabs.values()], null, 1));
    fs.writeFileSync(path.join(this.run.dir, `prompts${sfx}.json`), JSON.stringify(this.prompts, null, 1));
  }
  async close() {
    this.traceStopped = true;
    if (this.runTrace) fs.writeFileSync(path.join(this.run.dir, `run-trace${this.session > 1 ? `-${this.session}` : ''}.json`), JSON.stringify(this.runTrace, null, 1));
    this.stopPrompts();
    await this.save().catch(() => {});
    this.panel?.h?.close?.();
    try {
      await this.context.close();
    } catch {
      /* closed */
    }
  }
}

// ---- the checks every scenario makes -----------------------------------------------------------------------

/**
 * words a student must never read outside Details (spec: hygiene); the sentences the specification
 * itself writes with one of them: the two the contract allows (its section 2) and moment 5's
 * "This doesn't look like an OnDemand portal." (model.ts WORDS.grid.notOod)
 */
export const BANNED = [/\bjobs?\b/i, /\bnodes?\b/i, /\bpartitions?\b/i, /\bheartbeat/i, /\bshell\b/i, /portal tab/i, /\bprobe\b/i, /\bscheduler\b/i, /hpcworker/i, /OnDemand/, /Failed to fetch/];
export const ALLOWED_SENTENCES = ["Write a Slurm job for my script, submit it, and tell me when it's done.", 'It starts when your other grid jobs finish.', "This doesn't look like an OnDemand portal.", 'Big jobs run on the grid, not your laptop.', 'Press LOGIN TO ONDEMAND on the grid page.'];

export function hygiene(text) {
  let t = String(text ?? '');
  for (const s of ALLOWED_SENTENCES) t = t.split(s).join('');
  // AM2: the one setup line is shown in the "What does the line do?" fold, as a command, not a sentence
  t = t.replace(/bash \S+\/bin\/hpcworker login-setup/g, '');
  return BANNED.filter((re) => re.test(t)).map((re) => `${re} in "${(t.match(re) ?? [''])[0]}"`);
}

/** requests made before the agreement was accepted, anywhere but the extension's own files */
export function beforeAcceptance(browser) {
  return browser.requests.filter((r) => r.beforeAcceptance);
}
