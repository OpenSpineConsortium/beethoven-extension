# Testing Beethoven 21.0.0 by hand before the store upload

One person, one afternoon, one browser: Chrome, the only one Beethoven is offered in (a public
listing on the Chrome Web Store since 20.0.0; `SUBMISSION.md`). Written 2026-09-29 for 4.0.0, brought up to date
through 10.0.0, rewritten on 2026-10-02 for 12.0.0, which carried 11.0.0's first run (the welcome
page, the window-wide panel) and added the direct way (ssh to the grid through a helper inside the
package, a sign-in sheet, the browser's own key with its one restricted line on the grid, Windows
Hello / Touch ID, Forget this computer), brought up to date on 2026-10-04 for 15.0.0 (the helper's
signed installers), and rewritten on 2026-10-08 for 16.0.0, which removed the direct way whole: one
way to the grid, GlobalProtect and the portal, as in 11.0.0, with a press that waits for
GlobalProtect and a note in Settings about a key an earlier version left. Brought up to date on
2026-10-09 for 19.0.0, in which Beethoven signs in to the grid itself: the AccessID and password
typed into its own sheet, saved behind a passkey only when *Remember it on this computer* is ticked,
and Chrome's own box (18.0.0's way) as the other way; and on 2026-10-11 for 20.0.0, which approves
an account from every installation of its own, and on 2026-10-13 for its public listing; and on
2026-10-16 for 21.0.0, which opens the student's project on claude.ai, named in Settings, in place
of a plain session (step 20). The agreement is version 15 and the privacy statement version 16. The build is in `extension/.output/chrome-mv3/`; the zip beside it is what the store
gets. To build it: Node 22, then `npm ci`, `npm run typecheck`, `npm test`, `npm run build` and `npm
run zip` in `extension/` (`SUBMISSION.md`, section 0, item 1). Nothing is signed, and nothing is
installed outside the browser.

