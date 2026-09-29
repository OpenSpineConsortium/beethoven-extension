# Testing Ashley Bridge 6.0.0 by hand before the store uploads

One person, one afternoon, three browsers. Written 2026-09-29 for 4.0.0 and brought up to date for 6.0.0 the
same evening. The builds are in `extension/.output/`:
`chrome-mv3/` (Chrome and Edge), `firefox-mv2/` (Firefox); the zips beside them are what the stores get.
To rebuild: Node 22, `npm ci`, `npm run build`, `npm run zip` in `extension/`.

## Before you start (once)

- Your AccessID is on the approved list (`node tools/intake/admin.mjs list` in the ashley repo shows it).
- Your Claude sign-in on the grid is current: `hpcworker claude status` over ssh says the sign-in folder is
  present and consent is recorded.
- Know the state of the worker chain: `hpcworker worker status --name worker`. If a worker is online, the
  extension will find it and say so ("found running"); to test a cold start, stop it first (`hpcworker
  worker stop --name worker`, or the panel's Stop later).
- If an older Ashley Bridge is loaded in the browser, remove it first: its storage carries an old agreement
  record and, before 4.0.0, a key; and 4.0.0 does not know the lab's shared copy, so on an account that uses
  it (yours since 2026-09-29) it would upload its own copy of the tool over the launcher.
- The lab's shared copy is published: over ssh, `bash -lc 'hpcworker version'` prints `5 (shared copy at
  /rs/rs_grp_oschome/shared/ashley/hpcworker/current)`.
- Have the phone with the Claude app signed in to the same Claude account.

## What a full pass looks like (every browser)

1. **Install** the unpacked build (per-browser steps below). The setup page opens by itself.
2. **Setup page.** Scroll the agreement to its end (the button stays grey until then), tick the four
   statements, type your name, *Accept and Continue*. The Access card says it has not checked yet; there
   is no key box and no username box anywhere.
3. **Pin the icon** from the browser's extensions menu.
4. **Portal.** Open `https://ondemand.grid.wayne.edu` (VPN first off campus), sign in, wait for the
   dashboard.
5. **Click the icon on that tab.** The browser asks to allow that one site: allow. The panel opens and the
   strip runs by itself, one line at a time: portal, warm-up, *Checking your access...* then approved,
   install (your account already uses the lab's shared copy of framework 5: nothing to do; an account
   that has never been set up gets one line, `hpcworker install --shared`, and nothing uploaded), probe (reuses today's, or submits a short job:
   minutes on `reqp`), sign-in (skipped: already signed in), the data statement (tick it), start (finds the
   running worker or submits one), online, and the green *Open in Claude* button. A claude.ai tab opens by
   itself unless you turned that off.
6. **Details, Run the checks:** 17 OK. Check 1 must read `Access approved for go2432 at
   ondemand.grid.wayne.edu (checked <time>); kill-list of 2026-09-29`. Check 6 ends "hpcworker is installed
   (your lab's shared copy)", and the line above the buttons under *Your worker* reads `tool: shared copy,
   version 5 at /rs/rs_grp_oschome/shared/ashley/hpcworker/current`. If it reads `version unknown (...)`
   instead, the portal's Files app did not read the shared copy's `VERSION` (never measured before this
   test): nothing else depends on it, but write the words it shows into `docs/OPEN_QUESTIONS.md`.
7. **Open in Claude.** The environment appears under Code on claude.ai; send a message; get a reply.
8. **Laptop-off test.** Close the claude.ai tab, the panel, the portal tab and the browser. On the phone:
   Claude app, *Code*, the same environment, continue the conversation. Later, reopen the browser, open a
   fresh portal tab, click the icon: the strip says online at once, nothing restarts.
9. **Stop and cold start.** Details, *Stop*: the status becomes "stopped by request; the chain ended" and
   `hpcworker worker status` agrees (no successor). Click the icon again: a new worker is submitted, and
   the strip walks to online again.
10. **Audit log.** Setup page (or Details): export it and read it: one line per portal request, nothing you
    typed, no credential, no key.
11. **Not approved (optional).** Your own account is approved, so this path needs either a colleague who is
    not on the list (one click: the strip must read *Ask for access* and open the request page with their
    AccessID filled in) or the mock recipe in `LISTING.md` run with `--user zz9999`.

If the strip stalls: a first-visit "Server Error" from the portal clears on a second click; "sign in to your
portal" means the portal session expired, sign in in the tab; a probe waiting in the queue is normal.

## Chrome

1. `chrome://extensions`, turn on *Developer mode* (top right), *Load unpacked*, choose
   `extension/.output/chrome-mv3`.
2. Pin: puzzle-piece icon, pin *Ashley Bridge*.
3. The panel is Chrome's side panel (right side). If it does not open, the extension opens the same
   strip in a tab instead; both are fine.
4. Run the full pass. Chrome-specific things to look at: the permission prompt names only the portal
   origin; `chrome://extensions` shows no host permission under *Site access* until you allowed the portal,
   and then only that site.
5. When done, remove the unpacked copy; the store install has a different id and starts empty (the
   agreement is accepted once more).

## Edge

1. `edge://extensions`, *Developer mode* (left pane), *Load unpacked*, choose `extension/.output/chrome-mv3`
   (the same build as Chrome).
2. Pin: *Extensions* menu, the eye icon next to *Ashley Bridge*.
3. The panel is Edge's sidebar; otherwise identical to Chrome. Run the full pass.
4. Edge Add-ons takes the same `ashley-bridge-6.0.0-chrome.zip`.

## Firefox

1. `about:debugging#/runtime/this-firefox`, *Load Temporary Add-on...*, choose
   `extension/.output/firefox-mv2/manifest.json`.
2. A temporary add-on is removed when Firefox quits, and its storage goes with it: after a restart you load
   it again and accept the agreement again. That is a property of temporary add-ons, not of the store
   version, which persists once AMO has signed it.
3. The panel is Firefox's sidebar; the click opens it. If it does not, *View, Sidebar, Ashley Bridge*, or the
   strip opens in a tab.
4. The site permission is a doorhanger under the address bar: *Allow*.
5. Run the full pass. Firefox-specific things to look at: the install notice shows the data-collection
   category the manifest declares (personally identifying information: the account name sent at the
   approval check); the sidebar is readable at its narrow width; the audit export downloads.
6. Optional lint, the same check AMO runs on upload: `npx web-ext lint --source-dir .output/firefox-mv2`
   (fetches web-ext once).
7. AMO takes `ashley-bridge-6.0.0-firefox.zip` and, on the source-code question, `ashley-bridge-6.0.0-sources.zip`
   with the build note from `LISTING.md`.

## Just before uploading

- `unzip -p extension/.output/ashley-bridge-6.0.0-chrome.zip manifest.json` shows version 6.0.0 and the
  permissions `storage, alarms, scripting, activeTab, sidePanel`, optional host `https://*/*`, nothing else.
- The three public pages open: `https://openspineconsortium.com/ashley/bridge/`, `privacy.html`, `terms.html`;
  `services.json` on the site carries `access_check`.
- The access service saw your checks: `node tools/intake/admin.mjs list` (the `checks` array).
- Look at each PNG in `extension/store-assets/` once yourself.
- Then follow `SUBMISSION.md`, store by store.
