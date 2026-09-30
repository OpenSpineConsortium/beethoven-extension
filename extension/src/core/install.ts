// Setting up the cluster: the lab's shared copy of the tool, the only way since 8.0.0.
//
// The package carries no cluster-side code. The tool lives once, read-only, in the folder the lab
// keeps on its volume, which the site profile names as "shared_install"; the profiles this build
// carries (public/profiles/<site>.json, written by scripts/sync-profiles.mjs) are data only.
// Setting up is one line through the bootstrap shell, the shared tool's own install (`bash
// <dir>/bin/hpcworker install --shared <dir> --profile <site>`), which gives the account a small
// launcher, a marker naming the folder, the profile and the PATH block, and copies no code. The
// lab keeps that copy current in one place, so the extension never calls it outdated.
//
// When the site's profile names no shared folder, or the account cannot use it (bash could not
// open its launcher: exit 126, no permission; 127, not there; or the tool refused the folder: exit
// 3, "the shared copy at DIR cannot be used from this account: ..."), nothing is uploaded instead:
// the strip says the lab's shared copy is needed and to ask the lab lead, and Details says why.
// Any other failure is reported as it is, notably the tool's refusal to move an own copy aside
// while a worker still runs from it. Whether the account can use the shared copy is judged by that
// shell line, the same account and path the jobs use, and not by the portal's Files app, whose
// view of a lab volume was never measured.
//
// An account set up by a build before 8.0.0 may still run its own copy in ~/.hpcworker. The
// framework keeps running it, the panel says "your own copy, version N", and "Set up the cluster
// again" under Details moves it to the lab's copy where the site has one; nothing here updates it.
// The site profile is read through `fetchAsset`, which the pages implement with the extension's own URL.
import { commands, sharedInstallFrom } from './contract';
import type { InstallNote } from './keys';
import type { PortalApi } from './portal';
import type { Facts } from './steps';

/** where a site's profile sits in the package (scripts/sync-profiles.mjs writes public/profiles/) */
export const profileAsset = (site: string): string => `/profiles/${site}.json`;

/**
 * The shared folder the site profile this build carries names ("shared_install" in
 * framework/profiles/<site>.json), or undefined: no such profile, no such key, or a value that is
 * not a plain absolute folder.
 */
export async function bundledSharedInstall(site: string, fetchAsset: (path: string) => Promise<Response>): Promise<string | undefined> {
  if (!/^[A-Za-z0-9_-]+$/.test(String(site ?? ''))) return undefined;
  try {
    const res = await fetchAsset(profileAsset(site));
    if (!res.ok) return undefined;
    return sharedInstallFrom(await res.text());
  } catch {
    return undefined;
  }
}

