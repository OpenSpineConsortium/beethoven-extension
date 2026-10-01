# Beethoven 10.0.0 package, store kit and reviewers' mock portal

Built 2026-10-01 at 07:15 UTC from this repository (`extension/`, Node 22.23.3: `npx tsc --noEmit`,
`npm run build`, `npm run zip`, then `npx vitest run` with the built package present). Checksums in
`SHA256SUMS.txt`.

**9.0.0 was never submitted for review.** It was built on 2026-09-30 and 2026-10-01 (`release/9.0.0/`)
and replaced before any upload, because checking its test instructions in a browser found two defects:
it asked Chrome for a site permission on an Anthropic address before refusing that address as a
portal (typing claude.ai into the setup page's *Connect*, or clicking the toolbar button on a
claude.ai page whose path starts `/pun/` or `/nginx/`, raised Chrome's Allow/Deny prompt, and Allow
left a grant behind), and its agreement's *Accept and Continue* button enabled at once, because the
reading gate measured the text box before the box was on the page. 10.0.0 fixes both, and a doubled
"Not asked: not asked:" notice.

| File | For | Size (bytes) |
|---|---|---|
| `beethoven-10.0.0-chrome.zip` | The private Chrome Web Store listing, and nothing else | 307,932 |
| `store-kit/` | Every file the dashboard asks for, named in the order of `docs/store/PASTE.md`, and one file per Test instructions box | 16 files and `PASTE.md`, below |
| `store-kit-10.0.0.zip` | The same folder in one zip (as `store-kit-10.0.0/...`) | 2,539,376 |
| `reviewer/beethoven-mock-portal.zip` | Only for a store reviewer who asks for the mock portal (`docs/store/SUBMISSION.md`, section 4) | 66,557 |
| `SHA256SUMS.txt` | SHA-256 of the three zips | |

As with 8.0.0 and 9.0.0, the Chrome zip is the only package: no Edge, Firefox or Safari package, no
download on the website, and no file for students, who install from the private listing once they are
approved and in its Google Group. Upload this copy (`release/10.0.0/beethoven-10.0.0-chrome.zip`), not
`extension/.output/`, which the next build rewrites.

## What 10.0.0 changes against 9.0.0

Compared entry by entry with `release/9.0.0/beethoven-9.0.0-chrome.zip`: both hold 27 files.

- **Changed: `background.js`** (49,168 to 51,298 bytes). A toolbar click asks the browser for a site
  only when the tab looks like Open OnDemand and is not on claude.ai, claude.com or anthropic.com or a
  name under them, decided before the request. At install, update and browser start it removes any
  host grant an earlier build obtained on one of those addresses, a stored portal naming one and a page
  script registered for one, and it never reads stored settings naming one as the portal. A page
  script's hello from an Anthropic origin is refused. The click is noted before the browser answers, so
  the panel describes the tab Chrome is asking about. The page script is loaded into an open tab only
  while that tab is on the granted origin. The background gives bare "not asked" reasons; the page says
  the label once.
