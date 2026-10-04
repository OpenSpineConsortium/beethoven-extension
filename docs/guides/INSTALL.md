# Install Beethoven

For Beethoven 15.0.0. Written 2026-10-02, updated 2026-10-04.

**Updating from 14.0.0.** If Beethoven came from its page in the Chrome Web Store, Chrome updates it
by itself. If you have a copy loaded any other way, remove it first: click the puzzle icon, then
**⋮** next to Beethoven, then **Remove from Chrome**; then install 15.0.0 as in Part 1, and sign in
to the grid once more. Keep only one copy: two copies side by side sign each other out of the grid.
Beethoven asks you to accept its terms once more: they now describe the signed helper. If Beethoven
finds your helper, it stays as it is and keeps working (it is the same helper, version 1.0.0). If
Beethoven offers the helper again after the update, remove the old one first ([Remove the
helper](#remove-the-helper), the way for 14.0.0 and earlier), then install it from the panel. What
changes: on Windows and on a Mac, the helper now comes as a signed installer (part 2).

**Updating from 13.0.0.** First remove every older copy: click the puzzle icon, then **⋮** next to
each Beethoven, then **Remove from Chrome** (or remove each Beethoven card in
`chrome://extensions`). Then install the current Beethoven as in Part 1, and sign in to the grid
once more. Keep only one copy: two copies side by side sign each other out of the grid. Your helper,
your worker and your files on the grid stay as they are. What 14.0.0 changed: a worker that picked
up an earlier conversation now shows **Online** with **Open my session**, where 13.0.0 waited on
**Starting · Connecting to Claude…** (your lab lead also publishes framework 14 on the grid); and
**⋯** (More) has **Copy debug log**, for your lab lead when something is stuck ([Use
Beethoven](USE.md), part 7).

**Updating from 12.0.0.** First remove the 12.0.0 copy: click the puzzle icon, then **⋮** next to
Beethoven, then **Remove from Chrome**. Then install the current Beethoven as in Part 1. Keep only
one copy, because two copies side by side sign each other out of the grid. Your helper, your worker
and your files on the grid stay as they are; you sign in to the grid once more. What 13.0.0 changed:
if your worker's next job was cancelled, Beethoven shows **Stopped** with **Connect**, once
framework 13 is published on the grid (your lab lead does that). Before, it waited with no button.

Beethoven has two parts:

1. **Beethoven itself**, a Chrome extension. You install it from its private page in the Chrome Web
   Store.
2. **The helper**, a small program that comes inside Beethoven. You install it once on each
   computer. It lets Beethoven reach the grid without GlobalProtect. It is optional: without it,
   Beethoven uses GlobalProtect, as before.

You never need administrator rights. Nothing comes from a website: the helper is a file inside
Beethoven.

## What you need

- Google Chrome on Windows 10 or 11, a Mac, or Linux.
- The invitation to Beethoven's private page. It goes to the Google account you gave when you asked
  for access.
- A Wayne State AccessID with a grid account.
- Claude Pro or Max.
- To reach the grid without GlobalProtect: a Google Authenticator code for the grid. If you don't
  have one yet, Beethoven shows you how to set it up ([Using Beethoven](USE.md), part 2).

## Part 1. Install Beethoven

1. Open the invitation in Chrome. Chrome must be signed in to the Google account the invitation was
   sent to.
2. Open the link to Beethoven's page in the Chrome Web Store.
3. Click **Add to Chrome**.
4. Chrome asks whether to add Beethoven and lists what it can do. Click **Add extension**. The list
   says **Communicate with cooperating native applications**: that is the helper of part 2.
   Beethoven can talk to it once you install it, and to no other program on your computer.
5. Beethoven's welcome page opens. Carry on with [Using Beethoven](USE.md), part 1.
6. Pin Beethoven so it is one click away: click the puzzle icon at the top right of Chrome, then the
   pin next to **Beethoven**.

If the link shows no item, Chrome is signed in to another Google account. Switch to the account the
invitation was sent to and open the link again.

## Part 2. Install the helper (once per computer)

### What the helper is

- A small program, called the Beethoven bridge in its own files. It comes inside Beethoven, so
  nothing is downloaded from a website.
- What it is depends on your computer:
  - **Windows and Mac.** A small program in an installer that is signed: "This installer is signed,
    so your computer can check that it came from Beethoven's maker before it runs."
  - **Linux.** A short script that runs on Perl, or on Python 3 where Perl is missing; both come
    with Linux. It is not signed by a company. You can read it: every file in it is plain text.
- It needs no administrator. It installs into your own user account.
- It only carries Beethoven's encrypted connection to the grid: to `grid.wayne.edu`, port 22, and
  nowhere else.
- It never sees your password or your code. Beethoven encrypts the connection before the helper gets
  it.
- It holds no password and no key, keeps no log of what it carries, and starts no other program.
- Chrome starts it only when Beethoven needs it.

### When Beethoven offers it

The panel shows **One small download, once**. The button says **Download for Windows**, **Download
for macOS** or **Download for Linux**. The file's name and size are under the button.

If you don't want the helper, click **Use GlobalProtect instead**.

You can also find it later: click **⋯** (More), then **Settings**, then **Connection**. The
**Helper** line says **Installed** or **Not installed**, with the download.

On Windows and on a Mac the download is the installer itself, made out to Beethoven from the Chrome
Web Store. On Linux it is a small zip file, made out to the Beethoven you have. Either way the
helper answers only that Beethoven. Each system has its own steps.

**Nobody has opened the signed installers on a real computer yet.** The Windows and Mac steps below
are what they are built to do. What your computer shows on the way is not yet measured: please tell
your lab lead exactly what it showed, in its own words (a photo of the screen is fine), whether it
went smoothly or not.

### Windows

1. Click **Download for Windows**. Chrome saves `beethoven-bridge-windows.msi` in your **Downloads**
   folder. If Chrome warns about the file, open Chrome's download list and choose **Keep**.
2. Under the button the panel shows three steps. Do them in order:
   - "Open the file you downloaded. Windows installs the Beethoven bridge into your own account; no
     administrator rights are needed." Click the file in Chrome's download list, or double-click it
     in **Downloads**.
   - "If Windows asks you to confirm, choose Install (or More info, then Run anyway)." If your
     organization's security software stops it, this computer can't run the helper: use
     GlobalProtect instead ([Using Beethoven](USE.md), part 6), and tell your lab lead.
   - "When the window closes, come back here and press Check again." The panel has been saying
     **Waiting for the helper. Beethoven checks by itself every few seconds.** It says **Helper
     found.** and moves on to **Sign in to the grid**. If it says **Not found yet. Open the
     downloaded file, then Check again.**, click **Check again**.

The helper lives in `%LOCALAPPDATA%\Beethoven\bridge`, with one entry each for Chrome and Edge in
your own part of the registry. Windows lists it in **Settings**, under **Apps**, as **Beethoven
bridge**.

### Mac

1. Click **Download for macOS**. Chrome saves `beethoven-bridge-mac.pkg` in your **Downloads**
   folder. If Chrome warns about the file, open Chrome's download list and choose **Keep**.
2. Under the button the panel shows three steps. Do them in order:
   - "Open the file you downloaded. The macOS Installer opens." Click the file in Chrome's download
     list, or double-click it in **Downloads** in the Finder.
   - "Click Continue, then Install. It installs into your own account, so no administrator password
     is asked." If the Installer asks where to install it, choose **Install for me only** (whether
     it asks at all is not yet measured).
   - "When it says the installation was successful, close it and press Check again here." Beethoven
     says **Helper found.** If the Installer says the installation failed, close it, use
     GlobalProtect for now, and tell your lab lead what it said.

The helper lives in `~/Library/Application Support/Beethoven/bridge`, with one small file in
Chrome's own folder (and in Microsoft Edge's and Chromium's, if you have them) that tells the
browser where it is.

### Linux

1. Click **Download for Linux**. Chrome saves `beethoven-bridge-linux.zip` in your **Downloads**
   folder.
2. Open a terminal and type:

   ```
   cd ~/Downloads
   unzip beethoven-bridge-linux.zip -d beethoven-bridge
   bash beethoven-bridge/install.sh
   ```

3. Press Return when it asks. It says **The Beethoven bridge 1.0.0 is installed for Chrome** (with
   perl or python3) **Go back to Beethoven and press Check again.** Beethoven says **Helper found.**
   (or click **Check again**).

The helper runs on Perl, or on Python 3 where Perl is missing. If Chrome was installed as a Snap or
a Flatpak, it can't start the helper: use GlobalProtect instead. The helper lives in
`~/.local/share/beethoven/bridge`.

### A Chromebook, or another computer

Beethoven says **There's no helper for this computer yet.** Use GlobalProtect ([Using
Beethoven](USE.md), part 6).

