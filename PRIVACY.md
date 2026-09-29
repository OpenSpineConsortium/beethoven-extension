# Ashley Bridge privacy statement

Version 2, 2026-09-29. Part of the Ashley Bridge Trial Edition License Agreement (LICENSE.txt) and of
any Full Edition agreement that names it. You can save and print this text; it is also on the Ashley
support page.

Who collects: Gregory Schwing, trading as OpenSpineConsortium ("Licensor"), the maintainer of Ashley
Bridge. Questions and requests: the notice address on the Ashley support page. Ashley Bridge is
licensed to individuals; it is not provided by or on behalf of any school, and Licensor is not acting
for one.

Ashley Bridge is a browser extension that starts, watches and stops a job in your own cluster account
through your university's Open OnDemand portal, and a set of scripts (the framework) in that account.
The job runs Claude Code, which you signed in to yourself. This statement says what stays in your
browser, what your portal sees, what Anthropic receives, what Licensor receives, and what is never
collected.

## What stays in your browser

| Data | Where | Why | You control it by |
|---|---|---|---|
| The portal address you typed and the one website you granted the extension access to | the extension's own storage (`storage.local`) | to reach your portal | the extension's settings page; removing the site permission in your browser; uninstalling |
| Your preferences (which panel, which partition, your idle timeout, and whether your worker starts by itself when you open your portal, which is off unless you turn it on) | `storage.local` | convenience | settings page |
| Your license key and the institutional identifier you entered | `storage.local` | to check that the license names you | the license page (remove the key); uninstalling |
| Your acceptance of the agreement: its version and text hashes, the statements you ticked with their wording, your typed name, the time, and the exact texts shown | `storage.local`, with a copy you can save | to prove the agreement and its terms, for you and for Licensor | it is yours to read, copy and print; uninstalling removes it |
| Your tick on the optional step *Connect Google Drive in claude.ai*: a yes or no. The step opens that claude.ai settings page in a new tab; the extension does nothing on it | `storage.local` | so the checklist remembers what you finished | untick it; uninstalling |
| The last good copy of the withdrawn-keys list, and a random installation identifier created in your browser | `storage.local` | to keep working when Licensor's service cannot be reached; to name your acceptance record without naming you | uninstalling |
| Connection state while a job runs: the job number, the session name and its claude.ai link, and your acknowledgement of the data notice for this browser session | `storage.session`, cleared when the browser closes | to talk to your portal during this session and to show you the link | closing the browser |
| The audit log: one line per request the extension made to your portal (time, endpoint, method, job number, byte count, outcome) | the extension's own storage on your device | so you can see exactly what the extension did | the log page (view, export, clear); it is never transmitted |
| Copies of every error report prepared, sent or not | the extension's own storage | so you can read exactly what left your device | the error-reports page |

There is no durable secret in the extension's storage. The extension never reads your portal's sign-in
cookie: your browser attaches it to requests to that one website, as it does for the portal's own
pages. The extension never reads, stores, copies or relays a Claude credential: Claude Code keeps its
own sign-in in your cluster account, and the framework reads only Claude Code's yes-or-no answer
about whether it is signed in.

## What goes to your own cluster account

Your license key, the framework's scripts and settings, the job files, a random per-job token in a
file only you can read, and the job's status files. Everything there is in your own account under
your institution's rules; Licensor has no access to it.

## What your portal sees

The extension makes requests to your university's Open OnDemand portal, and only to it, using the
sign-in your browser already holds: opening the portal's shell once to submit a job and closing it,
reading and writing files in your own account through the portal's Files app, listing your jobs, and
cancelling a job when you ask. Your institution's logs record those requests as they record any use of
the portal; the shell's page token appears in the portal's access log, as it does when you open the
shell yourself. The extension never signs in for you and never touches a multi-factor step. It reads no
other website and makes no request to claude.ai. When you click *Open in Claude* or *Connect Google
Drive in claude.ai*, it opens that claude.ai page in a new browser tab, as a bookmark would, and runs
nothing there.

## What Anthropic receives