- **Changed: `content-scripts/portal.js`** (31,843 to 32,391): it stops at once on an Anthropic host.
- **Changed: the three page chunks**, under new hashed names: `chunks/details-*.js` (88,223 to 90,530
  bytes), `chunks/options-*.js` (7,907 to 8,581) and `chunks/sidepanel-*.js` (10,778 to 11,017).
  - The setup page's *Connect* refuses an Anthropic address, under any scheme and in the slash typos
    `https:/claude.ai` and `https:claude.ai`, before asking the browser for anything, and says why
    ("that is an Anthropic address, not a portal: Beethoven never connects to claude.ai, claude.com or
    anthropic.com"). Another scheme typed in front of an address (`ftp://`, `wss://`) is refused as
    "the portal must be an https address" and is no longer read as a host.
  - The reading gate measures the text box only once it is laid out on the page. *Accept and Continue*
    stays grey until the text in the box is scrolled to its end, fits the box with nothing to scroll,
    or *Open in tabs* (renamed from *Open in a tab*) has opened both the agreement and the privacy
    statement, which the box holds.
  - The acceptance record keeps `scrolled_to_end` and adds `opened_in_tab`. The sentence under the name
    field lists what the record holds, including the reading, and says that only the installation
    identifier leaves the browser, with each approval check.
  - The panel says why an Anthropic tab is not a portal and offers only the setup page; it no longer
    offers to connect it. *Allow the portal again* asks for the connected portal's own origin (9.0.0
    used the last clicked tab's origin, or did nothing).
  - "Not asked:" is said once. The strip's status line, where no label goes in front, shows the bare
    reason as a sentence of its own.
  - The worker-name field's `pattern` is valid in Chrome (it logged a console error since the first
    build and was ignored; the script's own check of the name was unaffected).
- **Changed: `options.html` and `sidepanel.html`**: only the hashed chunk names they load.
- **Changed: `manifest.json`**: only its version (9.0.0 to 10.0.0). The same permissions: storage,
  alarms, scripting, activeTab, sidePanel, and the optional `https://*/*` asked for one portal at a
  click; no `host_permissions`, no `content_scripts`, no `optional_permissions`.
- **The same, byte for byte:** the stylesheet, the seven fonts and their two licence texts, the five
  icons, `profiles/wayne.json`, `LICENSE.txt` (agreement version 7), `PRIVACY.md` (version 8) and
  `THIRD_PARTY_NOTICES.md`. `TERMS_VERSION` is still 7, so an agreement accepted in 8.0.0 or 9.0.0
  stays accepted (seen on 2026-10-01: a 9.0.0 record shown as accepted under 10.0.0).

The approval check sends the same fields as 9.0.0, with the version read from the manifest (10.0.0).
The access service changed with this release (`tools/intake/worker.js` in the Beethoven for VS Code
repository, 2026-10-01): the store reviewers' mock account `st1234` is approved only on a portal at
localhost, and `GET /allowlist` no longer publishes the approved AccessIDs. Deploy it, in the order
`docs/store/SUBMISSION.md` (section 0, item 5) gives, before this package is submitted.

## What was checked on this file

- `npx tsc --noEmit` clean. `npx vitest run` after the build and zip: 20 files, 199 tests passed, so
  the hygiene tests read the built 10.0.0 package.
- The zip holds 27 files; no `.map`, no `.ts`, no `sourceMappingURL`, no `eval(` or `new Function(`.
  `LICENSE.txt`, `PRIVACY.md` and `THIRD_PARTY_NOTICES.md` are byte-identical to 9.0.0's. SHA-256
  `d0cfe80960122ea2dbe597b6f1208661a687305fe744739262cd75600896a8ea`.
- In a browser: the built `extension/.output/chrome-mv3` (the same build as this zip) in Chrome for
  Testing 153, loaded unpacked, a fresh profile per run, Anthropic hosts answered by a local stand-in
  page, the access service blocked except in the mock run, where only a check for `st1234` at
  `localhost` could pass; Chrome's Allow/Deny prompt watched with Windows UI Automation. Seen:
  - no prompt for claude.ai, `https://claude.ai/pun/sys/dashboard`, www.claude.com, anthropic.com,
    api.anthropic.com, `CLAUDE.AI.`, `https://console.anthropic.com/nginx/init?...`,
    `foo.bar.claude.ai:443`, `ftp://claude.ai`, `https:/claude.ai`, `wss://claude.ai` and
    `https:claude.ai` typed into *Connect*, before and after acceptance, each answered with the refusal
    sentence and no grant; no prompt for the toolbar button on claude.ai, www.claude.com and
    api.anthropic.com pages under `/pun/` or `/nginx/`, with the panel's Anthropic sentence and only a
    *Setup page* button; the look-alikes `claude.ai.example.edu` and `notclaude.ai` still prompted;
    example.com connected after Allow with exactly `https://example.com/*` held, and *Disconnect* left
    nothing; 26 of 27 expectations held, and the one that did not was the harness's own: after the
    harness removed the grant through `chrome.permissions.remove`, *Allow the portal again* got it back
    from Chrome without a prompt, and for example.com only, not the clicked example.org;
  - the reading gate: grey at the top, after two resizes, halfway and 60 px short of the end; active at
    the end; active after *Open in tabs*, which opened `LICENSE.txt` and `PRIVACY.md`; active when an
    emulated 40,000 px viewport made the whole text fit; records `scrolled_to_end`/`opened_in_tab` as
    true/false, false/true and true/false; `terms_version` 7, `product_version` 10.0.0;
  - every step of the 500-character Additional instructions in `PASTE.md` as written (11 of 11);
  - the full mock-portal flow (`MOCK_LOGGED_IN=false node server.mjs --port 8443 --host localhost
    --user st1234 ...`): Allow for `https://localhost:8443`, one approval check for `st1234` at
    `localhost` answered approved by the live service, sign-in with a typed code, the data statement,
    "Your worker is online", and *Run the checks* 17 OK;
  - "Not asked: ..." said once on the setup page and in *Details*, three ways; no console error from
    the worker-name pattern;
  - requests to the maintainer: none before acceptance; after it, the daily kill-list GET, and in the
    mock run also `services.json` and the one approval check.
- The upgrade from 9.0.0 (a grant on claude.ai obtained under 9.0.0 removed when 10.0.0 starts, the
  9.0.0 acceptance kept) was seen on the first 10.0.0 build of the day, before the last changes
  (scheme refusal, the two-tab reading, the tab check before loading the page script, the click note);
  it was not repeated on this build.
- `reviewer/beethoven-mock-portal.zip` was unzipped into a scratch folder, given a certificate with the
  recipe's `openssl` line, started with `--user st1234` on a free port, and answered `GET /login` with
  200 and "Sign in as st1234"; then stopped.

## The store kit

The folder lists in the order of `docs/store/PASTE.md`; the number in front of each name is the field
number there (fields 2, 3 and 9 to 11 are typed, so they have no file; `12` is the Test instructions
tab). `PASTE.md` in the kit is the same file as `docs/store/PASTE.md`.

| File | Size (bytes) | What it is |
|---|---|---|
| `00-beethoven-10.0.0-chrome.zip` | 307,932 | the package (the same bytes as the zip beside this folder) |
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
| `12-test-username.txt` | 96 | Test instructions, Username, no newline at the end |
| `12-test-password.txt` | 0 | Test instructions, Password: empty, as the box stays |
| `12-test-instructions-500.txt` | 490 | Test instructions, Additional instructions (494 if each line break counts two), no newline at the end |
| `12-test-instructions-long-reply.txt` | 4,955 | not a box: the fuller text for a reply to a reviewer (4,982 if each line break counts two), no newline at the end |
| `PASTE.md` | 23,018 | the paste sheet: every field, in the dashboard's order |

The images are the 9.0.0 ones, unchanged (`extension/store-assets/manifest.txt`): none shows a screen
10.0.0 changes. Every screenshot and tile is 8-bit RGB with no alpha channel at the store's exact size,
and the store icon is the package's own 128 px icon, RGBA, with transparent padding (checked with PIL
in this folder). Each image and the video is byte-identical to its source in `extension/store-assets/`.
The four `12-` files are byte-identical to the blocks in `PASTE.md`.

