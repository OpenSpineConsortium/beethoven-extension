# Beethoven 21.0.0 for the lab lead

For Greg (and any lab lead after him). Written 2026-10-02 by the texts stream of the 12.0.0 build
and corrected by fixer B after the four reviews, against framework 11 as it then stood in the
working tree; rewritten 2026-10-08 for 16.0.0, which removed the direct way of 12.0.0 to 15.0.0
whole, brought up to date 2026-10-09 for 19.0.0, in which Beethoven signs in to the grid, and on 2026-10-11 for 20.0.0, which approves a student from every installation of their own, and on 2026-10-13 when 20.0.0's listing became public, and on 2026-10-16 for 21.0.0, which opens a student's Claude project. The grid tests `docs/V12_STATUS.md` listed for that way are moot. Section 9, who can read the
lab's folders on the grid, was added 2026-10-02 with `tools/grid_access.sh` and revised that evening
after its review.

**14.0.0 and framework 14 (2026-10-03).** Two changes, both in sections 11 and 12 below: a worker
that resumed an earlier session (Claude Code prints that session's own link,
`https://claude.ai/code/session_…`, and no environment link) is read as online, which framework 14
writes into `status.json`; and the panel keeps a debug log in memory that a student copies for you
with **⋯** (More), **Copy debug log**. Publish framework 14 with the two commands of section 2
(`--dry-run` first), as for 11 and 13.

**15.0.0 and framework 17 (2026-10-04).** On the grid, Beethoven never signs anyone out of Claude:
framework 17 refuses the `--login fresh` that earlier builds typed for **Use another account**, no
build since 15.0.0 asks for it, and a student who needs another Claude account signs out of Claude
Code themselves, then presses **Sign in again** (section 13). (15.0.0 also shipped the helper as a
signed installer; 16.0.0 removed the helper, section 5.)

**16.0.0 (2026-10-08).** One way to the grid: the university's VPN (GlobalProtect at Wayne State)
and the Open OnDemand portal, inside the student's own signed-in browser session, as in 11.0.0. The
bridge, the sign-in sheet, the key in the browser and its line in the grid account, the gate, the
passkey, **Forget this computer**, the phone route, the relay and the pilot app are gone (Greg's
decision; section 1). What an earlier version may have left in a student's account or on their
computer, and how it goes, is section 5. The agreement is now version 11 and the privacy statement
version 12, both of 2026-10-08, so every student accepts once more.

**19.0.0 (2026-10-09).** Beethoven signs in to the grid (Greg's decision card, tapped 2026-10-09
03:01Z). When the portal asks for its HTTP Basic sign-in, the panel's sheet **Sign in to the grid**
takes the student's AccessID and password, and Beethoven's background answers the portal's challenge
for its own request to the portal's dashboard, on the one granted origin, once per check; a tab's
challenge still gets Chrome's own box, and **Use Chrome's sign-in box instead** keeps 18.0.0's way.
The first refusal stops every automatic sign-in until the student types the password again. Saving
the password is off unless the student ticks **Remember it on this computer**: then it is encrypted
on that computer under a key a passkey named "<AccessID> (grid)" releases with Windows Hello, Touch
ID or the screen lock, until **Forget**. Wayne State's Strong Password Standard says never to save
passwords in web browsers or computer programs, so tell Wayne State students to leave it off (section
3). Nothing changes on the grid: no framework change, no new line typed, and the VPN is still needed.
The manifest gains `webRequest` and `webRequestAuthProvider` (no install warning). The agreement is
version 12 and the privacy statement version 13, of 2026-10-09, so every student accepts once more.

