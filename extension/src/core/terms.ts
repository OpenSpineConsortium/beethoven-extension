// The acceptance record for the licence terms: what was shown, what was ticked, when, and from which
// installation. Ported from the vendor's VS Code extension (its core/terms.ts); the mechanism is the
// same, the surface is a browser extension page and the record lives in storage.local.
//
// Why so much detail: the cases that enforce click-through terms turn on what the screen said and
// what the click meant (Berman, Chabolla, Sellers, Kauders, In re StockX). The vendor bears that
// proof, so every acceptance stores the terms version and the SHA-256 of the exact texts bundled and
// offered under "Show terms", the summary and the sentence shown with their exact words, the state of
// each box, the button's label, whether the full text was opened, the time, the browser and the
// installation identifier. The text stays retrievable: the welcome and settings pages let the person
// open, save and print it (Michigan UETA, MCL 450.838(3): a record the recipient cannot store or print
// is not enforceable against them).
//
// 11.0.0 (TermsRecord v2): one tick and one button, "Agree and continue", on the welcome page; no typed
// name and no scrolling gate. Opening the full text is the person's choice and enables nothing; the
// record says truthfully whether it was opened and whether its end was reached. The identity the record
// lacks at the moment of acceptance (no account is known before the first grid sign-in) is added once,
// afterwards, as bound_account, and the record says it came after. A two-tick variant for counsel
// (Decision 1: a second, separate box for the dispute terms and the known risks) is one constant,
// TWO_TICKS, switched off. Version 1 records (the signing dialog of 8.0.0 to 10.0.0) are kept where they
// are and are out of force: everyone accepts once more.

/**
 * The version and date on the first line of the LICENSE.txt this build ships ("Version N, date.");
 * bump both with the text (integer, never fractional) and every install re-accepts. The build
 * (scripts/sync-profiles.mjs) refuses to bundle a LICENSE.txt whose line disagrees with these.
 */
export const TERMS_VERSION = 9;
export const TERMS_DATE = '2026-10-02';
export const PRODUCT_NAME = 'Beethoven';
export const TERMS_TITLE = `${PRODUCT_NAME} Trial Edition License Agreement`;
export const AGREE_BUTTON = 'Agree and continue';
export const EDITION = 'trial';
export const TERMS_KEY = 'bridge.terms';
/**
 * The acceptance records made before this one (8.0.0 to 10.0.0's v1 records, and a v2 record of an
 * earlier text), kept out of force when a new acceptance replaces them under TERMS_KEY: the agreement
 * history a dispute may need. At most TERMS_HISTORY_MAX, oldest dropped.
 */
export const TERMS_HISTORY_KEY = 'bridge.termsHistory';
export const TERMS_HISTORY_MAX = 10;

/**
 * Decision 1 (Greg: one tick). true shows the counsel variant: the agree box without its second line,
 * and a second, separate, unticked box for the dispute terms and the known risks. A change here is a
 * change to the agreement's formation and goes with a new TERMS_VERSION.
 */
export const TWO_TICKS = false;

/** the four lines of "The agreement, in short", verbatim; recorded with their hash */
export const SUMMARY: readonly string[] = [
  "Free while you're approved. Licensed to you, not sold.",
  'To check your approval, it sends the lab your AccessID and an ID for this browser.',
  'The grid, Anthropic or the browser store can stop it working at any time. You accept that risk.',
  'Disputes: written notice first, then one person at a time in Michigan courts, with no jury.',
];

/** one box as the welcome page draws it: a bold first line and, in the shipping variant, a soft second line, both inside one label */
export interface TickWords {
  id: 'agree' | 'specific';
  bold: string;
  soft?: string;
}

const AGREE_BOLD = `I've read and agree to the ${PRODUCT_NAME} terms and privacy statement, and I'm 18 or older.`;
const AGREE_SOFT = 'That includes giving up a jury trial and class actions, and accepting the risks above.';
const SPECIFIC = 'I specifically accept the dispute terms (no jury trial, no class actions) and the known risks (sections 8, 19 and 20).';

/** the shipping tick (Decision 1): one box, unticked, its sentence naming the waivers and the risks */
export const AFFIRMATION: TickWords = { id: 'agree', bold: AGREE_BOLD, soft: AGREE_SOFT };

/** the counsel variant: the agree box alone, and a second, separate box */
export const AFFIRMATIONS_TWO: readonly TickWords[] = [
  { id: 'agree', bold: AGREE_BOLD },
  { id: 'specific', bold: SPECIFIC },
];

