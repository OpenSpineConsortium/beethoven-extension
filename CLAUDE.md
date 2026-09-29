# Ashley Bridge — working context

A university-agnostic HPC worker framework (`framework/`, `hpcworker`) plus a lightweight browser
extension (`extension/`, published as "Ashley Bridge") that make a student's own Claude Code worker,
running as a batch job on their university cluster, available inside claude.ai through Claude Code
Remote Control, using only the student's existing Open OnDemand browser session on the cluster side.
Vendor: Gregory Schwing, trading as OpenSpineConsortium (an LLC is planned and becomes the named
licensor when it exists). The product name and identifier carry no university name.

## Read first

- `docs/RESEARCH_REPORT.md`: the whole report, especially "Build specification for the week of
  28 September 2026". It governs. The two `docs/prior_analysis_*.txt` files proposed intercepting
  claude.ai; the report rejects that, and nothing here may implement it.
- `docs/ARCHITECTURE.md`, then `docs/DIAGNOSTICS.md`, `docs/OPEN_QUESTIONS.md` (what is measured and
  what is not), `SECURITY.md`, `docs/STORE_LISTING.md`, `docs/WAYNE_STATE_PILOT.md`.
- The research notes behind the report:
  `C:/Users/grego/OneDrive/Desktop/ashley/docs/research/research_notes/Browser extension HPC Claude worker/`.
- The product being reused, read-only: `C:/Users/grego/OneDrive/Desktop/ashley` (`grid/worker.sbatch.tpl`,
  `grid/bootstrap.sbatch`, `grid/phone.js`, `grid/license.js`, `extension/src/core/terms.ts`,
  `extension/src/core/diagnostics.ts`, `docs/ARCHITECTURE.md`, `CLAUDE.md`). Never edit it from here.

## Rules that are not negotiable

- **Ashley Bridge never reads, stores, copies, prints or relays a Claude credential.** No
  `setup-token`, no `CLAUDE_CODE_OAUTH_TOKEN`, no reading `~/.claude/.credentials.json` or
  `~/.ashley/claude/.credentials.json`. The student signs in with `claude auth login` on a compute node
  themselves; the framework only starts Claude Code where its own credential already is
  (`claude_config_dir` in the profile) and reads `claude auth status`. Every credential variable is
  removed from the worker's environment; `claude auth logout` is never run. One person, one account.
- **Tokens and secrets never appear on command lines, in argv, in logs, in job files or in
  `sbatch --export`.** Never echo one. The per-job token is a mode-0600 file.
- **No code on claude.ai.** No content script, no host permission, no fetch patch. The extension's only
  content script runs on the one Open OnDemand origin the student grants at click time. Never request
  `cookies`, `tabs`, `webRequest`, `webRequestBlocking`, `declarativeNetRequest`, `nativeMessaging`,
  `debugger` or `identity`, and never any `claude.ai`, `anthropic.com` or `claude.com` origin. No
  automated login; the MFA step is never touched.
- **No remote code.** No `eval`, no `new Function`, no fetched scripts. The kill-list is JSON verified
  with WebCrypto against the bundled public key; the extension works offline on the last good list and
  refuses only on a verified revocation.
- **Grid etiquette (C&IT, 2026-09-28).** Nothing runs on the login node beyond one `sbatch`, `squeue`
  or `scancel`; no container command on the login node; container temp and cache on the compute node's
  local disk (`/tmp/$USER/...` with a cleanup trap; on Wayne State `$TMPDIR` is NOT node-local, it
  points at CephFS, so never trust `$TMPDIR` blindly); IPC under `/dev/shm`; scheduler polling never
  faster than 60 s from clients (the job writes `status.json`; clients read the file); every job has a
  wall time.
- **Students see one path and no internals.** Plain words in anything student-facing; no close codes,
  endpoint paths or variable names in the panel. Container builds, runtimes, QoS and vendor tooling stay
  admin-only.
- **Terms.** `LICENSE.txt` and `PRIVACY.md` at the repository root are the canonical texts (Trial
  Edition, version 1). The copies the extension ships in `extension/public/` must be byte-identical to
  them at build time. Change a text and its version together (integer). Never pre-tick a box; the button
  label is part of the record; a changed agreement is shown again and accepted again.
