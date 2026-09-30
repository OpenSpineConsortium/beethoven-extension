# Beethoven 7.0.0 packages

Built 2026-09-30 at 01:38 UTC (the evening of 2026-09-29, US Eastern) from this repository (`extension/`,
Node 22.23.3: `npm run sync-framework`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npm run zip:all`).
Checksums in `SHA256SUMS.txt`.

| File | For | Notes |
|---|---|---|
| `beethoven-7.0.0-chrome.zip` | Chrome Web Store | Manifest V3; permissions storage, alarms, scripting, activeTab, sidePanel; optional host `https://*/*` |
| `beethoven-7.0.0-edge.zip` | Microsoft Edge Add-ons (Partner Center) | The same Chromium build as Chrome, byte for byte; Edge accepts either file |
| `beethoven-7.0.0-firefox.zip` | Firefox Add-ons (AMO) | Manifest V2 with `sidebar_action`; id `beethoven@openspineconsortium.com`; `data_collection_permissions: personallyIdentifyingInfo` |
| `beethoven-7.0.0-sources.zip` | AMO's source-code upload | The extension project; build note in `docs/store/LISTING.md` |
| `beethoven-7.0.0-safari.zip` | Not a store upload | Input for Apple's converter on a Mac (`xcrun safari-web-extension-converter`); Safari is untested and deferred (`docs/store/LISTING.md`) |

To test by hand before uploading: `docs/store/TEST_BEFORE_UPLOAD.md`. To upload: `docs/store/SUBMISSION.md`.
Unpacked folders for developer-mode testing come from the same build (`extension/.output/chrome-mv3`,
`extension/.output/firefox-mv2`), or unzip the chrome and firefox files here.

## The rename

7.0.0 is the first build published as **Beethoven**. Up to 6.0.0 the packages carried the repository's code
name (`release/6.0.0/`); a public name beginning with Anthropic's mark had been considered and set aside
because it could draw store and brand objections. The repository, its folder and the cluster-side tool
(`hpcworker`, its paths on the cluster) keep their names; nothing a student, a store reviewer or the public
reads carries the code name. Beethoven runs Claude Code and is not an Anthropic product; "Claude" and
"Claude Code" are Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its
publisher.

What changed from 6.0.0:

- **Name and identifiers.** Manifest `name`, `short_name` and toolbar title "Beethoven"; the setup page is
  "Beethoven: setup" and the strip "Beethoven"; `package.json` name `beethoven`; the page-script id
  `beethoven-portal`, its load marker `__beethovenPortalScriptLoaded`, the sign-in port `beethoven-login`
  and the audit export `beethoven-audit-<date>.jsonl`. On the first start after an update the extension
  removes any page-script registration it does not recognise, so a registration left by 6.0.0 does not
  keep loading.
- **Description.** The 128-character sentence of `docs/store/LISTING.md` ("Starts, watches and stops a
  Claude Code worker on your university's Open OnDemand cluster and hands you its Remote Control link.");
  Chrome's manifest documentation allows 132.
- **Addresses.** Homepage `https://openspineconsortium.com/beethoven/`; the services file, the request page
  and the withdrawn-versions list under `/beethoven/`; the access check goes to
  `https://beethoven-access.openspineconsortium.workers.dev` (read from `services.json`). Nothing in 7.0.0
  points at the old `/ashley/bridge*` addresses, which stay up for builds 4.0.0 to 6.0.0.
- **Firefox id** `beethoven@openspineconsortium.com`. AMO treats this as a new add-on: a 6.0.0 installed
  from AMO (if one ever was) is not updated to 7.0.0 there.
- **Texts.** Agreement `LICENSE.txt` version 6 and `PRIVACY.md` version 7 (both 2026-09-29), which rename the
  product and give the new addresses and say nothing new about data; `TERMS_VERSION` 6, so an agreement
  accepted in 6.0.0 is shown and accepted again.
- **What the panel shows.** *Details* says "tool: the lab's shared copy, version N" or "tool: your own
  copy, version N" without a path, and no check result names the shared copy's path or the tool's command
  name. The raw command output, the sign-in terminal and the audit log still show what the portal and
  the tool actually printed or were asked (`docs/ARCHITECTURE.md`, 2.1).
- **Framework 6 bundled** (the cluster-side tool): its refusal sentence and README changed, so `VERSION` is
  6; the same v6 is the lab's shared copy at Wayne State (`current -> v6`, published with
  `tools/deploy_shared.sh`).

Kept on purpose, for compatibility: the storage keys `bridge.*`, the value `product: "bridge"` the access
check and the request page send (the access service maps it to Beethoven), and the kill-list's format tag,
which the signer and the verifier check.

## What was checked on these files

- `npx tsc --noEmit` clean; `npx vitest run` 19 files, 153 passed and 3 skipped before the kill-list was
  signed; the 3 (`test/killlist.live.test.ts`) then passed against the signed
  `openspineconsortium.github.io/beethoven/killlist.json` (4 of 4). `HPCW_PYTHON=python bash
  framework/tests/run.sh`: ALL OK.
- Each zip holds exactly one `manifest.json`. Chrome, Edge and Safari: `name` Beethoven, version 7.0.0, the
  128-character description, permissions `storage, alarms, scripting, activeTab` (+ `sidePanel` on Chrome and
  Edge), optional host `https://*/*`, no `host_permissions`, no content script in the manifest. Firefox: the
  same with `optional_permissions`, the gecko id above and `data_collection_permissions` `required:
  ["personallyIdentifyingInfo"]`. Outside the bundled framework, the only occurrences of the code name's
  letters in any package are the kill-list's format tag and the redaction rule that matches it.
- AMO rebuild: the sources zip (76 files) unzipped into an empty folder, `npm ci`, `npm run build:firefox`
  gave 30 files, every one SHA-256-identical to `extension/.output/firefox-mv2` and to the content of
  `beethoven-7.0.0-firefox.zip` (2026-09-30 01:39 UTC, Node 22.23.3, npm 10.9.9).
- End to end, the Chrome build here in Playwright's Chromium against the mock portal, with the two site
  files answered from the site repository's new `beethoven/` folder (not yet published) and the access
  check sent to the real `beethoven-access` host (`extension/store-assets/e2e/`): run F, the lab's shared
  copy (st1234): approved, online, seventeen checks OK, "tool: the lab's shared copy, version 6"; run G, an
  account not on the list (zz9999): not approved, *Ask for access* opened
  `https://openspineconsortium.com/beethoven/request.html?access_id=zz9999`, nothing submitted; run H, the
  store reviewer's recipe (st1234, own copy): online, seventeen checks OK, the nine store screenshots. No
  request went to an old address in any run.
