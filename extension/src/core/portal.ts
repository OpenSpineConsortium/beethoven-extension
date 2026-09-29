// The portal client: every Open OnDemand endpoint the extension uses, in one place, over an
// injected network layer, through the audit chokepoint. It runs inside the content script on the
// portal origin (the only context whose Origin header passes the dashboard's CSRF check for
// writes and whose cookies are guaranteed on every browser); the side panel reaches it by message.
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
import type { PortalNet } from './net';
import { runShellCommand, type ShellResult } from './shell';

export const DASHBOARD = '/pun/sys/dashboard/';
export const FILES = '/pun/sys/dashboard/files/fs';
export const ACTIVE_JOBS = '/pun/sys/dashboard/activejobs.json?jobcluster=all&jobfilter=user';
export const ACTIVE_JOBS_DELETE = '/pun/sys/dashboard/activejobs';
export const WORKFLOWS_JSON = '/pun/sys/myjobs/workflows.json';
export const PROJECTS = '/pun/sys/dashboard/projects';

export interface SessionInfo {
  ok: boolean;
  status: number;
  /** where the request ended after redirects */
  finalUrl: string;
  /** signed in and looking at the dashboard */
  signedIn: boolean;
  /** the page says OnDemand somewhere */
  isOnDemand: boolean;
  csrf?: string;
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

/** the operations the side panel may ask the content script to run, by name */
export interface PortalApi {
  session(): Promise<SessionInfo>;
  whoAmI(): Promise<string | undefined>;
  home(): Promise<string>;
  listDir(path: string): Promise<DirListing>;
  readFile(path: string): Promise<string>;
  readFileIfExists(path: string): Promise<string | undefined>;
  writeFile(path: string, body: string, job?: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  /** create an empty file or update its time: how the framework's stop file is written */
  touch(path: string, job?: string): Promise<void>;
  activeJobs(): Promise<ActiveJobs>;
  cancelJob(cluster: string, pbsid: string): Promise<void>;
  shell(command: string, opts?: { timeoutMs?: number; job?: string }): Promise<ShellResult>;
  probeRnode(host: string): Promise<{ state: RnodeState; status: number; detail: string }>;
  probeRoutes(): Promise<RouteProbe>;
  auditWait(cls: EndpointClass): Promise<number>;
  auditRecords(): Promise<unknown[]>;
  auditExport(): Promise<string>;
  auditClear(): Promise<void>;
}

export type PortalOp = keyof PortalApi;
export const PORTAL_OPS: PortalOp[] = ['session', 'whoAmI', 'home', 'listDir', 'readFile', 'readFileIfExists', 'writeFile', 'mkdir', 'touch', 'activeJobs', 'cancelJob', 'shell', 'probeRnode', 'probeRoutes', 'auditWait', 'auditRecords', 'auditExport', 'auditClear'];

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
}

const encodePath = (abs: string) =>
  abs
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');

export class PortalClient implements PortalApi {
  private csrf: string | undefined;
  private username: string | undefined;
  private homeDir: string | undefined;
  readonly shellHost: string;

  constructor(
    readonly origin: string,
    private readonly net: PortalNet,
    private readonly audit: Audit,
    opts: PortalClientOpts = {},
  ) {
    this.shellHost = opts.shellHost || 'default';
  }

  private url(path: string): string {
    return `${this.origin}${path}`;
  }

  /** One dashboard GET tells us four things: reachable, signed in, the CSRF token, the username. */
  async session(): Promise<SessionInfo> {
    const checkedAt = new Date().toISOString();
    return this.audit.request({ method: 'GET', endpoint: DASHBOARD, cls: 'dashboard' }, async () => {
      let res: Response;
      try {
        res = await this.net.fetch(this.url(DASHBOARD), { credentials: 'same-origin', redirect: 'follow', headers: { Accept: 'text/html' }, cache: 'no-store' });
      } catch (e) {
        const info: SessionInfo = { ok: false, status: 0, finalUrl: '', signedIn: false, isOnDemand: false, checkedAt, detail: `the portal could not be reached (${(e as Error).message}); connect the VPN and open the portal in a tab` };
        return { result: info, bytes: 0, outcome: 'unreachable' };
      }
      const html = await res.text();
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
        if (user) this.username = user;
      }
      let detail = 'signed in to the portal';
      if (!res.ok) detail = `the portal answered ${res.status}; sign in to it in a tab`;
      else if (!sameOrigin) detail = `the portal sent you to ${final?.hostname ?? 'another site'} to sign in; sign in there in a tab, then try again`;
      else if (final?.pathname.startsWith('/nginx/init')) detail = 'the portal is starting your session; try again in a few seconds';
      else if (!onDashboard) detail = 'the portal did not show its dashboard; sign in to it in a tab';
      else if (!csrf) detail = 'the dashboard page carries no form token; this may not be an Open OnDemand portal';
      const info: SessionInfo = { ok: res.ok, status: res.status, finalUrl, signedIn, isOnDemand, csrf: signedIn ? csrf : undefined, username: this.username, checkedAt, detail };
      return { result: info, bytes: html.length, outcome: signedIn ? `${res.status} signed in` : `${res.status} ${detail}` };
    });
  }

  private async token(): Promise<string> {
    if (!this.csrf) await this.session();
    if (!this.csrf) throw new PortalError('not signed in to the portal (no form token); sign in to it in a tab and try again', 401);
    return this.csrf;
  }