## The reviewers' mock portal

`reviewer/beethoven-mock-portal.zip` holds 27 files under `beethoven-mock-portal/`: `server.mjs`,
`lib/jobs.mjs` and `bin/` (`hpcworker`, `sbatch`, `scancel`, `sinfo`, `squeue`, Unix mode 0755) from
`extension/mock-ood`, a `package.json` naming `ws` 8.22.0, and `node_modules/ws/` (its MIT `LICENSE`
included) from `extension/node_modules/ws`. No extension source, no certificate or key (the reviewer
makes one with the recipe's `openssl` line), no type declaration, no source map. The stand-in scripts
carry the Wayne State grid's partition names and paths as configuration values; nothing in it is a
secret. It is attached to a reply to a reviewer who asks for it, with the fuller text, and is sent to
nobody else.

## Not done here

Nothing was committed, tagged, uploaded to the store or to YouTube, or deployed. The access service
change is in the Beethoven for VS Code repository's working tree and is not live; the site pages that
go with it (`/beethoven/services.json` and `/ashley/services.json` without `allowlist`, the corrected
reviewers and support pages) are built in the site repository's working tree and are not published.
No Chrome Web Store install or update from 9.0.0 was tried, the Firefox build was not run, and no one
has seen the kit in the real dashboard.
