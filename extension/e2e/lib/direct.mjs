// 12.0.0's direct way, for the browser harness: a local grid stand-in in WSL (never the grid), the bundled
// Windows helper installed from the package's own zip, and the panel's sign-in sheet driven as a student
// drives it. Used by scenarios 13 to 16.
//
//   - The grid stand-in (E2E_FINAL/grid/gridd.py, asyncssh) listens on 127.0.0.1:E2E_SSH_PORT in WSL with the
//     grid's algorithms and an RSA host key, asks the grid's two prompts (password, then the Google
//     Authenticator code) and plays the 2FA refusal for the account "nocode"; a password session runs the
//     client's command in bash, a key session runs the authorized_keys line's forced command exactly as
//     OpenSSH does (SSH_ORIGINAL_COMMAND; restrict refuses a pty). The shared copy it runs is framework 11
//     from this working tree (setup_grid.sh), under a test HOME, with a fake scheduler and a job clock.
//   - The test package (E2E_FINAL/ext, made by prep_ext.mjs from .output/chrome-mv3): a manifest key so its
//     id is fixed, the bridge zips rebuilt with that id (the shipped zips refuse to install until the
//     release step names the store id), and profiles/wayne.json pointed at the stand-in: 127.0.0.1, its
//     port, its host key's fingerprint as the pin, its shared copy.
//   - The helper: the zip the panel's download link saves, unpacked with Expand-Archive, an allow.txt naming
//     the stand-in (the helper's documented way to add a host), install.cmd run with the test hooks that
//     register it for the TEST browser only (HKCU\Software\Chromium\NativeMessagingHosts\<name>, which
//     Playwright's Chromium reads; never the Chrome or Edge keys) and install it under E2E_FINAL; then a
//     guard is added to the INSTALLED bridge.ps1 that refuses grid.wayne.edu and writes a line when asked
//     for it, so no step of a test can reach the real grid through the helper's built-in allowlist.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from './harness.mjs';
import { moment } from './flows.mjs';

const SCRATCH = 'C:/Users/grego/AppData/Local/Temp/claude/c--Users-grego-OneDrive-Desktop-CTSpinoPelvic1K-1/0599380b-0d32-4e19-b5be-65bdd1017566/scratchpad';
export const FINAL = process.env.E2E_FINAL || `${SCRATCH}/v12/build/final`;
export const SSH_PORT = Number(process.env.E2E_SSH_PORT || 22411);
export const SHARED_TEST = '/home/gschwing/final12/g/shared/current';
export const TEST_EXT = path.join(FINAL, 'ext');
export const HOST_NAME = 'com.openspineconsortium.beethoven.bridge';
export const REGKEY = `Software\\Chromium\\NativeMessagingHosts\\${HOST_NAME}`;
export const HOST_ROOT = path.join(FINAL, 'hostinst');
export const GUARD_FILE = path.join(FINAL, 'logs', 'GUARD-grid.wayne.edu.txt');
export const GRID_PASSWORD = 'pw-correct';
export const GRID_CODE = '864209';

const wslPath = (p) => String(p).replace(/\\/g, '/').replace(/^([A-Za-z]):/, (m, d) => `/mnt/${d.toLowerCase()}`);
export function wsl(cmd, opts = {}) {
  const r = spawnSync('wsl', ['-e', 'bash', '-lc', cmd], { encoding: 'utf8', windowsHide: true, timeout: 120_000, ...opts });
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}

