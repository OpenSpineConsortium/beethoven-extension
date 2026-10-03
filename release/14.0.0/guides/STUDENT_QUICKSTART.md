# Beethoven 12.0.0: quick start

The shortest way from nothing to **You're online.** The full steps are in `INSTALL.md` and `USE.md`.

**You need:** a Wayne State AccessID with a grid account; Claude Pro or Max; Google Chrome on
Windows, a Mac or Linux; the invitation to Beethoven's private Chrome Web Store page. No
administrator rights.

## 1. Install Beethoven

1. In Chrome (signed in to the Google account the invitation went to), open Beethoven's store page:
   **Add to Chrome**, then **Add extension**.
2. On the welcome page, tick the box and click **Agree and continue**. If Chrome asks about
   `ondemand.grid.wayne.edu`, choose **Allow**.

## 2. Install the helper (once per computer)

The panel says **One small download, once**. Click **Download for** your system.

- **Windows:** right-click the zip in Downloads, **Extract All**, **Extract**. Double-click
  `install.cmd`. If Windows warns: **Run** (or **More info**, **Run anyway**). Press Enter.
- **Mac:** double-click the zip, then `install.command`. If the Mac says it was not opened: **Done**,
  then **System Settings**, **Privacy & Security**, **Open Anyway**. Press Return.
- **Linux:** `cd ~/Downloads && unzip beethoven-bridge-linux.zip -d beethoven-bridge && bash beethoven-bridge/install.sh`

Beethoven says **Helper found.** (or click **Check again**). Can't install it? Click **Use
GlobalProtect instead** and see the last section.

## 3. Sign in to the grid (once per computer)

1. Type your AccessID (like ab1234) and click **Continue**.
   - *Optional:* tick **Protect my key with Windows Hello / Touch ID**. It is off unless you tick it,
     and you can turn it on or off later in Settings.
2. Type your grid password, then the 6-digit grid code from **Google Authenticator** (not Microsoft
   Authenticator). Click **Continue**.
3. **This computer is set up.** Click **Continue**. To **Protect the key on this computer?**, **Not
   now** is fine.

Your password and code go only to the grid and are never kept. From now on this computer signs in by
itself, with no VPN.

### No grid code yet?

If the grid says **The grid didn't accept the code**: if Google Authenticator has an entry for the
grid, click **Type the code again**. Only if you have none, click **I don't have a grid code yet**.

> **Already have a grid code? Don't run 2FA Setup: it replaces your code, and the old one stops
> working.**

Then choose one:

- **Use this computer:** install Google Authenticator on your phone. Turn on GlobalProtect here
  (`protect.wayne.edu`). Click **Open the grid's website**, sign in, then **Interactive Apps**,
  **2FA Setup**, **Launch**, and **Launch 2FA Setup** once it starts. Scan its square code with
  Google Authenticator (**+**, **Scan a QR code**).
- **Use my phone:** scan Beethoven's square codes with the phone's camera: install GlobalProtect and
  connect (`protect.wayne.edu`, approve in Microsoft Authenticator); install Google Authenticator;
  open the grid's instructions. On the phone, open `ondemand.grid.wayne.edu`, then **Interactive
  Apps**, **2FA Setup**, **Launch**, **Launch 2FA Setup**. In Google Authenticator: **+**, **Enter a
  setup key**, type the key the page shows. No key on the page? Don't launch it again: ask your lab
  lead.

Then click **I've set up my code** and sign in (section 3).

## 4. Start your worker

1. **Where your work goes:** read it, tick the box, click **Connect**.
2. **Sign in to Claude** (first time only): a Claude tab opens. Sign in, approve, copy the code, paste
   it into **Paste code** in the panel, click **Continue**.
3. **In line for a computer.** You can close the panel.
4. **You're online.** Click **Open my session**.

Every day after that: click the Beethoven button. The **Grid** line says **Direct**. Use **Open my
session**, **Connect** or **Stop**.

## With GlobalProtect instead

Click **Use GlobalProtect instead**, turn GlobalProtect on, click **Continue**, and sign in to the grid
in the box Chrome shows. Then section 4. GlobalProtect must be on each time you start or stop your
worker. To go back: **Try the direct way again**, or **Settings**, **Connection**, **Direct when
possible**.

Leaving this computer? **⋯** (More), **Settings**, **Connection**, **Forget this computer**.
