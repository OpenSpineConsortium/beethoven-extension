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
Open OnDemand portal address you connect; it has no access to claude.ai; it never sees your Claude
sign-in; it runs no code it did not ship with.

## What a click on the icon does (listing text and reviewer notes)

> Click the icon while your university's Open OnDemand portal is open in a tab. The first click asks
> your browser to allow that one site. The extension then wakes the portal up, checks you are signed
> in, installs its small set of scripts in your own cluster account if they are not there, shows you
> where your work goes and takes your statement about it, starts your worker through the portal's
> own shell, and waits for Claude Code to connect. If Claude Code on the cluster is not signed in, the
> extension opens Anthropic's sign-in page in a new tab and asks you to paste the code that page shows
> into one box; the code is typed once into your own job's terminal and not kept. When the worker
> connects, your session's claude.ai/code page opens in a new tab (you can turn that off). The
> extension has no popup menu: its settings are on its options page, and its checks and logs are
> under "Details" in the panel.

The extension opens two kinds of page outside the portal, always in a new tab and never with any code
of its own on them: your university's portal pages (its dashboard and shell), and Anthropic's pages
(the sign-in page Claude Code printed, and your session's `https://claude.ai/code?environment=...`
link; the optional Google Drive step opens `https://claude.ai/settings/connectors`). It never reads
those pages. One ordinary button, *Ask for access*, opens the vendor's own request page in a new tab
when the account the portal shows is not yet approved, with that account name in the page's address
so the form is filled in; it is a link the person clicks, and nothing of the extension runs there.
There is no licence key anywhere in the product: the person's own sign-in to their portal identifies
them, and the extension confirms with the vendor's access service that the account is approved.

## Per-permission justifications (one sentence each, as entered in each dashboard)

| Manifest key | Value | Justification |
|---|---|---|
| `permissions` | `storage` | Remembers the portal hostname you connected, your preferences, your licence acceptance and your statement about each worker's workspace. |
| | `alarms` | Checks your running job no more than once a minute and reconnects after the browser suspends the extension. |
| | `scripting` | Loads the extension's page script on your university portal, and only there, after you connect it, including into the tab you clicked from. |
| | `activeTab` | Lets a click on the icon read the address of the portal tab you clicked from, so it can connect that one site; no install warning. |
| | `sidePanel` (Chrome and Edge builds only) | Opens the job monitor beside your portal tab when you click the icon. |
| `optional_host_permissions` | `["https://*/*"]` | You connect your university's Open OnDemand portal from its own tab; access is requested at that click for that one origin only, and the extension refuses to work until it is granted. |
| `host_permissions` | none | |
| `action` (no `default_popup`) | | A click on the icon runs the steps above and opens the panel; there is no popup. |
| `options_ui` | the setup page | The agreement, your portal (connect by address or disconnect), the statement about where your work goes, the settings (shell host, site profile, worker permission mode, "start my worker when I open my portal" and "open claude.ai when my worker connects", both on by default in the current build and each explained where it is switched), the audit log with its export, and the optional Google Drive step. It opens on install. |
| Never requested | `cookies`, `tabs`, `webRequest`, `webRequestBlocking`, `declarativeNetRequest`, `nativeMessaging`, `debugger`, `identity`, `clipboardRead`; any `claude.ai`, `anthropic.com` or `claude.com` origin | Stated in the negative in the listing and in PRIVACY.md. |

The wildcard in `optional_host_permissions` is what triggers in-depth review at Chrome; the
justification above and the visible refusal to work before a host is granted are the answer to it.

## Remote code

Answer: **No.** No `eval`, no `new Function`, no fetched scripts, no interpreter for remote commands.
The daily kill-list is a JSON document verified with WebCrypto against a key compiled into the bundle;
JSON and CSS are data under Chrome's remote-hosted-code rule. The content security policy is the MV3
default with no remote script sources. Commands to the cluster are a small, declarative vocabulary
interpreted by shipped code; the marker lines the cluster prints during the sign-in sitting are
parsed as text and never executed, and the one address they carry is opened only when it is an https
address on claude.ai or claude.com.

