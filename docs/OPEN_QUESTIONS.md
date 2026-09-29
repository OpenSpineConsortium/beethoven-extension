# Open questions that only a real cluster can settle

The twelve questions from the report ("Open questions that only a real cluster can settle"), in the
report's rank order, each with the first test to run and a column for the answer. Record an answer
with the date, the node or browser it was measured on, and the raw observation before the
interpretation; "not yet measured" is the right entry until then. Two were measured on 2026-09-28.

The first three can be answered in one afternoon on `reqp` before a line of extension code is written.
If question 1 fails, the fallback is not interception but Anthropic's `--headless` request
(upstream issue open since March 2026), a partner-site Open OnDemand app, or the Team/Enterprise
self-hosted runner; the framework serves all three.

| Rank | Question | Why it gates the product | First test | Result (date, where, observation) |
|---|---|---|---|---|
| 1 | Does `claude remote-control` start and stay registered from an `sbatch` job under `tmux` (or `script -qfc`) with consent and directory trust pre-accepted from `srun --pty`? | The entire Remote Control path rests on an inference from documented TTY behaviour; no source shows it under `sbatch` | One job on `reqp` from a project subdirectory; watch `rc.log` for the registration line and claude.ai/code for the session by name; leave it an hour; send a prompt from the phone | Not yet measured |
| 2 | Can Wayne State's compute nodes reach `api.anthropic.com`, `platform.claude.com`, `claude.ai` and the unnamed feature-flag host, directly or via proxy? | Remote Control is unavailable if the flag service is unreachable; WSU publishes no egress policy | The probe job's `curl` matrix plus the "Couldn't verify Remote Control eligibility" check in the dry run | **Partly measured 2026-09-28, compute node `asx15`, direct (no proxy):** `api.anthropic.com` HTTP 404 (reachable); `platform.claude.com` 200; `claude.ai` 403 to curl (reachable; the 403 is the site refusing a bare curl, not a network block); `statsig.anthropic.com` no DNS record. Egress class for the three named hosts: `direct`. The feature-flag host is not named by Anthropic, so the `statsig` result settles nothing; the dry-run grep for "Couldn't verify Remote Control eligibility" is still needed |
| 3 | Does the paste-code `claude auth login` complete from a compute node inside the Apptainer image, and does Trusted Devices enrolment work from there? | Without a full-scope login nothing else matters | Interactive allocation on `reqp`, inside the image, `claude auth login`, paste the code, then `claude auth status` | **First half measured 2026-09-28, compute node, inside the image:** paste-code login completed; credential present in the bind-mounted `~/.claude`; `claude auth status` reports `loggedIn: true`, plan `max`. Trusted Devices enrolment: not yet measured |
| 4 | Does a session survive Slurm `SIGTERM`/requeue, and does `--continue` within four hours recover it in a new job? | Decides whether `--qos=requeue` is usable for workers | Start a session, send a prompt, `scontrol requeue` the job deliberately, start the next job with `--continue` in the same directory, check the transcript continues on the phone | Not yet measured |
| 5 | Does the bash tool hit `EACCES ... /run/user/<uid>` on the site's nodes, and does `XDG_RUNTIME_DIR=/dev/shm/...` inside the container fix it? | Closed "not planned" upstream; a broken bash tool is a broken worker | Smoke test in the probe job: a bash-tool call with and without the variable | Not yet measured |
| 6 | Is `rnode_uri` enabled at `ondemand.grid.wayne.edu`, with a `host_regex` admitting compute nodes, and can the OOD web node open TCP to the worker's port? | Decides fast path versus mailbox mode; strongly implied by the Jupyter and RStudio Server apps listed on the portal, unverified | From the VPN, signed in: `GET /rnode/<compute node>/1/`; 404 means off or regex mismatch, 503 "Failed to connect" means on | Not yet measured |
| 7 | Which host does WSU's Shell app connect to, is it in the allowlist, and does the web node's `ssh` to it need no password? | The Shell is the only universal submission channel | Check 5 against the live portal: `GET /pun/sys/shell/ssh/default`, open the WebSocket, read the prompt or the 3146 reason | Not yet measured (the KB names no host) |
| 8 | Do Firefox (strict ETP) and Safari carry the OIDC cookie on content-script and background requests, and does Safari's per-site prompt interact with `optional_host_permissions` as the compatibility data describes? | Determines whether Firefox and Safari get service-worker polling or content-script-only mode | The same GET from each context in each browser; Safari needs a Mac | Not yet measured |
| 9 | Which Rails write endpoints exist at WSU's OOD version (Job Composer present? Projects? `session_contexts`?) and does the dashboard layout expose `<meta name="csrf-token">`? | Decides whether any shell-free submission is possible there | Checks 6 to 8 against the live portal; view the dashboard source for the meta tag | Not yet measured (the KB's "compose and submit jobs" suggests the Job Composer existed when it was written; the version is not public) |
| 10 | Do user namespaces and the predicted `--fakeroot` rung work on compute nodes as on the login node, and is `srun --overlap` attach permitted? | Runtime adapter correctness; attach is best-effort | The probe job's `unshare -Ur true`, `apptainer exec docker://alpine true`, and `srun --jobid=$SLURM_JOB_ID --overlap true` | Not yet measured under the framework (Ashley's bootstrap has built and run sandboxes with `module load apptainer/1.2.2` on `asx1`, which answers the exec part for that module) |
| 11 | Does a Chrome service-worker WebSocket to the portal stay alive with 20-second pings, given that the shell's own inactivity timer counts only real input and output? | Confirms the bootstrap must be seconds long and never held open | An instrumented bootstrap: open, wait 90 s with pings only, observe which side closes and when | Not yet measured |
| 12 | Does the Developer-ID-plus-notarization Safari route load without "Allow Unsigned Extensions" on Safari 26? | Decides whether Safari can be distributed outside the App Store at all | Package with `xcrun safari-web-extension-packager`, sign with Developer ID, notarize, install on a clean current macOS, quit and reopen Safari | Not yet measured (needs a Mac and an Apple Developer Program membership) |

## Two questions that are not technical

Run in parallel with the above; both precede any paid key (report, "Licensing and terms carry-over").

| Question | Who answers | Status |
|---|---|---|
| Written approval from Wayne State C&IT, whose generative-AI guideline says "All AI tools must first be approved by C&IT; third-party AI bots are not approved for use at this time" | C&IT | Not yet requested in writing; see `WAYNE_STATE_PILOT.md` |
| A written answer from Anthropic on hosting the unmodified binary under each student's own subscription, including Remote Control from a cluster job | Anthropic sales, through the route the Claude Code legal page names | A draft exists in Ashley's `docs/ANTHROPIC_REQUEST.md`; add Remote Control from an `sbatch` job to question 3 of it before sending |

## How to record an answer

Replace "Not yet measured" with: date; node or browser and version; the exact command or request;
the raw output line that decides it; then one sentence of interpretation. Keep the log or screenshot
under `docs/measurements/` with the same date. A question answered "no" is recorded, not deleted, with
what was tried next.
