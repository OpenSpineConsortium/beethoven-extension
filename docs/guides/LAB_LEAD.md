# Beethoven 12.0.0 for the lab lead

For Greg (and any lab lead after him). Written 2026-10-02 by the texts stream of the 12.0.0 build
and corrected by fixer B after the four reviews, against framework 11 as it stands in the working
tree (`framework/lib/browser_key.sh`, `framework/lib/profile.awk`, `framework/README.md`). The exact
tests still to run on the real grid are in `docs/V12_STATUS.md`, section 4. Section 9, who can read the
lab's folders on the grid, was added later the same day with `tools/grid_access.sh`, and revised that
evening after its review (section 2, step 1 and section 3, question 6 with it).

**14.0.0 and framework 14 (2026-10-03).** Two changes, both in sections 11 and 12 below: a worker that
resumed an earlier session (Claude Code prints that session's own link, `https://claude.ai/code/session_…`,
and no environment link) is read as online, which needs framework 14 on the grid for the direct way; and
the panel keeps a debug log in memory that a student copies for you with **⋯** (More), **Copy debug log**.
Publish framework 14 with the two commands of section 2 (`--dry-run` first), as for 11 and 13.

## 1. What changes for you

- **Students reach the grid's login node directly**, over ssh, from their own computers, with no VPN:
  `grid.wayne.edu`, port 22, through the small helper that ships inside the extension
  (`INSTALL.md`). The Open OnDemand path of 11.0.0 stays, as the fallback, behind
  **Use GlobalProtect instead**.
- **The first direct sign-in is a password sign-in.** The student types their AccessID, password and
  Google Authenticator code into Beethoven's own sign-in sheet (an extension page). Beethoven sends
  them only to the grid, inside the ssh session, after the grid's host key matched the pin, and
  keeps nothing. In that same session it runs `hpcworker browser-key add` and `hpcworker install
  --shared` from the lab's shared copy; the first writes one restricted line into the student's
  `~/.ssh/authorized_keys`. Beethoven keeps that password session open for up to ten minutes, so the
  student's first **Connect** can run the Claude sign-in in it without a second password and code.
- **From then on, the browser signs in with its own key**, and that key can run only the lab's gate
  (section 4). The gate can never sign a worker in to Claude: a Claude sign-in always needs a
  password-and-code session (or the portal path).
- **Windows Hello / Touch ID protection of the key is the student's choice and off by default.**
- **Every student's line runs your shared copy.** Whoever can change
  `/rs/rs_grp_oschome/shared/beethoven/hpcworker/current`, anything under it, or rename anything in a
  folder above it, can run anything in every enrolled student's account the next time Beethoven
  polls with that student's key. Framework 11's `browser-key add` therefore refuses unless the copy,
  and every folder from `/` down to it, can be changed by its owner alone or is sticky (section 2).
- **No python3 on the login node for anything Beethoven types.** Framework 11 reads the site profile
  and fills the job file and the workspace guide with awk and bash (section 6).
- **An approval for the extension also opens the lab's folders on the grid.** The AccessIDs approved
  with the extension grant (`admin.mjs approve`, or `grant <id> extension`) are the list of accounts
  that may enter the lab's volume, kept on the grid by `tools/grid_access.sh`, every fifteen minutes
  from your PC (section 9). An approval for the lab only (`approve-lab`) does not put anyone on it, and
  neither does the store reviewers' mock account. Until a newly approved student is on it, their setup
  ends in `Permission denied`. Otherwise approvals are as before: one approved account, one installation;
  the helper and the browser's key belong to that installation and never talk to the access service.
  Moving a student to a new computer is still `admin.mjs` (or the e-mail's link); on the new computer
  they sign in directly once, and that replaces the old computer's line (one line per account).
  Withdrawing an approval does **not** remove a student's line on the grid (section 5), but it takes
  their AccessID off the list at the next run, and the line's command then cannot start (section 9).

## 2. Before the first student uses the direct way

Framework 10 is deployed on the grid now, at `/rs/rs_grp_oschome/shared/beethoven/hpcworker/current`.
Framework 10 has no `gate` and no `browser-key`: a 12.0.0 student's first direct sign-in against it
ends with **The lab's copy of the tool on the grid is older than this Beethoven** (or, in an older
build, a key that is not taken). So, in this order:

1. **Look at the folders above the copy** (read only, on warrior, as yourself; the trailing `/` on the
   first names the folder behind the link):

   ```
   stat -c '%A %U:%G %n' /rs/rs_grp_oschome/ /rs/rs_grp_oschome/shared /rs/rs_grp_oschome/shared/beethoven /rs/rs_grp_oschome/shared/beethoven/hpcworker
   ```

   The first is the volume's root, your own folder, `drwxrws--T go2432 oschome`: writable by the
   group and by the students on the list (section 9), and sticky, the `T` in the last place, which you
   set on 2026-10-02. Sticky means that whoever may write there can make a folder of their own but
   cannot rename or remove `shared` or anything else that is not theirs, so the root passes. Keep it
   so: `chmod +t` again if the `T` ever goes. Each of the other three must be writable by its owner
   alone (no `w` in the group or other places) or sticky: on one of yours that is not, `chmod g-w` (or
   `chmod +t`). (Until 2026-10-02 this step recorded the root as `drwxrws---`, not sticky, and took it
   for C&IT's to fix; it is yours.) Above the root sit the CephFS scaffold folders, owned by root or by
   other labs' accounts and writable by everyone; they are C&IT's (section 3, question 6), and
   framework 12 reports them as a note for the university without refusing a key
   (`framework/README.md`, "Folders above the copy"). Until every folder of yours passes,
   `browser-key add` refuses every student with "other people can rename things in ..., which holds
   the lab's copy of the grid tool your key would run. Ask your lab lead."
2. **Publish framework 11**, from the laptop's checkout, as for framework 10:

   ```
   tools/deploy_shared.sh --site wayne --dry-run
   tools/deploy_shared.sh --site wayne
   ```

   It checks `VERSION` (11) against the tool, LF line endings and `bash -n`, tars exactly the files
   it lists with a SHA-256 manifest, and on the login node extracts them to `.../hpcworker/v11`,
   sets read for the group and for others and no write (who gets in at all is the list, section 9),
   and switches `current` in one rename; `v10` is kept for workers
   that started on it. Its last check now runs `hpcworker profile check` on each site profile (awk,
   the same verdict `profile.py validate` gives) instead of `python3`, which warrior's banner bans;
   and it refuses to point `current` from version 11 or later back at a version before 11, because
   every student's key would then meet a copy with no gate ("unknown command 'gate'"). Both were
   tried with `--here` into a scratch folder in WSL on 2026-10-02, not on the grid.
3. **Run the read-only check** as the copy's owner:

   ```
   bash /rs/rs_grp_oschome/shared/beethoven/hpcworker/current/bin/hpcworker browser-key check
   ```

   It prints one line per folder or file that others than its owner may change, `copy: ...` or
   `above the copy: ... (chmod +t or chmod go-w on it, by its owner)`, then `HPCW-KEY check ok
   <copy>` or `HPCW-KEY check refused <copy>`. Fix every line until it says `ok`.
4. **One test sign-in of your own**, from a test Chrome profile (`V12_STATUS.md`, test G1). It
   settles what no local server could: OpenSSH 7.4 taking the restricted line, StrictModes on your
   home, warrior's bash running the gate.
5. Send C&IT the note in section 3, and wait for their answer before telling students to use the
   direct way.
6. Decide whether keys should lapse (section 5, `browser_key_days`).

## 3. What to tell C&IT

Only one rule about the grid is C&IT's own instruction to the lab (2026-09-28: nothing
container-related on warrior and nothing of ours under its `/tmp`); the 20-process login-node cap is
Wayne State's published policy; everything else below is this product's own design. Say so when you
write. A draft:

