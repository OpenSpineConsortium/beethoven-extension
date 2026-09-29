# Publishing the site pages and the kill-list

The public pages the store listings point at, and the signed kill-list the extension fetches once a
day, live in the site repository `openspineconsortium.github.io` (GitHub Pages, custom domain
`openspineconsortium.com`), checked out beside this repository on the maintainer's machine. Nothing
here commits or pushes: the tools write files, the maintainer reviews `git status` in the site
repository, commits and pushes (network through WSL, as everywhere else).

Written 2026-09-29. Addresses, fixed:

| Page | Address | Source |
|---|---|---|
| landing (store `homepage_url`, the panel's *Ask for access* link) | `https://openspineconsortium.com/ashley/bridge/` | `docs/site/bridge/index.html`, copied as is |
| privacy statement (the privacy-policy URL in every store dashboard) | `https://openspineconsortium.com/ashley/bridge/privacy.html` | `PRIVACY.md`, rendered |
| license terms | `https://openspineconsortium.com/ashley/bridge/terms.html` | `LICENSE.txt`, rendered |
| support and notice address (exists already, shared with Ashley) | `https://openspineconsortium.com/ashley/support.html` | the site repository, hand-written |
| kill-list (`KILLLIST_URL` in `extension/src/licensing/killlist.ts`) | `https://openspineconsortium.com/ashley/bridge-killlist.json` | signed by the license tool, see below |

The Ashley page `ashley/index.html` carries one added line, a link to `bridge/` in its Documents list.
No other existing Ashley page is touched.

## The pages

```
python -X utf8 tools/site_bridge_build.py [--site <path to openspineconsortium.github.io>] [--check-only]
```

Default `--site` is `../openspineconsortium.github.io` relative to this repository. The script:

1. copies `docs/site/bridge/index.html` to `<site>/ashley/bridge/index.html`. The landing page is
   hand-written: what Ashley Bridge is in three sentences, the three student steps, the *Install*
   section, the "never does" list (the six negative statements of `docs/STORE_LISTING.md`, verbatim),
   the documents, the Chrome Limited Use sentence, and a box for reviewers and security offices with
   the exact permission list of `extension/wxt.config.ts`;
2. renders `PRIVACY.md` to `privacy.html` with pandoc (`-f markdown+pipe_tables -t html5`);
3. turns `LICENSE.txt`, which is hard-wrapped plain text, into headings and paragraphs and renders
   that with pandoc (`-f html -t html5`). The rule: blocks are separated by blank lines; the first
   block is the title; a one-line all-caps block starting `N.` is a section heading; a line starting
   `(a) ` begins a sub-item of its own; an indented line continues the line before it. 23 section
   headings and 89 paragraphs came out of version 2;
4. uses `docs/site/bridge/template.html` for both rendered pages: the CSS block of Ashley's own
   pages (`ashley/tools/site_build.py`, byte for byte) plus a second small block for phones (word
   breaking, tables that scroll inside their own box, the store buttons), a back link and *Support
   and notices* at the top, and a *Save a copy* box with a back link at the bottom. Pandoc's default
   stylesheet is not included (pandoc 3.8 ignores `-V document-css=false`; the template replaces it);
5. checks the result against things outside the rendering, and exits non-zero naming the page and
   the reason if any fails:
   - every word of `PRIVACY.md` and of `LICENSE.txt` appears in its page, in order (a contiguous
     word-sequence match after markdown punctuation and curly quotes are set aside), so the
     conversion in step 3 cannot silently drop or reorder text;
   - each page parses with Python's `html.parser` and its non-void tags balance;
   - the banned word is on no page and in neither source text;
   - each page has the viewport meta and the 16 px gutter, and carries the Ashley CSS block
     unaltered; if `../ashley/tools/site_build.py` is present its CSS is compared too, and drift is
     reported;
   - the versions the landing page names for the privacy statement and the agreement are the
     `Version N, YYYY-MM-DD` lines of the two texts (4 and 2 today).

   The last two checks earned their keep on the day they were written: `PRIVACY.md` moved from
   version 3 to version 4 at 11:38 local on 2026-09-29, six minutes after `privacy.html` had been
   rendered from version 3, and `--check-only` reported the stale page and the stale version on the
   landing page before anything was pushed. Whenever a text changes, rebuild.

`--check-only` runs the checks on whatever is in the site folder without writing. Pandoc is found on
`PATH` or at `C:\Program Files\Pandoc\pandoc.exe` (3.8 was used).

After running it: in the site repository, `git status` should show `ashley/bridge/` (three files) and
nothing else changed by the script. Review the diff, commit, push. GitHub Pages publishes within a
minute or two; the CDN caches for 600 s (`cache-control: max-age=600`).

### When the store listings go live

The three *Install* buttons are placeholders: `<a class="store" data-store="chrome|edge|firefox"
data-status="pending" href="#install" aria-disabled="true">` with the text "listing pending review".
For each store, once its listing is approved, edit `docs/site/bridge/index.html`: set `href` to the
listing's address, set `data-status="live"`, remove `aria-disabled`, and change the small text to
something like "for Chrome and Chromium browsers". Rebuild, review, commit, push. Do not edit the copy
in the site repository directly; it is overwritten on the next build.

### When PRIVACY.md or LICENSE.txt changes

Change the text and its version together (integer), as `CLAUDE.md` says, and update the two
`(version N)` mentions in `docs/site/bridge/index.html`; the build refuses otherwise. Then rebuild.

## The kill-list

`ashley/bridge-killlist.json` in the site repository is one JSON document with the readable fields
`v`, `kid`, `issued`, `revoked_versions`, `revoked_lids`, `message` and a `sig` field: a complete
`ASHLEYREV1` token whose payload repeats those fields, signed with Ashley's release key `k1` (the same
Ed25519 key that signs licence keys; the extension's `keys.json` and Ashley's `grid/license_keys.json`
hold the same two public keys, `k1` and `trial`). The extension trusts only the signed payload; the
readable fields are for people. The verifier (`verifyKillList` in `killlist.ts`) checks the token's
own payload part, exactly as Ashley's `open()` does, so no canonical key order is involved; the tool
writes the fields in the documented order anyway.