Through Claude Code, which you signed in to with your own account: your prompts, the files the worker
reads, and every command's output. While you are connected through claude.ai or the Claude app, the
session transcript, including your messages, Claude's responses and tool activity, is also stored on
Anthropic's servers. On a personal plan Anthropic retains it five years if you have model training on
and 30 days otherwise. No BAA covers a personal plan. Remote Control usage draws from your plan's shared
limit. Anthropic's terms and privacy policy apply to that data, not this statement. The extension shows
these facts before each job start.

## What may go to Licensor

**Activation.** When the extension obtains or renews your key it sends Licensor's access service the
key's id, the institutional identifier you entered or a hash of it, the extension's version, the time
and your operating system family. The service records those with the issued key, its dates, and the
approval and withdrawal decisions about you.

**Access requests.** If you ask for access on the Ashley support site, the request form records what
you enter: institutional identifier, name, institutional e-mail, what you will use Ashley Bridge for,
and the time.

**The withdrawn-keys list.** Once a day the extension fetches a signed list of withdrawn keys and
withdrawn versions from Licensor's service. The request carries nothing about you beyond what any web
request carries (your network address); the file holds the list only; the extension makes no request
to Licensor before you have accepted the agreement.

**Error reports, only if you allow them.** When one of the extension's own checks fails or is
repaired, or the extension crashes, and only if you have turned reports on, and only if a report
address is configured, the extension sends one report per distinct failure per day. It contains:

- extension and framework versions, browser and operating system family;
- a random installation identifier created in your browser (not derived from you or the machine);
- the time of the check;
- for each check: its id, verdict and duration;
- for failing or repaired checks: the check's message, and the last error lines of the extension's own
  log, with e-mail addresses, institutional identifiers, file paths, hostnames, network addresses,
  job numbers and anything token-shaped replaced by placeholders;
- a hash of the failing checks, so the same failure is reported once a day.

It never contains your prompts, files, tokens, institutional identifier, e-mail, portal cookie, command
text, job output or environment values. You choose at first use whether to send reports, and can change
the choice any time on the settings page, which also shows what a report contains and opens the copies
kept on your device.

**A notice under the agreement**, if you send one: what you write in it, kept with your license record.

## What is never collected

Stated in the negative because reviewers read for what is absent: the extension does not collect
command text, file paths, prompt content, job output, portal cookies or tokens, browsing activity, or
anything from claude.ai. It has no access to claude.ai, requests no `cookies`, `tabs`, `webRequest`,
`nativeMessaging`, `debugger` or `identity` permission, and runs no code fetched from anywhere.

## How Licensor uses and keeps it

Error reports are used to find and fix defects in Ashley Bridge and to decide what to build next.
Reviewing them and drafting fixes is assisted by AI tools running on Licensor's own accounts; every
change proposed that way is reviewed by a person and tested before release. Reports are kept for at
most 365 days. License, trial, activation and acceptance records are kept for the life of the license
and six years after, to prove the agreement and for accounting and disputes. Nothing is sold or used
for advertising. Processors acting for Licensor (hosting, the license service) see only what they need
to run the service. Licensor's use of data complies with the Chrome Web Store's Limited Use
requirements.

## Security and breaches

Licensor keeps reasonable security measures for the systems that hold license records and error
reports, and will notify you as Michigan law (MCL 445.72) requires if a breach affects your personal
information held by Licensor.

## Your choices and rights

Turn error reports off at any time; remove the site permission or uninstall the extension; ask
Licensor for a copy or deletion of your license or report records (deletion of a license record ends
the license). Michigan residents and residents of other states may have further rights under their
state's laws; Licensor honours requests it is obliged to honour and answers others where it reasonably
can. Ashley Bridge is offered in the United States.

## Children

Ashley Bridge is for adults, or minors with a parent's or guardian's consent (LICENSE.txt section 21).

## Changes

A new version of this statement ships with the Ashley Bridge version it applies to and is shown for
acceptance when it changes materially.

Version 2 (2026-09-29): added the checklist tick, the start-by-itself preference and the session's
claude.ai link to the table of what stays in your browser, and named the withdrawn-keys copy and the
installation identifier that were already kept there. Nothing new leaves your device.
