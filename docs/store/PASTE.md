# Paste sheet: Beethoven 20.0.0 on the Chrome Web Store

Every field of the dashboard, in the order it asks for them, with the text to paste (in a block:
copy all of it) or the file to upload. Paths are from the repository root of the checkout that made
the release (`SUBMISSION.md`, section 0, item 1), where the package and the kit are. The texts and
the reasons behind them are in `LISTING.md`; registration, the testers' group and the review are in
`SUBMISSION.md`. Written 2026-09-30 for 9.0.0, brought up to date for 10.0.0 on 2026-10-01,
rewritten on 2026-10-02 for 12.0.0 (11.0.0 was built and never submitted; its changes are carried
here too: the welcome page, no `activeTab`, the window-wide panel), brought up to date on 2026-10-04
for 15.0.0, on 2026-10-08 for 16.0.0, on 2026-10-09 for 19.0.0, on 2026-10-11 for 20.0.0, and on 2026-10-13 for 20.0.0's public listing (agreement version 14, privacy statement version 15; Visibility Public). 12.0.0 added the `nativeMessaging` permission, the
helper's installers inside the package, and the Authentication information data type; 15.0.0 added
the signed installers of the helper for Windows and macOS. 16.0.0 removes all of it with the direct
way: no `nativeMessaging`, no helper, no installer, and Authentication information unticked again,
as in 11.0.0. 19.0.0, in which Beethoven signs in to the grid with the AccessID and password typed
into its own sheet, adds the `webRequest` and `webRequestAuthProvider` permissions (two more
justification fields) and ticks Authentication information again; it adds no helper and no
installer.

**Everything in one folder.** `release/20.0.0/store-kit/` (also zipped, as
`release/20.0.0/store-kit-20.0.0.zip`) holds a copy of every file this sheet names, with the number
of its field below in front of the name, so the folder lists in the order of this sheet. Fields 2, 3
and 9 to 11 are typed, so they have no file, and so are the Privacy practices and Distribution tabs;
the package is `00`, and the Test instructions tab (`12`, after Distribution) has one file per box
and one for the fuller reply text. The kit was assembled for 12.0.0 on 2026-10-02 with that release
(`release/12.0.0/README.md`); for 20.0.0 it is to be assembled again, with the 20.0.0 package as
`00` and the texts of this sheet as they are now. Its screenshots 2 to 5 are 20.0.0's, made on 2026-10-14
(field 7); its promo video is 20.0.0's, made on 2026-10-15 (field 5). The `00` zip, and
the kit's own zip that holds it, stay out of the repository (`.gitignore`), like the record's zip,
whose committed `SHA256SUMS.txt` pins it; 19.0.0's package, like 16.0.0's, names no store item and
carries no installer, so nothing in the kit is bound to the item.

