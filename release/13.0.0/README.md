# Beethoven 13.0.0 package, helper and guides

**Superseded by 14.0.0 (`release/14.0.0/`, 2026-10-03): install that one instead, after publishing framework 14; the entry for this README in `SHA256SUMS.txt` was regenerated after this line was added, so the folder verifies.**

Rebuilt 2026-10-03 at 05:38 UTC, after the review of the first 13.0.0 build, from this repository's
working tree (not committed; `extension/`, Node 22.23.3): `node helper/build.mjs --check`, `npx tsc
--noEmit`, `npm run build`, `npm run zip`, then `npx vitest run` with the built package present. The first
13.0.0 build (04:38 UTC, 498,262 bytes, SHA-256 `e55406fa…1ce477`) is replaced here and must not be
uploaded. Checksums of every file in this folder are in `SHA256SUMS.txt`; `sha256sum -c SHA256SUMS.txt`,
run inside this folder, checks them.

**Nothing in this build touched the real grid.** No step of this pass was pointed at `grid.wayne.edu`,
the access service or any other real server: the unit tests ran against stand-ins on this computer, and
the framework suite ran in WSL against a fake scheduler. Framework 13 is not deployed, and nothing was
committed, pushed or uploaded.

| File | For | Size (bytes) |
|---|---|---|
| `beethoven-13.0.0-chrome.zip` | The private Chrome Web Store listing, or a test install by hand | 498,346 |
| `bridge/` | Copied unchanged from `release/12.0.0/bridge/`: **the bridge did not change** (helper 1.0.0, protocol 1). The same bytes as `bridge/` inside this package, with their own `SHA256SUMS.txt` | 4 files and the sums |
| `guides/` | `INSTALL.md` and `USE.md` (students; each has a 13.0.0 paragraph at the top), `ACCOUNTS.md` and `LAB_LEAD.md` (Greg), copied from `docs/guides/`, and `STUDENT_QUICKSTART.md` (one page), copied from `release/12.0.0/guides/` | 5 files |
| `SHA256SUMS.txt` | SHA-256 of every other file in this folder | |

The package's SHA-256 is `eaca8b48d6de37e9127b25e92dcb1c31929c334ae40572214b12c45d562ec020`. Upload
this copy (`release/13.0.0/beethoven-13.0.0-chrome.zip`), not `extension/.output/`, which the next build
rewrites. As since 8.0.0, the Chrome zip is the only package.

`STUDENT_QUICKSTART.md` is 12.0.0's page, unchanged, and its heading still says 12.0.0; none of its steps
changed in 13.0.0. `ACCOUNTS.md` and `LAB_LEAD.md` are the same files as in `release/12.0.0/guides/`
(`LAB_LEAD.md` as revised on the evening of 2026-10-02 for grid access, below); `LAB_LEAD.md`, section
2, still tells you to publish framework 11, and the same two commands publish 13.

Not in this folder, and not rebuilt: the store kit and the reviewers' mock portal zip.
`release/12.0.0/store-kit/` holds 12.0.0's package as its file `00-` and names 12.0.0 in `PASTE.md` and
`07-SCREENSHOTS-OUT-OF-DATE.txt`: upload this folder's zip in its place. The mock portal zip in
`release/12.0.0/reviewer/` carries the job simulator from before 13.0.0, which heartbeats only an online
run, so a mock run left more than three minutes in "starting" or waiting for the Claude sign-in reads as
stale there. Rebuild that zip from `extension/mock-ood/` before sending it to a reviewer.

## What 13.0.0 changes against 12.0.0

**The direct-way dead-run fix (in the package).** On 2026-10-02 a fresh 12.0.0 on the direct way showed
"Starting · Connecting to Claude…" with no button for an hour, and no connect was ever sent. Which status
file that panel read is not recorded, so the cause is stated conditionally in `docs/V12_STATUS.md`
("2026-10-02 evening: the direct-way hang"). 13.0.0 fixes the extension's part of both readings:

- On the direct way the heartbeat is now the status file's own `updated_at`. A read counts as a sign of
  life only when the file changed since the last read of the same job. 12.0.0 stamped each read's own
  moment as the file's modified time, so a dead worker's heartbeat never aged. The result was
  "Connecting to Claude…" with no button, or, with a link in the file, "Online · up 2 h". The cost: a
  fresh copy can show a live worker whose grid clock lags this computer's as stale (with Connect) for up
  to one heartbeat (30 s), until the worker's next write changes the file.
