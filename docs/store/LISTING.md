# Store listing texts

The exact texts to paste into the Chrome Web Store dashboard for Beethoven 12.0.0, and the answers to
its questions. Written 2026-09-29 from the decision for 4.0.0 (no licence keys; approval of the
account the portal shows, confirmed with the access service), brought up to date for 6.0.0 to 10.0.0
(the lab's shared copy of the cluster-side tool; the public name Beethoven; a **Private** item whose
trusted testers are the Google Group of approved students; one installation per approved account;
the site's theme; an Anthropic address refused before any permission request), and rewritten on
2026-10-02 for 12.0.0. 11.0.0 (2026-10-01) was built but never submitted, and its store documents
were never brought up to date (`docs/V11_STATUS.md`, section 5), so this rewrite carries both:

- **11.0.0**: a welcome page with one tick and "Agree and continue" replaces the setup page with its
  scroll gate and typed name; the panel is window-wide and opens from the toolbar button;
  `activeTab` is gone; the page script is never registered, only injected into tabs the extension
  opened itself; agreement version 8, privacy statement version 9.
- **12.0.0**: the extension tries the **direct way** first: an ssh connection to the university
  cluster's login node (`grid.wayne.edu`, port 22), with no VPN, carried by **the helper**, a small
  script that ships inside the package and that the user installs once, without administrator
  rights. The first direct sign-in asks for the AccessID, the password and the Google Authenticator
  code in the extension's own sign-in sheet; they go only to the cluster, inside the encrypted
  session, after the cluster's host key matched the pin, and are never stored. The extension then
  keeps a key of its own, encrypted, in the browser, and the cluster account gets one restricted
  line that lets that key run only a short list of commands. Protecting the key with Windows Hello
  or Touch ID is optional and off by default. Without the helper, the portal path of 11.0.0 is
  used. New permission: `nativeMessaging`. New data type: authentication information. Agreement
  version 9, privacy statement version 10.

There is no other store, no signed file and no download: the helper's installers are files inside
the package, offered by the extension's own page.

**`PASTE.md` beside this file is the paste sheet**: every dashboard field in the dashboard's order,
with the text to paste or the file to upload. This file holds the texts and the reasons behind them;
`SUBMISSION.md` says what to do around the paste (registration, the group, the review). Before
anything is pasted, read the built extension (`extension/.output/chrome-mv3`) once more for every
`fetch`, `WebSocket`, `connectNative` and `tabs.create` and confirm the facts below.
`../STORE_LISTING.md` is an older, longer compliance document (8.0.0 to 10.0.0 wording).

Facts every text below rests on (settled against the working tree on 2026-10-02 by fixer B, after the
build streams and the four reviews):

- The extension reaches the user's cluster in one of two ways, the direct way first.
  (1) **The direct way**: its own ssh client (WebCrypto, no third-party code) speaks ssh to the
  cluster's login node through the helper, which Chrome starts with `runtime.connectNative`
  (`com.openspineconsortium.beethoven.bridge`). The helper opens TCP only to an address on its
  allowlist (`grid.wayne.edu:22`, built in) and carries bytes; the ssh session is encrypted end to
  end between the extension and the cluster. The site profile (`framework/profiles/wayne.json`)
  names the host, the port and the host key's SHA256 fingerprint; a server that shows another key is
  sent nothing. The site profile names no relay (`ssh_relay: null`), and no browser-only bridge is
  used in 12.0.0: Chromium lets only Google's Secure Shell open sockets, and it offers other extensions
  no byte stream (exploration A). (2) **The portal path** (11.0.0): requests to the
  student's own Open OnDemand portal, from the extension's background with the sign-in the browser
  keeps, and the portal's Shell WebSocket.
- The extension makes requests to its maintainer in two kinds only. The approval check, a POST sent
  without cookies to the `access_check` address named in
  `https://openspineconsortium.com/beethoven/services.json`
  (`https://beethoven-access.openspineconsortium.workers.dev/access_check`), carrying the account
  name the cluster accepted (the portal's dashboard shows it, or, on the direct way, the name typed
  into the sign-in sheet, sent only after the cluster accepted that sign-in), the portal's hostname,
  the product (`bridge`), the version and the installation identifier (32 random hexadecimal
  characters made when the agreement is accepted), answered yes or no; made only after the agreement
  is accepted and the cluster has accepted a sign-in. And the daily GETs of `services.json` and
  `killlist.json`, without cookies, carrying no data about the person.
- The user types their cluster password and verification code only into the extension's own sign-in
  sheet (an extension page), only for the direct way's first sign-in (and again only when the
  browser's key is missing or refused, or for a Claude sign-in through the direct way); they go only
  into the ssh session and are never stored, logged or sent to the maintainer. On the portal path
  the user types them into the browser's own sign-in box or the portal's own pages, which the
  extension never reads.
- The browser's key for the direct way is kept in the extension's IndexedDB, wrapped by a
  non-extractable browser key by default or by the user's passkey if they opt in; it never leaves the
  device. The line it gets in the cluster account is `restrict,command="<the lab's shared
  copy>/bin/hpcworker gate" ...`: the gate runs eight fixed verbs and can never sign a worker in to
  Claude.
- It opens pages in new tabs and runs nothing on them: the portal's own pages (portal path),
  Anthropic's sign-in page (only an https address on claude.ai or claude.com, printed by the sign-in
  sitting), the session's `https://claude.ai/code?environment=...` link,
  `https://claude.ai/settings/connectors`, the plans page from "See plans", the university's help
  pages (KB 20199, 20314, 20242) and its portal from the welcome page and the code-setup steps, and,
  from the *Ask for access* button, the maintainer's request page with the account name in its
  address. QR codes are drawn on the device; they encode only the university's help pages, the
  portal, and the App Store and Google Play pages of GlobalProtect and Google Authenticator.
