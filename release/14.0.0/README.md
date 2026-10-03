# Beethoven 14.0.0 package, helper and guides

Built 2026-10-03 at 13:45 UTC from this repository's working tree, which was not committed, on top of commit
e11ae27 (13.0.0). This is the second build of 14.0.0. It replaces the morning's (12:53 UTC, SHA-256
`e9fe35ae…a5a013`) after a review found four defects; see "The review's fixes (second build)" below. The
build ran in `extension/` with Node 22.23.3. The steps were `node helper/build.mjs --check` (from the
repository root), `npx tsc --noEmit`, `npm run build`, `npm run zip`, then `npx vitest run` with the built
package present. `SHA256SUMS.txt` holds the checksums of every file in this folder; check them with
`sha256sum -c SHA256SUMS.txt`, run inside this folder.

**Nothing in this build touched the real grid.** No step was pointed at `grid.wayne.edu`, the access
service or any other real server. The unit tests ran against stand-ins on this computer, and the framework
suite ran in WSL against a fake scheduler and a fake Claude Code. Framework 14 is not published, and
nothing was committed, pushed or uploaded.

| File | For | Size (bytes) |
|---|---|---|
| `beethoven-14.0.0-chrome.zip` | The private Chrome Web Store listing, or a test install by hand | 503,489 |
| `bridge/` | Copied unchanged from `release/13.0.0/bridge/`. **The bridge did not change** (helper 1.0.0, protocol 1). The same bytes as `bridge/` inside this package, with their own `SHA256SUMS.txt` | 4 files and the sums |
| `guides/` | From `docs/guides/`: `INSTALL.md` and `USE.md` (students; each has a 14.0.0 paragraph at the top, and `USE.md` part 7 has "If something is stuck"), `ACCOUNTS.md`, and `LAB_LEAD.md` (Greg; sections 11 and 12 are new). From `release/13.0.0/guides/`: `STUDENT_QUICKSTART.md` | 5 files |
| `SHA256SUMS.txt` | SHA-256 of every other file in this folder | |

The package's SHA-256 is `f0abebd8b6384bbbcc9adabef3c0d367936f3920d4425a6b82f50c854cd6df38`. Upload this
copy (`release/14.0.0/beethoven-14.0.0-chrome.zip`), not `extension/.output/`, which the next build
rewrites.

`STUDENT_QUICKSTART.md` is 12.0.0's page, unchanged. Its heading still says 12.0.0, and none of its steps
changed. `LAB_LEAD.md`, section 2, still tells you to publish framework 11; the same two commands publish 14.

## What 14.0.0 changes against 13.0.0

**A worker online on a resumed session's link is online.** This happened on 2026-10-03, between 07:50 and
08:00 EDT. Greg's worker (framework 13, job 40554211) had resumed an earlier Remote Control session. In that
case Claude Code 2.1.283 prints "Resuming session session_… (43m ago)", "Single session · exits when
complete" and that session's own link, `https://claude.ai/code/session_…`. It does not print the
environment link, `https://claude.ai/code?environment=env_…`, that a fresh registration prints. Framework
13 knew only the environment form and wrote `status.json` as `online` with both links empty. 13.0.0 also
knew only that form, so it showed "Starting · Connecting to Claude…" with no button, and opened no
claude.ai tab, for a worker that was online. Now:

- **Framework 14** (on the grid, not in the package) takes either link form, on `claude.ai` or
  `claude.com`. `status.json` and `connection.json` carry `session_url` = the link printed (either form),
  `environment_url` = the environment link when one was printed, else "", and `environment_id` as before,
  or "". The online message, `progress.log`'s "Online: <link>" and the job output name the link that
  exists. `worker status`, `worker watch` and `diag` print it too. `framework/README.md`, "Framework 14",
  has the details.
- **14.0.0** opens either form wherever 13.0.0 opened an environment link: the online moment and its tab,
  **Open my session**, **Copy link**, and the phone's square code (`contract.ts` `isClaudeCodeLink`,
  `facts.ts` `claudeLinkOf`).
- A run is online when `status.json` says online and either link is there.
- **New session** still needs an environment link (`isEnvironmentUrl`). Since the second build it is
  offered whenever one was reported, in connection.json, status.json or rc.log's registration, whichever
  link is the run's own, and the background's `new-session` opens that link (`steps.ts`
  `newSessionLinkOf`). On a resumed session's link alone, Claude Code serves that one session and exits when
  it is complete, so the home offers **Open my session**, **Copy link** and **Phone**, and not **New
  session**.
- On the GlobalProtect way, 14.0.0 also reads the link out of `rc.log` for an online worker without one,
  so there it works with framework 13 too. On the direct way the gate reads no `rc.log`: **framework 14 is
  needed there** (step 0 below).

