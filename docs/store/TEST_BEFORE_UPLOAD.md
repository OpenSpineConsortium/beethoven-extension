# Testing Beethoven 10.0.0 by hand before the store upload

One person, one afternoon, one browser: Chrome, the only one Beethoven is offered in from 8.0.0 (a
private listing on the Chrome Web Store; `SUBMISSION.md`). Written 2026-09-29 for 4.0.0, brought up
to date for 6.0.0 and 7.0.0 the same night, for 8.0.0 on 2026-09-30, and for 9.0.0 the same evening
(the pages in the site's theme with its typefaces bundled, and a new icon; nothing else in the code
changed: same permissions, same requests, same agreement version 7 and privacy statement version 8),
and for 10.0.0 on 2026-10-01. 9.0.0 was built on 2026-09-30 and replaced before any review because
of two defects: it asked Chrome for a site permission on an Anthropic address before refusing that
address as a portal, and its agreement's *Accept and Continue* button did not wait for the text to
be scrolled to its end. Step 2 and step 15 check both on the 10.0.0 build; the agreement and privacy
statement stay at versions 7 and 8. The build is in
`extension/.output/chrome-mv3/`; the zip beside it is what the store gets. To rebuild: Node 22, `npm
ci`, `npm run build`, `npm run zip` in `extension/` (the Firefox build those commands also write is
not tested here and not submitted).

## Before you start (once)

- Your AccessID is approved for Beethoven (`node tools/intake/admin.mjs list` in the repository of
  Beethoven for VS Code, Desktop folder `ashley`, shows it).
- One approved account, one installation. The first installation of 8.0.0 or later that checks your AccessID
  binds it, and this afternoon's unpacked build is an installation. Before you test, clear your seat
  (`node tools/intake/admin.mjs reset-seat <your AccessID>`) so the unpacked build binds; after the
  test, clear it again before you install from the private listing, or use *Move the approval* in
  the e-mail the listing's installation triggers. Never run a `curl` check with your own AccessID:
  the first identifier that asks binds the account.
- The service's `REQUIRE_INSTALL_ID` is `"0"` while 7.0.0 builds are still in use (`SUBMISSION.md`,
  section 2); with it at `"0"` an old build is approved and binds nothing, and 8.0.0 and later
  bind as described.
- Your Claude sign-in on the grid is current: `hpcworker claude status` over ssh says the sign-in
  folder is present and consent is recorded.
- Know the state of the worker chain: `hpcworker worker status --name worker`. If a worker is
  online, the extension will find it and say so ("found running"); to test a cold start, stop it
  first (`hpcworker worker stop --name worker`, or the panel's Stop later).
- If an older build (9.0.0 or earlier, including one under the old name) is loaded in the browser,
  remove it first: the pass below starts from a fresh install (an older build's storage may carry an
  older agreement record), and two builds would both answer the icon on the portal tab. If you
  rebuild into a folder Chrome already has loaded unpacked, press *Reload* on the Beethoven card in
  `chrome://extensions` afterwards: Chrome otherwise goes on running the old background script under
  the new version number (seen on 2026-10-01, with 9.0.0's files swapped for 10.0.0's in place).
- The lab's shared copy is published: over ssh, `bash -lc 'hpcworker version'` prints the version of
  the shared copy at `/rs/rs_grp_oschome/shared/beethoven/hpcworker/current`.
- Have the phone with the Claude app signed in to the same Claude account.

## What a full pass looks like

1. **Install** the unpacked build: `chrome://extensions`, turn on *Developer mode* (top right),
   *Load unpacked*, choose `extension/.output/chrome-mv3`. The setup page opens by itself. (Unpacked
   loading is for this test only; students install from the private listing.)
2. **Setup page.** Before scrolling, tick the four statements and type your name: *Accept and
   Continue* must stay grey while the text sits at its top, and the line under the text must still
   ask you to read it to its end (9.0.0 enabled the button at once). Then scroll the agreement to its
   end: the button turns active. (*Open in tabs* instead of scrolling, which opens the agreement and the privacy
   statement in two tabs, must also turn it active; try it in the second profile of step 13, where
   the agreement is accepted afresh.) Press *Accept and
   Continue*. The agreement is version 7 and the privacy
   statement version 8. The page wears the site's theme: the cream ground, ink text, headings in
   Newsreader, body text in IBM Plex Sans, the teal accent. The Access card says it has not checked yet, and says what is sent, the
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
12. **The theme, the fonts and the icon (new in 9.0.0).** The setup page, the panel, *Details* and
    the options page all show the cream ground, Newsreader headings, IBM Plex text and the teal
    *Open in Claude* button; nothing falls back to a system font (Times or Arial where Newsreader or
    Plex should be is a defect). In the developer tools of the setup page and of the panel, *Network*,
    filter *Font*, reload: every font comes from `chrome-extension://<id>/fonts/`, and nothing goes to
    `fonts.googleapis.com`, `fonts.gstatic.com` or any other address. The toolbar icon is the rack
    with one teal unit; look at it at 16 px on a light and on a dark toolbar (*Customize Chrome*, a
    dark colour) and write down if it turns to a grey smudge.
13. **A second installation.** Make a second Chrome profile (*Add* in the profile menu), load the
    same unpacked build there, accept the agreement, open the portal, click the icon. The strip must
    stop at the access step with exactly "This account is already set up on another computer. Ask
    your lab lead to move it here." and no button; *Details* shows the same sentence. Within a
    minute the service e-mails you once ("... asked from a second installation; it was refused").
    Press *Move the approval to the new installation*, then click the icon in the second profile
    again: it goes on to approved. The first profile keeps its approval until its day is up (an
    approval under a day old is not asked again), then shows the same sentence. Move it back, or
    `reset-seat`, before you go on. Remove the second profile afterwards.
14. **Not approved (optional).** Your own account is approved, so this path needs either a colleague
    who is not on the list (one click: the strip must read *Ask for access* and open the request
    page with their AccessID filled in) or the mock recipe in `LISTING.md` run with `--user zz9999`.
    That run sends a check for zz9999 to the live access service, which refuses it and keeps a
    record under that name; use a name that is certainly nobody's AccessID. (The recipe sent to
    reviewers tells them to use st1234 only.)