/** the grid stand-in in WSL */
export class Grid {
  constructor(run, { port = SSH_PORT, queueS = 20, startS = 6 } = {}) {
    Object.assign(this, { run, port, queueS, startS });
    this.proc = undefined;
  }
  /** a fresh tree: the shared copy, the test HOME, the scheduler; returns the pin (the host key's fingerprint) */
  setup() {
    const r = wsl(`bash ${wslPath(path.join(FINAL, 'grid', 'setup_grid.sh'))} ${this.port} ${this.queueS} ${this.startS}`);
    const fp = /FINGERPRINT (SHA256:\S+)/.exec(r.out)?.[1];
    if (!fp) throw new Error(`setup_grid.sh failed: ${r.out} ${r.err}`);
    this.fingerprint = fp;
    this.run.ev('GRID', `stand-in tree set up (shared copy ${SHARED_TEST}, port ${this.port}, queue ${this.queueS} s, start ${this.startS} s, host key ${fp})`);
    return fp;
  }
  /** start the server (hostKey 'other': the wrong-grid key, the tree kept) */
  async start({ hostKey = 'key' } = {}) {
    await this.stop();
    const hk = hostKey === 'key' ? '' : ` ~/final12/host/${hostKey}`;
    this.proc = spawn('wsl', ['-e', 'bash', '-lc', `echo $$ > ~/final12/gridd.pid; exec ~/final12/venv/bin/python ${wslPath(path.join(FINAL, 'grid', 'gridd.py'))} ~/final12/g/gridd.json${hk}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const logFile = path.join(this.run.dir, 'gridd-stdio.log');
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('the grid stand-in did not start within 30 s')), 30_000);
      this.proc.stdout.on('data', (d) => {
        fs.appendFileSync(logFile, d);
        const m = /READY (\{.*\})/.exec(String(d));
        if (m) {
          clearTimeout(t);
          this.listening = JSON.parse(m[1]);
          resolve();
        }
      });
      this.proc.stderr.on('data', (d) => fs.appendFileSync(logFile, d));
      this.proc.on('exit', (c) => {
        clearTimeout(t);
        reject(new Error(`the grid stand-in exited (${c}); see ${logFile}`));
      });
    });
    this.proc.removeAllListeners('exit');
    this.run.ev('GRID', `stand-in up on 127.0.0.1:${this.port}, host key ${this.listening.fingerprint}${hostKey === 'key' ? '' : ` (the "${hostKey}" key: NOT the pinned one)`}`);
    return this;
  }
  async stop() {
    wsl('[ -s ~/final12/gridd.pid ] && kill "$(cat ~/final12/gridd.pid)" 2>/dev/null; rm -f ~/final12/gridd.pid; true');
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {
        /* gone */
      }
      this.proc = undefined;
      this.run.ev('GRID', 'stand-in down');
    }
    await sleep(500);
  }
  /** the stand-in's own log (every connection, method, account, the key's options, each command, pty, exit) */
  log() {
    return wsl('cat ~/final12/g/gridd.log 2>/dev/null').out.split('\n').filter(Boolean).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { raw: l };
      }
    });
  }
  authorizedKeys() {
    return wsl('cat ~/final12/g/home/.ssh/authorized_keys 2>/dev/null').out;
  }
  calls() {
    return wsl('cat ~/final12/g/sched/calls 2>/dev/null').out.split('\n').filter(Boolean);
  }
  jobs() {
    return wsl('cat ~/final12/g/sched/jobs 2>/dev/null').out.split('\n').filter(Boolean);
  }
  /** a copy of the stand-in's log and the account's files beside the scenario's record */
  save(sfx = '') {
    fs.writeFileSync(path.join(this.run.dir, `gridd-log${sfx}.json`), JSON.stringify(this.log(), null, 1));
    fs.writeFileSync(path.join(this.run.dir, `grid-authorized_keys${sfx}.txt`), this.authorizedKeys());
    fs.writeFileSync(path.join(this.run.dir, `grid-sched-calls${sfx}.txt`), this.calls().join('\n'));
  }
}

// ---- the helper -------------------------------------------------------------------------------------------

export function hostKeyPresent() {
  return spawnSync('reg', ['query', `HKCU\\${REGKEY}`], { encoding: 'utf8', windowsHide: true }).status === 0;
}
/** remove the TEST browser's registration (and the empty Chromium key, which did not exist before) */
export function removeHostKey(run) {
  const had = hostKeyPresent();
  spawnSync('reg', ['delete', `HKCU\\${REGKEY}`, '/f'], { encoding: 'utf8', windowsHide: true });
  const parent = spawnSync('reg', ['query', 'HKCU\\Software\\Chromium\\NativeMessagingHosts'], { encoding: 'utf8', windowsHide: true });
  if (parent.status === 0 && !/HKEY_CURRENT_USER\\Software\\Chromium\\NativeMessagingHosts\\/.test(parent.stdout)) {
    spawnSync('reg', ['delete', 'HKCU\\Software\\Chromium\\NativeMessagingHosts', '/f'], { encoding: 'utf8', windowsHide: true });
    const top = spawnSync('reg', ['query', 'HKCU\\Software\\Chromium'], { encoding: 'utf8', windowsHide: true });
    if (top.status === 0 && !/HKEY_CURRENT_USER\\Software\\Chromium\\/.test(top.stdout)) spawnSync('reg', ['delete', 'HKCU\\Software\\Chromium', '/f'], { encoding: 'utf8', windowsHide: true });
  }
  run?.ev('REGISTRY', `HKCU\\${REGKEY} ${had ? 'removed' : 'was not there'}; present now: ${hostKeyPresent()}`);
}

/**
 * The student's install: unpack the downloaded zip (Expand-Archive), add allow.txt for the stand-in, run
 * install.cmd (test hooks: the Chromium key only, the install folder under E2E_FINAL, no Enter prompts),
 * then the guard in the installed bridge.ps1. Returns the installer's output and exit code.
 */
export async function installHelperFromZip(run, zip, { port = SSH_PORT } = {}) {
  const dir = path.join(FINAL, 'student', `unzipped-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  const ex = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dir.replace(/'/g, "''")}' -Force`], { encoding: 'utf8', windowsHide: true });
  if (ex.status !== 0) throw new Error(`Expand-Archive failed: ${ex.stderr}`);
  fs.writeFileSync(path.join(dir, 'allow.txt'), `# the local grid stand-in (verification run only)\n127.0.0.1:${port}\n`);
  fs.rmSync(HOST_ROOT, { recursive: true, force: true });
  const env = { ...process.env, BEETHOVEN_BRIDGE_ROOT: HOST_ROOT, BEETHOVEN_BRIDGE_REGKEYS: REGKEY, BEETHOVEN_BRIDGE_YES: '1' };
  // the installer by its full path, as Explorer starts a double-clicked file (this shell sets NoDefaultCurrentDirectoryInExePath)
  // asynchronous, so the harness keeps watching the panel while the installer runs
  const r = await new Promise((resolve) => {
    const c = spawn('cmd.exe', ['/d', '/c', path.join(dir, 'install.cmd')], { cwd: dir, env, windowsHide: true });
    let o = '';
    c.stdout.on('data', (d) => (o += d));
    c.stderr.on('data', (d) => (o += d));
    const t = setTimeout(() => c.kill(), 120_000);
    c.on('close', (code) => {
      clearTimeout(t);
      resolve({ status: code, stdout: o });
    });
  });
  const out = r.stdout;
  run.ev('INSTALL', `install.cmd exit ${r.status}: ${out.trim().split(/\r?\n/).slice(-2).join(' / ')}`);
  // the guard: the helper's built-in allowlist always holds grid.wayne.edu:22, so the INSTALLED copy refuses it here
  const ps1 = path.join(HOST_ROOT, 'bridge.ps1');
  if (fs.existsSync(ps1)) {
    let s = fs.readFileSync(ps1, 'utf8');
    const anchor = "    if (-not $Allow.Contains($hostName + ':' + $port)) { Send-Error $id 'not_allowed'; return }";
    const guard = `${anchor}\r\n    if ($hostName -eq 'grid.wayne.edu') { [IO.File]::AppendAllText('${GUARD_FILE.replace(/\//g, '\\')}', ([DateTime]::UtcNow.ToString('o') + ' open grid.wayne.edu refused by the verification guard' + [Environment]::NewLine)); Send-Error $id 'refused'; return }`;
    if (!s.includes(anchor.trim())) throw new Error('the guard anchor is not in the installed bridge.ps1');
    s = s.replace(anchor.trim(), guard.trim());
    fs.writeFileSync(ps1, s);
    run.ev('INSTALL', `verification guard added to the installed bridge.ps1 (grid.wayne.edu refused; attempts logged to ${GUARD_FILE})`);
  }
  return { code: r.status, out, dir };
}

export function guardHits() {
  try {
    return fs.readFileSync(GUARD_FILE, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// ---- downloads from the panel -------------------------------------------------------------------------------

/** downloads from any page (the side panel included) go to `dir`, named by Chrome's guid; we copy them to their names */
export async function watchDownloads(br, dir) {
  fs.mkdirSync(dir, { recursive: true });
  br.downloads = [];
  await br.bcdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: dir, eventsEnabled: true });
  br.bcdp.on('Browser.downloadWillBegin', (e) => {
    br.downloads.push({ guid: e.guid, url: e.url, name: e.suggestedFilename, state: 'started', at: Date.now() });
    br.run.ev('DOWNLOAD', `begins: ${e.suggestedFilename} from ${e.url}`);
  });
  br.bcdp.on('Browser.downloadProgress', (e) => {
    const d = br.downloads.find((x) => x.guid === e.guid);
    if (!d || e.state === 'inProgress') return;
    d.state = e.state;
    d.bytes = e.receivedBytes;
    if (e.state === 'completed') {
      const from = path.join(dir, e.guid);
      const to = path.join(dir, d.name);
      try {
        fs.copyFileSync(from, to);
        d.file = to;
      } catch (err) {
        d.error = err.message;
      }
    }
    br.run.ev('DOWNLOAD', `${e.state}: ${d.name} (${e.receivedBytes} bytes)`);
  });
}
export async function waitDownload(br, re, ms = 20_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const d = br.downloads?.find((x) => re.test(x.name) && x.state !== 'started');
    if (d) return d;
    await sleep(200);
  }
  return undefined;
}

// ---- the panel's sheet ------------------------------------------------------------------------------------

/** click a field found by selector and type into it (Input.insertText: what a person's keyboard gives the page) */
export async function typeInto(surface, selector, text, ms = 15_000) {
  const f = await surface.waitFind(/[\s\S]*/, ms, { selector });
  if (!f?.visible) throw new Error(`no field ${selector} on the ${surface.name}`);
  await surface.clickAt(f.x, f.y);
  await sleep(80);
  await surface.eval(`(sel) => { const e = document.querySelector(sel); if (e && e.value) e.value = ''; }`, selector);
  await surface.type(text);
  return f;
}
export async function pressSel(surface, selector, ms = 15_000) {
  const f = await surface.waitFind(/[\s\S]*/, ms, { selector });
  if (!f?.visible) throw new Error(`no control ${selector} on the ${surface.name}`);
  if (f.disabled) throw new Error(`${selector} on the ${surface.name} is disabled`);
  await surface.clickAt(f.x, f.y);
  surface.run.ev('PRESS', `${surface.name}: ${selector} "${f.name.slice(0, 60)}"`);
  return f;
}

/** decode every QR code in pictures (zxing-cpp through Python) */
export function decodeQr(files) {
  const r = spawnSync('python', [path.join(FINAL, 'decode_qr.py'), ...files], { encoding: 'utf8', windowsHide: true });
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { error: `${r.stdout} ${r.stderr}` };
  }
}

/** the virtual authenticator on a surface's own target (WebAuthn runs in the page that asks) */
export async function addAuthenticator(surface, { prf = true } = {}) {
  await surface.h.send('WebAuthn.enable', { enableUI: false });
  const r = await surface.h.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: prf },
  });
  surface.authenticatorId = r.authenticatorId;
  surface.run.ev('WEBAUTHN', `virtual authenticator ${r.authenticatorId} on the ${surface.name} (internal, user verification, PRF ${prf ? 'on' : 'off'})`);
  return r.authenticatorId;
}
export async function credentials(surface) {
  if (!surface.authenticatorId) return [];
  return (await surface.h.send('WebAuthn.getCredentials', { authenticatorId: surface.authenticatorId })).credentials;
}

