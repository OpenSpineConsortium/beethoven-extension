// Every worker of the student's on the grid, for the home's "Your workers" (24.0.0). A student may run
// several workers at once, each on a Claude account of their own (hpcworker framework 22, `accounts
// start N`), and the claude.ai tab can show only workers of the account it is signed in to. This file
// is pure: it picks the run folders out of the state directory's listing, reads what each worker's
// status.json says (its state, its link and the Claude account Claude Code reports, the same fields the
// panel already reads for the student's own worker), and decides for each whether this browser can show
// it or the student should open it in the Chrome profile signed in to that account. Beethoven never
// reads claude.ai: which account this browser uses there is the student's own choice in Settings
// (Prefs.claude_account), and while none is chosen every worker is offered here, as before 24.0.0.
import { isClaudeCodeLink, WORKER_NAME_RE, type ConnectionFile, type StatusFile } from './contract';
import { claudeLinkOf } from './facts';
import { WORDS } from './model';

/** the most workers listed; hpcworker allows 32 accounts, and a student with more workers than this is not a case yet */
export const WORKERS_MAX = 12;
/** how often the list is read again while a page of Beethoven's is open (the grid's 60 s floor) */
export const WORKERS_EVERY_MS = 60_000;
/** Your workers opened reads the list again unless it was read this recently */
export const WORKERS_AGAIN_MS = 5_000;
/** a read that failed (the grid busy, the state folder not made yet) is tried again this much sooner than the floor */
export const WORKERS_RETRY_MS = 10_000;

/** folders of the state directory that are never a worker's run */
const NOT_RUNS = new Set(['workspaces', 'log', 'logs', 'accounts']);

/** WORKERS_KEY (session): what the last read found */
export interface WorkerList {
  checked_at: string;
  workers: WorkerSeen[];
}

export interface WorkerSeen {
  name: string;
  state: 'online' | 'starting' | 'queued' | 'stopped' | 'unknown';
  /** the worker's claude.ai link, either form (contract.ts isClaudeCodeLink); absent until it is online */
  link?: string;
  /** the Claude account Claude Code reports in the worker's status.json (claude_login.email) */
  account?: string;
}

/** the run folders in a listing of the state directory: worker names, no hidden or shared folder, in name order */
export function runFolders(entries: ReadonlyArray<{ name: string; type: string }>): string[] {
  return entries
    .filter((e) => e.type === 'd' && WORKER_NAME_RE.test(e.name) && !NOT_RUNS.has(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, WORKERS_MAX);
}

function stateOf(s: StatusFile['state'] | undefined): WorkerSeen['state'] {
  switch (s) {
    case 'online':
    case 'running':
      return 'online';
    case 'starting':
    case 'need_login':
    case 'need_consent':
    case 'preempted':
      return 'starting';
    case 'queued':
      return 'queued';
    case 'stopped':
    case 'error':
      return 'stopped';
    default:
      return 'unknown';
  }
}

/** one worker as its own files describe it; undefined for a folder with no status.json, which is no worker's run */
export function workerSeen(name: string, status: StatusFile | undefined, connection?: ConnectionFile): WorkerSeen | undefined {
  if (!status) return undefined;
  const state = stateOf(status.state);
  const link = state === 'online' ? claudeLinkOf({ status, ...(connection ? { connection } : {}) }) : undefined;
  const account = status.claude_login?.loggedIn !== false ? accountOf(status.claude_login?.email) : undefined;
  return { name, state, ...(link ? { link } : {}), ...(account ? { account } : {}) };
}

/** an e-mail address as Claude Code reports it, lower-cased; anything else is not taken */
export function accountOf(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,190}$/.test(t) ? t : undefined;
}

/** the accounts the workers run on, in order of first appearance, for Settings' choice */
export function accountsOf(list: WorkerList | undefined): string[] {
  const out: string[] = [];
  for (const w of list?.workers ?? []) if (w.account && !out.includes(w.account)) out.push(w.account);
  return out;
}

/**
 * What the home offers for one worker: "show" (its link, in the claude.ai tab Beethoven opened), "elsewhere" (it runs on
 * another account than the one Settings names for this browser: open it in the Chrome profile signed in there, with
 * Copy link to carry the address over), or "none" (not online yet, or no link).
 */
export type WorkerOffer = 'show' | 'elsewhere' | 'none';

export function offerOf(w: WorkerSeen, mine: string | undefined): WorkerOffer {
  if (w.state !== 'online' || !isClaudeCodeLink(w.link)) return 'none';
  if (mine && w.account && w.account !== mine) return 'elsewhere';
  return 'show';
}

