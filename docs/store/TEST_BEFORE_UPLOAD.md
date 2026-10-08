# Testing Beethoven 16.0.0 by hand before the store upload

One person, one afternoon, one browser: Chrome, the only one Beethoven is offered in (a private
listing on the Chrome Web Store; `SUBMISSION.md`). Written 2026-09-29 for 4.0.0, brought up to date
through 10.0.0, rewritten on 2026-10-02 for 12.0.0, which carried 11.0.0's first run (the welcome
page, the window-wide panel) and added the direct way (ssh to the grid through a helper inside the
package, a sign-in sheet, the browser's own key with its one restricted line on the grid, Windows
Hello / Touch ID, Forget this computer), brought up to date on 2026-10-04 for 15.0.0 (the helper's
signed installers), and rewritten on 2026-10-08 for 16.0.0, which removed the direct way whole: one
way to the grid, GlobalProtect and the portal, as in 11.0.0, with a press that waits for
GlobalProtect and a note in Settings about a key an earlier version left. The agreement is version
11 and the privacy statement version 12. The build is in `extension/.output/chrome-mv3/`; the zip
beside it is what the store gets. To build it: Node 22, then `npm ci`, `npm run typecheck`, `npm
test`, `npm run build` and `npm run zip` in `extension/` (`SUBMISSION.md`, section 0, item 1).
Nothing is signed, and nothing is installed outside the browser.

This is the pass only you can make: it signs in to the real grid with your own account, through the
real portal with GlobalProtect on. Nothing in it was run by the stream that wrote it: every screen
it names is in the sources (`extension/src/core/model.ts`), and how each looks on the real grid is
not yet measured, so write each one down word for word.

## Before you start (once)

- Your AccessID is approved for Beethoven (`admin.mjs list` in the access service's own repository,
  `OpenSpineConsortium/beethoven-access`, shows it).
