# Ashley Bridge privacy statement

Version 4, 2026-09-29. Part of the Ashley Bridge Trial Edition License Agreement (LICENSE.txt) and of
any Full Edition agreement that names it. You can save and print this text; it is also on the Ashley
support page.

Who collects: Gregory Schwing, trading as OpenSpineConsortium ("Licensor"), the maintainer of Ashley
Bridge. Questions and requests: the notice address on the Ashley support page. Ashley Bridge is
licensed to individuals; it is not provided by or on behalf of any school, and Licensor is not acting
for one.

Ashley Bridge is a browser extension that starts, watches and stops a job in your own cluster account
through your university's Open OnDemand portal, and a set of scripts (the framework) in that account.
The job runs Claude Code, which you signed in to yourself. This statement says what stays in your
browser, what your portal sees, what happens when you sign in to Claude, what Anthropic receives, what
Licensor receives, and what is never collected.

## What stays in your browser

| Data | Where | Why | You control it by |
|---|---|---|---|
| The portal address you connected from its tab or typed, and the one website you granted the extension access to | the extension's own storage (`storage.local`) | to reach your portal | the options page; removing the site permission in your browser; uninstalling |
| Your preferences: the shell host and site profile name, the worker's name and permission mode, whether your worker starts by itself when your portal tab connects, and whether the claude.ai tab opens by itself when your worker connects (in this build both are on until you turn them off; the options page says so where each is switched) | `storage.local` | convenience | the options page |
| Your license key and the institutional identifier you entered | `storage.local` | to check that the license names you | the options page (remove the key); uninstalling |
| Your acceptance of the agreement: its version and text hashes, the statements you ticked with their wording, your typed name, the time, and the exact texts shown | `storage.local`, with a copy you can save | to prove the agreement and its terms, for you and for Licensor | it is yours to read, copy and print; uninstalling removes it |
| Your statement about a worker's workspace: that it holds none of the restricted data the notice names, and that Remote Control will be enabled for that worker; kept as the workspace name, the exact text and its version, the time, and the time the marker below was written, one record per workspace | `storage.local` | so the notice is shown at every start but you are not asked to tick it again for the same workspace | making it again for a workspace on the options page; uninstalling. It is asked again when the text or the workspace changes |
| A note of the last sign-in to Claude made from this browser: the time, and what Claude Code's own report said afterwards (the account it is signed in as and its plan) | `storage.local` | so the sign-in step is not offered again while a newer check has not yet confirmed it | uninstalling |
| The claude.ai links to your sessions that the extension already opened by itself, so each opens once; a note of the check job it submitted by itself (the time and the job number), so it is not submitted again while it runs; and a note of the install or update it ran by itself in your cluster account (the time, whether it succeeded, and how many files it uploaded), so a failing one is not repeated in a loop | `storage.local` | so the automatic steps do not repeat themselves | uninstalling |
| Your tick on the optional step *Connect Google Drive in claude.ai*: a yes or no. The step opens that claude.ai settings page in a new tab; the extension does nothing on it | `storage.local` | so the checklist remembers what you finished | untick it; uninstalling |
| The last good copy of the withdrawn-keys list, and a random installation identifier created in your browser | `storage.local` | to keep working when Licensor's service cannot be reached; to name your acceptance record and the marker below without naming you | uninstalling |
| Connection state while a job runs: the worker's name and its folder on the cluster, the job number, what the worker's status file last said (its state, its one-line message, the node, the account and plan Claude Code reports, whether your Remote Control answer is on record), the session name and its claude.ai link, the last 4,000 characters of the worker's own log (Claude Code's registration output as the job printed it), the portal tab the extension talks to and the tab the icon was clicked from, when your portal sign-in was last seen, what the last automatic start did, and the last results of its checks | `storage.session`, cleared when the browser closes | to talk to your portal during this session, to show you the link, and to show you under *Details* what your worker printed | closing the browser |
| The audit log: one line per request the extension made to your portal (time, endpoint, method, job number, byte count, outcome). The sign-in sitting is one line with how many bytes were read and typed; what you typed is never in it | the extension's own storage on your device | so you can see exactly what the extension did | the log under *Details* and on the options page (view, export, clear); it is never transmitted |

