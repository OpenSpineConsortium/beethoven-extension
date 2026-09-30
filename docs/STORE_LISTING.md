# Store listing and compliance

What the Chrome Web Store will be told, in the words it will be told it, and the checklist that has
to be green before submission. Sources: the report's "Extension architecture and permission
manifest", "Store-compliance checklist", "Stores and universities accept one origin, no credential,
and a signed kill-list", and the browser-platform and security research notes. The product name and
identifier carry no university name and no Anthropic mark: the public name is Beethoven (decided
2026-09-29; a name beginning with Anthropic's mark was set aside because it could draw store and
brand objections), and the listing says, in the same words as every other text, that Beethoven runs
Claude Code and is not an Anthropic product. The repository is `OpenSpineConsortium/beethoven`. The
named publisher is the LLC once it exists; until then, Gregory Schwing, trading as
OpenSpineConsortium.

One store, one listing (decided 2026-09-30 for 8.0.0). Beethoven is offered only as a **Private**
item on the Chrome Web Store, visible to the trusted testers the maintainer names: a Google Group he
keeps with his personal Google account, to which he adds the Google account of each student he
approves for Beethoven. There is no Edge Add-ons, Firefox Add-ons or Safari edition, no signed file
and no download from the website. The code still builds for Firefox (`npm run build`), because
nothing in it depends on the browser; nothing submits that build. Earlier plans for the other stores
are in the history of this file (7.0.0 and before).

## Single-purpose statement

> Start, monitor and stop a Claude Code worker on your university's Open OnDemand cluster and hand
> you its Remote Control link.

It must read as one narrow browser function, not two products. Every permission below maps to a
sentence of it. The listing description also says, in plain words: the extension talks only to the
Open OnDemand portal address you connect; it has no access to claude.ai; it never sees your Claude
sign-in; it runs no code it did not ship with.

## What a click on the icon does (listing text and reviewer notes)

> Click the icon while your university's Open OnDemand portal is open in a tab. The first click asks
> your browser to allow that one site. The extension then wakes the portal up, checks you are signed
> in, points your cluster account at the copy of its scripts your university's lab keeps on the
> cluster if that has not been done, shows you where your work goes and takes your statement about
> it, starts your worker through the portal's own shell, and waits for Claude Code to connect. If
> Claude Code on the cluster is not signed in, the extension opens Anthropic's sign-in page in a new
> tab and asks you to paste the code that page shows into one box; the code is typed once into your
> own job's terminal and not kept. When the worker connects, your session's claude.ai/code page
> opens in a new tab (you can turn that off). The extension has no popup menu: its settings are on
> its options page, and its checks and logs are under "Details" in the panel.

The extension opens two kinds of page outside the portal, always in a new tab and never with any
code of its own on them: your university's portal pages (its dashboard and shell), and Anthropic's
pages (the sign-in page Claude Code printed, and your session's
`https://claude.ai/code?environment=...` link; the optional Google Drive step opens
`https://claude.ai/settings/connectors`). It never reads those pages. One ordinary button, *Ask for
access*, opens the vendor's own request page in a new tab when the account the portal shows is not
yet approved, with that account name in the page's address so the form is filled in; it is a link
the person clicks, and nothing of the extension runs there. There is no licence key anywhere in the
product: the person's own sign-in to their portal identifies them, and the extension confirms with
the vendor's access service that the account is approved and that this installation is the one the
approval is bound to (one approved account, one installation).

## Per-permission justifications (one sentence each, as entered in the dashboard)

| Manifest key | Value | Justification |
|---|---|---|
| `permissions` | `storage` | Remembers the portal hostname you connected, your preferences, your licence acceptance and your statement about each worker's workspace. |
| | `alarms` | Checks your running job no more than once a minute and reconnects after the browser suspends the extension. |
| | `scripting` | Loads the extension's page script on your university portal, and only there, after you connect it, including into the tab you clicked from. |
| | `activeTab` | Lets a click on the icon read the address of the portal tab you clicked from, so it can connect that one site; no install warning. |
| | `sidePanel` | Opens the job monitor beside your portal tab when you click the icon. |
| `optional_host_permissions` | `["https://*/*"]` | You connect your university's Open OnDemand portal from its own tab; access is requested at that click for that one origin only, and the extension refuses to work until it is granted. |
| `host_permissions` | none | |
| `action` (no `default_popup`) | | A click on the icon runs the steps above and opens the panel; there is no popup. |
| `options_ui` | the setup page | The agreement, your portal (connect by address or disconnect), the statement about where your work goes, the settings (shell host, site profile, worker permission mode, "start my worker when I open my portal" and "open claude.ai when my worker connects", both on by default in the current build and each explained where it is switched), the audit log with its export, and the optional Google Drive step. It opens on install. |
| Never requested | `cookies`, `tabs`, `webRequest`, `webRequestBlocking`, `declarativeNetRequest`, `nativeMessaging`, `debugger`, `identity`, `clipboardRead`; any `claude.ai`, `anthropic.com` or `claude.com` origin | Stated in the negative in the listing and in PRIVACY.md. |

