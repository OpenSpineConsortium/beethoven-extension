# Paste sheet: Beethoven 12.0.0 on the Chrome Web Store

Every field of the dashboard, in the order it asks for them, with the text to paste (in a block:
copy all of it) or the file to upload. Paths are from the repository root,
`C:\Users\grego\OneDrive\Desktop\ashley-bridge`. The texts and the reasons behind them are in
`LISTING.md`; registration, the testers' group and the review are in `SUBMISSION.md`. Written
2026-09-30 for 9.0.0, brought up to date for 10.0.0 on 2026-10-01, and rewritten on 2026-10-02 for
12.0.0 (11.0.0 was built and never submitted; its changes are carried here too: the welcome page, no
`activeTab`, the window-wide panel). 12.0.0 adds the `nativeMessaging` permission, the helper's
installers inside the package, and the Authentication information data type.

**Everything in one folder.** `release/12.0.0/store-kit/` (also zipped, as
`release/12.0.0/store-kit-12.0.0.zip`) holds a copy of every file this sheet names, with the number of
its field below in front of the name, so the folder lists in the order of this sheet. Fields 2, 3 and
9 to 11 are typed, so they have no file, and so are the Privacy practices and Distribution tabs; the
package is `00`, and the Test instructions tab (`12`, after Distribution) has one file per box and one
for the fuller reply text. The folder was assembled on 2026-10-02 with the release
(`release/12.0.0/README.md`); its screenshots are still 9.0.0's until field 7's captures replace them
(`07-SCREENSHOTS-OUT-OF-DATE.txt` in the kit says which).

| File in the kit | Field | Copy of |
|---|---|---|
| `00-beethoven-12.0.0-chrome.zip` | Package | `release/12.0.0/beethoven-12.0.0-chrome.zip` (built as `extension/.output/beethoven-12.0.0-chrome.zip`) |
| `01-description.txt` | 1. Description | the block under field 1 (no newline at the end) |
| `04-store-icon-128.png` | 4. Store icon | `extension/store-assets/store-icon-128.png` |
| `05-promo-video-1280x720.mp4` | 5. Global promo video (to YouTube first) | `extension/store-assets/promo/beethoven-promo.mp4` (9.0.0's; see field 5) |
| `05-promo-video-thumbnail.png` | 5. the video's YouTube thumbnail | `extension/store-assets/promo/beethoven-promo-poster.png` |
| `06-promo-tile-440x280.png` | 6. Small promo tile | `extension/store-assets/promo-tile-440x280.png` |
| `07-screenshot-1-...png` to `07-screenshot-5-...png` | 7. Screenshots, 1 to 5 | **to be captured from the 12.0.0 build** (field 7) |
| `07-SCREENSHOTS-OUT-OF-DATE.txt` | 7. not a field | which of the kit's 9.0.0 images and video no longer match 12.0.0's screens |
| `08-marquee-1400x560.png` | 8. Marquee promo tile | `extension/store-assets/marquee-1400x560.png` |
| `12-test-username.txt` | 12. Test instructions: Username | the block under **Username** (no newline at the end) |
| `12-test-password.txt` | 12. Test instructions: Password | empty, as the box stays |
| `12-test-instructions-500.txt` | 12. Test instructions: Additional instructions | the block under **Additional instructions** (no newline at the end) |
| `12-test-instructions-long-reply.txt` | 12. not a box: the fuller text for a reply to a reviewer | the block under **The fuller text** (no newline at the end) |
| `PASTE.md` | | this sheet |

**Package first.** Upload `release/12.0.0/beethoven-12.0.0-chrome.zip` (the same bytes as the kit's
`00-beethoven-12.0.0-chrome.zip`; check it against `release/12.0.0/SHA256SUMS.txt`, because a later
`npm run build` rewrites the copy in `extension/.output/`): under **New item** for a new item, or
under the old draft's **Package** tab. The name (Beethoven) and the summary (the 128-character
sentence in `LISTING.md`) come from the package and are not typed. Before uploading,
`unzip -l` on it must list `bridge/beethoven-bridge-windows.zip`, `bridge/beethoven-bridge-mac.zip`,
`bridge/beethoven-bridge-linux.zip` and `bridge/manifest.json`; those files are what the extension
offers the student, and the store reviews them with the rest of the package.