There is no durable secret in the extension's storage. The extension never reads your portal's sign-in
cookie: your browser attaches it to requests to that one website, as it does for the portal's own
pages. The extension never reads, stores, copies or relays a Claude credential: Claude Code keeps its
own sign-in in your cluster account, and the framework reads only Claude Code's yes-or-no answer
about whether it is signed in.

## What goes to your own cluster account

Your license key, the framework's scripts and settings, the job files, a random per-job token in a
file only you can read, and the job's status files. When you make the statement above for a worker,
the extension also writes one small file in your account (the framework's own marker,
`~/.hpcworker/consent`), one line: the word yes, the time, and the random installation identifier
from your browser. Your worker gives that answer to Claude Code when Claude Code asks its one-time
question "Enable Remote Control?", and after the first session Claude Code's own record of your answer
takes over. Everything there is in your own account under your institution's rules; Licensor has no
access to it.

## What your portal sees

The extension makes requests to your university's Open OnDemand portal, and only to it, using the
sign-in your browser already holds: waking the portal's own web server up if it is asleep, opening the
portal's shell once to submit a job and closing it, holding the shell open once for the sign-in
sitting described below and closing it when the sitting ends, listing and reading files in your own
account through the portal's Files app and writing the framework's files and the marker there, listing
your jobs, and cancelling a job when you ask. Your institution's logs record those requests as they
record any use of the portal; the shell's page token appears in the portal's access log, as it does
when you open the shell yourself. The extension never signs in for you and never touches a
multi-factor step. It reads no other website and makes no request to claude.ai. When it opens a
claude.ai page (your session's link when your worker connects, or the connectors page from the
optional step) or Anthropic's sign-in page, it opens it in a new browser tab, as a bookmark would, and
runs nothing there.

## What happens when you sign in to Claude

Claude Code itself does the sign-in, inside your job's container on a compute node, through
Anthropic's own paste-code flow. The extension starts that sitting for you through the portal's
shell, reads the short lines the framework prints (that the sitting is running, the address of
Anthropic's sign-in page, that it is waiting for the code, and Claude Code's own yes-or-no answer
afterwards with the account and plan it reports), opens the sign-in page in a new tab, and shows you
one box. Claude Code's own screen is never sent to your browser: it stays in a temporary file on the
compute node that only you can read and that is removed when the sitting ends. You sign in on
Anthropic's page with your own account, click *Authorize*, and paste the code the page shows into that
box. The extension types the code once into the sitting on your cluster, through the same portal
connection, and then forgets it: the code is not kept in any storage, not written to the audit log
(which records only how many bytes were typed) and not sent to Licensor or anywhere else; on the
compute node it is passed to Claude Code without being echoed. The extension never reads the sign-in
page, never reads your clipboard, and never sees the credential Claude Code makes from the code; that
credential stays in Claude Code's own folder in your cluster account. The sitting ends by itself
within ten minutes of starting on the compute node, and the wait for a compute node is bounded too
(the extension closes the connection after fifteen minutes at the latest); if it ends without a
sign-in, nothing is kept and you can start it again.

## What Anthropic receives

Through Claude Code, which you signed in to with your own account: your prompts, the files the worker
reads, and every command's output. While you are connected through claude.ai or the Claude app, the
session transcript, including your messages, Claude's responses and tool activity, is also stored on
Anthropic's servers. On a personal plan Anthropic retains it five years if you have model training on
and 30 days otherwise. No BAA covers a personal plan. Remote Control usage draws from your plan's shared
limit. Anthropic's terms and privacy policy apply to that data, not this statement. The extension shows
these facts before each job start.

## What Licensor receives