The wildcard in `optional_host_permissions` is what triggers in-depth review at Chrome; the
justification above and the visible refusal to work before a host is granted are the answer to it. A
Private item is reviewed like a public one.

## Remote code

Answer: **No.** No `eval`, no `new Function`, no fetched scripts, no interpreter for remote
commands. The daily kill-list is a JSON document verified with WebCrypto against a key compiled into
the bundle; JSON and CSS are data under Chrome's remote-hosted-code rule. The content security
policy is the MV3 default with no remote script sources. Commands to the cluster are a small,
declarative vocabulary interpreted by shipped code; the marker lines the cluster prints during the
sign-in sitting are parsed as text and never executed, and the one address they carry is opened only
when it is an https address on claude.ai or claude.com. The bundle is Vite's minified output, never
obfuscated (Chrome's rules allow the first and forbid the second).

## Payment

No payment gates any function of the Trial Edition, so the "payment required" disclosure is NOT
used. The listing says instead:

> Free. Approval of your institutional account by the maintainer is required (ask on the request
> page; there is no key and nothing to paste); no payment is taken, nothing converts into a paid
> licence, and no charge follows the end of the evaluation period (agreement, section 3(c)). A paid
> Full Edition, if ever offered, would be a separate agreement.

## Privacy-practices answers

What leaves the device towards the vendor since 4.0.0 (decided 2026-09-29; in 7.0.0 only the
addresses changed; 8.0.0 adds the installation identifier to the check; the built bundle in
`extension/.output/` is to be read once more for every `fetch`, `WebSocket` and `tabs.create` before
submission): (1) the approval check, a `POST` without cookies to the `access_check` address named in
`https://openspineconsortium.com/beethoven/services.json` (the service's host is
`beethoven-access.openspineconsortium.workers.dev`), carrying the institutional account name the
portal's dashboard shows for the signed-in session (never a typed one), the portal's hostname, the
product (`bridge`), the version and the installation identifier (32 random hexadecimal characters
the extension makes for itself when the agreement is accepted, from the browser's random number
generator and nothing about the device), answered yes or no, a no with a reason when the account is
bound to another installation, the installation to another account, or the build is too old; made
only after acceptance and once the portal is connected, on each icon click and once a day (a yes is
kept 24 h, up to 7 days when the service is unreachable; a no 10 minutes); the vendor records the
check with the time, a salted hash of the network address and the answer, and keeps, per approved
account, the installation it is bound to with its first and last check, and a count of refused
checks from other installations or for other accounts. (2) One request a day each for
`services.json` (the service address) and the signed withdrawn-versions list at
`https://openspineconsortium.com/beethoven/killlist.json` (`src/licensing/killlist.ts`), sent with
`credentials: 'omit'`; they carry nothing about the person beyond the network address any web
request carries. There is no licence key and no activation request. There are no error or crash
reports and no usage data: the code has none and no address to send them to. Every other request
goes to the one portal origin the person granted, from the page script on that origin, with the
browser carrying the portal cookie (never read). The extension opens, in a new tab and with no code
of its own on them, the portal's own pages, Anthropic's sign-in page (only an https address on
claude.ai or claude.com, printed by the sitting), the session's
`https://claude.ai/code?environment=...` link, `https://claude.ai/settings/connectors`, and, from
the *Ask for access* button, the vendor's request page with the account name in its address. What
stays on the device: portal hostname and granted origin, preferences, the acceptance record, the
account name the portal showed and the last approval answer with its time, the service address, the
statement made about each worker's workspace, the notes the extension keeps so its automatic steps
do not repeat (the last sign-in it saw with the account and plan Claude Code reported, the session
links it opened, the check job and install it ran), the audit log, the last good kill-list, the
installation identifier and the ticks on optional checklist steps; for the browser session only, the
job id, the session name and its claude.ai link, the tab the icon was clicked from and the last
check results (the same list as `PRIVACY.md`, version 8). What passes through and is never kept: the
one-time code the person pastes to sign in to Claude, typed once into their own cluster shell; the
audit log holds one line for the sitting with the counts of bytes read and typed, never the text.
What is never collected: command text, file paths, prompts, job output, portal cookies or tokens,
browsing activity, anything from claude.ai or any Anthropic page, the clipboard, any hardware
address or other identifier read from the device. Chrome requires the privacy policy and in-product
disclosure even for data processed only locally, so the setup page discloses the local items too and
takes an affirmative click before first use.

The request page on the website (not the extension) also collects, for the maintainer's decision:
the Google account the invitation goes to, what the person will use Beethoven for, an optional CV
and, when mailbox confirmation is on, the time the person confirmed their university mailbox. That
is the website's data, described in `PRIVACY.md` beside the extension's, and none of it is a store
answer.

### Chrome Web Store (Privacy practices tab)

| Field | Answer |
|---|---|
| Single purpose | as above |
| Permission justifications | as above, one sentence each |
| Remote code | No |
| Data collected: personally identifiable information | Yes: the institutional account name your portal shows for you and the random identifier of this installation, sent to the developer's access service in the approval check (with the portal's hostname, the product and the version) to answer whether that account is approved and whether this is the installation the approval is bound to; when you connect, when you click the icon and about once a day; used for nothing else |
| Data collected: authentication information | No (the portal cookie is never read; no Claude credential is handled; the one-time sign-in code the person pastes is relayed once to their own cluster shell and neither stored nor transmitted to the developer) |
| Data collected: personal communications | No |
| Data collected: website content | No |
| Data collected: web history | No |
| Data collected: user activity | No (there are no crash or error reports and no usage data in the code) |
| Data collected: location, financial, health | No |
| Certifications | Not sold to third parties outside approved use cases; not used or transferred for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending |
| Privacy policy URL | `https://openspineconsortium.com/beethoven/privacy.html` (PRIVACY.md, version 8) |
| Limited Use statement on the website | "Beethoven's use of information received from your browser complies with the Chrome Web Store User Data Policy, including the Limited Use requirements." |