### If the installer says something else

- **Windows or Mac.** Anything other than the steps above is new to us: use GlobalProtect for now
  and tell your lab lead what the window said, word for word.
- **Linux: "This copy of the bridge was built without Beethoven's extension identifier, so Chrome
  would not let Beethoven use it."** The zip did not come from your Beethoven's own panel (or
  Beethoven could not make it out to itself). Download it again from the panel's **Download** button
  and use that file. If it says this again, tell your lab lead.
- **Linux: "The bridge is installed, but it did not answer when started."** Press **Check again** in
  Beethoven. If it still does not connect, use GlobalProtect instead and tell your lab lead.

## Check that it works

- In the panel, the **Grid** line says **Direct** beside your AccessID once you have signed in.
- In **Settings**, **Connection**, the **Helper** line says **Installed · version 1.0.0**.

## Remove the helper

Removing the helper does not take your key off the grid. Do **Forget this computer** first if you
are leaving this computer for good ([Using Beethoven](USE.md), part 5).

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

After that, Beethoven uses GlobalProtect, or offers the helper again.

## Remove Beethoven completely

1. In Beethoven: **⋯** (More), **Settings**, **Connection**, **Forget this computer**, then
   **Forget**.
2. Remove the helper (above).
3. Remove Beethoven from Chrome: click the puzzle icon, then **⋮** next to Beethoven, then **Remove
   from Chrome**.
4. If you turned on Windows Hello or Touch ID protection, Beethoven made a passkey named
   **Beethoven**. **Forget this computer** asks your passkey store to remove it, but not every store
   does. If it is still listed, delete it: on Windows, **Settings**, **Accounts**, **Passkeys**; on a
   Mac, the **Passwords** app (or **System Settings**, **Passwords**); in Google Password Manager,
   open `chrome://password-manager/passwords` in Chrome.

Your worker and your files on the grid are not touched by any of this. To stop the worker, press
**Stop** in Beethoven before step 3.
