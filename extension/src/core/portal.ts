// The portal client: every Open OnDemand endpoint the extension uses, in one place, over an
// injected network layer, through the audit chokepoint.
//
// 11.0.0: it runs in the background (the service worker) with credentials "include": the browser
// attaches the grid sign-in it holds (the HTTP sign-in it keeps after the student typed into its own
// box, or a cookie) to the background's own requests until it closes. Reads (the dashboard, Files
// listings and downloads) and the shell go from there with no portal tab. Every write moves to the
// shell (`hpcworker connect --consent`, `worker stop`, `worker restrict`): the dashboard's Rails origin
// check would refuse a Files PUT carrying Origin chrome-extension://. writeFile, mkdir, touch and
// cancelJob remain for tab mode only, where the client runs in a page script on the portal origin
// (credentials "same-origin", the page's own Origin). session() tells three facts apart and never
// says "Failed to fetch": signed in (200, the dashboard, a form token), signed out (401, or a redirect
// off the portal or off the dashboard), and unreachable (a network error or no answer within 5 s).
//
// Endpoints (from the research report's table; all relative to the portal origin):
//   GET  /pun/sys/dashboard/                              session check and PUN warm-up
//   GET  /pun/sys/dashboard/files/fs/<abs>  Accept: json  directory listing
//   GET  /pun/sys/dashboard/files/fs/<abs>?download=1     file body
//   PUT  /pun/sys/dashboard/files/fs/<abs>[?dir=true|?touch=true]  write a file / make a directory / touch (CSRF)
//   GET  /pun/sys/dashboard/activejobs.json?jobcluster=all&jobfilter=user
//   DELETE /pun/sys/dashboard/activejobs?cluster=&pbsid=  cancel (CSRF)
//   GET  /pun/sys/shell/ssh/<host> + wss ...?csrf=        one command line (shell.ts)
//   GET  /rnode/<host>/1/                                 reverse-proxy probe (404 vs 503)
//   GET  /pun/sys/myjobs/workflows.json, /pun/sys/dashboard/projects   optional routes, recorded only
// /logout, /nginx/stop are recognised in redirects and never called.
import { Audit, classifyCommand, type EndpointClass } from './audit';
import { splitPath } from './contract';
import type { PortalNet } from './net';
import { openShell, runShellCommand, testShell, type ShellResult, type ShellSession, type ShellTestResult } from './shell';

export const DASHBOARD = '/pun/sys/dashboard/';
export const FILES = '/pun/sys/dashboard/files/fs';
export const ACTIVE_JOBS = '/pun/sys/dashboard/activejobs.json?jobcluster=all&jobfilter=user';
export const ACTIVE_JOBS_DELETE = '/pun/sys/dashboard/activejobs';
export const WORKFLOWS_JSON = '/pun/sys/myjobs/workflows.json';
export const PROJECTS = '/pun/sys/dashboard/projects';

/**
 * What one dashboard GET says about the grid sign-in:
 *   signed-in    200 on the dashboard with its form token
 *   signed-out   401 or 403, or a redirect to another origin or off the dashboard (a sign-in page)
 *   unreachable  a network error, or no answer within the timeout (GlobalProtect off)
 *   not-ood      200 on the dashboard path with no form token: not an Open OnDemand portal, as far as can be told
 *   cold         5xx or the /nginx/init bounce: the per-user server is starting (signed in; try again)
 */
export type SessionState = 'signed-in' | 'signed-out' | 'unreachable' | 'not-ood' | 'cold';

export interface SessionInfo {
  ok: boolean;
  state: SessionState;
  status: number;
  /** where the request ended after redirects */
  finalUrl: string;
  /** signed in and looking at the dashboard */
  signedIn: boolean;
  /** the page says OnDemand somewhere */
  isOnDemand: boolean;
  csrf?: string;
  /** the account name this dashboard page shows ("Logged in as ..."), and nothing else: the one identity the access check uses */
  username?: string;
  checkedAt: string;
  detail: string;
}

export interface DirEntry {
  id: string;
  type: 'd' | 'f' | string;
  name: string;
  size: number;
  modified_at: number;
  owner: string;
  mode: number;
  download_url?: string;
}

