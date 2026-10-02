// How Beethoven reaches the portal (11.0.0, the spec's "The portal tab, and the ssh-key idea").
//
// "direct": the browser attaches the grid sign-in it holds to the extension's own background
// requests, the shell's WebSocket included, so no portal tab is needed. That is the case for a portal
// that signs in with the browser's own HTTP box (Wayne State, AM1: the dashboard answers 401 with
// WWW-Authenticate: Basic), and for a cookie with SameSite=None.
//
// "tab": the background's GETs carry the sign-in but its WebSocket does not (a cookie with SameSite=Lax
// or Strict travels on an extension's fetch, never on its WebSocket: channel/cookietest). Reads still
// go from the background; each shell line runs in a page script on the portal, in a tab Beethoven
// opened inactive (or the sign-in tab it kept), and the tab is closed again.
//
// The channel test runs once right after the first grid sign-in: one background GET of the dashboard
// (signed in, with its form token), then one shell WebSocket from the background that must reach the
// login node's first words. Its verdict is stored per origin (keys.ts CHANNEL_KEY), with whether the
// shell asked for a password (AM2's one-time key step follows when a press needs the shell).
import type { PortalApi, PortalOp, SessionInfo } from './portal';
import { DASHBOARD } from './portal';
import { isPasswordError, ShellError, type ShellTestResult } from './shell';

export interface ChannelVerdict {
  mode: 'direct' | 'tab';
  shell: ShellTestResult;
  /** Details only */
  detail: string;
}

/**
 * The channel test. `direct` is the background's own client (credentials "include"). `viaTab`, when
 * given, runs the shell half through a page script, for the tab verdict's shell word. Throws when the
 * dashboard does not answer signed in (the sign-in is the caller's moment, not a channel).
 */
export async function testChannel(direct: Pick<PortalApi, 'session' | 'shellTest'>, viaTab?: () => Promise<ShellTestResult>): Promise<ChannelVerdict & { session: SessionInfo }> {
  const session = await direct.session();
  if (!session.signedIn) throw Object.assign(new Error(session.detail), { name: 'NotSignedIn', state: session.state });
  try {
    const shell = await direct.shellTest();
    return { mode: 'direct', shell, session, detail: `the background's own requests and its shell connection carry the grid sign-in (shell: ${shell})` };
  } catch (e) {
    if (isPasswordError(e)) return { mode: 'direct', shell: 'password', session, detail: 'direct; the shell asked for a password' };
    const err = e as ShellError;
    // the portal refused the shell for a reason of its own (no cluster, origin check, host allowlist): not a sign-in matter
    if (err?.closeCode === 3146) return { mode: 'direct', shell: 'unknown', session, detail: `direct; the portal's shell refused: ${err.closeReason ?? ''}`.trim() };
    // the page GET for the token failed: the sign-in did not travel there either
    if (err?.status === 401 || err?.status === 403) throw Object.assign(new Error('the grid sign-in did not reach the Shell app'), { name: 'NotSignedIn', state: 'signed-out' });
    let shell: ShellTestResult = 'unknown';
    if (viaTab) {
      try {
        shell = await viaTab();
      } catch (t) {
        shell = isPasswordError(t) ? 'password' : 'unknown';
      }
    }
    return { mode: 'tab', shell, session, detail: `the background's shell connection did not carry the grid sign-in (${(err?.message ?? String(e)).slice(0, 120)}); lines run in a portal tab` };
  }
}

/** the browser side of tab mode, injected (ext/tabs.ts implements it; the tests fake it) */
export interface TabHost {
  /** open a URL in a new inactive tab of the window (never focused) and resolve with its id once its load completed */
  openInactive(url: string, windowId?: number): Promise<number>;
  /** tabs.update {autoDiscardable: false} */
  keep(tabId: number): Promise<void>;
  /** load the page script into the tab (scripting.executeScript), only while it is on the portal */
  inject(tabId: number): Promise<void>;
  ping(tabId: number): Promise<boolean>;
  call(tabId: number, op: PortalOp, args: unknown[]): Promise<unknown>;
  /** close the tab, under the guards (only one Beethoven opened, still on the portal, never the window's last) */
  close(tabId: number): Promise<void>;
  /** the tab exists and is still on the portal's origin */
  onPortal(tabId: number): Promise<boolean>;
  sleep(ms: number): Promise<void>;
}

/** a portal client whose every operation is relayed to the page script in one tab */
export function tabPortal(host: TabHost, tabId: number): PortalApi {
  return new Proxy({} as PortalApi, { get: (_t, op: string) => (...args: unknown[]) => host.call(tabId, op as PortalOp, args) });
}

/** the page script answers in the tab, after an injection if it did not already */
export async function readyScript(host: TabHost, tabId: number, tries = 12, gapMs = 250): Promise<boolean> {
  if (await host.ping(tabId).catch(() => false)) return true;
  await host.inject(tabId).catch(() => undefined);
  for (let i = 0; i < tries; i++) {
    await host.sleep(gapMs);
    if (await host.ping(tabId).catch(() => false)) return true;
  }
  return false;
}

/**
 * One action in tab mode: in the sign-in tab Beethoven kept (when it is still on the portal), or in a
 * tab opened inactive for this action and closed after it, whatever the action's outcome. The tab is
 * never focused; the panel says only "Working on the grid…".
 */
export async function withPortalTab<T>(host: TabHost, o: { origin: string; windowId?: number; keptTabId?: number }, fn: (tabId: number, portal: PortalApi) => Promise<T>): Promise<T> {
  if (o.keptTabId !== undefined && (await host.onPortal(o.keptTabId).catch(() => false))) {
    if (!(await readyScript(host, o.keptTabId))) throw new Error('the page script did not answer in the portal tab');
    return fn(o.keptTabId, tabPortal(host, o.keptTabId));
  }
  const tabId = await host.openInactive(`${o.origin}${DASHBOARD}`, o.windowId);
  try {
    await host.keep(tabId).catch(() => undefined);
    if (!(await readyScript(host, tabId))) throw new Error('the page script did not answer in the portal tab');
    return await fn(tabId, tabPortal(host, tabId));
  } finally {
    await host.close(tabId).catch(() => undefined);
  }
}