**From the extension: the withdrawn-keys request, and nothing else.** Once a day the extension
fetches a signed list of withdrawn keys and withdrawn versions from Licensor's website, at
`https://openspineconsortium.com/ashley/bridge-killlist.json`. The request is sent without cookies
and carries nothing about you beyond what any web request carries (your network address, which the
web host's ordinary server logs may record for a short time); the file holds the list only; the
extension makes no request to Licensor before you have accepted the agreement. That is the only
request the extension ever makes to Licensor. In particular:

- your license key is checked inside your browser, against public keys built into the extension;
  nothing is sent to check it, and there is no activation step;
- the extension sends no error reports, no crash reports and no usage data; it has no code for them
  and no address to send them to;
- your acceptance record, your statements, your audit log and your settings stay in your browser.

**Your license record.** When Licensor issues your key, Licensor's own records hold the key's id, the
name and institutional identifier it names, the e-mail it was sent to, its dates, and any withdrawal
decision. Those records come from your access request and from the person who issued the key, not
from the extension.

**Access requests.** If you ask for access on the Ashley support site (a web page, not the
extension), the request form records what you enter: institutional identifier, name, institutional
e-mail, what you will use Ashley Bridge for, and the time.

**A notice under the agreement**, if you send one: what you write in it, kept with your license record.

## What is never collected

Stated in the negative because reviewers read for what is absent: the extension does not collect
command text, file paths, prompt content, job output, portal cookies or tokens, the code you paste to
sign in to Claude, browsing activity, or anything from claude.ai or any Anthropic page. It sends
Licensor no error or crash reports, no usage data and no activation request. It has no access to
claude.ai, requests no `cookies`, `tabs`, `webRequest`, `nativeMessaging`, `debugger`, `identity` or
`clipboardRead` permission, and runs no code fetched from anywhere.

## How Licensor uses and keeps it

License and access records are kept for the life of the license and six years after, to prove the
agreement and for accounting and disputes. Nothing is sold or used for advertising. The web host that
serves the withdrawn-keys list sees the requests any web server sees and nothing more. Processors
acting for Licensor (hosting, the access-request service) see only what they need to run the service.
Licensor's use of data complies with the Chrome Web Store's Limited Use requirements.

## Security and breaches

Licensor keeps reasonable security measures for the systems that hold license and access records,
and will notify you as Michigan law (MCL 445.72) requires if a breach affects your personal
information held by Licensor.

## Your choices and rights

Remove the site permission or uninstall the extension at any time; ask Licensor for a copy or
deletion of your license or access records (deletion of a license record ends the license). Michigan residents and residents of other states may have further rights under their
state's laws; Licensor honours requests it is obliged to honour and answers others where it reasonably
can. Ashley Bridge is offered in the United States.

## Children

Ashley Bridge is for adults, or minors with a parent's or guardian's consent (LICENSE.txt section 21).

## Changes

A new version of this statement ships with the Ashley Bridge version it applies to and is shown for
acceptance when it changes materially.

Version 4 (2026-09-29): the statement now describes the software as built. Earlier versions described
an activation request and optional error reports; the extension has neither (there is no code for
them and no address to send them to), so the sections that described them are removed and the section
"What Licensor receives" names the one request the extension makes to Licensor, the daily
withdrawn-keys list. The record Licensor keeps when it issues a key is named for what it is. Nothing
new leaves your device; less was ever leaving it than the earlier text said.

Version 3 (2026-09-29): the extension now starts the Claude sign-in sitting for you and takes the
pasted code in its own panel (the section "What happens when you sign in to Claude" is new); your
statement about a worker's workspace is kept per workspace in the browser instead of per browser
session, and now includes your answer to Claude Code's Remote Control question, which the extension
records in one marker file in your cluster account; the notes the extension keeps so its automatic
steps do not repeat (the last sign-in it saw, the links it opened, the check job it submitted, the
install it ran) are listed; the session-state row names everything the run record holds, including the last 4,000
characters of the worker's own log; the preference "open claude.ai when my worker connects" is added;
the audit-log row says what it never holds. Nothing new leaves your device or your accounts.

Version 2 (2026-09-29): added the checklist tick, the start-by-itself preference and the session's
claude.ai link to the table of what stays in your browser, and named the withdrawn-keys copy and the
installation identifier that were already kept there. Nothing new leaves your device.