> Subject: Beethoven 12: students' browsers signing in to grid.wayne.edu directly
>
> My lab's students use Beethoven, a Chrome extension that starts, watches and stops their own
> Claude Code batch jobs on the grid. Until now it worked only through Open OnDemand on the VPN.
> From version 12 it first tries ssh to grid.wayne.edu port 22 directly from the student's computer,
> without the VPN, through a small helper program on the student's computer that only relays TCP to
> grid.wayne.edu:22. Nothing is installed on the grid but the lab's own scripts in our group
> folder. Your KB 20245 and 20243 already describe plain ssh to the grid and keys students add
> themselves; this is the same thing, done by a program on the student's behalf.
>
> The first time, the student types their AccessID, password and Google Authenticator code into the
> extension's own sign-in page. They are sent only inside the ssh session, after the server's host
> key matches the one the extension carries (ssh-rsa
> SHA256:kLTz1xK6anQ1denM+31kDEryQtgan2P76r9aLno+K3s), and are never stored. In that session the
> extension runs two of our scripts' commands, one of which adds one line to the student's
> ~/.ssh/authorized_keys:
>
> `restrict,command="/rs/rs_grp_oschome/shared/beethoven/hpcworker/current/bin/hpcworker gate" <ecdsa-sha2-nistp256 or ssh-ed25519> <key> beethoven-browser <date>`
>
> `restrict` turns off the terminal and all forwarding, and the forced command means the key can
> only run our "gate", a bash script that accepts eight fixed commands (report the version, report
> a worker's state, follow it for up to 30 minutes, start a worker, stop it, mark a workspace
> restricted, read one of four status files, remove the line) and refuses everything else. It
> cannot open a shell, copy files, read other files or sign anyone in to anything. Each key may use
> three worker names in any seven days, start a worker twelve times an hour, and follow two at once.
>
> While a student has the extension's panel open, it keeps one ssh connection open and runs a short
> command over it: every few seconds while a worker starts, about once a minute otherwise; it asks
> Slurm about a queued worker at most once a minute. The first password session is held open for up
> to ten minutes so the student's first Claude sign-in does not need a second password and code.
> Nothing it runs on the login node uses python, node, md5sum, rsync or anything else on warrior's
> banned list: bash, coreutils, grep, sed and awk, and srun for the Claude sign-in. After three
> refused password sign-ins in a row it stops for fifteen minutes.
>
> Questions:
> 1. Is a key restricted this way, used from outside the VPN, acceptable under the grid's rules,
>    given that password sign-ins require the Google Authenticator code?
> 2. Do the grid's defences (fail2ban or similar) ban an address after failed sign-ins, and at what
>    threshold? A student's home address could be banned by a few mistyped codes.
> 3. Is one ssh connection per student held open while their panel is open, with a short command
>    every few seconds to once a minute, acceptable on warrior?
> 4. Will you tell us before the grid's ssh host key changes? Every student's extension refuses a
>    different key and sends nothing.
> 5. Students without a Google Authenticator code set one up themselves with Open OnDemand's
>    2FA Setup app, as KB 20242 describes. Is that the route you want them to use?
> 6. The CephFS folders above our volume's root, owned by root or by other labs' accounts, are
>    writable by everyone and not sticky. Could you set the sticky bit on them, so that no account
>    can rename another's folder there? (Our own root is sticky since 2026-10-02; our scripts report
>    these folders and do not refuse over them.)

## 4. The gate, in one paragraph