Two subcommands in Ashley's license tool do the work
(`C:/Users/grego/OneDrive/Desktop/ashley/tools/license/ashley-license.mjs`; run from the Ashley
repository with Node 22 on `PATH`; the private key stays in the vendor folder and is used only through
that tool's own `privateKey()` helper, never printed, copied or moved):

```
export PATH=/c/Users/grego/tools/node22:$PATH
cd /c/Users/grego/OneDrive/Desktop/ashley
ASHLEY_VENDOR_DIR=/c/Users/grego/.ashley-vendor node tools/license/ashley-license.mjs sign-killlist \
    [--kid k1] [--revoked-versions 1.0.0,2.0.0] [--revoked-lids L-abc,L-def] [--message "..."] \
    --out /c/Users/grego/OneDrive/Desktop/openspineconsortium.github.io/ashley/bridge-killlist.json
node tools/license/ashley-license.mjs verify-killlist <path>
```

`--kid` defaults to the newest release key (`k1`; trial keys are never chosen by default); the two
lists default to empty and are de-duplicated and sorted; versions must look like `1.0.0`, licence ids
like `L-...`; `--message` defaults to empty and is shown to the student; without `--out` the document
goes to standard output. The tool verifies the document it just made against `grid/license_keys.json`
before writing it. `verify-killlist` checks the signature against those public keys, requires `v: 1`,
and also requires the readable fields to equal the signed payload (exit 2 and the field names if they
differ, since a person would otherwise read one thing while the extension enforces another). If `k1`
were ever encrypted the tool asks for `ASHLEY_VENDOR_PASSPHRASE`; on 2026-09-29 it was not.

**The list is whole, not a delta.** The extension keeps whichever verified list has the newest
`issued`, so a new list replaces the old one entirely: every withdrawal that must stay in force is
repeated on every signing. Re-signing with an empty `--revoked-lids` un-withdraws every licence.

Keep a note of the arguments used for each signing (a line in the vendor folder's own notes is
enough; the ledger records licence revocations made with `revoke`, but the kill-list tool does not
write the ledger).

### To withdraw a version or a licence

1. Sign a new list with the complete sets: `--revoked-versions` (every extension version that must
   stop sending commands and tell the student to update) and `--revoked-lids` (every withdrawn licence
   id, including those already withdrawn), and a one-sentence `--message` in plain words, since the
   panel shows it.
2. `verify-killlist` the written file.
3. In `extension/`, run `npx vitest run test/killlist.live.test.ts`. That test asserts that nothing is
   revoked, on purpose: it is a tripwire against a revocation nobody meant to publish. After a real
   withdrawal, change its two `toEqual([])` expectations to the intended lists in the same change,
   and only then commit.
4. Commit and push the site repository. Then check the live file:
   `curl -sI https://openspineconsortium.com/ashley/bridge-killlist.json` should answer `200` with
   `content-type: application/json` and `access-control-allow-origin: *`; download it and
   `verify-killlist` the download.
5. Every installation picks the new list up within 24 hours (`KILLLIST_PERIOD_MINUTES` is one day,
   the first check is a minute after the browser starts the extension) plus up to 600 s of CDN cache.
   The extension fetches with `cache: 'no-store'`, `credentials: 'omit'` and `redirect: 'error'`: the
   address must answer directly, never with a redirect, which a plain file on Pages does. An
   installation that is offline keeps its last good list and is never stranded by a failed fetch.

### Signed on 2026-09-29

`kid k1`, `issued 1790695956` (2026-09-29), nothing revoked, message "Ashley Bridge is current.".
`verify-killlist`: ok. Two tampered copies were rejected as they should be (a changed readable field:
"the readable fields differ from the signed payload: revoked_versions"; four changed signature
characters: "the signature does NOT verify"). A second list with `--revoked-lids L-test2,L-test1
--revoked-versions 1.0.0` round-tripped (sorted, verified) and was discarded. The live vitest passed
4 of 4 against the file in the site repository with `BUNDLED_KEYS`.

## CORS: the finding

The extension holds no host permission for `openspineconsortium.com` (and must not: the only host it
ever asks for is the student's portal), so the daily fetch from the background is a plain cross-origin
request and the browser hands the JSON to the extension only if the server allows it with
`Access-Control-Allow-Origin`. GitHub Pages does send it on every response. Confirmed 2026-09-29
against a JSON file already on the site:

```
$ curl -sI https://openspineconsortium.com/ashley/services.json
HTTP/2 200
server: GitHub.com
content-type: application/json; charset=utf-8
access-control-allow-origin: *
cache-control: max-age=600
x-served-by: cache-dtw8020-DTW
...
```

No `Vary: Origin`, no credentials (the fetch sends none), a wildcard: what the fetch needs. The same
header will be on `bridge-killlist.json` once it is pushed, because Pages sends it for every file; run
the `curl -sI` line in step 4 above after the first push to see it on the real address. Not verified
today: the live `bridge-killlist.json` address itself (it answers 404 until the site is pushed).

## What was verified on 2026-09-29, and what was not

Verified: pandoc 3.8 renders both documents (`privacy.html` was re-rendered from `PRIVACY.md`
version 4 after the change above); all three pages parse with `html.parser` and balance;
the banned word is absent from the pages, the sources, the scripts and this document; every word of
both source texts is on its page in order; `npm run typecheck` passes with the new test file;
`npx vitest run test/killlist.live.test.ts` passes 4 of 4; the `sign-killlist` / `verify-killlist`
round trip; the CORS header on an existing Pages JSON file; at a 360 px viewport (headless Edge, each
page inside a 360 px iframe) every page's `scrollWidth` equals its `clientWidth`, so there is no
horizontal page scroll, and the 4-column privacy table scrolls inside its own box.

Not verified: the pages on the live site (nothing was pushed); the store listing addresses (none
exist yet); rendering in Firefox and Safari; a screenshot at true phone width (Edge's headless window
would not go below its minimum width, so the visual check was done in the iframe measurement above
and at 900 px).