/** the boxes this build shows, in order */
export function ticks(): readonly TickWords[] {
  return TWO_TICKS ? AFFIRMATIONS_TWO : [AFFIRMATION];
}

/** the exact label recorded for a box: its lines as one sentence pair, verbatim */
export function tickLabel(t: TickWords): string {
  return t.soft ? `${t.bold} ${t.soft}` : t.bold;
}

export interface Affirmation {
  id: string;
  /** the exact sentence shown next to the box */
  label: string;
  checked: boolean;
}

/** TermsRecord v2 (11.0.0): storage.local, exportable */
export interface TermsRecord {
  v: 2;
  terms_version: number;
  terms_date: string;
  edition: 'trial';
  /** SHA-256 of the LICENSE.txt bundled and offered under "Show terms" */
  license_sha256: string;
  /** SHA-256 of the PRIVACY.md bundled and offered under "Show terms" */
  privacy_sha256: string;
  /** the four summary lines, verbatim, and their hash */
  summary_lines: string[];
  summary_sha256: string;
  /** each box with its exact label and state */
  affirmations: Affirmation[];
  /** the label of the control that formed the agreement, exactly as shown */
  button_label: string;
  surface: 'welcome';
  /** "Show terms" was expanded before the press */
  terms_opened: boolean;
  terms_opened_at?: string;
  /** the expanded text was scrolled to its end before the press */
  terms_end_reached: boolean;
  opened_in_tab: boolean;
  saved_copy: boolean;
  printed: boolean;
  accepted_at: string;
  product_version: string;
  /** browser name and version */
  host: string;
  /** this installation's random identifier (ext/storage.ts installId; the approval check sends it too) */
  install_id: string;
  /** the AccessID the grid's dashboard first showed after acceptance, added once (the identity the record lacked when it was made) */
  bound_account?: string;
  bound_account_seen_at?: string;
}

/** the record 8.0.0 to 10.0.0 wrote (signing dialog, typed name); kept in storage, never in force under these terms */
export interface TermsRecordV1 {
  v: 1;
  terms_version: number;
  edition: 'trial';
  license_sha256: string;
  privacy_sha256: string;
  accepted_at: string;
  surface: 'extension';
  button_label: string;
  affirmations: Affirmation[];
  signed_name: string;
  scrolled_to_end: boolean;
  opened_in_tab?: boolean;
  product_version: string;
  host: string;
  install_id: string;
}

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.replace(/\r\n/g, '\n'));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** every box this build shows is ticked; nothing else is asked (no name, no reading gate) */
export function acceptanceComplete(affirmations: Array<{ id: string; checked: boolean }>): { ok: boolean; missing: string[] } {
  const missing = ticks()
    .filter((t) => !affirmations.find((a) => a.id === t.id && a.checked))
    .map((t) => t.id);
  return { ok: missing.length === 0, missing };
}

/** how near the bottom of the expanded text counts as its end (a zoomed page stops a pixel or two short) */
export const END_SLACK_PX = 8;