/** the worker a show-worker press names, with the link it opens, only while that link is still offered here */
export function showable(list: WorkerList | undefined, name: string, mine: string | undefined): WorkerSeen | undefined {
  const w = list?.workers.find((x) => x.name === name);
  return w && offerOf(w, mine) === 'show' ? w : undefined;
}

// ---- 25.0.0: the right-click entry, Open in Beethoven -------------------------------------------------------------------
//
// greg, 2026-10-25: "can it add a profile selection suggester based on the session id? ... add an Open in Beethoven option
// which automatically starts on the right account, also this sholdnt require logging into the VPN or grid". An extension
// cannot open a tab in another Chrome profile, so the entry does what one profile can: on the link of a worker this
// browser can show, Open in Beethoven opens it in the Claude tab Beethoven keeps; on the link of a worker on another
// account, a greyed line names that account beside Chrome's own Open link as, which opens a link in another profile.
// Chrome matches an entry's patterns against a link's path and query, so each worker's entry shows only on its own links,
// and Chrome keeps the entries across restarts; what they are built from is kept too (MENU_KEY), so neither the grid nor
// the VPN is needed to use them or to rebuild them when Settings names another account for this browser.

/** MENU_KEY (local): the workers the last read of the grid found online with a link, replaced at each read */
export interface MenuWorkers {
  saved_at: string;
  workers: MenuWorker[];
}

export interface MenuWorker {
  name: string;
  link: string;
  account?: string;
}

/** one right-click entry, on the links of one worker */
export interface MenuEntry {
  id: string;
  title: string;
  /** Chrome's match patterns for the worker's link (linkPatterns) */
  patterns: string[];
  /** Open in Beethoven can be pressed; the line that names another account cannot, since only Chrome's Open link as reaches another profile */
  enabled: boolean;
}

/** the id prefixes of the two kinds of entry; a worker's name follows (WORKER_NAME_RE) */
export const MENU_OPEN = 'open:';
export const MENU_ELSEWHERE = 'elsewhere:';

/** what a read found that can take an entry: online with a Claude Code link, one worker per link, in the read's order */
export function menuWorkersOf(list: WorkerList): MenuWorker[] {
  const out: MenuWorker[] = [];
  for (const w of list.workers) {
    if (w.state !== 'online' || !isClaudeCodeLink(w.link) || out.some((m) => m.link === w.link)) continue;
    out.push({ name: w.name, link: w.link, ...(w.account ? { account: w.account } : {}) });
  }
  return out;
}

/**
 * The match patterns of a worker's link: the link itself on claude.ai and on claude.com, and the link with more after it
 * (more parameters after an environment's id, a query after a session's). The id's characters are letters, digits, _ and
 * -, none of them special in a pattern, so a pattern names that one worker.
 */
export function linkPatterns(link: string): string[] {
  const u = new URL(link);
  const rest = `${u.pathname}${u.search}`;
  const more = u.search ? '&*' : '?*';
  return ['claude.ai', 'claude.com'].flatMap((host) => [`https://${host}${rest}`, `https://${host}${rest}${more}`]);
}

/** the entries for the workers kept, as Settings' account for this browser places each one (offerOf's rule) */
export function menuEntriesOf(workers: readonly MenuWorker[], mine: string | undefined): MenuEntry[] {
  return workers.map((w) => {
    const patterns = linkPatterns(w.link);
    return mine && w.account && w.account !== mine
      ? { id: `${MENU_ELSEWHERE}${w.name}`, title: WORDS.menu.elsewhere(w.account), patterns, enabled: false }
      : { id: `${MENU_OPEN}${w.name}`, title: WORDS.menu.open, patterns, enabled: true };
  });
}

/**
 * What an Open in Beethoven press opens: the link the student right-clicked when it is a worker's link exactly, else the
 * link kept for the worker the entry names; nothing for any other entry, or for a worker no longer kept.
 */
export function menuTarget(id: string, clicked: string | undefined, kept: MenuWorkers | undefined): string | undefined {
  if (!id.startsWith(MENU_OPEN)) return undefined;
  const name = id.slice(MENU_OPEN.length);
  if (!WORKER_NAME_RE.test(name)) return undefined;
  if (isClaudeCodeLink(clicked)) return clicked;
  const w = kept?.workers.find((x) => x.name === name);
  return w && isClaudeCodeLink(w.link) ? w.link : undefined;
}
