# Store listing texts

The exact texts to paste into the Chrome Web Store dashboard for Beethoven 9.0.0, and the answers to
its questions. Written 2026-09-29 from the decision for 4.0.0 (no licence keys; approval of the
account the portal shows, confirmed with the access service), brought up to date for 6.0.0 and 7.0.0
(the lab's shared copy of the cluster-side tool; the public name Beethoven and its addresses under
`/beethoven/`), for 8.0.0 on 2026-09-30 (Beethoven is offered in one place only, a **Private**
item on the Chrome Web Store whose trusted testers are the Google Group of approved students; the
extension carries no cluster-side code and works only with the lab's shared copy; an approval covers
one installation, and the approval check carries the installation's random identifier), and for
9.0.0 the same evening: the extension's pages wear the theme of openspineconsortium.com, with its
three typefaces bundled in the package as files beside their licences (nothing is fetched for them),
and a new icon. 9.0.0 changes no permission, no request, no stored item and no agreement text
(`PRIVACY.md` version 8, `LICENSE.txt` version 7, as in 8.0.0). There is no other store, no signed
file and no download.

**`PASTE.md` beside this file is the paste sheet**: every dashboard field in the dashboard's order,
with the text to paste or the file to upload. This file holds the texts and the reasons behind them;
`SUBMISSION.md` says what to do around the paste (registration, the group, the review). Before
anything is pasted, read the built extension (`extension/.output/chrome-mv3`) once more for every
`fetch`, `WebSocket` and `tabs.create` and confirm the facts below. `../STORE_LISTING.md` is the
longer compliance document these texts come from.

Facts every text below rests on:

- The extension makes requests to three places only. (1) The student's own Open OnDemand portal,
  from the page script on the one origin the student granted, with the browser attaching the
  portal's session cookie as it does for the portal's own pages; the extension never reads that
  cookie. (2) The maintainer's access service, at the `access_check` address named in
  `https://openspineconsortium.com/beethoven/services.json`
  (`https://beethoven-access.openspineconsortium.workers.dev/access_check`): the approval check, a
  POST sent without cookies, carrying the account name the portal's dashboard shows for the
  signed-in session (never a typed one), the portal's hostname, the product (`bridge`), the version
  and the installation identifier (32 random hexadecimal characters the extension makes for itself
  when the agreement is accepted, from the browser's random number generator and nothing about the
  device), answered yes or no; a no may say that the account is bound to another installation, that
  the installation is bound to another account, or that the build is too old. It is made only after
  the agreement is accepted and the portal is connected: when the portal connects, about once a day,
  and on an icon click after a no or once the last yes is a day old; a yes is kept 24 h (up to 7
  days when the service is unreachable), a no 10 minutes. (3)
  `https://openspineconsortium.com/beethoven/services.json` and
  `https://openspineconsortium.com/beethoven/killlist.json`, once a day each, GETs sent without
  cookies for the service address and the signed list of withdrawn versions; they carry no data
  about the person.
- It opens pages in new tabs and runs nothing on them: the portal's own pages, Anthropic's sign-in
  page (only an https address on claude.ai or claude.com, printed by the sign-in sitting), the
  session's `https://claude.ai/code?environment=...` link, `https://claude.ai/settings/connectors`,
  and, from the *Ask for access* button, the maintainer's request page with the account name in its
  address.
- The cluster-side tool (the framework: shell and Python) is the one shared copy the university's
  lab keeps on the cluster. Where the site profile bundled with the extension names that copy
  (Wayne State's does), one install line typed into the portal's shell points the account at it, and
  the extension reads its version file through the Files app. The package carries no cluster-side
  code and uploads nothing; where there is no shared copy, or the account cannot use it, the panel
  says so and names whom to ask. The mock portal in the reviewer recipe starts with a stand-in for
  the tool already set up in the account, so no install runs there.
- There is no licence key, no activation request, no error or crash reporting and no usage data: the
  code has none. The person's own sign-in to the portal identifies them; nothing is typed or pasted.
- Fixed public URLs: landing `https://openspineconsortium.com/beethoven/`, privacy
  `https://openspineconsortium.com/beethoven/privacy.html`, terms
  `https://openspineconsortium.com/beethoven/terms.html`, support
  `https://openspineconsortium.com/beethoven/support.html`, request page
  `https://openspineconsortium.com/beethoven/request.html`. None of them links the listing: it is
  private, and its link goes only to approved students.
- The package is `extension/.output/beethoven-9.0.0-chrome.zip` (`npm run zip`; the Firefox zip the
  same command writes is not submitted anywhere). Its pages load their fonts (Newsreader, IBM Plex
  Sans, IBM Plex Mono) from `fonts/` inside the package, each family beside its SIL Open Font
  License 1.1 text; no stylesheet names a remote address (`extension/test/hygiene.test.ts` fails if
  one does).
- Beethoven runs Claude Code and is not an Anthropic product. The name carries no Anthropic mark;
  "Claude" and "Claude Code" appear in the texts only to say what it runs.
- Publisher, until the LLC exists: Gregory Schwing, trading as OpenSpineConsortium. The product
  name and identifier carry no university name.

## Name

```
Beethoven
```

## Short description (the manifest `description`; 128 characters, within the 132 at most that Chrome's manifest documentation allows; Chrome takes it from the package)

```
Starts, watches and stops a Claude Code worker on your university's Open OnDemand cluster and hands you its Remote Control link.
```

This is what the 9.0.0 package carries, unchanged since 8.0.0 (`extension/wxt.config.ts` and `extension/package.json`;
`extension/test/hygiene.test.ts` fails above 132). It is the sentence decided on 2026-09-29 without
its leading name, which the store shows beside the description anyway.

## Detailed description (the one to paste; plain text; 1,049 characters; under Chrome's limit of 16,000)

Written 2026-09-30 for 9.0.0 in the voice of the site's home page, for a student who reads it in
twenty seconds: what it does in two sentences, three steps, what you need, how to get it, what is
sent, and the marks. Counted with Python as Unicode characters without a trailing newline: 1,049
(1,067 if the dashboard counts each of its 18 line breaks as two characters). ASCII only, so it
pastes the same everywhere. Every sentence rests on the facts above: the data sentence names what
the approval check carries about the person (the account name and the installation identifier),
says that the portal's address and the version go with them, and "nothing else about you" is true of
the product field (a constant) and of the two daily GETs (they carry no data). The site's
"on an H200 when it needs one" is left out: the GPU a worker may use depends on the student's grid
account, which the extension does not know.

```
Your grid. From claude.ai.

Beethoven starts a Claude Code worker in your own account on the Wayne State grid and opens it in claude.ai. Ask there or in the Claude app, and your worker does the work.

HOW IT WORKS
1. Sign in to ondemand.grid.wayne.edu and click Beethoven. The first time, allow that one site and accept the agreement.
2. When asked, sign in to Claude once, on Anthropic's own page.
3. Click Open in Claude. Your worker runs until you press Stop.

YOU NEED
A Wayne State AccessID, a grid account, the GlobalProtect VPN, and Claude Pro or Max.

By approval only: ask at https://openspineconsortium.com/
One approval covers one installation: one Chrome profile on one computer.

YOUR DATA
To check your approval, Beethoven sends our access service the account name your portal shows and a random installation identifier, with your portal's address and the version. The extension sends nothing else about you. The service records each check with a salted hash of the network address it came from, never the address. Privacy: https://openspineconsortium.com/beethoven/privacy.html

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks.
```

## Reviewed description (reviewer-facing; plain text; 5,286 characters; not pasted into the dashboard)

The description the 8.0.0 listing was written with, reviewed line by line against the code. It is
kept as the reviewer-facing text: if a reviewer asks what the extension does, never does or keeps,
reply with it (with the reviewer recipe below and `SUBMISSION.md`, section 4). Everything in it is
still true of 9.0.0. The detailed description above is condensed from it and narrowed to Wayne State
(the only site profile with a shared copy), and makes no claim this one does not support.

```
Beethoven starts, watches and stops a Claude Code worker in your own account on your university's cluster, through the Open OnDemand portal you already use, and hands you the link that shows that worker at claude.ai/code and in the Claude app (Anthropic's Remote Control feature).

WHAT YOU NEED
- An account on a cluster with an Open OnDemand portal (version 3 or 4, with its Shell and Files apps), where your lab keeps the shared copy of Beethoven's cluster-side scripts.
- Your own Claude account on a plan that includes Claude Code Remote Control (Pro or Max).
- Approval of your cluster account by the maintainer. The Trial Edition is free for approved institutional accounts; ask for access at https://openspineconsortium.com/beethoven/request.html with the account name your portal shows for you and the Google account at which you want the invitation to this listing, which is private. Once you are approved the extension just works: there is no key and nothing to paste.
- One computer. An approval covers one installation; another computer, another browser profile or a reinstallation is refused until the maintainer moves the approval to it.

HOW IT WORKS
1. Open your portal in a tab and sign in as usual.
2. Click the Beethoven button on that tab. The first click asks your browser to allow that one site. The panel then does the steps by itself and says what it is doing: it wakes the portal up, checks you are signed in, confirms your account is approved, points your cluster account at the copy of its scripts your lab keeps on the cluster if that has not been done, runs one short check job on a compute node, shows you where your work goes and takes your statement about it, starts your worker through the portal's own shell, and waits for Claude Code to connect.
3. Sign in to Claude once, when the panel asks. It opens Anthropic's sign-in page in a new tab; you sign in with your own account, click Authorize, and paste the code the page shows into the panel's one box. The code is typed once into your own job's terminal and is not kept.

When your worker connects, your session's claude.ai page opens in a new tab (you can turn that off), and the panel shows a green "Open in Claude" button for later. The worker stays on by itself until you press Stop.

WHAT IT NEVER DOES
- It has no access to claude.ai or any Anthropic page: it runs no code there, reads nothing there and changes nothing there. It only opens those pages in a new tab, as a bookmark would.
- It never sees your Claude sign-in. You sign in on Anthropic's own page; the one-time code you paste is passed once to your own cluster shell and is not stored, not logged and not sent anywhere else.
- It works with one website: the Open OnDemand portal you connect. It asks for access to that site when you click its button on that site's tab, and to nothing else. Its only other requests go to the maintainer: the approval check, which sends the account name your portal shows for you, your portal's address, the product name and its version, and the random identifier of this installation, so the maintainer's access service can answer whether that account is approved on this installation; and a daily download of that service's address and the signed list of withdrawn versions, which carries nothing about you.
- It does not read your portal cookie and does not sign in for you. When your portal asks for a sign-in, the panel asks you to sign in in a tab. There is no key and nothing to paste: your institution's own sign-in identifies you.
- It reads nothing from your computer's hardware. The installation identifier is a random number it makes for itself.
- It runs no code it did not ship with. Its once-a-day update check downloads a signed list of withdrawn versions, not a program.
- It sends the maintainer no usage data, no error reports and no activation request. The approval check is the only thing it sends about you.
- It never deletes your files. It removes only its own state files and cancels only the job it started.

WHAT IT KEEPS
On your device only: the portal address you connected, your preferences, your acceptance of the agreement, the account name your portal shows and the last approval answer, the random identifier of this installation, your statement about each workspace, and an audit log of every request it made to your portal, which you can read, export and clear. Privacy statement: https://openspineconsortium.com/beethoven/privacy.html

ACCESS AND TERMS
Beethoven is licensed, not sold, and works only from an institutional account the maintainer has approved, on one installation. The Trial Edition is free for approved institutional accounts and ends by itself; nothing converts into a paid licence and no payment details are taken. A paid Full Edition, if offered later, is a separate agreement. Terms: https://openspineconsortium.com/beethoven/terms.html  Support: https://openspineconsortium.com/beethoven/support.html

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher. Beethoven is not provided by or on behalf of any university. It is a research and teaching tool, not a medical device. Offered in the United States.
```

## Single-purpose statement

```
Start, monitor and stop a Claude Code worker on your university's Open OnDemand cluster and hand you its Remote Control link.
```

## Permission justifications (one sentence each, as the dashboard asks for them)

| Permission | Justification |
|---|---|
| `storage` | Remembers the portal address you connected, your preferences, your acceptance of the agreement, the account name your portal shows with the last approval answer, this installation's random identifier, your statement about each worker's workspace and the audit log of requests made to your portal, all on your device. |
| `alarms` | Reads your running job's status files no more than once a minute, renews the approval check and fetches the signed withdrawn-versions list once a day, and keeps doing so after the browser suspends the extension. |
| `scripting` | Loads the extension's page script on your university portal, and only there, after you connect it, including into the portal tab that is already open. |
| `activeTab` | Lets a click on the toolbar button read the address of the portal tab you clicked from, so the extension can ask you to allow that one site; nothing is read from any other tab. |
| `sidePanel` | Opens the extension's panel beside your portal tab when you click the toolbar button; there is no popup. |
| Optional host permission `https://*/*` (requested at runtime for one origin) | Your university's Open OnDemand portal has an address the extension cannot know in advance; when you click the button on that portal's tab, the extension asks the browser for that one origin only, and it refuses to work until that one site is granted. It never requests a claude.ai, anthropic.com or claude.com origin. |

For 9.0.0 the `storage` sentence also names the installation identifier and the audit log, which
the extension already kept (the privacy statement lists both); nothing new is stored. The remote-code
answer gains one sentence on the bundled fonts.

Never requested: `cookies`, `tabs`, `webRequest`, `webRequestBlocking`, `declarativeNetRequest`,
`nativeMessaging`, `debugger`, `identity`, `clipboardRead`; any install-time host permission.

## Remote code

Answer: **No.** Justification if a field asks for one:

```
No remote code. No eval, no new Function, no fetched scripts, no interpreter for remote commands. The daily update check downloads one JSON document (a signed list of withdrawn versions) and verifies its Ed25519 signature with WebCrypto against a public key compiled into the package; JSON is data. Commands to the cluster are a small fixed vocabulary interpreted by shipped code, and the lines the cluster prints during the sign-in are parsed as text and never executed. The cluster-side tool is the one shared copy the university's lab keeps on the cluster; the extension runs it in the user's own cluster account through the portal's shell and carries no copy of it; nothing from the cluster is ever executed in the browser. Fonts are files inside the package; nothing is fetched to display a page.
```

## Privacy practices

| Question | Answer |
|---|---|
| Does the extension collect or transmit user data to the developer? | Yes, personally identifiable information only: the institutional account name your portal shows for you and the random identifier of this installation, sent to the developer's access service in the approval check (with the portal's hostname, the product and the version) to answer whether that account is approved and whether this is the installation it is approved on, when you connect, when you click the icon and about once a day. Nothing else: no authentication information, no communications, no website content, no browsing history, no user activity, no location, no financial or health data. The two daily GETs of the developer's services file and signed withdrawn-versions list carry no data. |
| Is a privacy policy provided? | Yes: https://openspineconsortium.com/beethoven/privacy.html (it names the approval check, what the developer records from it, including the installation an approval is bound to, and what the extension keeps on the device: settings, the account name and last answer, the installation identifier, an acceptance record and an audit log). |
| Certifications (Chrome's three) | I do not sell or transfer user data to third parties outside the approved use cases; I do not use or transfer user data for purposes unrelated to the item's single purpose; I do not use or transfer user data to determine creditworthiness or for lending purposes. |
| Limited Use statement (on the landing page) | Beethoven's use of information received from your browser complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. |

## The negative statements (listing, privacy policy and reviewer notes, verbatim)

```
- Beethoven has no access to claude.ai or any Anthropic page. It does not run on those sites, does not read them and does not change them. It opens an Anthropic page in a new tab in two cases (the sign-in page Claude Code printed during a sitting you started; your session's claude.ai/code link when your worker connects) and the connectors settings page for the optional Google Drive step, as a bookmark would; nothing of the extension runs there.
- Beethoven never sees your Claude sign-in. You sign in to Claude Code yourself, on Anthropic's own page; the one-time code you paste into the extension's box is typed once into your own job's terminal on your cluster and is not stored, not logged and not sent anywhere else; the extension reads only whether Claude Code says it is signed in.
- Beethoven runs no code it did not ship with. Its daily update check downloads a signed list, not a program.
- Beethoven works with one website: the Open OnDemand portal you connect. It requests access to that site when you click its icon on that site's tab, and to nothing else. Its only other requests go to the maintainer: the approval check, which sends the account name your portal shows for you, your portal's address, the product name and its version, and the random identifier of this installation, so the maintainer's access service can answer whether that account is approved on this installation; and a daily download, from the maintainer's website, of that service's address and the signed list of withdrawn versions, which carries nothing about you.
- Beethoven does not read your portal cookie and does not sign in for you. When your portal asks for a sign-in, the extension asks you to sign in in a tab. There is no key and nothing to paste: your institution's own sign-in identifies you.
- Beethoven sends its maintainer no usage data, no error reports and no activation request; the approval check is the only thing it sends about you. Its audit log of what it asked your portal never contains what you typed to sign in and is never transmitted.
```

## URLs

| Field | Value |
|---|---|
| Official URL | `https://openspineconsortium.com/` once that site is verified in Google Search Console under the developer account's Google account (`PASTE.md` says how); empty until then |
| Homepage URL | `https://openspineconsortium.com/beethoven/` (the manifest's `homepage_url` and the page's canonical address; the site root shows the same page) |
| Support URL | `https://openspineconsortium.com/beethoven/support.html` |
| Privacy policy | `https://openspineconsortium.com/beethoven/privacy.html` |
| Ask for access (in the description) | `https://openspineconsortium.com/` (the form is on the home page, under "Ask for access"; `.../beethoven/request.html` is the same form and is what the panel's *Ask for access* button opens) |
| Terms (in the reviewed description) | `https://openspineconsortium.com/beethoven/terms.html` |

The six site addresses above answered 200 on 2026-09-30 at about 21:45 US Eastern (curl from WSL),
and the live home page's headline read "Your grid. From claude.ai." with the lede "Ask in claude.ai.
Your worker on the grid does the work."

## Images and the promo video

For 9.0.0 the images are made again in the site's theme, to these rules: the store icon is the
package icon (the rack from the home page diagram, its one teal unit lit;
`extension/store-assets/src/icon/README.md`) flattened on the site's cream; every product screen is
a real capture of the 9.0.0 release build (the raw captures are in `extension/store-assets/raw-9/`,
and its `LIST.txt` says how they were taken), framed, never a drawn screen; the diagram may be
drawn, as it is on the site; every image or video frame that names Claude or claude.ai also carries,
small, "Not an Anthropic product."; PNG 24-bit without alpha, or JPEG, at the exact sizes.
`PASTE.md` names the file for each field, in the dashboard's order, and
`extension/store-assets/manifest.txt` says how each was made. The promo video is not a file field:
the dashboard takes a YouTube address (`PASTE.md` says how to get one).

## The dashboard, field by field

`PASTE.md` beside this file: the Store listing tab in the order of the dashboard's fields, then the
Privacy practices tab and the Distribution tab, each with the text in a block to copy or the file to
upload. Chrome has no reviewer-notes field on the item.

If the review asks for test access, answer with the text in `SUBMISSION.md`, section 4, and the
recipe below.

## Reviewer recipe (for a reply to the review)

```
Beethoven starts, watches and stops a Claude Code job in the user's own account on their university's cluster, through the Open OnDemand web portal (an open-source portal run by universities), and shows the user the link Claude Code prints when it registers with Anthropic's Remote Control feature.

Why no live test account can be given: the extension works only against a university's Open OnDemand portal, which needs a university account, its VPN and often a second factor. No reviewer can be issued one, and we cannot lend ours (one person, one account is a term of the portal and of Anthropic's service).

What you can do instead: the extension's project contains a mock portal (mock-ood/server.mjs, Node 22, one dependency) that serves the same routes the extension uses (dashboard, Files, Active Jobs, the Shell WebSocket) with a stand-in scheduler and a stand-in for the cluster-side tool. We send the project as a zip on request. Recipe:

  1. npm ci && npm run build:chrome
  2. openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -subj /CN=localhost -days 30 -addext subjectAltName=DNS:localhost
  3. MOCK_LOGGED_IN=false node mock-ood/server.mjs --port 8443 --host localhost --user st1234 --cert cert.pem --key key.pem
  4. Load .output/chrome-mv3 unpacked (chrome://extensions, Developer mode, Load unpacked), or use the installed item. Open https://localhost:8443/login , accept the certificate exception, click "Sign in as st1234".
  5. On the extension's setup page (it opens on install): scroll the agreement to its end, tick the four statements, type a name, "Accept and Continue". There is no key and nothing else to enter.
  6. Click the Beethoven toolbar button on the portal tab. The browser asks to allow https://localhost:8443; allow it. The panel then runs the steps by itself: it reads the account name the mock's dashboard shows (st1234), asks our access service whether that account is approved (it is: st1234 is on the approved list for exactly this recipe, and is accepted from any installation, so your installation is not refused as a second one), reads the mock's files, submits the stand-in check job, opens the sign-in step (the mock prints a real-looking claude.ai authorize link with a mock client id, which Anthropic's page declines: close that tab and type any six letters or digits into the panel's box), asks for the data statement, starts the stand-in worker and shows the green "Open in Claude" button with a claude.ai/code link the stand-in wrote. Under "Details", "Run the checks" runs the extension's seventeen checks against the mock. Run the mock with another --user and the panel's one button becomes "Ask for access", which opens our request page with that name filled in; that is the whole of what an unapproved person sees.

What the extension never does: no code, host permission or content script on claude.ai, anthropic.com or claude.com (it opens those pages in a new tab only); no reading of any Claude credential (the user signs in on Anthropic's page; the one-time code they paste is relayed once to their own cluster shell and kept nowhere); no remote code (the daily update check fetches one signed JSON list and verifies it with WebCrypto); no cookies, tabs, webRequest, nativeMessaging, debugger or identity permission; no install-time host permission (the one portal origin is requested from the click); no licence key and no password of ours (the user's own portal sign-in identifies them). What it sends us: the approval check only (the account name the portal shows, the portal hostname, the product, the version and a random identifier the extension made for this installation, answered yes or no; we record those with the time, a salted hash of the network address and the answer, and keep which installation each approved account is bound to); no analytics, no error reports, no activation. The only other requests to our site are the daily GETs of https://openspineconsortium.com/beethoven/services.json and https://openspineconsortium.com/beethoven/killlist.json without cookies; the approval check goes to https://beethoven-access.openspineconsortium.workers.dev/access_check, and its product field reads "bridge", the extension's name on the wire since its first version. A campus can pin the extension with browser policy: the host list is the one portal origin the user grants.

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher. It is not provided by or on behalf of any university, Anthropic or the Open OnDemand project.
```

## No other store

Edge Add-ons, Firefox Add-ons and Safari are not used from 8.0.0 (decided 2026-09-30): one private
listing is what keeps the extension with the students the maintainer approved. The texts for them
are in the history of this file (7.0.0). `npm run build` and `npm run zip` still produce a Firefox
package, because the code builds for it unchanged; nothing uploads it.