- Never use the word "provenance". Versions are integers (1.0.0, 2.0.0), never fractional.
- Match the surrounding code's style. Comment density like Ashley's: why, not what.
- Branch `main`; commit directly to it, no feature branches. During the parallel build week the
  streams do not commit; the maintainer reviews and commits. Signing keys live in `~/.ashley-vendor`
  and never enter the repository.

## Layout and streams

- `framework/`: bash 4.2 plus Python 3.6 standard library only (the Wayne State login node is
  CentOS 7). `lib/profile.py` (site profile schema and CLI), `lib/adapters/{common,slurm,pbs,lsf}.sh`
  (the eight-call adapter interface), `profiles/<site>.json`, the job template and probe job, and
  `bin/hpcworker` (referenced by the adapters; confirm it exists before relying on it).
- `extension/`: WXT 0.21 plus TypeScript, `browser.*` with Promises, no polyfill; `wxt.config.ts` holds
  the manifest exactly as the report's permission table specifies it; `src/core/` (audit chokepoint,
  net, redact, shell driver), `src/licensing/` (key and kill-list verification), `src/entrypoints/`
  (onboarding, popup, sidepanel), `mock-ood/` (the reviewer's mock portal), `scripts/sync-framework.mjs`
  (copies `../framework/**` into `public/framework/` with a hashed manifest before every build and zip).
- `docs/`: the report, the design documents, the pilot plan, open questions and measurements.
- `tools/`: release and signing helpers (empty at the time of writing).

## Building and testing

Windows: Node 22 is at `/c/Users/grego/tools/node22`; python is `python -X utf8`; inline shell heredocs
eat backslashes, so write scripts with the Write tool and run them by path; line endings LF.

```
export PATH=/c/Users/grego/tools/node22:$PATH
cd extension && npm ci
npm run typecheck && npm test            # tsc --noEmit; vitest
npm run build                            # wxt build -b chrome && wxt build -b firefox --mv2 (runs sync-framework first)
npm run zip                              # store zips; wxt zip -b firefox also yields the AMO source zip
npm run build:safari                     # then xcrun safari-web-extension-packager on a Mac
npm run mock                             # the mock Open OnDemand portal for reviewers and tests
```

```
python -X utf8 framework/lib/profile.py validate framework/profiles/wayne.json
python -X utf8 framework/lib/profile.py schema
bash -n framework/lib/adapters/*.sh      # syntax; shellcheck where installed
bash framework/tests/run.sh              # TO BE CONFIRMED: the framework stream's test entry point
```

The extension commands above are the ones in `extension/package.json`; the framework's test entry point
was not present when this file was written and is marked to be confirmed. Anything that runs a
container, a scheduler call or Claude Code runs on the grid inside a Slurm job, never on the login
node and never on the laptop.

## Grid

`go2432@grid.wayne.edu` (alias `wsu-grid`; network via WSL: `wsl -e bash -lc '...'`). Portal
`https://ondemand.grid.wayne.edu` (VPN only). Profile: `framework/profiles/wayne.json`: `secp` with
`--qos=secondary` for interactive and test allocations, `reqp` with `--qos=requeue` for long workers,
`gmsap`/`gvohp` for GPU; state under `/rs/rs_grp_oschome/$USER/hpcworker` (CephFS; the home is a
Panasas soft quota); node-local temp `/tmp/$USER/hpcworker_$SLURM_JOB_ID`; the shared worker image at
`/rs/rs_grp_oschome/shared/ashley/containers/claude-node22` with `module load apptainer/1.2.2`; the
student's Claude Code login in `$HOME/.ashley/claude`. `#SBATCH --output` resolves against the submit
directory (use `-D`); chain with `afterany`, never `afterok`; `/tmp` is swept while jobs run.

Measured 2026-09-28: compute-node egress from `asx15`, direct, `api.anthropic.com` 404 (reachable),
`platform.claude.com` 200, `claude.ai` 403 to curl, `statsig.anthropic.com` no DNS record; paste-code
`claude auth login` completed from a compute node inside the image, `claude auth status` `loggedIn:
true`, plan `max`. Not yet measured: Remote Control from `sbatch` under `tmux` (open question 1).

## How to be useful here

The recurring failure mode in the neighbouring projects is a number or a state that is wrong but
plausible. Check against something outside the computation: the report's cited behaviour, the portal's
actual response, a render of the panel, the raw line in `rc.log`. When a tidy explanation presents
itself, test it before believing it. Say plainly what is not known; "not yet measured" is the preferred
form.
