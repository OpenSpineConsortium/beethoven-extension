# Store listing and compliance

What the four stores will be told, in the words they will be told it, and the checklist that has to be
green before submission. Sources: the report's "Extension architecture and permission manifest",
"Store-compliance checklist", "Stores and universities accept one origin, no credential, and a signed
kill-list", and the browser-platform and security research notes. The product name and identifier
carry no university name. The named publisher on every store account is the LLC once it exists; until
then, Gregory Schwing, trading as OpenSpineConsortium.

## Single-purpose statement

> Start, monitor and stop a Claude Code worker on your university's Open OnDemand cluster and hand you
> its Remote Control link.

It must read as one narrow browser function, not two products. Every permission below maps to a
sentence of it. The listing description also says, in plain words: the extension talks only to the
Open OnDemand portal address you enter; it has no access to claude.ai; it never sees your Claude sign-in;
it runs no code it did not ship with.

## Per-permission justifications (one sentence each, as entered in each dashboard)

| Manifest key | Value | Justification |
|---|---|---|
| `permissions` | `storage` | Remembers the portal hostname you enter, your preferences and your licence acceptance. |
| | `alarms` | Checks your running job no more than once a minute and reconnects after the browser suspends the extension. |
| | `scripting` | Loads the extension's page script on your university portal, and only there, after you connect it. |
| | `activeTab` | Lets the "Connect this portal" button read the address of the tab you clicked from; no install warning. |
| | `sidePanel` (Chrome and Edge builds only) | Shows the job monitor beside your portal tab. |
| `optional_host_permissions` | `["https://*/*"]` | You type your university's Open OnDemand hostname; access is requested at runtime for that one origin only, and the extension refuses to work until it is granted. |
| `host_permissions` | none | |
| Never requested | `cookies`, `tabs`, `webRequest`, `webRequestBlocking`, `declarativeNetRequest`, `nativeMessaging`, `debugger`, `identity`; any `claude.ai`, `anthropic.com` or `claude.com` origin | Stated in the negative in the listing and in PRIVACY.md. |

The wildcard in `optional_host_permissions` is what triggers in-depth review at Chrome; the
justification above and the visible refusal to work before a host is granted are the answer to it.

## Remote code

Answer: **No.** No `eval`, no `new Function`, no fetched scripts, no interpreter for remote commands.
The daily kill-list is a JSON document verified with WebCrypto against a key compiled into the bundle;
JSON and CSS are data under Chrome's remote-hosted-code rule. The content security policy is the MV3
default with no remote script sources. Commands to the cluster are a small, declarative vocabulary
interpreted by shipped code.

## Payment

Listing sentence, required by Chrome and Mozilla where payment gates functionality:

> Payment is required for full functionality. The Trial Edition is free for approved institutional
> accounts during the evaluation period; a paid Full Edition, if offered, is a separate key and a
> separate agreement.

On Safari the sentence is not used: Apple forbids licence keys (Guideline 3.1.1), so the Safari edition
is free or is sold by in-app purchase inside the host app.

## Privacy-practices answers, per store

What leaves the device: licence activation (key id, institutional identifier or its hash, extension
version, timestamp, coarse platform) and, if the person turns them on, crash and error reports scrubbed
of identity. What stays on the device: portal hostname and granted origin, job ids, preferences, the
acceptance record, the audit log. What is never collected: command text, file paths, prompts, job
output, portal cookies or tokens, browsing activity, anything from claude.ai. Chrome requires the
privacy policy and in-product disclosure even for data processed only locally, so the onboarding page
discloses the local items too and takes an affirmative click before first use.

### Chrome Web Store (Privacy practices tab)

