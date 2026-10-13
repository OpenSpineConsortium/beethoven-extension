# Store listing texts

The exact texts to paste into the Chrome Web Store dashboard for Beethoven 20.0.0, and the answers
to its questions. Written 2026-09-29 from the decision for 4.0.0 (no licence keys; approval of the
account the portal shows, confirmed with the access service), brought up to date for 6.0.0 to 10.0.0
(the lab's shared copy of the cluster-side tool; the public name Beethoven; a **Private** item whose
trusted testers are the Google Group of approved students; one installation per approved account;
the site's theme; an Anthropic address refused before any permission request), rewritten on
2026-10-02 for 12.0.0, brought up to date on 2026-10-04 for 15.0.0 (13.0.0 and 14.0.0 left these
texts as they were), rewritten again on 2026-10-08 for 16.0.0, which removed the direct way of
12.0.0 to 15.0.0 whole, and brought up to date on 2026-10-09 for 19.0.0, in which Beethoven signs in
to the grid itself (17.0.0 and 18.0.0 left these texts as they were), on 2026-10-11 for 20.0.0,
in which one approval covers every installation of the student's own (the description's approval
line and its access link, the reviewed text's needs, and the privacy answer), and on 2026-10-13 for
20.0.0's public listing (the description's approval line again, the privacy answer, the site's card;
agreement version 14, privacy statement version 15).
11.0.0 (2026-10-01) was built but never submitted, and its store documents
were never brought up to date (`docs/V11_STATUS.md`, section 5), so the 12.0.0 rewrite carried both:

- **11.0.0**: a welcome page with one tick and "Agree and continue" replaces the setup page with its
  scroll gate and typed name; the panel is window-wide and opens from the toolbar button;
  `activeTab` is gone; the page script is never registered, only injected into tabs the extension
  opened itself; agreement version 8, privacy statement version 9.
- **12.0.0** (removed whole in 16.0.0): the extension tries the **direct way** first: an ssh
  connection to the university cluster's login node (`grid.wayne.edu`, port 22), with no VPN,
  carried by **the helper**, a small script that ships inside the package and that the user installs
  once, without administrator rights. The first direct sign-in asks for the AccessID, the password
  and the Google Authenticator code in the extension's own sign-in sheet; they go only to the
  cluster, inside the encrypted session, after the cluster's host key matched the pin, and are never
  stored. The extension then keeps a key of its own, encrypted, in the browser, and the cluster
  account gets one restricted line that lets that key run only a short list of commands. Protecting
  the key with Windows Hello or Touch ID is optional and off by default. Without the helper, the
  portal path of 11.0.0 is used. New permission: `nativeMessaging`. New data type: authentication
  information. Agreement version 9, privacy statement version 10.

**15.0.0** (removed in 16.0.0) changes the helper on Windows and macOS: there it is a small compiled
program (Rust, with no code of anyone else's but its standard library and the runtime support code
its compiler links in; its source was `helper/src/rust`), in an installer signed by the maintainer
that ships inside the package beside the script zips: `beethoven-bridge-windows.msi` (Authenticode,
through Azure Artifact Signing) and `beethoven-bridge-mac.pkg` (Developer ID, notarized by Apple).
Both install into the user's own account with no administrator rights, and both name the store
item's ID, written into them when they are built; a copy of the extension with another ID is offered
the script zip, as before. Linux keeps the script. No new permission and no new data type. Agreement
version 10, privacy statement version 11.

**16.0.0** (2026-10-08) removes the direct way whole: the helper (the bridge, its script zips and
its signed installers), the sign-in sheet, the browser's key and its line in the cluster account,
the Windows Hello / Touch ID protection, "Forget this computer", "Use GlobalProtect instead" and the
`nativeMessaging` permission. One way remains, 11.0.0's: the university's VPN (at Wayne State
GlobalProtect, connected to `protect.wayne.edu`) and the student's own Open OnDemand portal, in the
browser's own signed-in session. The manifest is 11.0.0's again (`storage`, `alarms`, `scripting`,
`sidePanel`, the optional host `https://*/*`), the package holds no `bridge/`, and the
Authentication information data type is No again. New: a Connect pressed while the grid is out of
reach is kept, the panel shows the GlobalProtect screen with a link to the university's own page,
and the press goes ahead by itself once the grid answers; Settings notes once a key an earlier
version added to the grid account. Agreement version 11, privacy statement version 12.