Each enrolled student's `~/.ssh/authorized_keys` holds one line for Beethoven, beginning
`restrict,command="<the lab's shared copy>/bin/hpcworker gate"` and ending `beethoven-browser
<date>`. `restrict` turns off the terminal and agent, port and X11 forwarding, and the forced command
makes sshd run the gate whatever the client asks, so no file transfer or shell is possible. The gate
reads the request from `SSH_ORIGINAL_COMMAND`, refuses anything over 200 characters, any character
outside letters, digits, dot, underscore, hyphen and single spaces, and any word starting with a
hyphen, and accepts exactly eight verbs: `version` (the framework's version, the account, the
line's due date, and whether Claude Code reports a sign-in), `status` and `watch` (a worker's
state), `connect` (starts a worker, always with `--login never`, written last so nothing can
outrank it, so the key can never run the Claude sign-in), `stop`, `restrict` (marks a workspace
restricted), `read` (one of four run files of a named worker: `status.json`, `connection.json`,
`progress.log`, `node`; never `rc.log`) and `forget` (removes the line). It caps each key at three
worker names in any seven days (the student's own password sign-in clears them), twelve connects (and
restricts of a name with no run) in any rolling hour and two watches at once, ends a watch after
thirty minutes, and asks the scheduler about a queued worker at most once a minute. Everything else
answers `HPCW-GATE refused` (exit 126); a cap answers `HPCW-GATE limit names|hourly|watch|busy` (exit
123). The gate is bash with coreutils, grep, sed and awk, and runs no `python3`. It cannot open a
shell, read any other file, add a key or sign a worker in to Claude. If a student's own `~/.bashrc`
prints something, sshd shows it before the gate's own lines; Beethoven reads the gate's lines by
their prefix (`README.md`, "The gate").

## 5. Revoking a key

| Who | How | Effect |
|---|---|---|
| The student, in Beethoven | **⋯**, **Settings**, **Connection**, **Forget this computer**, **Forget** | The browser's key is deleted and the gate's `forget` removes the line. If the key is protected, Beethoven asks to unlock it first so the grid forgets it too. If the grid cannot be reached, the key leaves the browser and the line stays; Beethoven says so. |
| The student, in a terminal on the grid (OnDemand's shell, on the VPN) | `bash /rs/rs_grp_oschome/shared/beethoven/hpcworker/current/bin/hpcworker browser-key remove` | `HPCW-KEY removed` (or `none`). Refused under Claude Code, another agent or a batch job. |
| The student, by hand | delete the line ending `beethoven-browser <date>` from `~/.ssh/authorized_keys` | Same. The copy framework 11 keeps, `authorized_keys.beethoven-prev`, never holds a Beethoven line, so putting it back cannot bring a key back. |
| A new direct sign-in from another browser | automatic | Replaces the line: the old browser's key stops working. |
| You, for one student | You cannot edit another account's `authorized_keys`. Ask the student, or ask C&IT. Withdrawing the approval (admin console, or `admin.mjs`) stops the extension starting workers at its next check, but **does not remove the line**: the gate does not consult the access service. The next run of the list (section 9) does take the AccessID off the volume root, and the line's forced command lives under that root, so from then on it cannot start (not tried on the grid). | |
| You, for everyone | Set `browser_key_days` in `framework/profiles/wayne.json` and publish the copy: from then on the gate removes any line older than that many days the next time it is used (`HPCW-KEY expired`), and the student signs in with the password and code again. Wayne State's profile sets none today, so lines never lapse. | |
| You, in an emergency | Every line runs your `current` copy, so a copy whose gate refuses everything would stop every browser key at once without touching students' files. Framework 11 has no ready switch for this; building one is a decision for you (`V12_STATUS.md`, section 7). | |

A student who loses a laptop signs in directly once from another computer, which replaces the line
so that the lost laptop's key stops working, or removes the line from the OnDemand shell. (**Forget
this computer** on the new computer would remove the new computer's key, not the lost one's.) If the
passkey protection was on from the first sign-in, the lost key cannot be used without their
fingerprint, face or PIN; if it was turned on later, an older unprotected copy may still be in that
browser's files, so replace the line either way.

## 6. The python3 question, settled in framework 11

warrior's banner bans `python3` "on sight". Framework 10 ran the system `python3` for a fraction of
a second on the login node to read the site profile (`profile.py shellenv`), fill the job file
(`render`) and a new workspace's guide (`guide`), and check the profile at install (`validate`).
Framework 11 does all four with awk and bash (`lib/profile.awk`, `lib/profile_sh.sh`), with the same
results byte for byte on every profile the tests hold (`tests/test_profile_awk.py`), and
`tests/test_login_node.py` measures that no line the extension types, the first connect and every
gate verb included, starts `python3` or looks up any other banned program. `python3` remains only
for what a person types at a terminal (`hpcworker profile show|set|validate|schema`, `install
--discover`) and the compute-node side of jobs; `tools/deploy_shared.sh`'s last check uses
`hpcworker profile check` (section 2, step 2). None of this was measured on warrior itself (gawk
4.0.2, bash 4.2.46): the suite passes under a bash 4.2.46 built from source and under gawk 5.2 and
mawk 1.3.4.

