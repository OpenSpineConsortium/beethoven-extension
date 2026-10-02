# Beethoven 11.0.0 and framework 10: where the build stands

2026-10-01, after the integration pass. Nothing here was run against the Wayne State grid, its portal
or the live access service: every run below is against the repository's mock portal
(`extension/mock-ood`) on this computer, with the access service played by a local stand-in. Nothing
was committed, pushed, deployed, uploaded or tagged, and no release folder was made.

## 1. What 11.0.0 does differently from 10.0.0

**The first run is one page and one panel.** 10.0.0 opened a setup page with an agreement to scroll
to its end, a typed name and a field for the portal's address, and work started from the toolbar
button on an open portal tab or from Connect on that page (14 clicks, 26 wheel turns and 4 tab changes
in the specification's measured run of 10.0.0).
11.0.0 opens a welcome page that lists what a student needs, in Greg's order (a grid account,
GlobalProtect, Claude Pro or Max), with the Wayne State portal already filled in from the site profile
and "Not at Wayne State? Use another portal" for anyone else. One tick ("I've read and agree…") with
"Show terms" optional, no scroll gate, no typed name, and one button, "Agree and continue", which in the
same click opens the side panel and asks Chrome for that one site. The same tab then becomes the grid
sign-in. On the harness the whole first run takes 9 presses on the Wayne default (13 with the two
presses "Use another portal" needs on the mock, and the two of Stop), with no scrolling.

**The panel walks the student through moments, then becomes the home.** GlobalProtect (shown only
when the grid does not answer, and it moves on by itself), the grid sign-in in Chrome's own box (the
tab closes itself once signed in), where your work goes (the data statement), Connect, the Claude
sign-in (Anthropic's tab opens and closes itself; one code is pasted), in line for a computer (a
running clock, the scheduler's reason in plain words, the expected start, a minutes badge on the
toolbar, and a 16-second tour of what Beethoven does), got a computer, and "You're online." with
claude.ai opened once. The home then holds one headline state, Grid / Claude / Worker rows, Open my
session, New session, Copy link, Phone (a QR code drawn on the device), Stop or Connect, when the
worker renews itself, Try asking, and the log folded behind Show log. Details for your lab lead,
Settings and the tour sit behind ⋯.

**Connect is one command.** Framework 10's `hpcworker connect` sets the account up if needed, submits
the worker, and holds the Claude sign-in in the same sitting, so the queue wait overlaps the student's
own steps. The probe job and 10.0.0's two self-imposed waits (57 s and 46 s) are gone from the path. A
queued status file exists from the moment of submission, `worker status --json` reports the
scheduler's reason and expected start (asked at most once a minute, only while in line), and
`worker stop` of a worker still in line cancels it at once.