export interface DirListing {
  path: string;
  url?: string;
  shell_url?: string;
  /** present only when uploads are enabled at the site */
  files_upload_path?: string;
  files: DirEntry[];
  /** 11.0.0: the portal server's own clock, its response's Date header (not from the listing's JSON); facts.ts compares the grid's times with the grid's clock through it */
  serverDate?: string;
}

export interface ActiveJob {
  cluster: string;
  cluster_title?: string;
  status: string;
  pbsid: string;
  jobname: string;
  queue?: string;
  walltime_used?: string;
  nodes?: string[];
  delete_path?: string;
}

export interface ActiveJobs {
  jobs: ActiveJob[];
  clusters: string[];
  errors: string[];
}

export interface RouteProbe {
  workflows_json: number;
  projects: number;
}

export type RnodeState = 'enabled' | 'disabled' | 'unknown';

/** what the warm-up found: the per-user nginx (the PUN) answers 5xx or bounces through /nginx/init while it starts */
export interface WarmResult {
  /** the dashboard answered 200 in the end */
  ok: boolean;
  /** how many dashboard GETs it took */
  attempts: number;
  status: number;
  signedIn: boolean;
  detail: string;
  session: SessionInfo;
}

/** the operations the side panel may ask the content script to run, by name */
export interface PortalApi {
  session(): Promise<SessionInfo>;
  /** wake the PUN: GET the dashboard, and on 5xx or /nginx/init wait 2, 5, 10 s and try again */
  warm(): Promise<WarmResult>;
  whoAmI(): Promise<string | undefined>;
  home(): Promise<string>;
  listDir(path: string): Promise<DirListing>;
  /** the entry from the directory's JSON listing, or undefined when the name is not in files[] */
  stat(path: string): Promise<DirEntry | undefined>;
  /** existence from the listing, never from a download (a missing file downloads as an HTML page with status 200) */
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  readFileIfExists(path: string): Promise<string | undefined>;
  writeFile(path: string, body: string, job?: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  /** create an empty file or update its time: how the framework's stop file is written */
  touch(path: string, job?: string): Promise<void>;
  activeJobs(): Promise<ActiveJobs>;
  cancelJob(cluster: string, pbsid: string): Promise<void>;
  shell(command: string, opts?: { timeoutMs?: number; job?: string }): Promise<ShellResult>;
  /** one shell opened and closed: a prompt with no password asked ("ok"), a password prompt, or no word in time (the channel test and AM2's re-test) */
  shellTest(): Promise<ShellTestResult>;
  probeRnode(host: string): Promise<{ state: RnodeState; status: number; detail: string }>;
  probeRoutes(): Promise<RouteProbe>;
  auditWait(cls: EndpointClass): Promise<number>;
  auditRecords(): Promise<unknown[]>;
  auditExport(): Promise<string>;
  auditClear(): Promise<void>;
}

export type PortalOp = keyof PortalApi;
export const PORTAL_OPS: PortalOp[] = ['session', 'warm', 'whoAmI', 'home', 'listDir', 'stat', 'exists', 'readFile', 'readFileIfExists', 'writeFile', 'mkdir', 'touch', 'activeJobs', 'cancelJob', 'shell', 'shellTest', 'probeRnode', 'probeRoutes', 'auditWait', 'auditRecords', 'auditExport', 'auditClear'];

/** how long the dashboard GET waits before the grid counts as unreachable */
export const SESSION_TIMEOUT_MS = 5_000;

/** the sentence for a grid that does not answer; never "Failed to fetch" */
export function unreachableWords(vpnApp?: string): string {
  return `Can't reach the grid. Is ${vpnApp || 'your VPN'} on?`;
}

/** the backoff between warm-up attempts: the portal's own error page says "try again in 30 seconds" */
export const WARM_DELAYS_MS = [2_000, 5_000, 10_000];

export class PortalError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'PortalError';
  }
}

