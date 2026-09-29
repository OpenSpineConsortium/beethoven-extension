// Every storage key in one place, split by where it lives and how long it lasts.
//
// storage.local (survives restarts; nothing secret and no credential ever):
export const PORTAL_KEY = 'bridge.portal'; //   {origin, hostname, connected_at, shell_host, site}
export const LICENSE_KEY = 'bridge.license'; // {key, identity: {accessId}, saved_at}
export const PREFS_KEY = 'bridge.prefs'; //      {worker_name, permission_mode}
export const KILLLIST_KEY = 'bridge.killlist'; // the last verified kill-list, {fetched_at, list}
export const REVOKED_KEY = 'bridge.revoked'; //  {revoked, message}: what the chokepoint consults before a command
export const INSTALL_ID_KEY = 'bridge.install_id';
export const IDENTITY_KEY = 'bridge.identity'; // {username}: the portal username last seen
// TERMS_KEY ('bridge.terms') is in terms.ts; AUDIT_KEY ('bridge.audit') in audit.ts.
//
// storage.session (cleared when the browser closes):
export const PORTAL_TAB_KEY = 'bridge.portalTab'; // {tabId, origin}: the tab whose page script answers
export const RUN_KEY = 'bridge.run'; //             {home, run, job, status, connection, rc_tail, updated, error}
export const CHECKS_KEY = 'bridge.checks'; //       the last diagnostics report
export const SESSION_SEEN_KEY = 'bridge.sessionSeen'; // {checked_at}: when check 4 last passed
// ACK_KEY ('bridge.ack') is in disclosure.ts.

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
}

export interface LicenseState {
  key: string;
  identity: { accessId?: string };
  saved_at: string;
}

export const DEFAULT_PREFS: Prefs = { worker_name: 'worker', permission_mode: 'default' };

/** "ondemand.grid.wayne.edu" -> "wayne": the default site profile name */
export function siteFromHostname(hostname: string): string {
  const parts = String(hostname ?? '').toLowerCase().split('.').filter(Boolean);
  if (parts.length >= 2) return (parts[parts.length - 2] ?? '').replace(/[^a-z0-9-]/g, '');
  return parts[0] ?? 'site';
}
