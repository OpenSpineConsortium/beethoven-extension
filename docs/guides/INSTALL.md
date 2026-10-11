# Install Beethoven

For Beethoven 20.0.0. Written 2026-10-02, updated 2026-10-11.

**Updating from 16.0.0, 17.0.0 or 18.0.0.** Chrome updates Beethoven by itself from its page in the
Chrome Web Store, and asks you nothing: 19.0.0 needs nothing Chrome shows in its list. Beethoven
asks you to accept its terms once more, because they now describe its sign-in. What changes: when
the grid needs your sign-in, Beethoven's panel asks for your AccessID and password in its own sheet,
**Sign in to the grid**, and signs in for you in the background; **Use Chrome's sign-in box
instead** keeps the way you know. Saving the password on this computer is off unless you tick it,
and at Wayne State you should leave it off ([Use Beethoven](USE.md), part 2, "Save your grid
sign-in, or not"). GlobalProtect is still needed. Your worker and your files on the grid stay as
they are.

**Updating from 15.0.0, or from 12.0.0 to 14.0.0.** If Beethoven came from its page in the Chrome
Web Store, Chrome updates it by itself. If you have a copy loaded any other way, remove it first:
click the puzzle icon, then **⋮** next to Beethoven, then **Remove from Chrome**; then install
Beethoven as below. Keep only one copy. Beethoven asks you to accept its terms once more: they no
longer describe the helper. What changes: 16.0.0 has one way to the grid, GlobalProtect and the
grid's website, as 11.0.0 had. The helper that 12.0.0 to 15.0.0 installed on your computer is not
used any more and is never started; you can remove it ([If an earlier version installed the
helper](#if-an-earlier-version-installed-the-helper)). The key an earlier version added to your grid
account is not used either: **Settings** shows **A key from an earlier version** once, with
**Forget**, which only hides that note; your lab lead can have the key removed ([Use
Beethoven](USE.md), part 4). Your worker and your files on the grid stay as they are: the update
touches nothing on the grid.

**What 13.0.0 and 14.0.0 changed**, for anyone coming from 12.0.0: if your worker's next job was
cancelled, Beethoven shows **Stopped** with **Connect** (13.0.0, once framework 13 is published on
the grid; your lab lead does that); a worker that picked up an earlier conversation shows **Online**
with **Open my session**, where 13.0.0 waited on **Starting · Connecting to Claude…** (14.0.0, with
framework 14 on the grid); and **⋯** (More) has **Copy debug log**, for your lab lead when something
is stuck ([Use Beethoven](USE.md), part 5).

Beethoven is one part: a Chrome extension, installed from its private page in the Chrome Web Store.
Nothing else is installed on your computer, nothing is downloaded from a website, and you never need
administrator rights.

## What you need

- Google Chrome on Windows 10 or 11, a Mac, or Linux.
- The invitation to Beethoven's private page. It goes to the Google account you gave when you asked
  for access.
- A Wayne State AccessID with a grid account.
- GlobalProtect, Wayne State's VPN app, connected to `protect.wayne.edu`. Beethoven reaches the grid
  only through it. Wayne State's own guide is KB 20314; the welcome page's **How to set it up**
  opens it.
- Claude Pro or Max.

## Install Beethoven

1. Open the invitation in Chrome. Chrome must be signed in to the Google account the invitation was
   sent to.
2. Open the link to Beethoven's page in the Chrome Web Store.
3. Click **Add to Chrome**.
4. Chrome asks whether to add Beethoven and lists what it can do. Click **Add extension**.
5. Beethoven's welcome page opens. Carry on with [Use Beethoven](USE.md), part 1.
6. Pin Beethoven so it is one click away: click the puzzle icon at the top right of Chrome, then the
   pin next to **Beethoven**.

If the link shows no item, Chrome is signed in to another Google account. Switch to the account the
invitation was sent to and open the link again.

## Check that it works

- With GlobalProtect on, the panel's **Grid** line says **Signed in as** your AccessID once you have
  signed in to the grid, in Beethoven's **Sign in to the grid** or in Chrome's box ([Use
  Beethoven](USE.md), part 1).
- With GlobalProtect off, it says **Can't reach**, and the panel asks you to turn GlobalProtect on.
  Your worker on the grid keeps running either way.

## If an earlier version installed the helper

Beethoven 12.0.0 to 15.0.0 installed a small program, the Beethoven bridge, on your computer. 16.0.0
and later do not use it and cannot start it: they no longer have Chrome's permission to. The sign-in
sheet of 19.0.0 needs no program on your computer. You can leave it or
remove it; removing it changes nothing on the grid.

- **Windows.** Open **Settings**, then **Apps** (on Windows 11, **Installed apps**; on Windows 10,
  **Apps & features**). Find **Beethoven bridge** and choose **Uninstall** (on Windows 11 it is
  under **⋯** beside it), then confirm.
- **Mac.** In the Finder, choose **Go**, then **Go to Folder**, paste
  `~/Library/Application Support/Beethoven/bridge`, and double-click **uninstall.command**. A
  Terminal window says what it will remove; do what it asks. (Not yet tried on a real Mac.)
- **Linux.** In a terminal: `bash ~/.local/share/beethoven/bridge/uninstall.sh`
- **A helper installed with Beethoven 14.0.0 or earlier** (from a zip), on Windows: paste
  `%LOCALAPPDATA%\Beethoven\bridge` into File Explorer's address bar and press Enter. Double-click
  **uninstall.cmd**, then press Enter. It says **The Beethoven bridge is removed from this
  computer.** On a Mac it is the same **uninstall.command** as above, opened the way you opened its
  installer; it says **The Beethoven bridge is removed from this Mac.**

The key those versions added to your grid account is a separate thing, on the grid, and no step on
your computer removes it: ask your lab lead ([Use Beethoven](USE.md), part 4).

## Remove Beethoven completely

1. If you saved your grid sign-in, open **Settings**, **Your grid**, **Grid sign-in** and press
   **Forget** first. (Removing Beethoven deletes the saved password with the rest of its data too,
   but Forget says so and tells you about the passkey.)
2. If an earlier version installed the helper, remove it (above).
3. Remove Beethoven from Chrome: click the puzzle icon, then **⋮** next to Beethoven, then **Remove
   from Chrome**. Chrome stays signed in to the grid until you close it.
4. Delete Beethoven's passkeys, if you have any; Beethoven does not remove them. Tell them apart
   by their user names (what each list shows beside them is not yet measured). The old passkey (12.0.0 to 15.0.0, Windows
   Hello or Touch ID protection of the key) is named with your AccessID alone, or "beethoven" ("Beethoven on this computer"), and can go. The
   one 19.0.0 uses for your grid sign-in is named "<AccessID> (grid)", for example "ab1234 (grid)";
   delete that one only after **Forget** (step 1). Where to delete them: on Windows, **Settings**,
   **Accounts**, **Passkeys**; on a Mac, the **Passwords** app (or **System Settings**,
   **Passwords**); in Google Password Manager, open `chrome://password-manager/passwords` in Chrome.

Your worker and your files on the grid are not touched by any of this. To stop the worker, press
**Stop** in Beethoven before step 3.