export interface PortalClientOpts {
  /** the Shell app host segment; "default" lets the portal choose */
  shellHost?: string;
  /** the warm-up backoff; tests shorten it */
  warmDelaysMs?: number[];
  /** how the client waits between warm-up attempts */
  sleep?: (ms: number) => Promise<void>;
  /**
   * The credentials mode of every request: "same-origin" (the default) for a page script on the
   * portal origin, "include" for the background, whose requests are cross-origin to the portal and
   * carry the grid sign-in only with "include".
   */
  credentials?: RequestCredentials;
  /** the dashboard GET's budget before the grid counts as unreachable (5 s) */
  sessionTimeoutMs?: number;
  /** the VPN app's name in the unreachable sentence (the site profile's vpn_app) */
  vpnApp?: string;
  /** where the shell runs from, for the audit record: "extension" (the background) or "page" (a page script) */
  via?: 'extension' | 'page';
}

/** a cold PUN: the dashboard answered 5xx, or the request ended on the /nginx/init bounce */
export function looksCold(s: { status: number; finalUrl: string }): boolean {
  return s.status >= 500 || /\/nginx\/init/.test(s.finalUrl);
}

const encodePath = (abs: string) =>
  abs
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');

export class PortalClient implements PortalApi {
  private csrf: string | undefined;
  /** the name the dashboard showed for the signed-in session: an identity */
  private dashboardUser: string | undefined;
  /** the home directory's owner, when the dashboard shows no name: for paths only, never an identity */
  private pathUser: string | undefined;
  private homeDir: string | undefined;
  /** the PUN answered the dashboard with 200 since this client was made (or since it last saw a 5xx) */
  private warmed = false;
  private warming: Promise<WarmResult> | undefined;
  readonly shellHost: string;
  private readonly warmDelays: number[];
  private readonly sleep: (ms: number) => Promise<void>;
  readonly credentials: RequestCredentials;
  private readonly sessionTimeoutMs: number;
  private readonly vpnApp: string | undefined;
  private readonly via: 'extension' | 'page';

  constructor(
    readonly origin: string,
    private readonly net: PortalNet,
    private readonly audit: Audit,
    opts: PortalClientOpts = {},
  ) {
    this.shellHost = opts.shellHost || 'default';
    this.warmDelays = opts.warmDelaysMs ?? WARM_DELAYS_MS;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.credentials = opts.credentials ?? 'same-origin';
    this.sessionTimeoutMs = opts.sessionTimeoutMs ?? SESSION_TIMEOUT_MS;
    this.vpnApp = opts.vpnApp;
    this.via = opts.via ?? (this.credentials === 'include' ? 'extension' : 'page');
  }

  private url(path: string): string {
    return `${this.origin}${path}`;
  }

  /**
   * Wake the per-user nginx before anything that would lose its body or its answer to a cold PUN:
   * the first portal page after a while answers "Server Error ... try again in 30 seconds" (a 500)
   * or bounces through /nginx/init, and a PUT that meets the bounce loses its body. One dashboard
   * GET; on a cold answer wait 2 s, 5 s, 10 s and try again; then give up and say so.
   */
  async warm(): Promise<WarmResult> {
    if (this.warming) return this.warming;
    this.warming = (async () => {
      let attempts = 0;
      let s = await this.session();
      attempts++;
      for (const delay of this.warmDelays) {
        if (!looksCold(s) || s.status === 0) break;
        await this.sleep(delay);
        s = await this.session();
        attempts++;
      }
      const cold = looksCold(s);
      this.warmed = !cold && s.status > 0;
      const detail = cold ? `your portal did not wake up after ${attempts} tries (it answered ${s.status || 'nothing'}); wait a moment and try again` : s.status === 0 ? s.detail : s.signedIn ? (attempts > 1 ? `your portal woke up after ${attempts} tries` : 'your portal is awake') : s.detail;
      return { ok: !cold && s.status > 0 && s.ok, attempts, status: s.status, signedIn: s.signedIn, detail, session: s };
    })();
    try {
      return await this.warming;
    } finally {
      this.warming = undefined;
    }
  }

  /** every Files, Shell and Jobs call goes through here once per client (and again after a 5xx) */
  private async ensureWarm(): Promise<void> {
    if (this.warmed) return;
    await this.warm();
  }

