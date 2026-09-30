// The message bus between the extension's pages, its background and the portal page script.
// Every listener checks sender.id against the extension's own id before it reads a message; the
// content script additionally answers only operations named in PORTAL_OPS. Errors do not
// survive sendMessage, so answers are wrapped. The login terminal is not a message: it is a port
// (LOGIN_PORT) from the panel to the page script, so that closing the panel closes the shell.
import type { PortalOp } from './portal';

/** the port name the panel connects to the portal page script with for the login terminal */
export const LOGIN_PORT = 'beethoven-login';

export type Request =
  /** the page script announcing itself from a portal tab */
  | { type: 'portal.hello'; origin: string }
  /** a page asking the background to relay one operation to the page script */
  | { type: 'portal.call'; op: PortalOp; args: unknown[] }
  /** is a page script alive in a portal tab? */
  | { type: 'portal.ping' }
  /** which tab the page script answers from */
  | { type: 'portal.tab' }
  /** read the current run's files now rather than at the next alarm */
  | { type: 'run.refresh' }
  /** the current run (from storage.session) */
  | { type: 'run.get' }
  /** forget the current run (after a stop) */
  | { type: 'run.clear' }
  /** set the current run after a start made by a page */
  | { type: 'run.set'; stateDir: string; run: string; job: string; site?: string }
  /** the student pressed Stop: the run stays stopped until they start it again */
  | { type: 'run.stopped' }
  /** open the run's claude.ai link in a tab now (the green button and the strip's once-only opening) */
  | { type: 'run.open' }
  /** start the worker now, through the background's one start path (the strip asks for this) */
  | { type: 'worker.start' }
  /** fetch and verify the kill-list now */
  | { type: 'killlist.refresh' }
  /** ask Licensor's access service whether the signed-in account is approved (the background honours its caches; `force` asks again after a refusal or a failed attempt) */
  | { type: 'access.check'; force?: boolean }
  /** the background pushing a new run state to open pages */
  | { type: 'run.changed' };

/** frames on the login port, panel -> page script */
export type LoginIn = { type: 'input'; text: string } | { type: 'close' };

/** frames on the login port, page script -> panel; `out` carries terminal text with codes stripped */
export type LoginOut =
  | { type: 'open' }
  | { type: 'out'; text: string }
  | { type: 'auth-url'; url: string }
  | { type: 'refused-url' }
  | { type: 'code-prompt' }
  | { type: 'signed-in'; detail: string }
  | { type: 'failed'; detail: string }
  | { type: 'closed'; reason: string; closeCode?: number; closeReason?: string }
  | { type: 'error'; message: string };

export type Answer<T = unknown> = { ok: true; value: T } | { ok: false; error: { name: string; message: string; status?: number; waitMs?: number } };

export function fail(e: unknown): Answer<never> {
  const err = e as { name?: string; message?: string; status?: number; waitMs?: number };
  return { ok: false, error: { name: err?.name ?? 'Error', message: err?.message ?? String(e), ...(err?.status !== undefined ? { status: err.status } : {}), ...(err?.waitMs !== undefined ? { waitMs: err.waitMs } : {}) } };
}

export function succeed<T>(value: T): Answer<T> {
  return { ok: true, value };
}

/** Turn an answer back into a value or a thrown error on the asking side. */
export function unwrap<T>(a: Answer<T> | undefined): T {
  if (!a) throw new Error('no answer (is the background asleep, or the portal tab closed?)');
  if (a.ok) return a.value;
  const e = new Error(a.error.message) as Error & { status?: number; waitMs?: number };
  e.name = a.error.name;
  if (a.error.status !== undefined) e.status = a.error.status;
  if (a.error.waitMs !== undefined) e.waitMs = a.error.waitMs;
  throw e;
}
