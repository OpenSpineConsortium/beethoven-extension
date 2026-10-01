# Paste sheet: Beethoven 9.0.0 on the Chrome Web Store

Every field of the dashboard, in the order it asks for them, with the text to paste (in a block:
copy all of it) or the file to upload. Paths are from the repository root,
`C:\Users\grego\OneDrive\Desktop\ashley-bridge`. The texts and the reasons behind them are in
`LISTING.md`; registration, the testers' group and the review are in `SUBMISSION.md`. Written
2026-09-30.

**Everything in one folder.** `release/9.0.0/store-kit/` (also zipped, as
`release/9.0.0/store-kit-9.0.0.zip`) holds a copy of every file this sheet names, with the number of
its field below in front of the name, so the folder lists in the order of this sheet. Fields 2, 3 and
9 to 11 are typed, so they have no file; the package is `00`.

| File in the kit | Field | Copy of |
|---|---|---|
| `00-beethoven-9.0.0-chrome.zip` | Package | `extension/.output/beethoven-9.0.0-chrome.zip` |
| `01-description.txt` | 1. Description | the block under field 1 (no newline at the end) |
| `04-store-icon-128.png` | 4. Store icon | `extension/store-assets/store-icon-128.png` |
| `05-promo-video-1280x720.mp4` | 5. Global promo video (to YouTube first) | `extension/store-assets/promo/beethoven-promo.mp4` |
| `05-promo-video-thumbnail.png` | 5. the video's YouTube thumbnail | `extension/store-assets/promo/beethoven-promo-poster.png` |
| `06-promo-tile-440x280.png` | 6. Small promo tile | `extension/store-assets/promo-tile-440x280.png` |
| `07-screenshot-1-your-grid.png` to `07-screenshot-5-by-approval-only.png` | 7. Screenshots, 1 to 5 | `extension/store-assets/screenshot-0[1-5]-*.png` |
| `08-marquee-1400x560.png` | 8. Marquee promo tile | `extension/store-assets/marquee-1400x560.png` |
| `PASTE.md` | | this sheet |

**Package first.** Upload `extension/.output/beethoven-9.0.0-chrome.zip`: under **New item** for a
new item, or under the old draft's **Package** tab, which turns that draft into Beethoven. The name
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
Lets a click on the toolbar button read the address of the portal tab you clicked from, so the extension can ask you to allow that one site; nothing is read from any other tab.
```

`sidePanel`

```
Opens the extension's panel beside your portal tab when you click the toolbar button; there is no popup.
```

Host permission (`https://*/*`, optional, requested at the click for one origin)

```
Your university's Open OnDemand portal has an address the extension cannot know in advance; when you click the button on that portal's tab, the extension asks the browser for that one origin only, and it refuses to work until that one site is granted. It never requests a claude.ai, anthropic.com or claude.com origin.
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

Then **Save draft**, and **Submit for review** (top right). What to expect, and what to answer a
reviewer, is in `SUBMISSION.md`, sections 1 and 4.
