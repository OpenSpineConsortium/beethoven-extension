# Store listing texts, per store

The exact texts to paste into each store's dashboard for Ashley Bridge 5.0.0, and the answers to
each store's questions. Written 2026-09-29 from the decision for 4.0.0 (no licence keys; approval
of the account the portal shows, confirmed with the access service), `PRIVACY.md` version 5 and
`LICENSE.txt` version 4, and brought up to date for 5.0.0 the same evening (the cluster-side tool may
be one copy that the university's lab keeps for all its students); before anything is pasted, read
the built extension (`extension/.output/`) once more for every `fetch`, `WebSocket` and
`tabs.create` and confirm the facts below.
`SUBMISSION.md` beside this file says where each text goes, click by click. `../STORE_LISTING.md`
is the longer compliance document these texts come from.

Facts every text below rests on:

- The extension makes requests to three places only. (1) The student's own Open OnDemand portal,
  from the page script on the one origin the student granted, with the browser attaching the
  portal's session cookie as it does for the portal's own pages; the extension never reads that
  cookie. (2) The maintainer's access service, at the `access_check` address named in
  `https://openspineconsortium.com/ashley/services.json`: the approval check, a POST sent without
  cookies, carrying the account name the portal's dashboard shows for the signed-in session (never a
  typed one), the portal's hostname, the product (`bridge`) and the version, answered yes or no. It
  is made only after the agreement is accepted and the portal is connected: when the portal
  connects, about once a day, and on an icon click after a no or once the last yes is a day old; a
  yes is kept 24 h (up to 7 days when the service is unreachable), a no 10 minutes.
  (3) `https://openspineconsortium.com/ashley/services.json` and
  `https://openspineconsortium.com/ashley/bridge-killlist.json`, once a day each, GETs sent without
  cookies for the service address and the signed list of withdrawn versions; they carry no data
  about the person.
- It opens pages in new tabs and runs nothing on them: the portal's own pages, Anthropic's sign-in
  page (only an https address on claude.ai or claude.com, printed by the sign-in sitting), the
  session's `https://claude.ai/code?environment=...` link, `https://claude.ai/settings/connectors`,
  and, from the *Ask for access* button, the maintainer's request page with the account name in its
  address.
- The cluster-side tool (the framework: shell and Python) is set up for the student's account in one
  of two ways, both through the portal only. Where the site profile bundled with the extension names
  a shared copy that the university's lab keeps on the cluster (Wayne State's does), one install line
  typed into the portal's shell points the account at that copy: nothing is uploaded, and the
  extension reads that copy's version file through the Files app. Elsewhere the extension uploads its
  bundled copy through the Files app and runs one install line from it. The mock portal in the
  reviewer recipe starts with a stand-in for the tool already set up in the account, so neither
  way runs there.
- There is no licence key, no activation request, no error or crash reporting and no usage data: the
  code has none. The person's own sign-in to the portal identifies them; nothing is typed or pasted.
- Fixed public URLs: landing `https://openspineconsortium.com/ashley/bridge/`, privacy
  `https://openspineconsortium.com/ashley/bridge/privacy.html`, terms
  `https://openspineconsortium.com/ashley/bridge/terms.html`, support
  `https://openspineconsortium.com/ashley/support.html`, request page
  `https://openspineconsortium.com/ashley/request.html`.
- The store packages are `extension/.output/ashley-bridge-5.0.0-chrome.zip` (Chrome Web Store and
  Edge Add-ons), `extension/.output/ashley-bridge-5.0.0-firefox.zip` (Firefox) and
  `extension/.output/ashley-bridge-5.0.0-sources.zip` (the source upload Firefox requires).
- Publisher, until the LLC exists: Gregory Schwing, trading as OpenSpineConsortium. The product
  name and identifier carry no university name.

## Texts shared by every store

### Name

```
Ashley Bridge
```

### Short description (the manifest `description`; 125 characters; Chrome and Edge take it from the package)

```
Start, monitor and stop a Claude Code worker on your university's Open OnDemand cluster and hand you its Remote Control link.
```

### Detailed description (plain text; 4,726 characters; under every store's limit: Chrome 16,000, Edge 10,000)

