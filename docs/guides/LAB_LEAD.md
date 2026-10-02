# Beethoven 12.0.0 for the lab lead

For Greg (and any lab lead after him). Written 2026-10-02 by the texts stream of the 12.0.0 build
and corrected by fixer B after the four reviews, against framework 11 as it stands in the working
tree (`framework/lib/browser_key.sh`, `framework/lib/profile.awk`, `framework/README.md`). The exact
tests still to run on the real grid are in `docs/V12_STATUS.md`, section 4.

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
- **Nothing changes in approvals.** One approved account, one installation; the helper and the
  browser's key belong to that installation and never talk to the access service. Moving a student
  to a new computer is still `admin.mjs` (or the e-mail's link); on the new computer they sign in
  directly once, and that replaces the old computer's line (one line per account). Withdrawing an
  approval does **not** remove a student's line on the grid (section 5).

## 2. Before the first student uses the direct way

Framework 10 is deployed on the grid now, at `/rs/rs_grp_oschome/shared/beethoven/hpcworker/current`.
Framework 10 has no `gate` and no `browser-key`: a 12.0.0 student's first direct sign-in against it
ends with **The lab's copy of the tool on the grid is older than this Beethoven** (or, in an older
build, a key that is not taken). So, in this order:

1. **Look at the folders above the copy** (read only, on warrior, as yourself):

   ```
   stat -c '%A %U:%G %n' /rs /rs/rs_grp_oschome /rs/rs_grp_oschome/shared /rs/rs_grp_oschome/shared/beethoven /rs/rs_grp_oschome/shared/beethoven/hpcworker
   ```

   Every folder there must be writable by its owner alone (no `w` in the group or other places), or
   sticky (a `t` or `T` in the last place). `framework/README.md` records `/rs/rs_grp_oschome` as
   `drwxrws---` (group-writable, not sticky); if that is still so, any member of `oschome` could
   rename `shared` and put another tool in its place. For a folder you own: `chmod g-w` (or `chmod
   +t`). For `/rs/rs_grp_oschome` itself, owned by root: ask C&IT (section 3, question 6). Until
   then `browser-key add` refuses every student with "other people can rename things in ..., which
   holds the lab's copy of the grid tool your key would run. Ask your lab lead."
2. **Publish framework 11**, from the laptop's checkout, as for framework 10:

   ```
   tools/deploy_shared.sh --site wayne --dry-run
   tools/deploy_shared.sh --site wayne
   ```

   It checks `VERSION` (11) against the tool, LF line endings and `bash -n`, tars exactly the files
   it lists with a SHA-256 manifest, and on the login node extracts them to `.../hpcworker/v11`,
   sets group read and no write, and switches `current` in one rename; `v10` is kept for workers
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
> 6. /rs/rs_grp_oschome is group-writable and not sticky. Could you set the sticky bit on it (or
>    remove group write), so that one group member cannot rename another's folders? Our scripts
>    refuse to add any key while it is not.

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
| You, for one student | You cannot edit another account's `authorized_keys`. Ask the student, or ask C&IT. Withdrawing the approval (admin console, or `admin.mjs`) stops the extension starting workers at its next check, but **does not remove the line**: the gate does not consult the access service. | |
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

## 9. Not proven

Everything about the direct way was run only against ssh servers the lab ran itself, set up like the
grid, and the framework only against a fake scheduler; no key or password has been sent to
grid.wayne.edu. `V12_STATUS.md` lists what that leaves open and the three tests that settle it (G1:
your own key sign-in with the VPN off; G2: the phone route's paste; G3: real Windows Hello and Touch
ID).