**20.0.0 (2026-10-11, public listing 2026-10-13).** One person's approval, every installation of
their own (Greg's decision of 2026-10-11), on a public Chrome Web Store listing (2026-10-13): a
student installs it from the site's Beethoven page without an invitation, and the approval alone
decides whether it works, so the Google Group `Beethoven-users` and the request form's Google account
are retired. A student's second computer, another Chrome profile or a reinstallation is approved at
its first check, where 8.0.0 to 19.0.0 refused it until you moved the approval. The access service
records each installation an account asks from (its random identifier, the product, the version,
first and last seen), keeps the ten most recent, and e-mails you, at most once a day per account,
when a new one asks: a notice, with one link, **Withdraw approval**, which you press only when the
installation cannot be the student's; there is no Move link and nothing to move. `admin.mjs seat
<AccessID>` still shows an account's installations and `reset-seat` still forgets them, and one
installation still serves one account: a browser first used with another student's AccessID is
refused for this one until you release it (`reset-seat` or `remove` on the account that holds it).
The agreement is version 14 and the privacy statement version 15, of 2026-10-13, so every student
accepts once more.

**21.0.0 (2026-10-16).** A student who works in a Claude project on claude.ai names the project's
address in **Settings**, **Your project on claude.ai** (copied from the address bar; Beethoven keeps
`https://claude.ai/code/project/<id>` alone and refuses a session's link). The panel's button is
then **Open my project**, with "In your project, choose Work locally from the + menu, write the
task, and press Allow once on the card." under it, and the tab opened when the worker is ready is
the project's page: a project cannot take the session the worker started by itself and reaches the
worker only through its own *Work locally* (code.claude.com/docs/en/claude-projects, "Run a thread
on your own computer"). **New session**, **Copy link** and **Phone** keep the worker's own link.
Nothing changes on the grid: no framework change and no new line typed. A project's thread needs
Claude Code 2.1.280 or later in the worker, and the image's is 2.1.283 (hpcworker's
`docs/OPEN_QUESTIONS.md`); it is not available where an organization requires trusted devices.
Whether the next job of a worker's chain brings a project's thread back by itself is not yet
measured. The agreement is version 15 and the privacy statement version 16, of 2026-10-16, so every
student accepts once more.

## 1. What changes for you

- **One way to the grid again: GlobalProtect and the Open OnDemand portal**, inside the student's
  own signed-in browser session, as in 11.0.0. The direct way of 12.0.0 to 15.0.0 (ssh to
  `grid.wayne.edu` through a helper on the student's computer, a key in the browser with a
  restricted line in `~/.ssh/authorized_keys`, the gate, the sign-in sheet, the passkey, **Forget
  this computer**, the phone route, the relay and the pilot app) is gone whole: it could not work
  without a program outside the browser, and a student with the VPN has the portal. The manifest is
  11.0.0's again: `storage`, `alarms`, `scripting`, `sidePanel` and the optional `https://*/*` host
  the student grants at click time; no `nativeMessaging`. Since 19.0.0 it also asks for `webRequest`
  and `webRequestAuthProvider`, for one listener that answers the portal's HTTP sign-in (never
  `webRequestBlocking`). Beethoven works offline on the last good lists as before. 19.0.0's sign-in
  sheet is not the direct way: no ssh, no helper, no code, and the VPN is still needed.
- **Beethoven signs in to the portal with the password the student gives it (19.0.0), and never asks
  for a code.** The student types the AccessID and password into Beethoven's sheet, or chooses
  Chrome's own box. From the sheet the password goes only to the portal, as the answer to the HTTP
  Basic challenge of Beethoven's own background request, on the granted origin (and, once a password
  Beethoven gave has worked, that sign-in's realm), once per check; never to a tab's, a proxy's or
  another site's challenge, never to the vendor, never into a log, the audit log or the debug log.
  Beethoven itself sends a password the grid turns down at most once. Chrome re-sends its cached
  copy once for each request already started with it before the first refusal comes back; Beethoven
  then sends at most one; when the answered request is abandoned before the grid replies, Chrome may
  re-send that copy once. How many of these the grid counts is not yet measured. Beethoven never
  fills in the university's sign-in pages or an identity provider, never touches Microsoft
  Authenticator or a code, and never types a password into a shell. The approval check still names
  the account the portal's dashboard shows, never the typed AccessID. 11.0.0's one-time grid key
  step stays: when the portal's shell asks for a password while a press waits, the student types it
  into the university's own terminal page, and Beethoven's page script watches that tab's title only
  and types one login-setup line after **I'm in**. The terminal may ask for the Google Authenticator
  code too; the panel's one warning there, "Don't run 2FA Setup if you have one: it replaces it.",
  is about that terminal. That step is not yet measured on the grid by a student without a key.
- **A press made while the grid is out of reach is kept.** The panel shows **Turn on
  GlobalProtect.** with **How to set it up** (the site profile's `vpn_help_url`: Wayne State's KB
  20314) and "Beethoven carries on by itself as soon as the grid answers."; reach is re-checked
  every 3 seconds while a Beethoven page is open and once a minute while none is, and the press goes
  ahead by itself when the grid answers. **Keep my worker running** also starts a worker read as
  ended again, at most three times in a row without a press of the student's.
- **Every line a student's Beethoven types runs your shared copy**, through the portal's shell:
  `hpcworker install --shared`, `discover`, `probe`, `worker start|stop|restrict|status --json`,
  `claude login --plain` and `hpcworker connect`; no `gate`, no `browser-key`. Whoever can change
  `/rs/rs_grp_oschome/shared/beethoven/hpcworker/current`, or anything under it, can run anything in
  every enrolled student's account the next time their Beethoven types a line. `deploy_shared.sh`
  publishes the copy readable and never writable by others (section 9); keep it so.
- **No python3 on the login node for anything Beethoven types.** Framework 11 reads the site profile
  and fills the job file and the workspace guide with awk and bash (section 6).
- **An approval for the extension also opens the lab's folders on the grid.** The AccessIDs approved
  with the extension grant (`admin.mjs approve`, or `grant <id> extension`) are the list of accounts
  that may enter the lab's volume, kept on the grid by `tools/grid_access.sh`, every fifteen minutes
  from your PC (section 9). An approval for the lab only (`approve-lab`) does not put anyone on it,
  and neither does the store reviewers' mock account. Until a newly approved student is on it, their
  setup ends in `Permission denied`. Otherwise approvals are as before, except that since 20.0.0 an
  approval covers every installation of the student's own: a new computer needs nothing from you,
  and the e-mail about it is a notice whose one link withdraws. Withdrawing an approval takes their
  AccessID off the list at the next run (section 9); a line an earlier version added to their
  `~/.ssh/authorized_keys` is not touched by it (section 5).