/** one reading of the expanded text's box: element.scrollTop, clientHeight and scrollHeight */
export interface BoxGeometry {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/** a box with no height is not laid out (not on the page yet, or folded) and proves nothing */
export function laidOut(g: BoxGeometry): boolean {
  return g.clientHeight > 0 && g.scrollHeight > 0;
}

/**
 * The one measure that remains of 10.0.0's reading gate: does this reading of the expanded text show
 * its end? It only sets terms_end_reached in the record; it never enables or disables anything.
 */
export function endReached(g: BoxGeometry): boolean {
  if (!laidOut(g)) return false;
  return g.scrollTop + g.clientHeight >= g.scrollHeight - END_SLACK_PX;
}

/** what the page knows at the press, for buildTermsRecord */
export interface AcceptanceInput {
  license: string;
  privacy: string;
  /** the boxes as they stood at the press */
  checked: Partial<Record<'agree' | 'specific', boolean>>;
  termsOpenedAt?: string;
  termsEndReached: boolean;
  openedInTab: boolean;
  savedCopy: boolean;
  printed: boolean;
  productVersion: string;
  host: string;
  installId: string;
  at?: string;
}

/** TermsRecord v2 from what the welcome page showed and what the person did */
export async function buildTermsRecord(i: AcceptanceInput): Promise<TermsRecord> {
  const summary = [...SUMMARY];
  return {
    v: 2,
    terms_version: TERMS_VERSION,
    terms_date: TERMS_DATE,
    edition: EDITION,
    license_sha256: await sha256(i.license),
    privacy_sha256: await sha256(i.privacy),
    summary_lines: summary,
    summary_sha256: await sha256(summary.join('\n')),
    affirmations: ticks().map((t) => ({ id: t.id, label: tickLabel(t), checked: !!i.checked[t.id] })),
    button_label: AGREE_BUTTON,
    surface: 'welcome',
    terms_opened: !!i.termsOpenedAt,
    ...(i.termsOpenedAt ? { terms_opened_at: i.termsOpenedAt } : {}),
    terms_end_reached: i.termsEndReached,
    opened_in_tab: i.openedInTab,
    saved_copy: i.savedCopy,
    printed: i.printed,
    accepted_at: i.at ?? new Date().toISOString(),
    product_version: i.productVersion,
    host: i.host,
    install_id: i.installId,
  };
}

/**
 * The account the grid's dashboard showed, added once to a record in force; a record that already
 * names one is returned unchanged (the first account it saw is the one it keeps).
 */
export function bindAccount(r: TermsRecord, account: string, at = new Date().toISOString()): TermsRecord {
  if (r.bound_account || !account) return r;
  return { ...r, bound_account: account, bound_account_seen_at: at };
}

/**
 * A record counts only if it is v2 for the terms in force, with every box this build shows ticked.
 * 12.0.0 (LICENSE version 9, PRIVACY version 10): a version 8 acceptance is kept (TERMS_HISTORY_KEY
 * when it is replaced) and is out of force: everyone accepts once more.
 */
export function recordInForce(r: unknown): r is TermsRecord {
  const x = r as TermsRecord | undefined;
  if (!x || typeof x !== 'object' || x.v !== 2 || x.terms_version !== TERMS_VERSION || x.edition !== EDITION) return false;
  if (typeof x.accepted_at !== 'string' || !Array.isArray(x.affirmations)) return false;
  return acceptanceComplete(x.affirmations).ok;
}

/** the export's sentence about the full text, from the record itself */
export function openedSentence(r: Pick<TermsRecord, 'terms_opened'>): string {
  return r.terms_opened ? 'The full text was opened before Agree.' : 'The full text was not opened before Agree.';
}

/** the history with a record that is about to be replaced; one already in it, or none, leaves it as it is */
export function withHistory(history: unknown, previous: unknown): unknown[] {
  const h = Array.isArray(history) ? history : [];
  if (!previous || typeof previous !== 'object') return h;
  const key = JSON.stringify(previous);
  if (h.some((x) => JSON.stringify(x) === key)) return h;
  return [...h, previous].slice(-TERMS_HISTORY_MAX);
}

/** the acceptance record as a person reads and keeps it (Settings: "Save your acceptance record"); the full record follows as JSON */
export function recordText(r: TermsRecord): string {
  const yes = (b: boolean) => (b ? 'yes' : 'no');
  const lines = [
    `${TERMS_TITLE}, version ${r.terms_version} (${r.terms_date})`,
    `Accepted on ${r.accepted_at} in ${r.host}, ${PRODUCT_NAME} ${r.product_version}, on the ${r.surface} page`,
    `Installation ID: ${r.install_id}`,
    r.bound_account ? `Account: ${r.bound_account} (shown by your portal at ${r.bound_account_seen_at ?? 'a later time'}, after the acceptance)` : 'Account: not seen yet (added once your portal shows it)',
    ...r.affirmations.map((a) => `Ticked: ${yes(a.checked)}: "${a.label}"`),
    `Button: "${r.button_label}"`,
    openedSentence(r),
    `The end of the full text was reached: ${yes(r.terms_end_reached)}. Opened in a tab: ${yes(r.opened_in_tab)}. Saved a copy: ${yes(r.saved_copy)}. Printed: ${yes(r.printed)}.`,
    `LICENSE.txt SHA-256: ${r.license_sha256}`,
    `PRIVACY.md SHA-256: ${r.privacy_sha256}`,
    'The agreement in short, as shown:',
    ...r.summary_lines.map((l) => `  ${l}`),
    '',
    'The full record:',
    JSON.stringify(r, null, 1),
  ];
  return `${lines.join('\n')}\n`;
}

/** The one-line refusal shown wherever the terms have not been accepted. */
export const TERMS_REFUSAL = `The ${PRODUCT_NAME} terms haven't been accepted in this browser yet. Open ${PRODUCT_NAME}'s welcome page to accept them.`;
