// Installer tests for the Beethoven bridge, from the built zips to an uninstalled machine.
//
//   node test/installers.mjs --work DIR [--playwright DIR] [-- <extra suite flags>]
//
// On Windows: build the packages for a test extension (test/e2e-chromium.mjs makes it), unpack the
// Windows zip with Windows' own Expand-Archive, check the installer refuses a placeholder build and
// a lone install.cmd, install into a test folder whose path has a space and a non-ASCII letter,
// under the TEST browser's registry key only (HKCU\Software\Chromium\NativeMessagingHosts, which
// Playwright's Chromium reads; never the Chrome or Edge keys), run the suite against the installed
// host, let Chromium start it through connectNative, uninstall from inside the installed folder,
// and check that the files, the folder and the registry key are gone.
// On Linux (run it under WSL): the same for install.sh with perl and with python3, and a logic run
// of the macOS install.command and uninstall.command under a stand-in home folder (there is no
// xattr and no /usr/bin/perl check difference to see on Linux; the real Mac is not tested here).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HELPER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dd = args.indexOf('--');
const suiteExtra = dd >= 0 ? args.slice(dd + 1) : [];
const own = dd >= 0 ? args.slice(0, dd) : args;
const opt = (k) => { const i = own.indexOf(k); return i >= 0 ? own[i + 1] : undefined; };
const WORK = path.resolve(opt('--work') || 'installer-work');
const NAME = 'com.openspineconsortium.beethoven.bridge';
const VERSION = fs.readFileSync(path.join(HELPER, 'VERSION'), 'utf8').trim();

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
}
function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', timeout: 600000, ...opts });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), error: r.error };
}
const node = process.execPath;

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

// The test extension and the two builds: one for it, one with the placeholder.
const e2eDir = path.join(WORK, 'e2e');
const made = run(node, [path.join(HELPER, 'test', 'e2e-chromium.mjs'), 'make-extension', '--dir', e2eDir]);
const extId = made.out.trim();
check('test extension made', /^[a-p]{32}$/.test(extId), extId);
const outReal = path.join(WORK, 'out');
const outPh = path.join(WORK, 'out-placeholder');
check('build for the test extension', run(node, [path.join(HELPER, 'build.mjs'), '--out', outReal, '--dev', '--unpacked-id', extId]).code === 0);
check('build with the placeholder', run(node, [path.join(HELPER, 'build.mjs'), '--out', outPh]).code === 0);
check('a development identifier without --dev is refused', run(node, [path.join(HELPER, 'build.mjs'), '--out', path.join(WORK, 'out-refused'), '--unpacked-id', extId]).code === 1 && !fs.existsSync(path.join(WORK, 'out-refused')));
const manifest = JSON.parse(fs.readFileSync(path.join(outReal, 'manifest.json'), 'utf8'));
check('manifest.json lists the origin and three packages',
  manifest.origins_filled === true && manifest.allowed_origins[0] === `chrome-extension://${extId}/` && manifest.files.length === 3 && manifest.helper === VERSION);