```
Ashley Bridge starts, watches and stops a Claude Code worker in your own account on your university's cluster, through the Open OnDemand portal you already use, and hands you the link that shows that worker at claude.ai/code and in the Claude app (Anthropic's Remote Control feature).

WHAT YOU NEED
- An account on a cluster with an Open OnDemand portal (version 3 or 4, with its Shell and Files apps).
- Your own Claude account on a plan that includes Claude Code Remote Control (Pro or Max).
- Approval of your cluster account by the maintainer. The Trial Edition is free for approved institutional accounts; ask for access at https://openspineconsortium.com/ashley/request.html with the account name your portal shows for you. Once you are approved the extension just works: there is no key and nothing to paste.

HOW IT WORKS
1. Open your portal in a tab and sign in as usual.
2. Click the Ashley Bridge button on that tab. The first click asks your browser to allow that one site. The panel then does the steps by itself and says what it is doing: it wakes the portal up, checks you are signed in, confirms your account is approved, sets up its small set of scripts for your cluster account if they are not there (where your university's lab keeps one shared copy, it points your account at that copy), runs one short check job on a compute node, shows you where your work goes and takes your statement about it, starts your worker through the portal's own shell, and waits for Claude Code to connect.
3. Sign in to Claude once, when the panel asks. It opens Anthropic's sign-in page in a new tab; you sign in with your own account, click Authorize, and paste the code the page shows into the panel's one box. The code is typed once into your own job's terminal and is not kept.

When your worker connects, your session's claude.ai page opens in a new tab (you can turn that off), and the panel shows a green "Open in Claude" button for later. The worker stays on by itself until you press Stop.

WHAT IT NEVER DOES
- It has no access to claude.ai or any Anthropic page: it runs no code there, reads nothing there and changes nothing there. It only opens those pages in a new tab, as a bookmark would.
- It never sees your Claude sign-in. You sign in on Anthropic's own page; the one-time code you paste is passed once to your own cluster shell and is not stored, not logged and not sent anywhere else.
- It works with one website: the Open OnDemand portal you connect. It asks for access to that site when you click its button on that site's tab, and to nothing else. Its only other requests go to the maintainer: the approval check, which sends the account name your portal shows for you, your portal's address, the product name and its version, so the maintainer's access service can answer whether that account is approved; and a daily download of that service's address and the signed list of withdrawn versions, which carries nothing about you.
- It does not read your portal cookie and does not sign in for you. When your portal asks for a sign-in, the panel asks you to sign in in a tab. There is no key and nothing to paste: your institution's own sign-in identifies you.
- It runs no code it did not ship with. Its once-a-day update check downloads a signed list of withdrawn versions, not a program.
- It sends the maintainer no usage data, no error reports and no activation request. The approval check is the only thing it sends about you.
- It never deletes your files. It removes only its own state files and cancels only the job it started.

WHAT IT KEEPS
On your device only: the portal address you connected, your preferences, your acceptance of the agreement, the account name your portal shows and the last approval answer, your statement about each workspace, and an audit log of every request it made to your portal, which you can read, export and clear. Privacy statement: https://openspineconsortium.com/ashley/bridge/privacy.html

ACCESS AND TERMS
Ashley Bridge is licensed, not sold, and works only from an institutional account the maintainer has approved. The Trial Edition is free for approved institutional accounts and ends by itself; nothing converts into a paid licence and no payment details are taken. A paid Full Edition, if offered later, is a separate agreement. Terms: https://openspineconsortium.com/ashley/bridge/terms.html  Support: https://openspineconsortium.com/ashley/support.html

Ashley Bridge runs Claude Code and is not an Anthropic product; "Claude" is Anthropic's mark. "Open OnDemand" is the mark of its publisher. Ashley Bridge is not provided by or on behalf of any university. It is a research and teaching tool, not a medical device. Offered in the United States.
```

### Single-purpose statement

```
Start, monitor and stop a Claude Code worker on your university's Open OnDemand cluster and hand you its Remote Control link.
```

### Permission justifications (one sentence each, as each dashboard asks for them)

| Permission | Justification |
|---|---|
| `storage` | Remembers the portal address you connected, your preferences, your acceptance of the agreement, the account name your portal shows with the last approval answer, and your statement about each worker's workspace, all on your device. |
| `alarms` | Reads your running job's status files no more than once a minute, renews the approval check and fetches the signed withdrawn-versions list once a day, and keeps doing so after the browser suspends the extension. |
| `scripting` | Loads the extension's page script on your university portal, and only there, after you connect it, including into the portal tab that is already open. |
| `activeTab` | Lets a click on the toolbar button read the address of the portal tab you clicked from, so the extension can ask you to allow that one site; nothing is read from any other tab. |
| `sidePanel` (Chrome and Edge package only) | Opens the extension's panel beside your portal tab when you click the toolbar button; there is no popup. |
| Optional host permission `https://*/*` (requested at runtime for one origin) | Your university's Open OnDemand portal has an address the extension cannot know in advance; when you click the button on that portal's tab, the extension asks the browser for that one origin only, and it refuses to work until that one site is granted. It never requests a claude.ai, anthropic.com or claude.com origin. |

