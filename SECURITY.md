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
  `sender.id`; no secret is ever sent to a content script.
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
- No durable secret: connection state in `storage.session`; `storage.local` holds only the portal
  hostname, granted origin, preferences and the acceptance record. Extension storage is not encrypted
  and is treated accordingly.
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

Release pipeline and keys:

- Lockfile and `npm ci`; GitHub Actions pinned by commit SHA; a build attestation from a hosted builder
  (SLSA level 2 at minimum; signing material inaccessible to build steps as the level 3 target);
  reproducible-build instructions published for all stores.
- No long-lived store API key in CI. The publisher accounts and the kill-list and licence signing keys
  sit behind a hardware security key with no third-party OAuth grants; private keys never enter the
  repository.

## What Ashley Bridge holds, and where

- In the browser: portal hostname and granted origin, preferences, licence key and institutional
  identifier, the acceptance record, the audit log, copies of error reports; session-only connection
  state.
- In the student's cluster account: the framework, the licence key, job files, `status.json`,
  `connection.json`, `rc.log`, the per-job token (0600), and Claude Code's own sign-in (written by Claude
  Code, never read by Ashley Bridge).
- With the maintainer: licence and activation records; error reports if the student allows them
  (scrubbed of identity; retention 365 days).
- On Anthropic's servers, under the student's own account: the session transcript while Remote
  Control is connected, retained under Anthropic's data-usage terms.

## Supported versions

The current release. Older releases receive no fixes; the diagnostics say when a newer one is needed,
and a withdrawn version stops sending commands.