**19.0.0** (2026-10-09): Beethoven signs in to the grid (the maintainer's decision of 2026-10-09).
The panel's sheet *Sign in to the grid* takes the AccessID and password and, on a portal that signs
in with HTTP Basic, as Wayne State's does, the extension's background answers the portal's sign-in
for its own request to the portal's dashboard, on the one granted portal origin, once per check,
never a tab's (the tab gets Chrome's own box), a proxy's or another site's. One refusal stops it
until the student types the password again. Saving the password is optional and off unless the
student ticks *Remember it on this computer*; a saved password is AES-GCM ciphertext in the
extension's IndexedDB under a key that a platform passkey named "<AccessID> (grid)" releases with
Windows Hello, Touch ID or the screen lock; Settings' *Forget* deletes it. *Use Chrome's sign-in box
instead* keeps 18.0.0's way (the portal in a tab, Chrome's own box). New permissions: `webRequest`
and `webRequestAuthProvider` (Chrome build only; neither shows an install warning;
`webRequestBlocking` is still never requested). New data type: Authentication information, ticked
again. This is not the direct way of 12.0.0 to 15.0.0: no ssh, no helper, no one-time code, and the
VPN is still needed. The old passkey of 12.0.0 to 15.0.0 is named with the AccessID alone or
"beethoven" and can go; the one 19.0.0 uses for the grid sign-in is named "<AccessID> (grid)" and is
deleted only after *Forget*. Agreement version 12, privacy statement version 13.

**20.0.0** (2026-10-11): one person's approval, every installation of their own (the maintainer's
decision of 2026-10-11). An approved account is approved from every installation that asks about it:
a second computer, another Chrome profile or a reinstallation works at its first check, where 8.0.0
to 19.0.0 refused it until the maintainer moved the approval. The access service records each
installation the account asks from (its random identifier, the product, the version, first and last
seen), keeps the ten most recent, and e-mails the maintainer, at most once a day per account, when a
new one asks, with one link that withdraws the approval and none that moves it. An installation
still serves one account. Nothing new is sent or read: the check carries what it carried, and the
identifier is still random and says nothing about the device. Agreement version 13, privacy
statement version 14.

There is no other store, no download and no signed file: the package is the extension alone, and
nothing of it is ever on the website. (12.0.0 to 15.0.0 offered the helper's installers from inside
the package, the two for Windows and macOS signed; 16.0.0 offers none.)

**`PASTE.md` beside this file is the paste sheet**: every dashboard field in the dashboard's order,
with the text to paste or the file to upload. This file holds the texts and the reasons behind them;
`SUBMISSION.md` says what to do around the paste (registration, the group, the review). Before
anything is pasted, read the built extension (`extension/.output/chrome-mv3`) once more for every
`fetch`, `WebSocket` and `tabs.create` and confirm the facts below.
`../STORE_LISTING.md` is an older, longer compliance document (8.0.0 to 10.0.0 wording).

Facts every text below rests on (settled against the working tree on 2026-10-02 by fixer B, after the
build streams and the four reviews, again on 2026-10-08 for 16.0.0 against
`extension/src/core/model.ts`, `extension/wxt.config.ts` and
`extension/src/entrypoints/background.ts`, and on 2026-10-09 for 19.0.0 against the 19.0.0 build
specification, while the background and the pages were being built beside these texts; read the
built extension once more for the sign-in before pasting):

