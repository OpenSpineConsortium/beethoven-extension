# Beethoven privacy statement

Version 8, 2026-09-30. Part of the Beethoven Trial Edition License Agreement (LICENSE.txt) and of
any Full Edition agreement that names it. You can save and print this text; it is also at
`https://openspineconsortium.com/beethoven/privacy.html`.

Who collects: Gregory Schwing, trading as OpenSpineConsortium ("Licensor"), the maintainer of
Beethoven. Questions and requests: the notice address on the support page at
`https://openspineconsortium.com/beethoven/support.html`. Beethoven is licensed to individuals; it
is not provided by or on behalf of any school, and Licensor is not acting for one.

Beethoven is a browser extension that starts, watches and stops a job in your own cluster account
through your university's Open OnDemand portal, and a set of scripts (the framework) that runs in
that account. The job runs Claude Code, which you signed in to yourself. This statement says what
stays in your browser, what your portal sees, what happens when you sign in to Claude, what
Anthropic receives, what Licensor receives, and what is never collected.

## What stays in your browser

| Data | Where | Why | You control it by |
|---|---|---|---|
| The portal address you connected from its tab or typed, and the one website you granted the extension access to | the extension's own storage (`storage.local`) | to reach your portal | the options page; removing the site permission in your browser; uninstalling |
| Your preferences: the shell host and site profile name, the worker's name and permission mode, whether your worker starts by itself when your portal tab connects, and whether the claude.ai tab opens by itself when your worker connects (in this build both are on until you turn them off; the options page says so where each is switched) | `storage.local` | convenience | the options page |
| The account name your portal's dashboard showed for your session, and the answer of the last approval check: yes or no, the time it was given, the portal it was given for and, when it was no, the address of the page where you can ask for access and the reason the service gave, if it gave one (your account is set up on another installation; this installation is set up for another account; this version is too old) | `storage.local` | to know which account to ask about, and to keep working for a day without asking again | disconnecting the portal on the options page; uninstalling |
| Your acceptance of the agreement: its version and text hashes, the statements you ticked with their wording, your typed name, the time, and the exact texts shown | `storage.local`, with a copy you can save | to prove the agreement and its terms, for you and for Licensor | it is yours to read, copy and print; uninstalling removes it |
| Your statement about a worker's workspace: that it holds none of the restricted data the notice names, and that Remote Control will be enabled for that worker; kept as the workspace name, the exact text and its version, the time, and the time the marker below was written, one record per workspace | `storage.local` | so the notice is shown at every start but you are not asked to tick it again for the same workspace | making it again for a workspace on the options page; uninstalling. It is asked again when the text or the workspace changes |
| A note of the last sign-in to Claude made from this browser: the time, and what Claude Code's own report said afterwards (the account it is signed in as and its plan) | `storage.local` | so the sign-in step is not offered again while a newer check has not yet confirmed it | uninstalling |
| The claude.ai links to your sessions that the extension already opened by itself, so each opens once; a note of the check job it submitted by itself (the time and the job number), so it is not submitted again while it runs; and a note of the install it ran by itself in your cluster account (the time, whether it succeeded, which shared copy of your lab's it used, and one line when it could not use that copy), so a failing one is not repeated in a loop | `storage.local` | so the automatic steps do not repeat themselves | uninstalling |
| Your tick on the optional step *Connect Google Drive in claude.ai*: a yes or no. The step opens that claude.ai settings page in a new tab; the extension does nothing on it | `storage.local` | so the checklist remembers what you finished | untick it; uninstalling |
| The last good copy of the withdrawn-versions list, the address of Licensor's access service as read once a day from a small file on Licensor's website, and a random installation identifier the extension makes for itself when you accept the agreement, from the browser's random number generator and from nothing about your device | `storage.local` | to keep working when Licensor's website cannot be reached; to know where the approval check goes; to name your acceptance record and the marker below without naming you; and, sent in the approval check, so that an approval is used from one installation (see *What Licensor receives*) | uninstalling (a reinstallation makes a new identifier) |
| Connection state while a job runs: the worker's name and its folder on the cluster, the job number, what the worker's status file last said (its state, its one-line message, the node, the account and plan Claude Code reports, whether your Remote Control answer is on record), the session name and its claude.ai link, the last 4,000 characters of the worker's own log (Claude Code's registration output as the job printed it), the portal tab the extension talks to and the tab the icon was clicked from, when your portal sign-in was last seen, what the last automatic start did, and the last results of its checks | `storage.session`, cleared when the browser closes | to talk to your portal during this session, to show you the link, and to show you under *Details* what your worker printed | closing the browser |
| The audit log: one line per request the extension made to your portal (time, endpoint, method, job number, byte count, outcome). The sign-in sitting is one line with how many bytes were read and typed; what you typed is never in it | the extension's own storage on your device | so you can see exactly what the extension did | the log under *Details* and on the options page (view, export, clear); it is never transmitted |

