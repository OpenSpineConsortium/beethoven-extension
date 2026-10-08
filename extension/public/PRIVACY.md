# Beethoven privacy statement

Version 12, 2026-10-08. Part of the Beethoven Trial Edition License Agreement (LICENSE.txt) and of
any Full Edition agreement that names it. You can save and print this text; it is also at
`https://openspineconsortium.com/beethoven/privacy.html`.

Who collects: Gregory Schwing, trading as OpenSpineConsortium ("Licensor"), the maintainer of
Beethoven. Questions and requests: the notice address on the support page at
`https://openspineconsortium.com/beethoven/support.html`. Beethoven is licensed to individuals; it
is not provided by or on behalf of any school, and Licensor is not acting for one.

Beethoven is a browser extension that starts, watches and stops a job in your own cluster account
through your university's Open OnDemand portal, in the browser session you have signed in to there,
and a set of scripts (the framework) that runs in your cluster account. The job runs Claude Code,
which you signed in to yourself. This statement says what stays in your browser, what an earlier
version of Beethoven may have left on your computer and in your cluster account, what goes to your
cluster account, what your portal sees, what happens when you sign in to Claude and when the
portal's shell asks for your password, what Anthropic receives, what Licensor receives, and what is
never collected. Beethoven 12.0.0 to 15.0.0 also reached your cluster over a secure shell (ssh)
connection carried by a helper program on your computer, the Bridge, after a sign-in on a sheet of
the extension's own; this version has none of that, reaches your cluster only through your portal,
and never asks for your cluster password.

## What stays in your browser