  /** the portal username: from the dashboard page, else the owner of the home directory */
  async whoAmI(): Promise<string | undefined> {
    if (this.username) return this.username;
    await this.session();
    if (this.username) return this.username;
    try {
      const home = await this.home();
      const listing = await this.listDir(home);
      const owner = listing.files.find((f) => f.name === '.' || f.owner)?.owner;
      if (owner) this.username = owner;
      else this.username = home.split('/').filter(Boolean).pop();
    } catch {
      /* stays unknown; the student can type it */
    }
    return this.username;
  }

  /** the home directory: /pun/sys/dashboard/files redirects to files/fs<home> */
  async home(): Promise<string> {
    if (this.homeDir) return this.homeDir;
    return this.audit.request({ method: 'GET', endpoint: '/pun/sys/dashboard/files', cls: 'files' }, async () => {
      const res = await this.net.fetch(this.url('/pun/sys/dashboard/files'), { credentials: 'same-origin', redirect: 'follow', headers: { Accept: 'application/json' } });
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
    const endpoint = `${FILES}${encodePath(path)}`;
    return this.audit.request({ method: 'GET', endpoint, cls: 'files' }, async () => {
      const res = await this.net.fetch(this.url(endpoint), { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' });
      const text = await res.text();
      if (!res.ok) throw new PortalError(res.status === 404 ? 'the Files app is disabled at your site, or the folder does not exist' : `the Files app answered ${res.status} for ${path}`, res.status);
      let j: DirListing;
      try {
        j = JSON.parse(text) as DirListing;
      } catch {
        throw new PortalError('the Files app answered with a page instead of a listing; sign in to the portal in a tab', res.status);
      }
      if (!Array.isArray(j.files)) throw new PortalError('the Files app listing has no files[]', res.status);
      return { result: j, bytes: text.length, outcome: `${res.status} ${j.files.length} entries` };
    });
  }

  async readFile(path: string): Promise<string> {
    const endpoint = `${FILES}${encodePath(path)}?download=1`;
    return this.audit.request({ method: 'GET', endpoint, cls: 'files' }, async () => {
      const res = await this.net.fetch(this.url(endpoint), { credentials: 'same-origin', cache: 'no-store' });
      const text = await res.text();
      if (!res.ok) throw new PortalError(`could not read ${path} (${res.status})`, res.status);
      return { result: text, bytes: text.length, outcome: `${res.status}` };
    });
  }

  async readFileIfExists(path: string): Promise<string | undefined> {
    try {
      return await this.readFile(path);
    } catch (e) {
      if (e instanceof PortalError && (e.status === 404 || e.status === 500)) return undefined;
      throw e;
    }
  }

  /** PUT writes the body as the file's content; the Rails Origin check is why this must run on the portal origin. */
  async writeFile(path: string, body: string, job?: string): Promise<void> {
    const endpoint = `${FILES}${encodePath(path)}`;
    const csrf = await this.token();
    await this.audit.request({ method: 'PUT', endpoint, cls: 'files', mutates: true, ...(job ? { job } : {}) }, async () => {
      const res = await this.net.fetch(this.url(endpoint), { method: 'PUT', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf, Accept: 'application/json', 'Content-Type': 'application/octet-stream' }, body });
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
    const csrf = await this.token();
    await this.audit.request({ method: 'PUT', endpoint, cls: 'files', mutates: true }, async () => {
      const res = await this.net.fetch(this.url(endpoint), { method: 'PUT', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' } });
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
    const csrf = await this.token();
    await this.audit.request({ method: 'PUT', endpoint, cls: 'files', mutates: true, ...(job ? { job } : {}) }, async () => {
      const res = await this.net.fetch(this.url(endpoint), { method: 'PUT', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' } });
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
    return this.audit.request({ method: 'GET', endpoint: ACTIVE_JOBS, cls: 'jobs' }, async () => {
      const res = await this.net.fetch(this.url(ACTIVE_JOBS), { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' });
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
    const csrf = await this.token();
    await this.audit.request({ method: 'DELETE', endpoint, cls: 'jobs', mutates: true, job: pbsid }, async () => {
      // The dashboard answers a cancel with a 302 to the Active Jobs page. A browser that follows a
      // 302 re-sends the DELETE (only a POST is turned into a GET), which would loop; so the redirect
      // itself is read as the success it signals and never followed.
      const res = await this.net.fetch(this.url(endpoint), { method: 'DELETE', credentials: 'same-origin', redirect: 'manual', headers: { 'X-CSRF-Token': csrf, Accept: 'text/html' } });
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
    return this.audit.request({ method: 'WS', endpoint, cls, mutates: true, ...(opts.job ? { job: opts.job } : {}) }, async () => {
      const r = await runShellCommand({ origin: this.origin, host: this.shellHost, command, net: this.net, timeoutMs: opts.timeoutMs });
      return { result: r, bytes: r.transcript.length + command.length, outcome: `exit ${r.exitCode} in ${r.ms} ms` };
    });
  }

  /** 404 = proxy off or host_regex mismatch; 503 "Failed to connect" = proxy on, nothing listening on port 1 (as expected) */
  async probeRnode(host: string): Promise<{ state: RnodeState; status: number; detail: string }> {
    const endpoint = `/rnode/${encodeURIComponent(host)}/1/`;
    return this.audit.request({ method: 'GET', endpoint, cls: 'probe' }, async () => {
      const res = await this.net.fetch(this.url(endpoint), { credentials: 'same-origin', redirect: 'manual', cache: 'no-store' });
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
        const res = await this.net.fetch(this.url(path), { credentials: 'same-origin', redirect: 'manual', headers: { Accept: 'application/json' }, cache: 'no-store' });
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
