# Beethoven — working context

A university-agnostic HPC worker framework (`framework/`, `hpcworker`) plus a lightweight browser
extension (`extension/`, published as "Beethoven"; the repository and its code name stay Ashley
Bridge) that make a student's own Claude Code worker, running as a batch job on their university
cluster, available inside claude.ai through Claude Code Remote Control, using only the student's
existing Open OnDemand browser session on the cluster side. Vendor: Gregory Schwing, trading as
OpenSpineConsortium (an LLC is planned and becomes the named licensor when it exists). The product
name and identifier carry no university name.

## Read first

- `docs/RESEARCH_REPORT.md`: the whole report, especially "Build specification for the week of
  28 September 2026". It governs. The two `docs/prior_analysis_*.txt` files proposed intercepting
  claude.ai; the report rejects that, and nothing here may implement it.
- `docs/ARCHITECTURE.md`, then `docs/DIAGNOSTICS.md`, `docs/OPEN_QUESTIONS.md` (what is measured and
  what is not), `SECURITY.md`, `docs/STORE_LISTING.md`, `docs/WAYNE_STATE_PILOT.md`.
- The research notes behind the report:
  `C:/Users/grego/OneDrive/Desktop/ashley/docs/research/research_notes/Browser extension HPC Claude worker/`.
- The sibling product being reused, read-only: Beethoven for VS Code (Ashley for VS Code until
  3.0.0; repository `OpenSpineConsortium/beethoven-vscode`, Desktop folder
  `C:/Users/grego/OneDrive/Desktop/ashley` until the maintainer renames it)
  (`grid/worker.sbatch.tpl`, `grid/bootstrap.sbatch`, `grid/phone.js`, `grid/license.js`,
  `extension/src/core/terms.ts`, `extension/src/core/diagnostics.ts`, `docs/ARCHITECTURE.md`,
  `CLAUDE.md`). Never edit it from here.

## Rules that are not negotiable