/** why nothing can be set up where the site profile names no shared folder, for Details */
export function noSharedForSite(site: string | undefined): string {
  return `no shared copy of the tool is known for the site "${String(site ?? '').slice(0, 60)}" (the site profile name under Settings)`;
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

/** what the panel calls the lab's shared folder: never its path */
export const LAB_COPY = "the lab's shared copy";

/**
 * The install's output with the lab's shared folder named in words, not by its path. The tool
 * prints the folder (and the numbered copies beside `current`, which live in the same parent), and
 * the panel shows no cluster path (CLAUDE.md, the public name). Where the tool says "shared copy ...
 * at PATH" the path is dropped ("the shared copy of hpcworker 6 at /x/current (nothing copied)"
 * reads "the shared copy of hpcworker 6 (nothing copied)"); any other path under that parent
 * becomes LAB_COPY. Paths anywhere else, such as the student's own ~/.hpcworker, are left as they are.
 */
export function hideSharedPath(text: string, dir: string | undefined): string {
  const root = String(dir ?? '').replace(/\/+$/, '');
  if (!root.startsWith('/')) return text;
  const parent = root.slice(0, root.lastIndexOf('/')) || root;
  const escaped = parent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // a path ends at white space, a quote, a bracket or punctuation bash and the tool put after one ("DIR: Permission denied")
  const pathRe = `'?${escaped}(?![^/\\s'"(),;:])(?:/[^\\s'"(),;:]*)?'?`;
  return text
    .replace(new RegExp(`(shared copy(?: of hpcworker \\S+)?) at ${pathRe}`, 'g'), '$1')
    .replace(new RegExp(pathRe, 'g'), LAB_COPY);
}

/** the strip's one line for an install that failed for any reason but the shared copy: the refusal a running worker causes in plain words, else the exit code */
export function installFailureWords(r: { exitCode?: number; log: string }): string {
  if (PROBE_BUSY.test(r.log)) return 'the check job on a compute node is still running from your own copy of the tool; try again once it has finished';
  if (WORKER_BUSY.test(r.log)) return 'your worker is still running from your own copy of the tool; stop it (Details), then try again';
  return `the install command ended with exit ${r.exitCode ?? 'unknown'} (see Details)`;
}

export interface InstallOutcome {
  ok: boolean;
  /** the install line's exit code; undefined when no line was typed (the site profile names no shared folder) */
  exitCode?: number;
  log: string;
  /** the shared folder the site profile names, when it names one */
  sharedDir?: string;
  /** why the lab's shared copy cannot be used, in the student's words; nothing was uploaded instead */
  noShared?: string;
}

export interface InstallOptions {
  site: string;
  fetchAsset: (path: string) => Promise<Response>;
  onProgress?: (text: string) => void;
  /** waits out the 15 s floor between two shell lines; tests pass their own clock */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function installFramework(portal: PortalApi, o: InstallOptions): Promise<InstallOutcome> {
  const sleep = o.sleep ?? realSleep;
  const log: string[] = [];
  const show = () => o.onProgress?.(log.join('\n'));
  const sharedDir = await bundledSharedInstall(o.site, o.fetchAsset);
  if (!sharedDir) {
    const why = noSharedForSite(o.site);
    log.push(`nothing was typed and nothing is uploaded: ${why}`);
    show();
    return { ok: false, log: log.join('\n'), noShared: why };
  }
  // what the log shows of the tool's output: the lab's folder in words (the line typed is the exact command all the same)
  const hide = (text: string) => hideSharedPath(text, sharedDir);
  log.push(`running the install of ${LAB_COPY}, one line through the portal's shell; nothing is uploaded`);
  show();
  // one shell line every 15 s (audit.ts FLOORS_MS.shell): wait the clock out rather than fail on it
  const wait = await portal.auditWait('shell').catch(() => 0);
  if (wait > 0) await sleep(wait + 250);
  const r = await portal.shell(commands.installShared(sharedDir, o.site), { timeoutMs: 120_000 });
  log.push(hide(r.output.trimEnd()), `exit ${r.exitCode}`);
  show();
  if (r.exitCode === 0) return { ok: true, exitCode: 0, log: log.join('\n'), sharedDir };
  const why = sharedUnusable(r);
  return { ok: false, exitCode: r.exitCode, log: log.join('\n'), sharedDir, ...(why ? { noShared: `your lab's shared copy of the tool cannot be used from your account: ${hide(why)}` } : {}) };
}

/** Details' line for why the lab's shared copy was not used */
const whyLine = (why: string): string => `Why: ${why}.`;

/** what the strip and Details remember of an install (keys.ts INSTALL_KEY) */
export function installNoteOf(r: InstallOutcome, at: Date): InstallNote {
  return {
    attempted_at: at.toISOString(),
    ok: r.ok,
    detail: r.exitCode === undefined ? 'no install line typed' : `exit ${r.exitCode}, ${LAB_COPY}`,
    ...(r.sharedDir ? { dir: r.sharedDir } : {}),
    ...(r.noShared ? { note: whyLine(r.noShared) } : {}),
  };
}

/**
 * The tool line under Details: "tool: the lab's shared copy, version N" or "tool: your own copy,
 * version N" (an account set up before 8.0.0), never with a path; then, when the lab's shared copy
 * could not be used, why; or, for an own copy at a site with a shared folder, that the button moves
 * the account to it. Empty until the home was read.
 */
export function toolWords(install: Facts['install'] | undefined, note?: InstallNote): string[] {
  if (!install || install.installed === undefined) return [];
  if (!install.installed) {
    const lines = [`tool: not set up yet${install.sharedRoot ? '; your lab keeps a shared copy' : ''}`];
    if (install.noSharedCopy) lines.push(whyLine(install.noSharedCopy));
    else if (note?.note && !note.ok) lines.push(note.note);
    return lines;
  }
  const s = install.shared;
  if (s) return [`tool: ${LAB_COPY}, version ${s.version ?? 'unknown'}${s.unreadable ? ` (${hideSharedPath(s.unreadable, s.dir)})` : ''}`];
  const lines = [`tool: your own copy, version ${install.version ?? 'unknown'}`];
  if (note?.note) lines.push(note.note);
  else if (install.sharedRoot) lines.push('Your lab keeps a shared copy; "Set up the cluster again" moves your account to it.');
  return lines;
}