- A run that was already in the folder, and that this browser has never seen alive, gets **Connect**
  once it is stale (on the first-run screen and on the home), unless a Stop or a Connect is under way. On
  the home that holds whatever its last known state, "Online" and "Needs you" included, since after a
  browser restart a run counts as found. Signed in, the "As of" line then reads "As of 9:02 AM. Your
  worker isn't answering now." instead of asking for a sign-in to the grid (new words; signed out it is
  unchanged). A run started by the student's own Connect, or one seen alive, that is only quiet keeps
  "Starting" or "Still connecting", with no Connect: the real worker writes nothing for up to about three
  minutes on a cold node.
- A stale run with no last known state shows **Stopped** with **Connect** and a plain toolbar when it is
  a found run never seen alive. The student's own run, or one seen alive, shows its phase instead, for
  example "Still connecting", not live, with no Connect and a plain toolbar.
- While a run is renewing (a job that ended naming its next job), Beethoven asks `worker status --json`
  once a minute, as it already did while a run was in line. That is how framework 13's answer reaches a
  panel (below).
- An earlier Connect's "queued" no longer holds "In line for a computer" once its run has stopped or
  ended. This was hy9698's hour in line on the GlobalProtect way.
- The ssh client no longer leaves an unhandled rejection when a connection ends while a channel is
  being opened.

In the package, compared entry by entry with `release/12.0.0/beethoven-12.0.0-chrome.zip`: 42 entries
in both. **Changed (7):** `background.js` (296,797 to 297,921 bytes; the panel's views are computed
there); `manifest.json` (only the version, 12.0.0 to 13.0.0; the same 1,064 bytes); the three page
chunks, renamed because their content hash moved: `chunks/routes-*.js` (76,186 to 76,249 bytes, the
words table with the new "As of" sentence), and `chunks/options-*.js` and `chunks/sidepanel-*.js` (the
same sizes, 19,628 and 46,279 bytes; they name the routes chunk); and `options.html` and `sidepanel.html`
(the same sizes; they name the chunks). **The same, byte for byte (35):** the stylesheet,
`content-scripts/portal.js`, `profiles/wayne.json`, the four `bridge/` files, `LICENSE.txt`,
`PRIVACY.md`, `THIRD_PARTY_NOTICES.md`, the fonts and their licence texts, the icons and the tour.
Against the first 13.0.0 build, the same entries changed except `manifest.json` (`background.js`
297,668 to 297,921 bytes).

`TERMS_VERSION` is still 9 (agreement version 9, privacy statement
version 10): the texts are 12.0.0's. A copy updated in place is not asked again; a copy installed after
the old one was removed shows the welcome page's one tick again, because its acceptance went with the
old copy. The permissions and the approval check's fields are unchanged.

**Framework 13's successor check (on the grid, not in the package).** A job that ends at its wall time,
is preempted or is cancelled writes `preempted` into `status.json`, naming its successor in `next_job`.
Until framework 13 nobody asked whether that successor still existed. Now `worker status` and
`worker watch` (the gate's `status` and `watch`) ask the scheduler about the job and its successor in one
call (`squeue -h -j JOB,NEXT -o '%i|%T|%N'`, the call `worker start` makes), under the same floor as a job
in line (`checked_at`). If the job itself is still listed in any state but ended (PENDING, REQUEUED,
CONFIGURING, RUNNING, COMPLETING: a job preempted under `--qos=requeue` comes back under its own id), the
record is left alone, whatever the successor's state; nothing is written, not even `checked_at`, so each
`worker status` asks once while the job is listed. If the job is gone or ended and the successor is in line
or running, the record stays as it is, with the successor's `scheduler_state`. Only when the job is gone or
ended and the successor is gone or ended (not listed, or listed as ended) does the record become `stopped`
with `stop_reason` `successor_gone`, and the panel shows **Stopped** with **Connect**. Version 13 is in
`framework/VERSION`, `bin/hpcworker` and `tests/test_status.py`, and `framework/README.md` explains it ("A
chain whose next job is gone (framework 13)"). **Until framework 13 is published**, the grid answers as
framework 12 does. 13.0.0 then still shows such a worker as starting, with no button. Publish it from the
laptop with `tools/deploy_shared.sh --site wayne --dry-run`, then without `--dry-run` (step 0 below).

**The one-installation switch, now on the access service (not in the package).** Removing an extension
removes its installation identifier, so a reinstalled copy is a new installation. Under the
one-installation rule each student's 13.0.0 would be refused ("This account is already set up on
another computer. Ask your lab lead to move it here.") until their approval is moved. The access
service now has a service-wide switch for that rule: "One installation per account: On / Off" on the
admin page, or `node tools/intake/admin.mjs settings seat-rule any|one` in the `ashley` repository. Off
lets every installation of an approved account through and keeps the seats, so On restores the rule
exactly. Turn it Off while students replace their copies and On afterwards. A copy approved while it
was Off keeps its cached yes for up to a day (seven days offline) after On. The record of this is
`ashley` commit 8d7fc65, whose message says the service was deployed under both names on 2026-10-03,
and the admin page row is in site commit e4bca56. This pass did not check either against the live
service. The extension needed no change for it.

**Grid access follows approval (not in the package).** Since commit 275c5eb (2026-10-02, after 12.0.0
was built), `tools/grid_access.sh` keeps the list of named users on `/rs/rs_grp_oschome` equal to the
access service's roster of extension approvals. It runs every fifteen minutes from Greg's PC
(`tools/grid_access_task.ps1`), and `deploy_shared.sh` publishes the tree readable below that gate. A
newly approved student's setup ends in `Permission denied` until they are on the list (`LAB_LEAD.md`,
sections 1 and 9). Whether the scheduled task is installed and has run was not checked here.

## What was checked on these files

All on 2026-10-03, on Greg's Windows 11 laptop and its WSL Ubuntu 24.04. Logs of the rebuild are in this
session's scratchpad, `thirteen2/build/logs/` (the first build's in `thirteen/build/logs/`).

