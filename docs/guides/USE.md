# Use Beethoven

For Beethoven 16.0.0. Written 2026-10-02, updated 2026-10-08.

**New in 16.0.0.** One way to the grid: GlobalProtect, then the grid's website, as before 12.0.0.
The helper, the sign-in sheet, the key in this browser, Windows Hello or Touch ID protection and
**Forget this computer** of 12.0.0 to 15.0.0 are gone. Beethoven never asks for your grid password
or your code: the only places you type them are the grid's own sign-in box and, once, the grid's own
terminal page. A press made while the grid is out of reach is kept: the panel shows **Turn on
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

**One way to the grid.** Beethoven works through the grid's website, `ondemand.grid.wayne.edu`, in
your own signed-in browser, and that website is reachable only with GlobalProtect on. There is no
helper on your computer and no key in your browser.

**Two authenticator apps.** Wayne State uses two, and you may have both on your phone:

- **Microsoft Authenticator** approves your sign-ins to Wayne State's services, GlobalProtect
  included.
- **Google Authenticator** holds the grid's 6-digit code. The grid's own terminal may ask for it,
  the one time Beethoven sends you there (part 1). Beethoven itself never asks for it.

**Your password.** You type your grid password only where the grid itself asks for it: in the box
Chrome shows for the grid's website, and once in the grid's own terminal page. Beethoven never sees
it, never asks for it in a page of its own, and never keeps it.

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
6. **Sign in to the grid**: "Use your AccessID and password in the box Chrome shows. Beethoven never
   sees them." Type them into Chrome's box. If the grid's page shows **LOGIN TO ONDEMAND** instead,
   press it first. The panel says **Signed in as** your AccessID.
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
    phone.

## 2. Every day

1. Turn on GlobalProtect (connect to `protect.wayne.edu`, approve in Microsoft Authenticator). It
   must be on each time you start, watch or stop your worker.
2. Click the Beethoven button in Chrome's toolbar. The panel opens.
3. The **Grid** line says **Signed in as** your AccessID. If it says **Signed out**, click **Sign
   in** and sign in in the box Chrome shows. If it says **Can't reach**, GlobalProtect is off
   (part 3).
4. Use the panel as before: **Connect**, **Open my session**, **New session**, **Copy link**,
   **Phone**, **Stop**. **New session** is there only when your worker can start a new conversation;
   a worker that picked up an earlier conversation runs that one, and **Open my session** opens it.

Your worker keeps running when you close the panel, the browser or the laptop, and when
GlobalProtect is off. **Open my session** works without GlobalProtect too: claude.ai is not on the
grid. If **Keep my worker running** is on in **Settings** and Beethoven finds your worker ended
without your **Stop**, it starts it again by itself, at most three times in a row.

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
3. If the panel then asks you to **Sign in to the grid**, sign in in the box Chrome shows, with your
   AccessID and password. Beethoven never sees them.

The home says the same while a worker runs: **Can't reach the grid**, "Is GlobalProtect on? Your
worker keeps running."

## 4. A key from an earlier version

Beethoven 12.0.0 to 15.0.0 added a key for this computer to your grid account. 16.0.0 does not use
it and cannot use it. The first time 16.0.0 runs, it removes what the earlier version left in this
browser, without reading the key. **Settings** then shows once:

> **A key from an earlier version.** An earlier version of Beethoven added a key for this computer
> to your grid account (<date>). Beethoven no longer uses it. Your lab lead can remove it for you.

**Forget** hides that note and nothing more: Beethoven touches nothing on the grid, ever. To have
the key taken off your grid account, ask your lab lead; their guide says how. If you also turned on
Windows Hello or Touch ID protection then, the passkey named **Beethoven** is still in your passkey
list; delete it there ([Install Beethoven](INSTALL.md), "Remove Beethoven completely").

## 5. If something goes wrong

| Beethoven says | What to do |
|---|---|
| **Turn on GlobalProtect.** and, after a while, **Still looking. Check that GlobalProtect says Connected.** | Open GlobalProtect, connect to `protect.wayne.edu` and approve in Microsoft Authenticator. **How to set it up** opens Wayne State's guide. Beethoven carries on by itself as soon as the grid answers (part 3). |
| **Can't reach the grid. Is GlobalProtect on?** | The same. Your worker keeps running meanwhile. |
| **Not signed in yet.** or **The sign-in tab was closed.** | Click **Sign in again** and sign in in the box Chrome shows. Type your AccessID, not your e-mail address. |
| **Press LOGIN TO ONDEMAND on the grid page.** | Press it, then sign in. |
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
the panel has been closed for a while). It never contains your password, the code you paste from
Claude's page, or the full sign-in link.

For anything else, open **⋯** (More), **Details for your lab lead**, and send your lab lead what it
shows. It never contains your password or your code. Its last part is the newest 200 lines of the same
debug log.