- The extension reaches the user's cluster in one way, 11.0.0's: requests to the student's own Open
  OnDemand portal, from the extension's background with the sign-in the browser keeps, and the
  portal's Shell WebSocket, behind the university's VPN (at Wayne State GlobalProtect, connected to
  `protect.wayne.edu`). Chrome is asked for the portal's one origin inside the click on "Agree and
  continue". While the grid is out of reach the panel shows "Turn on GlobalProtect." with "How to
  set it up" (the university's own page, from the site profile's `vpn_help_url`) and asks the
  portal's address, without credentials, whether it answers: every 3 seconds while a Beethoven page
  is open, once a minute while none is. A Connect pressed then is kept ("Beethoven carries on by
  itself as soon as the grid answers.") and goes ahead by itself when the grid answers. The direct
  way of 12.0.0 to 15.0.0 (ssh through a helper, no VPN) is gone.
- The extension makes requests to its maintainer in two kinds only. The approval check, a POST sent
  without cookies to the `access_check` address named in
  `https://openspineconsortium.com/beethoven/services.json`
  (`https://beethoven-access.openspineconsortium.workers.dev/access_check`), carrying the account
  name the portal's dashboard shows for the browser's session (never a typed one), the portal's
  hostname, the product (`bridge`), the version and the installation identifier (32 random
  hexadecimal characters made when the agreement is accepted), answered yes or no; made only after
  the agreement is accepted and the portal has shown the account. And the daily GETs of
  `services.json` and `killlist.json`, without cookies, carrying no data about the person.
- The user types their AccessID and cluster password into Beethoven's own sheet, *Sign in to the
  grid* in the panel, or, by choice ("Use Chrome's sign-in box instead"), into the browser's own
  sign-in box in a portal tab, which the extension never reads. From the sheet the password goes
  only to the portal: the background's one `webRequest.onAuthRequired` listener answers the HTTP
  Basic challenge of the extension's own request to the portal's dashboard (no tab, the extension as
  initiator), on the granted origin and, once one is recorded, realm, once per check, and never a
  tab's, a proxy's or another origin's. The first refusal stops every automatic sign-in until the
  student types the password again; Beethoven itself sends a password the grid turns down at most
  once. Chrome re-sends its cached copy once for each request already started with it before the
  first refusal comes back; Beethoven then sends at most one; when the answered request is abandoned
  before the grid replies, Chrome may re-send that copy once. How many of these the grid counts is
  not yet measured. The password is saved only when the student ticks *Remember it on this computer*
  (never pre-ticked): AES-GCM ciphertext in IndexedDB under a key derived from the PRF output of a
  platform passkey named "<AccessID> (grid)", unlocked with Windows Hello, Touch ID or the screen
  lock once per browser session; unticked, it is held in `storage.session` for one attempt and at
  most two minutes. It never appears in a message, a log, the audit log, `storage.local` or argv,
  and never reaches the maintainer. No HTML sign-in page or identity provider is filled in and no
  multi-factor step is touched; on a portal that redirects to an identity provider the sheet can
  answer nothing, and only "Use Chrome's sign-in box instead" signs the user in. In the one-time key
  step, when the portal's shell asks for a password, the student types it into the university's own
  terminal page, and Beethoven's page script reads only that page's title and types one setup line
  after "I'm in"; Beethoven never types a password into a shell.
- Nothing of the direct way stays. On the first run after the update the extension removes what
  12.0.0 to 15.0.0 left in the browser, the key unread. A key one of them added to the cluster
  account is noted once in Settings ("A key from an earlier version", with its date; "Forget"
  removes only the note), the lab lead removes the key, and the extension never types a command for
  it.
- It opens pages in new tabs and runs nothing on them: the portal's own pages, Anthropic's sign-in
  page (only an https address on claude.ai or claude.com, printed by the sign-in sitting), the
  session's `https://claude.ai/code?environment=...` link, `https://claude.ai/settings/connectors`,
  the plans page from "See plans", the university's own pages from the welcome page's three needs
  ("How to get one" for the grid account, "How to set it up" for GlobalProtect) and from the
  GlobalProtect screen, each only when chosen, and, from the *Ask for access* button, the
  maintainer's request page with the account name in its address. The one QR code is drawn on the
  device, from the home's "Phone" button, and encodes only the session's claude.ai link.
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
- The package is `release/19.0.0/beethoven-19.0.0-chrome.zip`, a copy of
  `extension/.output/beethoven-19.0.0-chrome.zip` (`npm run zip` in `extension/`, after `npm ci`,
  `npm run typecheck`, `npm test` and `npm run build`; the Firefox zip the same command writes is
  not submitted anywhere; `SUBMISSION.md`, section 0, item 1). Besides the fonts of 9.0.0, the icons
  and the tour it holds the site profiles as data and the two agreement texts, and nothing of the
  cluster side's code: no `bridge/`, no installer, no script, no signed file, and nothing that names
  the store item's ID. The maintainer uploads it with his own tool, `node
  extension/scripts/publish-store.mjs` (a Desktop OAuth client in his own Google Cloud project, its
  sign-in kept in the vendor folder on his own computer; no key in the repository or in CI), or by
  hand under the item's Package tab.
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
`extension/test/hygiene.test.ts` fails above 132). It stays true of 19.0.0: the cluster is an Open
OnDemand cluster, reached through its portal.

## Detailed description (the one to paste; plain text; 1,599 characters; under Chrome's limit of 16,000)

Rewritten 2026-10-02 for 12.0.0 in the voice of 9.0.0's text, for a student who reads it in twenty
seconds, on 2026-10-08 for 16.0.0 (step 2, the paragraph under the steps, the needs and the data
paragraph), and on 2026-10-09 for 19.0.0 (step 2 and the data paragraph). Counted with Python as
Unicode characters without a trailing newline: 1,599 (1,620 if the dashboard counts each of its 21
line breaks as two characters). ASCII only. Every sentence rests on the facts above: the data
paragraph names what the approval check carries about the person and says that the password goes
only to the grid and is kept only if the student asks. It does not advertise the *Remember* tick:
Wayne State's own standard tells its people to type a password each time (`docs/guides/USE.md`).

```
Your grid. From claude.ai.

Beethoven starts a Claude Code worker in your own account on the Wayne State grid and opens it in claude.ai. Ask there or in the Claude app, and your worker does the work.

HOW IT WORKS
1. Accept the agreement on Beethoven's welcome page.
2. Turn on GlobalProtect, then type your AccessID and password into Beethoven's sign-in sheet. Beethoven signs in to the grid for you, in the background.
3. Sign in to Claude once, on Anthropic's own page.
4. Click Open my session. Your worker runs until you press Stop.

If the grid is out of reach, Beethoven waits and carries on by itself as soon as GlobalProtect is on. Nothing is installed outside Chrome.

YOU NEED
A Wayne State AccessID with a grid account, GlobalProtect, Chrome on Windows, macOS or Linux, and Claude Pro or Max.

By approval only: ask at https://openspineconsortium.com/beethoven/
One approval covers every installation of your own: your computers and your Chrome profiles.

YOUR DATA
To check your approval, Beethoven sends our access service the account name the grid's website shows and a random installation identifier, with your portal's address and the version. It sends nothing else about you. Your password goes only to the grid, never to us, and Beethoven keeps it, encrypted on this computer, only if you ask it to. The service records each check with a salted hash of the network address it came from, never the address. Privacy: https://openspineconsortium.com/beethoven/privacy.html

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks.
```

## Reviewed description (reviewer-facing; plain text; 6,420 characters; not pasted into the dashboard)

Rewritten 2026-10-02 for 12.0.0 from 10.0.0's reviewed text, sentence by sentence against the facts
above, on 2026-10-04 for 15.0.0 in one place (the helper's sentence in step 2), on 2026-10-08
for 16.0.0, which took the direct way out of every section (the needs, steps 2 and 3, three negative
statements and what it keeps), and on 2026-10-09 for 19.0.0 (step 2, the password statement and
what it keeps). If a reviewer asks what the extension does, never does or keeps,
reply with it (with the reviewer recipe below and `SUBMISSION.md`, section 4). The detailed
description above is condensed from it and narrowed to Wayne State (the only site profile with a
shared copy), and makes no claim this one does not support.

```
Beethoven starts, watches and stops a Claude Code worker in your own account on your university's cluster, and hands you the link that shows that worker at claude.ai/code and in the Claude app (Anthropic's Remote Control feature).