- One approved account, one installation. The unpacked build is an installation: clear your seat
  first (the access service's `admin.mjs reset-seat <your AccessID>`), and again after the test,
  before you install from the private listing.
- The lab's shared copy of the cluster-side tool is published (`docs/guides/LAB_LEAD.md`), and
  your account can read it.
- You know your grid password. If the portal's shell asks for a code in the one-time key step
  (step 6), have Google Authenticator at hand, and do **not** run 2FA Setup: it replaces your code.
- Your Claude sign-in on the grid is current, or you are ready to sign in once.
- Know the state of the worker chain; to test a cold start, stop it first.
- Remove any older unpacked build. If you rebuild into a folder Chrome already has loaded unpacked,
  press *Reload* on the Beethoven card in `chrome://extensions` afterwards. An unpacked build has an
  ID of its own; nothing in 16.0.0 depends on the ID, and the zip you upload carries no `"key"`.
- GlobalProtect **on** for the pass, except where step 9 turns it off on purpose.

## What a full pass looks like

1. **Install** the unpacked build: `chrome://extensions`, *Developer mode*, *Load unpacked*, choose
   `extension/.output/chrome-mv3`. The welcome page opens by itself.
2. **Welcome page.** "Claude, on your grid." with **You'll need** and three needs: **A Wayne State
   grid account** ("Your AccessID and password.", **How to get one**), **GlobalProtect** ("Connected
   to protect.wayne.edu.", **How to set it up**) and **Claude Pro or Max** ("The account you use at
   claude.ai.", **See plans**). Each link opens the university's or Anthropic's own page in a new tab
   only when pressed; no QR code is drawn and no code-setup step is offered. **Show terms** opens
   version 11 and the privacy statement version 12. Tick the box and press **Agree and continue**.
   Chrome asks to let Beethoven reach `ondemand.grid.wayne.edu`, that one site only: choose
   **Allow** (as in 11.0.0).
3. **Pin the icon**: puzzle-piece icon, pin *Beethoven*.
4. **GlobalProtect.** With GlobalProtect off, the panel says **Turn on GlobalProtect.**, "Open
   GlobalProtect and connect to protect.wayne.edu. Then approve the sign-in on your phone.", the
   address with **Copy**, **How to set it up** (the university's own page, in a new tab) and
   **Looking for the grid…**; after 45 s, **Still looking. Check that GlobalProtect says
   Connected.** Turn GlobalProtect on: within a few seconds **Connected.**, and the grid's sign-in
   follows by itself. Nothing is pressed.
5. **Sign in to the grid.** The panel says **Sign in to the grid**: "Use your AccessID and password
   in the box Chrome shows. Beethoven never sees them." The portal's tab shows the grid's page
   (press **LOGIN TO ONDEMAND** if the panel asks for it); type both into Chrome's own box. The panel
   says **Signed in as <AccessID>.** A cancelled box or a wrong password reads **Not signed in yet.**
   with **Sign in again**; both look the same to Beethoven.
6. **The one-time key step**, only if the portal's shell asks for a password (AM2; not yet tried on
   the grid by a student without a key). The panel says **One more thing, once.**: "Type your grid
   password in the grid's own terminal. Beethoven never sees it.", **Open the grid terminal**; type
   it there ("If it asks for a code, type the one in Google Authenticator. Don't run 2FA Setup if you
   have one: it replaces it."), press **I'm in**; Beethoven types one setup line, **Checking…**, then
   **Done. You won't need this again.** Write down whether the step appeared at all.
7. **The first worker.** **Where your work goes**: tick, **Connect**. If Claude is not signed in on
   the grid it says **Getting your Claude sign-in ready…**, then the Claude tab and **Paste code**
   follow (the sitting, `core/login.ts`; the code is typed once into your own job's terminal). Then
   **In line for a computer**, **You're online.**, **Open my session**: send a message in claude.ai
   and get a reply.
8. **Daily use, GlobalProtect on.** Close the browser. Reopen it, open the panel: the **Grid** line
   says **Signed in as** your AccessID with no prompt. **Stop**, then **Connect**: both work.
9. **A press that waits.** Turn GlobalProtect off and press **Connect** (after **Stop**, or on a
   worker that has ended). The panel shows **Turn on GlobalProtect.** again, with **Beethoven
   carries on by itself as soon as the grid answers.** under the status, and keeps looking (every 3 s
   while the panel is open; close it, and the check runs once a minute). Turn GlobalProtect on: the
   press goes ahead by itself, with nothing pressed again, to **In line for a computer**. Record the
   time from **Connected.** to it. 15.0.0 dropped such a press with "Can't reach the grid"; 16.0.0
   must not.
10. **Keep my worker running.** **Settings**, **Your worker**, **Keep my worker running** on. End
    the job from the grid, not from the panel (`scancel` in the OnDemand shell): within a minute or
    two the panel starts it again by itself, and does so at most three times in a row without a
    press of yours. Write down what the home says in between.
11. **A key from an earlier version.** Only on a profile that ran 12.0.0 to 15.0.0 with a key:
    **Settings** shows once **A key from an earlier version**, "An earlier version of Beethoven
    added a key for this computer to your grid account (<date>). Beethoven no longer uses it. Your
    lab lead can remove it for you.", with **Forget**. Press **Forget**: the note goes and nothing
    else changes; in the OnDemand shell, `grep -c beethoven-browser ~/.ssh/authorized_keys` answers
    the same before and after (that line is the lab lead's to remove, `LAB_LEAD.md`, section 5). A
    fresh profile shows no such note, and Settings has no **Connection** section at all.
12. **Details, Run the checks.** All OK (the checks are 11.0.0's, with 14.0.0's debug log section;
    no bridge, host key or browser-key section). No check shows a password or a code.
13. **Audit log and Show log.** Export the audit log and read it: no password, no code. **Show
    log** says "Signed in to the grid as <AccessID>" and, after step 6, "Done. You won't need this
    again."
14. **A second installation.** As in 10.0.0: a second Chrome profile with the unpacked build stops
    at "<AccessID> is set up on another computer. Your lab lead can move it here."
15. **Anthropic addresses are refused before any prompt** (10.0.0's step 15, on the welcome page's
    **Use another portal** field): `claude.ai`, `anthropic.com`, `www.claude.com` each answer
    "That's a Claude address, not your grid." and Chrome shows no prompt; `chrome://extensions`,
    Beethoven, *Details*, *Site access* lists no Anthropic site.

Chrome-specific things to look at: the install prompt and the permission prompt name only what the
manifest asks for; `chrome://extensions` shows no host permission under *Site access* until you
allowed the portal, and then only that site.

## Just before uploading

- `unzip -p release/16.0.0/beethoven-16.0.0-chrome.zip manifest.json` (the file you upload; its
  SHA-256 matches `release/16.0.0/SHA256SUMS.txt`) shows version 16.0.0, the name Beethoven, the
  128-character `description` in `LISTING.md`, the permissions `storage`, `alarms`, `scripting` and
  `sidePanel`, optional host `https://*/*`, nothing else (no `nativeMessaging`), and no `"key"`.
  `unzip -l` lists `fonts/` and no `bridge/`: no `.msi`, no `.pkg`, no script zip.
- The five public pages open; `privacy.html` says version 12 and `terms.html` version 11; none
  offers a download or names another browser; `services.json` carries `access_check` and no
  `allowlist`; `killlist.json` answers 200 and verifies.
- The access service answers `st1234` yes from two installation identifiers at portal `localhost`
  (`SUBMISSION.md`, section 0, item 5).
- The screenshots are new captures of 16.0.0 (`PASTE.md`, field 7; none exists yet), and none shows
  a real AccessID or password.
- The description in `PASTE.md` is 1,466 characters; paste it whole.
- Before pasting the Test instructions in `PASTE.md`, see each of their steps on this build in a
  fresh profile with no portal granted and GlobalProtect off: the welcome page, **Agree and
  continue** and what Chrome asks; the panel's **Turn on GlobalProtect.** with **Looking for the
  grid…**, **How to set it up** and, after 45 s, **Still looking. Check that GlobalProtect says
  Connected.** If a word differs, correct the text and its character count in `PASTE.md`.
- Then follow `SUBMISSION.md`.
