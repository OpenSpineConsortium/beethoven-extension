# Use Beethoven

For Beethoven 12.0.0. Written 2026-10-02.

Beethoven starts a Claude Code worker in your own account on the Wayne State grid and opens it in
claude.ai. This guide covers:

1. [The first time](#1-the-first-time)
2. [Set up your grid code](#2-set-up-your-grid-code-only-if-you-have-none) (only if you have none)
3. [Every day](#3-every-day)
4. [Protect the key with Windows Hello or Touch ID](#4-protect-the-key-with-windows-hello-or-touch-id-optional) (optional)
5. [Forget this computer](#5-forget-this-computer)
6. [When GlobalProtect is the only way](#6-when-globalprotect-is-the-only-way)
7. [If something goes wrong](#7-if-something-goes-wrong)

Install Beethoven first ([Install Beethoven](INSTALL.md)).

**Two ways to the grid.** Beethoven tries the **direct** way first: no VPN, through the small helper
on your computer. If that can't work on your computer, it uses **GlobalProtect**, as before.

**Two authenticator apps.** Wayne State uses two, and you may have both on your phone:

- **Google Authenticator** holds the grid's 6-digit code. The grid asks for it when you sign in with
  your password, and so does Beethoven's sign-in sheet.
- **Microsoft Authenticator** approves your sign-ins to every other Wayne State service, GlobalProtect
  included.

**Your password and code.** The first time, Beethoven asks for your AccessID, your password and your
Google Authenticator code, in its own sign-in sheet. It sends them only to the grid, inside the
encrypted connection, and never keeps them. After that, this computer has a key of its own. Beethoven
asks for your password and code again only when Claude on the grid needs signing in again, or after
you sign in from another computer.

## 1. The first time

About ten minutes, plus the wait for a computer on the grid.

### The welcome page

1. Read **You'll need**: a Wayne State grid account, the grid's sign-in code, GlobalProtect once, and
   Claude Pro or Max.
2. Tick the box: **I've read and agree to the Beethoven terms and privacy statement, and I'm 18 or
   older.** **Show terms** opens the full text. You can save or print it.
3. Click **Agree and continue**. Chrome asks to let Beethoven reach `ondemand.grid.wayne.edu`:
   choose **Allow**. That is the grid's website, which Beethoven uses on the GlobalProtect way.
4. Beethoven's panel opens at the side of the window.

### Reach the grid directly

5. If the helper isn't on this computer yet, the panel says **One small download, once**. Install it
   ([Install Beethoven](INSTALL.md), part 2). Or click **Use GlobalProtect instead** and go to
   part 6.
6. The panel says **Sign in to the grid**. Type your AccessID (like ab1234).
   - Optional: tick **Protect my key with Windows Hello / Touch ID**. It is off unless you tick it.
     Ticking it here, before the key is made, gives the strongest protection (part 4).
7. Click **Continue**. Beethoven says **Connecting to the grid…**. It checks that it is really
   talking to the Wayne State grid before it sends anything.
8. The grid asks for your password, in its own words. Type your grid password (your AccessID
   password).
9. The grid asks: **Your google authenticator one-time verification code:**. Open **Google**
   Authenticator on your phone (not Microsoft Authenticator). Type the 6-digit code it shows for the
   grid. Click **Continue**.
10. Beethoven says **Signing in…**, then **Setting up this computer…**, then **Checking the new
    key…**.
11. Beethoven says **This computer is set up.** Click **Continue**.
12. Beethoven asks **Protect the key on this computer?** This is optional. **Not now** keeps it as it
    is; **Turn on** turns it on (part 4).

Under the sign-in sheet Beethoven always says: "Beethoven sends your password and code only to the
grid, inside the encrypted connection, and never keeps them." It never offers to remember them.
Anything the grid itself prints above its questions is marked **The grid says**.

If the grid says no:

- **Not accepted. Try again.** Check your password. Wait for a fresh code in Google Authenticator,
  then type it.
- **The grid didn't accept the code.** "Either the code was mistyped or had already changed, or your
  account has no grid code yet." If you have a grid entry in Google Authenticator, click **Type the
  code again** and type a fresh code. Only if you have no grid code at all, click **I don't have a
  grid code yet** and go to part 2.
- **That didn't work three times.** Beethoven stopped, so your grid account isn't locked. Click **Use
  GlobalProtect instead** now, or wait: the button says **Try again at** a time fifteen minutes
  later, and works from then.
- **Stopped: the grid's identity didn't match.** "The grid didn't prove who it is, so Beethoven sent
  nothing: no password, no code, no key." Tell your lab lead. You can use GlobalProtect meanwhile
  (part 6).

### Start your worker

These steps are the same as in earlier versions.

13. **Where your work goes.** Read it, tick the box, then click **Connect**.
14. **Sign in to Claude** (only if Claude isn't signed in on the grid yet). If you click **Connect**
    within about ten minutes of signing in to the grid, Beethoven uses that same sign-in and asks for
    nothing more. Otherwise it asks for your grid password and code once more, in the same sign-in
    sheet. It says **Getting your Claude sign-in ready…**. A Claude tab opens. Sign in with your own
    Claude account and approve. Copy the code the tab shows. Paste it into **Paste code** in the
    panel. Click **Continue**.
15. **In line for a computer.** You can close the panel. It starts as soon as a computer is free.
16. **You're online.** Click **Open my session**. Ask in claude.ai, or in the Claude app on your
    phone.

## 2. Set up your grid code (only if you have none)

The grid asks for a Google Authenticator code each time you sign in with your password. You set the
code up once, on the grid's website, with its **2FA Setup** app, which needs GlobalProtect.
Beethoven shows **Set up your grid code first** only after you clicked **I don't have a grid code
yet** (part 1).

> **Already have a grid code? Don't run 2FA Setup: it replaces your code, and the old one stops
> working.**
>
> The grid's own 2FA Setup page says the same: "NOTICE: Running this app will destroy any existing
> Google Authenticator credentials already in place."

How to tell: open Google Authenticator on your phone. If it shows an entry for the grid, you
already have a code. Use it, and don't run 2FA Setup.

Choose one:

- **On this computer** (**Use this computer**): "Turn on GlobalProtect here, then set up the code on
  the grid's website."
- **With my phone** (**Use my phone**): "For when GlobalProtect won't install on this computer."

### Route A: on this computer

1. Install **Google Authenticator** on your phone, from the App Store or Google Play. Beethoven shows
   square codes for both stores.
2. Turn on **GlobalProtect** on this computer and connect to `protect.wayne.edu`. Approve the
   sign-in in **Microsoft Authenticator**. (Wayne State's guide: KB 20314,
   https://services.wayne.edu/TDClient/277/Portal/KB/Article/20314/Wayne-State-VPN-and-the-Global-Protect-client)
3. Click **Open the grid's website** in Beethoven (`ondemand.grid.wayne.edu`). Sign in with your
   AccessID and password.
4. Read the warning above once more. If you already have a grid code, stop here and go back to
   Beethoven.
5. Choose **Interactive Apps**, then **2FA Setup**, and press **Launch**. When the job has started,
   click **Launch 2FA Setup**: a new tab shows a square code.
6. On your phone, open Google Authenticator, tap **+**, choose **Scan a QR code**, and point the
   camera at the square code on your computer's screen.
7. Google Authenticator now shows a 6-digit code for the grid. It changes every 30 seconds.
8. Turn GlobalProtect off again if you like. Come back to Beethoven and click **I've set up my
   code**. The sign-in sheet opens again: go on from part 1, step 6.

Wayne State's own steps for this are in KB 20242:
https://services.wayne.edu/TDClient/277/Portal/KB/Article/20242/How-do-I-set-up-and-use-Google-Authenticator-for-the-Grid

### Route B: with your phone

For when GlobalProtect won't install on your computer. You need your phone and about fifteen
minutes. Everything happens on the phone; your computer only shows the square codes.

Beethoven shows square codes. The address each one opens is printed under it, so you can check it
before you scan. Choose **iPhone** or **Android** above a code to get the right store.

1. Scan the first square code, **GlobalProtect app**, with your phone's camera. It opens GlobalProtect
   in the App Store or Google Play. Install it. Open it, enter the portal `protect.wayne.edu`, sign
   in with your AccessID and password, and approve in **Microsoft Authenticator**. Wayne State's own
   guide to GlobalProtect is KB 20314 (the welcome page and **What you need** show it as a square
   code too).
2. Scan the second square code, **Google Authenticator**, and install Google Authenticator.
3. Scan the third square code, **The grid's code instructions**. It opens Wayne State's own steps
   (KB 20242). Then, in your phone's browser, open `ondemand.grid.wayne.edu` and sign in with your
   AccessID and password.
4. Read the warning above once more. If you already have a grid code, stop here.
5. Choose **Interactive Apps**, then **2FA Setup**, and press **Launch**. When the job has started,
   tap **Launch 2FA Setup**.
6. Your phone can't scan its own screen. If the page shows a setup key under its square code: in
   Google Authenticator, tap **+**, then **Enter a setup key**. Give it a name you will recognise,
   like "Wayne State grid". Type the key exactly. Leave **Time based** selected. Tap **Add**.
   - If the page shows no setup key, Beethoven says: "No setup key on the page? Don't launch 2FA
     Setup again: ask your lab lead." Launching it again would make a new code and break this one.
7. Google Authenticator now shows a 6-digit code for the grid.
8. Turn GlobalProtect **off** on your phone: open GlobalProtect and tap **Disconnect**. Beethoven
   doesn't need it.
9. On your computer, click **I've set up my code**. The sign-in sheet opens again: go on from part
   1, step 6.

Not yet tried on a real phone: whether the 2FA Setup page shows a setup key you can type, and
whether a phone browser can show that page at all. If your phone can't, ask your lab lead before you
try anything else.

### If the code is refused

- Make sure your phone sets its time automatically. A clock that is a minute off makes every code
  wrong.
- Wait for a fresh code, then type it.
- Don't run 2FA Setup again unless you have lost the grid entry in Google Authenticator. If you do
  run it again, delete the old grid entry and add the new one: the old one stops working.

## 3. Every day

1. Click the Beethoven button in Chrome's toolbar. The panel opens.
2. The **Grid** line says **Signed in as** your AccessID, and **Direct**. No VPN.
3. If you protected the key (part 4), the **Grid** line says **Locked** with **Unlock** beside it.
   Click **Unlock**, then use your fingerprint, face or PIN. Beethoven asks once each time you open
   the browser.
4. Use the panel as before: **Connect**, **Open my session**, **New session**, **Copy link**,
   **Phone**, **Stop**.

Your worker keeps running when you close the panel, the browser or the laptop.

## 4. Protect the key with Windows Hello or Touch ID (optional)

**It is off unless you turn it on.** Beethoven works the same either way.

What it changes:

- **Off (the default).** The key is kept in this browser, encrypted under a second key that the
  browser keeps beside it. Beethoven uses it without asking. Anyone who can use this browser on this
  computer, or copy its files, could use it too, but only for what the key allows: start, watch and
  stop your worker. The key can't open a terminal on the grid, can't read or change your files, and
  can never sign a worker in to Claude.
- **On.** The key can only be used after your fingerprint, face or PIN (or your Mac password).
  Beethoven asks once each time you open the browser.

To turn it on, use any one of these:

- Tick **Protect my key with Windows Hello / Touch ID** on the sign-in sheet, before you sign in.
  This is the strongest: the key is protected from the moment it is made.
- Click **Turn on** when Beethoven asks **Protect the key on this computer?**
- **⋯** (More), **Settings**, **Connection**, then turn on **Protect my key with Windows Hello /
  Touch ID**. Settings says: "Turned on after setup, an older unprotected copy of the key can stay in
  this browser's files for a while. For the strongest protection, tick it when you first sign in."

Then Chrome asks where to save a passkey. Choose **Windows Hello** on Windows, or this Mac's
keychain (iCloud Keychain) on a Mac. Then use your fingerprint, face or PIN. Beethoven says
**Protected.**

- If you cancel: **Not turned on. You can turn it on in Settings any time.**
- If this browser can't do it: **This browser can't protect the key with Windows Hello or Touch ID.
  It works without it.**

To turn it off: **⋯** (More), **Settings**, **Connection**, then turn off **Protect my key with
Windows Hello / Touch ID**. Windows Hello or Touch ID asks once more, to open the key; Beethoven
then keeps it the default way. Nothing changes on the grid.

## 5. Forget this computer

Do this when you stop using this computer, when someone else will use it, if you think someone else
had it, or before you remove Beethoven.

1. Click **⋯** (More), then **Settings**, then **Connection**.
2. Click **Forget this computer**.
3. Beethoven asks **Forget this computer?** Click **Forget**. If the key is protected and locked,
   Beethoven says **Unlock first, so the grid forgets the key too.**: unlock it with your
   fingerprint, face or PIN.
4. Beethoven says **This computer is forgotten.** The key is gone from Beethoven and from your grid
   account. The next direct sign-in asks for your password and code again.

If Beethoven couldn't tell the grid, it says: "Forgotten on this computer. The grid wasn't told, so
its line for this key stays until your next sign-in from here replaces it." The line is what lets a
key in, so to remove it now, open a terminal on the grid (with GlobalProtect on: the grid's website,
then **Clusters**, then the shell) and type:

```
bash /rs/rs_grp_oschome/shared/beethoven/hpcworker/current/bin/hpcworker browser-key remove
```

It answers `HPCW-KEY removed` (or `HPCW-KEY none` if there was nothing to remove). Or ask your lab
lead.

If you protected the key, also delete the passkey ([Install Beethoven](INSTALL.md), "Remove
Beethoven completely", step 4).

Your account has one direct key at a time. Signing in directly from another computer replaces this
computer's key, and this computer then asks for your password and code again.

## 6. When GlobalProtect is the only way

Beethoven uses GlobalProtect, as in earlier versions, when:

- There is no helper for your computer (**There's no helper for this computer yet.**), for example
  on a Chromebook.
- Your computer won't run the helper: a managed laptop, or security software that stops it.
- Your network blocks the grid's direct connection: **Can't reach the grid directly**. "Some
  networks block it. GlobalProtect works on any network." Some hospital, hotel and public Wi-Fi
  networks do this.
- The grid refused three times and you would rather not wait.
- You chose **GlobalProtect only** in **Settings**, **Connection**.

Click **Use GlobalProtect instead**. Beethoven says **Using GlobalProtect**: "Turn GlobalProtect on,
then press Continue: the grid's own sign-in box opens. You can come back to the direct way here or
in Settings." Then:

1. **Turn on GlobalProtect.** Open GlobalProtect and connect to `protect.wayne.edu`. Approve the
   sign-in in Microsoft Authenticator.
2. Click **Continue**. **Sign in to the grid** in the box Chrome shows, with your AccessID and
   password. Beethoven never sees them.
3. Go on with **Where your work goes**, as in part 1.

With GlobalProtect, GlobalProtect must be on each time you start, watch or stop your worker. Your
worker itself keeps running without it, and **Open my session** works without it.

To try the direct way again: click **Try the direct way again**, or choose **Direct when possible**
in **Settings**, **Connection**.

## 7. If something goes wrong

| Beethoven says | What to do |
|---|---|
| **Waiting for the helper. Beethoven checks by itself every few seconds.** | Open the helper file you downloaded and install it ([Install Beethoven](INSTALL.md), part 2). Beethoven finds it by itself. |
| **Not found yet. Open the downloaded file, then Check again.** | Install the helper, then click **Check again**. |
| **The helper is there but did not answer. Download it again, open it, then Check again.** | Do that. If it happens again, click **Use GlobalProtect instead** and tell your lab lead. |
| **Can't reach the grid directly** | Your network may block it. Try another network, or click **Use GlobalProtect instead**. |
| **Not accepted. Try again.** | Check your password. Wait for a fresh code. |
| **The grid didn't accept the code.** | **Type the code again** if you have a grid entry in Google Authenticator; **I don't have a grid code yet** only if you have none (part 2). |
| **That didn't work three times.** | **Use GlobalProtect instead** now, or wait for **Try again at** its time. |
| **Stopped: the grid's identity didn't match** | Tell your lab lead. Use GlobalProtect meanwhile. |
| **The connection ended** | Click **Try again**. |
| **An AccessID is letters and digits, like ab1234.** | Type your AccessID, not your e-mail address. |
| **The grid didn't take this computer's key** | "Your sign-in worked, but the check with this computer's key didn't." Try again. If it happens again, send your lab lead what **Details for your lab lead** shows. |
| **The grid's own tool said no:** followed by its reason | Tell your lab lead the reason; it is about the grid, not your computer. Use GlobalProtect meanwhile. |
| **This browser couldn't keep the key** | Nothing was sent to the grid. Try again, or use GlobalProtect. |
| **The lab's copy of the tool on the grid is older than this Beethoven.** | Tell your lab lead. Use GlobalProtect meanwhile. |
| **The grid lets this computer's key use only a few worker names.** | Connect with a worker name you used before (Settings), or use GlobalProtect for this one. Signing in again with your password and code also clears it. |
| **This computer's key has started the worker as often as the grid allows in an hour.** | Try again later, or use GlobalProtect. |
| **Locked** · **Unlock** | Click **Unlock**, then your fingerprint, face or PIN. |
| **That didn't unlock. Try again.** | Try again. If Windows Hello or Touch ID no longer works, click **Can't unlock? Forget this computer and sign in again**. |

For anything else, open **⋯** (More), **Details for your lab lead**, and send your lab lead what it
shows. It never contains your password or your code.