| Data | Where | Why | You control it by |
|---|---|---|---|
| The portal address (your university's, filled in from the site profile, or one you typed), and the one website you granted the extension access to | the extension's own storage (`storage.local`) | to reach your portal | Settings (in the panel's *More* menu); removing the site permission in your browser; uninstalling |
| Your preferences: the shell host and site profile name, the worker's name and permission mode, whether your worker is kept running, whether claude.ai opens when a worker you started is ready (in this build both are on until you turn them off; Settings says so where each is switched) and your appearance choice | `storage.local` | convenience | Settings |
| The account name your portal's dashboard showed for the session you signed in to, and the answer of the last approval check: yes or no, the time it was given, the portal it was given for and, when it was no, the address of the page where you can ask for access and the reason the service gave, if it gave one (your account is set up on another installation; this installation is set up for another account; this version is too old) | `storage.local` | to know which account to ask about, and to keep working for a day without asking again | *Disconnect* in Settings; uninstalling |
| Only if an earlier version of Beethoven added a key for this computer to your grid account: a note of that, kept once from that version's record on the first run after the update: the account name it recorded, the key's fingerprint, when the key was added, and when the note was written (never the key itself, which is deleted unread) | `storage.local` | so Settings can tell you once that the key is there and that your lab lead can remove it | *Forget* beside that note in Settings (which removes the note and nothing on the grid); uninstalling |
| Your acceptance of the agreement: its version and date, the hashes of the agreement and of this statement as shown, the four-line summary and the sentence shown with the box, that you ticked it, the label of the button, whether you opened the full text and whether you scrolled it to its end, opened it in a tab, saved it or printed it, the time, the version of Beethoven, your browser and the installation identifier, and your account name with the time it was seen, added once your portal first shows it after you agree; an acceptance made with an earlier version of Beethoven is kept beside it, out of force | `storage.local`, with a copy you can save from Settings (*Save your acceptance record*, shown with the installation identifier) | to prove the agreement and its terms, for you and for Licensor | it is yours to read, copy and print; uninstalling removes it |
| Your statement about a worker's workspace, made with the box you tick in the panel before your first worker starts: that you will keep FERPA, IRB, health and export-controlled data out of it, and that Remote Control is turned on for that worker; kept as the workspace name, the sentence and the lines shown with their version, the label of the button, the time, and the time the framework reported writing the marker below, one record per workspace | `storage.local` | so you are not asked to tick it again for the same workspace (a one-line reminder sits beside *Connect* each time) | making it again for a workspace in the panel; uninstalling. It is asked again when the text or the workspace changes |
| A note of the check job submitted from *Details* (the time and the job number), so it is not submitted again while it runs | `storage.local` | so that step does not repeat itself | uninstalling |
| Which claude.ai link the extension opened by itself for a worker you started, so it opens once (kept with the connection state below) | `storage.session`, cleared when the browser closes | so it is not opened twice | closing the browser |
| Your tick on the optional step *Connect Google Drive in claude.ai*: a yes or no. The step opens that claude.ai settings page in a new tab; the extension does nothing on it | `storage.local` | so Settings remembers what you finished | untick it; uninstalling |
| The last good copy of the withdrawn-versions list, the address of Licensor's access service as read once a day from a small file on Licensor's website, and a random installation identifier the extension makes for itself when you accept the agreement, from the browser's random number generator and from nothing about your device | `storage.local` | to keep working when Licensor's website cannot be reached; to know where the approval check goes; to name your acceptance record and the marker below without naming you; and, sent in the approval check, so that an approval is used from one installation (see *What Licensor receives*) | uninstalling (a reinstallation makes a new identifier) |
| Your worker's last known state, kept across browser restarts so the panel can show it, and *Open my session* can work, before you sign in to the grid again: the worker's name, its claude.ai link and session title, its state and when it was seen, since when it has been online and when it renews itself, and the account name the portal showed with it | `storage.local` | so the panel is never blank and your session's link works without the grid or the VPN | uninstalling |
| How the extension reaches your portal (directly from its background, or through a tab it opens), and whether the portal's shell opened without asking for a password, with the time this was last tested | `storage.local` | so it uses the way that works without testing again before every action | uninstalling |
| Small notes for the panel: how long your last five waits for a computer took, in minutes ("Last time: 6 min."); whether the tour was seen, and to its end; when your worker was first seen online in this browser (*Try asking* shows for three days from then), whether the tour began playing below your first wait, and which one-time tips you have seen or dismissed (pinning the toolbar button, *Try asking*, the tour card, the *New session* tip), with when | `storage.local` | so the panel can tell you what to expect and does not repeat itself | uninstalling |
| Connection state during this browser session: the worker's name and its folder on the cluster, the job number, what the worker's files last said (its state, its one-line message, the node, the account and plan Claude Code reports, whether your Remote Control answer is on record, the grid's reason for the wait and its estimate, and when it was asked for, got a computer and came online), the session name and its claude.ai link, the last 4,000 characters of the worker's own log (Claude Code's registration output as the job printed it) and the last lines of its progress log; whether your portal answers and whether you are signed in to it, with the account name it showed and when this was checked; a press that waits until the grid can carry it; the tabs the extension opened itself (the grid sign-in tab, Anthropic's sign-in tab, your claude.ai tab, the portal's terminal tab for the one-time step, and, on a portal that does not share its sign-in, the portal tab it works through), so it can close them or bring them forward; that you pressed *Agree and continue* on the welcome page, for a few minutes, so the panel opening beside it can say what is happening; how far your computer's clock is from the grid's, so the panel's clocks agree with the grid's; and the last results of its checks | `storage.session`, cleared when the browser closes | to talk to your portal during this session, to show you the link, and to show you under *Details* what your worker printed | closing the browser |
| A plain-words list of what the extension did in this browser session, for *Show log* (for example, that you signed in to the grid and as which account, that you were approved, and the plan you signed in to Claude with), at most 200 lines | `storage.session`, cleared when the browser closes | so *Show log* can say what happened, beside your worker's own progress log | closing the browser; *Copy log* copies it only when you press it |
| The audit log: one line per request the extension made to your portal (time, endpoint, method, job number, byte count, outcome). The sign-in sitting is one line with how many bytes were read and typed; what you typed is never in it | the extension's own storage on your device | so you can see exactly what the extension did | the log under *Details* and under *Activity* in Settings (show, export, clear); it is never transmitted |

There is no durable secret in the extension's storage: there is no key of Licensor's, and your own
sign-in to your cluster identifies you. The one-time step below, for when the portal's shell asks
for your password, makes a key in your cluster account, never in your browser. The extension never
reads your portal's sign-in: your browser attaches the sign-in it holds (a cookie, or the sign-in it
keeps after you type into its own box) to requests to that one website, the extension's own
background requests included, until the browser closes. Before you agree to the terms, the extension
sends nothing anywhere. After you agree, it asks your portal's address whether it answers, with
requests that carry no sign-in or cookie and from which it learns only whether an answer came: once
when you agree; every three seconds while a page of Beethoven's is open and the grid is out of
reach, which is while it waits for you to turn on your VPN (GlobalProtect at Wayne State) on the
first run, and later whenever a press of yours waits for the grid; once a minute while no page of
Beethoven's is open and the grid was last out of reach, so that a press you made, and *Keep my
worker running*, go ahead by themselves once the grid answers; and when you press *Try again*. The
one thing it reads about you from the portal is the account name the portal's own dashboard page
shows for your session. The extension never reads, stores, copies or relays a Claude credential:
Claude Code keeps its own sign-in in your cluster account, and the framework reads only Claude
Code's own report of whether it is signed in, with the account and plan that report names. The
extension writes to your clipboard only when you press a *Copy* button and when you open the
portal's terminal for the one-time step below, to put its one line there; it never reads your
clipboard. The one QR code, your session's link for your phone, is drawn on your device, and the
tour is drawn from files in the extension's package; nothing is fetched or sent to show them. The
welcome page's links to your university's pages about its accounts and its VPN and to Anthropic's
plans page, and the link to your university's VPN page on the screen that asks you to turn on your
VPN, open those pages in a new tab only when you choose them, as a bookmark would: the extension
learns nothing of your visit, and those websites see it as they see any visit.

## What an earlier version may have left

Beethoven 12.0.0 to 15.0.0 offered a direct way to your cluster: an ssh connection carried by the
Bridge, a helper program you installed on your computer; a sign-in on the extension's own sheet with
your account name, cluster password and verification code; a key made in your browser, admitted to
your cluster account by one restricted line; and, if you chose it, a passkey to protect that key.
This version has none of it. On its first run after the update, the extension removes from your
browser what that way kept there: the key and what protected it (deleted unread; the extension
cannot use it and never sends it anywhere), the direct way's settings and one-time answers, and the
*Connection* preference. If that version had recorded that it added a line for the key to your
cluster account, the extension keeps one note of that first (the row in the table above), so that
Settings can tell you.

Three things it cannot remove, because they are outside your browser:

- **The Bridge on your computer** stays installed until you remove it: on Windows, Settings, Apps,
  "Beethoven bridge", Uninstall; on a Mac and on Linux, and for a Bridge installed from a zip file
  with Beethoven 14.0.0 or earlier, the uninstaller placed beside it. This version holds no
  `nativeMessaging` permission, so your browser never starts it for Beethoven, and it does nothing
  on its own.
- **The line in your cluster account** that the browser-key step of that version added to
  `~/.ssh/authorized_keys` stays until it is removed. It holds `restrict`, the command `hpcworker
  gate` from the lab's shared copy, the public half of the browser's key, the tag
  `beethoven-browser` and the date it was added; `restrict` takes away a terminal, forwarding and
  file transfer, and the command means that whatever the key asked for, the gate ran instead: a
  short list of commands that could never sign a worker in to Claude. The key the line admits is
  gone from your browser, so the line now admits nothing, and this version never uses it and never
  types a command for it. Your lab lead can remove it for you, and `hpcworker browser-key remove`,
  run in a terminal on the cluster, removes it; withdrawing your approval does not. The file
  `~/.ssh/authorized_keys.beethoven-prev` beside it, that version's copy of the file from before its
  line, and the gate's small counts file in your account's state folder on the cluster stay, as
  ordinary files of yours. Settings say once, with the date, that such a line may be there, and
  offer *Forget*, which removes only that note from your browser.
- **A passkey** you made to protect the key is kept by Windows Hello, your Mac's keychain or your
  browser's password manager, not by the extension; you delete it there, in your system's or your
  browser's list of passkeys.

## What goes to your own cluster account

The framework's settings, the job files, a random per-job token in a file only you can read, the
job's status files, and a plain-words progress log for each worker (when it was asked for, got a
computer, came online with its claude.ai link, renewed itself or stopped). The framework's scripts
are not copied into your account: they stay in the one shared copy your university's lab keeps on
the cluster, and a small launcher that runs that copy, and a one-line note of where that copy is,
take their place. The install also adds a marked block of a few lines to `~/.bashrc` so that a
terminal finds the tool. Nothing about your approval goes there. When you tick the statement in the
panel and press *Connect*, the framework writes one small file in your account, through the portal's
shell (its own marker, `~/.hpcworker/consent`), one line: the word yes, the time, and the random
installation identifier from your browser. Your worker gives that answer to Claude Code when Claude
Code asks its one-time question "Enable Remote Control?", and after the first session Claude Code's
own record of your answer takes over. If your portal's shell asks for your password, the one-time
step below adds three things in your account's `~/.ssh` folder: a key of its own
(`beethoven_ed25519` and its public half), a marked block in `~/.ssh/config` that has ssh offer that
key first when the portal's shell connects you to the login node, and one line in
`~/.ssh/authorized_keys` that lets that key in only from the address the terminal came from, which
at your institution is its Open OnDemand server; it makes `~/.ssh` and `authorized_keys` readable by
you alone, as ssh requires, leaves your own keys and lines as they are, and refuses to change a file
there that is a link to another file. That key is a file in your own account, protected as your
other files are; anyone who obtained it and could connect from that server could use it, so the
framework hides it from Claude Code inside your worker. *Mark this workspace restricted* writes a
small marker file in that workspace. While *Connect* runs, the framework keeps the last line of the
sign-in sitting (with the account and plan Claude Code names) in a file only you can read under
`~/.hpcworker/log`, and removes it when *Connect* ends; it also leaves a marker in your worker's
folder when a sign-in starts, so that a worker waiting for that sign-in does not give up on you
while you are on Anthropic's page. Everything there is in your own account under your institution's
rules; Licensor has no access to it.

## What your portal sees

The extension makes requests to your university's Open OnDemand portal, and only to it, using the
sign-in your browser already holds, from the extension's own background, with no portal tab where
your browser allows it: waking the portal's own web server up if it is asleep; reading the dashboard
(when the panel opens, on each press that needs the grid, and about once a minute while the panel is
open; every two seconds while you sign in); listing and reading your worker's files through the
portal's Files app (every five seconds while a worker starts and the panel is open, every thirty
seconds while it starts and the panel is closed, and about once a minute otherwise), and reading the
version number of your lab's shared copy of the framework; and opening the shell for one command at
a time (setting your account up to use the lab's copy; connect, which starts your worker and, when
needed, holds the sign-in sitting described below; status, about once a minute while your worker
waits for a computer and the panel is open; stop; and mark restricted), once after your first
sign-in to test how the portal's shell can be reached (opened and closed with nothing typed but
`exit`), during the one-time step below to test whether the shell still asks for a password, and,
from *Details*, for the checks and the check job you start there. The extension types into the shell
only once the shell has shown it is ready (its prompt), never at a password prompt. A shell
connection from the extension's background arrives with the extension's own origin
(`chrome-extension://...`) in the portal's logs. Your institution's logs record those requests as
they record any use of the portal; the shell's page token appears in the portal's access log, as it
does when you open the shell yourself. The extension opens the portal in a tab only for you to sign
in there (in your browser's own sign-in box, or on the portal's own sign-in page), never sees what
you type there, and closes that tab; where your portal does not share its sign-in with the
extension, it opens a background tab for one action and closes it. It also opens the portal's own
terminal page in a tab for the one-time step below, and your worker's folder in the portal's Files
app when you press *Your files*. The extension never signs in for you and never touches a
multi-factor step. It reads no other website and makes no request to claude.ai. When it opens a
claude.ai page (your session's link when a worker you started is ready, *Open my session* and *New
session*, or the connectors page from the optional step) or Anthropic's sign-in page, it opens it in
a new browser tab, as a bookmark would, and runs nothing there; it closes Anthropic's sign-in tab
once you are signed in, and *Open my session* may bring forward the claude.ai tab it opened itself.

