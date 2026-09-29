// Setting up the cluster, in one of two ways.
//
// The lab's shared copy (framework 5): when the site profile this build carries names a
// "shared_install" folder (profiles/<site>.json), nothing is uploaded. One line through the
// bootstrap shell runs the shared tool's own install (`bash <dir>/bin/hpcworker install --shared
// <dir> --profile <site>`), which gives the account a small launcher, a marker naming the folder,
// the profile and the PATH block. The lab keeps that copy up to date in one place, so a shared
// install is never "outdated" against the copy this build carries.
//
// The student's own copy: upload whatever scripts/sync-framework.mjs bundled from ../framework to
// ~/.hpcworker through the Files app (PUT, one file at a time, no floor), then one install line
// through the bootstrap shell (the tool strips CR endings itself and copies nothing when it
// already runs from ~/.hpcworker). This is the way at a site with no shared folder, and the
// fallback when the shared copy cannot be used from the student's account: bash could not open
// its launcher (exit 126, no permission; 127, not there) or the tool refused the folder (exit 3,
// "the shared copy at DIR cannot be used from this account: ..."). Any other failure is reported
// as it is, notably the tool's refusal to move an own copy aside while a worker still runs from
// it. Whether the account can use the shared copy is judged by that shell line, the same account
// and path the jobs use, and not by the portal's Files app, whose view of a lab volume was never
// measured.
//
// The strip runs this by itself when the tool is missing, and again when ~/.hpcworker/VERSION is
// older than the VERSION this build carries (the upload rewrites VERSION with the files and the
// tool's install keeps the profile and says "upgraded"; at a site with a shared folder that update
// is the move to the shared copy); the Details section keeps a button for it. The bundled files are
// read through `fetchAsset`, which the pages implement with the extension's own URL.
import { commands, paths, sharedInstallFrom } from './contract';
import type { InstallNote } from './keys';
import type { PortalApi } from './portal';
import type { Facts } from './steps';