## Reviewer access

No reviewer at Chrome can log into a university's Open OnDemand portal. The submission therefore
relies on:

1. The mock portal (`extension/mock-ood/server.mjs`), which a reviewer runs locally with the recipe
   in `store/LISTING.md` and which serves the same routes the extension uses: `GET
   /pun/sys/dashboard/` (200 HTML with the csrf meta tag; `--cold` answers the first request with
   the `/nginx/init` redirect and `--cold-pun MS` answers the first request after an idle spell with
   the 500 "Error: Server Error" page, as the live portal did, so the warm-up is visible), `GET
   /pun/sys/shell/ssh/default` with a `csrf=` script and a WebSocket that echoes a prompt, accepts
   one `sbatch --parsable` line and plays a stand-in sign-in sitting (`hpcworker claude login
   --plain` prints the framework's lines; its `AUTH-URL:` is an authorize link on claude.ai with a
   mock client id, which the extension opens as it would the real one and Anthropic's page declines;
   any six characters typed into the box end the sitting with `SIGNED-IN`, and `MOCK_LOGIN_FAIL=1`
   shows the failure sentence instead), `GET`/`PUT /pun/sys/dashboard/files/fs/...` backed by a
   sandbox directory (a download of a missing file answers 200 with an HTML page, as the real Files
   app does), and `GET /pun/sys/dashboard/activejobs.json`. It runs no scheduler and reaches no
   cluster; it exists so a reviewer can click the icon on the mock's tab, grant the one origin,
   watch the steps run and see a fake job go from starting to online. The mock's username `st1234`
   is on the approved list of the live access service and must be accepted from any installation
   (every reviewer's is a new one), so the approval check answers yes for it and the reviewer has
   nothing to paste; the check is in `store/SUBMISSION.md`, section 0, item 5. The mock is not
   hosted publicly.
2. A recorded walk-through (under five minutes) of the same flow against the mock portal, and a
   second recording against a real portal with the hostname blurred, so the reviewer sees what a
   student sees, including the sign-in step with the pasted code blurred. Not recorded as of
   2026-09-30.
3. Reviewer notes stating the negatives: no claude.ai access, no credential handling (the pasted
   code is relayed once and not kept), no remote code, the two kinds of external page it opens and
   that it runs nothing on them, and the exact host and permission list a security office can pin
   with `ExtensionSettings.runtime_allowed_hosts`.

## Negative statements (listing text, privacy policy and reviewer notes, verbatim)

- Beethoven has no access to claude.ai or any Anthropic page. It does not run on those sites, does
  not read them and does not change them. It opens an Anthropic page in a new tab in two cases (the
  sign-in page Claude Code printed during a sitting you started; your session's claude.ai/code link
  when your worker connects) and the connectors settings page for the optional Google Drive step, as
  a bookmark would; nothing of the extension runs there.
- Beethoven never sees your Claude sign-in. You sign in to Claude Code yourself, on Anthropic's own
  page; the one-time code you paste into the extension's box is typed once into your own job's
  terminal on your cluster and is not stored, not logged and not sent anywhere else; the extension
  reads only whether Claude Code says it is signed in.
- Beethoven runs no code it did not ship with. Its daily update check downloads a signed list, not
  a program.
- Beethoven works with one website: the Open OnDemand portal you connect. It requests access to
  that site when you click its icon on that site's tab, and to nothing else. Its only other requests
  go to the maintainer: the approval check, which sends the account name your portal shows for you,
  your portal's address, the product name and its version, and the random identifier of this
  installation, so the maintainer's access service can answer whether that account is approved and
  whether this is the installation it is approved on; and a daily download, from the maintainer's
  website, of that service's address and the signed list of withdrawn versions, which carries
  nothing about you.
- Beethoven does not read your portal cookie and does not sign in for you. When your portal asks
  for a sign-in, the extension asks you to sign in in a tab. There is no key and nothing to paste:
  your institution's own sign-in identifies you.
- Beethoven sends its maintainer no usage data, no error reports and no activation request; the
  approval check is the only thing it sends about you. Its audit log of what it asked your portal
  never contains what you typed to sign in and is never transmitted.

## The checklist

| # | Item | Chrome Web Store | Owner | Status |
|---|---|---|---|---|
| 1 | Single-purpose statement, as above; must not read as two products | required | maintainer | drafted above; already the `description` in `extension/package.json` and `wxt.config.ts` |
| 2 | Per-permission justification, one sentence each | Privacy practices tab | maintainer | drafted above (revised 2026-09-29 for the icon click and the options page) |
| 3 | Remote code "No"; no `eval`, no fetched scripts; kill-list is JSON; the sign-in marker lines are parsed, never executed | required | extension stream | to verify in the built bundle (`.output/`) |
| 4 | Privacy policy URL and data-use certifications; in-product disclosure and affirmative consent before first use, even for on-device data | required | maintainer + extension stream | root `PRIVACY.md` (version 8) and `LICENSE.txt` (version 7), amended 2026-09-30 for 8.0.0: the shared copy only, one installation per approved account with the installation identifier in the approval check, the request page's Google account, purpose and optional CV, and the private listing as the only channel; the policy URL is `https://openspineconsortium.com/beethoven/privacy.html`; `extension/public/LICENSE.txt` and `PRIVACY.md` must be byte-identical copies of the root files at build time (`scripts/sync-profiles.mjs` copies them, and the build refuses a `LICENSE.txt` whose version line disagrees with `TERMS_VERSION` 7 in `extension/src/core/terms.ts`); setup page exists |
| 5 | The free-with-approval sentence in the listing; no "payment required" | required | maintainer | drafted above |
| 6 | Readable, unobfuscated bundle | minification allowed, obfuscation forbidden | extension stream | Vite's minified output, no source map; `extension/test/hygiene.test.ts` checks the built package |
| 7 | Reviewer access: the mock portal recipe, the reviewer account accepted from any installation, a recorded walk-through | recommended | maintainer + extension stream | mock portal exists at `extension/mock-ood/server.mjs` (`npm run mock`, port 8080 by default; the tests start it themselves) with the stand-in sign-in sitting, the cold-PUN 500 and the 200-HTML missing download; not hosted publicly; walk-through not recorded; the reviewer account's exemption from the one-installation rule is the access service's to provide (to confirm with the check in `store/SUBMISSION.md`) |
| 8 | Developer account: two-step verification with a hardware key; no third-party OAuth grants on the account | required | maintainer | to confirm |
| 9 | Distribution: Visibility Private, trusted testers = the Google Group of approved students | Distribution tab | maintainer | decided 2026-09-30; whether the trusted-testers field takes a group address for a personal developer account is to be seen in the dashboard (`store/SUBMISSION.md`, section 1) |
| 10 | Trader status under the EU DSA if offered in the EU; otherwise geo-restrict to the US | required if EU | maintainer | US only, to set in the dashboard |
| 11 | Review time budgeted: days to weeks (a wildcard optional host permission and a new developer account put the item into in-depth review) | | maintainer | to schedule after item 7 |

Two things sit behind the checklist and are not store items: the release pipeline (lockfile and `npm
ci`, actions pinned by commit SHA, hosted-builder attestation, reproducible-build instructions, no
long-lived store API key in CI) and the kill-list signing key under hardware-key custody, both in
`SECURITY.md`.