## 2. Before the first student

Nothing of the direct way is a condition any more: no gate, no `browser-key check`, no sticky-bit
rule on the folders above the copy, no test sign-in of your own and no note to C&IT. What remains:

1. **Publish the framework**, from the laptop's checkout of hpcworker, as for every version:

   ```
   tools/deploy_shared.sh --site wayne --dry-run
   tools/deploy_shared.sh --site wayne
   ```

   It checks `VERSION` against the tool, LF line endings and `bash -n`, tars exactly the files it
   lists with a SHA-256 manifest, and on the login node extracts them to `.../hpcworker/v<N>`, sets
   read for the group and for others and no write (who gets in at all is the list, section 9), and
   switches `current` in one rename; older versions are kept for workers that started on them. Its
   last check runs `hpcworker profile check` on each site profile (awk, the same verdict `profile.py
   validate` gives) instead of `python3`, which warrior's banner bans. 16.0.0 never calls the copy
   outdated, whatever version `current` names: it types nothing that framework 11's gate added.
   Framework 14 or later writes a resumed session's link into `status.json` (section 11); framework
   17 refuses the `--login fresh` earlier builds typed (section 13).
2. **Put the student on the list** (section 9) before their first **Connect**, or their setup ends
   in `Permission denied`.
3. **Tell them to turn GlobalProtect on first.** The welcome page lists it among the three needs,
   with Wayne State's own page behind **How to set it up**; a press made without it waits and goes
   ahead by itself (section 1).

## 3. What to tell C&IT

Nothing new for 16.0.0. Students reach the grid through the VPN and the portal, as Wayne State's own
pages describe, and nothing of Beethoven's is installed on the grid but the lab's own scripts in the
group folder.

