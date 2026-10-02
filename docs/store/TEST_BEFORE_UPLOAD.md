# Testing Beethoven 12.0.0 by hand before the store upload

One person, one afternoon, one browser: Chrome, the only one Beethoven is offered in (a private
listing on the Chrome Web Store; `SUBMISSION.md`). Written 2026-09-29 for 4.0.0, brought up to date
through 10.0.0, and rewritten on 2026-10-02 for 12.0.0, which carries 11.0.0's first run (the welcome
page, the window-wide panel) and adds the direct way: ssh to the grid through the helper inside the
package, a sign-in sheet for the AccessID, password and Google Authenticator code, the browser's own
key with its one restricted line on the grid, the optional Windows Hello / Touch ID protection, and
Forget this computer. The agreement is version 9 and the privacy statement version 10. The build is
in `extension/.output/chrome-mv3/`; the zip beside it is what the store gets. To rebuild: Node 22,
`npm ci`, `npm run build`, `npm run zip` in `extension/`.

This is the pass only you can make: it signs in to the real grid with your own account. Nothing in
it was run by the streams that wrote it. Do `docs/V12_STATUS.md`'s tests G1 to G3 first: they are
this pass's riskiest parts, cut small.

## Before you start (once)

- Your AccessID is approved for Beethoven (`node tools/intake/admin.mjs list` in the repository of
  Beethoven for VS Code, Desktop folder `ashley`, shows it).
- One approved account, one installation. The unpacked build is an installation: clear your seat
  first (`node tools/intake/admin.mjs reset-seat <your AccessID>`), and again after the test, before
  you install from the private listing.
- Every folder above the lab's shared copy is owner-only or sticky, framework 11 is deployed to the
  copy, and `hpcworker browser-key check` there answers `HPCW-KEY check ok` (`docs/guides/LAB_LEAD.md`,
  section 2). C&IT has answered the note in `LAB_LEAD.md`, section 3.
- You know your grid password and have Google Authenticator with a working grid code on your phone.
  Do **not** run 2FA Setup for this test: it replaces your code.
- Write down what `~/.ssh/authorized_keys` holds now (through the OnDemand shell, with GlobalProtect:
  `grep -c . ~/.ssh/authorized_keys` and `grep beethoven ~/.ssh/authorized_keys`), so you can see what
  the test adds and removes.
- Your Claude sign-in on the grid is current, or you are ready to sign in once.
- Know the state of the worker chain; to test a cold start, stop it first.
- Remove any older unpacked build. If you rebuild into a folder Chrome already has loaded unpacked,
  press *Reload* on the Beethoven card in `chrome://extensions` afterwards.
- **The helper and the unpacked ID.** The helper's registration names the extension's ID. The page
  that offers the download writes the running extension's own ID into the zip it saves
  (`core/bridgeZip.ts`), so the unpacked copy gets a helper made out to the unpacked copy, and the store
  item to the store item; nothing is rebuilt. A zip saved by one installs a helper the other cannot
  use: after this test, uninstall the helper before you install from the listing. An installer given
  the packaged zip itself stops with "This copy of the bridge was built without Beethoven's extension
  identifier".
- GlobalProtect **off** for the direct-way steps (that is the point of them).

## What a full pass looks like

1. **Install** the unpacked build: `chrome://extensions`, *Developer mode*, *Load unpacked*, choose
   `extension/.output/chrome-mv3`. The welcome page opens by itself.
2. **Welcome page.** "Claude, on your grid." with **You'll need**: a Wayne State grid account, the
   grid's sign-in code, GlobalProtect (once), Claude Pro or Max, each with its link and, where given,
   its QR code with the address printed under it. **Show terms** opens version 9 and the privacy
   statement version 10. Tick the box and press **Agree and continue**. Chrome asks to let Beethoven
   reach `ondemand.grid.wayne.edu`, that one site only: choose **Allow** (as in 11.0.0; the welcome
   page's request was unchanged in the working tree of 2026-10-02).
3. **Pin the icon**: puzzle-piece icon, pin *Beethoven*.
4. **The helper, Windows.** The panel shows **One small download, once** with **Download for
   Windows** and `beethoven-bridge-windows.zip` with its size under it. Download it. Note what
   Chrome's download list says about it (a warning, or none). In Downloads, right-click the zip,
   **Extract All**, then double-click `install.cmd` in the folder, and note what Windows says
   (**Windows protected your PC** with **More info** and **Run anyway**; **Open File - Security
   Warning**; or nothing). Write the exact words down: `docs/guides/INSTALL.md` quotes them. The
   window asks **Press Enter to install, or close this window to cancel**, then says **The Beethoven
   bridge 1.0.0 is installed for Chrome and Edge. Go back to Beethoven and press Check again.** Then:
   - `reg query "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.openspineconsortium.beethoven.bridge"`
     shows one key whose default value is the path of a manifest file in your own user folder; that
     file's `allowed_origins` names this extension's ID only, and its `path` is the helper's launcher
     beside it. Nothing was written under `HKLM` and nothing under `Program Files`.
   - The panel says **Waiting for the helper. Beethoven checks by itself every few seconds.**, then
     **Helper found.** within a few seconds (or after **Check again**). Note what Windows' file
     properties say about the saved zip's origin (right-click, **Properties**: the **Unblock** box
     means it carries the Mark of the Web; a zip Beethoven made in memory may name a `blob:` address
     there, which was not seen before).
   - **Settings**, **Connection**, **Helper**: **Installed · version 1.0.0**.