- **Helper:** `node helper/build.mjs --check` passed: the four files in `extension/public/bridge/` match
  a fresh build of bridge 1.0.0, the same SHA-256 as 12.0.0's (table below). The first 13.0.0 build also
  rewrote them with `node helper/build.mjs`, to the same bytes; this rebuild did not.
- **Extension:** `npx tsc --noEmit` exit 0; `npm run build` (Chrome MV3 and Firefox MV2) and `npm run
  zip` exit 0; `npx vitest run` after the build: **41 files, 483 of 483 tests passed, none skipped**,
  so the three package tests in `test/hygiene.test.ts` read this build (run again verbosely: all three
  name 13.0.0). The sources zip in `extension/.output/` (not in this folder) carries `package.json` and
  `package-lock.json` at 13.0.0. The zip holds 42 entries. It has no `.map`, no `.ts`, no key or
  certificate, no `sourceMappingURL`, no `eval(` and no `new Function(`. The packaged `LICENSE.txt`,
  `PRIVACY.md` and `THIRD_PARTY_NOTICES.md` are byte-identical to the repository's, and the four
  `bridge/` entries to `release/12.0.0/bridge/`.
- **Manifest** (read from this zip): version 13.0.0; permissions exactly `storage`, `alarms`,
  `scripting`, `nativeMessaging`, `sidePanel`; `optional_host_permissions` `https://*/*`; no
  `host_permissions`, `content_scripts`, `externally_connectable` or `key`; nothing names claude.ai,
  claude.com or anthropic.com. The Firefox build (not shipped) asks for no `nativeMessaging`.