19.0.0 raises two questions only C&IT can answer, worth asking before students update: whether a
wrong password sent as an HTTP Basic answer to `ondemand.grid.wayne.edu` counts toward the five wrong
passwords after which an AccessID is disabled (reactivation can take up to three business days); and
whether the Strong Password Standard ("Never save passwords in web browsers or computer programs;
instead, type them in each time you need them.") allows a password kept encrypted behind a Windows
Hello or Touch ID passkey. Until they answer, tell students to leave **Remember it on this computer**
off; the sheet already says "Your university may ask you to type your password each time; if it
does, leave this off." Neither answer is recorded yet. The draft 12.0.0 kept here, about students' browsers signing in to `grid.wayne.edu`
directly with restricted keys, is withdrawn with the direct way; whether it was ever sent is not
recorded in these texts. If it was, tell C&IT that no such key is added any more and that the lines
already in students' `~/.ssh/authorized_keys` are being removed (section 5).

When you write to them at all, say which rules are whose: only one rule about the grid is C&IT's own
instruction to the lab (2026-09-28: nothing container-related on warrior and nothing of ours under
its `/tmp`); the 20-process login-node cap is Wayne State's published policy; everything else
Beethoven does on the grid (the 60-second floor on scheduler questions, the wall time on every job)
is this product's own design.

## 4. The gate (12.0.0 to 15.0.0), in one paragraph

Framework 11 added two commands for the direct way: `hpcworker gate`, the forced command of the
browser's key, which accepted eight fixed verbs over ssh and refused everything else, and `hpcworker
browser-key`, which added, checked and removed the key's line. 16.0.0 calls neither; every line it
types goes through the portal's shell (section 1) and none of them is a gate verb. Whether the
shared copy keeps the two commands is hpcworker's; what the gate's line left in a student's account
is section 5. The old answer **The lab's copy of the tool on the grid is older than this
Beethoven**, which was the gate's reply from a copy without it, no longer exists: the one way never
calls the copy outdated.

## 5. What an earlier version may have left

16.0.0 and later never add a key, never type a command about one, and delete nothing on the grid or
under a student's home, ever. What 12.0.0 to 15.0.0 left stays until a person removes it:

| What | Where | How it goes |
|---|---|---|
| **A line in the student's `~/.ssh/authorized_keys`** on the cluster, beginning `restrict,command="<the lab's shared copy>/bin/hpcworker gate"` and ending with the tag `beethoven-browser` and a date. Beside it, `~/.ssh/authorized_keys.beethoven-prev` is that version's copy of the file from before the line was added; it never holds a Beethoven line. | The student's home on the grid | The student, in a terminal on the cluster (OnDemand's shell, on the VPN): `bash /rs/rs_grp_oschome/shared/beethoven/hpcworker/current/bin/hpcworker browser-key remove` (the framework's shared copy still has the command; it answers `HPCW-KEY removed`, or `HPCW-KEY none`; refused under Claude Code, another agent or a batch job). Or by hand: delete the line. You cannot edit another account's file: ask the student, or C&IT. Withdrawing the approval does **not** remove it. 16.0.0 cannot use the line: the key it belonged to was dropped from the browser, unread, on the first run after the update. |
| **The Settings note** | The student's Beethoven | **Settings** shows once **A key from an earlier version**: "An earlier version of Beethoven added a key for this computer to your grid account (<date>). Beethoven no longer uses it. Your lab lead can remove it for you." **Forget** hides the note and nothing more. |
| **The helper** (the bridge) | The student's computer | Windows: **Settings**, **Apps**, **Beethoven bridge**, **Uninstall**. macOS: `uninstall.command` in `~/Library/Application Support/Beethoven/bridge`. Linux: `bash ~/.local/share/beethoven/bridge/uninstall.sh`. A zip install of 14.0.0 or earlier: its own `uninstall.cmd` or `uninstall.command` (`INSTALL.md`). 16.0.0 holds no permission to start it. |
| **The old passkey** (12.0.0 to 15.0.0's Windows Hello or Touch ID protection of the key) | The browser's or the system's passkey store | It is named with the student's AccessID alone, or "beethoven" ("Beethoven on this computer"), and can go: the student deletes it in that store's own list (`INSTALL.md`, "Remove Beethoven completely"). Not the passkey 19.0.0 uses for the grid sign-in, named "<AccessID> (grid)", which the student deletes only after **Forget**. |

A lost laptop with 12.0.0 to 15.0.0 still on it holds a key whose line, while the shared copy still
answers `gate`, lets it start, watch and stop that student's worker until the line is removed: have
the student remove the line (above). Once the list (section 9) drops an AccessID, the line's forced
command, which lives under the volume root, cannot start either (not tried on the grid).

## 6. The python3 question, settled in framework 11

warrior's banner bans `python3` "on sight". Framework 10 ran the system `python3` for a fraction of
a second on the login node to read the site profile (`profile.py shellenv`), fill the job file
(`render`) and a new workspace's guide (`guide`), and check the profile at install (`validate`).
Framework 11 does all four with awk and bash (`lib/profile.awk`, `lib/profile_sh.sh`), with the same
results byte for byte on every profile the tests hold (`tests/test_profile_awk.py`), and
`tests/test_login_node.py` measures that no line the extension types, the first connect included,
starts `python3` or looks up any other banned program. `python3` remains only for what a person
types at a terminal (`hpcworker profile show|set|validate|schema`, `install --discover`) and the
compute-node side of jobs; `tools/deploy_shared.sh`'s last check uses `hpcworker profile check`
(section 2, step 1). None of this was measured on warrior itself (gawk 4.0.2, bash 4.2.46): the
suite passes under a bash 4.2.46 built from source and under gawk 5.2 and mawk 1.3.4.

## 7. The floors and the waits, in one table

| What | How often | Where |
|---|---|---|
| The worker's files read through the portal | every 5 seconds while a worker starts, once a minute after | the extension (the line under **Details for your lab lead** says so) |
| The scheduler asked about a queued worker (`worker status --json`) | at most once a minute | the extension |
| A worker started or stopped | at most once a minute, only on a press of the student's; **Keep my worker running** at most once a minute and three times in a row | the extension |
| Reach re-checked while a press waits on GlobalProtect | every 3 seconds while a Beethoven page is open, once a minute while none is | the extension |
| The one-time key step re-tested after the line is typed | every 2 seconds | the extension |

The 60-second floor on scheduler questions is this product's own etiquette, not C&IT's (section 3).

## 8. What students will ask you

- **"It says Turn on GlobalProtect and stays there."** GlobalProtect is off, or not connected to
  `protect.wayne.edu` (the panel says **Still looking. Check that GlobalProtect says Connected.**).
  Wayne State's guide is KB 20314, behind **How to set it up**. Once it is on, Beethoven goes ahead
  with the kept press by itself; nothing to press again.
- **"It says One more thing, once."** The one-time grid key step (section 1): the student types
  their grid password, and the Google Authenticator code if the terminal asks, into the grid's own
  terminal page, then presses **I'm in**. Only a student with no grid code at all should run 2FA
  Setup (Wayne State's KB 20242): running it with one destroys the existing code, and the panel says
  so there. Not yet measured on the grid: ask what the terminal showed and keep it.
- **"Settings says A key from an earlier version."** Section 5. **Forget** hides the note only.
- **"It says That password didn't work, and Beethoven stopped."** The portal turned the password
  down once and Beethoven sent nothing more; it will not try again until the student types it again.
  Have them check it first (a password changed in the last half hour may not work yet). After two
  refusals in a row the panel says to wait or ask the help desk. If the AccessID is disabled, only
  C&IT turns it back on. Beethoven also stops, without counting a wrong try, when it could not tell
  whether a password it sent worked, the saved one or one typed while one was saved (Chrome closed
  before the grid replied, or a portal tab asked for a sign-in or loaded a page while the answer
  waited, which Chrome's own box may have signed in); the debug log's `signin` lines tell the two
  apart ("the grid turned the password down" or "an answer's outcome cannot be told", and after a
  browser restart "the last try while a sign-in was saved has no outcome on record"), and so does the
  panel: a hold says "Beethoven couldn't tell whether your saved password worked, so it won't use it
  again by itself. Type your password to sign in." Either way nothing is sent until the student types
  the password.
- **"It asks me to unlock my grid sign-in."** They ticked **Remember it on this computer**. Each
  time Chrome opens, one Windows Hello or Touch ID prompt unlocks it; **Type it instead** works too.
  At Wayne State, suggest **Forget** (**Settings**, **Your grid**, **Grid sign-in**) and typing the
  password each time (section 3).
- **"Which passkey do I delete?"** One named with their AccessID alone, or "beethoven", is the old one
  (12.0.0 to 15.0.0) and can go. The one named "<AccessID> (grid)" is 19.0.0's: delete it only after
  **Forget**.
- **"I lost my laptop."** Section 5, if 12.0.0 to 15.0.0 was on it; otherwise nothing of
  Beethoven's on it reaches the grid without the student's own VPN and portal sign-in.
- **"This Claude account has no Pro or Max plan."** The Claude account they signed in with has no
  Remote Control. To use another one they sign out of Claude on the grid themselves, then press
  **Sign in again**; Beethoven never does the sign-out (section 13).
- **"Your grid account can't use the lab's copy yet."** and **Copy details** shows `setup: failed (the
  setup line ended with exit 126: bash: /rs/rs_grp_oschome/shared/beethoven/hpcworker/current/bin/hpcworker:
  Permission denied)`. Their AccessID is not on the list yet (section 9).

## 9. Who can read the lab's folders

The lab's volume on the grid, `/rs/rs_grp_oschome`, is a link (owned by ab5188) to the volume's own
root, a folder you own: `drwxrws--T go2432 oschome`. Two facts about that folder decide who gets in,
and everything below rests on them:

- **`other::---`.** An account that is not you, not in the group and not on the list cannot even
  look inside, let alone reach anything under it.
- **The sticky bit** (the `T` in the last place, set 2026-10-02). Whoever may write in the folder can
  make their own folder there, but cannot rename or remove anyone else's.

**The list.** Each approved student's AccessID has one named entry on that folder,
`user:<AccessID>:rwx`. That is enough to reach the lab's copy of the tool, the worker image and Claude
Code under `shared/beethoven`, and to make their own folder, `/rs/rs_grp_oschome/<AccessID>`, where
their runs live (rwx, because they make it themselves). That set of entries *is* the list; nothing else
is. The group `oschome` is not the list: it belongs to C&IT, only they add members, it holds you and
ab5188, and students are not in it.

**Who is on it.** Exactly the accounts the access service has approved with the extension grant
(`admin.mjs approve <id>`, or `admin.mjs grant <id> extension`): `admin.mjs roster` prints those and
nothing else. Not the store reviewers' mock account, and not an account approved for the lab only
(`admin.mjs approve-lab <id>`, or `grant <id> lab`): a lab-only approval never opens the grid's
folders. That is meant: what students reach on the grid is the extension's worker, its image and Claude
Code. To let a lab-only student in, grant them the extension too.

Below the folder, everything students use is readable by any account that got in: `shared/`,
`shared/beethoven` and everything under it (folders `r-x` for others, files `r--`, or `r-x` where the
file runs, and every folder under `shared/beethoven` carries a default `o::r-x`, so new files inherit
it). Others never get write. Two folders stay closed by their own modes and are never opened:
`shared/access` (`drwx--s---`) and your own `go2432/` (`drwxr-s---`). `tools/deploy_shared.sh`
publishes each new version that way, open to others for reading, never for writing, and never touches
the root's ACL.

**The tool.** `tools/grid_access.sh` keeps the list equal to those accounts
(`node ../ashley/tools/intake/admin.mjs roster`, which prints them one per line). It runs in WSL, and
both it and `admin.mjs` find the vendor folder through `BEETHOVEN_VENDOR_DIR` (else
`~/.beethoven-vendor`, which in WSL is not your Windows folder). The easy way, from PowerShell in the
checkout, sets that for you:

```
powershell -NoProfile -File tools\grid_access_task.ps1 -Run -ToolArgs '--dry-run --force'   # the grid's entries now, and what it would add and remove; changes nothing
powershell -NoProfile -File tools\grid_access_task.ps1 -Run                                 # adds and removes, then checks what students need
```

or, in a WSL shell in the checkout:

```
BEETHOVEN_VENDOR_DIR=/mnt/c/Users/grego/.beethoven-vendor tools/grid_access.sh --dry-run --force
BEETHOVEN_VENDOR_DIR=/mnt/c/Users/grego/.beethoven-vendor tools/grid_access.sh
```

`--dry-run --force` is the way to see the grid's entries as they are: a dry run alone does not connect
when the list has not changed since the last apply, and `--force` makes it connect. It prints `grid
access list on /rs/rs_grp_oschome now: ...`, then the list as the run would leave it. Give
`-ToolArgs` its options in one string, separated by spaces or commas (`'--dry-run --force'`,
`'--force,--open-tree'`).

It gives every approved AccessID that the grid knows its entry, and takes away every named entry that
is not approved. It never changes your own entry, the group's, the mask or other's, and without
`--open-tree` (below) it opens nothing. It then prints one line per check, `ok` or `FAILED`: the
folder still yours, sticky and closed to others, and its mask still `rwx`; the list read back the
list applied; every entry in the folder a student's own folder, named for the account that owns it
and not a link, or yours (below, "A folder in another student's place"); `shared`,
`shared/beethoven`, the lab's copy of the tool, the image and Claude Code readable by others, with
every folder on the way enterable; `shared/access` and `go2432` closed. Those checks are cheap and run
every time. The full sweep, that nothing at all under `shared/beethoven` is closed to others, reads
tens of thousands of entries on the login node, so it runs only with `--check-tree` or `--open-tree`
and never from the scheduled task; run `--check-tree` by hand after a publish or after changing
anything under `shared/beethoven`. It ends with the list itself: `grid access list on
/rs/rs_grp_oschome: hy9698 ...`.

Exit 0: done. Exit 1: refused or failed. Exit 2: the list is in place but a check failed; the check's
line says the fix. For a closed `shared/beethoven`, the fix is `tools/grid_access.sh --open-tree`,
which does exactly what was done by hand on 2026-10-02 and nothing else: `chmod o+rx` on `shared`,
`o+rX` on everything under `shared/beethoven` (links left alone), and the default `o::r-x` on every
folder under it. It never touches `shared/access` or `go2432`, nor a publish's staging folder
(`hpcworker/.incoming-v<N>.*`, closed while `tools/deploy_shared.sh` runs and left behind when a publish
fails; the sweep leaves those out too, and you remove a stale one by hand). `deploy_shared.sh` itself
now writes `hpcworker/deploy.log` readable by others (it holds a date, your account, the version and
the commit), so a publish and `--open-tree` no longer undo each other.

It refuses, and changes nothing, when a line of the approved list is not an AccessID (it names the
line), when the list is empty (`--force` if you really mean to shut everyone out), when the folder is
not yours, or when the folder has lost `other::---` or its sticky bit (it prints `chmod o-rwx` or
`chmod +t`).

It connects to the grid only when the list differs from the one it last applied. That one is kept in
the vendor folder on your PC, `state\grid_access.wayne.ids`, with one line per run in
`state\grid_access.log` beside it. So a run with nothing new costs no ssh connection. `--force`,
`--check-tree` and `--open-tree` connect anyway. An approved AccessID that has no grid account yet is
skipped ("no such account on this system yet") and recorded in that file with the day, as `# unknown
zz0000 2026-10-02`; a list that differs from the last one only by such ids counts as unchanged, so the
id is tried again once a day (the first run on a later day connects for it), or at once with `--force`,
until the account exists and it gets its entry. If an id the grid knew stops resolving for a moment,
its entry is left as it is and the read-back allows for it. On the grid it is file work only, with
bash, coreutils, sed, awk, `getfacl` and `setfacl`: nothing on warrior's banned list, no scheduler
call, no temp file.

**A folder in another student's place.** The root is sticky, so no one can rename or remove a folder
that is not theirs; but anyone on the list may make a new one, and a student could make
`/rs/rs_grp_oschome/<someone else's AccessID>` before that student's first run. Their runs would then
go into a folder another account owns and can change (the framework does not refuse that yet:
`docs/OPEN_QUESTIONS.md`). So every run that connects (the list changed, `--force`, `--check-tree` or `--open-tree`) checks each entry in the root: one named like an AccessID must
belong to that very account and not be a link, and any other name must be yours. Each entry that is
not is a `FAILED` line of its own, exit 2, for example

```
  FAILED  the root's entries: cd5678 (directory) belongs to hy9698, not to cd5678, so it has taken the place of cd5678's own folder (LAB_LEAD.md, section 9)
```

An entry the system cannot name at that moment (getfacl shows a bare number) is left alone and reported as `left`; remove it by hand with `setfacl -x u:<number> /rs/rs_grp_oschome` only when that account is really gone. Run `-Run -ToolArgs '--force'` just before telling a newly approved student to start, so the root is checked at that moment.

The list is still applied. Then, on warrior as yourself (the root is yours, and in a sticky folder its
owner may remove or rename any entry):

```
rm /rs/rs_grp_oschome/cd5678                                    # a link or a file
rmdir /rs/rs_grp_oschome/cd5678                                 # an empty folder
mv /rs/rs_grp_oschome/cd5678 /rs/rs_grp_oschome/cd5678.taken    # a folder with something in it
```

You cannot remove what is inside someone else's folder, so a full one is renamed out of the way: the
name is free again for its student, and the check keeps naming the renamed folder until the account
that made it removes it. Tell that student what was removed or renamed and why, and tell the student
whose name it took; if that student had already run, ask them to stop their worker first, since its
files were in that folder. Not tried on the grid.

**Every fifteen minutes, by itself.** In PowerShell on your PC, no administrator rights:

```
powershell -NoProfile -File tools\grid_access_task.ps1 -Install
```

registers a Windows Scheduled Task, **Beethoven grid access**, that runs the tool with `--quiet` in
WSL every fifteen minutes while you are signed in to Windows, in a hidden window. It refuses until
`-Run` has applied the list once while you watched (until `state\grid_access.wayne.ids` exists), so the
task never makes the first change unseen. `-Run` runs it once in front of you (`-Run -ToolArgs
'--dry-run --force'` to look first), `-Remove` takes the task away, and the script with no option says
what the task runs, whether the list has been applied once, and when the task last ran. The task never
sweeps the whole tree. While your PC is off or you are signed out, nothing runs: a student approved
then waits until it is on again.

**By hand**, on warrior as yourself (the trailing `/` names the folder behind the link):

```
getfacl -p /rs/rs_grp_oschome/                    # look
setfacl -m u:ab1234:rwx /rs/rs_grp_oschome/       # add ab1234
setfacl -x u:ab1234 /rs/rs_grp_oschome/           # remove ab1234
```

The tool's next run that changes something keeps only approved AccessIDs, so an entry you add by hand
for someone the service has not approved lasts only until then. To let someone in for good, approve
them in the service.

**What a student sees before their AccessID is on the list.** Signing in to the grid works (the home
folder is not on the volume), but the first command that runs the lab's copy is refused. Beethoven
says **Your grid account can't use the lab's copy yet. Ask your lab lead.**, and **Copy details**
gives:

```
setup: failed (the setup line ended with exit 126: bash: /rs/rs_grp_oschome/shared/beethoven/hpcworker/current/bin/hpcworker: Permission denied)
```

That is this list, not the student's computer. Run the tool (or wait for the task); then the student
closes Chrome completely, opens it again and clicks **Connect** (`USE.md`, part 7).

**Taking an AccessID off.** Withdrawing an approval takes the entry away at the next run. That
account then cannot reach anything under `/rs/rs_grp_oschome`: its own folder there included (the
files stay). A worker of theirs that is still running loses its way to the lab's copy and to its
folder; what it does then was not tried. A line an earlier version left in that student's
`~/.ssh/authorized_keys` (section 5) is not touched by this, but its forced command lives under the
folder, so it cannot start either.

Not proven: the tool has been run only in WSL, against a temporary folder standing for the volume,
with `setfacl` and `getfacl` emulated (WSL has no acl package), the owners of the root's entries
stood in for by a `stat` that answers another account for the paths a test names (only root could
chown to accounts that do not exist), ssh replaced by a stand-in that runs the grid side locally, and
`tools/deploy_shared.sh`'s cluster side publishing into that folder (`tools/tests/test_grid_access.sh`).
On the grid, only the entry for hy9698 that you set by hand on 2026-10-02 has been seen to work. Run
`--dry-run --force` first.

## 10. Not yet measured

Of the one way, on the real grid: the one-time grid key step by a student without a key (section 1);
a press kept on the GlobalProtect step going ahead by itself when the grid answers; and **Keep my
worker running** starting an ended worker again from a closed panel. Of 19.0.0's sign-in
(`docs/OPEN_QUESTIONS.md`): Beethoven's background answering the live portal's HTTP sign-in; a
Windows Hello or Touch ID prompt from the side panel on real computers (Chromium reports the panel
closing); real Windows Hello and Touch ID giving what the saved sign-in needs; whether a wrong
answer counts toward the AccessID's five; what passkey lists show for "<AccessID> (grid)"; and how
many stale tries Chrome sends after a password change; whether, when a student signs in in Chrome's
box while Beethoven's own answer is on its way, the tab's request can end after Beethoven's (the
answer is then counted as worked although the box's password may have been the one the grid took);
and how often a portal tab in use while an answer waits puts a right saved password on hold. The
framework's own open questions are hpcworker's `docs/OPEN_QUESTIONS.md`. Nothing of the direct way
remains to measure: `V12_STATUS.md`'s tests G1 to G3 are moot.

## 11. A resumed session's link (14.0.0, framework 14)

When a worker's job resumes an earlier session (`claude remote-control --continue`: a successor, or a
restart within four hours of the last session), Claude Code 2.1.283 prints "Resuming session session_…
(43m ago)", "Single session · exits when complete" and that session's own link,
`https://claude.ai/code/session_…`, and no environment link. Framework 13's job knew only the
environment link: on 2026-10-03 go2432's job 40554211 wrote `status.json` as `online` with
`environment_url` and `session_url` both empty, and 13.0.0 showed "Starting · Connecting to Claude…" for
a worker that was online. Framework 14 writes `session_url` = the link printed (either form) and
`environment_url` = the environment link when one was printed, else "". 14.0.0 opens either.