| File in the kit | Field | Copy of |
|---|---|---|
| `00-beethoven-20.0.0-chrome.zip` | Package | `release/20.0.0/beethoven-20.0.0-chrome.zip` (built as `extension/.output/beethoven-20.0.0-chrome.zip`) |
| `01-description.txt` | 1. Description | the block under field 1 (no newline at the end) |
| `04-store-icon-128.png` | 4. Store icon | `extension/store-assets/store-icon-128.png` |
| `05-promo-video-2560x1440.mp4` | 5. Global promo video (to YouTube first) | `extension/store-assets/promo/beethoven-promo.mp4` (20.0.0's, with sound; see field 5) |
| `05-promo-video-thumbnail.png` | 5. the video's YouTube thumbnail | `extension/store-assets/promo/beethoven-promo-poster.png` |
| `06-promo-tile-440x280.png` | 6. Small promo tile | `extension/store-assets/promo-tile-440x280.png` |
| `07-screenshot-1-...png` to `07-screenshot-5-...png` | 7. Screenshots, 1 to 5 | `extension/store-assets/screenshot-01-your-grid.png` (9.0.0's diagram) and `screenshot-02-...` to `screenshot-05-...` (20.0.0's screens, field 7) |
| `08-marquee-1400x560.png` | 8. Marquee promo tile | `extension/store-assets/marquee-1400x560.png` |
| `12-test-username.txt` | 12. Test instructions: Username | the block under **Username** (no newline at the end) |
| `12-test-password.txt` | 12. Test instructions: Password | the block under **Password** (no newline at the end) |
| `12-test-instructions-500.txt` | 12. Test instructions: Additional instructions | the block under **Additional instructions** (no newline at the end) |
| `12-test-instructions-long-reply.txt` | 12. not a box: the fuller text for a reply to a reviewer | the block under **The fuller text** (no newline at the end) |
| `PASTE.md` | | this sheet |

**Package first.** Upload `release/20.0.0/beethoven-20.0.0-chrome.zip` (the same bytes as the kit's
`00-beethoven-20.0.0-chrome.zip`; check it against `release/20.0.0/SHA256SUMS.txt`, because a later
`npm run build` rewrites the copy in `extension/.output/`): under the draft's **Package** tab, once
the item exists (`SUBMISSION.md`, section 1, item 4), or with the maintainer's own upload tool,
`node extension/scripts/publish-store.mjs upload --publisher <id> --item <id> --zip <the zip>`,
without its `--publish` (its header says how it signs in; `SUBMISSION.md`, section 0, item 7). For
an update of a live item, the same command with `--publish` has already uploaded and submitted it.
The name (Beethoven) and the summary (the 128-character sentence in `LISTING.md`) come from the
package and are not typed. Before uploading, `unzip -l` on it must list `fonts/` and no `bridge/`:
no `.msi`, no `.pkg`, no script zip. 19.0.0 carries no helper, and nothing in the package names the
store item. Its `manifest.json` lists exactly `storage`, `alarms`, `scripting`, `sidePanel`,
`webRequest` and `webRequestAuthProvider`, and never `webRequestBlocking`.

**Check the image files before you upload them**, from inside the store kit folder. The line prints
each PNG with its size and colour mode. The store icon is 128x128 `RGBA` (its padding is transparent).
The others must be `RGB`: the video's thumbnail (1280x720), the tile (440x280), five screenshots
(1280x800) and the marquee (1400x560).

```
python -X utf8 -c "from PIL import Image; import glob; [print(f, Image.open(f).size, Image.open(f).mode) for f in sorted(glob.glob('0[4-8]-*.png'))]"
```

## Store listing tab

### 1. Description (up to 16,000 characters)

1,599 characters (counted with Python, without a trailing newline). Plain text: the line breaks are
kept, nothing else is formatted. The same text as `LISTING.md`'s detailed description.

```
Your grid. From claude.ai.

Beethoven starts a Claude Code worker in your own account on the Wayne State grid and opens it in claude.ai. Ask there or in the Claude app, and your worker does the work.

HOW IT WORKS
1. Accept the agreement on Beethoven's welcome page.
2. Turn on GlobalProtect, then type your AccessID and password into Beethoven's sign-in sheet. Beethoven signs in to the grid for you, in the background.
3. Sign in to Claude once, on Anthropic's own page.
4. Click Open my session, or Open my project once you named your project in the settings. Your worker runs until you press Stop.

If the grid is out of reach, Beethoven waits and carries on by itself as soon as GlobalProtect is on. Nothing is installed outside Chrome.

YOU NEED
A Wayne State AccessID with a grid account, GlobalProtect, Chrome on Windows, macOS or Linux, and Claude Pro or Max.

By approval only: ask at https://openspineconsortium.com/beethoven/
One approval covers every installation of your own: your computers and your Chrome profiles.

YOUR DATA
To check your approval, Beethoven sends our access service the account name the grid's website shows and a random installation identifier, with your portal's address and the version. It sends nothing else about you. Your password goes only to the grid, never to us, and Beethoven keeps it, encrypted on this computer, only if you ask it to. The service records each check with a salted hash of the network address it came from, never the address. Privacy: https://openspineconsortium.com/beethoven/privacy.html

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
(28 seconds, 2560x1440, with sound), was made on 2026-10-15 from the 20.0.0 screens: sign in to the grid,
click once, ask from claude.ai (`extension/store-assets/manifest.txt` says what each moment shows). Upload
it as it is; the 1440p file is what keeps the listing's preview sharp. YouTube Studio, **Create**,
**Upload videos**, "No, it's not made for kids", **Visibility** **Unlisted**, **Save**; set
`promo/beethoven-promo-poster.png` as the thumbnail if wanted; paste the `https://youtu.be/...` link here
(replacing the 9.0.0 video's, if one is there).

### 6. Small promo tile (440x280)

`extension/store-assets/promo-tile-440x280.png` (a drawing, not a screen; still true).

### 7. Screenshots (up to 5, 1280x800), in this order

Five images, `extension/store-assets/screenshot-01-your-grid.png` to `screenshot-05-...png`
(`manifest.txt` there says what each shows). The first is 9.0.0's drawing of the home page diagram,
which still holds; 2 to 5 were made on 2026-10-14 from the 20.0.0 release build, each a real capture
of a 20.0.0 screen against the mock portal on the mock account `st1234`, framed in the site's style
with one headline and one line (`LISTING.md`, "Images and the promo video"):

1. The home page diagram: "Your grid. From claude.ai."
2. The welcome page, whole: "Claude, on your grid.", "You'll need" and its three needs, the agreement
   in short, the tick untouched.
3. The panel's **Sign in to the grid** sheet, with **AccessID** reading `st1234`, an empty
   **Password** and **Remember it on this computer, unlocked with your screen lock** unticked:
   "Sign in to the grid." Never a real AccessID or a typed password.
4. The panel's home once online, **Online**, **Open my session**, the Grid row **Signed in as
   st1234**: "Click once."
5. **Settings**, the **Your worker** and **Your grid** cards with the **Grid sign-in** row: "Your
   worker, your rules."

To make them again (a changed screen, a new version): capture the raw screens into
`extension/store-assets/raw-20/` as its `LIST.txt` describes (the 20.0.0 package loads only in Chrome
148 or later, so a capture in an older Chromium needs the two changes that file names, in a copy of
the package, never in the build), then `node src/build_assets.mjs --only shots` in
`extension/store-assets/` with Playwright's Chromium.

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
The dashboard shows one field per permission in the uploaded manifest: six for 19.0.0 (`storage`,
`alarms`, `scripting`, `sidePanel`, `webRequest`, `webRequestAuthProvider`) and the host
permission's. `nativeMessaging`, a required permission from 12.0.0 to 15.0.0, has no field any more.
`webRequest` and `webRequestAuthProvider` are new in 19.0.0.

`storage`

```
Remembers, on your device: the portal address, your preferences, your acceptance of the agreement, the account name your portal showed with the last approval answer, this installation's random identifier, your statement about each worker's workspace, the audit log of requests made to your portal, your grid sign-in, encrypted, if you chose to save it, and, until you dismiss it, a note that an earlier version added a key to your cluster account (its date and fingerprint, never the key).
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

`webRequest` (new in 19.0.0); 645 characters:

```
Lets the extension learn, on the one portal site you allowed, of sign-in requests and of when requests end, your tabs' included, so it knows whether the grid accepted the password it gave its own background request and stops at the first refusal. It acts on no request but that one and reads no page; a tab's sign-in goes straight back to Chrome's own box. Of your tabs' requests it keeps one mark only, and only while its own answer awaits its outcome: that a portal tab asked for a sign-in or had a request answered without a refusal meanwhile (you may have signed in in Chrome's box), after which it holds a saved password until you type one.
```

`webRequestAuthProvider` (new in 19.0.0); 509 characters:

```
Lets the extension answer that one sign-in request, once per check, with the AccessID and password you typed into its own sign-in sheet (or saved behind your passkey), so the grid signs you in without a separate tab. If the portal asks again after that answer, the extension declines instead of sending the password twice. It never answers a sign-in that a tab, a proxy or another site asks for, redirects or rewrites no request, and after the first refusal it sends nothing until you type the password again.
```

Host permission (`https://*/*`, optional, requested at a click for one origin); 681 characters:

```
Your university's Open OnDemand portal has an address the extension cannot know in advance, so no site is granted at install. The extension asks the browser for one origin at a time, and only inside a click: "Agree and continue" on its welcome page (your university's portal, filled in from the site profile, or the address you typed under "Use another portal"), "Allow again" in its panel if the grant was removed, or "Change" in its Settings. It refuses to work through a portal until that one site is granted. An address on claude.ai, claude.com or anthropic.com, or on any of their subdomains, is refused before any request, so the extension never requests an Anthropic origin.
```

### Are you using remote code?

**No.** If a box asks why:

```
No remote code. No eval, no new Function, no fetched scripts, no interpreter for remote commands. The daily update check downloads one JSON document (a signed list of withdrawn versions) and verifies its Ed25519 signature with WebCrypto against a public key compiled into the package; JSON is data. Commands to the cluster are a small fixed vocabulary interpreted by shipped code, and the lines the cluster prints are parsed as text and never executed. The extension never downloads or runs code from anywhere, and the package holds no program besides the extension itself: no helper, no installer, no script. The cluster-side tool is the one shared copy the university's lab keeps on the cluster; nothing from the cluster is ever executed in the browser. Fonts are files inside the package.
```

### Data usage

Tick **Personally identifiable information** and **Authentication information**, and nothing else.
What each covers, if a box asks:

```
Personally identifiable information: the institutional account name the user's portal shows for their sign-in and a random identifier the extension made for this installation, sent to the developer's access service in the approval check (with the portal's hostname, the product name and the version) to answer whether that account is approved and whether this is the installation it is approved on. The service records each check with the time and a salted hash of the network address the request came from; the address itself is not kept.
```

```
Authentication information: the user's AccessID and cluster password, typed into the extension's own sign-in sheet. They are sent only to the user's own university portal, as the answer to the HTTP sign-in it asks of the extension's own request, once per check, and never to the developer. The password is kept only if the user ticks "Remember it on this computer" (never ticked for them), and then only on the device, encrypted with AES-GCM under a key the user's passkey releases; otherwise it is held in memory for one sign-in and at most two minutes.
```

Leave unticked: health information, financial and payment information, personal communications,
location, web history, user activity, website content. Authentication information is ticked again in
19.0.0 for its sign-in sheet, through which the password leaves the device for the user's own
portal. (12.0.0 to 15.0.0 ticked it for the sign-in sheet of the direct way; 16.0.0 to 18.0.0,
which had no sheet, left it unticked.)

### Certifications

Tick all three: no selling or transfer of user data outside the approved use cases; no use or
transfer for purposes unrelated to the single purpose; no use or transfer to determine
creditworthiness or for lending.

### Privacy policy URL

```
https://openspineconsortium.com/beethoven/privacy.html
```

It must show version 15 (2026-10-13) before the submission: the upload waits until
https://openspineconsortium.com/beethoven/privacy.html shows version 15 (and `terms.html` version
14). Then **Save draft**.

## Distribution tab

| Field | Choice |
|---|---|
| Payments | **Free** (no in-app purchases) |
| Visibility | **Public** (decided 2026-10-13 for 20.0.0; Private from 8.0.0 to 19.0.0). Installing needs no invitation; the approval check decides whether it works |
| Trusted testers | leave empty (the Beethoven-users Google Group served the private listing until 19.0.0; `SUBMISSION.md`, section 0, item 6) |
| Regions | **United States** only |

Then **Save draft**.

## Test instructions tab

In the dashboard's left menu under **Access**. Limits: 100 characters for each credential box, 500
for Additional instructions (Google's screenshot of the tab,
`https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions`). Counted with Python,
without a trailing newline, ASCII only (but for the panel's own ellipsis character, quoted in the
fuller text, which is not pasted into the form); the second number is the count if the form counts
each line break as two characters.

**Not yet walked on a 19.0.0 or 20.0.0 build.** The quoted words below were in 16.0.0's sources
(`extension/src/core/model.ts`, checked 2026-10-08); the sign-in sheet's words ("Sign in to the
grid", "Remember it on this computer", "Sign in", "Use Chrome's sign-in box instead", "That password
didn't work, and Beethoven stopped.") are the 19.0.0 build specification's, written while
`model.ts` was being built beside this sheet, and are to be checked against it. The browser
harness's scenarios 1 to 12 are the mock flow of 11.0.0 (`docs/V11_STATUS.md`), and whether they pass
on 19.0.0 or 20.0.0, in `--auth basic` or not, is not yet measured.
Nobody has walked the text by hand, as a reviewer would, in a fresh profile: do that before pasting
(`TEST_BEFORE_UPLOAD.md`, "Just before uploading"), and correct the text and its count here if a
word differs. Nothing in it reaches the real grid: without the university's VPN the panel waits on
the GlobalProtect screen, and its one request, a credential-free one to the portal's address asking
whether it answers, gets no answer, so the sign-in sheet never appears and nothing is typed.

**Username** (92 characters):

```
None on the real grid: it needs a Wayne State AccessID. Our mock portal (on request): st1234
```

**Password** (91 characters; the mock's made-up password, not a real one):

```
None on the real grid. Our mock portal: mockpass, typed into Beethoven's own sign-in sheet.
```

**Additional instructions** (494 characters; 497 if each of its 3 line breaks counts as two):

```
Beethoven runs Claude Code in a Wayne State grid account. Needs the user's AccessID, password, the GlobalProtect VPN, Claude Pro/Max and our approval; we cannot lend accounts.
1. Install: welcome page. Tick, Agree and continue. Chrome asks for ondemand.grid.wayne.edu only.
2. Panel: Turn on GlobalProtect. It waits for the university's VPN, which you cannot reach; How to set it up opens the university's own page. No download, nothing installed.
Mock portal with the sign-in sheet on request.
```

Then **Save changes**.

**The fuller text, for a reply to a reviewer** (not for this form; 6,011 characters, 6,037 if each
of its 26 line breaks counts as two). If a reviewer asks for test access or for the mock portal,
reply with the letter in `SUBMISSION.md`, section 4, and this text under it, and attach
`release/20.0.0/reviewer/beethoven-mock-portal.zip` (the mock portal, its stand-in scheduler and
cluster tool and its one dependency, `ws`; no extension code; its `server.mjs` must be 20.0.0's,
with `--auth basic`). The mock was run end to end only on Windows, with Git for Windows, and not yet
in `--auth basic` against a 19.0.0 or 20.0.0 build.

```
WHAT IT IS
Beethoven starts, watches and stops a Claude Code worker (a batch job) in the user's own account on a university cluster and hands the user the claude.ai link the worker prints. It reaches the cluster through the university's Open OnDemand portal, behind the university's VPN, and signs in to that portal for the user with the AccessID and password they type into its own sign-in sheet. It is not an Anthropic product ("Claude" and "Claude Code" are Anthropic's marks) and not provided by or on behalf of any university.

WHY THERE IS NO TEST ACCOUNT
It has no account, password or licence key of its own; the user's own cluster sign-in identifies them. A worker needs a Wayne State AccessID with its password, the university's VPN (GlobalProtect), the user's own Claude Pro or Max, and our approval of that account. We cannot issue or lend accounts: one person per account is a term of the university and of Anthropic's service.

WITHOUT A CLUSTER
1. Install: the welcome page opens ("Claude, on your grid."). It names the three things a user needs (a Wayne State grid account, GlobalProtect, Claude Pro or Max), each with a link to the university's or Anthropic's own page, opened in a new tab only if pressed. Tick the box and press "Agree and continue". Chrome asks to allow https://ondemand.grid.wayne.edu, that one site only. The panel opens at the side of the window.
2. The panel looks for the grid: "Turn on GlobalProtect." with "Open GlobalProtect and connect to protect.wayne.edu. Then approve the sign-in on your phone." and "Looking for the grid…", then after 45 seconds "Still looking. Check that GlobalProtect says Connected." "How to set it up" opens the university's own page about its VPN in a new tab. The only request is a credential-free one to the portal's address, asking whether it answers (every 3 seconds while the panel is open, once a minute while it is closed); without the VPN it does not, and the panel waits. Nothing is downloaded, nothing is installed outside the browser, and nothing is sent to us.
3. Nothing more happens without the VPN. With it, the panel would show "Sign in to the grid" and ask for the AccessID and password (the mock below shows it), or, if the user chooses "Use Chrome's sign-in box instead", open the grid's own sign-in box in a tab, which the extension never reads.

FULL FLOW ON A LOCAL MOCK PORTAL
The attached beethoven-mock-portal.zip holds a Node stand-in for the portal, scheduler and cluster tool, plus ws; no extension code. Needs Node 22, bash and openssl; tested end to end only on Windows (Git for Windows).
1. Make a localhost certificate in the unzipped folder (Git Bash: prefix MSYS_NO_PATHCONV=1):
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -subj /CN=localhost -days 30 -addext subjectAltName=DNS:localhost
2. In bash (use no other --user; --auth basic is the portal's HTTP sign-in, with the made-up password mockpass):
MOCK_LOGGED_IN=false node server.mjs --port 8443 --host localhost --user st1234 --auth basic --cert cert.pem --key key.pem
3. Open https://localhost:8443/, choose Advanced, "Proceed to localhost (unsafe)". Leave the start page; do not press its LOGIN link. Our access service approves st1234 from any installation only when the portal is localhost.
4. In a fresh profile with the item installed: on the welcome page press "Another university? Use another portal", type https://localhost:8443, "Use this portal", tick, "Agree and continue", and Allow Chrome's prompt.
5. The panel shows "Sign in to the grid". Type st1234 and mockpass, leave "Remember it on this computer" unticked, press "Sign in": the extension signs in from its background, with no tab. (Ticked, Chrome asks for a passkey named "st1234 (grid)"; Settings, Your grid, Forget deletes the saved sign-in.) A wrong password shows "That password didn't work, and Beethoven stopped." and is not sent again until one is typed again.
6. The panel then works by itself. At the data statement tick and press Connect. A sign-in tab opens at the stand-in's dummy Anthropic link (client_id=mock-client); close it, type ABC123 in the panel's code box, press Continue. After a short wait in line the panel says "You're online." with "Open my session" (a made-up claude.ai/code link; no real session).

WHAT IT NEVER DOES
No host permission at install; one site at a time, only inside a click. An Anthropic address is refused before any permission request. It runs no script on, reads nothing from and sends nothing to Anthropic's sites; it only opens their pages in a new tab. The cluster password goes only to the portal, as the answer to the HTTP sign-in the portal asks of the extension's own background request, once per check; never to a tab's, a proxy's or another site's, and nothing more after the first refusal. Chrome re-sends its cached copy once for each request already started with it before the first refusal comes back; Beethoven then sends at most one; when the answered request is abandoned before the grid replies, Chrome may re-send that copy once. How many of these the grid counts is not yet measured. It is kept only if the user ticks Remember, encrypted under a key the user's passkey releases, and never reaches us or a log. No sign-in page or identity provider is filled in. webRequest and webRequestAuthProvider serve only that sign-in; no webRequestBlocking, nativeMessaging, cookies or tabs. Nothing installed outside the browser. No remote code, analytics, error reports or usage data.

WHAT IT SENDS US
Nothing before acceptance. Then, without cookies: daily GETs of services.json and killlist.json (signed list of withdrawn versions); and, once the portal shows the account name, the approval check to https://beethoven-access.openspineconsortium.workers.dev/access_check with the account name the portal's dashboard shows (never the AccessID typed to sign in), the portal hostname, the product ("bridge"), the version and a random installation id made at acceptance. The answer is yes or no.
```

Then **Submit for review** (top right). What to expect, and what to answer a reviewer, is in
`SUBMISSION.md`, sections 1 and 4.
