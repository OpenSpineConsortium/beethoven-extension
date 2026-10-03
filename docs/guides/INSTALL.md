# Install Beethoven

For Beethoven 13.0.0. Written 2026-10-02.

**Updating from 12.0.0.** First remove the 12.0.0 copy: click the puzzle icon, then **⋮** next to
Beethoven, then **Remove from Chrome**. Then install 13.0.0 as in Part 1. Keep only one copy, because two
copies side by side sign each other out of the grid. Your helper, your worker and your files on the grid
stay as they are; you sign in to the grid once more. What changes: if your worker's next job was
cancelled, Beethoven shows **Stopped** with **Connect**, once framework 13 is published on the grid (your
lab lead does that). Before, it waited with no button.

Beethoven has two parts:

1. **Beethoven itself**, a Chrome extension. You install it from its private page in the Chrome Web
   Store.
2. **The helper**, a small script that comes inside Beethoven. You install it once on each computer.
   It lets Beethoven reach the grid without GlobalProtect. It is optional: without it, Beethoven
   uses GlobalProtect, as before.

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

- A short script, called the Beethoven bridge in its own files. It comes inside Beethoven, so
  nothing is downloaded from a website.
- It needs no administrator. It installs into your own user folder.
- It only carries Beethoven's encrypted connection to the grid: to `grid.wayne.edu`, port 22, and
  nowhere else.
- It never sees your password or your code. Beethoven encrypts the connection before the helper gets
  it.
- It holds no password and no key, keeps no log of what it carries, and starts no other program.
- Chrome starts it only when Beethoven needs it.
- It is not signed by a company, so your computer warns you the first time. That is expected. You
  can read it: every file in it is plain text.

### When Beethoven offers it

The panel shows **One small download, once**. The button says **Download for Windows**, **Download
for macOS** or **Download for Linux**. The file's name and size are under the button.

If you don't want the helper, click **Use GlobalProtect instead**.

You can also find it later: click **⋯** (More), then **Settings**, then **Connection**. The
**Helper** line says **Installed** or **Not installed**, with the download.

The download is a small zip file, made out to the Beethoven you have: the helper inside it answers
only that Beethoven. Each system has its own steps.

### Windows

1. Click **Download for Windows**. Chrome saves `beethoven-bridge-windows.zip` in your
   **Downloads** folder. If Chrome warns about the file, open Chrome's download list and choose
   **Keep**.
2. Open **Downloads** in File Explorer. Right-click `beethoven-bridge-windows.zip`, choose **Extract
   All**, then **Extract**. A folder opens.
   - Don't open the files from inside the zip. If you do, the window says "Windows opened this file
     without the rest of the bridge." Extract it first.
3. In that folder, double-click **install.cmd**.
4. Windows warns you, because the helper isn't signed by a company. What it shows depends on the
   computer:
   - **Open File - Security Warning**, "Publisher: Unknown Publisher". Click **Run**. (This is what a
     Windows 11 computer showed when the helper was tried.)
   - **Windows protected your PC**. Click **More info**, then **Run anyway**.
   - **Smart App Control** blocked it, with no button to run it. Close the message. Right-click the
     zip, choose **Properties**, tick **Unblock** at the bottom, click **OK**, then extract the zip
     again (step 2) and run the new folder's **install.cmd**. Beethoven's panel says the same.
     (Taken from Microsoft's and others' documentation; not tried on a computer with Smart App
     Control on.)
   - If your organization's security software stops it, this computer can't run the helper. Use
     GlobalProtect instead ([Using Beethoven](USE.md), part 6).
5. A window opens. It says what it will do: copy its files into your own user folder and tell Chrome
   where they are. It waits: **Press Enter to install, or close this window to cancel**. Press
   Enter.
6. The window says: **The Beethoven bridge 1.0.0 is installed for Chrome and Edge. Go back to
   Beethoven and press Check again.** Press Enter to close it.
   - If it says that "a policy on this computer stops PowerShell scripts from running", the helper
     can't start on this computer. Use GlobalProtect instead, and tell your lab lead.
