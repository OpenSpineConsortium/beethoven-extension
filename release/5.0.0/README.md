# Ashley Bridge 5.0.0 packages

Built 2026-09-29 (evening) from this repository (`extension/`, Node 22: `npm ci && npm run build && npm run zip`,
plus `npx wxt zip -b edge` and `npx wxt zip -b safari`). Checksums in `SHA256SUMS.txt`.

| File | For | Notes |
|---|---|---|
| `ashley-bridge-5.0.0-chrome.zip` | Chrome Web Store | Manifest V3; permissions storage, alarms, scripting, activeTab, sidePanel; optional host `https://*/*` |
| `ashley-bridge-5.0.0-edge.zip` | Microsoft Edge Add-ons (Partner Center) | The same Chromium build as Chrome, byte for byte; Edge accepts either file |
| `ashley-bridge-5.0.0-firefox.zip` | Firefox Add-ons (AMO) | Manifest V2 with `sidebar_action`; `data_collection_permissions: personallyIdentifyingInfo` |
| `ashley-bridge-5.0.0-sources.zip` | AMO's source-code upload | The extension project; build note in `docs/store/LISTING.md` |
| `ashley-bridge-5.0.0-safari.zip` | Not a store upload | Input for Apple's converter on a Mac (`xcrun safari-web-extension-converter`); Safari is untested and deferred (`docs/store/LISTING.md`) |

To test by hand before uploading: `docs/store/TEST_BEFORE_UPLOAD.md`. To upload: `docs/store/SUBMISSION.md`.
Unpacked folders for developer-mode testing come from the same build (`extension/.output/chrome-mv3`,
`extension/.output/firefox-mv2`), or unzip the chrome and firefox files here.
