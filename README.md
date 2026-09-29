# Ashley Bridge (working name)

Ashley Bridge puts a student's own Claude Code session, running as an ordinary batch job on their
university's cluster, inside claude.ai and the Claude phone app. It does this with a feature Anthropic
already ships to Pro and Max subscribers, Claude Code Remote Control: the `claude` process in the job
registers with Anthropic over outbound HTTPS and polls for work, and claude.ai/code or the app becomes
a window onto that session, with attachments, transcript sync and push notifications. Nothing is
intercepted, nothing is forged, no inbound port is opened on the cluster, and no credential passes
through anything the vendor operates. The design, and the rejection of the earlier idea of patching
claude.ai from a browser extension, are set out in `docs/RESEARCH_REPORT.md`.

Two pieces do the work. The cluster-side **framework** (`framework/`, working name `hpcworker`) is
shell and Python installed in the student's own account: a static site profile per university, a
scheduler/runtime/egress adapter (Slurm first; PBS Pro and LSF next), one job template, a probe job
that discovers what the site's documentation does not say, and a worker entrypoint that starts
`claude remote-control` inside `tmux` in an Apptainer image and writes `status.json` and
`connection.json` to shared storage. The browser **extension** (`extension/`, working name
`ood-worker`) is a launcher and a diagnostics panel. It talks to exactly one origin, the student's
Open OnDemand portal, over surfaces that exist on every Open OnDemand 3.x and 4.x site without
administrator help: the Shell WebSocket (to run one `sbatch` and close), the Files JSON routes (to
read the job's status files), and Active Jobs JSON (to reconcile). It rides the portal session the
student already has in the browser; it never reads the cookie and never automates a login.

The product is small on purpose. On twelve sampled US university clusters the things that break a
worker, egress from compute nodes, the container runtime, node-local temp, login-node rules, proxy
settings, are undocumented or administrator-controlled, so most of the extension's value is that it
finds them from inside a probe job and explains each failure in one sentence. Portability is a
by-product of designing for Wayne State's rules: a worker that never runs anything persistent on the
login node, keeps IPC under `/dev/shm`, keeps images and caches off the parallel home filesystem and
treats `/tmp` as ephemeral satisfies every other site sampled.

## How the Remote Control path fits together

```
student's browser / phone            university network (VPN where required)                Anthropic
────────────────────────             ──────────────────────────────────────────              ─────────
claude.ai/code, Claude app  ◀════════════════ outbound HTTPS only, from the job ═══════════▶ api.anthropic.com
  (sees the session by name;                                                                  ▲ registers,
   transcript stored while connected)                                                          │ polls for work
                                                                                               │
Ashley Bridge extension ──▶ https://ondemand.<university>.edu ──▶ login node ──sbatch──▶ compute node (Slurm job)
  (one origin, one            │ Shell WebSocket: one sbatch, then close      (nothing else)   tmux ▶ apptainer exec
   content script)            │ Files JSON: read status.json, rc.log                          ▶ claude remote-control
                              │ Active Jobs JSON: reconcile                                     writes status.json,
                              └────────── shared storage <state_dir>/<run>/ ◀────────────────── connection.json, rc.log
```

What a student does, in order:

1. **Install and connect.** Install the extension from the browser's store, read and accept the
   agreement, type the portal address (`ondemand.<university>.edu`) and click *Connect this portal*.
   The browser asks once for access to that one site.
2. **Sign in to the portal in a tab**, the usual way (VPN first if the university requires it). The
   extension checks the portal, the shell, the files app and the jobs list, then submits a five-minute
   probe job and reports in plain words what works and what does not.
3. **Sign in to Claude once, on a compute node.** The extension shows the exact commands and checks
   afterwards; it never types answers. From an interactive allocation, inside the worker image, the
   student runs `claude auth login` (paste-code flow), moves into the project folder, runs
   `claude remote-control` once, answers *Enable Remote Control?* and *Trust this directory?*
   themselves, confirms the session appears at claude.ai/code, and presses Ctrl-C.
4. **Start the worker.** One click submits the job through the portal shell and closes the shell. The
   disclosure about where files, output and the transcript go is shown at this point every time.
5. **Find the session.** When the job is running the panel shows its name, `<site>-<jobid>`, and says:
   open claude.ai/code, or tap *Code* in the Claude app, and pick that name.
6. **Work from claude.ai or the phone.** The panel shows the job's state from `status.json`, checked no
   more than once a minute; *Stop* cancels the job. After the wall time, *Start* again runs
   `claude remote-control --continue` in the same directory, which the documentation says recovers a
   session for about four hours (not yet measured under Slurm).

## What it never does

From the report's "deliberately absent" list and its security controls:

- No code on claude.ai: no content script, no host permission, no `fetch` patch, no forged responses.
- No handling of a Claude credential: no `setup-token`, no `CLAUDE_CODE_OAUTH_TOKEN`, no reading of
  `~/.claude/.credentials.json`, no multi-account rotation. The student signs in through Anthropic's
  own flow; the framework starts Claude Code where that credential already is and reads only
  `claude auth status`.
- No install-time host permission. Access to the one portal origin is requested from a button click.
- No `cookies`, `tabs`, `webRequest`, `webRequestBlocking`, `declarativeNetRequest`,
  `nativeMessaging`, `debugger` or `identity` permission. The portal cookie is carried by the
  browser's network stack and never read.
- No automated login and no touch on the MFA step: a redirect to the identity provider means "sign
  in to your portal in a tab".
- No remote code: no `eval`, no fetched scripts. The kill-list is JSON, verified with WebCrypto against
  a public key compiled into the bundle, and the extension works offline on the last good list.
- Nothing persistent on the login node: one `sbatch --parsable` through the shell, then the shell is
  closed. Scheduler-facing polling never faster than once a minute; the job writes `status.json` and
  clients read the file.
- No durable secret in extension storage. Connection state lives in `storage.session`; the audit log
  of every portal request stays on the device and is never transmitted.
- No transmission of command text, file paths, prompts, job output, portal cookies or tokens to the
  vendor. Off-device collection is limited to licence activation and optional crash reports.

## Status

Pre-release. Designed from the research report of 2026-09-28 and being tested on Wayne State
University's grid (`ondemand.grid.wayne.edu`, Slurm, Apptainer, CentOS 7 login node). Two of the
twelve open questions were measured on 2026-09-28 (compute-node egress; paste-code login from a
compute node inside the image); the first, whether `claude remote-control` stays registered from an
`sbatch` job under `tmux`, is the next test. The product name and identifier carry no university
name. Written approval from Wayne State C&IT and a written answer from Anthropic precede any paid key.

## Documents

- `docs/RESEARCH_REPORT.md`: the research and the build specification everything else derives from.
- `docs/ARCHITECTURE.md`: components, site profile, adapter interface, job template, the Remote
  Control launch sequence, the Open OnDemand channels, the extension per browser, security controls.
- `docs/DIAGNOSTICS.md`: the 17 checks the extension runs and the framework's cluster-side checks.
- `docs/OPEN_QUESTIONS.md`: the 12 ranked open questions, their first tests and results.
- `docs/STORE_LISTING.md`: single-purpose statement, permission justifications, privacy answers per
  store, reviewer access, the 13-item checklist.
- `docs/WAYNE_STATE_PILOT.md`: the pilot plan for the first campus.
- `docs/MAC_AND_SAFARI.md`: what the Safari edition needs.
- `docs/LICENSE-FULL-NOTE.md`: how a paid edition's agreement will be made.
- `LICENSE.txt`, `PRIVACY.md`: the Trial Edition agreement and the privacy statement.
- `SECURITY.md`: threat model, controls, how to report a problem.
- `CLAUDE.md`: working rules for this repository.
- `docs/prior_analysis_architecture.txt`, `docs/prior_analysis_protocols.txt`: the two earlier
  analyses that proposed intercepting claude.ai, kept for the record; the report rejects that design.
