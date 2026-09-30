# Mac and Safari

Short, from the browser-platform research note ("Which toolchain gives one codebase for all four
browsers, and what does Safari packaging really require?") and the report. Written for the maintainer,
who develops on Windows today.

## What the Safari edition needs

- **A Mac, or Apple's packager without one.** WXT emits the Safari build (`wxt build -b safari`,
  producing `.output/safari-mv2` or `safari-mv3`) but does not create the native app wrapper Safari
  requires. The wrapper comes from `xcrun safari-web-extension-packager .output/safari-mv2` on a Mac
  with Xcode (the tool was renamed from `safari-web-extension-converter`), or from Apple's App Store
  Connect packager, which builds "from any web browser, without requiring a Mac" in Xcode Cloud and
  deducts from the 25 hours per month of Xcode Cloud that the membership includes. Either way the
  output is an
  Xcode project or an App Store Connect build, not a zip.
- **An Apple Developer Program membership.** Required for certificates, App Store Connect, TestFlight,
  Xcode Cloud and notarization. A free account cannot distribute.
- **App Store review**, with an app record and the privacy labels in `STORE_LISTING.md`. Apple's current
  page also describes a Developer-ID-plus-notarization route outside the Mac App Store; developers
  reported as late as January 2024 that such builds still needed "Allow Unsigned Extensions" on every
  launch. Whether the route loads cleanly on Safari 26 is open question 12 and is tested before it is
  promised to any campus.
- **No licence keys.** Apple's Guideline 3.1.1 forbids an app from unlocking functionality with its own
  mechanism, and the May 2025 US external-link change did not remove the in-app-purchase obligation. The
  Safari edition is free, or sells a Full Edition by in-app purchase in the host app, or is skipped.
- **Platform differences the code must respect.** `persistent: false` is mandatory on iOS and all MV3
  background pages are non-persistent, so the background is assumed to die within tens of seconds and
  all network work runs from the content script. `storage.session` exists from Safari 16.4.
  `webRequest` is macOS-only and non-blocking; `identity` and `update_url` are unsupported (updates come
  through the App Store). `scripting` lacks `injectImmediately`. Safari prompts per site on first visit
  and, from Safari 17, a grant covers all profiles and private browsing. Whether Safari honours
  `optional_host_permissions` at runtime exactly as Chrome does is not yet measured (open question 8).
- **Testing.** "Allow unsigned extensions" (Settings, Developer) resets when Safari quits; "Add
  Temporary Extension" installs a folder for at most 24 hours. Device testing on iOS needs the paid
  membership.
- **No side panel.** The icon click that opens the side panel on Chrome and Edge and the sidebar on
  Firefox opens the panel page in a tab on Safari; `permissions.request` for the portal origin still
  comes straight from that click, the strip runs in the panel page as on the others, and the options
  page is the same. The sign-in sitting's WebSocket lives in the content script and its port in the
  panel page, so Safari's short background lifetime does not cut it off; closing the panel tab ends
  the sitting, as closing the side panel does elsewhere.

## Moving development to a Mac

Ashley's `docs/MAC.md` covers the mechanics that carry over unchanged: `xcode-select --install`,
Homebrew `node@22`, the grid SSH block (`MACs +hmac-sha1`, `AddressFamily inet`), and moving the vendor
signing keys by encrypted archive, never through git or e-mail. For Beethoven add: `npm ci` in
`extension/`, the WXT build for each target, and the packager step above. The repository is LF; scripts
that name `/c/Users/grego/...` are the Windows machine's.

## What is not decided

Whether to ship Safari at all in the first release. The cost is a membership, a Mac or Xcode Cloud
hours, a separate review track and an in-app-purchase implementation for any paid edition; the benefit
is the students who use Safari on macOS and iOS. Chrome, Edge and Firefox come from one `wxt submit`.