/** the VERSION file of the framework this build carries: an integer, or undefined when the build has none */
export async function bundledFrameworkVersion(fetchAsset: (path: string) => Promise<Response>): Promise<string | undefined> {
  try {
    const res = await fetchAsset('/framework/files/VERSION');
    if (!res.ok) return undefined;
    const v = (await res.text()).trim();
    return /^\d+$/.test(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The shared folder the site profile this build carries names ("shared_install" in
 * framework/profiles/<site>.json), or undefined: no such profile, no such key (a profile from
 * before framework 5 has none), or a value that is not a plain absolute folder.
 */
export async function bundledSharedInstall(site: string, fetchAsset: (path: string) => Promise<Response>): Promise<string | undefined> {
  if (!/^[A-Za-z0-9_-]+$/.test(String(site ?? ''))) return undefined;
  try {
    const res = await fetchAsset(`/framework/files/profiles/${site}.json`);
    if (!res.ok) return undefined;
    return sharedInstallFrom(await res.text());
  } catch {
    return undefined;
  }
}

/** Is the installed tool older than the bundled one? Versions are integers; a missing or unreadable one counts as older. */
export function frameworkOlder(installed: string | undefined, bundled: string): boolean {
  const have = Number(String(installed ?? '').trim());
  const want = Number(String(bundled ?? '').trim());
  if (!Number.isFinite(want)) return false;
  return !Number.isFinite(have) || have < want;
}

/**
 * Framework 5's refusal of a shared folder this account cannot use, exit 3: "hpcworker: the shared
 * copy at DIR cannot be used from this account: WHY. Nothing was changed." (install --shared), or
 * "... cannot be read from this account (...)" (its launcher, when the folder became unreadable).
 */
const SHARED_REFUSED = /the shared copy at \S+ cannot be (?:used|read) from this account(?::[ \t]*([^\r\n]*))?/i;
/** bash's own words when it cannot open the launcher: exit 126 (no permission) or 127 (not there) */
const LAUNCHER_UNOPENED = /bin\/hpcworker[^\n]*(No such file or directory|Permission denied|Is a directory|cannot execute)/i;
/** framework 5 refuses to move an own copy aside while a worker still runs from it (exit 1, "Stop it first") */
const WORKER_BUSY = /still runs from the copy in .*Stop it first/i;
/** the same refusal when what still runs is the probe (framework live_run names it "probe (job N)"): it ends by itself, and stopping the worker does not help */
const PROBE_BUSY = /your worker probe \(job [^)]*\) still runs from the copy in/i;

/**
 * Why the shared copy cannot be used from this account, in the student's words, or undefined when
 * the failure was something else (the tool ran and said why; that is reported, not worked around).
 */
export function sharedUnusable(r: { exitCode: number; output: string }): string | undefined {
  if (r.exitCode === 0) return undefined;
  const out = String(r.output ?? '');
  if ((r.exitCode === 126 || r.exitCode === 127) && LAUNCHER_UNOPENED.test(out)) return r.exitCode === 127 ? 'it is not there, or your account cannot reach it' : 'your account may not read it';
  const m = SHARED_REFUSED.exec(out);
  if (!m && !(r.exitCode === 3 && /shared copy/i.test(out))) return undefined;
  const why = (m?.[1] ?? '')
    .replace(/\s*Nothing was changed\.?\s*$/i, '')
    .replace(/[.\s]+$/, '')
    .replace(/\bthis account\b/g, 'your account')
    .trim();
  return why || 'your account cannot use it';
}

/** the strip's one line for an install that failed: the refusal a running worker causes in plain words, else the exit code */
export function installFailureWords(r: { exitCode: number; log: string }): string {
  if (PROBE_BUSY.test(r.log)) return 'the check job on a compute node is still running from your own copy of the tool; try again once it has finished';
  if (WORKER_BUSY.test(r.log)) return 'your worker is still running from your own copy of the tool; stop it (Details), then try again';
  return `the install command ended with exit ${r.exitCode} (see Details)`;
}

export interface FrameworkManifest {
  v: number;
  generated: string;
  files: Array<{ path: string; bytes: number; sha256: string; mode: string }>;
}

export interface InstallOutcome {
  ok: boolean;
  exitCode: number;
  uploaded: number;
  log: string;
  /** which copy the account runs after this: the lab's shared one, or its own */
  mode: 'shared' | 'own';
  /** the shared folder the site profile names, when it names one */
  sharedDir?: string;
  /** one line for Details: the shared copy could not be used, so the tool went to the student's own account */
  note?: string;
}

export interface InstallOptions {
  site: string;
  fetchAsset: (path: string) => Promise<Response>;
  onProgress?: (text: string) => void;
  /** waits out the 15 s floor between two shell lines (the shared attempt, then the fallback's install); tests pass their own clock */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function installFramework(portal: PortalApi, o: InstallOptions): Promise<InstallOutcome> {
  const sleep = o.sleep ?? realSleep;
  const log: string[] = [];
  const show = () => o.onProgress?.(log.join('\n'));
  // one shell line every 15 s (audit.ts FLOORS_MS.shell): wait the clock out rather than fail on it
  const shellFree = async () => {
    const wait = await portal.auditWait('shell').catch(() => 0);
    if (wait > 0) await sleep(wait + 250);
  };
  const home = await portal.home();
  log.push(`home ${home}`);
  const sharedDir = await bundledSharedInstall(o.site, o.fetchAsset);
  let note: string | undefined;
  if (sharedDir) {
    const line = commands.installShared(sharedDir, o.site);
    log.push(`your lab keeps a shared copy of the tool at ${sharedDir}; nothing is uploaded`, `running: ${line}`);
    show();
    await shellFree();
    const r = await portal.shell(line, { timeoutMs: 120_000 });
    log.push(r.output.trimEnd(), `exit ${r.exitCode}`);
    show();
    if (r.exitCode === 0) return { ok: true, exitCode: 0, uploaded: 0, log: log.join('\n'), mode: 'shared', sharedDir };
    const why = sharedUnusable(r);
    if (!why) return { ok: false, exitCode: r.exitCode, uploaded: 0, log: log.join('\n'), mode: 'shared', sharedDir };
    note = `Your lab's shared copy of the tool at ${sharedDir} could not be used from your account: ${why}. The tool was put in your own account instead.`;
    log.push(note);
    show();
  }
  const res = await o.fetchAsset('/framework/files.json');
  if (!res.ok) throw new Error('this build carries no framework files (framework/files.json missing)');
  const manifest = (await res.json()) as FrameworkManifest;
  if (!manifest.files.length) throw new Error('this build carries no framework files: the framework/ folder was empty when the extension was built, so there is nothing to install yet');
  const root = paths.root(home);
  log.push(`uploading ${manifest.files.length} file(s) to ${root}`);
  show();
  const dirs = new Set<string>([root]);
  for (const f of manifest.files) {
    const parts = f.path.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(`${root}/${parts.slice(0, i).join('/')}`);
  }
  for (const d of [...dirs].sort()) await portal.mkdir(d);
  for (const f of manifest.files) {
    const body = await o.fetchAsset(`/framework/files/${f.path}`).then((r) => r.text());
    await portal.writeFile(`${root}/${f.path}`, body);
    log.push(`  ${f.path} (${f.bytes} bytes)`);
    show();
  }
  log.push(`running: ${commands.install(o.site)}`);
  show();
  await shellFree();
  const r = await portal.shell(commands.install(o.site), { timeoutMs: 180_000 });
  log.push(r.output, `exit ${r.exitCode}`);
  show();
  return { ok: r.exitCode === 0, exitCode: r.exitCode, uploaded: manifest.files.length, log: log.join('\n'), mode: 'own', ...(sharedDir ? { sharedDir } : {}), ...(note ? { note } : {}) };
}

/** what the strip and Details remember of an install (keys.ts INSTALL_KEY) */
export function installNoteOf(r: InstallOutcome, at: Date): InstallNote {
  return {
    attempted_at: at.toISOString(),
    ok: r.ok,
    detail: r.mode === 'shared' ? `exit ${r.exitCode}, your lab's shared copy at ${r.sharedDir}` : `exit ${r.exitCode}, ${r.uploaded} file(s) uploaded`,
    mode: r.mode,
    ...(r.sharedDir ? { dir: r.sharedDir } : {}),
    ...(r.note ? { note: r.note } : {}),
  };
}

/**
 * The tool line under Details: "tool: shared copy, version N at DIR" or "tool: your copy, version
 * N", then, for an own copy at a site with a shared folder, either why the shared copy was not used
 * (the last install's note) or that the button moves the account to it. Empty until the home was read.
 */
export function toolWords(install: Facts['install'] | undefined, note?: InstallNote): string[] {
  if (!install || install.installed === undefined) return [];
  if (!install.installed) return [`tool: not set up yet${install.sharedRoot ? `; your lab keeps a shared copy at ${install.sharedRoot}` : ''}`];
  const s = install.shared;
  if (s) return [`tool: shared copy, version ${s.version ?? 'unknown'} at ${s.dir}${s.unreadable ? ` (${s.unreadable})` : ''}`];
  const lines = [`tool: your copy, version ${install.version ?? 'unknown'}`];
  if (note?.note) lines.push(note.note);
  else if (install.sharedRoot) lines.push(`Your lab keeps a shared copy at ${install.sharedRoot}; "Set up the cluster again" moves your account to it.`);
  return lines;
}