**Check the image files before you upload them**, from inside the store kit folder. The line prints
each PNG with its size and colour mode. The store icon is 128x128 `RGBA` (its padding is transparent).
The others must be `RGB`: the video's thumbnail (1280x720), the tile (440x280), five screenshots
(1280x800) and the marquee (1400x560).

```
python -X utf8 -c "from PIL import Image; import glob; [print(f, Image.open(f).size, Image.open(f).mode) for f in sorted(glob.glob('0[4-8]-*.png'))]"
```

## Store listing tab

### 1. Description (up to 16,000 characters)

1,650 characters (counted with Python, without a trailing newline). Plain text: the line breaks are
kept, nothing else is formatted.

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

### 2. Category

```
Developer Tools
```

### 3. Language

```
English (United States)
```

### 4. Store icon (128x128)

`extension/store-assets/store-icon-128.png`: the package icon, 128x128 with 96 px of artwork inside
16 px of transparent padding. Unchanged.

### 5. Global promo video

The field takes a YouTube address, not a file. The file, `extension/store-assets/promo/beethoven-promo.mp4`
(28 seconds, 1280x720), was made from 9.0.0 and shows its toolbar-button start; **leave this field
empty** until a video of 12.0.0 is made. To add one later: YouTube Studio, **Create**, **Upload
videos**, "No, it's not made for kids", **Visibility** **Unlisted**, **Save**; paste the
`https://youtu.be/...` link here.

### 6. Small promo tile (440x280)

`extension/store-assets/promo-tile-440x280.png` (a drawing, not a screen; still true).

### 7. Screenshots (up to 5, 1280x800), in this order