There is no durable secret in the extension's storage, and there is no key: your own sign-in to your
portal identifies you. The extension never reads your portal's sign-in cookie: your browser attaches
it to requests to that one website, as it does for the portal's own pages. The one thing it reads
about you from the portal is the account name the portal's own dashboard page shows for your
session; there is nowhere to type a different one. The extension never reads, stores, copies or
relays a Claude credential: Claude Code keeps its own sign-in in your cluster account, and the
framework reads only Claude Code's yes-or-no answer about whether it is signed in.

## What goes to your own cluster account

The framework's settings, the job files, a random per-job token in a file only you can read, and the
job's status files. The framework's scripts are not copied into your account: they stay in the one
shared copy your university's lab keeps on the cluster, and a small launcher that runs that copy,
and a one-line note of where that copy is, take their place. The install also adds a marked block of
a few lines to `~/.bashrc` so that a terminal finds the tool. Nothing about your approval goes
there. When you make the statement above for a worker, the extension also writes one small file in
your account (the framework's own marker, `~/.hpcworker/consent`), one line: the word yes, the time,
and the random installation identifier from your browser. Your worker gives that answer to Claude
Code when Claude Code asks its one-time question "Enable Remote Control?", and after the first
session Claude Code's own record of your answer takes over. Everything there is in your own account
under your institution's rules; Licensor has no access to it.

## What your portal sees

The extension makes requests to your university's Open OnDemand portal, and only to it, using the
sign-in your browser already holds: waking the portal's own web server up if it is asleep, opening
the portal's shell once to submit a job and closing it, holding the shell open once for the sign-in
sitting described below and closing it when the sitting ends, listing and reading files in your own
account through the portal's Files app (and reading the version number of your lab's shared copy of
the framework) and writing the marker there, listing your jobs, and cancelling a job when you ask.
Your institution's logs record those requests as they record any use of the portal; the shell's page
token appears in the portal's access log, as it does when you open the shell yourself. The extension
never signs in for you and never touches a multi-factor step. It reads no other website and makes no
request to claude.ai. When it opens a claude.ai page (your session's link when your worker connects,
or the connectors page from the optional step) or Anthropic's sign-in page, it opens it in a new
browser tab, as a bookmark would, and runs nothing there.

## What happens when you sign in to Claude