- **The public name is Beethoven (decided 2026-09-29, extension 7.0.0).** A name beginning with
  Anthropic's mark was set aside because it could draw store and brand objections. Everything a
  student, a store reviewer or the public reads says Beethoven and never the code name: the
  manifest, every page and screen of the extension, the check results, the audit export, the
  agreement and the privacy statement, the store texts and the pages under
  `https://openspineconsortium.com/beethoven/`. The name lives in one constant per place
  (`PRODUCT_NAME` in `extension/src/core/terms.ts`, the site map in the site repository's
  `tools/build_site.py`). Wherever the product is described, the trademark sentence is: Beethoven
  runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's
  marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher. What keeps the
  old name, and why: the repository and its folder (private); the kill-list's format tag
  `ASHLEYREV1` (the signer and the verifier check it; the verifier also accepts `BEETHOVENREV1` from
  8.0.0); the old cluster paths `/rs/rs_grp_oschome/shared/ashley` and `~/.ashley`, which since
  framework 7 are links to `shared/beethoven` and `~/.beethoven` and stay for builds up to 7.0.0;
  the cluster utility `hpcworker`, which the panel never shows (it says "the lab's shared copy,
  version N" or "your own copy, version N"); the storage keys `bridge.*`; and the wire value
  `product: "bridge"` the access service maps to Beethoven. The old addresses under
  `/ashley/bridge*` and the service name `ashley-service` stay up for Ashley for VS Code 3.0.0 (the
  sibling VS Code edition before it became Beethoven for VS Code 4.0.0) and builds 4.0.0 to 6.0.0;
  nothing in 7.0.0 points at them (`docs/PUBLISHING_SITE.md`).
- **Beethoven never reads, stores, copies, prints or relays a Claude credential.** No
  `setup-token`, no `CLAUDE_CODE_OAUTH_TOKEN`, no reading `~/.claude/.credentials.json` or
  `~/.beethoven/claude/.credentials.json` (or through its old name, `~/.ashley/claude`). The student
  signs in with `claude auth login` on a compute node themselves; the framework only starts Claude
  Code where its own credential already is (`claude_config_dir` in the profile) and reads `claude
  auth status`. Every credential variable is removed from the worker's environment; `claude auth
  logout` is never run. One person, one account.
- **Tokens and secrets never appear on command lines, in argv, in logs, in job files or in
  `sbatch --export`.** Never echo one. The per-job token is a mode-0600 file.
- **No code on claude.ai.** No content script, no host permission, no fetch patch. The extension's only
  content script runs on the one Open OnDemand origin the student grants at click time. Never request
  `cookies`, `tabs`, `webRequest`, `webRequestBlocking`, `declarativeNetRequest`, `nativeMessaging`,
  `debugger` or `identity`, and never any `claude.ai`, `anthropic.com` or `claude.com` origin. No
  automated login; the MFA step is never touched.
- **No remote code.** No `eval`, no `new Function`, no fetched scripts. The kill-list is JSON verified
  with WebCrypto against the bundled public key; the extension works offline on the last good list and
  refuses only on a verified revocation. Since 4.0.0 the list withdraws versions only.
- **No licence keys in Beethoven (decided 2026-09-29).** Authentication is the student's own
  sign-in to their Open OnDemand portal; authorization is the vendor's approved list, asked through
  the access service (`access_check` in `services.json`) for the account name the portal's dashboard
  shows for the session, never a typed one. The extension never reads a cookie. Requests to the
  vendor happen only after the agreement is accepted (the kill-list gate in `background.ts` is the
  model); a confirmed approval is kept 24 h (7 days when the service is unreachable), a refusal 10
  minutes. The sibling Beethoven for VS Code (Ashley for VS Code until 3.0.0) keeps its own key flow
  and the same approved list serves both.
- **One approved account, one installation (decided 2026-09-30, 8.0.0).** The approval check also
  sends `install_id`, the random identifier `ext/storage.ts` `installId()` makes once per
  installation (16 random bytes, nothing about the device; a reinstall makes a new one). The service
  binds an approved account to the first installation that asks; another gets
  `"reason":"other_installation"` and the strip says "This account is already set up on another
  computer. Ask your lab lead to move it here." with no button; an installation already bound to
  another approved account gets `"reason":"other_account"` and "This installation of Beethoven is
  already set up for another account. Ask your lab lead to move it to yours.", also with no button;
  a request with no identifier gets `"update_required"`. The wire stays `v:1` (the service before
  8.0.0 refuses any other `v` and ignores unknown fields). Never a hardware address, serial or other
  device identifier, no fingerprinting, no obfuscation (Chrome forbids it; Vite's minification
  only): everything the check sends and the service keeps is written in `LICENSE.txt` section 3(e)
  and 10 and in `PRIVACY.md`. It is a check in the client, not a proof, and no text may claim more.
- **One store, one private listing (decided 2026-09-30, 8.0.0).** Beethoven is offered only as a
  Private item on the Chrome Web Store whose trusted testers are the maintainer's Google Group of
  approved students (`docs/store/SUBMISSION.md`). No Edge, Firefox or Safari listing, no signed
  file, no download on the website or for students anywhere else. The Firefox build script stays
  because the code builds for it; nothing submits it.
- **Grid etiquette.** Nothing runs on the login node beyond one `sbatch`, `squeue` or `scancel` per
  action; no container command on the login node and nothing of ours under its `/tmp`; container
  temp and cache on the compute node's local disk (`/tmp/$USER/...` with a cleanup trap; on Wayne
  State `$TMPDIR` is NOT node-local, it points at CephFS, so never trust `$TMPDIR` blindly); IPC
  under `/dev/shm`; scheduler polling never faster than 60 s from clients (the job writes
  `status.json`; clients read the file); every job has a wall time. Attribute these exactly when
  writing for anyone outside: only "nothing container-related on `warrior` and nothing of ours under
  its `/tmp`" is C&IT's instruction (2026-09-28); the 20-process login-node cap is Wayne State's
  published policy; the 60 s floor and the wall-time rule are this product's own etiquette, taken
  from the strictest published rules in the sample and the licence of the VS Code edition (then
  Ashley's), and C&IT never stated them.
- **Nothing is deleted outside the framework's own run directories and node-local temp.** On
  2026-09-28 at 22:34 local the student's whole `~/.ashley` folder on the grid was deleted while a
  Remote Control session spawned from the phone was open, and the Claude login inside it was lost;
  which process did it is not established. No software of ours may ever be able to do that: never
  the Claude Code login directory, the workspace, another run or anything else under `$HOME`. A
  destructive subcommand refuses when `CLAUDECODE`, `BEETHOVEN_REQUEST_ID` (or its older name
  `ASHLEY_REQUEST_ID`) or a similar agent marker is in the environment, or when stdin is not a
  terminal.
- **The consent signal is Claude Code's own.** Claude Code records the student's answer to "Enable
  Remote Control?" in `<CLAUDE_CONFIG_DIR>/.claude.json` as `remoteDialogSeen: true` (with
  `remoteControlMachineId`), and directory trust as `projects[<dir>].hasTrustDialogAccepted: true`.
  Read those two boolean keys and nothing else from that file; a marker file is only a fallback. Never
  rewrite that file except to seed `hasCompletedOnboarding`, `theme` and the workspace's
  `hasTrustDialogAccepted`, and only when the student has started a login or a worker on purpose.
- **Students see one path and no internals.** Plain words in anything student-facing; no close codes,
  endpoint paths or variable names in the panel. Container builds, runtimes, QoS and vendor tooling stay
  admin-only.
- **Terms.** `LICENSE.txt` and `PRIVACY.md` at the repository root are the canonical texts (Trial
  Edition; since 2026-09-30 and extension 8.0.0 `LICENSE.txt` is version 7 and `PRIVACY.md` version
  8, which add the shared copy as the only install, one installation per approved account with the
  installation identifier in the approval check, the request page's Google account, purpose,
  optional CV (deleted twelve months after the decision) and mailbox confirmation, and the private
  Chrome Web Store listing as the only channel; both describe the software as built (no keys; the
  approval check against the access service with the account name the portal shows and the
  installation identifier; the daily fetch of `services.json` and the withdrawn-versions list; no
  activation step, no error reports; all requests only after acceptance); `TERMS_VERSION` in
  `extension/src/core/terms.ts` is 7 to match, with `TERMS_DATE` 2026-09-30; the framework's
  `VERSION` does not follow them). The copies the extension ships in `extension/public/` must be
  byte-identical to them at build time. Change a text and its version together (integer). Never
  pre-tick a box; the button label is part of the record; a changed agreement is shown again and
  accepted again.
- Never use the p-word (the one that starts "prov" and ends "enance") for the history of a file or a
  piece of data; say origin, source or record. Versions are integers (1.0.0, 2.0.0), never
  fractional.
- Match the surrounding code's style. Comment density like the VS Code edition's: why, not what.
- Branch `main`; commit directly to it, no feature branches. During the parallel build week the
  streams do not commit; the maintainer reviews and commits. Signing keys live in
  `~/.beethoven-vendor` (`~/.ashley-vendor` is a junction to it) and never enter the repository.

## Layout and streams

- `framework/`: bash 4.2 plus Python 3.6 standard library only (the Wayne State login node is CentOS
  7). `lib/profile.py` (site profile schema and CLI), `lib/adapters/{common,slurm,pbs,lsf}.sh` (the
  eight-call adapter interface), `profiles/<site>.json`, the job template and probe job,
  `bin/hpcworker` (the one command) and `tests/` (`run.sh`, six unittest files, fixtures). Two
  install modes since framework 5 (`docs/ARCHITECTURE.md` 2.1): the lab's shared copy, kept once per
  site where the profile names `shared_install` (Wayne State:
  `/rs/rs_grp_oschome/shared/beethoven/hpcworker/current`, a link to `v<N>/`, published with
  `tools/deploy_shared.sh`; `hpcworker install --shared` gives the student's `~/.hpcworker` a
  launcher, the marker `~/.hpcworker/shared` and the profile, and copies no code), and the student's
  own copy in `~/.hpcworker` (every other site, and the fallback). The student's state (profile,
  consent marker, log, run directories) is theirs in both; a shared copy is never replaced by the
  extension and never called outdated by it.
- `extension/`: WXT 0.21 plus TypeScript, `browser.*` with Promises, no polyfill; `wxt.config.ts`
  holds the manifest exactly as the report's permission table specifies it; `src/core/` (audit
  chokepoint, net, redact, shell driver), `src/licensing/` (kill-list verification; no licence keys
  since 4.0.0), `src/entrypoints/` (onboarding, popup, sidepanel), `mock-ood/` (the reviewer's mock
  portal, with a stand-in for the access service that binds one installation per approved account),
  `scripts/sync-profiles.mjs` (copies `../framework/profiles/*.json` as data, and the two agreement
  texts, into `public/` before every build and zip; since 8.0.0 no framework code enters the
  package).
- `docs/`: the report, the design documents, the pilot plan, open questions and measurements.
- `tools/`: `push_via_grid.sh` and `push_org.sh` (the two remotes), (the site pages are generated by the site repository's
  `tools/build_site.py`, which reads `LICENSE.txt` and `PRIVACY.md` from here; it hosts no package),
  `deploy_shared.sh` (publishes the framework to a site's shared copy over ssh, from the laptop; on
  the login node only tar, chmod, setfacl and one link; older versions are kept).

## Building and testing

Windows: Node 22 is at `/c/Users/grego/tools/node22`; python is `python -X utf8`; inline shell heredocs
eat backslashes, so write scripts with the Write tool and run them by path; line endings LF.

```
export PATH=/c/Users/grego/tools/node22:$PATH
cd extension && npm ci                   # pinned: wxt 0.21.4, vite 8.3.1, typescript 5.9.3, vitest 5.0.2, ws 8.22.0
npm run typecheck && npm test            # tsc --noEmit; vitest (the mock portal starts itself on an ephemeral port)
npm run build                            # wxt build -b chrome && wxt build -b firefox --mv2 (sync-profiles runs first; only Chrome ships)
npm run zip                              # the Chrome zip is the one uploaded (docs/store); the Firefox and sources zips are not submitted
npm run build:safari                     # builds; no Safari edition is offered
npm run build:dev                        # the Chrome build that can connect http://localhost, for the mock
npm run mock                             # node mock-ood/server.mjs, port 8080 by default (--port N); flags in extension/README.md
```

```
HPCW_PYTHON=python bash framework/tests/run.sh   # bash -n, the rendered template, LF check, the unittest cases
python -X utf8 framework/lib/profile.py validate framework/profiles/wayne.json
python -X utf8 framework/lib/profile.py schema
bash -n framework/lib/adapters/*.sh      # syntax; shellcheck where installed
```

On this Windows machine `HPCW_PYTHON=python` is required: `run.sh` tries `python3` first, which here is
the Microsoft Store stub ("Python was not found"), and the run fails without it. On the grid login node
`HPCW_PYTHON=/usr/bin/python3 bash tests/run.sh` passes under Python 3.6. The extension commands are
the ones in `extension/package.json`, described in `extension/README.md`. Anything that runs a
container, a scheduler call or Claude Code runs on the grid inside a Slurm job, never on the login
node and never on the laptop.

## Grid

`go2432@grid.wayne.edu` (alias `wsu-grid`; network via WSL: `wsl -e bash -lc '...'`). Portal
`https://ondemand.grid.wayne.edu` (VPN only). Profile: `framework/profiles/wayne.json`: `secp` with
`--qos=secondary` for interactive and test allocations, `reqp` with `--qos=requeue` for long
workers, `gmsap`/`gvohp` for GPU; state under `/rs/rs_grp_oschome/$USER/hpcworker` (CephFS; the home
is a Panasas soft quota); node-local temp `/tmp/$USER/hpcworker_$SLURM_JOB_ID`; the shared worker
image at `/rs/rs_grp_oschome/shared/beethoven/containers/claude-node22` with `module load
apptainer/1.2.2`; the student's Claude Code login in `$HOME/.beethoven/claude` (the profile's
`claude_config_dir`, the `CLAUDE_CONFIG_DIR` of Beethoven for VS Code); the framework's shared copy
at `/rs/rs_grp_oschome/shared/beethoven/hpcworker/current` (the profile's `shared_install`; group
read and execute, no group write; until 2026-09-30 the lab folder was `shared/ashley` and the
sign-in folder `~/.ashley/claude`, both now links). Everything under `/rs/rs_grp_oschome` is group
`oschome` with `other::---`, so every student must be in that group before a first run, in either
install mode (two members on 2026-09-29; `docs/OPEN_QUESTIONS.md`). `#SBATCH --output` resolves
against the submit directory (use `-D`); chain with `afterany`, never `afterok`; `/tmp` is swept
while jobs run.

Measured 2026-09-28: compute-node egress from `asx15`, direct, `api.anthropic.com` 404 (reachable),
`platform.claude.com` 200, `claude.ai` 403 to curl, `statsig.anthropic.com` no DNS record; paste-code
`claude auth login` completed from a compute node inside the image, into `$HOME/.ashley/claude`,
`claude auth status` `loggedIn: true`, plan `max` (that login was lost with the folder at 22:34 local
the same evening and has to be redone). Measured 2026-09-29 (02:22 UTC): Remote Control registers from an `sbatch`
job under a pseudo-terminal with the answer on record (Ashley's phone host, job 40496445, `asx15`);
open question 1 is yes. The registration block of `claude remote-control` 2.1.283 ends with the session
name on its own line (like `asx10-hazy-meadow`) and
`https://claude.ai/code?environment=env_...`; `connection.json` carries both as `session_name` and
`environment_url`, and the environment id is stable per machine id.

Decided 2026-09-29, being built this week (the documents already describe it; check the code before
claiming it is there): the worker is always on (the job queues one successor with
`sbatch --dependency=afterany:$SLURM_JOB_ID` of the same rendered script before its wall time ends, at
most one, ended by a stop file; the successor runs `claude remote-control --continue` in the same
directory when `connection.json` is younger than seven days, else registers afresh in the same environment);
`hpcworker claude login` is one sitting (`claude auth login`, then `claude remote-control` once in the
workspace if `remoteDialogSeen` is not yet true; `claude consent` stays as an alias that explains);
the panel's green *Open in Claude* button opens `environment_url` with `browser.tabs.create` (no
`tabs` permission is needed for `create`) with *Copy link* beside it, and the link is opened by
itself once per new link per browser when *open claude.ai when my worker connects* is on; the setting
*start my worker when I open my portal* starts the worker when the portal tab connects and status is
not online, at the 60 s floor, and is ON by default in the current build (`DEFAULT_PREFS` in
`extension/src/core/keys.ts`; the earlier decision had it off, and the maintainer's review settles
which ships); a checklist step opens `https://claude.ai/settings/connectors` in a new tab with one
sentence and a local *done* tick.

Decided 2026-09-29 (evening), in the maintainer's words: "Claude Code is like gas, the Ashley code
base is the car." The container image with Claude Code in it and the framework are the lab's shared
things, kept once on the lab's CephFS volume; the extension is the student's thin client, which
makes the student's account see them (`hpcworker install --shared`, typed through the portal's
shell) and then starts, watches and stops the worker. Since 8.0.0 the extension carries no framework
and uploads nothing; a site with no shared directory is told to ask its lab lead. The extension
updates itself through its private Chrome Web Store listing. Fetching the framework from the private
GitHub repository is not possible for a student (no token) and is not designed.

## How to be useful here

The recurring failure mode in the neighbouring projects is a number or a state that is wrong but
plausible. Check against something outside the computation: the report's cited behaviour, the portal's
actual response, a render of the panel, the raw line in `rc.log`. When a tidy explanation presents
itself, test it before believing it. Say plainly what is not known; "not yet measured" is the preferred
form.