- The cluster-side tool (the framework: bash, coreutils, grep, sed and awk on the login node; framework
  11 runs no Python there) is the one shared copy the university's lab keeps on the cluster. The package carries no cluster-side code and
  uploads nothing. The mock portal in the reviewer recipe starts with a stand-in for the tool
  already set up in the account.
- There is no licence key, no activation request, no error or crash reporting and no usage data.
- Fixed public URLs: landing `https://openspineconsortium.com/beethoven/`, privacy
  `https://openspineconsortium.com/beethoven/privacy.html`, terms
  `https://openspineconsortium.com/beethoven/terms.html`, support
  `https://openspineconsortium.com/beethoven/support.html`, request page
  `https://openspineconsortium.com/beethoven/request.html`. None of them links the listing or offers
  a download.
- The package is `release/12.0.0/beethoven-12.0.0-chrome.zip`, a copy of
  `extension/.output/beethoven-12.0.0-chrome.zip` (`npm run zip`; the Firefox zip the same command
  writes is not submitted anywhere). Besides the fonts of 9.0.0 it holds `bridge/`:
  `beethoven-bridge-windows.zip`, `beethoven-bridge-mac.zip` and `beethoven-bridge-linux.zip` (the
  helper's scripts, installer, uninstaller and a README for each system, from `helper/src/`) and
  `bridge/manifest.json`, which names each file with its name, size, SHA-256, the installer to open
  and the native host's name (`com.openspineconsortium.beethoven.bridge`). Each zip in the package carries `allowed_origins.json` with a placeholder its installer refuses; the extension page that offers the download writes the extension's own ID (`chrome-extension://<id>/`, from `chrome.runtime.id`) into a copy of that zip in memory and saves the copy (`extension/src/core/bridgeZip.ts`), so the helper is made out to whichever build saved it: the store item, or an unpacked test copy. Nothing is fetched; where the copy cannot be made, the packaged zip is saved unchanged and its installer refuses with its own sentence.
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

Unchanged since 8.0.0 (`extension/wxt.config.ts` and `extension/package.json`;
`extension/test/hygiene.test.ts` fails above 132). It stays true of 12.0.0: the cluster is still an
Open OnDemand cluster, and the portal path is still there; the direct way is how it reaches the
same cluster.

## Detailed description (the one to paste; plain text; 1,650 characters; under Chrome's limit of 16,000)

Rewritten 2026-10-02 for 12.0.0 in the voice of 9.0.0's text, for a student who reads it in twenty
seconds. Counted with Python as Unicode characters without a trailing newline: 1,650 (1,671 if the
dashboard counts each of its 21 line breaks as two characters). ASCII only. Every sentence rests on
the facts above: the data paragraph names what the approval check carries about the person and says
where the password and code go.

```
Your grid. From claude.ai.

Beethoven starts a Claude Code worker in your own account on the Wayne State grid and opens it in claude.ai. Ask there or in the Claude app, and your worker does the work.

HOW IT WORKS
1. Accept the agreement on Beethoven's welcome page.
2. Sign in to the grid once, in Beethoven's own sign-in sheet: your AccessID, password and Google Authenticator code. They go only to the grid, encrypted, and are never kept. This computer then has a key of its own: later you type nothing and need no VPN.
3. Sign in to Claude once, on Anthropic's own page.
4. Click Open my session. Your worker runs until you press Stop.

The direct way uses a small helper that comes inside Beethoven. You install it once, with no administrator rights. Without it, Beethoven works through GlobalProtect, as before.

YOU NEED
A Wayne State AccessID with a grid account and Google Authenticator set up for it, Chrome on Windows, macOS or Linux, and Claude Pro or Max.

By approval only: ask at https://openspineconsortium.com/
One approval covers one installation: one Chrome profile on one computer.

YOUR DATA
To check your approval, Beethoven sends our access service the account name the grid accepted and a random installation identifier, with your portal's address and the version. It sends nothing else about you, and your password and code go only to the grid. The service records each check with a salted hash of the network address it came from, never the address. Privacy: https://openspineconsortium.com/beethoven/privacy.html

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks.
```

## Reviewed description (reviewer-facing; plain text; 6,106 characters; not pasted into the dashboard)

Rewritten 2026-10-02 for 12.0.0 from 10.0.0's reviewed text, sentence by sentence against the facts
above. If a reviewer asks what the extension does, never does or keeps, reply with it (with the
reviewer recipe below and `SUBMISSION.md`, section 4). The detailed description above is condensed
from it and narrowed to Wayne State (the only site profile with a shared copy and an ssh host), and
makes no claim this one does not support.

```
Beethoven starts, watches and stops a Claude Code worker in your own account on your university's cluster, and hands you the link that shows that worker at claude.ai/code and in the Claude app (Anthropic's Remote Control feature).

WHAT YOU NEED
- An account on a cluster where your lab keeps the shared copy of Beethoven's cluster-side scripts. At Wayne State: a grid account, Google Authenticator set up for it, and either the small helper that comes inside Beethoven (for the direct way, with no VPN) or the GlobalProtect VPN.
- Your own Claude account on a plan that includes Claude Code Remote Control (Pro or Max).
- Approval of your cluster account by the maintainer. The Trial Edition is free for approved institutional accounts; ask for access at https://openspineconsortium.com/beethoven/request.html with your account name and the Google account at which you want the invitation to this listing, which is private. There is no licence key.
- One computer. An approval covers one installation; another computer, another browser profile or a reinstallation is refused until the maintainer moves the approval to it.

HOW IT WORKS
1. Accept the agreement on the welcome page that opens on install: one tick and "Agree and continue". The full text is one click away, and can be saved and printed.
2. The direct way. If the small helper is not on your computer yet, the panel offers it ("One small download, once"): a short script inside Beethoven that you save and open once, with no administrator rights, and that carries Beethoven's encrypted connection to the cluster's ssh port and nowhere else. Then Beethoven's own sign-in sheet asks for your account name, password and Google Authenticator code, exactly as the cluster asks for them, and sends them only to the cluster, inside the encrypted session, after the cluster proved its identity. Beethoven keeps a key of its own in your browser and adds one restricted line to your cluster account, so later connections ask for nothing. Protecting that key with Windows Hello or Touch ID is optional and off unless you turn it on.
3. Or the portal path: "Use GlobalProtect instead" uses your university's Open OnDemand portal, on its VPN, as before; you sign in in the browser's own box, which Beethoven never reads.
4. Where your work goes: read the four lines, tick, Connect. Sign in to Claude once, when the panel asks: it opens Anthropic's sign-in page in a new tab; you sign in with your own account and paste the code the page shows into the panel's one box. The code is typed once into your own job's terminal and is not kept.

When your worker connects, your session's claude.ai page opens in a new tab (you can turn that off), and the panel's "Open my session" opens it again. The worker stays on by itself until you press Stop.

WHAT IT NEVER DOES
- It has no site permission on claude.ai or any Anthropic page and never asks for one: it runs no code there, reads nothing there and changes nothing there. It only opens those pages in a new tab, as a bookmark would; an address on claude.ai, claude.com or anthropic.com is refused as a portal before any permission request.
- It never sees your Claude sign-in. The one-time code you paste is passed once to your own cluster shell and is not stored, not logged and not sent anywhere else.
- It never keeps your cluster password or code. They go only to your cluster, inside the encrypted ssh session, after the cluster's host key matched the one Beethoven carries; they are never stored, logged, offered to be remembered or sent to the maintainer.
- Its key can never sign a worker in to Claude, open a terminal, transfer files or forward ports: the line in your cluster account forces every use through a gate with eight fixed commands.
- The helper connects only to your cluster's ssh port, holds no credential, keeps no log of what it carries, runs nothing else and sends nothing to the maintainer.
- Its only other requests go to the maintainer: the approval check (the account name your cluster accepted, your portal's address, the product name and its version, and the random identifier of this installation), sent only after your cluster accepted your sign-in; and a daily download of the service's address and the signed list of withdrawn versions, which carries nothing about you.
- It reads nothing from your computer's hardware. The installation identifier is a random number it makes for itself.
- It runs no code it did not ship with. Its once-a-day update check downloads a signed list, not a program; the helper is a file inside the package.
- It sends the maintainer no usage data, no error reports and no activation request.
- It never deletes your files. It removes only its own state files and its own line, and cancels only the job it started.

WHAT IT KEEPS
On your device only: the portal address, your preferences, your acceptance of the agreement, the account name your cluster accepted and the last approval answer, the random identifier of this installation, your statement about each workspace, the browser's key (encrypted) and notes about the direct way, and an audit log of every request it made to your portal, which you can read, export and clear. "Forget this computer" deletes the key and removes its line from your cluster. Privacy statement: https://openspineconsortium.com/beethoven/privacy.html

ACCESS AND TERMS
Beethoven is licensed, not sold, and works only from an institutional account the maintainer has approved, on one installation. The Trial Edition is free for approved institutional accounts and ends by itself; nothing converts into a paid licence and no payment details are taken. Terms: https://openspineconsortium.com/beethoven/terms.html  Support: https://openspineconsortium.com/beethoven/support.html

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher. Beethoven is not provided by or on behalf of any university. It is a research and teaching tool, not a medical device. Offered in the United States.
```

## Single-purpose statement

Unchanged: the direct way is a second road to the same purpose.

```
Start, monitor and stop a Claude Code worker on your university's Open OnDemand cluster and hand you its Remote Control link.
```

## Permission justifications (one sentence or two each, as the dashboard asks for them)

12.0.0's Chrome manifest asks for `storage`, `alarms`, `scripting`, `nativeMessaging` and `sidePanel`
(all required; `extension/wxt.config.ts`), and the one optional host permission `https://*/*`;
`activeTab` left with 11.0.0. The Firefox build, which is not submitted anywhere, has neither
`nativeMessaging` nor `sidePanel`.

| Permission | Justification |
|---|---|
| `storage` | Remembers, on your device: the portal address, your preferences, your acceptance of the agreement, the account name your cluster accepted with the last approval answer, this installation's random identifier, your statement about each worker's workspace, notes about the direct connection (when this computer's key was added and its fingerprint) and the audit log of requests made to your portal. The direct connection's key itself is kept encrypted in the extension's own database. |
| `alarms` | Reads your running worker's status no more than once a minute, renews the approval check and fetches the signed withdrawn-versions list once a day, and keeps doing so after the browser suspends the extension. |
| `scripting` | Loads the extension's page script only into a tab the extension opened itself on the one portal site you allowed: where your portal does not share its sign-in with the extension's own requests, and on the portal's terminal page for its one-time key step, where it reads only the page's title and types one line. No page script is registered or loaded anywhere else. |
| `sidePanel` | Opens the extension's panel at the side of the window when you click the toolbar button; there is no popup. |
| `nativeMessaging` | Talks to Beethoven's own helper, a small script that ships inside the extension and that you install once (no administrator rights), so you can reach your university cluster without a VPN. The helper opens a connection only to the cluster's ssh port (grid.wayne.edu:22) and carries the extension's encrypted ssh session there and back; its registration names only this extension, and it holds no credential, runs no shell, keeps no log of what it carries and talks to nothing else. |
| Optional host permission `https://*/*` (requested at runtime for one origin) | Your university's Open OnDemand portal has an address the extension cannot know in advance, so no site is granted at install. The extension asks the browser for one origin at a time, and only inside a click: "Agree and continue" on its welcome page (your university's portal, filled in from the site profile, or the address you typed under "Use another portal"), "Allow again" in its panel if the grant was removed, or "Change" in its Settings. It refuses to work through a portal until that one site is granted. An address on claude.ai, claude.com or anthropic.com, or on any of their subdomains, is refused before any request, so the extension never requests an Anthropic origin. |

`nativeMessaging` is new in 12.0.0: 11.0.0's texts listed it among the permissions never requested.
Chrome lets an extension reach a native program only when that program's registration names the
extension's ID, so the permission reaches the helper and nothing else; and the helper exists only
after the user saved and ran its installer. It is a required permission, so Chrome's install dialog
reads "Communicate with cooperating native applications" (`INSTALL.md` explains it); the listing has
no users yet, so no installed copy is disabled by the new permission.

The host-permission sentence is 11.0.0's: the request now comes from the welcome page's "Agree and
continue", the panel's "Allow again" or Settings' "Change", never from the toolbar button (which only
opens the panel) and never from a setup page (gone). 12.0.0's welcome page still asks for the portal
at "Agree and continue" (`extension/src/ui/welcome.ts`), so the portal path is ready if the direct
way is not.

