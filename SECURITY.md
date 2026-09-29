# Security

## Reporting

Report a security problem in Ashley Bridge privately to the maintainer through the Ashley support page
(`https://openspineconsortium.com/ashley/support.html`, which carries the notice address), not in a
public place. Say what you found, how to reproduce it, and what you think it exposes. You will get an
acknowledgement within five working days and a fix or a plan within thirty. Good-faith research within
the law (including 17 U.S.C. 1201(j) and the security-research exemption in 37 C.F.R. 201.40) is
welcome and will not be met with a claim.

## Threat model

The realistic adversary is not a browser exploit but a compromised publisher account, store API key or
dependency that ships a malicious update the browser auto-installs (Cyberhaven's phished OAuth grant,
Trust Wallet's leaked store key, ShadyPanda's seven-year sleeper, Shai-Hulud's npm worm, GlassWorm on
the VS Code registries; report, "Stores and universities accept one origin"). An extension that rides a
student's Open OnDemand session is a bearer of that student's portal identity for up to eight hours at
a time, so the design is built so that a stolen build inherits access to one origin per user, not to
"all sites", and can be switched off without the vendor being reachable.

The other adversaries considered:

- A hostile page. The only content script runs on the portal origin, so the DOM-injection and
  prototype-skimming classes apply to the portal page alone; messages are accepted only after checking
  `sender.id`; no secret is ever sent to a content script. The Anthropic pages the extension opens
  (the sign-in page during a sitting, the session's claude.ai/code link) are never read.
- A compromised framework or portal printing a link. The one address the cluster hands the extension
  during a sign-in sitting is opened only when it is `https` on `claude.ai` or `claude.com` (or a
  subdomain of either), and is reported as refused otherwise; the only link opened when a worker
  connects must match `https://claude.ai/code?environment=env_...` exactly; anything else is shown
  as text.
- Another portal user. The Open OnDemand `/rnode/` proxy does no job or ownership lookup: any
  authenticated portal user can reach any port on a matching host. The worker therefore trusts nothing
  the proxy adds (`X-Forwarded-User`, `Authorization`, the OIDC cookie) and requires its own per-job
  token in a custom header.
- The agent itself. The failure signature measured in the literature is quiet deviation, not gross
  failure (LLNL's `fractale` study: correct job specs with wrong affinity flags, an unrequested
  filtering step, polling by `sleep`). The framework runs supervised by default and enforces a task
  manifest (working directory, allowed partitions, allowed egress hosts) independently of the agent.
- The vendor's own outage. A one-person vendor must not be able to strand a campus: the extension
  works offline on the last good signed list and refuses only on a verified revocation.

Out of scope by construction: anything on claude.ai (the extension has no presence there) and any
Claude credential (none is handled).

## Controls

Extension:

- No install-time host permission; the single portal origin is requested from a button click
  (`optional_host_permissions: ["https://*/*"]`, `permissions.request` at click time). Universities can
  pin it with Chrome's `ExtensionSettings.runtime_allowed_hosts` and `runtime_blocked_hosts`; the exact
  host and permission list is in `docs/STORE_LISTING.md`.
- Never requests `cookies`, `tabs`, `webRequest`, `webRequestBlocking`, `declarativeNetRequest`,
  `nativeMessaging`, `debugger` or `identity`. The portal cookie is carried by the network stack and
  never read. No automated login; the MFA step is never touched.
- No remote code: no `eval`, no fetched scripts, MV3 default CSP. The kill-list is JSON verified with
  `crypto.subtle.verify` (Ed25519; ECDSA P-256 fallback below Chrome 137, Firefox 130, Safari 17)
  against a public key compiled into the bundle; a revoked version refuses to send commands and says
  why.
- One chokepoint for all portal traffic: an append-only, on-device audit record per request (UTC time,
  endpoint, method, job id, byte count, outcome), viewable and exportable by the student, never
  transmitted; the same function enforces the ≥60-second scheduler-facing poll floor and the
  shell-single-use rule.
- No durable secret. `storage.local` holds the portal hostname and granted origin, preferences, the
  acceptance record, the licence key and institutional identifier, the statement made about each
  worker's workspace (workspace, text and its version, time), the notes the strip keeps so it does
  not repeat itself (the last sign-in it saw with the account and plan Claude Code reported, the
  session links it opened, the probe job it submitted, the install it ran), the audit log, the last good copy of the
  signed kill-list, a random installation identifier, copies of error reports and the ticks on the
  optional checklist steps; `storage.session` holds connection state (the run's name and folder, the
  job number, the worker's last status file, the session name and link, the last 4,000 characters of
  `rc.log`), the portal tab, the tab the icon was clicked from, when the portal sign-in was last seen,
  what the last automatic start did, and the last check results. `PRIVACY.md` and
  `docs/ARCHITECTURE.md` section 6 carry the same list. Extension storage is not encrypted and is
  treated accordingly.
- The extension opens an Anthropic page only in a new tab through `tabs.create`, which needs no
  `tabs` permission, and only in a run the student started with the icon or a button: the sign-in
  page Claude Code printed during the sign-in sitting, the session's claude.ai/code link when the
  worker connects (a setting, on by default, that leaves the green *Open in Claude* button when off),
  and the connectors page from the optional Google Drive step. It has no presence on any page it opens.
- The pasted sign-in code passes through and is not kept. During the sign-in sitting the student
  pastes Anthropic's one-time code into one box in the panel; the extension sends it over its login
  port to the page script and into the student's own terminal on the cluster as keystrokes, holds it
  in a local variable only, clears the box as it sends, and records the whole sitting as one audit
  line carrying the counts of bytes read and bytes typed, never the text; it never places the code in
  storage, an error report or a message to the vendor. On the compute node the framework passes it to
  Claude Code's pseudo-terminal with echo off and never copies Claude Code's screen to the terminal
  the extension reads. No `clipboardRead` permission and no script on any Anthropic page, so the
  extension cannot take the code by itself. The sitting is one shell held open, one at a time, ended
  by the framework after ten minutes and by the panel after fifteen.
- The extension types nothing into Claude Code's prompts except that code. Claude Code's one-time
  Remote Control question is answered by the worker job from the student's own recorded statement
  (the marker file the panel writes on their acknowledgement, then Claude Code's own record), never
  without one.
- Every WebSocket frame is validated as JSON before it is sent; a bad frame would throw inside the
  student's only shell process on the portal.

Cluster side:

- Ashley Bridge never reads, stores, copies, prints or relays a Claude credential. The student signs in
  with `claude auth login` on a compute node; the framework starts Claude Code where that credential is
  and reads only `claude auth status`. Every credential variable (`CLAUDE_CODE_OAUTH_TOKEN`,
  `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, the file-descriptor variants) is
  removed from the worker's environment before Claude Code starts. `claude auth logout` is never run.
- Tokens and secrets never appear on command lines, in argv, in logs, in job files or in
  `sbatch --export`; the per-job token is a mode-0600 file on shared storage.
- Supervised mode (`--permission-mode default`) by default; a task manifest enforced by the framework;
  input data read-only with a separate writable working directory.
- Nothing on the login node beyond one `sbatch`, `squeue` or `scancel`; no container commands there;
  container temp and cache on the compute node's local disk with a cleanup trap; IPC under `/dev/shm`;
  the job writes `status.json` and clients read the file.
- The worker refuses to start in a directory marked restricted and when Remote Control is unavailable
  under Zero Data Retention.
- The framework never deletes anything outside its own run directories
  (`<shared_state_dir>/<run>/`) and the job's node-local temp and `/dev/shm` directory: never the
  Claude Code login directory, the workspace, another run, or anything else under `$HOME`. Any
  destructive subcommand refuses when `CLAUDECODE`, `ASHLEY_REQUEST_ID` or a similar agent marker is in
  the environment, or when stdin is not a terminal, so neither an agent nor a script can run it.
  Written after the incident recorded below.
- Claude Code's own settings file, `<claude_config_dir>/.claude.json`, is read for two boolean keys
  only, `remoteDialogSeen` (the student's own answer to "Enable Remote Control?") and the workspace's
  `hasTrustDialogAccepted`, and rewritten only to seed `hasCompletedOnboarding`, `theme` and that
  trust key for the workspace, only in the sign-in sitting or when a worker is about to start a
  session. The credentials file beside it is never opened. Before the first session the student's
  answer is the marker file `~/.hpcworker/consent`, written by the extension through the Files app on
  the student's acknowledgement in the panel; its existence is all the framework tests.
- The sign-in sitting (`hpcworker claude login --plain`, `framework/lib/login_plain.sh`) prints only
  its own lines (`HPCW-LOGIN:` progress, `AUTH-URL:`, `SIGNED-IN <email> <plan>` from Claude Code's
  own status answer, `HPCW-LOGIN-FAILED:`), never a token and never Claude Code's screen, which stays
  in a 0600 transcript under `/dev/shm` on the compute node for the sitting only and is removed with
  it; the code is read from standard input with the terminal's echo off and is never echoed back.

Release pipeline and keys:

- Lockfile and `npm ci`; GitHub Actions pinned by commit SHA; a build attestation from a hosted builder
  (SLSA level 2 at minimum; signing material inaccessible to build steps as the level 3 target);
  reproducible-build instructions published for all stores.
- No long-lived store API key in CI. The publisher accounts and the kill-list and licence signing keys
  sit behind a hardware security key with no third-party OAuth grants; private keys never enter the
  repository.

## Incident record

- **2026-09-28, 22:34 local, Wayne State grid.** The student's whole `~/.ashley` folder was deleted
  while a Remote Control session spawned from the phone was open; the Claude Code login inside
  `~/.ashley/claude` was lost with it, and the open session stopped making progress. Which process
  deleted the folder is not established from the files that remain. Nothing in Ashley Bridge should
  ever be able to do this, so two rules were added the same night and now stand in the controls above:
  the framework deletes nothing outside its own run directories and node-local temp, and a destructive
  subcommand refuses from an agent context or without a terminal. The login is redone with
  `hpcworker claude login`.

## What Ashley Bridge holds, and where

- In the browser: portal hostname and granted origin, preferences, licence key and institutional
  identifier, the acceptance record, the statement made about each worker's workspace, the strip's
  notes (last sign-in seen with the account and plan Claude Code reported, links opened, the probe
  job it submitted, the install it ran), the audit log, the last good kill-list, a random
  installation identifier,
  copies of error reports, the ticks on optional checklist steps; session-only connection state (the
  run's name and folder, job number, the worker's last status file, session name, the session's
  claude.ai link, the last 4,000 characters of `rc.log`), the portal tab, the tab the icon was clicked
  from, when the portal sign-in was last seen, what the last automatic start did, and the last check
  results. Never the pasted sign-in code.
- In the student's cluster account: the framework, the licence key, job files, `status.json`,
  `connection.json` (the session name and its claude.ai link), `rc.log`, the per-job token (0600), the
  successor job's id and the stop file, the consent marker `~/.hpcworker/consent` (one line: yes, the
  time, the browser's random installation identifier), and Claude Code's own sign-in (written by
  Claude Code, never read by Ashley Bridge). On a compute node, for a sign-in sitting only: the
  sitting's transcript under `/dev/shm`, mode 0600, removed with the sitting.
- With the maintainer: licence and activation records; error reports if the student allows them
  (scrubbed of identity; retention 365 days).
- On Anthropic's servers, under the student's own account: the session transcript while Remote
  Control is connected, retained under Anthropic's data-usage terms.

## Supported versions

The current release. Older releases receive no fixes; the diagnostics say when a newer one is needed,
and a withdrawn version stops sending commands.