  /** a read-only call, retried once after a fresh warm-up when the PUN answered 5xx */
  private async warmRead<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureWarm();
    try {
      return await fn();
    } catch (e) {
      if (e instanceof PortalError && e.status !== undefined && e.status >= 500) {
        this.warmed = false;
        await this.ensureWarm();
        return await fn();
      }
      throw e;
    }
  }

  /** One dashboard GET tells us four things: reachable, signed in, the CSRF token, the username. */
  async session(): Promise<SessionInfo> {
    const checkedAt = new Date().toISOString();
    return this.audit.request({ method: 'GET', endpoint: DASHBOARD, cls: 'dashboard' }, async () => {
      let res: Response;
      let html: string;
      const unreachable = (why: string) => {
        const info: SessionInfo = { ok: false, state: 'unreachable', status: 0, finalUrl: '', signedIn: false, isOnDemand: false, checkedAt, detail: unreachableWords(this.vpnApp) };
        return { result: info, bytes: 0, outcome: `unreachable (${why})` };
      };
      const ctl = typeof AbortController === 'function' ? new AbortController() : undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, rej) => {
          timer = setTimeout(() => {
            ctl?.abort();
            rej(new Error(`no answer within ${Math.round(this.sessionTimeoutMs / 1000)} s`));
          }, this.sessionTimeoutMs);
        });
        res = await Promise.race([this.net.fetch(this.url(DASHBOARD), { credentials: this.credentials, redirect: 'follow', headers: { Accept: 'text/html' }, cache: 'no-store', ...(ctl ? { signal: ctl.signal } : {}) }), timeout]);
        html = await Promise.race([res.text(), timeout]);
      } catch (e) {
        return unreachable((e as Error)?.name === 'AbortError' ? 'timed out' : 'network error');
      } finally {
        if (timer) clearTimeout(timer);
      }
      const finalUrl = res.url || this.url(DASHBOARD);
      let final: URL | undefined;
      try {
        final = new URL(finalUrl);
      } catch {
        /* keep undefined */
      }
      const sameOrigin = final?.origin === this.origin;
      const onDashboard = sameOrigin && (final?.pathname.startsWith('/pun/sys/dashboard') ?? false);
      const isOnDemand = /OnDemand/i.test(html);
      const csrf = /<meta\s+name="csrf-token"\s+content="([^"]+)"/i.exec(html)?.[1] ?? /<meta\s+content="([^"]+)"\s+name="csrf-token"/i.exec(html)?.[1];
      const user = /Logged in as\s+<[^>]*>?\s*([A-Za-z0-9._@-]+)/i.exec(html)?.[1] ?? /Logged in as\s+([A-Za-z0-9._@-]+)/i.exec(html)?.[1];
      const signedIn = res.ok && onDashboard && !!csrf;
      if (signedIn) {
        this.csrf = csrf;
        // the page as it is now: a dashboard that stops showing a name stops being an identity
        this.dashboardUser = user;
      } else {
        // a sign-in that is gone takes its token with it
        this.csrf = undefined;
      }
      let state: SessionState = 'signed-in';
      let detail = 'signed in to the portal';
      if (res.status >= 500 || (sameOrigin && final?.pathname.startsWith('/nginx/init'))) {
        state = 'cold';
        detail = 'the portal is starting your session; try again in a few seconds';
      } else if (!res.ok) {
        state = 'signed-out';
        detail = `the portal answered ${res.status}; sign in to it again`;
      } else if (!sameOrigin) {
        state = 'signed-out';
        detail = `the portal sent you to ${final?.hostname ?? 'another site'} to sign in; sign in there, then try again`;
      } else if (!onDashboard) {
        state = 'signed-out';
        detail = 'the portal did not show its dashboard; sign in to it again';
      } else if (!csrf) {
        state = 'not-ood';
        detail = 'the dashboard page carries no form token; this may not be an Open OnDemand portal';
      }
      const info: SessionInfo = { ok: res.ok, state, status: res.status, finalUrl, signedIn, isOnDemand, csrf: signedIn ? csrf : undefined, username: signedIn ? this.dashboardUser : undefined, checkedAt, detail };
      return { result: info, bytes: html.length, outcome: signedIn ? `${res.status} signed in` : `${res.status} ${detail}` };
    });
  }

  private async token(): Promise<string> {
    if (!this.csrf) await this.session();
    if (!this.csrf) throw new PortalError('not signed in to the portal (no form token); sign in to it in a tab and try again', 401);
    return this.csrf;
  }

  /**
   * The portal username for paths: from the dashboard page, else the owner of the home directory.
   * Only the dashboard's own name (SessionInfo.username) is an identity; the fallback names a
   * directory and is used for the state directory alone, never for the access check.
   */
  async whoAmI(): Promise<string | undefined> {
    if (this.dashboardUser) return this.dashboardUser;
    await this.session();
    if (this.dashboardUser) return this.dashboardUser;
    if (this.pathUser) return this.pathUser;
    try {
      const home = await this.home();
      const listing = await this.listDir(home);
      const owner = listing.files.find((f) => f.name === '.' || f.owner)?.owner;
      // kept apart from the dashboard's name, so session() never reports a directory owner as who is signed in
      this.pathUser = owner || home.split('/').filter(Boolean).pop();
    } catch {
      /* stays unknown; the home directory's last segment stands in for paths */
    }
    return this.pathUser;
  }

  /** the home directory: /pun/sys/dashboard/files redirects to files/fs<home> */
  async home(): Promise<string> {
    if (this.homeDir) return this.homeDir;
    return this.warmRead(() => this.homeOnce());
  }

  private async homeOnce(): Promise<string> {
    return this.audit.request({ method: 'GET', endpoint: '/pun/sys/dashboard/files', cls: 'files' }, async () => {
      const res = await this.net.fetch(this.url('/pun/sys/dashboard/files'), { credentials: this.credentials, redirect: 'follow', headers: { Accept: 'application/json' } });
      const finalPath = decodeURIComponent(new URL(res.url || this.url('/pun/sys/dashboard/files')).pathname);
      const idx = finalPath.indexOf('/files/fs');
      let home = idx >= 0 ? finalPath.slice(idx + '/files/fs'.length) : '';
      if (!home && res.ok) {
        try {
          home = String(((await res.json()) as { path?: string }).path ?? '');
        } catch {
          /* not JSON */
        }
      }
      if (!home) throw new PortalError(`could not find your home directory (the Files app answered ${res.status})`, res.status);
      this.homeDir = home.replace(/\/+$/, '') || '/';
      return { result: this.homeDir, bytes: 0, outcome: `${res.status} home found` };
    });
  }

  async listDir(path: string): Promise<DirListing> {
    return this.warmRead(() => this.listDirOnce(path));
  }

  private async listDirOnce(path: string): Promise<DirListing> {
    const endpoint = `${FILES}${encodePath(path)}`;
    return this.audit.request({ method: 'GET', endpoint, cls: 'files' }, async () => {
      const res = await this.net.fetch(this.url(endpoint), { credentials: this.credentials, headers: { Accept: 'application/json' }, cache: 'no-store' });
      const text = await res.text();
      if (!res.ok) throw new PortalError(res.status === 404 ? 'the Files app is disabled at your site, or the folder does not exist' : `the Files app answered ${res.status} for ${path}`, res.status);
      let j: DirListing;
      try {
        j = JSON.parse(text) as DirListing;
      } catch {
        throw new PortalError('the Files app answered with a page instead of a listing; sign in to the portal in a tab', res.status);
      }
      if (!Array.isArray(j.files)) throw new PortalError('the Files app listing has no files[]', res.status);
      let serverDate: string | undefined;
      try {
        serverDate = res.headers?.get?.('date') ?? undefined;
      } catch {
        serverDate = undefined;
      }
      return { result: { ...j, ...(serverDate ? { serverDate } : {}) }, bytes: text.length, outcome: `${res.status} ${j.files.length} entries` };
    });
  }

  /**
   * Existence comes from the parent's JSON listing. A 404 for the parent means "not there"; any
   * other failure is thrown, so a caller can say "could not be checked" rather than "absent".
   */
  async stat(path: string): Promise<DirEntry | undefined> {
    const { dir, name } = splitPath(path);
    if (!name) return undefined;
    let listing: DirListing;
    try {
      listing = await this.listDir(dir);
    } catch (e) {
      if (e instanceof PortalError && e.status === 404) return undefined;
      throw e;
    }
    return listing.files.find((f) => f.name === name);
  }

  async exists(path: string): Promise<boolean> {
    return (await this.stat(path)) !== undefined;
  }

  async readFile(path: string): Promise<string> {
    return this.warmRead(() => this.readFileOnce(path));
  }

  private async readFileOnce(path: string): Promise<string> {
    const endpoint = `${FILES}${encodePath(path)}?download=1`;
    return this.audit.request({ method: 'GET', endpoint, cls: 'files' }, async () => {
      const res = await this.net.fetch(this.url(endpoint), { credentials: this.credentials, cache: 'no-store' });
      const text = await res.text();
      if (!res.ok) throw new PortalError(`could not read ${path} (${res.status})`, res.status);
      // the Files app answers a download of a missing file with 200 and its own HTML page: not a file
      const type = res.headers.get('content-type') ?? '';
      if (/text\/html/i.test(type)) throw new PortalError(`${path} is not a file there (the Files app answered with a page)`, 404);
      return { result: text, bytes: text.length, outcome: `${res.status}` };
    });
  }

  /**
   * The file's text, or undefined only when it is not there: a 404, or the Files app's own page in
   * place of a body (readFileOnce maps that to 404). Anything else (a 500 that survived the one
   * re-warm, a 403) is thrown, so a caller says "could not be checked" rather than "absent" and
   * never submits a job on the strength of a missing file that was only unreadable.
   */
  async readFileIfExists(path: string): Promise<string | undefined> {
    try {
      return await this.readFile(path);
    } catch (e) {
      if (e instanceof PortalError && e.status === 404) return undefined;
      throw e;
    }
  }

  /** PUT writes the body as the file's content; the Rails Origin check is why this must run on the portal origin. */
  async writeFile(path: string, body: string, job?: string): Promise<void> {
    const endpoint = `${FILES}${encodePath(path)}`;
    await this.ensureWarm();
    const csrf = await this.token();
    await this.audit.request({ method: 'PUT', endpoint, cls: 'files', mutates: true, ...(job ? { job } : {}) }, async () => {
      const res = await this.net.fetch(this.url(endpoint), { method: 'PUT', credentials: this.credentials, headers: { 'X-CSRF-Token': csrf, Accept: 'application/json', 'Content-Type': 'application/octet-stream' }, body });
      const text = await res.text();
      if (res.status === 422) {
        this.csrf = undefined;
        throw new PortalError('the portal rejected the write (stale form token); try again', 422);
      }
      if (res.status === 403) throw new PortalError(`the portal does not allow writing ${path} (allowlist or permissions)`, 403);
      if (!res.ok) throw new PortalError(`writing ${path} failed (${res.status})`, res.status);
      return { result: undefined, bytes: body.length + text.length, outcome: `${res.status} ${body.length} bytes` };
    });
  }

  async mkdir(path: string): Promise<void> {
    const endpoint = `${FILES}${encodePath(path)}?dir=true`;
    await this.ensureWarm();
    const csrf = await this.token();
    await this.audit.request({ method: 'PUT', endpoint, cls: 'files', mutates: true }, async () => {
      const res = await this.net.fetch(this.url(endpoint), { method: 'PUT', credentials: this.credentials, headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' } });
      const text = await res.text();
      // an existing directory answers 500 with an error_message; that is success for our purposes
      if (res.status === 422) {
        this.csrf = undefined;
        throw new PortalError('the portal rejected the request (stale form token); try again', 422);
      }
      if (!res.ok && !/exist/i.test(text)) throw new PortalError(`creating ${path} failed (${res.status})`, res.status);
      return { result: undefined, bytes: text.length, outcome: `${res.status}` };
    });
  }

  /** `?touch=true` creates an empty file (or updates its time); a Files write, so no scheduler floor applies */
  async touch(path: string, job?: string): Promise<void> {
    const endpoint = `${FILES}${encodePath(path)}?touch=true`;
    await this.ensureWarm();
    const csrf = await this.token();
    await this.audit.request({ method: 'PUT', endpoint, cls: 'files', mutates: true, ...(job ? { job } : {}) }, async () => {
      const res = await this.net.fetch(this.url(endpoint), { method: 'PUT', credentials: this.credentials, headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' } });
      const text = await res.text();
      if (res.status === 422) {
        this.csrf = undefined;
        throw new PortalError('the portal rejected the request (stale form token); try again', 422);
      }
      if (res.status === 403) throw new PortalError(`the portal does not allow writing ${path} (allowlist or permissions)`, 403);
      if (!res.ok) throw new PortalError(`touching ${path} failed (${res.status})`, res.status);
      return { result: undefined, bytes: text.length, outcome: `${res.status} touched` };
    });
  }

  /** `data` is an array of arrays (one per 3,000-job slice); flattened here. The portal runs squeue for this: once a minute. */
  async activeJobs(): Promise<ActiveJobs> {
    await this.ensureWarm();
    return this.audit.request({ method: 'GET', endpoint: ACTIVE_JOBS, cls: 'jobs' }, async () => {
      const res = await this.net.fetch(this.url(ACTIVE_JOBS), { credentials: this.credentials, headers: { Accept: 'application/json' }, cache: 'no-store' });
      const text = await res.text();
      if (!res.ok) throw new PortalError(`Active Jobs answered ${res.status}`, res.status);
      let j: { data?: unknown; errors?: unknown };
      try {
        j = JSON.parse(text);
      } catch {
        throw new PortalError('Active Jobs answered with a page instead of JSON; sign in to the portal in a tab', res.status);
      }
      const slices = Array.isArray(j.data) ? j.data : [];
      const jobs: ActiveJob[] = [];
      for (const s of slices) if (Array.isArray(s)) for (const x of s) if (x && typeof x === 'object') jobs.push(x as ActiveJob);
      const clusters = [...new Set(jobs.map((x) => String(x.cluster)))];
      const errors = Array.isArray(j.errors) ? j.errors.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))) : [];
      return { result: { jobs, clusters, errors }, bytes: text.length, outcome: `${res.status} ${jobs.length} jobs` };
    });
  }

  async cancelJob(cluster: string, pbsid: string): Promise<void> {
    const endpoint = `${ACTIVE_JOBS_DELETE}?cluster=${encodeURIComponent(cluster)}&pbsid=${encodeURIComponent(pbsid)}`;
    await this.ensureWarm();
    const csrf = await this.token();
    await this.audit.request({ method: 'DELETE', endpoint, cls: 'jobs', mutates: true, job: pbsid }, async () => {
      // The dashboard answers a cancel with a 302 to the Active Jobs page. A browser that follows a
      // 302 re-sends the DELETE (only a POST is turned into a GET), which would loop; so the redirect
      // itself is read as the success it signals and never followed.
      const res = await this.net.fetch(this.url(endpoint), { method: 'DELETE', credentials: this.credentials, redirect: 'manual', headers: { 'X-CSRF-Token': csrf, Accept: 'text/html' } });
      const text = await res.text().catch(() => '');
      const redirected = res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400);
      if (res.status === 422) {
        this.csrf = undefined;
        throw new PortalError('the portal rejected the cancel (stale form token); try again', 422);
      }
      if (!redirected && !res.ok) throw new PortalError(`cancelling job ${pbsid} failed (${res.status})`, res.status);
      return { result: undefined, bytes: text.length, outcome: `${redirected ? 'redirect' : res.status} cancelled` };
    });
  }

  /** one command line through the bootstrap shell; its floor class follows what the line costs (audit.ts classifyCommand) */
  async shell(command: string, opts: { timeoutMs?: number; job?: string } = {}): Promise<ShellResult> {
    const cls: EndpointClass = classifyCommand(command);
    const endpoint = `/pun/sys/shell/ssh/${this.shellHost}`;
    await this.ensureWarm();
    return this.audit.request({ method: 'WS', endpoint, cls, mutates: true, via: this.via, ...(opts.job ? { job: opts.job } : {}) }, async () => {
      const r = await runShellCommand({ origin: this.origin, host: this.shellHost, command, net: this.net, credentials: this.credentials, timeoutMs: opts.timeoutMs });
      return { result: r, bytes: r.transcript.length + command.length, outcome: `exit ${r.exitCode} in ${r.ms} ms` };
    });
  }

  /** one shell opened, its first words read and closed: no line is typed but `exit` after a prompt */
  async shellTest(): Promise<ShellTestResult> {
    const endpoint = `/pun/sys/shell/ssh/${this.shellHost}`;
    return this.audit.request({ method: 'WS', endpoint, cls: 'shelltest', via: this.via }, async () => {
      const r = await testShell({ origin: this.origin, host: this.shellHost, net: this.net, credentials: this.credentials });
      return { result: r, bytes: 0, outcome: `shell test: ${r}` };
    });
  }

  /**
   * The interactive sitting: the shell running exactly `command` (11.0.0: `exec bash <tool> connect
   * …`), output relayed to `onOutput`, typed text sent back with `send`. It is not in PortalApi
   * because it is not a request with an answer: the background hosts it itself in direct mode, and the
   * page script hosts it behind a port in tab mode. The audit record is one WS line for the whole
   * sitting with the byte counts of what was read and what was typed: the typed text (the code the
   * student pastes) is counted and never kept anywhere. It submits a job and runs `srun`, so it is a
   * scheduler call: once a minute, like a start or a probe.
   */
  openLoginShell(command: string, onOutput: (text: string) => void, opts: { maxMs?: number } = {}): Promise<ShellSession> {
    const endpoint = `/pun/sys/shell/ssh/${this.shellHost}`;
    let resolveSession!: (s: ShellSession) => void;
    let rejectSession!: (e: unknown) => void;
    const session = new Promise<ShellSession>((res, rej) => {
      resolveSession = res;
      rejectSession = rej;
    });
    const recorded = (async () => {
      await this.ensureWarm();
      return this.audit.request({ method: 'WS', endpoint, cls: classifyCommand(command), mutates: true, via: this.via }, async () => {
        let s: ShellSession;
        try {
          s = await openShell({ origin: this.origin, host: this.shellHost, command, net: this.net, credentials: this.credentials, onOutput, maxMs: opts.maxMs });
        } catch (e) {
          rejectSession(e);
          throw e;
        }
        resolveSession(s);
        const end = await s.done;
        return { result: end, bytes: end.outputBytes + end.inputBytes, outcome: `login terminal: ${end.reason}${end.closeCode !== undefined ? ` (close ${end.closeCode})` : ''}, ${end.outputBytes} bytes read, ${end.inputBytes} bytes typed, ${Math.round(end.ms / 1000)} s` };
      });
    })();
    // a floor refusal or a revocation lands here before the shell was ever opened
    recorded.catch((e) => rejectSession(e));
    return session;
  }

  /** 404 = proxy off or host_regex mismatch; 503 "Failed to connect" = proxy on, nothing listening on port 1 (as expected) */
  async probeRnode(host: string): Promise<{ state: RnodeState; status: number; detail: string }> {
    const endpoint = `/rnode/${encodeURIComponent(host)}/1/`;
    return this.audit.request({ method: 'GET', endpoint, cls: 'probe' }, async () => {
      const res = await this.net.fetch(this.url(endpoint), { credentials: this.credentials, redirect: 'manual', cache: 'no-store' });
      const text = await res.text().catch(() => '');
      let state: RnodeState = 'unknown';
      let detail = `answered ${res.status}`;
      if (res.status === 503 && /Failed to connect/i.test(text)) {
        state = 'enabled';
        detail = 'the reverse proxy is on (fast path possible)';
      } else if (res.status === 404) {
        state = 'disabled';
        detail = 'the reverse proxy is off or does not admit this host (mailbox mode)';
      }
      return { result: { state, status: res.status, detail }, bytes: text.length, outcome: `${res.status} ${state}` };
    });
  }

  async probeRoutes(): Promise<RouteProbe> {
    const one = async (path: string) =>
      this.audit.request({ method: 'GET', endpoint: path, cls: 'probe' }, async () => {
        const res = await this.net.fetch(this.url(path), { credentials: this.credentials, redirect: 'manual', headers: { Accept: 'application/json' }, cache: 'no-store' });
        await res.text().catch(() => '');
        return { result: res.status, bytes: 0, outcome: `${res.status}` };
      });
    return { workflows_json: await one(WORKFLOWS_JSON), projects: await one(PROJECTS) };
  }

  auditWait(cls: EndpointClass): Promise<number> {
    return this.audit.waitFor(cls);
  }
  auditRecords(): Promise<unknown[]> {
    return this.audit.records();
  }
  auditExport(): Promise<string> {
    return this.audit.exportText();
  }
  auditClear(): Promise<void> {
    return this.audit.clear();
  }
}