| Field | Answer |
|---|---|
| Single purpose | as above |
| Permission justifications | as above, one sentence each |
| Remote code | No |
| Data collected: personally identifiable information | Yes: institutional identifier (or its hash) at licence activation |
| Data collected: authentication information | No (the portal cookie is never read; no Claude credential is handled) |
| Data collected: personal communications | No |
| Data collected: website content | No |
| Data collected: web history | No |
| Data collected: user activity | No, except optional crash reports (check ids, verdicts, scrubbed messages) if the person turns them on |
| Data collected: location, financial, health | No |
| Certifications | Not sold to third parties outside approved use cases; not used or transferred for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending |
| Privacy policy URL | the Ashley support page's copy of PRIVACY.md |
| Limited Use statement on the website | "Ashley Bridge's use of information received from Google APIs and from your browser complies with the Chrome Web Store User Data Policy, including the Limited Use requirements." |

### Edge Add-ons (Partner Center, Privacy page)

| Field | Answer |
|---|---|
| Single purpose | as above |
| Permission justification | as above |
| Are you using remote code? | No |
| Data usage certification | same categories and answers as Chrome |
| Privacy policy URL | as above |
| Test credentials or explanation | the reviewer-access plan below (no university account can be issued) |
| Update channel | Partner Center only; no self-update |

### Firefox Add-ons (AMO)

| Item | Answer |
|---|---|
| `browser_specific_settings.gecko.data_collection_permissions` | `{ "required": ["personallyIdentifyingInfo"], "optional": ["technicalAndInteraction"] }`. The required entry is the institutional identifier in the activation ping; the optional entry is the crash and error reports. `"none"` cannot be declared truthfully while activation exists |
| Source code | the zip from `wxt zip -b firefox` plus build instructions (`README` in `extension/`: exact Node version, `npm ci`, the build command); the bundle is minified for size only, never obfuscated |
| Payment disclosure | the payment sentence above in the listing |
| Testing information | the reviewer-access plan below |
| Distribution | listed, or unlisted-signed XPI for a single campus; the same policies apply either way |

### Apple (App Store privacy labels, Safari edition)

| Label | Answer |
|---|---|
| Identifiers: User ID | Collected, linked to the user, not used for tracking (the institutional identifier or its hash at activation) |
| Diagnostics: Crash data | Collected only if the user turns reports on; not linked to identity (random install id); not used for tracking |
| Usage data, Contacts, Location, Financial, Health, Browsing history, User content | Not collected |
| Tracking | No |
| 5.1.1 consent | the onboarding page obtains consent before any collection; paid functionality never depends on granting data access |
| 5.1.2 third-party AI disclosure | the onboarding page and each job start disclose that files, output and the transcript go to Anthropic under the user's own Claude account |
| Privacy policy URL | as above |

## Reviewer access

No reviewer at Chrome, Edge, Mozilla or Apple can log into a university's Open OnDemand portal. The
submission therefore includes:

1. A public mock portal (`https://mock-ood.<vendor domain>/`) that serves the same routes the extension
   uses: `GET /pun/sys/dashboard/` (200 HTML with the csrf meta tag), `GET /pun/sys/shell/ssh/default`
   with a `csrf=` script and a WebSocket that echoes a prompt and accepts one `sbatch --parsable` line,
   `GET`/`PUT /pun/sys/dashboard/files/fs/...` backed by a sandbox directory, and
   `GET /pun/sys/dashboard/activejobs.json`. It runs no scheduler and reaches no cluster; it exists so a
   reviewer can click *Connect this portal*, grant the one origin, see the diagnostics run and see a
   fake job go from starting to online.
2. A recorded walk-through (under five minutes) of the same flow against the mock portal, and a second
   recording against a real portal with the hostname blurred, so the reviewer sees what a student sees.
3. Reviewer notes stating the negatives: no claude.ai access, no credential handling, no remote code,
   and the exact host and permission list a security office can pin with
   `ExtensionSettings.runtime_allowed_hosts`.

## Negative statements (listing text, privacy policy and reviewer notes, verbatim)

- Ashley Bridge has no access to claude.ai. It does not run on that site, does not read it and does not
  change it.