7. Back in Beethoven, the panel has been saying **Waiting for the helper. Beethoven checks by itself
   every few seconds.** It says **Helper found.** and moves on to **Sign in to the grid**. If it says
   **Not found yet. Open the downloaded file, then Check again.**, click **Check again**.

The helper lives in `%LOCALAPPDATA%\Beethoven\bridge`, with one entry each for Chrome and Edge in
your own part of the registry.

### Mac

1. Click **Download for macOS**. Chrome saves `beethoven-bridge-mac.zip` in your **Downloads**
   folder. If Chrome warns about the file, open Chrome's download list and choose **Keep**.
2. Open **Downloads** in the Finder and double-click `beethoven-bridge-mac.zip`. A folder appears
   beside it.
3. Open the installer, `install.command`, in that folder. The first time, your Mac stops it, because
   the helper isn't signed by a company. What to do depends on your macOS:
   - **macOS 15 (Sequoia) or later.** Double-click `install.command`. The Mac says it was not
     opened, because Apple could not verify it. Click **Done**. Open **System Settings**, then
     **Privacy & Security**, and scroll down to **Security**. Click **Open Anyway** beside the line
     about `install.command` (the button stays there for about an hour). Click **Open Anyway** again
     and type your Mac login password. (Control-click, **Open** no longer works on macOS 15.)
   - **macOS 14 (Sonoma) or earlier.** Control-click `install.command` (or right-click it), choose
     **Open**, then click **Open** again.
   - **Any macOS, with Terminal.** Open **Terminal** (in **Applications**, then **Utilities**). Type
     `bash` and a space. Drag `install.command` from the Finder into the Terminal window. Press
     Return. This usually avoids the warning, because Terminal reads the file rather than opening
     it; it has not yet been tried on every macOS.
4. A Terminal window says what it will do: copy one small script into your own Library folder and
   tell Chrome where it is. It waits: **Press Return to install, or close this window to cancel.**
   Press Return.
5. The window says: **The Beethoven bridge 1.0.0 is installed for Chrome. Go back to Beethoven and
   press Check again.** Close the window.
   - If it says "This Mac has no working /usr/bin/perl", your Mac lacks the Perl the helper runs on.
     Apple has said later versions of macOS may leave it out (its macOS 10.15 release notes:
     "Future versions of macOS won't include scripting language runtimes by default"); macOS 26.2 is
     reported to still carry Perl 5.34. Use GlobalProtect instead.
6. Back in Beethoven: **Helper found.** (or click **Check again**).

The helper lives in `~/Library/Application Support/Beethoven/bridge`, with one small file in
Chrome's own folder that tells Chrome where it is.

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

- **"This copy of the bridge was built without Beethoven's extension identifier, so Chrome would not
  let Beethoven use it."** The zip did not come from your Beethoven's own panel (or Beethoven could
  not make it out to itself). Download it again from the panel's **Download** button and use that
  file. If it says this again, tell your lab lead.
- **"The bridge is installed, but it did not answer when started."** Press **Check again** in
  Beethoven. If it still does not connect, use GlobalProtect instead and tell your lab lead.

Nothing about the helper has been tried on a Mac yet: the Mac steps above follow Apple's
documentation, and your lab lead would like to hear what your Mac actually showed.

## Check that it works

- In the panel, the **Grid** line says **Direct** beside your AccessID once you have signed in.
- In **Settings**, **Connection**, the **Helper** line says **Installed · version 1.0.0**.

## Remove the helper

Removing the helper does not take your key off the grid. Do **Forget this computer** first if you
are leaving this computer for good ([Using Beethoven](USE.md), part 5).

- **Windows.** Paste `%LOCALAPPDATA%\Beethoven\bridge` into File Explorer's address bar and press
  Enter. Double-click **uninstall.cmd**, then press Enter. It says **The Beethoven bridge is removed
  from this computer.**
- **Mac.** In the Finder, choose **Go**, then **Go to Folder**, paste
  `~/Library/Application Support/Beethoven/bridge`, and open **uninstall.command** (the same way
  you opened the installer). It says **The Beethoven bridge is removed from this Mac.**
- **Linux.** In a terminal: `bash ~/.local/share/beethoven/bridge/uninstall.sh`

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