**The debug log.** **⋯** (More) has **Copy debug log**, on the home and on the first run's menu. It copies
the background's own account of what it did, one line per decision, newest last, after a header line:
version, mode, portal, account, worker name, time. The lines cover:

- the mode and why;
- the bridge probes;
- each ssh connection, with its reason and how long it took and lived;
- each gate verb (verb and name only), with its exit status, time and the first 160 characters of its
  output;
- each read of the run's files: job, state, `updated_at`, phase, stale, `alive_seen`, and whether a link
  is there and of which form;
- each press and what it waited for;
- the sign-in sheet's phases;
- the approval checks;
- the sitting's events, by kind;
- every failure;
- what the panel showed.

At most 3,000 lines are kept, in memory only. The log is never written to storage and never sent anywhere,
and it starts empty again whenever Chrome starts the background again, idle restarts included. It never
holds a password, a one-time code, a pasted Claude code, a key, a token or a full authorize link. The
callers pass kinds, words and hosts, and the ring itself (`core/debuglog.ts`) cuts every web address to its
host and path and removes anything key-, token- or code-shaped. **Details for your lab lead** shows the
last 200 lines under "Debug log", with a copy button.

**The review's fixes (second build).** `docs/V12_STATUS.md`, "2026-10-03, later", has the details and the
tests.

- **ESC[K before a link took the link's h (framework 14).** The framework's escape-code filters
  (`hpcw_strip_codes`, `hpcw_login_strip`) wrote the CSI intermediates as `[ -\/]` inside a sed bracket
  expression. There a backslash is a literal, so GNU sed read the range as space to backslash, and a code
  ending in a capital letter took the next character with it: "or ESC[K https://…" lost the h and the link
  was missed, and a name after ESC[2K lost its first letter (measured under GNU sed 4.8 and 4.9). The class
  is now `[ -/]` under a `|` delimiter. The extension's own filters (`core/shell.ts`, `contract.ts`) were
  already right, since in JavaScript `\/` is the slash itself; tests now pin that.
- **Only complete lines are parsed (framework 14 and 14.0.0).** A last line with no newline yet may be a link
  still being written, and its first part already has a link's shape. `hpcw_parse_registration` (through
  `hpcw_complete_lines`, and the job's `clean_tail … lines`) and `parseRegistration` now leave such a line
  out until its newline comes. The job's consent prompt test still reads the whole tail.
- **A renewal forgets the previous job's rc.log (14.0.0).** At a hand-over the run kept what the old job's
  `rc.log` said, so on the GlobalProtect way a successor online before its own link was read could show,
  and open, its predecessor's session. `facts.ts` `forJob` now clears the registration, the `rc.log` tail and
  its modified time with `connection.json`. Until the successor's own link is read, it is "Connecting to
  Claude…". The successor writes its first `status.json` before it moves the old `rc.log` aside, so a
  download taken in that window could still bring the old link back. `facts.ts` `applyRcLog` therefore takes
  an `rc.log` only when it was modified at or after the job got its computer, the rule the node file follows
  (R4). A file it takes replaces the registration whole.
- **New session follows any environment link reported (14.0.0)**, as above. The last known state keeps it
  as `new_session_url`.

**In the package**, compared entry by entry with `release/13.0.0/beethoven-13.0.0-chrome.zip`, there are 42
entries in both.

- **Changed (7):**
  - `background.js`, from 297,921 to 311,681 bytes (310,619 in the morning's build; against that build it is
    the only entry that changed);
  - `manifest.json`, only the version, 13.0.0 to 14.0.0, the same 1,064 bytes;
  - the three page chunks, renamed because their content hash moved: `chunks/routes-*.js` (76,249 to
    76,536 bytes), `chunks/sidepanel-*.js` (46,279 to 46,652) and `chunks/options-*.js` (the same 19,628
    bytes; it names the routes chunk);
  - `options.html` and `sidepanel.html`, the same sizes; they name the chunks.
- **The same, byte for byte (35):** the stylesheet, `content-scripts/portal.js`, `profiles/wayne.json`,
  the four `bridge/` files, `LICENSE.txt`, `PRIVACY.md`, `THIRD_PARTY_NOTICES.md`, the fonts and their
  licence texts, the icons and the tour.

`TERMS_VERSION` is still 9 (agreement version 9, privacy statement version 10). The permissions and the
approval check's fields are unchanged, and nothing new is sent anywhere.

**`PRIVACY.md` does not yet describe the debug log.** The debug log is held in the background's memory
only. It is never stored and never sent anywhere, and it is cleared whenever Chrome stops the service
worker. While it lasts it holds the account, the worker's name, job ids, nodes (as the gate's replies name
them) and the first 160 characters of each gate reply, besides what the worker's files said and the
commands' names and outcomes. `PRIVACY.md`'s table of what the extension keeps lists the session state,
Show log and the audit log, and has no row for it. `PRIVACY.md` was deliberately not edited in either build
of 14.0.0. A row changes the statement's hash, and with it the version students accept. **Whether and how
`PRIVACY.md` describes the debug log is Greg's decision, before any store upload** (`docs/V12_STATUS.md`,
"2026-10-03 morning").