5. **The helper, Mac** (if you have one at hand; nobody has tried this on a Mac yet). The same,
   with **Download for macOS**: double-click `beethoven-bridge-mac.zip`, then open `install.command`
   in the folder that appears. Write down exactly what macOS says, and which path you took: on
   macOS 15 or later, **System Settings**, **Privacy & Security**, **Open Anyway**; on macOS 14,
   Control-click, **Open**; or `bash` and the file in Terminal. Then
   `ls ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/` shows
   `com.openspineconsortium.beethoven.bridge.json`, and the helper is in
   `~/Library/Application Support/Beethoven/bridge`.
6. **The direct sign-in, on the real grid, GlobalProtect off.** **Sign in to the grid**: type your
   AccessID, **Continue**. **Connecting to the grid…**. Then the grid's own password prompt, then
   **Your google authenticator one-time verification code:** with "The 6-digit code for the grid in
   Google Authenticator (not Microsoft Authenticator)." beside it. Anything the grid prints first is
   marked **The grid says**. Type both. **Signing in…**, **Setting up this computer…**, **Checking
   the new key…**, **This computer is set up.** Record the time from **Continue** to **This computer
   is set up.**
   - In the OnDemand shell afterwards (GlobalProtect on for that): `grep beethoven-browser
     ~/.ssh/authorized_keys` shows exactly one line, beginning
     `restrict,command="/rs/rs_grp_oschome/shared/beethoven/hpcworker/current/bin/hpcworker gate"`
     and ending `beethoven-browser <today's date>`; every line you wrote down before is still there;
     `~/.ssh/authorized_keys.beethoven-prev` holds the file as it was, without any `beethoven-browser`
     line.
   - **Details for your lab lead** shows the key's type and fingerprint, "protected: no", and the
     host key `SHA256:kLTz1xK6anQ1denM+31kDEryQtgan2P76r9aLno+K3s`.
7. **Protect the key? Not now.** On **Protect the key on this computer?** press **Not now**. The
   panel goes on; the **Grid** line says **Direct**.
8. **The first worker.** **Where your work goes**: tick, **Connect**. If Claude is not signed in on
   the grid: within ten minutes of step 6, Beethoven uses step 6's sign-in, still held, and asks for
   nothing; later, the sheet asks for your password and code once more. Either way it says **Getting
   your Claude sign-in ready…**, then the Claude tab and **Paste code** follow (the core's order:
   `core/signin.ts`, the held session; seen only against the local grid stand-in). Then **In line for
   a computer**, **You're online.**, **Open my session**: send a message in claude.ai and get a
   reply.
9. **Daily use, no VPN, nothing typed.** Close the browser. Reopen it, open the panel: the **Grid**
   line says **Signed in as** your AccessID and **Direct** with no prompt. **Stop**, then
   **Connect**: both work with GlobalProtect off.
10. **Windows Hello on, then off.** **Settings**, **Connection**, turn on **Protect my key with
    Windows Hello / Touch ID**. Chrome asks where to save a passkey: choose Windows Hello, then your
    PIN or fingerprint. **Protected.** Restart the browser: the **Grid** line says **Locked** with
    **Unlock**; **Unlock** asks Windows Hello once, and not again until the next browser start. Turn
    it off again in Settings. Write down what Windows asked at each step.