This is the pass only you can make: it signs in to the real grid with your own account, through the
real portal with GlobalProtect on. Nothing in it was run by the stream that wrote it: every screen
it names is in the sources (`extension/src/core/model.ts`; 19.0.0's sign-in words are the 19.0.0
build specification's, written while `model.ts` was being built), and how each looks on the real
grid is not yet measured, so write each one down word for word. Two parts are done on the mock
portal, not the grid, so that nothing real is typed where it should not be: the wrong password
(step 12) and the storage checks (step 17).

## Before you start (once)

- Your AccessID is approved for Beethoven (`admin.mjs list` in the access service's own repository,
  `OpenSpineConsortium/beethoven-access`, shows it).
- Your approval covers every installation of your own (20.0.0). The unpacked build is an
  installation like any other: the service records it against your AccessID at its first check,
  approves it, and e-mails the maintainer once that a new installation asked (a notice; its one link
  withdraws, so do not press it). After the test, `admin.mjs reset-seat <your AccessID>` in the
  access service's own repository forgets the installations, if you want the list clean before you
  install from the Chrome Web Store.
- The lab's shared copy of the cluster-side tool is published (`docs/guides/LAB_LEAD.md`), and
  your account can read it.
- You know your grid password. Wayne State disables an AccessID after the fifth wrong password, and
  whether a wrong answer sent by Beethoven counts toward the five is not yet measured: type it
  carefully, and never try a wrong one on the grid. If the portal's shell asks for a code in the one-time key step
  (step 6), have Google Authenticator at hand, and do **not** run 2FA Setup: it replaces your code.
- Your Claude sign-in on the grid is current, or you are ready to sign in once.
- Know the state of the worker chain; to test a cold start, stop it first.
- Remove any older unpacked build. If you rebuild into a folder Chrome already has loaded unpacked,
  press *Reload* on the Beethoven card in `chrome://extensions` afterwards. An unpacked build has an
  ID of its own; nothing in 19.0.0 depends on the ID, and the zip you upload carries no `"key"`.
  An unpacked build's passkey belongs to that ID: a passkey made by it does not open a sign-in the
  store build saved, and the other way round.
- The mock portal for steps 12 and 17: in `extension/`, `npm run build:dev` and `node
  mock-ood/server.mjs --port 8080 --user st1234 --auth basic --lockout 5` (its password is
  `mockpass`, made up; `extension/README.md`). Use a second Chrome profile for it.
- GlobalProtect **on** for the pass, except where step 9 turns it off on purpose.

## What a full pass looks like

1. **Install** the unpacked build: `chrome://extensions`, *Developer mode*, *Load unpacked*, choose
   `extension/.output/chrome-mv3`. The welcome page opens by itself. Chrome's install dialog names
   nothing about requests or sign-ins: `webRequest` and `webRequestAuthProvider` carry no line there.
2. **Welcome page.** "Claude, on your grid." with **You'll need** and three needs: **A Wayne State
   grid account** ("Your AccessID and password.", **How to get one**), **GlobalProtect** ("Connected
   to protect.wayne.edu.", **How to set it up**) and **Claude Pro or Max** ("The account you use at
   claude.ai.", **See plans**). Each link opens the university's or Anthropic's own page in a new tab
   only when pressed; no QR code is drawn and no code-setup step is offered. **Show terms** opens
   version 15 and the privacy statement version 16. Tick the box and press **Agree and continue**.
   Chrome asks to let Beethoven reach `ondemand.grid.wayne.edu`, that one site only: choose
   **Allow** (as in 11.0.0).
3. **Pin the icon**: puzzle-piece icon, pin *Beethoven*.
4. **GlobalProtect.** With GlobalProtect off, the panel says **Turn on GlobalProtect.**, "Open
   GlobalProtect and connect to protect.wayne.edu. Then approve the sign-in on your phone.", the
   address with **Copy**, **How to set it up** (the university's own page, in a new tab) and
   **Looking for the grid…**; after 45 s, **Still looking. Check that GlobalProtect says
   Connected.** Turn GlobalProtect on: within a few seconds **Connected.**, and the grid's sign-in
   follows by itself. Nothing is pressed.
5. **Sign in to the grid.** The panel shows the sheet **Sign in to the grid**: "Type your AccessID
   and password. Beethoven signs in to the grid for you, in the background.", the fields
   **AccessID** and **Password**, the tick **Remember it on this computer, unlocked with Windows
   Hello** (Touch ID on a Mac, your screen lock elsewhere) **unticked**, with "Off unless you tick
   it. Your university may ask you to type your password each time; if it does, leave this off.",
   "Beethoven sends it only to the grid.", **Sign in** and **Use Chrome's sign-in box instead** (no
   **Not now** in the first run; it is on the sheet the Grid row's **Sign in** opens, where it goes
   back home, and on one a waiting press opened, where it withdraws the press). Leave the tick off, type both, press **Sign in** (**Signing in…**). No tab opens; the
   panel says **Signed in as <AccessID>.** Write down how long it took. If the panel shows Chrome's
   box path instead, or a tab opens, `webRequest.onAuthRequired` did not answer the live portal from
   the service worker: that is open question (1) of `docs/OPEN_QUESTIONS.md`, and the press stops
   here.
6. **The one-time key step**, only if the portal's shell asks for a password (AM2; not yet tried on
   the grid by a student without a key). The panel says **One more thing, once.**: "Type your grid
   password in the grid's own terminal. Beethoven never sees it.", **Open the grid terminal**; type
   it there ("If it asks for a code, type the one in Google Authenticator. Don't run 2FA Setup if you
   have one: it replaces it."), press **I'm in**; Beethoven types one setup line, **Checking…**, then
   **Done. You won't need this again.** Write down whether the step appeared at all. Beethoven never
   types your password into that terminal, whether or not it holds one.
7. **The first worker.** **Where your work goes**: tick, **Connect**. If Claude is not signed in on
   the grid it says **Getting your Claude sign-in ready…**, then the Claude tab and **Paste code**
   follow (the sitting, `core/login.ts`; the code is typed once into your own job's terminal). Then
   **In line for a computer**, **You're online.**, **Open my session**: send a message in claude.ai
   and get a reply.
8. **Save your sign-in** (optional, on your own computer; Wayne State's own standard says to type a
   password each time, so a student there may well leave this off). Quit Chrome, reopen it, open the
   panel: the **Grid** row says **Signed out**; press its **Sign in**. Tick **Remember it on this computer**, type both, **Sign in**. Windows
   Hello (or Touch ID, or the screen lock) asks to make a passkey; write down the name it shows (it
   should be **<AccessID> (grid)**) and whether the side panel stayed open while it asked (Chromium
   issue 378966968 reports the panel closing; open question (2)). Signed in, **Show log** says "Saved
   your grid sign-in on this computer." **Settings**, **Your grid**, **Grid sign-in** says "Saved on
   this computer for <AccessID>. It opens with Windows Hello." If the panel said "This computer
   can't lock a saved password with Windows Hello, so Beethoven uses it this once and forgets it.",
   write that down: the authenticator gave no PRF result (open question (3)).
9. **Daily use, GlobalProtect on.** Quit Chrome and reopen it, and open the panel. With the sign-in
   saved, the home's **Grid** row says **Signed out** with the link **Unlock**, the hero reads "As
   of <time>. Unlock with Windows Hello to see it live.", and no password is sent to the grid (the
   check of whether it is signed in goes on). Press **Unlock** and cancel the prompt: the sheet
   **Unlock your grid sign-in** opens with "Not unlocked. Try again, or type it instead."; press
   **Unlock with Windows Hello**, approve: **Signed in as** your AccessID, with no tab. Quit and
   reopen Chrome once more and press **Connect** first: Windows Hello asks in the same click, and
   the panel shows **Unlock your grid sign-in**, "Beethoven saved it on this computer. Unlock it
   with Windows Hello to sign in.", **Unlock with Windows Hello** and **Type it instead** until you
   approve; the press then goes on by itself. **Open my session** never asks for the unlock.
   **Stop**, then **Connect**: both work.
10. **Forget.** **Settings**, **Your grid**, **Grid sign-in**, **Forget**: "Forget the saved
    sign-in?"; confirm: "Forgotten. Chrome stays signed in to the grid until you close it. Your
    passkey list may still show "<AccessID> (grid)"; you can delete it there." **Show log** says
    "Forgot your saved grid sign-in." The row now says "Not saved. Beethoven asks for it when the
    grid needs it." Open the passkey list (Windows: Settings, Accounts, Passkeys; macOS: the
    Passwords app; Chrome: `chrome://password-manager/passwords`) and write down what it shows for
    the passkey (open question (5)); delete **<AccessID> (grid)** there now, after Forget, never
    before. A passkey named with your AccessID alone, or "beethoven", is the old one of 12.0.0 to 15.0.0 and can go.
    **Disconnect**'s confirmation also says "Chrome stays signed in to the grid until you close it."
11. **Chrome's box instead.** Quit Chrome, reopen it, press the **Grid** row's **Sign in**, and on
    the sheet press **Use Chrome's sign-in box instead**: 18.0.0's way. The portal's tab comes to the front with its window and shows the
    grid's page (press **LOGIN** if the panel asks for it); type both into Chrome's own box. The panel
    says **Signed in as <AccessID>.** If Chrome offers to save the password, the tab stays until you
    choose or move to another tab (at most 15 s), then closes. A cancelled box reads **Not signed in
    yet.** with **Sign in again**.
12. **A wrong password, on the mock only** (second profile, the mock from "Before you start"). On
    the sheet type `st1234` and a wrong password, **Sign in**: "That password didn't work, and
    Beethoven stopped. Check it before you try again: after a few wrong tries your university may
    lock your AccessID. A password changed in the last half hour may not work yet." **Show log**:
    "The grid turned the password down. Beethoven stopped and won't try it again." `curl -s
    http://127.0.0.1:8080/_mock/state` should show `basicBad` 1 (write the number down if it is
    higher: Chrome's own re-sends, below), and it must not grow over the next five minutes, a
    **Stop** and **Connect**, and a browser restart: Beethoven itself sends a password the grid
    turns down at most once. A second wrong one in a row reads "Two tries haven't worked. Wait a
    while, or ask your university's help desk, before you try again." Then type `mockpass`: signed
    in. With a saved `mockpass`, `curl -s -X POST --data newpass
    http://127.0.0.1:8080/_mock/password` changes it under Beethoven (`newpass` is made up too): the
    saved one is refused once, Settings says "Saved, but it didn't work last time. Forget it, or
    type the new one when Beethoven asks.", and Beethoven unlocks nothing and sends no password
    again until one is typed. Write down `basicBad` after the change: Chrome re-sends its cached
    copy once for each request already started with it before the first refusal comes back;
    Beethoven then sends at most one; when the answered request is abandoned before the grid
    replies, Chrome may re-send that copy once. How many of these the grid counts is not yet
    measured (open question (6)).
13. **A press that waits.** Turn GlobalProtect off and press **Connect** (after **Stop**, or on a
    worker that has ended). The panel shows **Turn on GlobalProtect.** again, with **Beethoven
    carries on by itself as soon as the grid answers.** under the status, and keeps looking (every 3 s
    while the panel is open; close it, and the check runs once a minute). Turn GlobalProtect on: the
    press goes ahead by itself, with nothing pressed again, to **In line for a computer** (through the
    sheet or **Unlock** if Chrome was restarted in between). Record the time from **Connected.** to
    it. 15.0.0 dropped such a press with "Can't reach the grid"; 16.0.0 and later must not.
14. **Keep my worker running.** **Settings**, **Your worker**, **Keep my worker running** on. End
    the job from the grid, not from the panel (`scancel` in the OnDemand shell): within a minute or
    two the panel starts it again by itself, and does so at most three times in a row without a
    press of yours. Write down what the home says in between.
15. **A key from an earlier version.** Only on a profile that ran 12.0.0 to 15.0.0 with a key:
    **Settings** shows once **A key from an earlier version**, "An earlier version of Beethoven
    added a key for this computer to your grid account (<date>). Beethoven no longer uses it. Your
    lab lead can remove it for you.", with **Forget**. Press **Forget**: the note goes and nothing
    else changes; in the OnDemand shell, `grep -c beethoven-browser ~/.ssh/authorized_keys` answers
    the same before and after (that line is the lab lead's to remove, `LAB_LEAD.md`, section 5). A
    fresh profile shows no such note, and Settings has no **Connection** section at all.
16. **Details, Run the checks.** All OK (the checks are 11.0.0's, with 14.0.0's debug log section;
    no bridge, host key or browser-key section). No check shows a password or a code.
17. **Audit log, Show log and storage, on the mock** (so the password searched for is `mockpass`,
    never a real one, and never typed into a shell on the grid). After steps 5, 8, 10 and 12 there:
    export the audit log, **Copy details** and copy the debug log into files, and `grep -c mockpass`
    each, and `grep -c bW9ja3Bhc3M` (its base64): every count 0. In `chrome://extensions`, Beethoven,
    *service worker*, *Console*: `await chrome.storage.local.get(null)` holds no `mockpass` and no
    password field (`bridge.signin` has the origin, the AccessID, dates and counts only); in
    *Application*, *IndexedDB*, `beethoven-signin`, `records` holds one `grid` record whose `ct` is
    ciphertext, and nothing after **Forget**. **Show log** says "Signed in to the grid as st1234"
    and never shows the password. On the grid, read the exported audit log by eye: no password, no
    code.
18. **A second installation.** New in 20.0.0: a second Chrome profile with the unpacked build is
    approved at its first check and reaches the strip's next step (10.0.0 to 19.0.0 stopped it at
    "<AccessID> is set up on another computer. Your lab lead can move it here."); the maintainer's
    mailbox gets one notice ("Beethoven: <name> (<AccessID>) is using a new installation", the bare
    AccessID only when no name is on record) with a *Withdraw approval* link and no Move link, and
    no second notice for a third profile the same day.
19. **Anthropic addresses are refused before any prompt** (10.0.0's step 15, on the welcome page's
    **Use another portal** field): `claude.ai`, `anthropic.com`, `www.claude.com` each answer
    "That's a Claude address, not your grid." and Chrome shows no prompt; `chrome://extensions`,
    Beethoven, *Details*, *Site access* lists no Anthropic site.
20. **Your project on claude.ai.** New in 21.0.0; on the grid, with a project of yours open in
    another tab (claude.ai, **Projects**). With the worker online and no project named, once the pin
    tip and the tour card are gone, the home shows one card: "Working in a project on claude.ai? Add
    its address in Settings, and Beethoven opens your project in place of a plain session." Its
    **Settings** opens Settings; its x hides it for good. In **Settings**, **Your project on
    claude.ai** says "None named. Open my session opens a plain session on your worker." with
    **Add**. Press **Add**, paste the worker's link (the home's **Copy link**) and press **Use**:
    "That isn't a project's address. ..." under the field, the address still typed. Paste the
    project's address from the address bar instead, with a thread open in it, and press **Use**: the
    field closes, the row shows `https://claude.ai/code/project/<id>` alone, with **Change** and
    **Clear**, and the caret is on **Change**; **Change**, then Escape, closes the field with nothing
    saved. The home's button now reads **Open my project**, with "In your project, choose Work
    locally from the + menu, write the task, and press Allow once on the card." under it, and **New
    session**, **Copy link** and **Phone** keep the worker's link. **Open my project** opens the
    project in a new tab; pressed again, it brings that tab forward. In the project, choose **Work
    locally** from the + menu, ask for something that shows where it runs ("print the hostname and
    the current folder"), and press **Allow once** on the card "Allow Claude to work in a folder on
    your device": the answer names a compute node and the worker's folder. Write down, word for word,
    the card, the folder it offers, and whether **Open my project** opens a second tab once a thread
    is open in the project (not yet measured). Then **Stop** and **Connect** with **Open Claude when
    my worker is ready** on: when the worker is ready, the project's tab Beethoven opened is brought
    forward, or the project opens in a new tab, and the worker's own link opens nothing; with the
    switch off, nothing opens. When the job ends and the next one takes over, write down whether the
    project's thread carries on or the project says "Lost contact with your folder" (not yet
    measured). Last, **Settings**, **Clear**: "None named." again, the caret on **Add**, and the
    home's button is **Open my session** again.

Chrome-specific things to look at: the install prompt and the permission prompt name only what the
manifest asks for; `chrome://extensions` shows no host permission under *Site access* until you
allowed the portal, and then only that site.

## Just before uploading

- `unzip -p release/21.0.0/beethoven-21.0.0-chrome.zip manifest.json` (the file you upload, recorded
  under `release/21.0.0/` as 20.0.0's was, `SUBMISSION.md`, section 0, item 1; its SHA-256 matches
  that folder's `SHA256SUMS.txt`) shows version 21.0.0, the name Beethoven, the
  128-character `description` in `LISTING.md`, the permissions `storage`, `alarms`, `scripting`,
  `sidePanel`, `webRequest` and `webRequestAuthProvider`, optional host `https://*/*`, nothing else
  (no `nativeMessaging`, no `webRequestBlocking`), and no `"key"`.
  `unzip -l` lists `fonts/` and no `bridge/`: no `.msi`, no `.pkg`, no script zip.
- The five public pages open; `privacy.html` says version 16 and `terms.html` version 15 (the upload
  waits for version 16 there); the install card links the listing; the reviewers page carries `LISTING.md`'s negative statements; none
  offers a download or names another browser; `services.json` carries `access_check` and no
  `allowlist`; `killlist.json` answers 200 and verifies.
- The access service answers `st1234` yes from two installation identifiers at portal `localhost`
  (`SUBMISSION.md`, section 0, item 5).
- The screenshots are captures of the version you upload or of one whose screens they still show
  truthfully (`PASTE.md`, field 7; 20.0.0's are in `release/20.0.0/store-kit/`, taken before
  21.0.0's project card and button existed), and none shows a real AccessID or password.
- The description in `PASTE.md` is 1,599 characters; paste it whole.
- Before pasting the Test instructions in `PASTE.md`, see each of their steps on this build in a
  fresh profile with no portal granted and GlobalProtect off: the welcome page, **Agree and
  continue** and what Chrome asks; the panel's **Turn on GlobalProtect.** with **Looking for the
  grid…**, **How to set it up** and, after 45 s, **Still looking. Check that GlobalProtect says
  Connected.** If a word differs, correct the text and its character count in `PASTE.md`. Walk the
  fuller text's mock flow in `--auth basic` too (`LISTING.md`, the reviewer recipe), on the zip a
  reviewer would get.
- Then follow `SUBMISSION.md`.