/** a trace of session keys the direct way's cadence depends on (the Grid note, a waiting press): every change, for diagnosis */
export function traceKeys(br, keys = ['bridge.grid', 'bridge.press', 'bridge.bridges']) {
  let last = '';
  const tick = async () => {
    if (br.traceStopped) return;
    try {
      const s = await br.bg(async (ks) => chrome.storage.session.get(ks), keys);
      const v = JSON.stringify(Object.fromEntries(keys.map((k) => [k, s[k] ? (k === 'bridge.grid' ? { session: s[k].session, reach: s[k].reach } : k === 'bridge.bridges' ? { chosen: s[k].chosen, reach22: s[k].reach22 } : { kind: s[k].kind }) : null])));
      if (v !== last) {
        last = v;
        br.run.ev('KEYTRACE', v);
      }
    } catch {
      /* between lives */
    }
    setTimeout(tick, 1000);
  };
  setTimeout(tick, 1000);
}

/** the panel's ⋯ -> Settings: Settings is a page (options.html) the extension opens or brings forward */
export async function openSettings(h) {
  const p = h.br.panel;
  await p.press(/^More$/);
  await sleep(400);
  await p.press(/^Settings$/);
  const pg = await h.br.waitPage(/\/options\.html/, 10_000);
  if (!pg) throw new Error('no Settings page within 10 s');
  await pg.bringToFront().catch(() => {});
  const s = h.br.surface(pg);
  let t = await s.waitText(/YOUR WORKER|Your worker/, 5000);
  if (!t) {
    // the welcome tab of this browser session is focused but stays the welcome page (ui/options.ts subscribes once,
    // at load, as "welcome" while the agreement is not accepted yet): the student would have to reload it
    h.run.check('⋯ > Settings shows Settings (not the welcome page the tab was loaded as)', false, ((await s.text()) ?? '').slice(0, 120).replace(/\n/g, ' | '));
    await moment(h, 'settings pressed, the welcome tab focused', { page: pg });
    await pg.reload().catch(() => {});
    t = await s.waitText(/YOUR WORKER|Your worker/, 10_000);
    h.run.note('the options tab was reloaded by the harness to reach Settings');
  }
  if (!t) throw new Error('the Settings page did not show "Your worker"');
  await sleep(600);
  return { page: pg, surface: s };
}
