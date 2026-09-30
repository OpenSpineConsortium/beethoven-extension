# Beethoven for testers

What you do, in order, from asking for access to your first worker. There is no key and nothing to
paste anywhere: your own sign-in to your university's Open OnDemand portal identifies you, and the
extension confirms with the maintainer's access service that your account is approved. If an
instruction you were given earlier mentions a key, a download or a package to load by hand, it is
out of date; this page replaces it.

Written 2026-09-29 for 4.0.0 and brought up to date for 6.0.0, for 7.0.0, the first build named
Beethoven, and for 8.0.0, the first build offered only through a private listing on the Chrome Web
Store, with one installation per approved account; on 2026-09-30 also for the steps between the
request and the installation (the mailbox confirmation and the invitation to the lab's Google
Group). If you tested an earlier build under another name or loaded one by hand, remove it from your
browser before you install this one; your approval carries over, and you accept the agreement once
more.

## What you need

- An account on a cluster with an Open OnDemand portal, and whatever your university needs to reach
  it (at Wayne State: the VPN, then `https://ondemand.grid.wayne.edu`).
- Your own Claude account on a plan that includes Claude Code Remote Control (Pro or Max). One
  person, one account; you sign in yourself, once, and the extension never sees that sign-in.
- At Wayne State, your grid account in the lab's research-storage group. Ask Greg to have it added;
  until it is, your worker cannot start.
- Google Chrome, signed in to the Chrome Web Store with the Google account you give on the request
  form. Beethoven is offered in no other browser and no other store, and there is no download.
- Your Wayne State mailbox (`<AccessID>@wayne.edu`), in case the service asks you to confirm your
  request from it (step 1).
- The one computer and the one Chrome profile you will use it from (see step 2).

## 1. Ask for access