WHAT YOU NEED
- An account on a cluster where your lab keeps the shared copy of Beethoven's cluster-side scripts, and whatever your university needs to reach its Open OnDemand portal. At Wayne State: a grid account and the GlobalProtect VPN.
- Your own Claude account on a plan that includes Claude Code Remote Control (Pro or Max).
- Approval of your cluster account by the maintainer. The Trial Edition is free for approved institutional accounts; ask for access at https://openspineconsortium.com/beethoven/request.html with your account name. Installing Beethoven from this listing needs no invitation; it starts a worker only for an approved account. There is no licence key.
- Your own computers. An approval covers every installation you use yourself; a second computer, another browser profile or a reinstallation works at its first check, and the maintainer is told that a new installation asked. One installation serves one account.

HOW IT WORKS
1. Accept the agreement on the welcome page that opens on install: one tick and "Agree and continue". The full text is one click away, and can be saved and printed. The welcome page names the three things you need, each with a link to your university's or Anthropic's own page.
2. Turn on your university's VPN (at Wayne State, GlobalProtect) and type your AccessID and password into Beethoven's sign-in sheet; Beethoven signs in to your Open OnDemand portal for you, in the background. You can choose the browser's own sign-in box in a portal tab instead, which Beethoven never reads. While the grid is out of reach, the panel says "Turn on GlobalProtect." with a link to your university's own page about it, and carries on by itself as soon as the grid answers; a Connect pressed in the meantime is kept, not dropped. Nothing is installed outside the browser.
3. Where your work goes: read the four lines, tick, Connect. Sign in to Claude once, when the panel asks: it opens Anthropic's sign-in page in a new tab; you sign in with your own account and paste the code the page shows into the panel's one box. The code is typed once into your own job's terminal and is not kept.

When your worker connects, your session's claude.ai page opens in a new tab (you can turn that off), and the panel's "Open my session" opens it again. The worker stays on by itself until you press Stop.