**To be captured from the 12.0.0 release build before submission** (`LISTING.md`, "Images and the
promo video"): 9.0.0's five show its setup page and old panel. Suggested order, each a real capture
on the mock account `st1234`:

1. The home page diagram (`extension/store-assets/screenshot-01-your-grid.png` is a drawing and can
   stay).
2. The welcome page: "Claude, on your grid." with "You'll need".
3. The panel's **Sign in to the grid** sheet, with the sentence "Beethoven sends your password and
   code only to the grid, inside the encrypted connection, and never keeps them." and no value typed.
4. The panel's home, **You're online.** / **Open my session**, the Grid line reading **Direct**.
5. **Settings**, **Connection**: **Direct when possible**, **Protect my key with Windows Hello /
   Touch ID** (off), **Forget this computer**, **Helper**.

### 8. Marquee promo tile (1400x560)

`extension/store-assets/marquee-1400x560.png` (optional; a drawing).

### 9. Official URL

The field lists only sites verified in Google Search Console under the same Google account as the
developer account. Leave it empty until then; nothing else waits on it. To verify:

1. At `https://search.google.com/search-console`, signed in with the developer account's Google account, **Add property**, **URL prefix**: `https://openspineconsortium.com/`.
2. Choose **HTML file** as the verification method; it names a file such as `google1a2b3c4d5e6f7a8b.html`.
3. Send that file name to the maintainer's assistant, which publishes it at the site root.
4. Press **Verify** in Search Console, then reload this dashboard and choose `https://openspineconsortium.com/` here.

### 10. Homepage URL

```
https://openspineconsortium.com/beethoven/
```

### 11. Support URL

```
https://openspineconsortium.com/beethoven/support.html
```

**Also on this tab:** Mature content: **No**. Then **Save draft**.

## Privacy practices tab

### Single purpose

```
Start, monitor and stop a Claude Code worker on your university's Open OnDemand cluster and hand you its Remote Control link.
```

### Permission justification, one field each

The texts are in `LISTING.md`, "Permission justifications"; each block below is the same sentence.
The dashboard shows one field per permission in the uploaded manifest: `nativeMessaging` is a
required permission in 12.0.0's Chrome manifest, so it gets a field of its own.

`storage`

```
Remembers, on your device: the portal address, your preferences, your acceptance of the agreement, the account name your cluster accepted with the last approval answer, this installation's random identifier, your statement about each worker's workspace, notes about the direct connection (when this computer's key was added and its fingerprint) and the audit log of requests made to your portal. The direct connection's key itself is kept encrypted in the extension's own database.
```

`alarms`

```
Reads your running worker's status no more than once a minute, renews the approval check and fetches the signed withdrawn-versions list once a day, and keeps doing so after the browser suspends the extension.
```

`scripting`

```
Loads the extension's page script only into a tab the extension opened itself on the one portal site you allowed: where your portal does not share its sign-in with the extension's own requests, and on the portal's terminal page for its one-time key step, where it reads only the page's title and types one line. No page script is registered or loaded anywhere else.
```

`sidePanel`

```
Opens the extension's panel at the side of the window when you click the toolbar button; there is no popup.
```

`nativeMessaging`

```
Talks to Beethoven's own helper, a small script that ships inside the extension and that you install once (no administrator rights), so you can reach your university cluster without a VPN. The helper opens a connection only to the cluster's ssh port (grid.wayne.edu:22) and carries the extension's encrypted ssh session there and back; its registration names only this extension, and it holds no credential, runs no shell, keeps no log of what it carries and talks to nothing else.
```

Host permission (`https://*/*`, optional, requested at a click for one origin); 681 characters:

```
Your university's Open OnDemand portal has an address the extension cannot know in advance, so no site is granted at install. The extension asks the browser for one origin at a time, and only inside a click: "Agree and continue" on its welcome page (your university's portal, filled in from the site profile, or the address you typed under "Use another portal"), "Allow again" in its panel if the grant was removed, or "Change" in its Settings. It refuses to work through a portal until that one site is granted. An address on claude.ai, claude.com or anthropic.com, or on any of their subdomains, is refused before any request, so the extension never requests an Anthropic origin.
```

### Are you using remote code?

**No.** If a box asks why:

```
No remote code. No eval, no new Function, no fetched scripts, no interpreter for remote commands. The daily update check downloads one JSON document (a signed list of withdrawn versions) and verifies its Ed25519 signature with WebCrypto against a public key compiled into the package; JSON is data. Commands to the cluster are a small fixed vocabulary interpreted by shipped code, and the lines the cluster prints are parsed as text and never executed. The helper the user may install is a script inside the package, offered by the extension's own page; Chrome starts it through native messaging, and it carries bytes only; the extension never downloads or runs code from anywhere. The cluster-side tool is the one shared copy the university's lab keeps on the cluster; nothing from the cluster is ever executed in the browser. Fonts are files inside the package.
```

### Data usage

Tick **Personally identifiable information** and **Authentication information**, and nothing else.
What they cover, if a box asks:

```
Personally identifiable information: the institutional account name the user's cluster accepted for their sign-in and a random identifier the extension made for this installation, sent to the developer's access service in the approval check (with the portal's hostname, the product name and the version) to answer whether that account is approved and whether this is the installation it is approved on. The service records each check with the time and a salted hash of the network address the request came from; the address itself is not kept.

Authentication information: the university password and one-time verification code the user types into the extension's own sign-in sheet, the first time they connect to their cluster directly. They are handled on the device and sent only to the user's own university cluster, inside the encrypted ssh session, after the server's host key matched the key pinned in the extension; they are never stored, logged or sent to the developer. The key the extension makes for the user's cluster account stays on the device, encrypted, and is never transmitted.
```

Leave unticked: health information, financial and payment information, personal communications,
location, web history, user activity, website content. Authentication information is ticked because
the password and the code leave the device, to the user's own cluster, even though the developer
never receives them; the 11.0.0 answer (unticked) was true only while the user typed them into the
browser's and the portal's own pages.

### Certifications

Tick all three: no selling or transfer of user data outside the approved use cases; no use or
transfer for purposes unrelated to the single purpose; no use or transfer to determine
creditworthiness or for lending.

### Privacy policy URL

```
https://openspineconsortium.com/beethoven/privacy.html
```

It must show version 10 (2026-10-02) before the submission. Then **Save draft**.

## Distribution tab

| Field | Choice |
|---|---|
| Payments | **Free** (no in-app purchases) |
| Visibility | **Private**. Never Unlisted or Public: either lets anyone with the link install it |
| Trusted testers | the address of the Beethoven-users Google Group, the group of approved students (`SUBMISSION.md`, section 0, item 6) |
| Regions | **United States** only |

Then **Save draft**.

## Test instructions tab

In the dashboard's left menu under **Access**. Limits: 100 characters for each credential box, 500
for Additional instructions (Google's screenshot of the tab,
`https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions`). Counted with Python,
without a trailing newline, ASCII only; the second number is the count if the form counts each line
break as two characters.

**Partly seen on the 12.0.0 release build.** Every quoted word below is in the release build's
sources (checked 2026-10-02), and the browser harness walked these screens on that build: the welcome
page's tick and **Agree and continue** with Chrome's prompt for the one portal (scenario 13), **One
small download, once** with no helper and **Use GlobalProtect instead** leading to 11.0.0's way on the
mock (scenario 15). Nobody has walked the text by hand, as a reviewer would, in a fresh profile: do
that before pasting (`TEST_BEFORE_UPLOAD.md`, "Just before uploading"), and correct the text and its
count here if a word differs. The direct way must not be tried against the
real grid with an invented AccessID: every refused sign-in is a failed sign-in on the university's
server.

**Username** (96 characters):

```
None: Beethoven has no account, password or licence key of its own. See Additional instructions.
```

**Password**: leave empty. Only if the form refuses an empty box, paste this (43 characters):

```
Not applicable: see Additional instructions
```

**Additional instructions** (487 characters; 490 if each of its 3 line breaks counts as two):

```
Beethoven runs Claude Code in a Wayne State grid account. Needs the user's AccessID, password, 2FA code, Claude Pro/Max and our approval; we cannot lend accounts.
1. Install: welcome page. Tick, Agree and continue. Chrome asks for ondemand.grid.wayne.edu only.
2. Panel: One small download, once offers the helper inside the package (bridge/), a script relaying only to grid.wayne.edu:22. Please don't sign in to the real grid. Use GlobalProtect instead skips it.
Mock portal on request.
```

Then **Save changes**.

**The fuller text, for a reply to a reviewer** (not for this form; 4,792 characters, 4,818 if each
of its 26 line breaks counts as two). If a reviewer asks for test
access or for the mock portal, reply with the letter in `SUBMISSION.md`, section 4, and this text
under it, and attach `release/12.0.0/reviewer/beethoven-mock-portal.zip` (the mock portal, its
stand-in scheduler and cluster tool and its one dependency, `ws`; no extension code). The mock was run
end to end only on Windows, with Git for Windows.

```
WHAT IT IS
Beethoven starts, watches and stops a Claude Code worker (a batch job) in the user's own account on a university cluster and hands the user the claude.ai link the worker prints. It reaches the cluster directly over ssh, through a small helper the user installs from inside the extension, or through the university's Open OnDemand portal. It is not an Anthropic product ("Claude" and "Claude Code" are Anthropic's marks) and not provided by or on behalf of any university.

WHY THERE IS NO TEST ACCOUNT
It has no account, password or licence key of its own; the user's own cluster sign-in identifies them. A worker needs a Wayne State AccessID with its password and Google Authenticator code (and, on the portal path, the VPN), the user's own Claude Pro or Max, and our approval of that account. We cannot issue or lend accounts: one person per account is a term of the university and of Anthropic's service.

WITHOUT A CLUSTER
1. Install: the welcome page opens ("Claude, on your grid."). Tick the box and press "Agree and continue". Chrome asks to allow https://ondemand.grid.wayne.edu, that one site only. The panel opens at the side of the window.
2. The panel tries the direct way. With no helper installed it shows "One small download, once" and a "Download for ..." button for your system, with the file's name and size: the file is inside the package (bridge/), served from the extension's own address; nothing is fetched from the web. bridge/manifest.json lists each file with its SHA-256. The helper is a plain script (PowerShell on Windows, Perl on macOS and Linux) that opens TCP only to grid.wayne.edu:22, carries bytes and exits when Chrome closes it; you can read it in the package.
3. Please do not type an AccessID into "Sign in to the grid": the direct way talks to the university's real server, and a test sign-in there is a failed sign-in on a real account.
4. "Use GlobalProtect instead" leaves the direct way: the panel says "Using GlobalProtect" and then waits for the university's VPN ("Turn on GlobalProtect."), which a reviewer cannot reach.

FULL FLOW ON A LOCAL MOCK PORTAL (the portal path; the direct way is not part of the mock)
The attached beethoven-mock-portal.zip holds a Node stand-in for the portal, scheduler and cluster tool, plus ws; no extension code. Needs Node 22, bash and openssl; tested end to end only on Windows (Git for Windows).
1. Make a localhost certificate in the unzipped folder (Git Bash: prefix MSYS_NO_PATHCONV=1):
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -subj /CN=localhost -days 30 -addext subjectAltName=DNS:localhost
2. In bash (use no other --user):
MOCK_LOGGED_IN=false node server.mjs --port 8443 --host localhost --user st1234 --cert cert.pem --key key.pem
3. Open https://localhost:8443/login, choose Advanced, "Proceed to localhost (unsafe)", then "Sign in as st1234". No password. Our access service approves st1234 from any installation only when the portal is localhost.
4. In a fresh profile with the item installed: on the welcome page press "Not at Wayne State? Use another portal", type https://localhost:8443, "Use this portal", tick, "Agree and continue", and Allow Chrome's prompt.
5. If the panel first shows "One small download, once" (the direct way), press "Use GlobalProtect instead" (and "Continue" if it asks). The panel then works by itself. At the data statement tick and press Connect. A sign-in tab opens at the stand-in's dummy Anthropic link (client_id=mock-client); close it, type ABC123 in the panel's code box, press Continue. After a short wait in line the panel says "You're online." with "Open my session" (a made-up claude.ai/code link; no real session).

WHAT IT NEVER DOES
No host permission at install; one site at a time, only inside a click. An Anthropic address is refused before any permission request. It runs no script on, reads nothing from and sends nothing to Anthropic's sites; it only opens their pages in a new tab. It never keeps the cluster password or code: on the direct way they go only into the encrypted ssh session after the cluster's host key matched the pinned one. Its key's line in the cluster account runs a gate with eight fixed commands and can never sign a worker in to Claude. nativeMessaging reaches only its own helper. No remote code, analytics, error reports or usage data.

WHAT IT SENDS US
Nothing before acceptance. Then, without cookies: daily GETs of services.json and killlist.json (signed list of withdrawn versions); and, once the cluster has accepted a sign-in, the approval check to https://beethoven-access.openspineconsortium.workers.dev/access_check with the account name, the portal hostname, the product ("bridge"), the version and a random installation id made at acceptance. The answer is yes or no.
```

Then **Submit for review** (top right). What to expect, and what to answer a reviewer, is in
`SUBMISSION.md`, sections 1 and 4.