## 7. The caps and the waits, in one table

| Limit | Value | Where |
|---|---|---|
| Worker names a key may use | 3, each counting for 7 days after its last use; the student's own password sign-in clears them | `GATE_MAX_NAMES`, `GATE_NAME_DAYS` |
| Connects through the gate (and restricts of a name with no run) | 12 in any rolling hour | `GATE_MAX_CONNECTS` |
| Watches at once | 2, each ending after 30 minutes; none taken for a run that does not exist | `GATE_MAX_WATCHES`, `GATE_WATCH_MIN` |
| Scheduler asked about a queued worker | at most once a minute, whoever asks | `GATE_POLL_FLOOR` |
| Refused password sign-ins before Beethoven stops | 3 in a row, then a 15-minute pause for that AccessID | the sign-in sheet ("That didn't work three times.", "Try again at ...") |
| The first password session, held for the first Claude sign-in | up to 10 minutes | the extension |
| Line lifetime | none at Wayne State (`browser_key_days` unset) | the site profile |

When a cap is reached the gate answers `HPCW-GATE limit names|hourly|watch` and runs nothing;
Beethoven says which in plain words and offers GlobalProtect for that action.

## 8. What students will ask you

- **"The grid didn't accept the code."** Either the code was mistyped or had changed, or the account
  has no grid code yet; Beethoven asks the student which. Only a student with no code at all should
  run 2FA Setup (`USE.md`, part 2): running it twice destroys the existing code. Beethoven warns
  before each step that could lead there.
- **"Windows (or my Mac) says the helper is unsafe."** Expected: it is an unsigned script
  (`ACCOUNTS.md`, 2.1). `INSTALL.md` has the clicks for each system, Smart App Control's **Unblock**
  included.
- **"Can't reach the grid directly."** Their network blocks outbound port 22 (some hospital and hotel
  networks do). They use **Use GlobalProtect instead**.
- **"Stopped: the grid's identity didn't match."** The grid's host key did not match the pin.
  Beethoven sent nothing. Do not tell them to go around it; they can use GlobalProtect meanwhile.
  Check with C&IT whether the key changed; if it did, the site profile's pin must change in a new
  extension version.
- **"The grid's own tool said no: other people can rename things in ..."** The folders above the
  lab's copy (section 2, step 1).
- **"The lab's copy of the tool on the grid is older than this Beethoven."** Framework 11 is not
  published yet (section 2, step 2).
- **"The grid lets this computer's key use only a few worker names."** The names cap (section 7).
  Signing in again with the password and code clears it; so does waiting a week.
- **"I lost my laptop."** Section 5.
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
files stay), and the forced command of its browser key, which lives under the folder, so the key can no
longer start anything. A worker of theirs that is still running loses its way to the lab's copy and
to its folder; what it does then was not tried.

Not proven: the tool has been run only in WSL, against a temporary folder standing for the volume,
with `setfacl` and `getfacl` emulated (WSL has no acl package), the owners of the root's entries
stood in for by a `stat` that answers another account for the paths a test names (only root could
chown to accounts that do not exist), ssh replaced by a stand-in that runs the grid side locally, and
`tools/deploy_shared.sh`'s cluster side publishing into that folder (`tools/tests/test_grid_access.sh`).
On the grid, only the entry for hy9698 that you set by hand on 2026-10-02 has been seen to work. Run
`--dry-run --force` first.

## 10. Not proven

Everything about the direct way was run only against ssh servers the lab ran itself, set up like the
grid, and the framework only against a fake scheduler; no key or password has been sent to
grid.wayne.edu. `V12_STATUS.md` lists what that leaves open and the three tests that settle it (G1:
your own key sign-in with the VPN off; G2: the phone route's paste; G3: real Windows Hello and Touch
ID).