**The one-time grid key step (Greg's question).** "Can you integrate setting up an ssh key into the
first connect and save it to the browser?" Into the first Connect: yes. In the browser: no, by design.
When the portal's terminal asks for a password while a press waits, the panel offers "Open the grid
terminal". The student types the grid password into the university's own terminal page; Beethoven
never sees it. Beethoven then types one line, `bash <shared>/bin/hpcworker login-setup`, only on
evidence the shell is up (the student's "I'm in", or the page title turning into the shell's own).
The lab's tool makes a key on the grid, adds one restricted line to `~/.ssh/authorized_keys` (usable
only from the OnDemand server's addresses, no forwarding) and one block to `~/.ssh/config`, and the
press carries on: "Done. You won't need this again." Nothing about the key is kept in the browser: a
key there would be a durable credential outside the university's password-each-time rule, and an
extension cannot hold an ssh connection anyway. The step is unproven on the grid (section 3).

**The look.** Cream by default whatever Windows says (Settings: Appearance, Cream or Match system),
Newsreader and IBM Plex bundled, one teal accent, motion that carries a change of state and respects
reduced motion. The welcome page carries a teal italic signature line over a faint drafting grid. The
toolbar icon is an unlit rack until the worker is online, then lit.

**Under the hood.** The page script is never registered: it is injected only into tabs Beethoven
opened while they are on the granted origin. Run-record writes are serialised; one Connect at a time;
the shell is typed into only on evidence it is up, never on a timer; grid times are moved onto this
computer's clock before they are compared with now. The agreement is version 8 and the privacy
statement version 9 (`TERMS_VERSION` 8); an earlier acceptance is kept beside a new one, and Settings
shows the installation identifier with the acceptance record and saves it as text.
`docs/V11_CONTRACT.md` is the full contract; its §22 records what the four verifiers changed.

## 2. What was proven by running (on the mock only)

Logs and pictures are in the build session's scratchpad, `v11/final/` (`logs/`, `out/`, `shots/`).

**The package.** `npx tsc --noEmit` clean; `npm run build` and `npm run zip` succeed;
`npx vitest run`: 30 files, 341 tests, all pass. A script over the built zip
(`final/check_package.py`) confirms: version 11.0.0; permissions exactly `storage`, `alarms`,
`scripting`, `sidePanel`; the one optional host permission `https://*/*`; no `host_permissions`, no
`content_scripts`, no `externally_connectable` or `web_accessible_resources`; the toolbar's default
icon is the unlit one; no source map; no fixture, gallery code or gallery style, mock host or test
account in the code; `LICENSE.txt`, `PRIVACY.md` and `THIRD_PARTY_NOTICES.md` byte-identical to the
repository's; `TERMS_VERSION` 8; and the zip's 38 files byte-identical to `.output/chrome-mv3`, the
folder the harness loaded. (`content-scripts/portal.js` is in the package: it is the page script,
injected with `scripting.executeScript`, not declared.)

**The cluster tool.** `framework/tests/run.sh` under WSL (Python 3.12.3): `bash -n` of every script
and of the rendered job template, LF line endings, and 244 unit tests, all OK. The same suite on the
Windows checkout (Git Bash, Python 3.12.4): 244 tests OK, 27 of them skipped there by design (they need
POSIX file modes, symbolic links, `script`, `mkfifo` or tmux, and ran under WSL).

**The browser harness** (`extension/e2e`), every scenario, on the final release build, in Chrome for
Testing against the mock portal, with the access service played by a local stand-in (the live service
was not contacted; the harness answered `services.json` itself, and let the public withdrawn-versions
list, `killlist.json`, and one Help page come from the lab's website):

| Scenario | What it plays | Result |
| --- | --- | --- |
| 0 infra | the harness's own machinery | PASS, 17 checks |
| 1 first-run | HTTP Basic portal, a 75-second queue, the tour, online, the home, Stop | PASS, 61 checks |
| 2 returning | browser restart signed out, Open my session without the grid, sign in again, Stop, restart, Connect | PASS, 65 checks |
| 3 unreachable | GlobalProtect step, the grid going away while online and coming back | PASS, 50 checks |
| 4 tab-mode | a SameSite=Lax cookie portal: the sign-in tab kept, shell lines through it | PASS, 43 checks |
| 5 approval | not approved, another installation, another account, update required, service down, withdrawn | PASS, 103 checks |
| 6 login-setup | the key step on a keyless mock account: by the page title (xterm), by paste (hterm), terminal closed | PASS, 106 checks |
| 7 motion-width | reduced motion (the tour as four still frames) and a 320 px panel | PASS, 56 checks |
| 8 anthropic-portal | an Anthropic address under "Use another portal": refused before any Chrome prompt | PASS, 40 checks |
| 9 long-signin | a 6-minute Claude sign-in with the panel closed | PASS, 36 checks |
| 9 long-signin, 10.5 min | the contract's own test (MOCK_CODE_WAIT_S=700), panel closed: the sitting survived, 32 keepalive frames, no idle kill | PASS, 36 checks |
| 10 home-extras | Cancel and Keep it in line, Try asking, Show log on reopen, the ⋯ menu, Details, Settings | PASS, 52 checks |
| 11 queue-reasons | "Waiting for your share of the grid", "The grid is under maintenance" | PASS, 66 checks |
| 12 welcome-extras | Show terms at 1280 × 720, "Opening the grid…" while Chrome asks, Deny | PASS, 13 checks |

What those runs saw, among the checks: the first run takes 13 presses on the mock (9 on the Wayne
default, which skips the two of "Use another portal"; the other two are Stop); claude.ai opens once;
the home fits 360 × 658 with the log closed; at 1280 × 720 with the terms open "Agree and continue"
stays in view; no horizontal scroll at 320 px; Stop to "Stopped" takes 4.4 s and 7.8 s on a direct
portal and 31.6 s in tab mode; Cancel while in line to "Stopped" 4.7 s; a Connect pressed 5 s after
a Stop waits out the shared one-minute scheduler floor (in scenario 10 the worker's queued file was
written 57 s after the press; the harness's own "106 s to In line" includes a 70 s wait of its own for
a Claude moment that rightly never came); extension storage holds no password, key or setup line; the side panel fetches nothing
itself; Anthropic pages are reached only as tabs; the extension never holds a permission for an
Anthropic origin.

An earlier full run on the build before the last two style changes (the scrollbar and the gallery's
styles, below) was stopped during scenario 7: scenarios 1 and 3 to 6 passed, and scenario 2 failed one
check whose expectation predated this pass's "online just now" wording (the harness now accepts it).

**The fixtures.** The development build's gallery draws 109 states (every panel state, the welcome
page and Settings) with no page error; at 360 × 658 and 1280 × 720 only these scroll: the welcome
page with a problem, with "Use another portal" open (42 px) or with the terms open; the statement with
"More about your data" open; the home with the log open; Settings.

## 3. What is not proven, and how to prove it on the real grid

Each of these needs the real grid, its portal or a real account, which this pass was not allowed to
touch. In order of importance:

**A. Greg's own first run on Wayne State (Checks 1 and 2).** On a fresh Chrome profile, load the
11.0.0 package (`extension/.output/chrome-mv3`, or the zip) with GlobalProtect connected. Open DevTools
on the welcome tab before pressing "Agree and continue", and record: whether
`https://ondemand.grid.wayne.edu/pun/sys/dashboard/` raises Chrome's sign-in box directly or goes to
`/public/start.html` first (Check 2); and on the first `/pun/` request, whether it carries
`Authorization: Basic` with no session cookie (Check 1: the tab-free design holds as built), or a
session cookie, and if so its SameSite (None: holds; Lax: Beethoven runs in tab mode, which the harness
covers on the mock). Then go through to "You're online." and record the presses, the time from Connect
to online, whether the sign-in tab and Anthropic's tab closed themselves, whether claude.ai opened once,
the queue's reason and expected time against `squeue -u go2432 -o '%T|%r|%S'`, and Stop then Connect.
Copy Details for your lab lead at the end. Greg has a key on the grid, so the key step should not
appear for him; if it does, that is a finding.

**B. A student with no key: the key step (Check 3).** First, with that student's account, open the
portal's Shell app to warrior: if it asks for a password, the key step is what that student will meet
(if it does not, the university has host-based login and the step never appears). Then run Connect in
Beethoven and record: the panel's "Open the grid terminal"; that the student types the password into
the university's terminal page only; whether Beethoven typed the line by itself after the page title
changed (this depends on OnDemand's terminal copying the shell's title into the page title, which only
the mock has shown) or only after "I'm in"; "Done. You won't need this again."; and that Connect
carried on. On the grid afterwards: `~/.ssh/authorized_keys` holds one line starting
`from="<the OnDemand server's addresses>",no-agent-forwarding,no-port-forwarding,no-X11-forwarding ssh-ed25519`
and ending `beethoven-login-setup`; `~/.ssh/config` holds the block between Beethoven's start and end
lines, with a Host that matches the host OnDemand's Shell actually uses (OOD_DEFAULT_SSHHOST); the
portal's Shell now opens with no password; an ssh with that key from any other host is refused (sshd
enforcing `from=`); and `bash <shared>/bin/hpcworker login-setup --remove` takes it all out. Watch the
login node's defences while the panel waits: it re-tests the shell every 2 s for 10 s, then every 10 s
for up to 5 minutes, each a disconnect before sign-in. Only after this passes should
`LOGIN_SETUP_PROVEN` in `extension/src/core/contract.ts` become true, in the next whole version.

**C. A Claude Pro or Max account with no GitHub (Check 4).** Sign in with it at the Claude moment,
open the worker's `claude.ai/code?environment=…` link, and see whether the Remote Control session can
be reached past any GitHub prompt. The welcome page's third requirement says only "Claude Pro or Max";
Decision 3 then adds "No GitHub needed." or a fourth requirement.

**D. Smaller, each with how.**
- An unattached service worker holding a 10-minute Claude sign-in (Check 5): the harness keeps a
  DevTools session on the worker, which may keep it alive. On the grid, take ten minutes on Anthropic's
  page with the panel closed and DevTools shut.
- Slurm's real output formats (`%T|%r|%S|%N`, `scontrol` SubmitTime), Python 3.6 and bash 4.2 on the
  login node, `srun --pty` with piped output, OnDemand's idle limit: one Connect and one Stop on the
  grid, then `hpcworker worker status --name <name>` by hand. During that Connect's sign-in, from a
  second terminal on warrior, `ps -o pid,pgid,etime,args -u <account>` should show the sitting's
  processes as bash, srun and sleep only, all in one process group; closing the portal tab should end
  all of them within a few seconds. The relay was run under a bash 4.2.46 built from source, not under
  warrior's own.
- Firefox and Safari builds: built, never loaded.
- The lit toolbar icon in a real toolbar, and "Pinned." after pinning (no API reads either): look.
- Failure paths seen only as drawn fixtures, never in a browser: a cancelled or wrong grid password
  ("Not signed in yet."), the portal's start page, a bad or late Claude code, an account without Pro or
  Max, Anthropic's tab closed, a refused Connect, the busy and past-15-minutes queue lines,
  Reconnecting, Renewing, and Settings' Change worker name, Disconnect and Keep my worker running.

## 4. Departures from the specification, and why

The specification is `scratchpad/v11/SPEC.md` of the build session; the contract is
`docs/V11_CONTRACT.md`. Builders' departures, kept after review:

**What the student sees**
- "Sign-in was cancelled." is never shown: in Chromium 153 a Cancel and a wrong password look the same
  to an extension. After a second refused load the grid moment says "Not signed in yet." [Sign in again].
- Moments that show the four-step track drop the orb (two turning indicators said the same thing);
  "You're online." keeps it with its burst, and the home keeps it as specified.
- The welcome page's top padding is 8vh, not 10vh, and the statement's checklist rows 34 px, not 40,
  so the idle welcome fits 1280 × 720 and the statement 360 × 658 with no scrolling. A welcome page
  with a problem banner still scrolls 30 to 50 px; its button stays in view.
- Try asking is one prompt at a time with dots, not a stacked list, so the home fits; secondary pills
  are words only; status values wrap to two lines rather than being cut.
- Journey screens carry the header with ⋯ (Settings, Details for your lab lead, Help), so a lab lead
  can reach Details when a student is stuck. Glyph tiles above some titles, a wordless drawing of
  Chrome's sign-in box, and a lock on the welcome footer are additions.
- The tour pans over the site's tall diagram, which does not fit the panel whole.
- The legal text under Show terms is reflowed into paragraphs; the hashes are still of the files.
- Words the specification has none for were written (contract decisions D19 to D25, and the welcome
  field's label "Your grid's address").
- Safari has no side panel: after agreeing, the welcome tab turns into the panel's page.

**How it works**
- The page script is never registered (10.0.0 registered it for the portal); it is injected only into
  tabs Beethoven opened, while they are on the granted origin. A registration an earlier build left is
  removed.
- In tab mode only shell lines go through a tab; reads stay direct (the background's fetches carry a
  Lax cookie). `worker status --json` is not asked in tab mode, since it would open a portal tab a
  minute; the queue shows the ordinary "In line" words.
- The key step's re-test runs every 2 s for 10 s, then every 10 s (the contract says 2 s for up to 5
  minutes): 150 pre-sign-in ssh logins in five minutes could get the OnDemand server banned by the
  login node, which would stop every student's shell.
- The key step's line is `bash <shared>/bin/hpcworker login-setup` (the specification gives the path
  alone): every line since 8.0.0 runs the shared copy through bash, because the exec bit on the lab's
  volume is not guaranteed. The shell-up sign requires bash's own title form `<account>@<host>:`.