WHAT IT NEVER DOES
- It has no site permission on claude.ai or any Anthropic page and never asks for one: it runs no code there, reads nothing there and changes nothing there. It only opens those pages in a new tab, as a bookmark would; an address on claude.ai, claude.com or anthropic.com is refused as a portal before any permission request.
- It never sees your Claude sign-in. The one-time code you paste is passed once to your own cluster shell and is not stored, not logged and not sent anywhere else.
- It sends your cluster password only to your portal: only to the HTTP sign-in your portal asks of Beethoven's own background request, on the one portal site you allowed, once per check, never to a sign-in a tab, a proxy or another site asks for. When the portal turns the password down, it stops and does not send it again until you type it again; Chrome re-sends its cached copy once for each request already started with it before the first refusal comes back; Beethoven then sends at most one; when the answered request is abandoned before the grid replies, Chrome may re-send that copy once. How many of these the grid counts is not yet measured. It never fills in a sign-in page or an identity provider's page, never touches a multi-factor step, and never sends the password to the maintainer or writes it to a log.
- Its only other requests go to the maintainer: the approval check (the account name your portal shows, your portal's address, the product name and its version, and the random identifier of this installation), sent only after your portal has shown your account; and a daily download of the service's address and the signed list of withdrawn versions, which carries nothing about you.
- It reads nothing from your computer's hardware. The installation identifier is a random number it makes for itself.
- It runs no code it did not ship with. Its once-a-day update check downloads a signed list, not a program, and the package holds no program besides the extension itself.
- It sends the maintainer no usage data, no error reports and no activation request.
- It never deletes your files. It removes only its own state files, and cancels only the job it started.

WHAT IT KEEPS
On your device only: the portal address, your preferences, your acceptance of the agreement, the account name your portal showed and the last approval answer, the random identifier of this installation, your statement about each workspace, an audit log of every request it made to your portal, which you can read, export and clear, and your grid sign-in, only if you tick "Remember it on this computer" (never ticked for you): encrypted, under a key your passkey releases with Windows Hello, Touch ID or your screen lock, until you press Forget. Unticked, the password is held in memory for one sign-in and at most two minutes. If an earlier version of Beethoven added a key to your cluster account, Settings says so once, with its date, and your lab lead can remove it; Beethoven no longer uses or touches it. Privacy statement: https://openspineconsortium.com/beethoven/privacy.html

ACCESS AND TERMS
Beethoven is licensed, not sold, and works only from an institutional account the maintainer has approved, on the installations of your own. The Trial Edition is free for approved institutional accounts and ends by itself; nothing converts into a paid licence and no payment details are taken. Terms: https://openspineconsortium.com/beethoven/terms.html  Support: https://openspineconsortium.com/beethoven/support.html

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher. Beethoven is not provided by or on behalf of any university. It is a research and teaching tool, not a medical device. Offered in the United States.
```

## Single-purpose statement

Unchanged since 8.0.0.

```
Start, monitor and stop a Claude Code worker on your university's Open OnDemand cluster and hand you its Remote Control link.
```

## Permission justifications (one sentence or two each, as the dashboard asks for them)

19.0.0's Chrome manifest asks for `storage`, `alarms`, `scripting`, `sidePanel`, `webRequest` and
`webRequestAuthProvider` (all required; `extension/wxt.config.ts`), and the one optional host
permission `https://*/*`; `activeTab` left with 11.0.0, and `nativeMessaging`, which 12.0.0 to
15.0.0 asked for, left with 16.0.0. `webRequest` and `webRequestAuthProvider` are new in 19.0.0 and
show no line in Chrome's install dialog, so an installed copy updates without being disabled; a
`webRequest` permission invites a closer review. The Firefox build, which is not submitted anywhere,
has neither of them and no `sidePanel`.

| Permission | Justification |
|---|---|
| `storage` | Remembers, on your device: the portal address, your preferences, your acceptance of the agreement, the account name your portal showed with the last approval answer, this installation's random identifier, your statement about each worker's workspace, the audit log of requests made to your portal, your grid sign-in, encrypted, if you chose to save it, and, until you dismiss it, a note that an earlier version added a key to your cluster account (its date and fingerprint, never the key). |
| `alarms` | Reads your running worker's status no more than once a minute, renews the approval check and fetches the signed withdrawn-versions list once a day, and keeps doing so after the browser suspends the extension. |
| `scripting` | Loads the extension's page script only into a tab the extension opened itself on the one portal site you allowed: where your portal does not share its sign-in with the extension's own requests, and on the portal's terminal page for its one-time key step, where it reads only the page's title and types one line. No page script is registered or loaded anywhere else. |
| `sidePanel` | Opens the extension's panel at the side of the window when you click the toolbar button; there is no popup. |
| `webRequest` | Lets the extension learn, on the one portal site you allowed, of sign-in requests and of when requests end, your tabs' included, so it knows whether the grid accepted the password it gave its own background request and stops at the first refusal. It acts on no request but that one and reads no page; a tab's sign-in goes straight back to Chrome's own box. Of your tabs' requests it keeps one mark only, and only while its own answer awaits its outcome: that a portal tab asked for a sign-in or had a request answered without a refusal meanwhile (you may have signed in in Chrome's box), after which it holds a saved password until you type one. |
| `webRequestAuthProvider` | Lets the extension answer that one sign-in request, once per check, with the AccessID and password you typed into its own sign-in sheet (or saved behind your passkey), so the grid signs you in without a separate tab. If the portal asks again after that answer, the extension declines instead of sending the password twice. It never answers a sign-in that a tab, a proxy or another site asks for, redirects or rewrites no request, and after the first refusal it sends nothing until you type the password again. |
| Optional host permission `https://*/*` (requested at runtime for one origin) | Your university's Open OnDemand portal has an address the extension cannot know in advance, so no site is granted at install. The extension asks the browser for one origin at a time, and only inside a click: "Agree and continue" on its welcome page (your university's portal, filled in from the site profile, or the address you typed under "Use another portal"), "Allow again" in its panel if the grant was removed, or "Change" in its Settings. It refuses to work through a portal until that one site is granted. An address on claude.ai, claude.com or anthropic.com, or on any of their subdomains, is refused before any request, so the extension never requests an Anthropic origin. |

`nativeMessaging` was asked for by 12.0.0 to 15.0.0, for the helper, and was a required permission,
so Chrome's install dialog then read "Communicate with cooperating native applications". 16.0.0 does
not ask for it: the manifest is 11.0.0's again, and 11.0.0's list of permissions never requested
holds once more. A copy updated from a 12.0.0 to 15.0.0 build loses a permission, which Chrome does
not prompt for, and the extension removes what the direct way left in the browser on its first run.

The host-permission sentence is 11.0.0's: the request now comes from the welcome page's "Agree and
continue", the panel's "Allow again" or Settings' "Change", never from the toolbar button (which only
opens the panel) and never from a setup page (gone). The welcome page asks for the portal at "Agree
and continue" (`extension/src/ui/welcome.ts`); it is the one way's first step.