## Payment

No payment gates any function of the Trial Edition, so the "payment required" disclosure that Chrome
and Mozilla ask for where payment gates functionality is NOT used. The listing says instead:

> Free. Approval of your institutional account by the maintainer is required (ask on the request page;
> there is no key and nothing to paste); no payment is taken, nothing converts into a paid licence, and
> no charge follows the end of the evaluation period (agreement, section 3(c)). A paid Full Edition, if
> ever offered, would be a separate agreement.

On Safari the sentence is not used: Apple's Guideline 3.1.1 forbids an app from unlocking features
outside Apple's own purchase system. Version 4.0.0 has no key and takes no payment; whether an
approval-gated free edition passes as it is has not been asked of Apple, and the fallback is a free
edition or an in-app purchase inside the host app.

## Privacy-practices answers, per store

What leaves the device towards the vendor in 4.0.0 (decided 2026-09-29; the built bundle in
`extension/.output/` is to be read once more for every `fetch`, `WebSocket` and `tabs.create` before
submission): (1) the approval check, a `POST` without cookies to the `access_check` address named in
`https://openspineconsortium.com/ashley/services.json`, carrying the institutional account name the
portal's dashboard shows for the signed-in session (never a typed one), the portal's hostname, the
product (`bridge`) and the version, answered yes or no; made only after acceptance and once the portal
is connected, on each icon click and once a day (a yes is kept 24 h, up to 7 days when the service is
unreachable; a no 10 minutes); the vendor records the check with the time, a salted hash of the
network address and the answer. (2) One request a day each for `services.json` (the service address)
and the signed withdrawn-versions list at `https://openspineconsortium.com/ashley/bridge-killlist.json`
(`src/licensing/killlist.ts`), sent with `credentials: 'omit'`; they carry nothing about the person
beyond the network address any web request carries. There is no licence key and no activation
request. There are no error or crash reports and no usage data: the code has none and no address to
send them to. Every other request goes to the one portal origin the person granted, from the page
script on that origin, with the browser carrying the portal cookie (never read). The extension opens,
in a new tab and with no code of its own on them, the portal's own pages, Anthropic's sign-in page
(only an https address on claude.ai or claude.com, printed by the sitting), the session's
`https://claude.ai/code?environment=...` link, `https://claude.ai/settings/connectors`, and, from the
*Ask for access* button, the vendor's request page with the account name in its address. What stays
on the device: portal hostname and granted origin, preferences, the acceptance record, the account
name the portal showed and the last approval answer with its time, the service address, the
statement made about each worker's workspace, the notes the extension keeps so its automatic steps do
not repeat (the last sign-in it saw with the account and plan Claude Code reported, the session links
it opened, the check job and install it ran), the audit log, the last good kill-list, a random
installation identifier and the ticks on optional checklist steps; for the browser session only, the
job id, the session name and its claude.ai link, the tab the icon was clicked from and the last check
results (the same list as `PRIVACY.md`, version 5). What passes through and is never kept: the one-time code the person
pastes to sign in to Claude, typed once into their own cluster shell; the audit log holds one line for
the sitting with the counts of bytes read and typed, never the text. What is never collected: command
text, file paths, prompts, job output,
portal cookies or tokens, browsing activity, anything from claude.ai or any Anthropic page, the
clipboard. Chrome requires the privacy policy and in-product disclosure even for data processed only
locally, so the setup page discloses the local items too and takes an affirmative click before first
use.

### Chrome Web Store (Privacy practices tab)