if (process.platform === 'win32') {
  const REGKEY = `Software\\Chromium\\NativeMessagingHosts\\${NAME}`;
  const unzip = (zip, dest) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`]);
  const cmdRun = (file, env) => run('cmd.exe', ['/d', '/s', '/c', `""${file}""`], { windowsVerbatimArguments: true, env: { ...process.env, BEETHOVEN_BRIDGE_YES: '1', ...env } });
  const regQuery = () => run('reg.exe', ['query', `HKCU\\${REGKEY}`, '/ve']);

  const xPh = path.join(WORK, 'x-placeholder');
  unzip(path.join(outPh, 'beethoven-bridge-windows.zip'), xPh);
  const ph = cmdRun(path.join(xPh, 'install.cmd'), { BEETHOVEN_BRIDGE_ROOT: path.join(WORK, 'never'), BEETHOVEN_BRIDGE_REGKEYS: REGKEY });
  check('placeholder build: installer refuses (exit 3), installs nothing', ph.code === 3 && /built without Beethoven's extension identifier/.test(ph.out) && !fs.existsSync(path.join(WORK, 'never')) && regQuery().code !== 0, `exit ${ph.code}`);

  const alone = path.join(WORK, 'x-alone');
  fs.mkdirSync(alone);
  fs.copyFileSync(path.join(xPh, 'install.cmd'), path.join(alone, 'install.cmd'));
  const al = cmdRun(path.join(alone, 'install.cmd'), {});
  check('install.cmd without the rest of the folder: plain sentence, exit 2', al.code === 2 && /Extract All/.test(al.out), `exit ${al.code}`);

  const x = path.join(WORK, 'x');
  check('Expand-Archive unpacks the Windows zip', unzip(path.join(outReal, 'beethoven-bridge-windows.zip'), x).code === 0 && fs.existsSync(path.join(x, 'install.cmd')));
  const root = path.join(WORK, 'Local App Data é', 'Beethoven', 'bridge');
  const inst = cmdRun(path.join(x, 'install.cmd'), { BEETHOVEN_BRIDGE_ROOT: root, BEETHOVEN_BRIDGE_REGKEYS: REGKEY });
  check('install.cmd installs and its own check gets a hello (exit 0)', inst.code === 0 && inst.out.includes(`The Beethoven bridge ${VERSION} is installed`), `exit ${inst.code}; last line: ${inst.out.trim().split(/\r?\n/).pop()}`);
  const mPath = path.join(root, `${NAME}.json`);
  let m = null;
  try { m = JSON.parse(fs.readFileSync(mPath, 'utf8')); } catch { /* reported below */ }
  check('native messaging manifest: valid JSON, absolute path to bridge.cmd, the extension origin',
    m && m.name === NAME && m.type === 'stdio' && m.path === path.join(root, 'bridge.cmd') && fs.existsSync(m.path) && m.allowed_origins[0] === `chrome-extension://${extId}/`);
  // reg.exe prints in the console code page, which mangles the test path's letter; read the value
  // as UTF-8 through PowerShell instead.
  const rv = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$k = Get-Item -LiteralPath 'HKCU:\\${REGKEY}'; [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$k.GetValue('')))`]);
  const regValue = Buffer.from(rv.out.trim(), 'base64').toString('utf8');
  check('registry: the test browser key points at the manifest', regValue === mPath, regValue);
  const files = fs.readdirSync(root).sort().join(',');
  const expected = [`${NAME}.json`, 'README.txt', 'bridge.cmd', 'bridge.ps1', 'uninstall.cmd', 'uninstall.ps1'].sort().join(',');
  check('installed files', files === expected, files);

  const suite = run(node, [path.join(HELPER, 'test', 'suite.mjs'), '--host', path.join(root, 'bridge.cmd'), '--label', 'windows-installed', '--json', path.join(WORK, 'suite-windows-installed.json'), ...suiteExtra]);
  const last = suite.out.trim().split(/\r?\n/).filter((l) => /passed$/.test(l)).pop() || suite.out.slice(-400);
  check('suite against the installed host (path with a space and a non-ASCII letter)', suite.code === 0, last);
  fs.writeFileSync(path.join(WORK, 'suite-windows-installed.log'), suite.out);

  if (opt('--playwright')) {
    const e2e = run(node, [path.join(HELPER, 'test', 'e2e-chromium.mjs'), 'run', '--dir', e2eDir, '--host-dir', root, '--playwright', opt('--playwright')]);
    check('Chromium starts the installed bridge through connectNative', e2e.code === 0, e2e.out.trim().split(/\r?\n/).pop());
    fs.writeFileSync(path.join(WORK, 'e2e-chromium.log'), e2e.out);
  } else {
    check('Chromium starts the installed bridge through connectNative', false, 'not run: no --playwright');
  }

  const un = cmdRun(path.join(root, 'uninstall.cmd'), { BEETHOVEN_BRIDGE_ROOT: root, BEETHOVEN_BRIDGE_REGKEYS: REGKEY });
  check('uninstall.cmd from inside the installed folder removes files, folder and key', !fs.existsSync(root) && regQuery().code !== 0 && /removed/.test(un.out), `exit ${un.code}; folder ${fs.existsSync(root) ? 'still there' : 'gone'}`);
  // The NativeMessagingHosts key under Software\Chromium did not exist before these tests.
  const parent = run('reg.exe', ['query', 'HKCU\\Software\\Chromium\\NativeMessagingHosts']);
  if (parent.code === 0 && !/NativeMessagingHosts\\/.test(parent.out)) run('reg.exe', ['delete', 'HKCU\\Software\\Chromium\\NativeMessagingHosts', '/f']);
  check('test registry key and its empty parent removed', run('reg.exe', ['query', 'HKCU\\Software\\Chromium\\NativeMessagingHosts']).code !== 0);
} else {
  const unzip = (zip, dest) => run('unzip', ['-q', '-o', zip, '-d', dest]);
  const fakeHome = path.join(WORK, 'home with space');
  fs.mkdirSync(fakeHome, { recursive: true });
  const env = (extra) => ({ ...process.env, HOME: fakeHome, XDG_DATA_HOME: '', XDG_CONFIG_HOME: '', BEETHOVEN_BRIDGE_YES: '1', ...extra });

  const xPh = path.join(WORK, 'x-placeholder');
  unzip(path.join(outPh, 'beethoven-bridge-linux.zip'), xPh);
  const ph = run('bash', [path.join(xPh, 'install.sh')], { env: env({}) });
  check('linux placeholder build: installer refuses (exit 3)', ph.code === 3 && !fs.existsSync(path.join(fakeHome, '.local')), `exit ${ph.code}`);

  for (const prefer of ['perl', 'python']) {
    const x = path.join(WORK, `x-linux-${prefer}`);
    unzip(path.join(outReal, 'beethoven-bridge-linux.zip'), x);
    const modes = fs.statSync(path.join(x, 'install.sh')).mode & 0o777;
    check(`linux zip keeps the executable bit (${prefer})`, modes === 0o755, modes.toString(8));
    const inst = run('bash', [path.join(x, 'install.sh')], { env: env(prefer === 'python' ? { BEETHOVEN_BRIDGE_PREFER: 'python' } : {}) });
    check(`install.sh with ${prefer}: installs and its own check gets a hello`, inst.code === 0 && inst.out.includes(`(${prefer})`), inst.out.trim().split('\n').pop());
    const mPath = path.join(fakeHome, '.config', 'google-chrome', 'NativeMessagingHosts', `${NAME}.json`);
    let m = null;
    try { m = JSON.parse(fs.readFileSync(mPath, 'utf8')); } catch { /* below */ }
    const root = path.join(fakeHome, '.local', 'share', 'beethoven', 'bridge');
    check(`linux manifest (${prefer}): valid JSON, launcher path, origin`, m && m.path === path.join(root, 'bridge') && m.allowed_origins[0] === `chrome-extension://${extId}/`);
    const suite = run(node, [path.join(HELPER, 'test', 'suite.mjs'), '--host', path.join(root, 'bridge'), '--label', `linux-installed-${prefer}`, '--json', path.join(WORK, `suite-linux-installed-${prefer}.json`), ...suiteExtra]);
    const last = suite.out.trim().split('\n').filter((l) => /passed$/.test(l)).pop() || suite.out.slice(-400);
    fs.writeFileSync(path.join(WORK, `suite-linux-installed-${prefer}.log`), suite.out);
    check(`suite against the installed launcher (${prefer})`, suite.code === 0, last);
    const un = run('bash', [path.join(root, 'uninstall.sh')], { env: env({}) });
    check(`uninstall.sh (${prefer}) leaves nothing`, un.code === 0 && !fs.existsSync(root) && !fs.existsSync(path.join(fakeHome, '.local', 'share', 'beethoven')) && !fs.existsSync(mPath));
  }

  // macOS installer logic, under bash 5 on Linux with a stand-in home: paths, manifest, self-check,
  // uninstall. What only a Mac can show (Gatekeeper, xattr, bash 3.2, /usr/bin/perl) is not tested.
  const xm = path.join(WORK, 'x-mac');
  unzip(path.join(outReal, 'beethoven-bridge-mac.zip'), xm);
  check('mac zip keeps the executable bit on install.command', (fs.statSync(path.join(xm, 'install.command')).mode & 0o777) === 0o755);
  const mi = run('bash', [path.join(xm, 'install.command')], { env: env({}) });
  const as = path.join(fakeHome, 'Library', 'Application Support');
  const mm = path.join(as, 'Google', 'Chrome', 'NativeMessagingHosts', `${NAME}.json`);
  let mj = null;
  try { mj = JSON.parse(fs.readFileSync(mm, 'utf8')); } catch { /* below */ }
  check('install.command logic (on Linux): installs, manifest valid, self-check answers',
    mi.code === 0 && mj && mj.path === path.join(as, 'Beethoven', 'bridge', 'bridge.pl'), mi.out.trim().split('\n').pop());
  const mu = run('bash', [path.join(as, 'Beethoven', 'bridge', 'uninstall.command')], { env: env({}) });
  check('uninstall.command logic (on Linux) leaves nothing', mu.code === 0 && !fs.existsSync(path.join(as, 'Beethoven')) && !fs.existsSync(mm));
}

const passed = results.filter((r) => r.ok).length;
console.log(`\ninstallers (${process.platform}): ${passed}/${results.length} passed`);
fs.writeFileSync(path.join(WORK, `installers-${process.platform}.json`), JSON.stringify({ passed, total: results.length, results }, null, 2));
process.exit(passed === results.length ? 0 : 1);
