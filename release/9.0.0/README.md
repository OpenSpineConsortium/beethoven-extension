# Beethoven 9.0.0 package and store kit

Built 2026-10-01 at 02:58 UTC from this repository (`extension/`, Node 22.23.3: `npx tsc --noEmit`,
`npx vitest run`, `npm run build`, `npm run zip`). Checksums in `SHA256SUMS.txt`. A first build of
2026-10-01 at 02:33 UTC (SHA-256 `7e451bba...`) went nowhere; this one replaces it and adds
`THIRD_PARTY_NOTICES.md` to the package, with the corrected store images below.

| File | For | Size (bytes) |
|---|---|---|
| `beethoven-9.0.0-chrome.zip` | The private Chrome Web Store listing, and nothing else | 305,921 |
| `store-kit/` | Every file the dashboard asks for, named in the order of `docs/store/PASTE.md` | 12 files and `PASTE.md`, below |
| `store-kit-9.0.0.zip` | The same folder in one zip (as `store-kit-9.0.0/...`) | 2,530,009 |
| `SHA256SUMS.txt` | SHA-256 of the two zips | |

As with 8.0.0, this is the only package: no Edge, Firefox or Safari package, no download on the
website, and no file for students, who install from the private listing once they are approved and in
its Google Group. The zip goes to the Chrome Web Store dashboard and nowhere else.

## What 9.0.0 is

**9.0.0 is 8.0.0 with the site's theme and the new icon.** Compared file by file with
`release/8.0.0/beethoven-8.0.0-chrome.zip`:

- **Changed: the one stylesheet** (`assets/details-*.css`, 4,574 to 10,852 bytes). The strip, Details,
  the setup page and the signing dialog take the look of openspineconsortium.com: the cream ground,
  cards and pill buttons, Newsreader headings, IBM Plex text, the teal accent, and a dark variant built
  from the site footer's colours. It also fixes four display faults in 8.0.0: the whole strip was tinted
  by its state, the permission list overflowed a 320 px panel, the audit table broke in a narrow panel,
  and the code box's placeholder was too faint to read.
- **Added: `fonts/`**, seven woff2 files (200,736 bytes) and their two SIL Open Font License texts.
  Newsreader 16pt Regular and Medium (productiontype/Newsreader at cfcb4f7) and IBM Plex Sans Regular,
  Medium and SemiBold and Plex Mono Regular and Medium, IBM's Latin1 cuts (IBM/plex at 763c36e). They are
  files inside the package; nothing is fetched to show a page.
- **Added: `THIRD_PARTY_NOTICES.md`** (2,248 bytes), the file `LICENSE.txt` names in section 15 and in its
  entire-agreement clause and which the browser edition never had: the build tool's MIT notice (WXT, whose
  helper code is compiled in) and the two font licences. `scripts/sync-profiles.mjs` copies it from the
  repository root with the other two texts.
- **Changed: `icon/16.png` to `icon/128.png`**, the worker rack from the home page diagram with its one
  unit in teal (`extension/store-assets/src/icon/README.md` says how it was chosen).
- **Changed: `manifest.json`**, only its version (8.0.0 to 9.0.0). Permissions are the same: storage,
  alarms, scripting, activeTab, sidePanel, and the optional `https://*/*` asked for one portal at the
  click; no `host_permissions`, no `content_scripts`.
- **The same:** `background.js`, the Details chunk and `content-scripts/portal.js` are byte-identical to
  8.0.0. The options and side panel chunks and the two pages differ only in the hashed file names they
  refer to. `LICENSE.txt` (agreement version 7) and `PRIVACY.md` (version 8) are byte-identical, and
  `TERMS_VERSION` is still 7, so an agreement accepted in 8.0.0 stays accepted.
- **One data difference besides the theme:** `profiles/wayne.json` carries `"scheduler_in_worker": true`,
  copied by `scripts/sync-profiles.mjs` from `framework/profiles/wayne.json` (framework 9, commit
  2b951d3). The extension's code reads only `shared_install` from that file, so this field changes
  nothing the extension does; the cluster's shared copy reads its own profile.

The approval check sends the same fields as 8.0.0, with the version read from the manifest (9.0.0). The
access service needs no change for it.

## What was checked on this file

- `npx tsc --noEmit` clean. `npx vitest run`: 19 files, 168 tests passed, with the built package present,
  so the hygiene tests read it; `test/hygiene.test.ts` again (11 of 11) after the last change to the
  store pages.