15. **Anthropic addresses are refused before any prompt (new in 10.0.0).** Do this in a profile
    with no portal connected: a fresh Chrome profile with the unpacked build loaded, or after
    *Disconnect*. With a portal connected the setup page has no address field, and the panel shows
    your portal's step instead. On the setup page, under *3. Your portal*, type `claude.ai` and press
    *Connect*: the line under the field says it is an
    Anthropic address, not a portal, and Chrome shows no *Allow*/*Deny* prompt. The same for
    `anthropic.com` and `www.claude.com`. Then open `https://claude.ai/pun/x` in a tab (claude.ai
    answers with a page of its own; a path under `/pun/` is what made 9.0.0 ask) and click the
    Beethoven button there: the panel opens, says the tab is an Anthropic address and not a portal,
    and Chrome shows no prompt. If the panel offers to connect
    that tab as your portal, that is a defect: write it down, press it once, and there must still be
    no prompt. The same for `ftp://claude.ai` and `https:/claude.ai` typed into *Connect*. Last,
    `chrome://extensions`, Beethoven, *Details*, *Site access*: no claude.ai, claude.com or
    anthropic.com. This is what the Test instructions and the host-permission justification in
    `PASTE.md` say; do not paste them before it is seen.
16. **One notice (new in 10.0.0).** On the setup page, press *Check my access now* while your
    approval is under a day old: the notice says once that the service was not asked again ("Not
    asked: ..."), never "Not asked: not asked: ...".

If the strip stalls: a first-visit "Server Error" from the portal clears on a second click; "sign in
to your portal" means the portal session expired, sign in in the tab; a probe waiting in the queue
is normal.

Chrome-specific things to look at: the permission prompt names only the portal origin;
`chrome://extensions` shows no host permission under *Site access* until you allowed the portal, and
then only that site. When done, remove the unpacked copy; the store installation has a different id,
starts empty (the agreement is accepted once more) and is a new installation for the service.

## Just before uploading

- `unzip -p release/10.0.0/beethoven-10.0.0-chrome.zip manifest.json` (the file you upload; its SHA-256
  matches `release/10.0.0/SHA256SUMS.txt`) shows version 10.0.0, the
  name Beethoven, the 128-character `description` in `LISTING.md` and the permissions `storage,
  alarms, scripting, activeTab, sidePanel`, optional host `https://*/*`, nothing else. `unzip -l` on
  the same zip lists `fonts/` with seven `.woff2` files and the two `-OFL.txt` licence texts.
- The five public pages open: `https://openspineconsortium.com/beethoven/`, `privacy.html`,
  `terms.html`, `support.html` and `request.html` beside it; none offers a download or names another
  browser; `https://openspineconsortium.com/beethoven/services.json` carries `access_check` on
  `beethoven-access.openspineconsortium.workers.dev` and no `allowlist`;
  `https://openspineconsortium.com/beethoven/killlist.json` answers 200 and verifies; the old
  address `https://openspineconsortium.com/ashley/bridge/` sends you to the new landing page.
- The access service of 2026-10-01 is deployed under both names, in the order `SUBMISSION.md`,
  section 0, item 5 gives, and the reviewer account `st1234` answers yes from two different
  installation identifiers at portal `localhost` (the same item).
- Reviewer note: Beethoven runs Claude Code and is not an Anthropic product. The listing's last
  paragraph, the reviewer recipe in `LISTING.md` and the landing page's last line carry that
  sentence; read it once in each before pasting.
- The access service saw your checks: `node tools/intake/admin.mjs list` (the `checks` array, and
  your seat).
- Look at each file `PASTE.md` names, once yourself, and run the one-line check at the top of
  `PASTE.md`: every image the exact size its field asks for and `RGB` (no alpha). Every product
  screen in them is a real capture of the 9.0.0 build, whose screens they show 10.0.0 does not
  change (`LISTING.md`, "Images and the promo video"); compare each with what this build shows
  you, and every image or video frame that names Claude or claude.ai carries, small, "Not an
  Anthropic product." Watch the promo video to its end before it goes to YouTube.
- The description in `PASTE.md` is 1,203 characters; paste it whole. (This file said 1,049 until
  2026-10-01; 1,203 is the count of the text in the sheet.)
- Before pasting the Test instructions in `PASTE.md`, see each of their steps on this 10.0.0 build:
  steps 2 and 15 above, and, in a profile with no portal connected (a fresh Chrome profile with the
  unpacked build loaded; step 13's second profile is gone by then), the button on `https://example.com` opening the panel at "step 1 of
  11" with no prompt, *Run the checks* showing 2 to fix and 15 blocked, and *Connect* with
  `example.com` on the setup page asking for that one site. If a step count or a check count
  differs, correct the text and its character count in `PASTE.md` before pasting.
- Then follow `SUBMISSION.md`.