Open `https://openspineconsortium.com/beethoven/request.html` and fill in the form: the account name
your portal shows for you (at Wayne State your AccessID, two letters and four digits, such as
`ab1234`; it is the name the portal's dashboard shows next to "Logged in as"), your name, your
institutional e-mail, the Google account at which you want the invitation to the private listing
(the one you sign in to Chrome with), and a line on what you will use Beethoven for. You may attach a
CV (PDF or Word, 5 MB at most); it is optional. Send it. The page then says one of two things:

- **"Sent. Check your Wayne State mail for a confirmation link."** The service e-mailed
  `<AccessID>@wayne.edu` with what was asked in your name and a *Confirm it is you* link. Open it and
  press *Confirm it is me*; only then does your request reach Greg. Anyone can type an AccessID, and
  this proves the request came from the mailbox that owns it. The link works once and for 24 hours;
  if you send the form again with anything changed, only the newest e-mail's link counts. A request
  nobody confirms lapses after seven days. If the link expired or never came, send the form again:
  it makes a new link (three a day at most).
- **"Sent. You hear from the lab lead."** The service is not e-mailing students (how it runs on
  2026-09-30, until its sending domain is set up), so the request went straight to Greg marked
  "mailbox not verified", and he may check with you before approving. You also see this when you
  send again, unchanged, a request you have already confirmed: it is with Greg.

Greg then decides: **Approve for Beethoven**, **Lab membership only** (the lab, not Beethoven), or
**Deny**. When the service e-mails students, an approval for Beethoven e-mails you too: you are
approved; watch for the Google Groups invitation to `Beethoven-users` at your Google account and
accept it; then install Beethoven from the private Chrome listing; and a link to how it works
(`https://openspineconsortium.com/beethoven/`). Otherwise Greg tells you.

If you skip this step, the extension cannot be installed at all: the private listing opens only for
the Google accounts in the lab's Google Group.

## 2. Install the extension, once, on the computer you will use

When you are approved for Beethoven, Greg adds the Google account you gave to the lab's Google Group
**Beethoven-users**, the list of accounts the private listing opens for. Google then e-mails that
account about the group (if it is an invitation, accept it); the link to the listing comes with that
e-mail or from Greg. Nothing
arrives at your Wayne State address for this step, and an invitation to a different Google account
does not help: the listing checks the account Chrome is signed in with. In Chrome, signed in with
that Google account, open the listing's link and choose *Add to Chrome*, then *Add extension* in
Chrome's own prompt. Updates come by themselves through Chrome. If the listing does not open for you,
either Chrome is signed in with another Google account or yours is not in the group yet: check the
first, then ask Greg.

One approved account, one installation. The first installation that checks your account is bound to
it (Greg's list then shows you as installed). Another computer, another Chrome profile or a
reinstallation is a new installation, and it is refused: its panel says "This account is already set
up on another computer. Ask your lab lead to move it here." If you change computers or reinstall, ask
Greg to move your approval; the new installation works at its next check, and the old one stops at
its own next check, within a day while it is online (it keeps a yes up to seven days when it cannot
reach the service). The identifier behind this is a random number the extension makes for itself; it
is not taken from your computer, and Chrome does not sync it. So if Chrome Sync installs Beethoven on
another computer where Chrome is signed in to the same Google account, that copy is a new
installation and is refused: remove it there, or turn off syncing of extensions in Chrome's settings
on the computers you do not use for Beethoven.

The extension's setup page opens by itself. Read the agreement to its end (the button stays grey
until you have), tick the four statements, type your name and choose *Accept and Continue*. That is
all the setup page needs; nothing else is entered there.

## 3. Open your portal and click the icon

1. Open your portal in a tab and sign in the usual way (VPN first if your university requires it).
   Keep the tab open.
2. Click the Beethoven icon in the toolbar (pin it from the extensions menu if it is hidden).
   The first click asks your browser to allow that one site; allow it. The panel then does the
   steps by itself and says in one line what it is doing: it wakes the portal up, checks you are
   signed in, confirms your account is approved, points your cluster account at the copy of its
   scripts the lab keeps for everyone, runs one short check job on a compute node the first time,
   shows you where your work goes and takes your statement about it, starts your worker through the
   portal's own shell, and waits for Claude Code to connect.
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

Your account is not approved for Beethoven yet (an approval for lab membership only does not cover
it), or the approval was withdrawn. Press the button (it opens the request form with your account
name filled in) or tell Greg. After he approves you, click the icon again; if it still says *Ask for
access*, wait ten minutes and click again (the extension keeps a "no" for ten minutes, and the
service's storage can take a minute to catch up). If it still says so after that, send Greg the
account name the panel shows under *Details* (check 4, "signed in as").

## If the panel says "This account is already set up on another computer"

Your approval is bound to another installation: another computer, another Chrome profile, or this
one before a reinstallation. There is no button; ask Greg to move the approval here, then click the
icon again. If it says "Install the current Beethoven from the lab's private listing.", your copy is
older than the service accepts: update it from the private listing's page.

If it says "This installation of Beethoven is already set up for another account.", this browser's
Beethoven was first used with someone else's account, and one installation serves one account. Use
your own installation, or ask Greg to release this one for you.

## What the extension sends the maintainer, so you know

Only the approval check: the account name your portal shows for you, your portal's hostname, the
product name, the extension's version and the random identifier of this installation, answered yes
or no; the service records those with the time, a salted hash of your network address and the
answer, and keeps which installation your approval is bound to. Once a day it also downloads,
without cookies, two small files from the maintainer's website (the service address and the signed
list of withdrawn versions), which carry nothing about you. No usage data, no error reports, no
activation. The full statement is `PRIVACY.md` (version 8), also at
`https://openspineconsortium.com/beethoven/privacy.html`.

## What to send when something does not work

- The one line the panel shows (its step number and status).
- Under *Details*: *Run the checks*, then the list as it stands (a screenshot is fine).
- The audit log's export from *Details* or the setup page; it holds one line per request the
  extension made to your portal and never what you typed.
- If a worker started: the end of the worker's log under *Details*.

Nothing you send this way contains a credential: the extension has none of yours to send.
