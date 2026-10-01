# Paste sheet: Beethoven 10.0.0 on the Chrome Web Store

Every field of the dashboard, in the order it asks for them, with the text to paste (in a block:
copy all of it) or the file to upload. Paths are from the repository root,
`C:\Users\grego\OneDrive\Desktop\ashley-bridge`. The texts and the reasons behind them are in
`LISTING.md`; registration, the testers' group and the review are in `SUBMISSION.md`. Written
2026-09-30 for 9.0.0, brought up to date for 10.0.0 on 2026-10-01. 9.0.0 was built on 2026-09-30
and replaced before any review because of two defects: it asked Chrome for a site permission on an
Anthropic address before refusing that address as a portal, and its agreement's *Accept and
Continue* button did not wait for the text to be scrolled to its end.

**Everything in one folder.** `release/10.0.0/store-kit/` (also zipped, as
`release/10.0.0/store-kit-10.0.0.zip`) holds a copy of every file this sheet names, with the number of
its field below in front of the name, so the folder lists in the order of this sheet. Fields 2, 3 and
9 to 11 are typed, so they have no file, and so are the Privacy practices and Distribution tabs; the
package is `00`, and the Test instructions tab (`12`, after Distribution) has one file per box and one
for the fuller reply text.

| File in the kit | Field | Copy of |
|---|---|---|
| `00-beethoven-10.0.0-chrome.zip` | Package | `release/10.0.0/beethoven-10.0.0-chrome.zip` (built as `extension/.output/beethoven-10.0.0-chrome.zip`) |
| `01-description.txt` | 1. Description | the block under field 1 (no newline at the end) |
| `04-store-icon-128.png` | 4. Store icon | `extension/store-assets/store-icon-128.png` |
| `05-promo-video-1280x720.mp4` | 5. Global promo video (to YouTube first) | `extension/store-assets/promo/beethoven-promo.mp4` |
| `05-promo-video-thumbnail.png` | 5. the video's YouTube thumbnail | `extension/store-assets/promo/beethoven-promo-poster.png` |
| `06-promo-tile-440x280.png` | 6. Small promo tile | `extension/store-assets/promo-tile-440x280.png` |
| `07-screenshot-1-your-grid.png` to `07-screenshot-5-by-approval-only.png` | 7. Screenshots, 1 to 5 | `extension/store-assets/screenshot-0[1-5]-*.png` |
| `08-marquee-1400x560.png` | 8. Marquee promo tile | `extension/store-assets/marquee-1400x560.png` |
| `12-test-username.txt` | 12. Test instructions: Username | the block under **Username** (no newline at the end) |
| `12-test-password.txt` | 12. Test instructions: Password | empty, as the box stays (the fallback sentence is below, under **Password**) |
| `12-test-instructions-500.txt` | 12. Test instructions: Additional instructions | the block under **Additional instructions** (no newline at the end) |
| `12-test-instructions-long-reply.txt` | 12. not a box: the fuller text for a reply to a reviewer | the block under **The fuller text** (no newline at the end) |
| `PASTE.md` | | this sheet |

**Package first.** Upload `release/10.0.0/beethoven-10.0.0-chrome.zip` (the same bytes as the kit's
`00-beethoven-10.0.0-chrome.zip`; check it against `release/10.0.0/SHA256SUMS.txt`, because a later
`npm run build` rewrites the copy in `extension/.output/`): under **New item** for a new item, or
under the old draft's **Package** tab, which turns that draft into Beethoven. The name
(Beethoven) and the summary (the 128-character sentence in `LISTING.md`) come from the package and
are not typed.

**Check the image files before you upload them**, from inside the store kit folder. The line prints
each PNG with its size and colour mode. The store icon is 128x128 `RGBA` (its padding is transparent).
The others must be `RGB`, because the store refuses a screenshot or a tile with an alpha channel: the
video's thumbnail (1280x720), the tile (440x280), five screenshots (1280x800) and the marquee (1400x560).