| Field | Answer |
|---|---|
| Single purpose | as above |
| Permission justifications | as above, one sentence each |
| Remote code | No |
| Data collected: personally identifiable information | Yes: the institutional account name your portal shows for you, sent to the developer's access service in the approval check (with the portal's hostname, the product and the version) to answer whether that account is approved; when you connect, when you click the icon and about once a day; used for nothing else |
| Data collected: authentication information | No (the portal cookie is never read; no Claude credential is handled; the one-time sign-in code the person pastes is relayed once to their own cluster shell and neither stored nor transmitted to the developer) |
| Data collected: personal communications | No |
| Data collected: website content | No |
| Data collected: web history | No |
| Data collected: user activity | No (there are no crash or error reports and no usage data in the code) |
| Data collected: location, financial, health | No |
| Certifications | Not sold to third parties outside approved use cases; not used or transferred for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending |
| Privacy policy URL | `https://openspineconsortium.com/ashley/bridge/privacy.html` (PRIVACY.md, version 5) |
| Limited Use statement on the website | "Ashley Bridge's use of information received from your browser complies with the Chrome Web Store User Data Policy, including the Limited Use requirements." |

### Edge Add-ons (Partner Center, Privacy page)

| Field | Answer |
|---|---|
| Single purpose | as above |
| Permission justification | as above |
| Are you using remote code? | No |
| Does this extension access, collect, transmit or use personal information? | Yes: the institutional account name the portal shows, transmitted to the developer's access service in the approval check (with the portal hostname, product and version) to learn whether that account is approved; nothing else (the privacy policy says what and why) |
| Data usage certification | same categories and answers as Chrome |
| Privacy policy URL | `https://openspineconsortium.com/ashley/bridge/privacy.html` |
| Test credentials or explanation | the reviewer-access plan below (no university account can be issued) |
| Update channel | Partner Center only; no self-update |

### Firefox Add-ons (AMO)

| Item | Answer |
|---|---|
| `browser_specific_settings.gecko.data_collection_permissions` | `{ "required": ["personallyIdentifyingInfo"] }` (set in `wxt.config.ts` on 2026-09-29 for 4.0.0). The approval check sends the vendor the institutional account name the portal shows, with the portal hostname, product and version, to learn whether that account is approved. Nothing else: no activation request and no error, crash or usage reports (so no `technicalAndInteraction`); the daily GETs of `services.json` and the withdrawn-versions list carry no data. Version 3.0.0 declared `["none"]`, true of a build that checked a licence key inside the browser; it was never uploaded to AMO (a listing submitted with `none` could not be corrected by a new upload alone). If anything else is ever sent, the declaration, PRIVACY.md and this table change together |
| Source code | the zip from `wxt zip -b firefox` plus build instructions (`README` in `extension/`: exact Node version, `npm ci`, the build command); the bundle is minified for size only, never obfuscated |
| Payment disclosure | the payment sentence above in the listing |
| Testing information | the reviewer-access plan below |
| Distribution | listed, or unlisted-signed XPI for a single campus; the same policies apply either way |
| Icon click | `browser_action` with no popup; the click opens the sidebar (`sidebar_action`) and runs the steps |

### Apple (App Store privacy labels, Safari edition)

| Label | Answer |
|---|---|
| Identifiers: User ID | Collected, linked to the user, not used for tracking: the institutional account name the portal shows, sent in the approval check to learn whether that account is approved |
| Diagnostics: Crash data | Not collected (no reporting code exists) |
| Usage data, Contacts, Location, Financial, Health, Browsing history, User content | Not collected |
| Tracking | No |
| 5.1.1 consent | the setup page obtains consent before any collection; paid functionality never depends on granting data access |
| 5.1.2 third-party AI disclosure | the setup page and each job start disclose that files, output and the transcript go to Anthropic under the user's own Claude account |
| Privacy policy URL | as above |
| Icon click | Safari has no side panel: the click opens the panel page in a tab and runs the steps |

## Reviewer access

No reviewer at Chrome, Edge, Mozilla or Apple can log into a university's Open OnDemand portal. The
submission therefore includes:

1. A public mock portal (`https://mock-ood.<vendor domain>/`) that serves the same routes the extension
   uses (`extension/mock-ood/server.mjs`): `GET /pun/sys/dashboard/` (200 HTML with the csrf meta tag;
   `--cold` answers the first request with the `/nginx/init` redirect and `--cold-pun MS` answers the
   first request after an idle spell with the 500 "Error: Server Error" page, as the live portal did,
   so the warm-up is visible), `GET /pun/sys/shell/ssh/default` with a `csrf=` script and a WebSocket
   that echoes a prompt, accepts one `sbatch --parsable` line and plays a stand-in sign-in sitting
   (`hpcworker claude login --plain` prints the framework's lines; its `AUTH-URL:` is an authorize
   link on claude.ai with a mock client id, which the extension opens as it would the real one and
   Anthropic's page declines; any six characters typed into the box end the sitting with `SIGNED-IN`,
   and `MOCK_LOGIN_FAIL=1` shows the failure sentence instead), `GET`/`PUT
   /pun/sys/dashboard/files/fs/...` backed by a sandbox directory (a download of a missing file answers
   200 with an HTML page, as the real Files app does), and `GET /pun/sys/dashboard/activejobs.json`. It
   runs no scheduler and reaches no cluster; it exists so a reviewer can click the icon on the mock's
   tab, grant the one origin, watch the steps run and see a fake job go from starting to online. The
   mock's username `st1234` is on the approved list of the live access service, so the approval check
   answers yes for it and the reviewer has nothing to paste.
2. A recorded walk-through (under five minutes) of the same flow against the mock portal, and a second
   recording against a real portal with the hostname blurred, so the reviewer sees what a student sees,
   including the sign-in step with the pasted code blurred.
3. Reviewer notes stating the negatives: no claude.ai access, no credential handling (the pasted code
   is relayed once and not kept), no remote code, the two kinds of external page it opens and that it
   runs nothing on them, and the exact host and permission list a security office can pin with
   `ExtensionSettings.runtime_allowed_hosts`.

## Negative statements (listing text, privacy policy and reviewer notes, verbatim)

- Ashley Bridge has no access to claude.ai or any Anthropic page. It does not run on those sites, does
  not read them and does not change them. It opens an Anthropic page in a new tab in two cases (the
  sign-in page Claude Code printed during a sitting you started; your session's claude.ai/code link
  when your worker connects) and the connectors settings page for the optional Google Drive step, as
  a bookmark would; nothing of the extension runs there.
- Ashley Bridge never sees your Claude sign-in. You sign in to Claude Code yourself, on Anthropic's own
  page; the one-time code you paste into the extension's box is typed once into your own job's
  terminal on your cluster and is not stored, not logged and not sent anywhere else; the extension
  reads only whether Claude Code says it is signed in.
- Ashley Bridge runs no code it did not ship with. Its daily update check downloads a signed list, not
  a program.
- Ashley Bridge works with one website: the Open OnDemand portal you connect. It requests access to
  that site when you click its icon on that site's tab, and to nothing else. Its only other requests
  go to the maintainer: the approval check, which sends the account name your portal shows for you,
  your portal's address, the product name and its version, so the maintainer's access service can
  answer whether that account is approved; and a daily download, from the maintainer's website, of
  that service's address and the signed list of withdrawn versions, which carries nothing about you.
- Ashley Bridge does not read your portal cookie and does not sign in for you. When your portal asks
  for a sign-in, the extension asks you to sign in in a tab. There is no key and nothing to paste:
  your institution's own sign-in identifies you.
- Ashley Bridge sends its maintainer no usage data, no error reports and no activation request; the
  approval check is the only thing it sends about you. Its audit log of what it asked your portal
  never contains what you typed to sign in and is never transmitted.

## The 13-item checklist