Never requested: `activeTab`, `cookies`, `tabs`, `webRequestBlocking`, `declarativeNetRequest`,
`debugger`, `identity`, `clipboardRead`, `nativeMessaging` (12.0.0 to 15.0.0 only); any install-time
host permission. `webRequest` was on this list until 18.0.0; 19.0.0 asks for it with
`webRequestAuthProvider` for the one listener above, and still never for `webRequestBlocking`.

## Remote code

Answer: **No.** Justification if a field asks for one:

```
No remote code. No eval, no new Function, no fetched scripts, no interpreter for remote commands. The daily update check downloads one JSON document (a signed list of withdrawn versions) and verifies its Ed25519 signature with WebCrypto against a public key compiled into the package; JSON is data. Commands to the cluster are a small fixed vocabulary interpreted by shipped code, and the lines the cluster prints are parsed as text and never executed. The extension never downloads or runs code from anywhere, and the package holds no program besides the extension itself: no helper, no installer, no script. The cluster-side tool is the one shared copy the university's lab keeps on the cluster; nothing from the cluster is ever executed in the browser. Fonts are files inside the package.
```

## Privacy practices

| Question | Answer |
|---|---|
| Does the extension collect or transmit user data? | Yes, two kinds. **Personally identifiable information**: the institutional account name the user's portal shows and the random identifier of this installation, sent to the developer's access service in the approval check (with the portal's hostname, the product and the version). **Authentication information**: Yes. The user's AccessID and cluster password, typed into the extension's own sign-in sheet, are sent only to the user's own university portal, as the answer to its HTTP sign-in, and never to the developer; the password is kept only if the user ticks "Remember it on this computer", and then only encrypted on the device, under a key the user's passkey releases (12.0.0 to 15.0.0 answered Yes for the direct way's sign-in sheet; 16.0.0 to 18.0.0 answered No). Nothing else: no communications, no website content, no browsing history, no user activity, no location, no financial or health data. |
| Is a privacy policy provided? | Yes: https://openspineconsortium.com/beethoven/privacy.html (version 15 names the public listing, the approval check, what the developer records from it, the installations it keeps per approved account, what your portal sees, what stays on the device, the grid sign-in Beethoven makes and the password it keeps only if you ask, where the passkey lives, what happens when the portal's shell asks for your password, and what an earlier version may have left). |
| Certifications (Chrome's three) | I do not sell or transfer user data to third parties outside the approved use cases; I do not use or transfer user data for purposes unrelated to the item's single purpose; I do not use or transfer user data to determine creditworthiness or for lending purposes. |
| Limited Use statement (on the landing page and the reviewers page) | Beethoven's use of information received from your browser complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. |

## The negative statements (word for word as on the public reviewers page, `/beethoven/reviewers.html`)

Final for 19.0.0 (2026-10-09): the website's reviewers page takes this block word for word. It keeps
16.0.0's statements about Anthropic's pages, the Claude sign-in, what the extension installs, remote
code and what it sends; the cluster-password statement is replaced by two (where the password goes,
and when it is kept).

```
- Beethoven has no site permission on claude.ai or any Anthropic page and never asks for one. It does not run on those sites, does not read them and does not change them. It opens an Anthropic page in a new tab only as a bookmark would (the sign-in page Claude Code printed during a sitting you started, your session's claude.ai/code link, the connectors settings page for the optional Google Drive step, the plans page); nothing of the extension runs there.
- Beethoven never sees your Claude sign-in. You sign in to Claude Code yourself, on Anthropic's own page; the one-time code you paste into the extension's box is typed once into your own job's terminal on your cluster and is not stored, not logged and not sent anywhere else.
- Beethoven sends your cluster password nowhere but your university's portal. When you type your AccessID and password into Beethoven's own sign-in sheet, it answers only the HTTP sign-in your portal asks of Beethoven's own background request, on the one portal site you allowed, once per check; it never answers a sign-in that a tab, a proxy or another site asks for (a tab gets your browser's own box). When the portal turns the password down, Beethoven stops and does not send it again until you type it again: Beethoven itself sends a password the portal turns down at most once. Chrome re-sends its cached copy once for each request already started with it before the first refusal comes back; Beethoven then sends at most one; when the answered request is abandoned before the grid replies, Chrome may re-send that copy once. How many of these the grid counts is not yet measured. Beethoven never fills in a sign-in page or an identity provider's page, never touches a multi-factor step, never types a password into a shell, never writes the password to a log or its audit log, and never sends it to the maintainer.
- Beethoven keeps your cluster password only if you tick "Remember it on this computer", which is never ticked for you, and then only encrypted (AES-GCM) in the extension's own storage on this computer, under a key that only your passkey releases, opened with Windows Hello, Touch ID or your screen lock (the passkey stays with your computer or your password manager, which may sync it as it syncs any passkey). Unticked, the password is held in the browser's memory for one sign-in and at most two minutes. "Forget" in Settings deletes the saved copy. Chrome itself keeps the sign-in it was given until it closes.
- Beethoven installs nothing outside the browser: no helper, no native program, no installer. Versions 12.0.0 to 15.0.0 had a direct way over ssh through such a helper; 16.0.0 removed it whole, with its permission. The sign-in sheet of 19.0.0 is not that way: no ssh, no helper, and the university's VPN is still needed.
- Beethoven runs no code it did not ship with. Its daily update check fetches a signed list, not a program.
- Beethoven asks for a website only from a click, one at a time: your university's Open OnDemand portal. It refuses an address on claude.ai, claude.com or anthropic.com before asking the browser for anything. To learn whether the portal is reachable, it sends the portal's address a request that carries no sign-in or cookie and learns only whether an answer came (every three seconds at most while it waits for the VPN with one of its pages open). Its only other requests go to the maintainer: the approval check (the account name your portal's dashboard showed, never the one you typed to sign in; your portal's address; the product name and its version; and the installation identifier, a random number made when its agreement is accepted, not derived from the device), sent only after the portal accepted your sign-in; and a daily fetch of the service's address and the signed list of withdrawn versions, which carries nothing about you.
- Beethoven sends its maintainer no usage data, no error reports and no activation request; the approval check is the only thing it sends about you. Its audit log never contains what you typed to sign in and is never transmitted.
```

## URLs

| Field | Value |
|---|---|
| Official URL | `https://openspineconsortium.com/` once that site is verified in Google Search Console under the developer account's Google account (`PASTE.md` says how); empty until then |
| Homepage URL | `https://openspineconsortium.com/beethoven/` (the manifest's `homepage_url`) |
| Support URL | `https://openspineconsortium.com/beethoven/support.html` |
| Privacy policy | `https://openspineconsortium.com/beethoven/privacy.html` |
| Ask for access (in the description) | `https://openspineconsortium.com/beethoven/` (the form is on Beethoven's page, which was the site's home page until 2026-10-11, when the home page became the lab's; `.../beethoven/request.html` is the same form and is what the panel's *Ask for access* button opens) |
| Terms (in the reviewed description) | `https://openspineconsortium.com/beethoven/terms.html` |

The six addresses answered 200 on 2026-09-30 (curl from WSL); they were not fetched again for 12.0.0,
15.0.0, 16.0.0, 19.0.0 or 20.0.0. `terms.html` and `privacy.html` must be regenerated from `LICENSE.txt` version 14
and `PRIVACY.md` version 15 before submission (`docs/PUBLISHING_SITE.md`), and the upload waits until
https://openspineconsortium.com/beethoven/privacy.html shows version 15.

## Images and the promo video

**Out of date, not redone in this pass.** The five screenshots, the tiles and the promo video were
captured from 9.0.0 (`extension/store-assets/`): the setup page, the toolbar-button start, the old
panel. None shows 11.0.0's welcome page, journey, home or tour, or 16.0.0's GlobalProtect screen
with its link; 12.0.0's helper, its sign-in sheet (with the code field) and Settings' Connection
section are screens 19.0.0 does not have, so none may appear either. A screenshot of 9.0.0's setup page is a screen 16.0.0 does
not have; redo at least the screenshots from the 20.0.0 release build before submitting (not yet
captured), to the rules below. 19.0.0's sign-in sheet, unlock screen and Settings' *Your grid* card are
new screens; a capture of the sheet shows the mock account `st1234` and an empty or dotted password
field, never a real one.

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
`release/19.0.0/reviewer/beethoven-mock-portal.zip` (made by hand with the release, as 12.0.0's
was; its `server.mjs` must be 19.0.0's, which has `--auth basic`). The recipe below is the same mock flow with more explanation, for a follow-up question.

## Reviewer recipe (for a reply to the review)

For a reviewer who has the item installed from the store and the mock-portal-only zip
(`release/19.0.0/reviewer/beethoven-mock-portal.zip`): no build and no extension source. The mock
runs in `--auth basic`, the HTTP Basic sign-in Wayne State's portal answers with, so the reviewer
sees 19.0.0's sign-in sheet do what it does on the grid: the panel looks for the grid (on localhost
it answers at once), asks for the AccessID and password, signs in from its background and goes on by
itself. There is no download, no helper and nothing to skip.

```
Beethoven starts, watches and stops a Claude Code job in the user's own account on their university's cluster and shows the user the link Claude Code prints when it registers with Anthropic's Remote Control feature. It reaches the cluster through the university's Open OnDemand web portal, in the user's own browser session, behind the university's VPN.

Why no live test account can be given: the extension works only against a university cluster, which needs a university account, its second factor and its VPN. No reviewer can be issued one, and we cannot lend ours (one person, one account is a term of the university and of Anthropic's service).

What you can do instead, with the item installed from the store: run our mock portal, attached as beethoven-mock-portal.zip. It holds server.mjs (a Node 22 server that serves the same routes the extension uses on the portal: dashboard, Files, Active Jobs, the Shell WebSocket), a stand-in scheduler, a stand-in for the cluster-side tool and the server's one dependency (ws); it holds no extension code, and nothing needs installing or building. You need Node 22, bash and openssl. We have run it end to end only on Windows, with Git for Windows. Recipe:

  1. Unzip beethoven-mock-portal.zip and open bash in the beethoven-mock-portal folder it makes.
  2. Make a localhost certificate there (in Git Bash, put MSYS_NO_PATHCONV=1 in front of the command):
     openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -subj /CN=localhost -days 30 -addext subjectAltName=DNS:localhost
  3. Start the mock as the reviewer account st1234, with the HTTP Basic sign-in the university's portal uses (the mock's password is mockpass, a made-up one):
     MOCK_LOGGED_IN=false node server.mjs --port 8443 --host localhost --user st1234 --auth basic --cert cert.pem --key key.pem
  4. In Chrome, open https://localhost:8443/ , choose Advanced, "Proceed to localhost (unsafe)" (the certificate is the one you just made). The mock's public start page appears; leave it there and do not press its LOGIN link (that would sign Chrome in through its own box, and the extension would find the grid already signed in).
  5. On the extension's welcome page (it opens on install), press "Another university? Use another portal", type https://localhost:8443 and press "Use this portal". Tick the box and press "Agree and continue". Chrome asks to allow https://localhost:8443; allow it.
  6. The panel shows "Sign in to the grid". Type st1234 as the AccessID and mockpass as the password and press "Sign in": the extension signs in from its background, with no tab. Leave "Remember it on this computer" unticked; if you tick it, Chrome asks to make a passkey named "st1234 (grid)" with Windows Hello, Touch ID or your screen lock, and Settings, "Your grid", "Forget" deletes the saved sign-in again. A wrong password shows "That password didn't work, and Beethoven stopped." and is not sent again until you type one again. "Use Chrome's sign-in box instead" opens the mock in a tab with Chrome's own box, the other way.
  7. The panel then works by itself: it looks for the grid (localhost answers at once), reads the account name the mock's dashboard shows (st1234), asks our access service whether that account is approved (it is: st1234 is approved for exactly this recipe, from any installation, when the portal is localhost), shows the data statement (tick it, press Connect), opens the sign-in step (the mock prints a real-looking claude.ai authorize link with a mock client id, which Anthropic's page declines: close that tab, type any six letters or digits into the panel's box, press Continue), waits in line, and says "You're online." with "Open my session" (a made-up claude.ai/code link; no real session). Under the menu (the "More" button), "Details for your lab lead", "Run the checks" runs the extension's checks against the mock.

Please start the mock with --user st1234 and no other name: the extension sends the name the mock shows to our access service, which refuses any other and records the check. For a refused account the panel's one button is "Ask for access", which opens our request page with that name filled in.

What the extension never does: no code, host permission or content script on claude.ai, anthropic.com or claude.com (it opens those pages in a new tab only, and refuses an address on them before any permission request); no reading of any Claude credential; the cluster password typed into its own sign-in sheet goes only to the portal, as the answer to the HTTP sign-in the portal asks of the extension's own background request, once per check, never to a tab's, a proxy's or another site's, and nothing more after the first refusal (Chrome re-sends its cached copy once for each request already started with it before the first refusal comes back; Beethoven then sends at most one; when the answered request is abandoned before the grid replies, Chrome may re-send that copy once. How many of these the grid counts is not yet measured); it is kept only if the user ticks "Remember it on this computer", encrypted under a key the user's passkey releases, and is never sent to us or written to a log; no sign-in page or identity provider is ever filled in; no remote code; no cookies, tabs, webRequestBlocking, declarativeNetRequest, nativeMessaging, debugger or identity permission (webRequest and webRequestAuthProvider serve only that one sign-in); nothing installed outside the browser; no install-time host permission. What it sends us: the approval check only (the account name the portal shows, the portal hostname, the product, the version and a random identifier the extension made for this installation, answered yes or no), and daily GETs of https://openspineconsortium.com/beethoven/services.json and https://openspineconsortium.com/beethoven/killlist.json without cookies; the approval check goes to https://beethoven-access.openspineconsortium.workers.dev/access_check, and its product field reads "bridge", the extension's name on the wire since its first version.

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher. It is not provided by or on behalf of any university, Anthropic or the Open OnDemand project.
```

The recipe's steps 5 and 7 follow 11.0.0's harness (scenario 1 on the mock: "Use another portal", 13
presses, `docs/V11_STATUS.md`); steps 3, 4 and 6 are 19.0.0's (`--auth basic` and the sign-in sheet,
from the 19.0.0 build specification). None of them has been walked on a 19.0.0 or 20.0.0 build (nor
on a 16.0.0 build; nor on a 12.0.0 or 15.0.0 build, whose harness ran the direct way against a local
grid stand-in instead, `docs/V12_STATUS.md`). Walk them once on the release build and correct any
word.

## No other store

Edge Add-ons, Firefox Add-ons and Safari are not used from 8.0.0 (decided 2026-09-30): one listing,
private until 19.0.0 and public since 20.0.0 (decided 2026-10-13), and the approval check is what
keeps the extension working only for the students the maintainer approved. `npm run build` and
`npm run zip` still produce a Firefox package, because the code builds for it; nothing uploads it.