```
python -X utf8 -c "from PIL import Image; import glob; [print(f, Image.open(f).size, Image.open(f).mode) for f in sorted(glob.glob('0[4-8]-*.png'))]"
```

## Store listing tab

### 1. Description (up to 16,000 characters)

1,203 characters (counted with Python, without a trailing newline). Plain text: the line breaks are
kept, nothing else is formatted.

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

### 2. Category

```
Developer Tools
```

(In the dashboard's list it sits under Productivity.)

### 3. Language

```
English (United States)
```

### 4. Store icon (128x128)

`extension/store-assets/store-icon-128.png`: the package icon (the rack from the home page
diagram, its one unit teal with a lit prompt), 128x128 with 96 px of artwork inside 16 px of
transparent padding, which is what the store asks of an icon. It is the same file as the icon inside
the package (`extension/public/icon/128.png`).

### 5. Global promo video

The field takes a YouTube address, not a file. The file is
`extension/store-assets/promo/beethoven-promo.mp4` (28 seconds, 1280x720, H.264, no sound). Leave
the field empty if you skip it.

1. In YouTube Studio (`https://studio.youtube.com`), **Create**, **Upload videos**, choose the file; "No, it's not made for kids"; at **Visibility** choose **Unlisted**, then **Save**.
2. Copy the link it shows (`https://youtu.be/...`) and paste it into this field.
3. Thumbnail: the video's first frame is plain cream, so in the video's **Details** upload
   `extension/store-assets/promo/beethoven-promo-poster.png` (the kit's `05-promo-video-thumbnail.png`)
   as its thumbnail. YouTube may ask you to verify the account before it takes a custom thumbnail; if
   it does and you skip that, pick one of the frames YouTube suggests that is not plain cream.

Unlisted means only people who have the link can watch it; the listing is private, so in practice
only invited students see it. For the video's own title and description on YouTube:

```
Beethoven: your grid, from claude.ai
```

```
Beethoven starts a Claude Code worker on the Wayne State grid and opens it in claude.ai. By approval only: https://openspineconsortium.com/

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks.
```

### 6. Small promo tile (440x280)

`extension/store-assets/promo-tile-440x280.png`

### 7. Screenshots (up to 5, 1280x800), in this order

Drag them in one at a time in this order; the first is the one the listing shows first.

1. `extension/store-assets/screenshot-01-your-grid.png` (the home page diagram)
2. `extension/store-assets/screenshot-02-click-once.png` (the panel, worker online)
3. `extension/store-assets/screenshot-03-sign-in-once.png` (the sign-in step)
4. `extension/store-assets/screenshot-04-seventeen-checks.png` (the checks)
5. `extension/store-assets/screenshot-05-by-approval-only.png` (the access card)

### 8. Marquee promo tile (1400x560)

`extension/store-assets/marquee-1400x560.png` (optional; the store uses it only when it features an
item).

### 9. Official URL

The field lists only sites verified in Google Search Console under the same Google account as the
developer account. Leave it empty until then; nothing else waits on it. To verify:

1. At `https://search.google.com/search-console`, signed in with the developer account's Google account, **Add property**, **URL prefix**: `https://openspineconsortium.com/`.
2. Choose **HTML file** as the verification method; it names a file such as `google1a2b3c4d5e6f7a8b.html`.
3. Send that file name to the maintainer's assistant, which publishes it at the site root (`https://openspineconsortium.com/<that name>`).
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

`storage`

```
Remembers the portal address you connected, your preferences, your acceptance of the agreement, the account name your portal shows with the last approval answer, this installation's random identifier, your statement about each worker's workspace and the audit log of requests made to your portal, all on your device.
```

`alarms`

```
Reads your running job's status files no more than once a minute, renews the approval check and fetches the signed withdrawn-versions list once a day, and keeps doing so after the browser suspends the extension.
```

`scripting`

```
Loads the extension's page script on your university portal, and only there, after you connect it, including into the portal tab that is already open.
```

`activeTab`

```
Lets a click on the toolbar button read the address of the tab you clicked from, to tell whether it is an Open OnDemand portal and, if it is, ask you to allow that one site; nothing is read from the page itself or from any other tab.
```

`sidePanel`

```
Opens the extension's panel beside your portal tab when you click the toolbar button; there is no popup.
```

Host permission (`https://*/*`, optional, requested at a click for one origin)

672 characters (counted with Python; the sheet knows of no limit for this field, so it is kept under
1,000). It names every place a request can come from in 10.0.0: the toolbar button
(`extension/src/entrypoints/background.ts`), the panel's *Connect* and *Allow the portal again*
buttons (`extension/src/ui/strip.ts`) and the setup page's *Connect* field
(`extension/src/ui/sections.ts`), each a single origin asked for inside the click. 9.0.0's text
("when you click the button on that portal's tab ... It never requests a claude.ai, anthropic.com or
claude.com origin") left out the setup page and was untrue of 9.0.0, which asked for an Anthropic
origin before refusing it.

```
Your university's Open OnDemand portal has an address the extension cannot know in advance, so no site is granted at install. The extension asks the browser for one origin at a time, and only from a click: the toolbar button on a tab that looks like an Open OnDemand portal (a page under /pun/ or /nginx/, or the portal already connected), the Connect or Allow button in its panel, or Connect on its setup page, where the portal's address can be typed. It refuses to work until that one site is granted. An address on claude.ai, claude.com or anthropic.com, or on any of their subdomains, is refused before any request, so the extension never requests an Anthropic origin.
```

### Are you using remote code?

**No.** If a box asks why:

```
No remote code. No eval, no new Function, no fetched scripts, no interpreter for remote commands. The daily update check downloads one JSON document (a signed list of withdrawn versions) and verifies its Ed25519 signature with WebCrypto against a public key compiled into the package; JSON is data. Commands to the cluster are a small fixed vocabulary interpreted by shipped code, and the lines the cluster prints during the sign-in are parsed as text and never executed. The cluster-side tool is the one shared copy the university's lab keeps on the cluster; the extension runs it in the user's own cluster account through the portal's shell and carries no copy of it; nothing from the cluster is ever executed in the browser. Fonts are files inside the package; nothing is fetched to display a page.
```

### Data usage

Tick **Personally identifiable information** and nothing else. What it covers, if a box asks:

```
The institutional account name the user's portal shows for the signed-in session and a random identifier the extension made for this installation, sent to the developer's access service in the approval check (with the portal's hostname, the product name and the version) to answer whether that account is approved and whether this is the installation it is approved on. The extension collects and sends nothing else. The access service records each check with the time and a salted hash of the network address the request came from; the address itself is not kept.
```

Leave unticked: health information, financial and payment information, authentication information,
personal communications, location, web history, user activity, website content. (Location stays
unticked: the extension reads no location and sends no address. The service sees the network address
any web request carries and keeps only a salted hash of it, as `PRIVACY.md` says.)

### Certifications

Tick all three: no selling or transfer of user data outside the approved use cases; no use or
transfer for purposes unrelated to the single purpose; no use or transfer to determine
creditworthiness or for lending.

### Privacy policy URL

```
https://openspineconsortium.com/beethoven/privacy.html
```

Then **Save draft**.

## Distribution tab

| Field | Choice |
|---|---|
| Payments | **Free** (no in-app purchases) |
| Visibility | **Private**. Never Unlisted or Public: either lets anyone with the link install it |
| Trusted testers | the address of the Beethoven-users Google Group, the group of approved students (`SUBMISSION.md`, section 0, item 6) |
| Regions | **United States** only |

Then **Save draft**.

## Test instructions tab

In the dashboard's left menu under **Access**, below the four tabs above. Chrome's page for it says
it is "not required for publishing" and is meant for an item that "requires restricted credentials or
a paid account"; the tab itself says what is entered there "is confidential and used solely for
review purposes". Beethoven needs both (a university AccessID on its portal, and the user's own
Claude Pro or Max), and has no account of its own to lend, so the username box says so, the password
box stays empty, and the instructions show what a reviewer can see with the installed item alone and
offer the mock portal. The limits are those of Google's own screenshot of the tab
(`https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions`): 100 characters for
each credential box, 500 for Additional instructions. Counted with Python, without a trailing newline,
ASCII only; the second number is the count if the form counts each line break as two characters.

The steps were first run on the 9.0.0 package on 2026-10-01 (Chromium, with example.com and the
mock portal), which is how its two defects were found. They were run again on the 10.0.0 build in
`release/10.0.0/` the same day (Chrome for Testing 153, unpacked, a fresh profile for each run, the
access service reachable only for st1234 at localhost): every step of the Additional instructions as
written; the agreement's button grey until the end of the text, or until *Open in tabs*; claude.ai,
anthropic.com, www.claude.com, ftp://claude.ai and https:/claude.ai typed into *Connect*, and the
toolbar button on claude.ai/pun/..., refused with no prompt; and the full mock flow to "Your worker
is online" and 17 OK. See steps 2 and 15 once yourself on that build before pasting
(`TEST_BEFORE_UPLOAD.md`, and "Just before uploading").

In the kit, `12-test-username.txt`, `12-test-password.txt` (empty), `12-test-instructions-500.txt`
and `12-test-instructions-long-reply.txt` hold exactly the blocks below, with no newline at the end.

**Username** (96 characters):

```
None: Beethoven has no account, password or licence key of its own. See Additional instructions.
```

**Password**: leave empty. Only if the form refuses an empty box, paste this (43 characters):

```
Not applicable: see Additional instructions
```

**Additional instructions** (490 characters; 494 if each of its 4 line breaks counts as two):

```
Beethoven runs Claude Code in a Wayne State grid account via Open OnDemand. Needs the user's own AccessID, VPN, 2FA, Claude Pro/Max and our approval; we cannot lend accounts.
1. Toolbar icon on example.com: panel at step 1 of 11, no prompt.
2. Details > Run the checks: 2 FAIL, 15 BLOCKED (no portal).
3. Setup page: scroll to end, tick 4, sign, Accept and Continue. At 3. Your portal type example.com, Connect: Chrome asks for that site only. Disconnect removes it.
Mock portal on request.
```

Then **Save changes**.

**The fuller text, for a reply to a reviewer** (not for this form; 4,955 characters, 4,982 if each
of its 27 line breaks counts as two). If a reviewer asks for test access or for the mock portal,
reply with the letter in `SUBMISSION.md`, section 4, and this text under it, and attach
`release/10.0.0/reviewer/beethoven-mock-portal.zip` (the mock portal, its stand-in scheduler and
cluster tool and its one dependency, `ws`; no extension code). The mock was run end to end only on
Windows, with Git for Windows.

```
WHAT IT IS
Beethoven starts, watches and stops a Claude Code worker (a batch job) in the user's own account on a university cluster, through its Open OnDemand portal, and hands the user the claude.ai link the worker prints. It is not an Anthropic product ("Claude" and "Claude Code" are Anthropic's marks) and not provided by or on behalf of any university.

WHY THERE IS NO TEST ACCOUNT
It has no account, password or licence key of its own; the portal sign-in identifies the user. A worker needs a Wayne State AccessID on its Open OnDemand portal (VPN, second factor), the user's own Claude Pro or Max, and our approval of that account. We cannot issue or lend accounts: one person per account is a term of the portal and of Anthropic's service.

WITHOUT A PORTAL
1. On https://example.com, click the Beethoven toolbar button: the side panel says "Beethoven step 1 of 11: Your portal". No permission prompt.
2. In the panel, "Details" > "Run the checks": "2 thing(s) to fix" (FAIL on "1. Access and agreement" and "2. Portal connected"), 15 BLOCKED; worker buttons disabled. Expected with no portal, accepted or not.
3. The setup page opens on install (or press "Setup page" in the panel). Scroll the agreement to its end (or "Open in tabs"; until then the button is grey), tick the four statements (one consents to class-action and jury-trial waivers), type your name as the signature, press "Accept and Continue". Accepting sends one GET: https://openspineconsortium.com/beethoven/killlist.json.
4. Under "3. Your portal" type example.com, press "Connect": Chrome asks to allow that one site. The button on example.com then shows "step 2 of 11: Waking up your portal" (the site answers 404). No approval check is sent. "Disconnect" removes the site permission and the page script. claude.ai there: refused, no prompt.

FULL FLOW ON A LOCAL MOCK PORTAL
The attached beethoven-mock-portal.zip holds a Node stand-in for the portal, scheduler and cluster tool, plus ws; no extension code. Needs Node 22, bash and openssl; tested end to end only on Windows (Git for Windows).
1. Make a localhost certificate in the unzipped folder (Git Bash: prefix MSYS_NO_PATHCONV=1):
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -subj /CN=localhost -days 30 -addext subjectAltName=DNS:localhost
2. In bash (use no other --user):
MOCK_LOGGED_IN=false node server.mjs --port 8443 --host localhost --user st1234 --cert cert.pem --key key.pem
3. Disconnect example.com first. Open https://localhost:8443/login, choose Advanced, "Proceed to localhost (unsafe)" (your own certificate), then "Sign in as st1234". No password. Our access service approves st1234 from any installation only when the portal is localhost.
4. With the agreement accepted, click the Beethoven button on that tab and Allow Chrome's prompt. The panel then works by itself (two waits of up to a minute).
5. A sign-in tab opens at the stand-in's dummy Anthropic link (client_id=mock-client); close it. Type ABC123 (any six letters or digits) in "Paste the code from that page here", press Enter.
6. Tick the data statement, press "I have read this and the statement is true". A second claude.ai tab opens by itself at a made-up environment (no real session; close it); the panel says "Your worker is online", green "Open in Claude". Run the checks: 17 OK.

WHAT IT NEVER DOES
No host permission at install. It asks Chrome for one site at a time, only from a click: its button on a page whose path starts /pun/ or /nginx/ (Open OnDemand pages) or on the connected portal, a Connect or Allow button in its panel, or the setup page's "Connect". An Anthropic address (claude.ai, claude.com, anthropic.com or subdomains) is refused before any permission request. It runs no script on, reads nothing from and sends nothing to those sites; it only opens Anthropic pages (sign-in, session link, connectors) in a new tab. It never reads the portal's cookie or signs in for the user: the user signs in on Anthropic's page and pastes the one-time code into the panel, which types it once into Claude Code's sign-in in the user's own cluster job and forgets it (not stored, logged or sent to us); it never sees the credential made from it. No remote code, analytics, error reports or usage data.

WHAT IT SENDS US
Nothing before acceptance. Then, without cookies: a daily GET of killlist.json (signed list of withdrawn versions); and, once a connected portal's dashboard shows a signed-in account name, services.json (at most daily) and the approval check to https://beethoven-access.openspineconsortium.workers.dev/access_check with that name, the portal hostname, the product ("bridge"), the version and a random installation id made at acceptance. The answer is yes or no. Per account the service keeps the last check (time, portal, version, answer, a salted hash of the network address, never the address) and a count, and binds an approved account to the first installation that asks.
```

Then **Submit for review** (top right). What to expect, and what to answer a reviewer, is in
`SUBMISSION.md`, sections 1 and 4.
