# Testing Beethoven 8.0.0 by hand before the store upload

One person, one afternoon, one browser: Chrome, the only one Beethoven is offered in from 8.0.0 (a
private listing on the Chrome Web Store; `SUBMISSION.md`). Written 2026-09-29 for 4.0.0, brought up
to date for 6.0.0 and 7.0.0 the same night, and for 8.0.0 on 2026-09-30. The build is in
`extension/.output/chrome-mv3/`; the zip beside it is what the store gets. To rebuild: Node 22, `npm
ci`, `npm run build`, `npm run zip` in `extension/` (the Firefox build those commands also write is
not tested here and not submitted).

## Before you start (once)

- Your AccessID is approved for Beethoven (`node tools/intake/admin.mjs list` in the repository of
  Beethoven for VS Code, Desktop folder `ashley`, shows it).
- One approved account, one installation. The first installation of 8.0.0 that checks your AccessID
  binds it, and this afternoon's unpacked build is an installation. Before you test, clear your seat
  (`node tools/intake/admin.mjs reset-seat <your AccessID>`) so the unpacked build binds; after the
  test, clear it again before you install from the private listing, or use *Move the approval* in
  the e-mail the listing's installation triggers. Never run a `curl` check with your own AccessID:
  the first identifier that asks binds the account.
- The service's `REQUIRE_INSTALL_ID` is `"0"` while 7.0.0 builds are still in use (`SUBMISSION.md`,
  section 2); with it at `"0"` an old build is approved and binds nothing, and 8.0.0 binds as
  described.
- Your Claude sign-in on the grid is current: `hpcworker claude status` over ssh says the sign-in
  folder is present and consent is recorded.
- Know the state of the worker chain: `hpcworker worker status --name worker`. If a worker is
  online, the extension will find it and say so ("found running"); to test a cold start, stop it
  first (`hpcworker worker stop --name worker`, or the panel's Stop later).
- If an older build (7.0.0 or earlier, including one under the old name) is loaded in the browser,
  remove it first: its storage carries an older agreement record, and two builds would both answer
  the icon on the portal tab.
- The lab's shared copy is published: over ssh, `bash -lc 'hpcworker version'` prints the version of
  the shared copy at `/rs/rs_grp_oschome/shared/beethoven/hpcworker/current`.
- Have the phone with the Claude app signed in to the same Claude account.

## What a full pass looks like

1. **Install** the unpacked build: `chrome://extensions`, turn on *Developer mode* (top right),
   *Load unpacked*, choose `extension/.output/chrome-mv3`. The setup page opens by itself. (Unpacked
   loading is for this test only; students install from the private listing.)
2. **Setup page.** Scroll the agreement to its end (the button stays grey until then), tick the four
   statements, type your name, *Accept and Continue*. The agreement is version 7 and the privacy
   statement version 8. The Access card says it has not checked yet, and says what is sent, the
   installation's identifier included; there is no key box and no username box anywhere.
3. **Pin the icon**: puzzle-piece icon, pin *Beethoven*.
4. **Portal.** Open `https://ondemand.grid.wayne.edu` (VPN first off campus), sign in, wait for the
   dashboard.
5. **Click the icon on that tab.** Chrome asks to allow that one site: allow. The side panel opens
   (if it does not, the same strip opens in a tab; both are fine) and the strip runs by itself, one
   line at a time: portal, warm-up, *Checking your access...* then approved, install (your account
   already uses the lab's shared copy: nothing to do; an account that has never been set up gets one
   line, `hpcworker install --shared`, and nothing uploaded), probe (reuses today's, or submits a
   short job: minutes on `reqp`), sign-in (skipped: already signed in), the data statement (tick
   it), start (finds the running worker or submits one), online, and the green *Open in Claude*
   button. A claude.ai tab opens by itself unless you turned that off.
6. **Details, Run the checks:** 17 OK. Check 1 must read `Access approved for go2432 at
   ondemand.grid.wayne.edu (checked <time>); kill-list of <the date of the list at
   /beethoven/killlist.json>`. Check 6 says the tool is set up from the lab's shared copy, and the
   line above the buttons under *Your worker* reads "the lab's shared copy, version N". Neither may
   show a cluster path, a folder name or the tool's command name (a check that does is a defect;
   write down its words).