## What was checked on these files

All of this ran on 2026-10-03, on Greg's Windows 11 laptop and its WSL Ubuntu 24.04, for the second build.
The logs are in this session's scratchpad, `fourteen2/logs/` (the morning's build: `fourteen/logs/`).

- **Helper:** `node helper/build.mjs --check` passed. The four files in `extension/public/bridge/` match a
  fresh build of bridge 1.0.0, the same bytes as 13.0.0's.
- **Extension:**
  - `npx tsc --noEmit` exit 0; `npm run build` (Chrome MV3 and Firefox MV2) and `npm run zip` exit 0.
  - `npx vitest run` after the build: **42 files, 516 of 516 tests passed, none skipped** (the morning's
    509 and 7 new). The three package tests in `test/hygiene.test.ts` read this build (run again verbosely,
    all three name 14.0.0).
  - New tests: `test/debuglog.test.ts`; the 14.0.0 cases in `test/facts.test.ts`, `test/steps.test.ts`
    and `test/contract.test.ts`; in `test/background12.test.ts`, the debug log after a first sign-in and a
    worker online on a session link through the ssh stand-in; and in `test/background.test.ts`, framework
    13's file of a resumed session on the GlobalProtect way.
  - The second build's 7: cursor codes before a link and a name (`test/shell.test.ts`,
    `test/contract.test.ts`); a link cut mid-write (`test/contract.test.ts`); the hand-over, where the
    successor online before its own link is read has no link and is `connecting`, the old `rc.log` downloaded
    late is passed over, and then the successor has its own link, and `environmentLink`
    (`test/facts.test.ts`); New session with any environment link reported, and the last
    known state's `new_session_url` (`test/steps.test.ts`); and on the GlobalProtect way, a worker that
    printed both links opens its session tab with the session link, while New session opens the environment
    link (`test/background.test.ts`). The hand-over and cut-link tests were also run with their fix taken
    out: both failed, and the sources were restored byte for byte.
- **The zip** holds 42 entries. It has no `.map`, no `.ts`, no `sourceMappingURL`, no `eval(` and no `new
  Function(`.
- **Manifest** (read from this zip):
  - version 14.0.0;
  - permissions exactly `storage`, `alarms`, `scripting`, `nativeMessaging`, `sidePanel`;
  - `optional_host_permissions` `https://*/*`;
  - no `host_permissions`, `content_scripts`, `externally_connectable` or `key`;
  - nothing names claude.ai, claude.com or anthropic.com.