- `connect` takes flags beyond the synopsis (`--profile`, `--permission-mode`, `--no-chain`,
  `--login fresh`), each needed by a Settings choice or a first connect.
- `status.json` carries `online_at`, `renewal` and `stop_reason` beyond the specified fields, so the
  "ready N min after you asked" clock, renewals and the sign-in abandon can be told apart truthfully.
- Storage keys the specification does not list: GRID_KEY, PRESS_KEY, TERMINAL_TAB_KEY, ONCE_KEY,
  CLAUDE_TAB_KEY (the claude.ai tab id is session-only, since a tab id from before a restart can name
  another tab), and from this pass WELCOME_PRESS_KEY and TERMS_HISTORY_KEY. Each has its row in PRIVACY.
- The data statement comes back before Connect whenever it is not in force (a new worker name, a new
  text, an account carried over from 10.0.0); the specification is silent and LICENSE 5(e) requires it.
- Presses waiting on approval or setup ask again at most every 15 s.

**The cluster tool**
- The sign-in abandon counts from the job's start only when the job started signed out; otherwise from
  when the sign-in was lost. Counting from the job's start would stop a long-running worker the moment
  a sign-in lapsed hours in. It also asks Claude Code once more before stopping, and counts from the
  last sitting (`signin.pending`) when that is later.
