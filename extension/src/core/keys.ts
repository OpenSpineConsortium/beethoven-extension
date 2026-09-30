// Every storage key in one place, split by where it lives and how long it lasts.
//
// storage.local (survives restarts; nothing secret and no credential ever):
export const PORTAL_KEY = 'bridge.portal'; //   {origin, hostname, connected_at, shell_host, site}
export const PREFS_KEY = 'bridge.prefs'; //      {worker_name, permission_mode, auto_start, open_claude_on_connect}
export const KILLLIST_KEY = 'bridge.killlist'; // the last verified kill-list, {fetched_at, list}
export const REVOKED_KEY = 'bridge.revoked'; //  {revoked, message}: what the chokepoint consults before a command
export const ACCESS_KEY = 'bridge.access'; //    the access service's last word on this account at this portal (licensing/access.ts AccessRecord)
export const SERVICES_KEY = 'bridge.services'; // services.json as last read, {fetched_at, access_check, request_page}
export const INSTALL_ID_KEY = 'bridge.install_id'; // 32 random hex characters, made once per installation (ext/storage.ts installId); sent in the approval check
export const IDENTITY_KEY = 'bridge.identity'; // {username, seen_at}: the account name the portal's dashboard last showed for the signed-in session (never typed)
export const CHECKLIST_KEY = 'bridge.checklist'; // {drive_connected_at}: the student's own "done" ticks for steps outside this extension
export const STATEMENTS_KEY = 'bridge.statements'; // {[workspaces/<name>]: Acknowledgement}: the data statement, per workspace, with the text version it was made on
export const OPENED_KEY = 'bridge.opened'; //    {urls: [...]}: environment links this browser profile already opened by itself
export const LOGIN_SEEN_KEY = 'bridge.loginSeen'; // {at, detail}: when the login terminal in this browser last reported SIGNED-IN
export const PROBE_KEY = 'bridge.probe'; //      {submitted_at, job}: the probe job the strip submitted by itself, so it is not submitted again while it runs
export const INSTALL_KEY = 'bridge.install'; //  {attempted_at, ok, detail, dir, note}: the last install, so Details can say which copy it set up, or why the lab's could not be used
// TERMS_KEY ('bridge.terms') is in terms.ts; AUDIT_KEY ('bridge.audit') in audit.ts.
//
// storage.session (cleared when the browser closes):
export const PORTAL_TAB_KEY = 'bridge.portalTab'; // {tabId, origin}: the tab whose page script answers
export const RUN_KEY = 'bridge.run'; //             {stateDir, run, job, site, status, connection, rc_tail, updated, error}
export const CHECKS_KEY = 'bridge.checks'; //       the last diagnostics report
export const SESSION_SEEN_KEY = 'bridge.sessionSeen'; // {checked_at}: when check 4 last passed
export const AUTO_START_KEY = 'bridge.autoStart'; // {attempted_at, outcome}: what the last automatic start did
export const CLICK_KEY = 'bridge.click'; //         {tabId, origin, path, looksLikeOod, granted, at}: the tab the toolbar button was last clicked from

export interface PortalSettings {
  origin: string;
  hostname: string;
  connected_at: string;
  /** the Shell app host segment; "default" lets the portal pick */
  shell_host: string;
  /** the site profile name handed to `hpcworker install --profile` and used in the session name */
  site: string;
}

export interface Prefs {
  /** the worker's name: its run directory and workspace are named after it (hpcworker worker start --name) */
  worker_name: string;
  permission_mode: 'default' | 'acceptEdits' | 'plan';
  /** "start my worker when I open my portal", on by default (DEFAULT_PREFS): the background starts the worker when the portal tab connects and everything is in order; a stopped or failed worker is never started this way */
  auto_start: boolean;
  /** open the worker's claude.ai link in a new tab the first time this browser sees it */
  open_claude_on_connect: boolean;
}

/** the account name the portal's dashboard showed ("Logged in as <name>"), and when; the only identity the extension ever uses */
export interface IdentityNote {
  username: string;
  seen_at?: string;
}

export interface Checklist {
  /** when the student ticked "Google Drive is connected in claude.ai" */
  drive_connected_at?: string;
}

export interface AutoStartNote {
  attempted_at: string;
  outcome: string;
}

export interface LoginSeen {
  /** when the login terminal reported SIGNED-IN in this browser */
  at: string;
  detail?: string;
}

export interface ProbeNote {
  submitted_at: string;
  job?: string;
}

export interface InstallNote {
  attempted_at: string;
  ok: boolean;
  detail: string;
  /** the shared folder the site profile names, when it names one */
  dir?: string;
  /** one line for Details when the lab's shared copy could not be used (builds up to 7.0.0 wrote it when they put the tool in the student's own account instead) */
  note?: string;
}

export interface OpenedLinks {
  urls: string[];
}

/** the tab the toolbar button was clicked from, for the strip's first step */
export interface ClickNote {
  tabId: number;
  origin: string;
  path: string;
  looksLikeOod: boolean;
  granted: boolean;
  at: string;
}

export const DEFAULT_PREFS: Prefs = { worker_name: 'worker', permission_mode: 'default', auto_start: true, open_claude_on_connect: true };

/** "ondemand.grid.wayne.edu" -> "wayne": the default site profile name */
export function siteFromHostname(hostname: string): string {
  const parts = String(hostname ?? '').toLowerCase().split('.').filter(Boolean);
  if (parts.length >= 2) return (parts[parts.length - 2] ?? '').replace(/[^a-z0-9-]/g, '');
  return parts[0] ?? 'site';
}