Never requested: `cookies`, `tabs`, `webRequest`, `webRequestBlocking`, `declarativeNetRequest`,
`nativeMessaging`, `debugger`, `identity`, `clipboardRead`; any install-time host permission.

### Remote code

Answer: **No.** Justification if a field asks for one:

```
No remote code. No eval, no new Function, no fetched scripts, no interpreter for remote commands. The daily update check downloads one JSON document (a signed list of withdrawn versions) and verifies its Ed25519 signature with WebCrypto against a public key compiled into the package; JSON is data. Commands to the cluster are a small fixed vocabulary interpreted by shipped code, and the lines the cluster prints during the sign-in are parsed as text and never executed. Where a university keeps one shared copy of the cluster-side tool, the extension runs that copy in the user's own cluster account through the portal's shell, as it runs its bundled copy elsewhere; nothing from the cluster is ever executed in the browser.
```

### Privacy practices (the same answers in every store's words)

| Question | Answer |
|---|---|
| Does the extension collect or transmit user data to the developer? | Yes, one item of personal information: the institutional account name your portal shows for you, sent to the developer's access service in the approval check (with the portal's hostname, the product and the version) to answer whether that account is approved, when you connect, when you click the icon and about once a day. Nothing else: no authentication information, no communications, no website content, no browsing history, no user activity, no location, no financial or health data. The two daily GETs of the developer's services file and signed withdrawn-versions list carry no data. |
| Is a privacy policy provided? | Yes: https://openspineconsortium.com/ashley/bridge/privacy.html (it names the approval check, what the developer records from it, and what the extension keeps on the device: settings, the account name and last answer, an acceptance record and an audit log). |
| Certifications (Chrome's three) | I do not sell or transfer user data to third parties outside the approved use cases; I do not use or transfer user data for purposes unrelated to the item's single purpose; I do not use or transfer user data to determine creditworthiness or for lending purposes. |
| Limited Use statement (on the landing page) | Ashley Bridge's use of information received from your browser complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. |

### The negative statements (listing, privacy policy and reviewer notes, verbatim)

```
- Ashley Bridge has no access to claude.ai or any Anthropic page. It does not run on those sites, does not read them and does not change them. It opens an Anthropic page in a new tab in two cases (the sign-in page Claude Code printed during a sitting you started; your session's claude.ai/code link when your worker connects) and the connectors settings page for the optional Google Drive step, as a bookmark would; nothing of the extension runs there.
- Ashley Bridge never sees your Claude sign-in. You sign in to Claude Code yourself, on Anthropic's own page; the one-time code you paste into the extension's box is typed once into your own job's terminal on your cluster and is not stored, not logged and not sent anywhere else; the extension reads only whether Claude Code says it is signed in.
- Ashley Bridge runs no code it did not ship with. Its daily update check downloads a signed list, not a program.
- Ashley Bridge works with one website: the Open OnDemand portal you connect. It requests access to that site when you click its icon on that site's tab, and to nothing else. Its only other requests go to the maintainer: the approval check, which sends the account name your portal shows for you, your portal's address, the product name and its version, so the maintainer's access service can answer whether that account is approved; and a daily download, from the maintainer's website, of that service's address and the signed list of withdrawn versions, which carries nothing about you.
- Ashley Bridge does not read your portal cookie and does not sign in for you. When your portal asks for a sign-in, the extension asks you to sign in in a tab. There is no key and nothing to paste: your institution's own sign-in identifies you.
- Ashley Bridge sends its maintainer no usage data, no error reports and no activation request; the approval check is the only thing it sends about you. Its audit log of what it asked your portal never contains what you typed to sign in and is never transmitted.
```

### URLs

| Field | Value |
|---|---|
| Homepage / website | `https://openspineconsortium.com/ashley/bridge/` |
| Privacy policy | `https://openspineconsortium.com/ashley/bridge/privacy.html` |
| Terms (where a store asks, or in the description) | `https://openspineconsortium.com/ashley/bridge/terms.html` |
| Support | `https://openspineconsortium.com/ashley/support.html` |

### Images (all in `extension/store-assets/`, listed in its `manifest.txt`)

| Image | File | Used by |
|---|---|---|
| Store icon 128x128 | `extension/public/icon/128.png` (inside the package too) | Chrome |
| Store logo 300x300 | `edge-store-logo-300x300.png` | Edge (required) |
| Screenshots 1280x800 | `01-agreement-signing-dialog.png`, `02-checks.png`, `03-sign-in-to-claude.png`, `04-worker-online-open-in-claude.png`, `05-setup-page.png` and the `b` variants | Chrome (up to 5), Edge (up to 10), Firefox |
| Small promotional tile 440x280 | `promo-tile-440x280.png` | Chrome (optional), Edge (optional) |
| Marquee / large tile 1400x560 | `marquee-1400x560.png` | Chrome (optional), Edge (optional) |

Suggested order for the five Chrome slots: 04 (online, green button), 03 (sign-in step), 02
(checks), 01 (agreement), 05 (setup page).

## Chrome Web Store

| Field | Text |
|---|---|
| Category | Developer Tools |
| Language | English (United States) |
| Title, Summary | from the package (name and `description` above) |
| Description | the detailed description above |
| Store icon | `extension/public/icon/128.png` |
| Screenshots (1280x800) | the five named above |
| Small promo tile (440x280), Marquee (1400x560) | `promo-tile-440x280.png`, `marquee-1400x560.png` (optional fields) |
| Official URL / Homepage URL | `https://openspineconsortium.com/ashley/bridge/` (the "official" flag needs the domain verified in Google Search Console under the same Google account) |
| Support URL | `https://openspineconsortium.com/ashley/support.html` |
| Mature content | No |
| Single purpose | the single-purpose statement above |
| Permission justification: storage, alarms, scripting, activeTab, sidePanel | the sentences above, one per field |
| Host permission justification | the `https://*/*` sentence above |
| Are you using remote code? | No (with the justification above if the field is shown) |
| Data usage: personally identifiable information | ticked (the institutional account name the portal shows, sent in the approval check; the sentence from the privacy-practices table above) |
| Data usage: every other category | unticked (nothing else is collected or transmitted to the developer) |
| Certifications | the three, ticked |
| Privacy policy URL | `https://openspineconsortium.com/ashley/bridge/privacy.html` |
| Visibility (Distribution) | Unlisted first, then Public (section 1 of `SUBMISSION.md`) |
| Regions | United States only (the terms say "offered in the United States"; this also keeps the EU trader declaration out of the picture) |
| Payments | Free (no in-store payment; the maintainer approves institutional accounts, and the description says so) |

Chrome has no reviewer-notes field on the item. If the review asks for test access, answer with
the text in `SUBMISSION.md`, section 4.

## Edge Add-ons (Partner Center)

| Field | Text |
|---|---|
| Package | `ashley-bridge-5.0.0-chrome.zip` (the same Chromium package) |
| Availability: Visibility | Hidden first (only people with the link can install), then Public |
| Availability: Markets | United States |
| Properties: Category | Developer tools |
| Properties: Privacy policy URL | `https://openspineconsortium.com/ashley/bridge/privacy.html` |
| Properties: Website URL | `https://openspineconsortium.com/ashley/bridge/` |
| Properties: Support contact | `https://openspineconsortium.com/ashley/support.html` |
| Properties: Mature content | No |
| Properties: Does this extension access, collect, transmit or use personal information? | Yes (the institutional account name the portal shows, in the approval check; the privacy policy says what and why) |
| Store listing (English (United States)): Description | the detailed description above |
| Store listing: Short description | the short description above |
| Store listing: Store logo (300x300, required) | `edge-store-logo-300x300.png` |
| Store listing: Screenshots (1280x800, up to 10) | the screenshots above |
| Store listing: Small promotional tile (440x280), Large promotional tile (1400x560) | `promo-tile-440x280.png`, `marquee-1400x560.png` (optional) |
| Store listing: Search terms | `Open OnDemand`, `Claude Code`, `Remote Control`, `HPC`, `cluster`, `Slurm`, `research computing` |
| Notes for certification | the reviewer notes below |

### Reviewer notes (Edge "Notes for certification" and Firefox "Notes to reviewer")

```
Ashley Bridge starts, watches and stops a Claude Code job in the user's own account on their university's cluster, through the Open OnDemand web portal (an open-source portal run by universities), and shows the user the link Claude Code prints when it registers with Anthropic's Remote Control feature.

Why no live test account can be given: the extension works only against a university's Open OnDemand portal, which needs a university account, its VPN and often a second factor. No reviewer can be issued one, and we cannot lend ours (one person, one account is a term of the portal and of Anthropic's service).

What you can do instead: the source package contains a mock portal (mock-ood/server.mjs, Node 22, one dependency) that serves the same routes the extension uses (dashboard, Files, Active Jobs, the Shell WebSocket) with a stand-in scheduler and a stand-in for the cluster-side tool. Recipe:

  1. npm ci && npm run build:firefox          (Firefox; for Chromium: npm run build:chrome)
  2. openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -subj /CN=localhost -days 30 -addext subjectAltName=DNS:localhost
  3. MOCK_LOGGED_IN=false node mock-ood/server.mjs --port 8443 --host localhost --user st1234 --cert cert.pem --key key.pem
  4. Load the built extension (.output/firefox-mv2/manifest.json as a temporary add-on; .output/chrome-mv3 unpacked). Open https://localhost:8443/login , accept the certificate exception, click "Sign in as st1234".
  5. On the extension's setup page (it opens on install): scroll the agreement to its end, tick the four statements, type a name, "Accept and Continue". There is no key and nothing else to enter.
  6. Click the Ashley Bridge toolbar button on the portal tab. The browser asks to allow https://localhost:8443; allow it. The panel then runs the steps by itself: it reads the account name the mock's dashboard shows (st1234), asks our access service whether that account is approved (it is: st1234 is on the approved list for exactly this recipe), reads the mock's files, submits the stand-in check job, opens the sign-in step (the mock prints a real-looking claude.ai authorize link with a mock client id, which Anthropic's page declines: close that tab and type any six letters or digits into the panel's box), asks for the data statement, starts the stand-in worker and shows the green "Open in Claude" button with a claude.ai/code link the stand-in wrote. Under "Details", "Run the checks" runs the extension's seventeen checks against the mock. Run the mock with another --user and the panel's one button becomes "Ask for access", which opens our request page with that name filled in; that is the whole of what an unapproved person sees.

What the extension never does: no code, host permission or content script on claude.ai, anthropic.com or claude.com (it opens those pages in a new tab only); no reading of any Claude credential (the user signs in on Anthropic's page; the one-time code they paste is relayed once to their own cluster shell and kept nowhere); no remote code (the daily update check fetches one signed JSON list and verifies it with WebCrypto); no cookies, tabs, webRequest, nativeMessaging, debugger or identity permission; no install-time host permission (the one portal origin is requested from the click); no licence key and no password of ours (the user's own portal sign-in identifies them). What it sends us: the approval check only (the account name the portal shows, the portal hostname, the product and the version, answered yes or no; we record those with the time, a salted hash of the network address and the answer); no analytics, no error reports, no activation. The only other requests to our site are the daily GETs of https://openspineconsortium.com/ashley/services.json and https://openspineconsortium.com/ashley/bridge-killlist.json without cookies. A campus can pin the extension with browser policy: the host list is the one portal origin the user grants.
```

## Firefox Add-ons (AMO)

| Field | Text |
|---|---|
| Distribution | "On this site" (listed) for the public release; "On your own" (self-distributed, signed .xpi) is the equivalent of Chrome's unlisted channel and passes the same review (section 3 of `SUBMISSION.md`) |
| Package | `ashley-bridge-5.0.0-firefox.zip` (`manifest_version` 2, `strict_min_version` 140.0, id `ashley-bridge@openspineconsortium.com`) |
| Name | Ashley Bridge |
| Add-on URL (slug) | `ashley-bridge` |
| Summary (250 characters at most; this one is 241) | see below |
| Description | the detailed description above |
| Categories (Firefox) | Web Development; Other |
| Support email / Support website | the notice address on the support page / `https://openspineconsortium.com/ashley/support.html` |
| Homepage | `https://openspineconsortium.com/ashley/bridge/` |
| Privacy policy | paste the text of `PRIVACY.md` (version 5); the field is free text, shown on the listing |
| License | Custom license: paste `LICENSE.txt` (version 4); it is not an open-source licence |
| "This add-on requires payment, non-free services or software, or additional hardware" | ticked, with the sentence: "Requires approval of your institutional account by the maintainer, asked for on the maintainer's request page; there is no key. The Trial Edition is free for approved accounts; no payment is taken in this version. It also needs an account on a university cluster with an Open OnDemand portal and the user's own Claude account (Pro or Max)." |
| Data collection (from the manifest) | `data_collection_permissions: { required: ["personallyIdentifyingInfo"] }`; AMO shows it as required data collection, and the privacy policy text names the one item (the institutional account name in the approval check) |
| Source code | Yes, upload `ashley-bridge-5.0.0-sources.zip` with the build note below |
| Notes to reviewer | the reviewer notes above, then the build note below |
| Version notes (5.0.0) | "First store release. No licence key: your own sign-in to your university's portal identifies you, and the extension confirms with the maintainer's access service that your account is approved. The toolbar button runs the steps; the Claude sign-in happens inside the panel through the user's own cluster shell; the worker stays on by itself until stopped. Where your university's lab keeps one shared copy of the cluster-side tool, the extension points your account at it instead of uploading its own." |

### Summary (241 characters)

```
Starts, watches and stops your own Claude Code worker on your university's Open OnDemand cluster and hands you its Remote Control link. Talks to your portal only; nothing runs on claude.ai; your Claude sign-in is never seen by the extension.
```

### Source-code upload note (the sources zip and how to rebuild)

```
Source: ashley-bridge-5.0.0-sources.zip, produced by "npm run zip" (wxt zip -b firefox --mv2). It holds the extension project (package.json, package-lock.json, wxt.config.ts, src/, public/, scripts/, test/, mock-ood/, README.md). public/framework/ holds, as text, the cluster-side scripts the extension uploads to the user's account where the university keeps no shared copy of them (with the site profiles, which say whether it does), and public/LICENSE.txt and public/PRIVACY.md the agreement texts; all three are copied into the package unchanged.

Build (Node 22, npm 10; we used Node 22.23.3):
  npm ci
  npm run build:firefox        # = wxt build -b firefox --mv2 ; output in .output/firefox-mv2

That output is the content of the uploaded package: on 2026-09-29 a rebuild from this sources zip in a fresh folder gave 30 files, every one byte-identical to the uploaded package (SHA-256 compared). The bundle is minified by Vite for size and not obfuscated; every symbol is traceable to src/. Note: "npm run build" (both browsers) first runs scripts/sync-framework.mjs, which regenerates public/framework from a ../framework folder that sits outside the extension project; it is not needed to reproduce the package and the sources zip does not carry that folder.
```

(The rebuild check: unzip the sources zip into an empty folder, `npm ci`, `npm run build:firefox`, then
hash every file under `.output/firefox-mv2` on both sides. Done for the 4.0.0 packages on
2026-09-29 at 19:16 UTC with Node 22.23.3 and npm 10.9.9: the sources zip held 76 files; the rebuild gave 30
files, every one SHA-256-identical to `.output/firefox-mv2` and to the content of
`ashley-bridge-4.0.0-firefox.zip`. Done again for the 5.0.0 packages on 2026-09-29 at 22:26 UTC with the
same Node and npm: the sources zip held 76 files; the rebuild gave 30 files, every one SHA-256-identical to
`.output/firefox-mv2` and to the content of `ashley-bridge-5.0.0-firefox.zip` (the file in `release/5.0.0/`).
Repeat it if the packages are rebuilt before upload, and change the date in the note above.)

## Safari

Not now. A Safari edition needs a Mac with Xcode (or Apple's App Store Connect packager) to wrap
the same WXT build (`npm run build:safari`, then `xcrun safari-web-extension-packager`) in a native
app; an Apple Developer Program membership, without which nothing can be distributed; App Store
review with an app record and the privacy labels ("Identifiers: User ID" collected and linked, for
the approval check; everything else "Not collected"; "Tracking: No"); and an answer to Apple's
Guideline 3.1.1, which forbids an app from unlocking functionality outside Apple's own purchase
system: since 4.0.0 there is no key and no payment, and whether an approval-gated free edition passes as
it is has not been asked; the fallback is a free edition or an in-app purchase in the host app.
Safari also has no side panel, so the button opens the panel in a tab. The
cost is a membership, a Mac or Xcode Cloud hours, a separate review track and a different access
model; the decision is deferred (`../MAC_AND_SAFARI.md`).