## What happens when you sign in to Claude

Claude Code itself does the sign-in, inside your job's container on a compute node, through
Anthropic's own paste-code flow. When Claude Code on your cluster already reports you signed in, no
sitting runs. Otherwise the extension starts that sitting for you, in the same command that starts
your worker, through the portal's shell, reads the short lines the framework prints (that your
account is set up, that your Remote Control answer is recorded, that your worker is in line, with
its job number and folder, that the sitting is running and still waiting, the address of Anthropic's
sign-in page, that it is waiting for the code, and Claude Code's own report afterwards with the
account and plan it names), opens the sign-in page in a new tab, and shows you one box. Claude
Code's own screen is never sent to your browser: it stays in a temporary file on the compute node
that only you can read and that is removed when the sitting ends. You sign in on Anthropic's page
with your own account, click *Authorize*, and paste the code the page shows into that box. The
extension types the code once into the sitting on your cluster, through the same connection, and
then forgets it: the code is not kept in any storage, not written to the audit log (which records
only how many bytes were typed) and not sent to Licensor or anywhere else; on the compute node it is
passed to Claude Code without being echoed. The extension never reads the sign-in page, never reads
your clipboard, and never sees the credential Claude Code makes from the code; that credential stays
in Claude Code's own folder in your cluster account. The extension closes the sign-in tab it opened
once Claude Code reports you are signed in, unless that tab has loaded another page since you pasted
the code. The sitting ends by itself within ten minutes of starting on the compute node, and the
wait for a compute node is bounded too (the extension closes the connection after fifteen minutes at
the latest); if it ends without a sign-in, nothing is kept and you can start it again.