| # | Item | Chrome Web Store | Edge Add-ons | Firefox AMO | Apple | Owner | Status |
|---|---|---|---|---|---|---|---|
| 1 | Single-purpose statement, as above; must not read as two products | required | required | implicit | implicit | maintainer | drafted above; already the `description` in `extension/package.json` and `wxt.config.ts` |
| 2 | Per-permission justification, one sentence each | Privacy practices tab | Partner Center Privacy page | reviewer notes | App Review notes | maintainer | drafted above (revised 2026-09-29 for the icon click and the options page) |
| 3 | Remote code "No"; no `eval`, no fetched scripts; kill-list is JSON; the sign-in marker lines are parsed, never executed | required | required | required | 2.5.2 | extension stream | to verify in the built bundle (`.output/`) |
| 4 | Privacy policy URL and data-use certifications; in-product disclosure and affirmative consent before first use, even for on-device data | required | required | required | 5.1.1 labels | maintainer + extension stream | root `PRIVACY.md` (version 5: no keys; the approval check is the one thing sent about the person) and `LICENSE.txt` (version 4: approval and withdrawal, no keys) written 2026-09-29 for 4.0.0; the policy URL is `https://openspineconsortium.com/ashley/bridge/privacy.html`; `extension/public/LICENSE.txt` and `PRIVACY.md` must be byte-identical copies of the root files at build time (the build's `sync-framework` step copies them) and `TERMS_VERSION` in `extension/src/core/terms.ts` is 4 to match (the framework's `VERSION` is 2); setup page exists |
| 5 | "Payment required for full functionality" and the trial sentence in the listing | required | required | required ("Listings must disclose when payment is required") | 3.1.1: no key and no payment in 4.0.0; whether an approval-gated free edition passes as it is has not been asked of Apple | maintainer | drafted above (revised for 4.0.0: approval, no key) |
| 6 | Readable, unobfuscated bundle; Firefox source zip with build instructions (`wxt zip -b firefox`) | minification allowed | no obfuscation | source required | | extension stream | `npm run zip` defined; build instructions for the AMO source zip in `extension/README.md` |
| 7 | Reviewer access: public mock portal plus recorded walk-through | recommended | test credentials or explanation required | "testing information" required | review notes | maintainer + extension stream | mock portal exists at `extension/mock-ood/server.mjs` (`npm run mock`, port 8080 by default; the tests start it themselves) with the stand-in sign-in sitting, the cold-PUN 500 and the 200-HTML missing download; not yet hosted publicly; walk-through not recorded |
| 8 | Developer account: two-step verification with a hardware key; no third-party OAuth grants on the account | required | | required | Apple ID 2FA | maintainer | to confirm per account |
| 9 | Distribution channel while private: Unlisted / Hidden / unlisted-signed XPI (same review) | available | available | available | TestFlight or App Store only | maintainer | decision pending |
| 10 | Firefox `data_collection_permissions` declared in the manifest | | | required for new extensions since 2025-11-03 | | extension stream | set in `wxt.config.ts` to `{ "required": ["personallyIdentifyingInfo"] }` on 2026-09-29 for 4.0.0 (the approval check sends the institutional account name; nothing else is collected), replacing the `["none"]` of 3.0.0, which was never uploaded (`strict_min_version` 140, gecko id `ashley-bridge@openspineconsortium.com`); the store kit is in `docs/store/` |
| 11 | Trader status and phone number under the EU DSA if offered in the EU; otherwise geo-restrict to the US | required if EU | | | | maintainer | US only, to set in each dashboard |
| 12 | Safari packaging: `xcrun safari-web-extension-packager` or the App Store Connect packager; Apple Developer Program membership; app record | | | | required | maintainer (needs a Mac) | not started; see MAC_AND_SAFARI.md |
| 13 | Review time budgeted: days to weeks (Chrome), up to seven business days (Edge), up to 24 hours to sign (Firefox), undocumented (Apple) | | | | | maintainer | to schedule after item 7 |

Two things sit behind the checklist and are not store items: the release pipeline (lockfile and
`npm ci`, actions pinned by commit SHA, hosted-builder attestation, reproducible-build instructions, no
long-lived store API key in CI) and the kill-list signing key under hardware-key custody, both in
`SECURITY.md`.