- **Framework 13** (a copy of the working tree's `framework/` in WSL, `wsl -e bash -lc`): `bash
  framework/tests/run.sh` under bash 5.2.21 with Python 3.12.3, **366 of 366 tests passed, none
  skipped**, "ALL OK", in 476 s. The new tests are among them: `SuccessorOfAnEndedJob` (9, with the job
  itself listed again as PENDING, REQUEUED, CONFIGURING, RUNNING or COMPLETING and left alone, and the job
  ended with its successor gone, stopped), `Ends.test_a_job_listed_again_is_not_the_end` in
  `test_watch_json.py`, `StatusPatch.test_preempted_guard`, `test_top_field_reads_the_top_level_only` and
  `GateReal.test_status_and_watch_stop_a_chain_whose_successor_is_gone`. Not run this time: bash
  4.2.46 (EL7's) and `tests/e2e_sshd.sh`.
- **`deploy_shared.sh`'s local checks**, replayed without publishing: `framework/VERSION` 13 matches the
  `VERSION=13` line in `bin/hpcworker`, no CR line endings in the 18 files it would publish, and `bash
  -n` passes on `bin`, `lib`, `lib/adapters` and `jobs`.
- **This folder:** `bridge/` compared with `cmp` against `release/12.0.0/bridge/` (identical), and its
  own `SHA256SUMS.txt` verified. The four guides from `docs/guides/` compared with `cmp` against their
  sources. `SHA256SUMS.txt` verified with `sha256sum -c` from inside the folder.

## What is not proven

- **Nothing on the grid.** None of the following ran on Wayne State's machines: framework 13's
  successor check against their Slurm (how `squeue -j JOB,NEXT` answers for a cancelled successor, a
  requeued job or an id it no longer knows), the new `status_patch` guard under warrior's gawk 4.0.2, or
  the gate's `status` and `watch` there. Everything 12.0.0's README lists as unproven still stands, with
  its tests G0 to G3 (`docs/V12_STATUS.md`, section 4).
- **The browser harness was not run.** It needs a visible browser.
- **The cause of Greg's hang** is known only conditionally. What `worker/status.json`, and any
  `wayne-worker/status.json`, said while the panel was on screen is not recorded.
- **The trade-off of the fix.** A run this browser has seen alive whose worker then dies without writing
  an end state (SIGKILL, a node failure) keeps its last known state, or "Still connecting", and the home
  offers no Connect for it until a browser restart makes it a found run.
- **Two copies side by side** still remove each other's browser key at every sign-in (one line per
  account on the grid). Hence the first step below.
- **hy9698's sittings** that failed with exit 3 about 4 min 20 s after each job started remain
  unexplained.

## How to install

0. **Publish framework 13 on the grid before students install**, from the laptop's checkout, the dry run
   first:

   ```
   tools/deploy_shared.sh --site wayne --dry-run
   tools/deploy_shared.sh --site wayne
   ```

   Until it is published, the grid answers as framework 12 does, and a worker whose next job was
   cancelled still shows as starting, with no button. The guides' sentences about **Stopped** with
   **Connect** for that case hold only once framework 13 is published on the grid.
1. **Remove every older Beethoven first.** In `chrome://extensions`, remove each Beethoven card,
   whether 12.0.0 or older, from the store or loaded unpacked. Two copies side by side sign each other
   out of the grid.
2. **Before students reinstall**, turn the one-installation switch Off on the admin page, or move each
   student's approval, because each reinstalled copy is a new installation. Turn it On again when they
   are done.
3. **Then install 13.0.0**: from the private Chrome Web Store listing once this zip is uploaded and
   published, or, to test by hand, unzip `beethoven-13.0.0-chrome.zip` into a folder, open
   `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose that folder.
4. **Sign in to the grid once more.** The browser's key went with the removed copy. The new sign-in
   writes a new key line, which replaces the old one.

**The bridge from 12.0.0 keeps working.** The helper is the same, byte for byte (helper 1.0.0, protocol
1). An installed helper serves the extension ID it was saved from. A copy from the store has the same
ID before and after a reinstall, so a helper installed from a store copy serves every later store copy,
and the student does not install it again. An unpacked copy's ID comes from its folder's path: 13.0.0
loaded from the folder 12.0.0 was loaded from keeps that helper, and 13.0.0 loaded from a new folder
offers the helper download again, made out to that copy. That is by design (`helper/README.md`,
`docs/store/TEST_BEFORE_UPLOAD.md`) and was not tried in this pass.

## The helper zips (`bridge/`)

| File | Size (bytes) | Opens | SHA-256 |
|---|---|---|---|
| `beethoven-bridge-windows.zip` | 12,663 | `install.cmd` | `cc9f0d5abcf9433f9ca27cb0067a9dc1acec604e4650113de688320ab0d3320b` |
| `beethoven-bridge-mac.zip` | 9,174 | `install.command` | `ddefba0df0d7e4c7053ce5002eebd473436805f8d656b360383731c47d30959e` |
| `beethoven-bridge-linux.zip` | 13,202 | `install.sh` | `761b4c8a0dd39dd62242fa052978912f7bf8c7c8011cd9a7886e41ebd8246ffa` |
| `manifest.json` | 906 | | `7be3b5178a7f9e083e917e5e7f0ef1fa45483b90f372bc6375b01d3f367e81f1`; lists the three, the helper 1.0.0, protocol 1 |

As in 12.0.0, these are the packaged files, and their installers refuse to run as they are: each carries
the placeholder origin (`manifest.json`: `"origins_filled": false`). A student never gets this file. The
extension's page writes its own ID into a copy and saves that copy (12.0.0's README, "The helper zips").

## Not done here

Nothing was committed, tagged, uploaded to the store, published to the grid or deployed. Framework 13
is not on the grid. Which framework the grid runs now is not recorded here: the status note says the
gate's `status` there is framework 12's, while `LAB_LEAD.md`, section 2, still describes framework 10
as deployed. `extension/package-lock.json` now says 13.0.0, as `package.json` does. No `CHANGELOG.md`
exists in the repository. The store kit and the reviewers' mock portal zip were not rebuilt for 13.0.0,
and the five new screenshots were not captured.
