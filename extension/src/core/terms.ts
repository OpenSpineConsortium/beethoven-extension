// The acceptance record for the licence terms: what was shown, what was ticked, who signed, when.
// Ported from Ashley's core/terms.ts; the mechanism is the same, the surface is a browser
// extension page and the record lives in storage.local.
//
// Why so much detail: the cases that enforce click-through terms turn on what the screen said and
// what the click meant (Berman, Chabolla, Sellers, Kauders, In re StockX). The vendor bears that
// proof, so every acceptance stores the terms version and the SHA-256 of the exact text shown, the
// state of each checkbox with its exact label, the typed name, the surface, the browser and the
// time. The text stays retrievable: the onboarding page exports the agreement beside the record
// (Michigan UETA, MCL 450.838(3): a record the recipient cannot store or print is not enforceable
// against them).

/**
 * The version and date on the first line of the LICENSE.txt this build ships ("Version N, date");
 * bump both with the text (integer, never fractional) and every install re-accepts. The build
 * (scripts/sync-framework.mjs) refuses to bundle a LICENSE.txt whose line disagrees with these.
 */
export const TERMS_VERSION = 4;
export const TERMS_DATE = '2026-09-29';
export const PRODUCT_NAME = 'Ashley Bridge';
export const TERMS_TITLE = `${PRODUCT_NAME} Trial Edition License Agreement`;
export const AGREE_BUTTON = 'Accept and Continue';
export const EDITION = 'trial';
export const TERMS_KEY = 'bridge.terms';

export interface Affirmation {
  id: string;
  /** the exact sentence shown next to the box */
  label: string;
  checked: boolean;
}

export interface TermsRecord {
  v: 1;
  terms_version: number;
  edition: 'trial';
  /** SHA-256 of the agreement as shown */
  license_sha256: string;
  /** SHA-256 of PRIVACY.md as shown */
  privacy_sha256: string;
  accepted_at: string;
  surface: 'extension';
  /** the label of the control that formed the agreement, exactly as shown */
  button_label: string;
  affirmations: Affirmation[];
  /** the name the person typed as their signature */
  signed_name: string;
  /** whether the person scrolled the full text to its end (or opened it in a tab) before the button became available */
  scrolled_to_end: boolean;
  product_version: string;
  /** browser name and version */
  host: string;
  /** the random install id (never an identity) */
  install_id: string;
}

const RIGHTS =
  'I specifically consent to the terms that change how a dispute is handled and what I can recover: written notice and 60 days to resolve it before any lawsuit, individual claims only with a class-action waiver, Michigan courts with small claims allowed where I live (section 19), the WAIVER OF JURY TRIAL (section 20), the one-year limit on contract and warranty claims, and the warranty disclaimer, exclusive remedy and liability limits (sections 12 and 13).';
const RISKS =
  `Known risks: ${PRODUCT_NAME} depends on my university's cluster, its Open OnDemand portal and network, and on Anthropic (Claude and Claude Code Remote Control); any of them can stop it working, including Anthropic changing or enforcing who may use Remote Control, my university disabling or reconfiguring the portal's shell, files or reverse proxy, and a browser store removing or disabling the extension; the Trial Edition is free, can be withdrawn or ended, and nothing is refunded because nothing is paid; nothing releases the licensor from its own gross negligence, wilful misconduct or fraud; and ${PRODUCT_NAME} is a research tool, never for clinical use. I accept these risks (section 8).`;
const AGE = `I am 18 or older (or a parent or guardian accepting for me), and each account ${PRODUCT_NAME} touches (my university cluster and portal, my Claude account) is my own.`;

/** The affirmations the signing dialog shows, in order. The wording is part of the record. */
export const AFFIRMATIONS: Array<{ id: string; label: string }> = [
  {
    id: 'read_agree',
    label: `By ticking this box and choosing "${AGREE_BUTTON}" below, I agree to the ${TERMS_TITLE} (version ${TERMS_VERSION}, ${TERMS_DATE}) and the Privacy Statement, which I have read.`,
  },
  { id: 'rights', label: RIGHTS },
  { id: 'risks', label: RISKS },
  { id: 'age_authority', label: AGE },
];

/** The plain-words summary shown above the full text. */
export const SUMMARY: string[] = [
  `This is the free Trial Edition. It is licensed, not sold: you receive a licence to use ${PRODUCT_NAME}, not the software itself. Nothing is paid, nothing converts into a paid licence, and no charge ever follows.`,
  `${PRODUCT_NAME} works only for an institutional account the licensor has approved, and your own sign-in to your university's Open OnDemand portal, which you connect yourself, is what identifies you; there is no key (section 3). It works with that one website; its only other requests go to the licensor: the approval check, which sends the account name your portal shows, the portal's address, the product and its version, and a daily download of the service's address and the signed list of withdrawn versions, which carries nothing about you (section 10). It runs nothing on claude.ai and never reads, stores or copies a Claude credential: you sign in to Claude Code yourself, once, on a compute node of your cluster.`,
  `Your Claude Code worker runs as a batch job on your cluster and is shown to you through Anthropic's Remote Control at claude.ai/code and in the Claude app. Files the worker reads and every command's output go to Anthropic; while you are connected the transcript is stored on Anthropic's servers under your own plan's terms.`,
  `${PRODUCT_NAME} depends on your university's cluster and portal and on Anthropic. Any of them can stop it working; because nothing is paid, nothing is refunded (sections 7 to 9).`,
  'Disputes: a signed written notice and 60 days to resolve it before any lawsuit; individual claims only (class-action waiver); Michigan courts, or small claims where you live; a jury waiver; one year to bring contract and warranty claims (sections 19 and 20). No arbitration in this version.',
  'Electronic records: you receive the agreement and notices electronically, can save and print them ("Export a copy", "Print"), can ask for a paper copy, and can withdraw this consent by stopping use. You need a web browser to read them.',
  `No warranty; liability is limited (sections 12 and 13). ${PRODUCT_NAME} is a research tool and never for clinical use.`,
];

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.replace(/\r\n/g, '\n'));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when every affirmation is ticked, a name is typed and the text was read to its end. */
export function acceptanceComplete(affirmations: Affirmation[], signedName: string, scrolledToEnd: boolean): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const a of AFFIRMATIONS) if (!affirmations.find((x) => x.id === a.id && x.checked)) missing.push(a.id);
  if (!signedName || signedName.trim().length < 2) missing.push('signed_name');
  if (!scrolledToEnd) missing.push('scrolled_to_end');
  return { ok: missing.length === 0, missing };
}

/** A record counts only if it is for the terms in force. */
export function recordInForce(r: unknown): r is TermsRecord {
  const x = r as TermsRecord | undefined;
  return !!x && x.v === 1 && x.terms_version === TERMS_VERSION && x.edition === EDITION && typeof x.signed_name === 'string';
}

/** The one-line refusal shown wherever the terms have not been accepted. */
export const TERMS_REFUSAL = `The ${PRODUCT_NAME} licence terms have not been accepted in this browser yet: open the setup page (the terms are shown there).`;
