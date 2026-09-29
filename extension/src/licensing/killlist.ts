// The kill-list: one signed JSON document, fetched once a day as data, that can withdraw a
// release. Served at KILLLIST_URL with CORS open (the extension holds no host permission for
// that origin, so the browser lets the fetch through only on the server's say-so).
//
// Document shape (the outer fields are for people; only the signed payload inside `sig` counts):
//   {
//     "v": 1,
//     "kid": "k1",
//     "issued": 1790000000,                 unix seconds
//     "revoked_versions": ["1.0.0"],        extension versions that must stop sending commands
//     "revoked_lids": [],                   kept for compatibility with older lists; read, never acted on
//     "message": "why, in one sentence",    shown to the student
//     "sig": "ASHLEYREV1.<base64url(JSON of the fields above, without sig)>.<base64url(Ed25519 signature)>"
//   }
// The signature is detached from the readable copy: `sig` is a complete ASHLEYREV1 token whose
// payload repeats the fields, signed over "ASHLEYREV1.<payload part>" exactly like Ashley's
// revocation list (grid/license.js signRevocationList), so the same issuing tool and the same
// public key serve both. Since version 4 the list withdraws versions only: access to Ashley Bridge
// is granted and withdrawn by Licensor's access service (access.ts), not by anything in this file.
//
// Fail-safe by design: a fetch that fails keeps the last good list; a signature that fails is
// ignored and reported; the extension refuses only on a verified revocation. A one-person vendor
// going offline must never strand a campus.
import { open, REV_PREFIX, type KeyRing } from './signed';

export const KILLLIST_URL = 'https://openspineconsortium.com/ashley/bridge-killlist.json';
/** how often the background asks (minutes); Chrome's alarms floor is irrelevant at this scale */
export const KILLLIST_PERIOD_MINUTES = 24 * 60;

export interface KillListPayload {
  v: 1;
  kid: string;
  issued: number;
  revoked_versions: string[];
  /** older lists carry withdrawn ids here; kept so the readable copy can be compared with the signed one, never acted on */
  revoked_lids: string[];
  message: string;
}

export interface KillListCheck {
  ok: boolean;
  detail: string;
  list?: KillListPayload;
}

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.map(String) : []);

/** Verify a fetched document. Only the signed payload is trusted; the outer JSON is a convenience copy. */
export async function verifyKillList(doc: unknown, keys: KeyRing): Promise<KillListCheck> {
  if (!doc || typeof doc !== 'object') return { ok: false, detail: 'kill-list is not a JSON object' };
  const sig = (doc as { sig?: unknown }).sig;
  if (typeof sig !== 'string' || !sig.startsWith(`${REV_PREFIX}.`)) return { ok: false, detail: 'kill-list carries no signature' };
  const opened = await open(REV_PREFIX, sig, keys);
  if (opened.error) return { ok: false, detail: `kill-list signature rejected (${opened.error})` };
  const p = opened.payload as Record<string, unknown>;
  if (p.v !== 1) return { ok: false, detail: 'kill-list payload malformed' };
  const list: KillListPayload = {
    v: 1,
    kid: String(p.kid ?? ''),
    issued: Number(p.issued) || 0,
    revoked_versions: strings(p.revoked_versions),
    revoked_lids: [...new Set([...strings(p.revoked_lids), ...strings(p.revoked)])].sort(),
    message: typeof p.message === 'string' ? p.message : '',
  };
  return { ok: true, detail: `${list.revoked_versions.length} withdrawn version(s), list of ${new Date(list.issued * 1000).toISOString().slice(0, 10)}`, list };
}

export interface StoredKillList {
  fetched_at: string;
  list: KillListPayload;
}

export interface KillListOutcome {
  /** the list to act on: the newly verified one, or the last good one */
  current?: StoredKillList;
  detail: string;
  /** true when this fetch produced a newly verified list */
  fresh: boolean;
}

/**
 * Fetch, verify, and decide. `fetchFn` and `now` are injected for tests. A newer `issued` never
 * loses to an older one, so a replayed old list cannot un-revoke anything.
 */
export async function refreshKillList(previous: StoredKillList | undefined, keys: KeyRing, fetchFn: typeof fetch, now: () => Date = () => new Date(), url = KILLLIST_URL): Promise<KillListOutcome> {
  let doc: unknown;
  try {
    const res = await fetchFn(url, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
    if (!res.ok) return { current: previous, fresh: false, detail: `kill-list fetch answered ${res.status}; keeping the last good list` };
    doc = await res.json();
  } catch (e) {
    return { current: previous, fresh: false, detail: `kill-list unreachable (${(e as Error).message}); keeping the last good list` };
  }
  const v = await verifyKillList(doc, keys);
  if (!v.ok || !v.list) return { current: previous, fresh: false, detail: `${v.detail}; keeping the last good list` };
  if (previous && previous.list.issued > v.list.issued) return { current: previous, fresh: false, detail: 'fetched kill-list is older than the one on file; keeping the newer' };
  return { current: { fetched_at: now().toISOString(), list: v.list }, fresh: true, detail: v.detail };
}

/** What a verified list means for this installation: is this version withdrawn, and what does the list say. */
export function killListVerdict(stored: StoredKillList | undefined, version: string): { versionRevoked: boolean; message: string } {
  if (!stored) return { versionRevoked: false, message: '' };
  return { versionRevoked: stored.list.revoked_versions.includes(version), message: stored.list.message };
}