7. **Open in Claude.** The environment appears under Code on claude.ai; send a message; get a reply.
8. **Laptop-off test.** Close the claude.ai tab, the panel, the portal tab and the browser. On the
   phone: Claude app, *Code*, the same environment, continue the conversation. Later, reopen the
   browser, open a fresh portal tab, click the icon: the strip says online at once, nothing
   restarts.
9. **Stop and cold start.** Details, *Stop*: the status becomes "stopped by request; the chain
   ended" and `hpcworker worker status` agrees (no successor). Click the icon again: a new worker is
   submitted, and the strip walks to online again.
10. **Audit log.** Setup page (or Details): export it and read it: one line per portal request,
    nothing you typed, no credential, no key.
11. **The name, everywhere.** Every screen says Beethoven and nothing says the old name: the toolbar
    tooltip, the panel and its strip, *Details*, the checks, the options page, the data statement,
    the agreement dialog (its title is "Beethoven Trial Edition License Agreement", version 7), the
    privacy statement (version 8) and the audit export (its file name and its header line). In the
    browser's developer tools, the page script's marker on the portal tab reads
    `beethovenPortalScriptLoaded`.
12. **A second installation.** Make a second Chrome profile (*Add* in the profile menu), load the
    same unpacked build there, accept the agreement, open the portal, click the icon. The strip must
    stop at the access step with exactly "This account is already set up on another computer. Ask
    your lab lead to move it here." and no button; *Details* shows the same sentence. Within a
    minute the service e-mails you once ("... asked from a second installation; it was refused").
    Press *Move the approval to the new installation*, then click the icon in the second profile
    again: it goes on to approved. The first profile keeps its approval until its day is up (an
    approval under a day old is not asked again), then shows the same sentence. Move it back, or
    `reset-seat`, before you go on. Remove the second profile afterwards.
13. **Not approved (optional).** Your own account is approved, so this path needs either a colleague
    who is not on the list (one click: the strip must read *Ask for access* and open the request
    page with their AccessID filled in) or the mock recipe in `LISTING.md` run with `--user zz9999`.

If the strip stalls: a first-visit "Server Error" from the portal clears on a second click; "sign in
to your portal" means the portal session expired, sign in in the tab; a probe waiting in the queue
is normal.

Chrome-specific things to look at: the permission prompt names only the portal origin;
`chrome://extensions` shows no host permission under *Site access* until you allowed the portal, and
then only that site. When done, remove the unpacked copy; the store installation has a different id,
starts empty (the agreement is accepted once more) and is a new installation for the service.

## Just before uploading

- `unzip -p extension/.output/beethoven-8.0.0-chrome.zip manifest.json` shows version 8.0.0, the
  name Beethoven, the 128-character `description` in `LISTING.md` and the permissions `storage,
  alarms, scripting, activeTab, sidePanel`, optional host `https://*/*`, nothing else.
- The five public pages open: `https://openspineconsortium.com/beethoven/`, `privacy.html`,
  `terms.html`, `support.html` and `request.html` beside it; none offers a download or names another
  browser; `https://openspineconsortium.com/beethoven/services.json` carries `access_check` on
  `beethoven-access.openspineconsortium.workers.dev`;
  `https://openspineconsortium.com/beethoven/killlist.json` answers 200 and verifies; the old
  address `https://openspineconsortium.com/ashley/bridge/` sends you to the new landing page.
- The reviewer account `st1234` answers yes from two different installation identifiers
  (`SUBMISSION.md`, section 0, item 5).
- Reviewer note: Beethoven runs Claude Code and is not an Anthropic product. The listing's last
  paragraph, the reviewer recipe in `LISTING.md` and the landing page's last line carry that
  sentence; read it once in each before pasting.
- The access service saw your checks: `node tools/intake/admin.mjs list` (the `checks` array, and
  your seat).
- Look at each PNG in `extension/store-assets/` once yourself.
- Then follow `SUBMISSION.md`.
