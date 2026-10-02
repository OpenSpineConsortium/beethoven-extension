// The message bus between the extension's pages, its background and the portal page script.
// Every listener checks sender.id against the extension's own id before it reads a message; the
// content script additionally answers only operations named in PORTAL_OPS. Errors do not
// survive sendMessage, so answers are wrapped. The login terminal is not a message: it is a port
// (LOGIN_PORT) from the panel to the page script, so that closing the panel closes the shell.
//
// 11.0.0 (docs/V11_CONTRACT.md, "Messages") adds, without removing anything 10.0.0's page script
// and tab mode use:
//   - VIEW_PORT: each open page holds one port to the background; it subscribes to its surface and
//     receives every new view (model.ts SurfaceView). An open port is how the background knows the
//     panel is open (the 5-second cadence, the 2-second sign-in watch); the page sends "tick" every
//     2 s while it is open, which also keeps the service worker awake.
//   - { type: 'action' }: every button and automatic step (model.ts Action), answered with its result.
//   - the page script in the grid's terminal tab (AM2): "terminal.watch", "terminal.type" from the
//     background, "terminal.shell-up" back. The page script reads the page title only and types the
//     one login-setup line only (contract.ts isLoginSetupLine).
//   - CONNECT_PORT: the connect sitting in tab mode, hosted by the page script; parsed events only.
//
// 12.0.0 adds no message of its own: the direct way's presses are model.ts Actions (grid-signin-account,
// grid-signin-answer and the rest), and its moments arrive on VIEW_PORT like any other. An answer to the
// grid's prompt travels in one { type: 'action' } message from the page to the background and is held in
// memory only until the request it belongs to is sent; it is never stored or logged. The passkey steps
// (WebAuthn needs a page) run in the page itself (ext/direct.ts) and the page then sends protect-key or
// unlock-key with the outcome only. The bundled helper is reached with runtime.connectNative from the
// background (core/bridge.ts), never through a page.
import type { ConnectEvent, ConnectOptions } from './contract';
import type { Action, ActionKind, ResultOf, Surface, SurfaceView, TerminalInput } from './model';
import type { PortalOp } from './portal';

/** the port name the panel connects to the portal page script with for the login terminal (10.0.0) */
export const LOGIN_PORT = 'beethoven-login';

/** 11.0.0: the port each open page (panel, welcome, settings) holds to the background */
export const VIEW_PORT = 'beethoven-view';

/** 11.0.0: the port the background (or, as a fallback, the panel) opens to the page script in tab mode for one connect sitting */
export const CONNECT_PORT = 'beethoven-connect';

/** how often an open page sends "tick" on VIEW_PORT */
export const TICK_MS = 2_000;

/** how often a frame "{}" goes to the portal's shell while a connect sitting is open (keeps the service worker's 30 s window open; the portal ignores it) */
export const SHELL_KEEPALIVE_MS = 20_000;

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
  /** the background pushing a new run state to open pages (10.0.0; 11.0.0 pages listen on VIEW_PORT, the welcome page's hand-off mirror may listen to either) */
  | { type: 'run.changed' }
  // ---- 11.0.0 ----
  /** a page asking for its view once (VIEW_PORT pushes the rest) */
  | { type: 'view.get'; surface: Surface }
  /** a button or an automatic step: model.ts Action; answered with Answer<ResultOf<kind>> */
  | { type: 'action'; action: Action }
  /** the panel on load: triggers the access re-check LICENSE 3(a) ties to opening the panel after a day or after a no, and the live grid check */
  | { type: 'panel.opened'; windowId?: number }
  /** background -> the page script in the grid's terminal tab (AM2): start watching the page title for the shell's own title, user part `account` */
  | { type: 'terminal.watch'; account: string }
  /** background -> that page script: type this one line (it must pass contract.ts isLoginSetupLine), then Enter */
  | { type: 'terminal.type'; line: string }
  /** that page script -> background, once: the title says the shell is up ("st1234@warrior:~"); carries no title text */
  | { type: 'terminal.shell-up' };

/** what "terminal.type" answers */
export interface TerminalTyped {
  typed: boolean;
  how: TerminalInput;
  /** when not typed: "unsupported" (no xterm.js helper textarea), "refused" (the line failed isLoginSetupLine), "hidden" (the tab is not visible) */
  why?: 'unsupported' | 'refused' | 'hidden';
}

/** frames on VIEW_PORT, page -> background */
export type ViewIn = { type: 'subscribe'; surface: Surface; windowId?: number } | { type: 'tick' };

/** frames on VIEW_PORT, background -> page */
export type ViewOut = { type: 'view'; view: SurfaceView };

/** an action's answer, typed by its kind */
export type ActionAnswer<K extends ActionKind> = Answer<ResultOf<K>>;

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

/**
 * frames on CONNECT_PORT, opener -> page script. The first frame is "connect": the page script builds
 * the line itself with contract.ts commands.connect from the site profile's shared copy and these
 * options (it never runs a line it did not build; commands.connect refuses any value that fails its
 * check, the shared folder included). `sharedDir` is the bundled site profile's shared_install, which
 * the background read (a page script cannot read the package's files). "input" is the pasted code,
 * typed once.
 */
export type ConnectIn = { type: 'connect'; options: ConnectOptions; sharedDir: string } | { type: 'input'; text: string } | { type: 'close' };

/** frames on CONNECT_PORT, page script -> opener: parsed events only, never the terminal's text */
export type ConnectOut =
  | { type: 'open' }
  | { type: 'event'; event: ConnectEvent }
  /** the shell asked for a password before the line was typed: nothing was typed (AM2's key step follows) */
  | { type: 'password' }
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