- `npm run build` and `npm run zip` produced the Chrome zip: SHA-256
  `ab3b701dec2794099e4519e37bcb197a1b96c743549873eadba51c22e1be02f8`. Apart from the added notices file, every entry is
  byte-identical to the first build's.
- The zip holds 27 files: `manifest.json`, two pages, five scripts, one stylesheet, seven fonts and two
  licence texts, five icons, `profiles/wayne.json`, `LICENSE.txt`, `PRIVACY.md` and `THIRD_PARTY_NOTICES.md`. No `.map`, no `.ts`,
  no `sourceMappingURL`, no `eval` or `new Function`, no framework or cluster-side code, no `@import` or
  remote `url()` in the stylesheet. Each icon is its manifest size and byte-identical to
  `extension/public/icon/`; each font is byte-identical to `extension/public/fonts/`.

## The store kit

The folder lists in the order of `docs/store/PASTE.md`; the number in front of each name is the field
number there (fields 2, 3 and 9 to 11 are typed, so they have no file). `PASTE.md` in the kit is the
same file as `docs/store/PASTE.md`.

| File | Size (bytes) | What it is |
|---|---|---|
| `00-beethoven-9.0.0-chrome.zip` | 305,921 | the package (the same bytes as the zip beside this folder) |
| `01-description.txt` | 1,203 | the detailed description: ASCII, LF line breaks, no newline at the end |
| `04-store-icon-128.png` | 3,738 | store icon, 128x128, RGBA: 96 px of artwork inside transparent padding |
| `05-promo-video-1280x720.mp4` | 1,361,824 | promo video for YouTube: 28.0 s, 1280x720, 30 fps, H.264 High, no sound |
| `05-promo-video-thumbnail.png` | 92,699 | the video's frame at 8.2 s, 1280x720, for its YouTube thumbnail |
| `06-promo-tile-440x280.png` | 17,152 | small promo tile, 440x280 |
| `07-screenshot-1-your-grid.png` | 92,115 | screenshot 1, 1280x800 |
| `07-screenshot-2-click-once.png` | 110,892 | screenshot 2, 1280x800 |
| `07-screenshot-3-sign-in-once.png` | 145,472 | screenshot 3, 1280x800 |
| `07-screenshot-4-seventeen-checks.png` | 215,125 | screenshot 4, 1280x800 |
| `07-screenshot-5-by-approval-only.png` | 143,363 | screenshot 5, 1280x800 |
| `08-marquee-1400x560.png` | 81,960 | marquee promo tile, 1400x560 |
| `PASTE.md` | 12,173 | the paste sheet: every field, in the dashboard's order |

Every screenshot and tile is 8-bit RGB with no alpha channel and no transparency chunk, at the store's
exact size (checked from the PNG header and with PIL, in `extension/store-assets/` and again in this
folder). The store icon is the package's own 128 px icon, RGBA, with transparent padding. Each
copy is byte-identical to its source in `extension/store-assets/` (`manifest.txt` there describes every
image, the screen each one shows, and how `src/build_assets.mjs` makes them). The images were rebuilt
once with that script on 2026-10-01 at 02:38 UTC: the stills came out byte-identical to the reviewed
ones, and the video changed in one respect, below. A last pass on 2026-09-30 (local time) changed four
stills and no more: the store icon (transparent padding in place of the cream ground, which showed as a
second frame on the store's white page), screenshot 4 ("All OK." in place of "All green."), screenshot 5
("One approval, one installation.") and the marquee (its small brand icon drawn from the 48 px artwork).
The description gained two sentences so that it agrees with `PRIVACY.md`.

The video's sign-in and online strips used to show the top edge of the next box of the capture at the
bottom of the frame, and near the end of the sign-in scene the top of the probe's output box. The cards
now sit lower (sign-in from 64 to 84 px, moving up 22 px instead of 48; online from 272 to 284 px), so
they run off the bottom through plain card. A scan of all 840 decoded frames found nothing but card in
the bottom rows of either scene.

## Not done here

Nothing was uploaded to the store or to YouTube. The dashboard's promo video field takes a YouTube link,
so the video goes to YouTube first (`PASTE.md`, field 5). No one has yet seen these images in the real
dashboard or on a listing page, and the video was inspected as decoded frames, not watched in real time.