Never requested: `activeTab`, `cookies`, `tabs`, `webRequest`, `webRequestBlocking`,
`declarativeNetRequest`, `debugger`, `identity`, `clipboardRead`; any install-time host permission.

## Remote code

Answer: **No.** Justification if a field asks for one:

```
No remote code. No eval, no new Function, no fetched scripts, no interpreter for remote commands. The daily update check downloads one JSON document (a signed list of withdrawn versions) and verifies its Ed25519 signature with WebCrypto against a public key compiled into the package; JSON is data. Commands to the cluster are a small fixed vocabulary interpreted by shipped code, and the lines the cluster prints are parsed as text and never executed. The helper the user may install is a script inside the package, offered by the extension's own page; Chrome starts it through native messaging, and it carries bytes only; the extension never downloads or runs code from anywhere. The cluster-side tool is the one shared copy the university's lab keeps on the cluster; nothing from the cluster is ever executed in the browser. Fonts are files inside the package.
```

## Privacy practices

| Question | Answer |
|---|---|
| Does the extension collect or transmit user data? | Yes, two kinds. **Personally identifiable information**: the institutional account name the cluster accepted and the random identifier of this installation, sent to the developer's access service in the approval check (with the portal's hostname, the product and the version). **Authentication information**: the cluster password and one-time verification code the user types into the extension's own sign-in sheet for the direct way's first sign-in; handled on the device and sent only to the user's own university cluster, inside the encrypted ssh session, after the server's host key matched the key pinned in the extension; never stored, logged or sent to the developer. The private key the extension makes for the cluster account stays on the device, encrypted. Nothing else: no communications, no website content, no browsing history, no user activity, no location, no financial or health data. |
| Is a privacy policy provided? | Yes: https://openspineconsortium.com/beethoven/privacy.html (version 10 names the approval check, what the developer records from it, the sign-in sheet, the helper, the browser's key and its optional passkey, and what stays on the device). |
| Certifications (Chrome's three) | I do not sell or transfer user data to third parties outside the approved use cases; I do not use or transfer user data for purposes unrelated to the item's single purpose; I do not use or transfer user data to determine creditworthiness or for lending purposes. |
| Limited Use statement (on the landing page and the reviewers page) | Beethoven's use of information received from your browser complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. |

## The negative statements (word for word as on the public reviewers page, `/beethoven/reviewers.html`)

```
- Beethoven has no site permission on claude.ai or any Anthropic page and never asks for one. It does not run on those sites, does not read them and does not change them. It opens an Anthropic page in a new tab only as a bookmark would (the sign-in page Claude Code printed during a sitting you started, your session's claude.ai/code link, the connectors settings page for the optional Google Drive step, the plans page); nothing of the extension runs there.
- Beethoven never sees your Claude sign-in. You sign in to Claude Code yourself, on Anthropic's own page; the one-time code you paste into the extension's box is typed once into your own job's terminal on your cluster and is not stored, not logged and not sent anywhere else.
- Beethoven never keeps your cluster password or verification code. On the direct way you type them into its own sign-in sheet once; it sends them only to your cluster, inside the encrypted ssh session, after the cluster's host key matched the one it carries, and never stores, logs or sends them to its maintainer. On the portal path you type them into your browser's or your portal's own pages, which it never reads.
- Beethoven's key in your browser can never sign a worker in to Claude, open a terminal, transfer files or forward ports: its one line in your cluster account forces every use through a gate with eight fixed commands. Protecting it with Windows Hello or Touch ID is optional; Forget this computer removes it and its line.
- Beethoven's helper, which you install from inside the extension, connects only to your cluster's ssh port, holds no credential, keeps no log of what it carries and sends nothing to the maintainer.
- Beethoven runs no code it did not ship with. Its daily update check fetches a signed list, not a program.
- Beethoven asks for a website only from a click, one at a time: your university's Open OnDemand portal. It refuses an address on claude.ai, claude.com or anthropic.com before asking the browser for anything. Its only other requests go to the maintainer: the approval check (the account name your cluster accepted, your portal's address, the product name and its version, and the installation identifier, a random number made when its agreement is accepted, not derived from the device), sent only after your cluster accepted your sign-in; and a daily fetch of the service's address and the signed list of withdrawn versions, which carries nothing about you.
- Beethoven sends its maintainer no usage data, no error reports and no activation request; the approval check is the only thing it sends about you. Its audit log never contains what you typed to sign in and is never transmitted.
```

## URLs

| Field | Value |
|---|---|
| Official URL | `https://openspineconsortium.com/` once that site is verified in Google Search Console under the developer account's Google account (`PASTE.md` says how); empty until then |
| Homepage URL | `https://openspineconsortium.com/beethoven/` (the manifest's `homepage_url`) |
| Support URL | `https://openspineconsortium.com/beethoven/support.html` |
| Privacy policy | `https://openspineconsortium.com/beethoven/privacy.html` |
| Ask for access (in the description) | `https://openspineconsortium.com/` (the form is on the home page; `.../beethoven/request.html` is the same form and is what the panel's *Ask for access* button opens) |
| Terms (in the reviewed description) | `https://openspineconsortium.com/beethoven/terms.html` |

The six addresses answered 200 on 2026-09-30 (curl from WSL); they were not fetched again for 12.0.0.
`terms.html` and `privacy.html` must be regenerated from `LICENSE.txt` version 9 and `PRIVACY.md`
version 10 before submission (`docs/PUBLISHING_SITE.md`).

## Images and the promo video

**Out of date, not redone in this pass.** The five screenshots, the tiles and the promo video were
captured from 9.0.0 (`extension/store-assets/`): the setup page, the toolbar-button start, the old
panel. None shows 11.0.0's welcome page, journey, home or tour, or 12.0.0's helper, sign-in sheet or
Settings' Connection section. A screenshot of 9.0.0's setup page is a screen 12.0.0 does not have;
redo at least the screenshots from the 12.0.0 release build before submitting, to the rules below.

The rules (from 9.0.0): the store icon is the package icon flattened on the site's cream; every
product screen is a real capture of the release build, framed, never a drawn screen; a diagram may
be drawn, as it is on the site; every image or video frame that names Claude or claude.ai also
carries, small, "Not an Anthropic product."; no screenshot shows a real password, code, AccessID or
key fingerprint (use the mock account `st1234` and blur or fake nothing else); PNG 24-bit without
alpha, or JPEG, at the exact sizes. `PASTE.md` names the file for each field, and
`extension/store-assets/manifest.txt` says how each was made.

## The dashboard, field by field

`PASTE.md` beside this file: the Store listing tab in the order of the dashboard's fields, then the
Privacy practices tab, the Distribution tab and the Test instructions tab, each with the text in a
block to copy or the file to upload. The Test instructions tab (under *Access* in the dashboard's
left menu) is where reviewer notes go: a username box, a password box (100 characters each) and
Additional instructions (500 characters).

If the review asks for test access, answer with the letter in `SUBMISSION.md`, section 4, followed
by the fuller text from `PASTE.md`'s Test instructions section, and attach
`release/12.0.0/reviewer/beethoven-mock-portal.zip`. The recipe below is the same mock flow with more
explanation, for a follow-up question.

## Reviewer recipe (for a reply to the review)

For a reviewer who has the item installed from the store and the mock-portal-only zip
(`release/12.0.0/reviewer/beethoven-mock-portal.zip`): no build and no extension source. **The direct
way is not part of the mock.** The core tries it first whatever the portal (`core/steps.ts`
`connectionMode` reads the bridge and the key, not the portal), so on the mock too the panel first
offers "One small download, once"; the recipe has the reviewer press "Use GlobalProtect instead",
after which the mock carries the portal path as in 11.0.0. The helper's own source is in the package
under `bridge/`.

```
Beethoven starts, watches and stops a Claude Code job in the user's own account on their university's cluster and shows the user the link Claude Code prints when it registers with Anthropic's Remote Control feature. It reaches the cluster directly over ssh, through a small helper the user installs from inside the extension, or through the university's Open OnDemand web portal.

Why no live test account can be given: the extension works only against a university cluster, which needs a university account, its second factor (a Google Authenticator code) and, on the portal path, its VPN. No reviewer can be issued one, and we cannot lend ours (one person, one account is a term of the university and of Anthropic's service).

What you can do instead, with the item installed from the store: run our mock portal, attached as beethoven-mock-portal.zip. It holds server.mjs (a Node 22 server that serves the same routes the extension uses on the portal path: dashboard, Files, Active Jobs, the Shell WebSocket), a stand-in scheduler, a stand-in for the cluster-side tool and the server's one dependency (ws); it holds no extension code, and nothing needs installing or building. You need Node 22, bash and openssl. We have run it end to end only on Windows, with Git for Windows. The direct (ssh) way is not part of the mock: when the panel first offers "One small download, once" (the helper for the direct way), press "Use GlobalProtect instead". Recipe:

  1. Unzip beethoven-mock-portal.zip and open bash in the beethoven-mock-portal folder it makes.
  2. Make a localhost certificate there (in Git Bash, put MSYS_NO_PATHCONV=1 in front of the command):
     openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -subj /CN=localhost -days 30 -addext subjectAltName=DNS:localhost
  3. Start the mock as the reviewer account st1234:
     MOCK_LOGGED_IN=false node server.mjs --port 8443 --host localhost --user st1234 --cert cert.pem --key key.pem
  4. In Chrome, open https://localhost:8443/login , choose Advanced, "Proceed to localhost (unsafe)" (the certificate is the one you just made), and click "Sign in as st1234". There is no password.
  5. On the extension's welcome page (it opens on install), press "Not at Wayne State? Use another portal", type https://localhost:8443 and press "Use this portal". Tick the box and press "Agree and continue". Chrome asks to allow https://localhost:8443; allow it.
  6. If the panel first shows "One small download, once", press "Use GlobalProtect instead" (and "Continue" if it asks). The panel then works by itself: it reads the account name the mock's dashboard shows (st1234), asks our access service whether that account is approved (it is: st1234 is approved for exactly this recipe, from any installation, when the portal is localhost), shows the data statement (tick it, press Connect), opens the sign-in step (the mock prints a real-looking claude.ai authorize link with a mock client id, which Anthropic's page declines: close that tab, type any six letters or digits into the panel's box, press Continue), waits in line, and says "You're online." with "Open my session" (a made-up claude.ai/code link; no real session). Under the menu (the "More" button), "Details for your lab lead", "Run the checks" runs the extension's checks against the mock.

Please start the mock with --user st1234 and no other name: the extension sends the name the mock shows to our access service, which refuses any other and records the check. For a refused account the panel's one button is "Ask for access", which opens our request page with that name filled in.

What the extension never does: no code, host permission or content script on claude.ai, anthropic.com or claude.com (it opens those pages in a new tab only, and refuses an address on them before any permission request); no reading of any Claude credential; no keeping of the cluster password or code (on the direct way they go only into the encrypted ssh session, after the cluster's host key matched the pinned one); no remote code; no cookies, tabs, webRequest, debugger or identity permission; nativeMessaging only to talk to its own helper, whose registration names only this extension and which connects only to the cluster's ssh port; no install-time host permission. What it sends us: the approval check only (the account name the cluster accepted, the portal hostname, the product, the version and a random identifier the extension made for this installation, answered yes or no), and daily GETs of https://openspineconsortium.com/beethoven/services.json and https://openspineconsortium.com/beethoven/killlist.json without cookies; the approval check goes to https://beethoven-access.openspineconsortium.workers.dev/access_check, and its product field reads "bridge", the extension's name on the wire since its first version.

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher. It is not provided by or on behalf of any university, Anthropic or the Open OnDemand project.
```

The recipe's steps 5 and 6 follow 11.0.0's harness (scenario 1 on the mock: "Use another portal",
13 presses, `docs/V11_STATUS.md`). They were not walked on a 12.0.0 build: the 12.0.0 harness ran
the direct way's scenarios 13 to 16 against a local grid stand-in, not 11.0.0's scenarios 0 to 12
against the mock (`docs/V12_STATUS.md`). Walk them once on the release build and correct any word.

## No other store

Edge Add-ons, Firefox Add-ons and Safari are not used from 8.0.0 (decided 2026-09-30): one private
listing is what keeps the extension with the students the maintainer approved. `npm run build` and
`npm run zip` still produce a Firefox package, because the code builds for it; nothing uploads it.
The helper's installers are for Chrome's native messaging only.