- Ashley Bridge never sees your Claude sign-in. You sign in to Claude Code yourself, on your cluster,
  through Anthropic's own flow; the extension reads only whether Claude Code says it is signed in.
- Ashley Bridge runs no code it did not ship with. Its daily update check downloads a signed list, not
  a program.
- Ashley Bridge talks to one website: the Open OnDemand portal address you enter. It requests access to
  that site when you click Connect, and to nothing else.
- Ashley Bridge does not read your portal cookie and does not sign in for you. When your portal asks
  for a sign-in, the extension asks you to sign in in a tab.

## The 13-item checklist

| # | Item | Chrome Web Store | Edge Add-ons | Firefox AMO | Apple | Owner | Status |
|---|---|---|---|---|---|---|---|
| 1 | Single-purpose statement, as above; must not read as two products | required | required | implicit | implicit | maintainer | drafted above; already the `description` in `extension/package.json` and `wxt.config.ts` |
| 2 | Per-permission justification, one sentence each | Privacy practices tab | Partner Center Privacy page | reviewer notes | App Review notes | maintainer | drafted above |
| 3 | Remote code "No"; no `eval`, no fetched scripts; kill-list is JSON | required | required | required | 2.5.2 | extension stream | to verify in the built bundle (`.output/`) |
| 4 | Privacy policy URL and data-use certifications; in-product disclosure and affirmative consent before first use, even for on-device data | required | required | required | 5.1.1 labels | maintainer + extension stream | root `PRIVACY.md` and `LICENSE.txt` written; `extension/public/LICENSE.txt` and `PRIVACY.md` still carry Ashley's VS Code texts and must be replaced by byte-identical copies of the root files; onboarding page pending |
| 5 | "Payment required for full functionality" and the trial sentence in the listing | required | required | required ("Listings must disclose when payment is required") | licence keys forbidden (3.1.1): free edition or IAP | maintainer | drafted above |
| 6 | Readable, unobfuscated bundle; Firefox source zip with build instructions (`wxt zip -b firefox`) | minification allowed | no obfuscation | source required | | extension stream | `npm run zip` defined; build instructions for the AMO source zip not yet written |
| 7 | Reviewer access: public mock portal plus recorded walk-through | recommended | test credentials or explanation required | "testing information" required | review notes | maintainer + extension stream | mock portal scaffolded at `extension/mock-ood` (`npm run mock`); not yet hosted publicly; walk-through not recorded |
| 8 | Developer account: two-step verification with a hardware key; no third-party OAuth grants on the account | required | | required | Apple ID 2FA | maintainer | to confirm per account |
| 9 | Distribution channel while private: Unlisted / Hidden / unlisted-signed XPI (same review) | available | available | available | TestFlight or App Store only | maintainer | decision pending |
| 10 | Firefox `data_collection_permissions` declared in the manifest | | | required for new extensions since 2025-11-03 | | extension stream | set in `wxt.config.ts` (`strict_min_version` 140, gecko id `ashley-bridge@openspineconsortium.com`) |
| 11 | Trader status and phone number under the EU DSA if offered in the EU; otherwise geo-restrict to the US | required if EU | | | | maintainer | US only, to set in each dashboard |
| 12 | Safari packaging: `xcrun safari-web-extension-packager` or the App Store Connect packager; Apple Developer Program membership; app record | | | | required | maintainer (needs a Mac) | not started; see MAC_AND_SAFARI.md |
| 13 | Review time budgeted: days to weeks (Chrome), up to seven business days (Edge), up to 24 hours to sign (Firefox), undocumented (Apple) | | | | | maintainer | to schedule after item 7 |

Two things sit behind the checklist and are not store items: the release pipeline (lockfile and
`npm ci`, actions pinned by commit SHA, hosted-builder attestation, reproducible-build instructions, no
long-lived store API key in CI) and the kill-list signing key under hardware-key custody, both in
`SECURITY.md`.