- **Framework 14** ran on a copy of the working tree's `framework/` in WSL (`wsl -e bash -lc`): `bash
  framework/tests/run.sh` under bash 5.2.21, Python 3.12.3, GNU Awk 5.2.1 and GNU sed 4.9: **379 of 379
  tests passed, none skipped**, "ALL OK", in 544 s. That is 13.0.0's 366, plus the morning's 8, plus the
  second build's 5:
  - the morning's 8: `test_cli.py` `Registration` (the session form alone, both forms, claude.com,
    lookalikes), `test_job.py` (a resumed session's link, both forms), `test_status.py`
    `test_online_with_a_resumed_session_link` and `test_watch_json.py`
    `test_online_with_a_resumed_session_link_is_the_end`;
  - the second build's 5: in `test_cli.py` `Registration`, cursor codes right before the link and the name,
    a link cut mid-write, and `hpcw_complete_lines`; in `test_login_plain.py`, ESC[K right before the
    authorize link; and in `test_job.py`, the whole job against a link line written in two parts with ESC[K
    before it. Each was also run against its defect put back (framework 13's sed; `hpcw_complete_lines`
    made a pass-through) and failed.

  The changed ones include `test_job.py` `test_online_then_stopped` (the environment form's
  `session_url`, `environment_id` and message), `test_render.py` and `test_version_says_14`. Not run: bash
  4.2.46 (EL7's) and `tests/e2e_sshd.sh`.
- **`deploy_shared.sh`'s local checks**, replayed without publishing: `framework/VERSION` 14 matches the
  `VERSION=14` line in `bin/hpcworker`; the 18 files it would publish have no CR line endings; and `bash
  -n` passes on `bin`, `lib`, `lib/adapters` and `jobs`.
- **This folder:** `bridge/` compared with `cmp` against `release/13.0.0/bridge/` (identical), and its
  own `SHA256SUMS.txt` verified. The four guides compared with `cmp` against `docs/guides/`, and
  `STUDENT_QUICKSTART.md` against `release/13.0.0/guides/`. `SHA256SUMS.txt` verified with `sha256sum -c`
  from inside the folder.

## What is not proven

- **Nothing on the grid.** Framework 14 has not run on Wayne State's machines. Its parser was run under
  GNU Awk 5.2.1 and 5.0.0, not under warrior's gawk 4.0.2. Everything 13.0.0's README lists as unproven
  still stands, with the tests G0 to G3 (`docs/V12_STATUS.md`, section 4).
- **What Claude Code prints around a resumed session.** Only the three lines above are known; they are
  as relayed from the morning, and this build did not read that job's files. Whether such a block prints a
  session name is not known. If it does, the job does not take it, and the worker keeps its requested
  title.
- **claude.com.** The claude.com form of both links is accepted on the contract's word. None has been
  seen.
- **The debug log's lifetime.** The log is lost whenever Chrome stops the idle service worker, about 30 s
  after the last event while the panel is closed. A log copied long after the panel was closed holds only
  what came since.
- **The browser harness was not run** (it needs a visible browser), nor `tests/e2e_sshd.sh`.
- **The mock portal's job simulator** does not print the session form. The store kit and the reviewers'
  mock portal zip were not rebuilt.
- **Cursor codes and newlines around the link.** Whether Claude Code ever prints a cursor code right before
  its link is not known; the second build's first fix is proven on test transcripts only. That the link line
  is always followed by a newline is assumed: a link printed as the very last thing, with no newline after
  it, is now not seen until something follows it.
- **Observed, not fixed: `rc.log` on a restart within a job.** The job starts `script -qfc … rc.log`
  without `-a`. With util-linux 2.39.3 (measured here) that truncates the file, so the job's own header line
  is lost. On a restart within a job, `RC_OFF` is then the old file's size, and `clean_tail` may skip the
  start of the new output, the new registration included. Not measured on the grid, and not changed
  (`docs/V12_STATUS.md`, "2026-10-03, later").

## How to install

0. **Publish framework 14 on the grid first.** From the laptop's checkout, run the dry run first:

   ```
   tools/deploy_shared.sh --site wayne --dry-run
   tools/deploy_shared.sh --site wayne
   ```

   Until it is published, a worker that resumes a session still shows "Connecting to Claude…" on the
   direct way.
1. **Remove every older Beethoven first.** In `chrome://extensions`, remove each Beethoven card, whether
   13.0.0 or older, from the store or loaded unpacked. Two copies side by side sign each other out of the
   grid.
2. **Before students reinstall**, turn the one-installation switch Off on the admin page, or move each
   student's approval: each reinstalled copy is a new installation. Turn it On again when they are done.
3. **Then install 14.0.0**, from the private Chrome Web Store listing once this zip is uploaded and
   published. To test by hand, unzip `beethoven-14.0.0-chrome.zip` into a folder, open
   `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose that folder.
4. **Sign in to the grid once more.** The browser's key went with the removed copy.

**The bridge from 12.0.0 keeps working.** The helper is the same, byte for byte (helper 1.0.0, protocol
1). An installed helper serves the extension ID it was saved from. A store copy keeps its ID across a
reinstall. An unpacked copy loaded from a new folder offers the helper download again (13.0.0's README, "The
bridge from 12.0.0 keeps working").

## The helper zips (`bridge/`)

| File | Size (bytes) | Opens | SHA-256 |
|---|---|---|---|
| `beethoven-bridge-windows.zip` | 12,663 | `install.cmd` | `cc9f0d5abcf9433f9ca27cb0067a9dc1acec604e4650113de688320ab0d3320b` |
| `beethoven-bridge-mac.zip` | 9,174 | `install.command` | `ddefba0df0d7e4c7053ce5002eebd473436805f8d656b360383731c47d30959e` |
| `beethoven-bridge-linux.zip` | 13,202 | `install.sh` | `761b4c8a0dd39dd62242fa052978912f7bf8c7c8011cd9a7886e41ebd8246ffa` |
| `manifest.json` | 906 | | `7be3b5178a7f9e083e917e5e7f0ef1fa45483b90f372bc6375b01d3f367e81f1`; lists the three, the helper 1.0.0, protocol 1 |

## Not done here

Nothing was committed, tagged, uploaded to the store, published to the grid or deployed. Framework 14 is
not on the grid. `extension/package.json` and `package-lock.json` say 14.0.0.