## 11. A resumed session's link (14.0.0, framework 14)

When a worker's job resumes an earlier session (`claude remote-control --continue`: a successor, or a
restart within four hours of the last session), Claude Code 2.1.283 prints "Resuming session session_…
(43m ago)", "Single session · exits when complete" and that session's own link,
`https://claude.ai/code/session_…`, and no environment link. Framework 13's job knew only the
environment link: on 2026-10-03 go2432's job 40554211 wrote `status.json` as `online` with
`environment_url` and `session_url` both empty, and 13.0.0 showed "Starting · Connecting to Claude…" for
a worker that was online. Framework 14 writes `session_url` = the link printed (either form) and
`environment_url` = the environment link when one was printed, else "". 14.0.0 opens either.

- **Publish framework 14** before students rely on it on the direct way (section 2's two commands). The
  browser's key cannot read `rc.log` through the gate, so on the direct way 14.0.0 learns a resumed
  session's link only from framework 14's `status.json` and `connection.json`. On the GlobalProtect way
  14.0.0 also reads the link out of `rc.log`, so there it works with framework 13 too.
- **No New session on such a link.** On a resumed session's link Claude Code serves that one session and exits
  when it is complete (the worker then starts it again), so the home offers **Open my session**, **Copy link** and **Phone**, and not
  **New session** (which opens an environment's page, where a new session can start).
- `hpcworker worker status`, `worker watch` and `diag` print whichever link the job wrote.

## 12. The debug log (14.0.0)

A student who is stuck opens **⋯** (More) and clicks **Copy debug log**, then pastes it to you. It is the
background's own account of what it did, one line per decision, newest last, after a header line naming
the Beethoven version, the way to the grid (direct, vpn or setup), the portal, the AccessID, the worker's
name and the time. **Details for your lab lead** shows its last 200 lines under the heading "Debug log",
with a **Copy debug log** button; **Copy details** adds the same 200 lines.

Each line is `<UTC time> <tag> <what happened>`. The tags:

| Tag | What it says |
|---|---|
| `sw` | the background started (Chrome starts it again after it has been idle) |
| `mode` | direct, vpn or setup, and why: the preference, the bridge, the key, whether the grid answered |
| `bridge` | each bridge probe: which was chosen, and what each provider said |
| `ssh` | each ssh connection opened and closed: to where, as whom, through which bridge, why, how long it took and lived |
| `gate` | each gate verb (its verb and the worker's name; for `read`, which file), its exit status, how long it took, and the first 160 characters of its output; a verb the floor held back says so |
| `grid` | each check of the grid sign-in, and what it found (framework, Claude Code's sign-in on the grid) |
| `read` | each read of the run's files: `status.json`'s job, state and `updated_at`, the phase Beethoven made of it, stale or not, seen alive or not, and whether a link is there and of which form |
| `status` | each `worker status --json` the panel asked while a worker was in line or renewing |
| `press`, `action`, `ready` | each button by its kind only, the press's result, and what a press waited for (the grid, the approval, the setup) |
| `connect`, `sitting` | the connect line's start and way, then each event of the sitting by its kind; a Claude sign-in link by its host and path only |
| `sheet` | each phase of the grid sign-in sheet, and the kinds of the grid's prompts |
| `access` | each approval check: asked or not, approved or not, and why |
| `panel`, `online`, `open` | what the panel showed (the moment or the home's state, its sentence and its button), the online moment, each opening of claude.ai |
| `fail` | each failure, with its detail |

What it never holds: a password, a grid code, the code pasted from Claude's page, a key, a token, or a
full authorize link. The background passes kinds, words and hosts, never what was typed; and the ring
itself cuts every web address to its host and path and removes anything key-, token- or code-shaped
before a line is kept (`extension/src/core/debuglog.ts`). It is in the background's memory only, at most
3,000 lines: never written to storage, never sent anywhere. It starts empty whenever Chrome starts the
background again: a browser restart, an update, and Chrome stopping an idle service worker, which it
does about 30 seconds after the last event while the panel is closed. So ask for it while the panel
still shows the problem.
