# Ashley Bridge for testers

What you do, in order, from asking for access to your first worker. There is no key and nothing to
paste anywhere: your own sign-in to your university's Open OnDemand portal identifies you, and the
extension confirms with the maintainer's access service that your account is approved. If an
instruction you were given earlier mentions a key, it is out of date; this page replaces it.

Written 2026-09-29 for Ashley Bridge 4.0.0 and brought up to date for 5.0.0.

## What you need

- An account on a cluster with an Open OnDemand portal, and whatever your university needs to reach
  it (at Wayne State: the VPN, then `https://ondemand.grid.wayne.edu`).
- Your own Claude account on a plan that includes Claude Code Remote Control (Pro or Max). One
  person, one account; you sign in yourself, once, and the extension never sees that sign-in.
- At Wayne State, your grid account in the lab's research-storage group. Ask Greg to have it added;
  until it is, your worker cannot start.
- Chrome, Edge or Firefox. Safari is not offered yet.

## 1. Ask for access

Open `https://openspineconsortium.com/ashley/request.html` and fill in the form with the account name
your portal shows for you (at Wayne State your AccessID, two letters and four digits, such as
`ab1234`; it is the name the portal's dashboard shows next to "Logged in as"), your name, your
institutional e-mail and a line on what you will use it for. Send it. There is no automatic e-mail:
Greg approves requests in his console and tells you when yours is approved.

If you skip this step, the extension still installs and still shows you the agreement, but its one
button after that will read *Ask for access*; it opens the same form with your account name filled
in.

## 2. Install the extension

Once the store listings are live, install from your browser's store like any other extension. Until
then Greg sends you the package for your browser; load it as its README says (Chrome and Edge: the
extensions page, developer mode, *Load unpacked*, the unzipped folder; Firefox: `about:debugging`,
*This Firefox*, *Load Temporary Add-on*, the `manifest.json` in the unzipped folder; a temporary
add-on is gone after Firefox restarts and is loaded again the same way).

The extension's setup page opens by itself. Read the agreement to its end (the button stays grey
until you have), tick the four statements, type your name and choose *Accept and Continue*. That is
all the setup page needs; nothing else is entered there.

## 3. Open your portal and click the icon

1. Open your portal in a tab and sign in the usual way (VPN first if your university requires it).
   Keep the tab open.
2. Click the Ashley Bridge icon in the toolbar (pin it from the extensions menu if it is hidden).
   The first click asks your browser to allow that one site; allow it. The panel then does the
   steps by itself and says in one line what it is doing: it wakes the portal up, checks you are
   signed in, confirms your account is approved, sets up its small set of scripts for your own
   cluster account (at Wayne State it points your account at the copy the lab keeps for everyone
   instead of copying them), runs one short check job on a compute node the first time, shows you
   where your work goes and takes your statement about it, starts your worker through the portal's
   own shell, and waits for Claude Code to connect.
3. Sign in to Claude once, when the panel asks. It opens Anthropic's sign-in page in a new tab; sign
   in with your own Claude account, click *Authorize*, and paste the code that page shows into the
   panel's one box. That code is the only thing you ever paste, it goes once into your own job's
   terminal, and the extension does not keep it.

When your worker connects, your session's claude.ai page opens in a new tab (you can turn that off
on the setup page), and the panel shows a green *Open in Claude* button for later. The worker stays
on by itself until you press *Stop*.

## After it connects, nothing on your laptop is needed

The worker is a job on the cluster, not a program on your computer. Once the panel shows *Open in
Claude*, you can close the panel, the portal tab, the browser and the laptop. From any device, open
`https://claude.ai/code` (or *Code* in the Claude app), pick the environment named after your site
(at Wayne State, `wayne-worker`) and carry on; you do not sign in to the portal again for that. The
job renews itself: before its time is up it has already queued its successor, which takes over and
continues the same session. You need the portal again only to press *Stop*, to start a worker after
you stopped it, or if the cluster ended the chain (the panel's one button then reads *Start*).

## If the panel says "Ask for access"

Your account is not approved yet, or the approval was withdrawn. Press the button (it opens the
request form with your account name filled in) or tell Greg. After he approves you, click the icon
again; if it still says *Ask for access*, wait ten minutes and click again (the extension keeps a
"no" for ten minutes, and the service's storage can take a minute to catch up). If it still says so
after that, send Greg the account name the panel shows under *Details* (check 4, "signed in as").

## What the extension sends the maintainer, so you know

Only the approval check: the account name your portal shows for you, your portal's hostname, the
product name and the extension's version, answered yes or no; the service records those with the
time, a salted hash of your network address and the answer. Once a day it also downloads, without
cookies, two small files from the maintainer's website (the service address and the signed list of
withdrawn versions), which carry nothing about you. No usage data, no error reports, no activation.
The full statement is `PRIVACY.md` (version 5), also at
`https://openspineconsortium.com/ashley/bridge/privacy.html`.

## What to send when something does not work

- The one line the panel shows (its step number and status).
- Under *Details*: *Run the checks*, then the list as it stands (a screenshot is fine).
- The audit log's export from *Details* or the setup page; it holds one line per request the
  extension made to your portal and never what you typed.
- If a worker started: the `rc.log` tail under *Details*.

Nothing you send this way contains a credential: the extension has none of yours to send.