- `worker stop` of a worker still in line cancels at once and writes `stopped` itself: a fourth writer
  of `status.json` (contract §9 named three; §22 now says four).
- `worker status` treats a job the scheduler lists as ended like a job it no longer lists; a scheduler
  that cannot be asked changes nothing.
- `worker start` (and `connect`) submits nothing when the scheduler does not answer, and one start at
  a time per worker: neither is in the specification; both close a double-submission found in review.
- `login-setup` keeps the config file's mode but removes group and other write (ssh refuses those),
  refuses links and a half-written block, refuses to run as root, and puts back what it changed when a
  later step fails, so "nothing was changed" stays true. It runs with no `~/.hpcworker/profile.json`,
  because a student with no key meets the password before any setup.

**The login node's banned list (2026-10-02, after commit 95d7eea; framework 10 still not deployed)**
- warrior's banner bans `python3` (with `node`, `make`, `md5sum`, `rsync` and others) "on sight", and
  the first framework 10 build relayed the whole sign-in sitting, up to 14 minutes, with
  `lib/relay.py` under the system `python3`. It is now `lib/relay.sh`, bash builtins only, with the
  same contract (whole lines; a part of a line alone after 5 s; the keepalive after 20 s of silence;
  the two-line outcome file; status 0, connect keeping srun's). It never reads with a timer: bash
  4.2.46, built from source for this, dropped the `SIGNED` of a split `SIGNED-IN` line on a `read -t`
  timeout. A ticker beside srun (`relay.sh --ticks`, `sleep 1` between ticks) gives it its clock.
  Under a cut shell, srun, the ticker and the relay end together with the terminal's SIGHUP.
- Also off `python3`: the `status.json` patch of `worker status` and `worker stop` (awk), the six
  plain top-level profile reads (awk, `profile.py get` only as a fallback), and connect's second read
  of the profile. Still `python3`, each one process of a fraction of a second: `profile.py shellenv`
  (every line that reads the profile), `render` (a submit), `guide` (a new workspace), `validate`
  (install). The full list per line is in `framework/README.md`, "The login node", and
  `framework/tests/test_login_node.py` fails if anything else on the list is looked for.

**The texts**
- LICENSE 5(b) and PRIVACY add the tab-mode behaviour and "or on the portal's own sign-in page" (the
  agreement covers cookie portals too); 5(f) names the one-time terminal page, where the script watches
  only the title and types one line; "one click away" for "one tap away"; the acceptance-record lists
  completed from the record's real fields.

**Integration decisions (this pass)**
- A press right after Stop still waits the shared one-minute scheduler floor: two presses of the
  student's are the lab's etiquette toward the scheduler. The background's own `worker status` has its
  own clock and never takes a press's turn.
- Credentialed fetches still follow redirects: refusing them (a reviewer's suggestion) would break
  OnDemand's own same-origin `/nginx/init` redirect that starts the per-user server; the portal client
  already refuses a session that ends off the portal's origin.
- The guard that leaves Anthropic's tab alone once it has moved elsewhere stays (the specification's
  Risk 11): a tab the student took somewhere else is theirs.
- The key step's words "Paste, then press Enter." stay as AM2 fixed them; a Copy button was added in
  the fold. The title "Turn on GlobalProtect." keeps the specification's punctuation.
- The Phone view's flip into two halves (a design suggestion) was not done; the QR view is one card.
- The gallery's styles moved out of the shipped stylesheet into `gallery.css`, which only the
  development build loads; the hygiene test now checks the release stylesheet for them.
- Chrome on Windows still draws arrow buttons under `scrollbar-width: thin`, and ignores
  `::-webkit-scrollbar` wherever `scrollbar-color` applies. The pages now draw a thin arrowless thumb
  with `::-webkit-scrollbar` and keep the standard properties for Firefox only; the final run's
  pictures show it.
- The fixture for a cancelled grid sign-in now shows "Not signed in yet.", the sentence the product
  shows; it had shown the specification's "Sign-in was cancelled.", which 11.0.0 never says.

## 5. Out of date, and not edited in this pass

These still describe 10.0.0 (or 9.0.0) and must change before 11.0.0 is submitted or announced.
None was edited here.

**Store documents** (`docs/store/`)
- `LISTING.md`, `PASTE.md`: name the 10.0.0 package; the single-purpose and host-permission texts say
  a site is asked for from "its button on that site's tab … or Connect on its setup page, where you can
  type the site's address". In 11.0.0 the request comes from "Agree and continue" on the welcome page,
  "Allow again" in the panel, or Settings when the portal is changed; there is no setup page. The
  privacy-practice answers predate the new session and local keys (WELCOME_PRESS_KEY,
  TERMS_HISTORY_KEY, the claude.ai tab, the grid and press records). The agreement is described with
  its scroll-to-the-end button.
- `SUBMISSION.md`, `TEST_BEFORE_UPLOAD.md`: the reviewer's test instructions and the pre-upload checks
  walk 10.0.0's setup page, its reading line and *Open in tabs*; the mock-portal-only reviewer zip is
  named for 10.0.0.
- `docs/STORE_LISTING.md`: an older listing draft, 8.0.0 to 10.0.0 wording.

**Store images** (`extension/store-assets/`)
- `screenshot-01-your-grid.png` … `screenshot-05-by-approval-only.png`, their sources
  `src/shot-01.html` … `src/shot-05.html`, `marquee-1400x560.png`, `promo-tile-440x280.png`, the promo
  video in `promo/`, and `manifest.txt`: captured from 9.0.0 (setup page, toolbar-button start, the old
  panel). None shows the welcome page, the journey, the home or the tour.

**Website** (`openspineconsortium.github.io`)
- `beethoven/terms.html` and `beethoven/privacy.html`: still Version 7 and Version 8 of 2026-09-30.
  `tools/build_site.py` renders them from this repository's `LICENSE.txt` and `PRIVACY.md`; one run
  brings them to 8 and 9.
- `beethoven/support.html` (body `tools/pages/beethoven/support/body.html`): "How it works" is 10.0.0's
  flow (open your portal tab, click the icon, the setup page, *Open in Claude*).
- `beethoven/reviewers.html` (body `tools/pages/beethoven/reviewers/body.html`): the setup page and
  "type the site's address" as where a site permission is asked for.
- `tools/pages/beethoven/terms/body.html`: the setup page in its framing text.
- The extension's own third-party notices have no page: `beethoven/third_party_notices.html` redirects
  to the VS Code edition's. The extension ships its notices in the package, which is what LICENSE
  names; a page would only be needed if the store listing links one.

**This repository's documents**
- `README.md`: the setup page and its *Connect* button in the usage section.
- `docs/ARCHITECTURE.md`: the extension's map is 10.0.0's (`onActionClicked`/`startNow`, the strip
  and its terminal in `ui/strip.ts` and `ui/terminal.ts`, both deleted; the options page as the place
  to agree); the sign-in sitting as run by the strip.
- `docs/TESTERS.md`: the tester's walk-through is 10.0.0's (read the agreement to its end, the setup
  page, *Open in Claude*).
- `docs/WAYNE_STATE_PILOT.md`: "accept the agreement on its setup page".
- `docs/OPEN_QUESTIONS.md`: Q7's "no password" answer was measured on the maintainer's keyed account
  only; Checks 1 to 5 of section 3 are not in it yet.
- `SECURITY.md`: its storage paragraph names "the notes the strip keeps" (the strip is gone) and none
  of 11.0.0's new keys.

**Elsewhere**
- Beethoven for VS Code's privacy page (`beethoven/vscode-privacy.html`, privacy v5) is a separate
  product and was not reviewed against 11.0.0; it shares the site's terms pages.

## 6. For Greg to decide

1. One tick or two on the welcome page (the specification's Decision 1): a question for counsel. The
   two-tick variant is one constant, `TWO_TICKS` in `extension/src/core/terms.ts`, and is off.
2. The GitHub line (Decision 3), once check C has been run.
3. The key step's re-test every 10 s after the first 10 s (section 4), against AM2's 2 s: kept for
   the login node's sake; say if the grid's administrators would rather have either.
4. The panel's header carries the word "Beethoven" on every screen, and the welcome page and Settings
   carry it again above their own titles; a reviewer of the look called it a duplicate. Kept.
5. A Connect pressed within a minute of a Stop waits out the scheduler floor (57 s on the harness,
   under "Asking the grid for a computer…"). Kept as the lab's etiquette toward the scheduler; it
   could be shortened for a Connect that follows a Stop of a worker still in line.
6. Before 11.0.0 goes to the store: the documents, images and pages in section 5, and the order of the
   grid checks in section 3 (A before B before C).
7. Whether to ask C&IT about `python3` on warrior. After this pass the login node still runs the
   system `python3` once to three times per command, each a single process of a fraction of a second
   (`profile.py shellenv`, `render`, `guide`, `validate`; 0.19 s of wall time and 0.1 s of CPU each
   under WSL, not measured on warrior), and never for the sign-in sitting. The banner says python3 is
   "terminated on sight" without saying whether that means a short process. If C&IT says no, the next
   integer version moves them off the login node (README "The login node" says how); the relay and
   the status reads no longer need asking about.