Claude Code itself does the sign-in, inside your job's container on a compute node, through
Anthropic's own paste-code flow. The extension starts that sitting for you through the portal's
shell, reads the short lines the framework prints (that the sitting is running, the address of
Anthropic's sign-in page, that it is waiting for the code, and Claude Code's own yes-or-no answer
afterwards with the account and plan it reports), opens the sign-in page in a new tab, and shows you
one box. Claude Code's own screen is never sent to your browser: it stays in a temporary file on the
compute node that only you can read and that is removed when the sitting ends. You sign in on
Anthropic's page with your own account, click *Authorize*, and paste the code the page shows into
that box. The extension types the code once into the sitting on your cluster, through the same
portal connection, and then forgets it: the code is not kept in any storage, not written to the
audit log (which records only how many bytes were typed) and not sent to Licensor or anywhere else;
on the compute node it is passed to Claude Code without being echoed. The extension never reads the
sign-in page, never reads your clipboard, and never sees the credential Claude Code makes from the
code; that credential stays in Claude Code's own folder in your cluster account. The sitting ends by
itself within ten minutes of starting on the compute node, and the wait for a compute node is
bounded too (the extension closes the connection after fifteen minutes at the latest); if it ends
without a sign-in, nothing is kept and you can start it again.

## What Anthropic receives

Through Claude Code, which you signed in to with your own account: your prompts, the files the
worker reads, and every command's output. While you are connected through claude.ai or the Claude
app, the session transcript, including your messages, Claude's responses and tool activity, is also
stored on Anthropic's servers. On a personal plan Anthropic retains it five years if you have model
training on and 30 days otherwise. No BAA covers a personal plan. Remote Control usage draws from
your plan's shared limit. Anthropic's terms and privacy policy apply to that data, not this
statement. The extension shows these facts before each job start.

## What Licensor receives

**From the extension: the approval check, and two small files.** The extension makes no request to
Licensor before you have accepted the agreement. After that:

- **The approval check.** Once your portal is connected and the extension has read your account name
  from the portal's dashboard, it asks Licensor's access service whether that account is approved:
  when you connect, about once a day while it is in use, and again when you click the icon after a
  day has passed or after a no. The request is sent without cookies, over an encrypted connection,
  to the address named in the services file below (Licensor's access service,
  `https://beethoven-access.openspineconsortium.workers.dev`), and carries: the account name your
  portal shows for your session (never one you typed; there is nowhere to type one), your portal's
  hostname, the product name (`bridge`), the extension's version and the random installation
  identifier described above; like any request, it arrives at a time. The service answers yes or no,
  and nothing else about you or anyone else. A no may carry one of three reasons: that your account
  is already set up on another installation (the panel then says so and offers no button: your lab
  lead moves the approval), that this installation is already set up for another account (the panel
  says so and offers no button: your lab lead releases it), or that this version is too old (the
  panel asks you to install the current one from the lab's private listing). The extension keeps a
  yes for up to a day, and for up to seven days when the service cannot be reached, so an outage on
  Licensor's side does not stop your work; it keeps a no for ten minutes, and while the answer is no
  it starts no worker and, unless the reason is one of those three, offers you a button to ask for
  access.
- **Two files, once a day.** `https://openspineconsortium.com/beethoven/services.json` (the address
  of the access service) and `https://openspineconsortium.com/beethoven/killlist.json` (the signed
  list of withdrawn extension versions). Both requests are sent without cookies and carry nothing
  about you beyond what any web request carries (your network address, which the web host's ordinary
  server logs may record for a short time); the files hold addresses and the list only.

Those are the only requests the extension ever makes to Licensor. In particular:

- there is no key and no activation step; your institution's own sign-in identifies you, and the
  extension never reads your portal's cookie or password;
- the extension sends no error reports, no crash reports and no usage data; it has no code for them
  and no address to send them to;
- your acceptance record, your statements, your audit log and your settings stay in your browser.

**What Licensor records from each check.** The account name, the portal hostname, the product, the
version, the time, a salted hash of your network address (the address itself is not kept) and the
answer given. These lines sit with your access record.

**One approved account, one installation.** The first installation that asks about an approved
account is bound to it: the service keeps that installation's identifier with the product, the
version and the times it first and last asked, and, for that identifier, the account it is bound to.
A check for the same account from any other installation (another computer, another browser profile,
a reinstallation) is refused, and so is a check from that installation for any other account; the
service counts such refusals and keeps the times of the first and the last one and the first eight
characters of a one-way hash of the refused installation's identifier. When another installation
asks about an account, the service e-mails Licensor, at most once a day per account, with a link
that can move the approval to that installation, so that Licensor can move it or withdraw it. The
identifier is random: it is not read from your device or derived from it, and Licensor cannot tell
from it which computer it is on.

**The *Ask for access* button.** When the answer is no, the panel's one button opens Licensor's
request page (`https://openspineconsortium.com/beethoven/request.html`) in a new tab with your
account name in the page's address, so the form is filled in for you. As with any page you open,
your browser's history and the web host's ordinary server logs may record that address.

**Access requests.** If you ask for access on the request page (a web page, not the extension), the
request form records what you enter: your account name, your name, your institutional e-mail, the
Google account at which you want the invitation to Beethoven's private listing on the Chrome Web
Store, what you will use Beethoven for, your CV if you attach one (PDF or Word, 5 MB at most), and
the time; it also tells the service that it is Beethoven's request page, which Licensor's notice of
the request shows. That notice is an e-mail to Licensor carrying those items, with a link to the CV
that works for 14 days instead of the CV itself. When mailbox confirmation is on (the request page
says so after you send), the service first e-mails a link to your university mailbox and passes the
request on when you open it, and records the time you did; otherwise the notice says that the
mailbox was not confirmed. If you are approved for Beethoven, Licensor adds that Google account to
the Google Group whose members may open the private listing; Google then holds it as a member of
that group, under Google's own terms.

**Your access record.** Licensor's records hold the approval and withdrawal decisions about your
account (an approval is for Beethoven, or for membership of Licensor's lab only), with the name and
e-mail you gave when you asked, their dates, the installation your approval is bound to, and the
check lines above. The same approved list serves Licensor's other product, an extension for VS Code,
so one approval covers both.

**A notice under the agreement**, if you send one: what you write in it, kept with your access
record.

## What is never collected

Stated in the negative because reviewers read for what is absent: the extension does not collect
command text, file paths, prompt content, job output, portal cookies or tokens, the code you paste
to sign in to Claude, browsing activity, or anything from claude.ai or any Anthropic page. It reads
no hardware address, serial number or other identifier from your device and derives none from it:
the one identifier of the installation is the random number described above. It sends Licensor no
error or crash reports, no usage data and no activation request; the approval check above is the
only thing it sends about you. It has no access to claude.ai, requests no `cookies`, `tabs`,
`webRequest`, `nativeMessaging`, `debugger`, `identity` or `clipboardRead` permission, and runs no
code fetched from anywhere.

## How Licensor uses and keeps it

A CV attached to a request is deleted twelve months after Licensor decides on the request (twelve
months after the request, if no decision is made), or at once if the request is refused or the
approval withdrawn. The other access records, including the check lines and the installation record,
are kept for the life of your access and six years after, to prove the agreement and for accounting
and disputes. Nothing is sold or used for advertising. The web host that serves the two daily files
sees the requests any web server sees and nothing more. Processors acting for Licensor (hosting; the
access service; the e-mail service that carries its notices) see only what they need to run the
service. Licensor's use of data complies with the Chrome Web Store's Limited Use requirements.

## Security and breaches

Licensor keeps reasonable security measures for the systems that hold access records, and will
notify you as Michigan law (MCL 445.72) requires if a breach affects your personal information held
by Licensor.

## Your choices and rights

Remove the site permission or uninstall the extension at any time; ask Licensor to move your
approval to another installation, or for a copy or deletion of your access records (deletion of your
access record ends your approval and with it the license). Michigan residents and residents of other
states may have further rights under their state's laws; Licensor honours requests it is obliged to
honour and answers others where it reasonably can. Beethoven is offered in the United States.

## Children

Beethoven is for adults, or minors with a parent's or guardian's consent (LICENSE.txt section 21).

## Changes

A new version of this statement ships with the Beethoven version it applies to and is shown for
acceptance when it changes materially.

Version 8 (2026-09-30, Beethoven 8.0.0): the extension no longer carries the framework's scripts and
never copies them into your account. It works only with the one shared copy your university's lab
keeps on the cluster; where there is none, or your account cannot use it, it says so and names whom
to ask, and uploads nothing. The note of the install it ran no longer counts uploaded files. One
approved account, one installation: the approval check now also sends the random installation
identifier the extension already kept, and the service binds an approval to the first installation
that asks, refuses any other until Licensor moves the approval, refuses that installation for any
other account, and keeps what *One approved account, one installation* says. Beethoven is offered
only through a private listing on the Chrome Web Store. The request page now also asks for the
Google account that receives the invitation to that listing, takes an optional CV (deleted twelve
months after the decision), and may ask you to confirm your university mailbox.

Version 7 (2026-09-29, Beethoven 7.0.0): the product has a new name, Beethoven, and new addresses.
Its pages, the support page and the request page are under
`https://openspineconsortium.com/beethoven/`; the two daily files are
`https://openspineconsortium.com/beethoven/services.json` and
`https://openspineconsortium.com/beethoven/killlist.json`; the access service answers at
`https://beethoven-access.openspineconsortium.workers.dev`, a second name for the same service,
which keeps the same records. The request page now also tells the service which product's page a
request was sent from. Nothing about the data changed: the extension keeps, sends and receives the
same items as under version 6, and Licensor records the same.

Version 6 (2026-09-29, extension 5.0.0): where your institution's lab keeps one shared, read-only
copy of the cluster-side scripts, the extension no longer copies them into your account; it writes a
small launcher, a one-line marker naming the lab's copy and your profile, and reads that copy's
version file through your portal. Nothing new leaves your device and nothing new reaches Licensor.
The install note the extension keeps is also written when you press "Set up the cluster again" under
Details.

Version 5 (2026-09-29, extension 4.0.0): there are no license keys any more, and nothing to type or
paste. Your own sign-in to your portal identifies you, by the account name the portal's dashboard
shows; the extension confirms with Licensor's access service that this account is approved when you
connect, when you click the icon and about once a day, and that check is now the one request that
carries anything about you (the account name, the portal's hostname, the product and its version;
Licensor records those with the time, a salted hash of the network address and the answer). The
daily list withdraws versions only; the extension also reads a daily services file for the service's
address. The table rows for the key and the identifier are replaced by the account name and the last
answer; the *Ask for access* button, which carries your account name in the page's address, is
named. Nothing else changed.

Version 4 (2026-09-29): the statement now describes the software as built. Earlier versions
described an activation request and optional error reports; the extension has neither (there is no
code for them and no address to send them to), so the sections that described them are removed and
the section "What Licensor receives" names the one request the extension makes to Licensor, the
daily withdrawn-keys list. The record Licensor keeps when it issues a key is named for what it is.
Nothing new leaves your device; less was ever leaving it than the earlier text said.

Version 3 (2026-09-29): the extension now starts the Claude sign-in sitting for you and takes the
pasted code in its own panel (the section "What happens when you sign in to Claude" is new); your
statement about a worker's workspace is kept per workspace in the browser instead of per browser
session, and now includes your answer to Claude Code's Remote Control question, which the extension
records in one marker file in your cluster account; the notes the extension keeps so its automatic
steps do not repeat (the last sign-in it saw, the links it opened, the check job it submitted, the
install it ran) are listed; the session-state row names everything the run record holds, including
the last 4,000 characters of the worker's own log; the preference "open claude.ai when my worker
connects" is added; the audit-log row says what it never holds. Nothing new leaves your device or
your accounts.

Version 2 (2026-09-29): added the checklist tick, the start-by-itself preference and the session's
claude.ai link to the table of what stays in your browser, and named the withdrawn-keys copy and the
installation identifier that were already kept there. Nothing new leaves your device.