## When the portal's shell asks for your password

An account with no key on the cluster may find that the portal's shell asks for a password when the
extension opens it. The extension never types a password: it stops before typing anything and, when
you next press a button that needs the grid, asks you, once, to open the portal's own terminal page.
When you press *Open the grid terminal*, it opens that page (the portal's Shell app) in a tab beside
the panel and puts one line on your clipboard. You type your password there yourself, into your
institution's own page; the extension never sees it. On that page the extension's page script
watches only the page's title, to tell when your shell is up: it listens to no keys, reads nothing
the terminal shows and stores nothing from the page. When you press *I'm in*, or the title shows
that your shell is up, it types the one line into the terminal for you; where it cannot, you paste
it. The line runs `hpcworker login-setup` from your lab's shared copy, in your own account: it makes
a key there, lets that key into your account only from the computer the terminal came from, which at
your institution is its Open OnDemand server, and has ssh offer it when the portal's shell connects
you (see *What goes to your own cluster account*). It never reads, changes or prints a key you
already have, and never prints a private key. The key never leaves your cluster account: the
extension does not see it, keeps nothing about it in your browser and sends nothing about it to
anyone; it keeps only which tab it opened, until the browser closes, and whether the shell still
asks for a password (see the table above). It then checks whether the shell opens without a
password, every two seconds for ten seconds and then every ten seconds for up to five minutes; each
check opens the portal's shell once and closes it, which the login node records as a sign-in that
stopped at the password prompt. It closes the terminal tab it opened once the shell opens without a
password, and carries on with what you pressed. If the computer the terminal comes from changes, the
shell asks again and the step is offered again. `hpcworker login-setup --remove`, run in a terminal
on the cluster, removes the key and both entries. This step came with Beethoven 11.0.0 and has been
tried only against the lab's mock portal, not yet on a real cluster by an account without a key.

## What Anthropic receives

Through Claude Code, which you signed in to with your own account: your prompts, the files the
worker reads, every command's output, and the title your worker's session shows in claude.ai (at
Wayne State, "Wayne State grid"). While you are connected through claude.ai or the Claude app, the
session transcript, including your messages, Claude's responses and tool activity, is also stored on
Anthropic's servers. On a personal plan Anthropic retains it five years if you have model training
on and 30 days otherwise. No BAA covers a personal plan. Remote Control usage draws from your plan's
shared limit. Anthropic's terms and privacy policy apply to that data, not this statement. The
extension shows these facts in short form before your first worker starts, with the full text one
click away, and a one-line reminder beside *Connect* each time you start one.

## What Licensor receives

**From the extension: the approval check, and two small files.** The extension makes no request to
Licensor before you have accepted the agreement. After that:

- **The approval check.** Once your cluster has accepted your sign-in and the extension knows your
  account name, it asks Licensor's access service whether that account is approved: when you first
  sign in to your cluster after you agree, about once a day while it is in use, and again when you
  open the panel after a day has passed or after a no. The request is sent without cookies, over an
  encrypted connection, to the address named in the services file below (Licensor's access service,
  `https://beethoven-access.openspineconsortium.workers.dev`), and carries: the account name your
  portal's dashboard shows for your session, your portal's hostname, the product name (`bridge`),
  the extension's version and the random installation identifier described above; like any request,
  it arrives at a time. The service answers yes or no, and nothing else about you or anyone else. A
  no may carry one of three reasons: that your account is already set up on another installation
  (the panel then says so and offers no button: your lab lead moves the approval), that this
  installation is already set up for another account (the panel says so and offers no button: your
  lab lead releases it), or that this version is too old (the panel asks you to install the current
  one from the lab's private listing). The extension keeps a yes for up to a day, and for up to
  seven days when the service cannot be reached, so an outage on Licensor's side does not stop your
  work; it keeps a no for ten minutes, and while the answer is no it starts no worker and, unless
  the reason is one of those three, offers you a button to ask for access. - **Two files, once a
  day.** `https://openspineconsortium.com/beethoven/services.json` (the address of the access
  service) and `https://openspineconsortium.com/beethoven/killlist.json` (the signed list of
  withdrawn extension versions). Both requests are sent without cookies and carry nothing about you
  beyond what any web request carries (your network address, which the web host's ordinary server
  logs may record for a short time); the files hold addresses and the list only.

Those are the only requests the extension ever makes to Licensor. In particular:

- there is no key of Licensor's and no activation step; your institution's own sign-in identifies
  you; the extension never reads your portal's sign-in, cookie or password; - the extension sends no
  error reports, no crash reports and no usage data; it has no code for them and no address to send
  them to; - your acceptance record, your statements, your audit log, your activity list, your
  settings and what the extension remembers about your worker stay in your browser.

**What Licensor records from the checks.** One record for each account and product: the account
name, the product, and the portal hostname and the version of the latest check; when the account was
first and last checked; how many checks there have been; the answer of the latest check and, with a
no, the reason the service gave, if any (another installation, another account, a version too old);
when the answer last changed; and a salted hash of the network address of the latest check (the
address itself is not kept). The service also counts each day's checks per account and per hashed
address, to limit them, and deletes those counts after two days. This record sits with your access
record.

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
from it which computer it is on. One account is the exception: the account the store's reviewers use
with the lab's mock portal (`st1234`) is approved only in a check whose portal is on the reviewer's
own computer (`localhost`), from any installation, and binds none; from any other portal it is
answered as an unknown account is, and nothing is bound or e-mailed.

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
check record above. Licensor does not publish the list of approved accounts: the access service
answers about one account at a time. The same approved list serves Licensor's other product, an
extension for VS Code, so one approval covers both.

**A notice under the agreement**, if you send one: what you write in it, kept with your access
record.

## What is never collected

Stated in the negative because reviewers read for what is absent: the extension does not collect
command text, file paths, prompt content, job output, portal cookies or tokens, your portal
password, your cluster password or verification code (you type them only into your browser's own
sign-in box, your portal's own pages and the portal's own terminal page, never into the extension),
the code you paste to sign in to Claude, anything the portal's terminal page shows, the key the
one-time step makes, browsing activity, or anything from claude.ai or any Anthropic page. It reads
no hardware address, serial number or other identifier from your device and derives none from it:
the one identifier of the installation is the random number described above. It sends Licensor no
error or crash reports, no usage data and no activation request; the approval check above is the
only thing it sends about you. It has no site permission on claude.ai, claude.com or anthropic.com
and never asks for one, requests no `activeTab`, `cookies`, `tabs`, `webRequest`, `debugger`,
`identity`, `clipboardRead` or `nativeMessaging` permission (so no program on your computer is
started for it), is granted no website when it is installed (it asks for your portal's one website
when you press *Agree and continue*, *Use this portal* or *Change* under Settings), and runs no code
fetched from anywhere.

## How Licensor uses and keeps it

A CV attached to a request is deleted twelve months after Licensor decides on the request (twelve
months after the request, if no decision is made), or at once if the request is refused or the
approval withdrawn. The other access records, including the check record and the installation
record, are kept for the life of your access and six years after, to prove the agreement and for
accounting and disputes. Nothing is sold or used for advertising. The web host that serves the two
daily files sees the requests any web server sees and nothing more. Processors acting for Licensor
(hosting; the access service; the e-mail service that carries its notices) see only what they need
to run the service. Your cluster password and verification code reach neither Licensor nor any
processor of Licensor's: the extension never sees them; you type them only into your browser's own
sign-in box or your institution's own pages. Licensor's use of data complies with the Chrome Web
Store's Limited Use requirements.

## Security and breaches

Licensor keeps reasonable security measures for the systems that hold access records, and will
notify you as Michigan law (MCL 445.72) requires if a breach affects your personal information held
by Licensor.

## Your choices and rights

Remove the site permission or uninstall the extension at any time; press *Forget* on the note in
Settings about a key an earlier version added; have the line an earlier version added to your
cluster account removed (ask your lab lead, or run `hpcworker browser-key remove` in a terminal on
the cluster); remove a Bridge an earlier version had you install (on Windows from Settings, Apps; on
a Mac or on Linux, and for a Bridge installed from a zip file with Beethoven 14.0.0 or earlier, with
its uninstaller); remove the key of the one-time step from your cluster account with `hpcworker
login-setup --remove`; ask Licensor to move your approval to another installation, or for a copy or
deletion of your access records (deletion of your access record ends your approval and with it the
license). Michigan residents and residents of other states may have further rights under their
state's laws; Licensor honours requests it is obliged to honour and answers others where it
reasonably can. Beethoven is offered in the United States.

## Children

Beethoven is for adults, or minors with a parent's or guardian's consent (LICENSE.txt section 21).

## Changes

A new version of this statement ships with the Beethoven version it applies to and is shown for
acceptance when it changes materially.

Version 12 (2026-10-08, Beethoven 16.0.0): the direct way of versions 12.0.0 to 15.0.0 is removed
whole. The extension no longer reaches your cluster over ssh, has no Bridge, no sign-in sheet, no
key in your browser, no passkey, no *Forget this computer*, no phone route and no relay, holds no
`nativeMessaging` permission, and never asks for your cluster password or verification code; it
reaches your cluster only through your university's Open OnDemand portal, behind your university's
VPN where it requires one, as versions up to 11.0.0 did. On its first run after the update it
deletes from your browser what the direct way kept there, the key unread, and keeps one note where
that version recorded that it had added a line to your cluster account, which Settings show once,
with *Forget*; the Bridge on your computer, that line and a passkey are outside the browser and stay
until you remove them, as the new section *What an earlier version may have left* says. New on your
device: a press you made while the grid was out of reach waits and goes ahead by itself once the
grid answers, with the extension asking your portal's address whether it answers every three seconds
while a page of Beethoven's is open and once a minute while none is; *Keep my worker running* also
starts a worker again that ended, at most three times in a row; and the screen that asks you to turn
on your VPN links your university's own page about it. The sections on the Bridge, the ssh sign-in,
the relays and the pilot app, and on what your university sees on the ssh path, are gone with them.
Nothing new reaches Licensor.

Version 11 (2026-10-04, Beethoven 15.0.0): on Windows and on a Mac the Bridge is now a compiled
program of Licensor's, offered from inside the extension as a signed installer that installs into
your own account without administrator rights: on Windows a Windows Installer file signed by
Licensor, removed from Settings, Apps; on a Mac an installer package signed by Licensor and
notarized by Apple, removed with the uninstaller beside the Bridge. On Linux the Bridge is the
script it was. A Bridge installed from a zip file with an earlier version keeps working until you
remove it with the uninstaller beside it. When you open a signed installer, your system may check
its signature with Apple or Microsoft; that is your system's own behaviour and tells Licensor
nothing. The Bridge does what it did: it reaches only your cluster's ssh port, carries the encrypted
connection and keeps nothing. Nothing new reaches Licensor.

Version 10 (2026-10-02, Beethoven 12.0.0): the extension now tries the ssh path first: an ssh
connection to your cluster's login node, with no VPN, carried by the Bridge, a small helper program
that ships inside the extension and that you install once on your computer, without administrator
rights; it reaches only your cluster's ssh port and keeps nothing. The first time, you sign in on
the extension's own sign-in sheet with your account name, password and verification code, which go
only to your cluster, inside the encrypted connection, and are never stored; the extension then
keeps a key in your browser that no script can copy out, and adds one restricted line to your
cluster account that lets that key run only a short list of commands and never sign a worker in to
Claude. Protecting that key with a passkey (Windows Hello or Touch ID) is optional and off unless
you turn it on. *Forget this computer* removes the key and the line. Where your cluster has no
verification code for you, the extension shows how to set one up yourself, on a computer or on your
phone, with QR codes drawn on your device. A relay is not used unless your university's site profile
names one, and this statement would name it first; the pilot app is given only to a student who
asks. Without the Bridge the extension works through your portal, as before. The approval check is
unchanged and is sent only after your cluster accepts your sign-in. Nothing new reaches Licensor.

Version 9 (2026-10-01, Beethoven 11.0.0): the agreement is accepted on a welcome page with one box
and one button, with no typed name; the acceptance record now holds the summary and the sentence
shown, whether you opened, scrolled to the end of, saved or printed the full text, and, once your
portal first shows it, your account name. The extension now reaches your portal from its own
background, on the sign-in your browser keeps, and opens a portal tab only for you to sign in,
closing it afterwards, or, on a portal that does not share its sign-in, in the background for one
action; after you agree, and before you sign in, it checks whether your portal answers, with
requests that carry no sign-in. One command starts your worker and, when needed, the Claude sign-in,
and writes your Remote Control answer; the framework keeps a plain-words progress log for each
worker. Where the portal's shell asks for a password, a one-time step makes a key in your cluster
account that only your institution's Open OnDemand server can use; you type your password into the
portal's own terminal page, and the extension never sees it and keeps nothing about the key. New on
your device: your worker's last known state and link, how the extension reaches your portal, your
last five waits, the tour and the one-time tips seen, an activity list for Show log, the tabs it
opened itself, and your appearance choice; the note of the tab the toolbar button was clicked from
is gone, with the activeTab permission. The QR code for your phone and the tour are drawn on your
device. The statement now names what the access service keeps from the checks (how many, and the
reason given with a no), the reviewers' mock account, and that the list of approved accounts is not
published, and says "no site permission on claude.ai" where it said "no access". Nothing new reaches
Licensor.

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
