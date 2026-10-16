# Use Beethoven

For Beethoven 21.0.0. Written 2026-10-02, updated 2026-10-16.

**New in 21.0.0.** If you work in a project on claude.ai, give Beethoven its address once, in
Settings (copy it from the address bar while your project is open; it starts with
`https://claude.ai/code/project/`). From then on the tab that opens when your worker is ready is your
project, the panel's button reads **Open my project**, and under it the panel says what to do there:
choose **Work locally** from the **+** menu, write the task, and press **Allow once** on the card. A
plain session opened from the worker's link cannot be made part of a project afterwards, which is why
the project comes first. **New session**, **Copy link** and **Phone** keep the worker's own link.
Beethoven asks you to accept its terms once more, because they now say so.

**New in 20.0.0.** Your approval covers every installation of your own: Beethoven works on a second
computer of yours, or in another Chrome profile, from its first check. Beethoven asks you to accept
its terms once more, because they now say so.

**New in 19.0.0.** Beethoven signs in to the grid for you. When the grid needs your sign-in, the
panel shows **Sign in to the grid**: type your AccessID and password there, press **Sign in**, and
Beethoven signs in in the background, with no tab. It sends them only to the grid. If the grid says
the password is wrong, Beethoven stops at once and does not try it again until you type it again:
Wayne State disables an AccessID after five wrong passwords. Beethoven can remember the password on
this computer, locked with Windows Hello or Touch ID, but only if you tick **Remember it on this
computer**, and Wayne State asks you to type your password each time instead ([part
2](#save-your-grid-sign-in-or-not)). **Use Chrome's sign-in box instead** still gives you 18.0.0's
way, the grid's own box in a tab. Beethoven asks you to accept its terms once more, because they now
describe the sign-in.

**New in 18.0.0.** The grid's sign-in box comes to the front by itself, with its tab and window, so
you no longer have to find its tab. Chrome can save your grid password: when it offers after you
sign in, choose **Save**, and next time the box is filled in for you (since 19.0.0, read [part
2](#save-your-grid-sign-in-or-not) first). A press made while GlobalProtect is off now waits at
once instead of after a few seconds, and Beethoven notices sooner when GlobalProtect connects. The
panel calls the grid's start button by its first word: **Press LOGIN on the grid's page.**

**New in 16.0.0.** One way to the grid: GlobalProtect, then the grid's website, as before 12.0.0.
The helper, the sign-in sheet, the key in this browser, Windows Hello or Touch ID protection and
**Forget this computer** of 12.0.0 to 15.0.0 are gone. Beethoven never asks for your grid password
or your code: the only places you type them are the grid's own sign-in box and, once, the grid's own
terminal page (19.0.0 changes this for the password: see above). A press made while the grid is out of reach is kept: the panel shows **Turn on
GlobalProtect.** with **How to set it up** and "Beethoven carries on by itself as soon as the grid
answers." ([part 3](#3-when-the-grid-is-out-of-reach)). **Keep my worker running** now also starts
your worker again when Beethoven finds it ended, at most three times in a row. If an earlier version
added a key to your grid account, **Settings** says so once ([part
4](#4-a-key-from-an-earlier-version)). Beethoven asks you to accept its terms once more, because
they no longer describe the helper.

**New in 14.0.0.** When your worker picks up a conversation you had earlier, Claude gives it a link of
another kind, the link to that conversation itself. Beethoven 13.0.0 knew only the usual link, so it
stayed on **Starting · Connecting to Claude…** while your worker was in fact ready, and it never opened
claude.ai. 14.0.0 knows both links: it shows **Online** with **Open my session**, and opens claude.ai if
you asked it to. If your browser is not signed in to claude.ai, claude.ai asks you to sign in there:
use the Claude account your worker uses. A worker on such a link runs that one conversation, so the home
offers **Copy link** and **Phone** but not **New session**. And when something seems stuck, open **⋯**
(More), click **Copy debug log**, and paste it to your lab lead ([part 5](#5-if-something-goes-wrong)).
Install 14.0.0 in place of 13.0.0 ([Install Beethoven](INSTALL.md)).

**New in 13.0.0.** Sometimes your worker's next job is cancelled on the grid. Beethoven used to wait on
**Connecting to Claude…** with no button. Once framework 13 is published on the grid (your lab lead does
that), it shows **Stopped** with **Connect**: press **Connect** to start your worker again. A worker
Beethoven finds already on the grid that has stopped answering also gets **Connect**. Install 13.0.0 in
place of 12.0.0 ([Install Beethoven](INSTALL.md)).

Beethoven starts a Claude Code worker in your own account on the Wayne State grid and opens it in
claude.ai. This guide covers:

1. [The first time](#1-the-first-time)
2. [Every day](#2-every-day)
3. [When the grid is out of reach](#3-when-the-grid-is-out-of-reach)
4. [A key from an earlier version](#4-a-key-from-an-earlier-version)
5. [If something goes wrong](#5-if-something-goes-wrong)

Install Beethoven first ([Install Beethoven](INSTALL.md)).

**One way to the grid.** Beethoven works through the grid's website, `ondemand.grid.wayne.edu`,
signed in with your AccessID, and that website is reachable only with GlobalProtect on. There is no
helper on your computer and no key in your browser. The sign-in sheet of 19.0.0 does not change
that: you still need GlobalProtect.

**Two authenticator apps.** Wayne State uses two, and you may have both on your phone:

- **Microsoft Authenticator** approves your sign-ins to Wayne State's services, GlobalProtect
  included.
- **Google Authenticator** holds the grid's 6-digit code. The grid's own terminal may ask for it,
  the one time Beethoven sends you there (part 1). Beethoven itself never asks for it.

**Your password.** You type your grid password into Beethoven's sheet, **Sign in to the grid**, or,
if you choose **Use Chrome's sign-in box instead**, into the box Chrome shows for the grid's
website; and once, if it asks, into the grid's own terminal page. From the sheet, Beethoven sends it
only to the grid's website, only when the grid asks Beethoven to sign in, never to another site and
never to us, and never writes it into a log. It keeps it only if you tick **Remember it on this
computer** ([part 2](#save-your-grid-sign-in-or-not)); otherwise it forgets it after that one
sign-in, at the latest after two minutes. When the grid says the password is wrong, Beethoven stops
and sends no password again until you type it, because Wayne State disables an AccessID after five
wrong passwords (getting it back can take up to three business days). Beethoven itself sends a wrong
password at most once; in detail: Chrome re-sends its cached copy once for each request already
started with it before the first refusal comes back; Beethoven then sends at most one; when the
answered request is abandoned before the grid replies, Chrome may re-send that copy once. How many
of these the grid counts is not yet measured. Beethoven never fills in Wayne State's sign-in pages,
never touches Microsoft Authenticator or your code, and never types your password into a terminal.

## 1. The first time

About ten minutes, plus the wait for a computer on the grid.

### The welcome page

1. Read **You'll need**: **A Wayne State grid account** ("Your AccessID and password."),
   **GlobalProtect** ("Connected to protect.wayne.edu.") and **Claude Pro or Max** ("The account you
   use at claude.ai."). Each has a link, **How to get one**, **How to set it up** and **See plans**,
   that opens Wayne State's or Anthropic's own page in a new tab, only when you click it.
2. Tick the box: **I've read and agree to the Beethoven terms and privacy statement, and I'm 18 or
   older.** **Show terms** opens the full text. You can save or print it.
3. Click **Agree and continue**. Chrome asks to let Beethoven reach `ondemand.grid.wayne.edu`:
   choose **Allow**. That is the grid's website, which Beethoven works through.
4. Beethoven's panel opens at the side of the window.

### Turn on GlobalProtect and sign in to the grid

5. The panel says **Turn on GlobalProtect.**: "Open GlobalProtect and connect to protect.wayne.edu.
   Then approve the sign-in on your phone." Do that: open GlobalProtect, connect to
   `protect.wayne.edu`, and approve the sign-in in **Microsoft Authenticator**. **How to set it up**
   opens Wayne State's own guide (KB 20314) if GlobalProtect is not on this computer yet. Beethoven
   says **Looking for the grid…**, then **Connected.** If it says **Still looking. Check that
   GlobalProtect says Connected.**, check that.
6. **Sign in to the grid**: "Type your AccessID and password. Beethoven signs in to the grid for
   you, in the background." Type your **AccessID** (not your e-mail address) and your **Password**.
   Leave **Remember it on this computer** unticked unless you have read part 2. Click **Sign in**
   (**Signing in…**). The panel says **Signed in as** your AccessID; no tab opens. If the password
   was wrong, the panel says: "That password didn't work, and Beethoven stopped. Check it before you
   try again: after a few wrong tries your university may lock your AccessID. A password changed in
   the last half hour may not work yet." Check it, then type it again.
   **Use Chrome's sign-in box instead** is the other way, 18.0.0's: Beethoven brings the grid's box
   to the front and you type your AccessID and password into it (if the grid's page shows a
   **LOGIN** button instead, press it first); the grid's tab closes by itself once you move on.
7. **One more thing, once.** The first time, the grid's shell may ask for your password itself.
   Beethoven then says: "Type your grid password in the grid's own terminal. Beethoven never sees
   it." Click **Open the grid terminal**: the grid's own terminal page opens in a tab. Type your
   password there and press Enter. "If it asks for a code, type the one in Google Authenticator.
   Don't run 2FA Setup if you have one: it replaces it." When the terminal shows your prompt, click
   **I'm in**. Beethoven types one line into that terminal (**What does the line do?**: "It makes a
   key in your grid account that only the grid's own website can use, so it stops asking."), says
   **Checking…**, then **Done. You won't need this again.** If Beethoven can't type the line, it
   says **Paste, then press Enter.**: the line is already on your clipboard, so paste it into the
   terminal and press Enter. If you close the terminal before it is done, Beethoven says **Not done
   yet.** and you do this step again. Not yet measured on the real grid by a student doing it for
   the first time: tell your lab lead what the terminal showed.

### Start your worker

These steps are the same as in earlier versions.

8. **Where your work goes.** Read it, tick the box, then click **Connect**.
9. **Sign in to Claude** (only if Claude isn't signed in on the grid yet). Beethoven says **Getting
   your Claude sign-in ready…**. A Claude tab opens. Sign in with your own Claude account and
   approve. Copy the code the tab shows. Paste it into **Paste code** in the panel. Click
   **Continue**.
10. **In line for a computer.** You can close the panel. It starts as soon as a computer is free.
11. **You're online.** Click **Open my session**. Ask in claude.ai, or in the Claude app on your
    phone. If you gave your project's address in Settings, the button is **Open my project**: in the
    project, choose **Work locally** from the **+** menu, write the task, and press **Allow once** on
    the card.

## 2. Every day

1. Turn on GlobalProtect (connect to `protect.wayne.edu`, approve in Microsoft Authenticator). It
   must be on each time you start, watch or stop your worker.
2. Click the Beethoven button in Chrome's toolbar. The panel opens.
3. The **Grid** line says **Signed in as** your AccessID. If it says **Signed out**, click **Sign
   in** and type your AccessID and password into **Sign in to the grid** (or choose Chrome's box;
   **Not now** goes back);
   if you saved your sign-in, the link says **Unlock** instead: click it and use Windows Hello or
   Touch ID. If it says **Can't reach**, GlobalProtect is off (part 3). Chrome stays signed in to
   the grid until you close it, so you sign in about once each time you open Chrome.
4. Use the panel as before: **Connect**, **Open my session** (or **Open my project**), **New
   session**, **Copy link**, **Phone**, **Stop**. **New session** is there only when your worker can start a new conversation;
   a worker that picked up an earlier conversation runs that one, and **Open my session** opens it.

Your worker keeps running when you close the panel, the browser or the laptop, and when
GlobalProtect is off. **Open my session** works without GlobalProtect too: claude.ai is not on the
grid. If **Keep my worker running** is on in **Settings** and Beethoven finds your worker ended
without your **Stop**, it starts it again by itself, at most three times in a row.

### Save your grid sign-in, or not

**At Wayne State, type your password each time.** Wayne State's Strong Password Standard says:
"Never save passwords in web browsers or computer programs; instead, type them in each time you need
them." Beethoven is a program in your browser, so at Wayne State leave **Remember it on this
computer** unticked, and do not let Chrome save the password either when you use its box. The sheet
says the same: "Off unless you tick it. Your university may ask you to type your password each time;
if it does, leave this off."

**If you tick it anyway** (it is never ticked for you): the box reads **Remember it on this
computer, unlocked with Windows Hello** (on a Mac, Touch ID; elsewhere, your screen lock). When you
click **Sign in**, Windows Hello or Touch ID asks you to make a passkey named with your AccessID
followed by **(grid)**, for example **ab1234 (grid)**. Beethoven keeps your password only on this
computer, in this Chrome profile, encrypted so that only that passkey can open it; it never sends it
to us. The passkey itself is kept by Windows Hello, your Mac's Passwords app or Chrome's password
manager, which may keep it in your Google account or iCloud and offer it on your other devices; the
saved password stays on this computer. If your computer can't lock a saved password that way, the
panel says "This computer can't lock a saved password with Windows Hello, so Beethoven uses it this
once and forgets it." If you cancel the passkey, it says "Not saved, but signing you in this once."

**Unlocking.** Each time you open Chrome, the **Grid** line says **Signed out** with **Unlock**
until you unlock the saved sign-in, and Beethoven sends no password to the grid: click **Unlock**
and use Windows Hello. If you press **Connect** first, Windows Hello asks in the same click, and the
panel shows **Unlock your grid sign-in**, "Beethoven saved it on this computer. Unlock it with
Windows Hello to sign in.", with **Unlock with Windows Hello** and **Type it instead**, until it is
unlocked; then your press goes on by itself. If the grid turns a saved password down (after you
changed it, for example), Beethoven stops, **Settings** says "Saved, but it didn't work last time.
Forget it, or type the new one when Beethoven asks.", and it is not tried again until you type the
new one. If Beethoven can't tell whether your saved password worked, because Chrome closed before
the grid answered, or because a tab of the grid's website asked you to sign in or loaded a page
while it waited, it doesn't try the saved password again either until you type your password; that
doesn't count as a wrong try, and the panel says "Beethoven couldn't tell whether your saved password
worked, so it won't use it again by itself. Type your password to sign in." If the password you type
then works, Beethoven forgets the saved one by itself, unless it can see that it is the same
password; then it keeps it.

**Forget.** **Settings**, **Your grid**, **Grid sign-in** shows "Saved on this computer for
<AccessID>. It opens with Windows Hello." Click **Forget** and confirm **Forget the saved sign-in?**:
"Forgotten. Chrome stays signed in to the grid until you close it. Your passkey list may still show
"<AccessID> (grid)"; you can delete it there." Delete that passkey in your list of passkeys only
after Forget. **Disconnect** forgets it too. A passkey named with your AccessID alone, or "beethoven", is a
different one: the old passkey of 12.0.0 to 15.0.0, which you can delete (part 4).

**Chrome's own box.** If you choose **Use Chrome's sign-in box instead**, Chrome may offer to save
the password in its password manager. That is Chrome's, not Beethoven's: Beethoven never reads it,
stores it or fills it in, and Wayne State's standard above applies to it the same way.

## 3. When the grid is out of reach

GlobalProtect must be on each time you start, watch or stop your worker. Your worker itself keeps
running without it, and **Open my session** works without it.

If you press **Connect**, **Stop** or anything else that needs the grid while GlobalProtect is off,
Beethoven keeps your press. The panel says **Turn on GlobalProtect.**: "Open GlobalProtect and
connect to protect.wayne.edu. Then approve the sign-in on your phone.", with **How to set it up**
(Wayne State's own page) and, under it, "Beethoven carries on by itself as soon as the grid
answers." Then:

1. **Turn on GlobalProtect.** Open GlobalProtect and connect to `protect.wayne.edu`. Approve the
   sign-in in Microsoft Authenticator.
2. Wait. Beethoven looks for the grid every few seconds while one of its pages is open and once a
   minute while none is, and goes ahead with your press by itself as soon as the grid answers. You
   need not press again.
3. If the panel then asks you to **Sign in to the grid**, type your AccessID and password there (or
   choose Chrome's box), or click **Unlock with Windows Hello** if you saved your sign-in.

The home says the same while a worker runs: **Can't reach the grid**, "Is GlobalProtect on? Your
worker keeps running."

## 4. A key from an earlier version

Beethoven 12.0.0 to 15.0.0 added a key for this computer to your grid account. 16.0.0 and later do
not use it and cannot use it. The first time 16.0.0 or later runs, it removes what the earlier version left in this
browser, without reading the key. **Settings** then shows once:

> **A key from an earlier version.** An earlier version of Beethoven added a key for this computer
> to your grid account (<date>). Beethoven no longer uses it. Your lab lead can remove it for you.

**Forget** hides that note and nothing more: Beethoven touches nothing on the grid, ever. To have
the key taken off your grid account, ask your lab lead; their guide says how. If you also turned on
Windows Hello or Touch ID protection then, that old passkey (12.0.0 to 15.0.0) is named with your
AccessID alone, or "beethoven", and can go: delete it in your passkey list ([Install Beethoven](INSTALL.md),
"Remove Beethoven completely"). The one 19.0.0 uses for your grid sign-in is named "<AccessID>
(grid)"; delete that one only after **Forget** (part 2).

## 5. If something goes wrong

| Beethoven says | What to do |
|---|---|
| **Turn on GlobalProtect.** and, after a while, **Still looking. Check that GlobalProtect says Connected.** | Open GlobalProtect, connect to `protect.wayne.edu` and approve in Microsoft Authenticator. **How to set it up** opens Wayne State's guide. Beethoven carries on by itself as soon as the grid answers (part 3). |
| **Can't reach the grid. Is GlobalProtect on?** | The same. Your worker keeps running meanwhile. |
| **That password didn't work, and Beethoven stopped.** | Check your password before you try again: Wayne State disables an AccessID after five wrong passwords. A password changed in the last half hour may not work yet. Then type it again in **Sign in to the grid**. |
| **Two tries haven't worked. Wait a while, or ask your university's help desk, before you try again.** | Stop trying for now. Check your password at Wayne State's own password page, or ask the C&IT Help Desk; if your AccessID was disabled, they can turn it back on (it can take up to three business days). |
| **Beethoven couldn't tell whether your saved password worked, so it won't use it again by itself. Type your password to sign in.** | Not a wrong try: Chrome closed before the grid answered, or a tab of the grid's website asked you to sign in or loaded a page while Beethoven's sign-in was on its way. Type your password in **Sign in to the grid**. If it is the one saved, Beethoven keeps it; if it is another and it works, Beethoven forgets the saved one. |
| **Unlock your grid sign-in** | You saved your sign-in. Click **Unlock with Windows Hello** (or Touch ID), or **Type it instead**. |
| **Not unlocked. Try again, or type it instead.** | Windows Hello or Touch ID was cancelled or didn't recognise you. Click **Unlock** again, or type your password. |
| **Not saved, but signing you in this once.** | The passkey wasn't made, so nothing was saved; you are signed in this time. Nothing to do. |
| **Not signed in yet.** or **The sign-in tab was closed.** | You chose Chrome's box. Click **Sign in again** and sign in in the box Chrome shows, or type your password in **Sign in to the grid**. Type your AccessID, not your e-mail address. |
| **Press LOGIN on the grid's page.** | Press it, then sign in. |
| **One more thing, once.** stays on **Not done yet.** | Open the terminal again, type your password (and the code, if asked), press Enter, then click **I'm in** (part 1, step 7). If it says so again, tell your lab lead. |
| **Your grid account can't use the lab's copy yet. Ask your lab lead.** (**Copy details** gives a line ending in `Permission denied`) | Your approval hasn't reached the grid yet. The lab's list of approved accounts is applied on the grid by itself, about every fifteen minutes. Wait a quarter of an hour, then close Chrome completely, open it again and click **Connect**. If it still says this after an hour, click **Copy details** and send your lab lead what it gives. |
| **This Claude account has no Pro or Max plan. Remote Control needs one.** | Sign out of Claude on the grid first (your lab lead's guide shows how), then press **Sign in again** with a Claude account that has one. |
| **Starting · Connecting to Claude…** for more than five minutes | Open **⋯** (More), click **Copy debug log**, and paste it to your lab lead. Keep the panel open while you do. |

**If something is stuck: More, Copy debug log, paste it to your lab lead.** Open **⋯** (More) and click
**Copy debug log**. Beethoven puts on your clipboard a list of what it did, step by step, with the time
of each step: how it reached the grid, what it asked there and what came back, what it read about your
worker and what it showed you. Paste it into an e-mail or a message to your lab lead. Do it while the
panel still shows the problem: the list lives only in Beethoven's memory in this browser, it is never
sent anywhere by itself, and it starts empty again when you restart the browser (and sometimes after
the panel has been closed for a while). It never contains your password, whether you typed it or
saved it, the code you paste from Claude's page, or the full sign-in link.

For anything else, open **⋯** (More), **Details for your lab lead**, and send your lab lead what it
shows. It never contains your password or your code. Its last part is the newest 200 lines of the same
debug log.