11. **Still one line.** In the OnDemand shell, `grep -c beethoven-browser ~/.ssh/authorized_keys`
    still answers 1, with the same key as in step 6: turning the protection on and off re-wraps the
    same key in the browser and does not touch the grid (`core/keyring.ts`). Settings says, under the
    switch, that an older unprotected copy can stay in the browser's files for a while when it is
    turned on after setup. (What a copied key can and cannot do through the gate was tested against a
    local sshd by the framework stream; it is not tested on the grid here.)
12. **Forget this computer.** **Settings**, **Connection**, **Forget this computer**, **Forget**:
    **This computer is forgotten.** In the OnDemand shell, `grep -c beethoven-browser
    ~/.ssh/authorized_keys` is 0, `grep -c beethoven-browser ~/.ssh/authorized_keys.beethoven-prev`
    is 0 too, and your own lines are still there. (With the key protected and locked, Forget asks
    you to unlock it first, so the grid forgets it too.) The next panel opening asks
    for the sheet again. Delete the passkey of step 10 in Windows' **Settings**, **Accounts**,
    **Passkeys** if it is still listed.
13. **The GlobalProtect way.** **Settings**, **Connection**, **GlobalProtect only**. The panel says
    **Using GlobalProtect**: "Turn GlobalProtect on, then press Continue: the grid's own sign-in box
    opens."; turn it on and press **Continue**: the 11.0.0 moments follow (Chrome's own sign-in box,
    the data statement, online). Then **Direct when possible** again: the direct way comes back.
14. **No helper.** Remove the helper with its uninstaller (`INSTALL.md`, "Remove the helper"). The
    `reg query` of step 4 finds nothing. The panel offers **One small download, once** again;
    **Use GlobalProtect instead** works.
15. **Details, Run the checks.** All OK (the checks are 11.0.0's; the direct way has a section of its
    own in Details: the bridge, the helper's version, the host key, the key's type, fingerprint and
    whether it is protected). No check shows a password, a code or a private key.
16. **Audit log and Show log.** Export the audit log and read it: no password, no code, no key
    material. **Show log** says "Signed in to the grid directly as <AccessID>" and "This computer is
    set up for the grid".
17. **A second installation.** As in 10.0.0: a second Chrome profile with the unpacked build stops
    at "<AccessID> is set up on another computer. Your lab lead can move it here." Signing in
    directly there (after you moved the approval) replaces the first profile's key line: the first
    profile then asks for the sheet again.
18. **Anthropic addresses are refused before any prompt** (10.0.0's step 15, on the welcome page's
    **Use another portal** field): `claude.ai`, `anthropic.com`, `www.claude.com` each answer
    "That's a Claude address, not your grid." and Chrome shows no prompt; `chrome://extensions`,
    Beethoven, *Details*, *Site access* lists no Anthropic site.

Chrome-specific things to look at: the install prompt and the permission prompt name only what the
manifest asks for; `chrome://extensions` shows no host permission under *Site access* until you
allowed the portal, and then only that site.

## Just before uploading

- `unzip -p release/12.0.0/beethoven-12.0.0-chrome.zip manifest.json` (the file you upload; its
  SHA-256 matches `release/12.0.0/SHA256SUMS.txt`) shows version 12.0.0, the name Beethoven, the
  128-character `description` in `LISTING.md`, the permissions `storage`, `alarms`, `scripting`,
  `sidePanel` and `nativeMessaging`, optional host `https://*/*`, nothing else. `unzip -l` lists
  `fonts/` and `bridge/`; the SHA-256 of each file under `bridge/` matches `bridge/manifest.json`.
- The five public pages open; `privacy.html` says version 10 and `terms.html` version 9; none offers
  a download or names another browser; `services.json` carries `access_check` and no `allowlist`;
  `killlist.json` answers 200 and verifies.
- The access service answers `st1234` yes from two installation identifiers at portal `localhost`
  (`SUBMISSION.md`, section 0, item 5).
- The screenshots are new captures of 12.0.0 (`PASTE.md`, field 7), and none shows a real AccessID,
  password, code or key fingerprint.
- The description in `PASTE.md` is 1,650 characters; paste it whole.
- Before pasting the Test instructions in `PASTE.md`, see each of their steps on this build in a
  fresh profile with no portal granted and GlobalProtect off: the welcome page, **Agree and
  continue** and what Chrome asks; the panel's **One small download, once** with the file under the
  button; **Use GlobalProtect instead** leading to **Using GlobalProtect** and **Turn on
  GlobalProtect.** If a word differs, correct the text and its character count in `PASTE.md`.
- Then follow `SUBMISSION.md`.