- **Publish framework 14** before students rely on a resumed session's link (section 2's two
  commands): it writes the link into `status.json` and `connection.json`, which `hpcworker worker
  status` prints. 16.0.0 reads the worker's files through the portal, `rc.log` included, so it learns
  the link out of `rc.log` with framework 13 too.
- **No New session on such a link.** On a resumed session's link Claude Code serves that one session and exits
  when it is complete (the worker then starts it again), so the home offers **Open my session**, **Copy link** and **Phone**, and not
  **New session** (which opens an environment's page, where a new session can start).
- `hpcworker worker status`, `worker watch` and `diag` print whichever link the job wrote.

## 12. The debug log (14.0.0)

A student who is stuck opens **⋯** (More) and clicks **Copy debug log**, then pastes it to you. It
is the background's own account of what it did, one line per decision, newest last, after a header
line naming the Beethoven version, the mode (how Beethoven talks to the portal: `direct`, from the
background itself with the browser's own sign-in, or `tab`, through a portal tab it opens and
closes; `unknown` before the first check; `direct` here is the channel's word and not the direct way
of 12.0.0 to 15.0.0), the portal, the AccessID, the worker's name and the time. **Details for your
lab lead** shows its last 200 lines under the heading "Debug log", with a **Copy debug log** button;
**Copy details** adds the same 200 lines.

Each line is `<UTC time> <tag> <what happened>`. The tags:

| Tag | What it says |
|---|---|
| `sw` | the background started (Chrome starts it again after it has been idle) |
| `cleanup` | 16.0.0's one-time removal of what the direct way left in this browser: removed, none, or why not |
| `grid` | each check of the grid sign-in through the portal, and what it found (signed in or not, as whom, the HTTP status) |
| `signin` | 19.0.0's own sign-in: each challenge of Beethoven's own request, with what the listener did and why (answered with the typed or the saved password, cancelled as a refusal, or left to Chrome) and the request's type, an address only for the dashboard request it answered or cancelled; how the answered request ended; an answer whose outcome cannot be told, and the hold it puts on the saved password. Never the AccessID or a password, and of a portal tab's challenge nothing at all |
| `read` | each read of the run's files: `status.json`'s job, state and `updated_at`, the phase Beethoven made of it, stale or not, seen alive or not, and whether a link is there and of which form |
| `status` | each `worker status --json` the panel asked while a worker was in line or renewing |
| `press`, `action`, `ready` | each button by its kind only, the press's result, and what a press waited for (the grid, the approval, the setup) |
| `connect`, `sitting` | the connect line's start and whether it ran through the portal's shell from the background or through a portal tab, then each event of the sitting by its kind; a Claude sign-in link by its host and path only |
| `keep` | **Keep my worker running**: a job that ended without a Stop, and the restart it made, with its count of three |
| `access` | each approval check: asked or not, approved or not, and why |
| `panel`, `online`, `open` | what the panel showed (the moment or the home's state, its sentence and its button), the online moment, each opening of claude.ai |
| `fail` | each failure, with its detail |

What it never holds: a password, a grid code, the code pasted from Claude's page, a token, or a full
authorize link. The background passes kinds, words and hosts, never what was typed; and the ring
itself cuts every web address to its host and path and removes anything key-, token- or code-shaped
before a line is kept (`extension/src/core/debuglog.ts`). It is in the background's memory only, at most
3,000 lines: never written to storage, never sent anywhere. It starts empty whenever Chrome starts the
background again: a browser restart, an update, and Chrome stopping an idle service worker, which it
does about 30 seconds after the last event while the panel is closed. So ask for it while the panel
still shows the problem.

## 13. Switching Claude accounts (15.0.0, framework 17)

Beethoven never signs a student out of Claude. Its own tooling has no command for it, on purpose:
earlier builds' **Use another account** typed `connect --login fresh`, which signed out of Claude
Code on the grid before signing in again; framework 17 refuses that line, and no build since 15.0.0
types it. So when a student needs to use another Claude account (the panel said "This Claude account
has no Pro or Max plan. Remote Control needs one.", or they have a second account of their own), the
sign-out is theirs:

1. In a terminal on a compute node, inside the lab's worker image, with the student's own sign-in
   folder (`~/.beethoven/claude`) as `CLAUDE_CONFIG_DIR`, the student runs Claude Code's own
   `claude auth logout`. The exact way to open that terminal depends on the site; your own notes hold
   the one that works on your grid.
2. Back in Beethoven, the student presses **Sign in again**. The sitting runs as on the first day: a
   Claude tab, the code, **Continue**, and the new account's plan is checked the same way.

The panel's sentence under "no Pro or Max plan" sends the student here: "To use another Claude
account, sign out of Claude on the grid first (your lab lead's guide shows how), then press Sign in
again." Nothing of Beethoven's reads or changes the sign-in folder; what `claude auth logout` removes
is Claude Code's own, run by the student.
