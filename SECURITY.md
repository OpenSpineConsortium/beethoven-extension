# Security

## Reporting

Report a security problem in Beethoven privately to the maintainer through the support page
(`https://openspineconsortium.com/beethoven/support.html`, which carries the notice address), not in a
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

Since 19.0.0 Beethoven signs in to the grid with the AccessID and password the student types into its
own sheet, and keeps the password only if the student ticks *Remember it on this computer*. That
widens the threat. A malicious update holds the clear password every time the student types it, and
every time a saved one is unlocked, and the password outlives the eight-hour session; whether the grid
password is the student's university-wide AccessID password is not established here, and if it is,
it opens far more than the grid. The passkey protects a saved password at rest: someone who copies
the browser profile, or reads the computer's disk, while the saved sign-in is locked gets AES-GCM
ciphertext and a passkey's credential id, and the key that opens them is derived from the passkey's
PRF output, which only Windows Hello, Touch ID or the screen lock releases and which is never written
to disk. It does not protect against a malicious build, or anyone who can run code in this browser
profile, once the student has unlocked it (or answers an unlock prompt such a build shows), or while
a typed password waits for its one attempt; nor against whoever can unlock the passkey itself, which
Chrome's password manager (in the Google account) or iCloud Keychain may offer on the student's other
devices. The kill-list and the one-origin grant still bound what a stolen build can reach with it
through Beethoven; nothing bounds what a thief does with a copied password elsewhere.

The other adversaries considered:

- A hostile page. The only content script runs on the portal origin, so the DOM-injection and
  prototype-skimming classes apply to the portal page alone; messages are accepted only after checking
  `sender.id`; no secret is ever sent to a content script, the grid password included: it never
  reaches the portal page's script (tab mode or the terminal of the one-time step), and nothing
  secret is kept in `storage.local`, which that script can read. The Anthropic pages the extension
  opens (the sign-in page during a sitting, the session's claude.ai/code link) are never read.
- A challenge that is not Beethoven's own. With `webRequest`, Beethoven sees every HTTP sign-in
  challenge on the granted portal origin, the student's own portal tabs included. Its one
  `onAuthRequired` listener answers only the HTTP Basic challenge of its own background dashboard
  request (tab -1, the extension as initiator, the portal's origin, host and port, not a proxy, and
  the realm of the last password Beethoven gave that worked, once one is on record) inside the one
  check it armed, once; a tab's challenge gets Chrome's own box, and a proxy's, another origin's,
  another realm's or another extension's gets nothing from it. Only listeners in the extension's own
  process see its requests, so another extension cannot answer or read Beethoven's. Once the grid
  accepts the password, Chrome's own auth cache sends it from the student's portal tabs too, until
  Chrome closes or browsing data with cookies is cleared; Forget and Disconnect do not end that, and
  the texts say so. Of the student's tabs it keeps one mark only, while its own answer waits for its
  outcome: a portal tab's challenge, or a portal tab's request that ends without a 401 or 403 and
  not from the cache, marks that answer (`tainted` on the pending answer in `storage.session`),
  because a sign-in in Chrome's box enters the same auth cache and Chrome may finish Beethoven's own
  request with it; no tab id, request id, address or debug line of the tab is kept.
- The university's lockout. Wayne State disables an AccessID after the fifth wrong password
  (reactivation up to three business days), so a wrong password answered by itself again and again
  would lock the student out. Beethoven itself sends a password the grid turns down at most once:
  the first refusal stops every automatic sign-in, from a saved password or a typed one, until the
  student types the password again, and a refused saved password is marked on its note, so neither a
  worker restart nor a browser restart retries it. A try whose outcome cannot be told is neither
  proof nor a refusal: when the browser closed, or the extension reloaded, before the grid replied
  (found at the next start from the note's `attempt_at` or `typed_attempt_at`), or when, while the
  answer waited, a portal tab was challenged or had a request end without a 401 or 403, not from the
  cache (a sign-in in Chrome's box goes into the same auth cache, and Chrome may finish Beethoven's
  own request with that password and raise no event), the saved password is put on hold
  (`stopped_at` on the note, and at once in the session's attempt state, so a slow or failed write
  of the note never lets it go again), no refusal is counted, and nothing is sent from it until a
  typed password works or a new one is saved. Chrome re-sends its cached copy once for each request already started with it
  before the first refusal comes back; Beethoven then sends at most one; when the answered request
  is abandoned before the grid replies, Chrome may re-send that copy once. How many of these the
  grid counts is not yet measured.
- A compromised framework or portal printing a link. The one address the cluster hands the extension
  during a sign-in sitting is opened only when it is `https` on `claude.ai` or `claude.com` (or a
  subdomain of either, never `platform.claude.com`, the Console's sign-in, which bills by use), and is
  reported as refused otherwise; the only link opened when a worker
  connects must match `https://claude.ai/code?environment=env_...` (or, since 14.0.0, a session's
  `https://claude.ai/code/session_...`) exactly; anything else is shown as text. Since 21.0.0 the
  project page the student named in Settings, kept in the one shape `https://claude.ai/code/project/<id>`
  (or the same on `claude.com`) and refused otherwise, opens in that link's place.
- Another portal user. The Open OnDemand `/rnode/` proxy does no job or ownership lookup: any
  authenticated portal user can reach any port on a matching host. The worker therefore trusts nothing
  the proxy adds (`X-Forwarded-User`, `Authorization`, the OIDC cookie) and requires its own per-job
  token in a custom header.
- The agent itself. The failure signature measured in the literature is quiet deviation, not gross
  failure (LLNL's `fractale` study: correct job specs with wrong affinity flags, an unrequested
  filtering step, polling by `sleep`). The framework runs supervised by default and enforces a task
  manifest (working directory, allowed partitions, allowed egress hosts) independently of the agent.
- The vendor's own outage. A one-person vendor must not be able to strand a campus: the extension
  works offline on the last good signed list and refuses only on a verified revocation, and it keeps a
  confirmed approval for up to seven days when the access service cannot be reached (a day when it
  can; a refusal for ten minutes).
- A person who is not approved, or whose approval was withdrawn. There is no key to share or steal:
  the extension asks the access service about the account name the portal's own dashboard shows for
  the signed-in session (never a typed name: the AccessID typed into the sign-in sheet is only the
  user name of the HTTP sign-in), so being approved means holding that institutional
  account. Withdrawal is one removal in the admin console; the extension stops starting workers at its
  next check and says so. A worker already running is not stopped by it.

Out of scope by construction: anything on claude.ai (the extension has no presence there) and any
Claude credential (none is handled). The grid password is in scope since 19.0.0 (above).

## Controls

Extension:

- No install-time host permission; the single portal origin is requested from a button click
  (`optional_host_permissions: ["https://*/*"]`, `permissions.request` at click time). Universities can
  pin it with Chrome's `ExtensionSettings.runtime_allowed_hosts` and `runtime_blocked_hosts`; the exact
  host and permission list is in `docs/STORE_LISTING.md`.
- Never requests `cookies`, `tabs`, `webRequestBlocking`, `declarativeNetRequest`, `debugger`,
  `identity` or `nativeMessaging` (requested from 12.0.0 to 15.0.0 for the bundled bridge of the
  direct way, gone since 16.0.0). The portal cookie is carried by the network stack and never read.
  Since 19.0.0 the Chrome build requests `webRequest` and `webRequestAuthProvider` (neither carries
  an install warning; the Firefox build has neither, and never `webRequestBlocking`) for one
  `onAuthRequired` listener and the two events that report how its answer ended (`onCompleted`,
  `onErrorOccurred`); they see requests only on the one granted portal origin, and of the student's
  tabs they keep only the mark the threat model above describes. The listener is a synchronous
  function that decides from memory, claims the armed check before any await and calls Chrome's
  callback exactly once on every path; it answers as the threat model above says, and nothing else.
  It never fills in an HTML sign-in page or an identity provider, never touches a multi-factor step
  and never types a password into a shell (the one-time step's terminal still gets the password from
  the student's own hands). "Use Chrome's sign-in box instead" keeps 18.0.0's path: the student
  signs in in a tab, in Chrome's own box or on the portal's pages, and the extension never sees what
  is typed there.
- No remote code: no `eval`, no fetched scripts, MV3 default CSP. The kill-list is JSON verified with
  `crypto.subtle.verify` (Ed25519; ECDSA P-256 fallback below Chrome 137, Firefox 130, Safari 17)
  against a public key compiled into the bundle; a revoked version refuses to send commands and says
  why.
- One chokepoint for all portal traffic: an append-only, on-device audit record per request (UTC time,
  endpoint, method, job id, byte count, outcome), viewable and exportable by the student, never
  transmitted; the same function enforces the ≥60-second scheduler-facing poll floor and the
  shell-single-use rule.
- One durable secret, only if the student chose it, and only encrypted. A saved grid password lives
  in the extension origin's IndexedDB (database `beethoven-signin`, which the portal page's script
  cannot reach) as one record: the AccessID, the portal's origin, the passkey's credential id, two
  random salts, a fresh 96-bit IV per seal and the password as AES-GCM-256 ciphertext, bound to the
  origin, the AccessID and the credential id as additional data, under a non-extractable key derived
  with HKDF-SHA-256 from the passkey's PRF output. That output is never written to disk: after a
  passkey ceremony in a page (WebAuthn runs only in a window, never in the service worker, and
  requires user verification, checked from the authenticator data's UV flag) it is kept in
  `storage.session` (memory, trusted contexts only; its access level is never changed) until the
  browser closes or the extension reloads, or Forget, Disconnect or a change of portal clears it. A
  password typed without the tick is kept in `storage.session` for its one attempt and removed after
  it, right or wrong, and at the latest after two minutes. `storage.local` carries only non-secret
  notes about the sign-in (`bridge.signin`: the AccessID, the portal's origin, the credential id,
  when it was saved, the times of the last try, success and refusal, when its use was put on hold
  without a refusal, the time of a typed password's try while it was saved until that try's outcome
  comes, the refusal count and the grid's realm name; `bridge.signinNoPrf`: when a passkey could not
  lock a password, and the operating system's name). Where the computer's passkey gives no PRF,
  nothing is saved and the tick is not offered again. Forget removes the record, both notes, the
  session unlock, a one-shot password and the attempt state; the 16.0.0 cleanup of the direct way's
  storage never touches these names. Not yet measured: real Windows Hello and Touch ID PRF for an
  extension's passkey, and a WebAuthn prompt from the side panel on real Windows and macOS (a
  Chromium report says the panel may close; the extension's own tab would be the fallback).
- Besides that, no durable secret. `storage.local` holds the portal hostname and granted origin,
  preferences, the acceptance record, the account name the portal's dashboard showed and the last
  approval answer with its time, the address of the access service read from `services.json`, the
  statement made about each worker's workspace (workspace, text and its version, time), the notes
  the strip keeps so it does not repeat itself (the last sign-in it saw with the account and plan
  Claude Code reported, the session links it opened, the probe job it submitted, the install it
  ran), the audit log, the last good copy of the signed kill-list, a random installation identifier
  and the ticks on the optional checklist steps; `storage.session` holds connection state (the run's
  name and folder, the job number, the worker's last status file, the session name and link, the
  last 4,000 characters of `rc.log`), the portal tab, the tab the icon was clicked from, when the
  portal sign-in was last seen, what the last automatic start did, and the last check results.
  `PRIVACY.md` and `docs/ARCHITECTURE.md` section 6 carry the same list. Extension storage is not
  encrypted and is treated accordingly: nothing secret is in `storage.local`, and the only secrets
  in `storage.session` (memory) are the unlock and a one-shot password above.
- The grid password crosses no message and is kept nowhere else. A page of the extension (the side
  panel) reads the two fields and empties the password field before its first await, and writes the
  password only to `storage.session` (unsaved) or seals it into IndexedDB (saved); the action it
  then sends to the background carries no secret, and no result carries one back. The background
  reads it only to answer the armed challenge and drops its reference right after. It is never in an
  action, a view, a log line, the debug log, the audit log, the activity log, `storage.local`,
  *Details*, *Copy details*, an error text or argv, and never in a message to the vendor; an
  answered challenge gets no audit line of its own (the dashboard request is the line), and the
  debug line for each sign-in request names the verdict, the reason and the request type, a URL only
  for an answer (the armed dashboard URL) and never the user name or the password. The background's
  storage listener never copies a value of the session sign-in keys.
- The extension opens an Anthropic page only in a new tab through `tabs.create`, which needs no
  `tabs` permission, and only in a run the student started with the icon or a button: the sign-in
  page Claude Code printed during the sign-in sitting, the session's claude.ai/code link, or since
  21.0.0 the project page named in Settings, when the worker connects (a setting, on by default, that
  leaves the green *Open my session* or *Open my project* button when off), and the connectors page
  from the optional Google Drive step. It has no presence on any page it opens.
- The pasted sign-in code passes through and is not kept. During the sign-in sitting the student
  pastes Anthropic's one-time code into one box in the panel; the extension sends it over its login
  port to the page script and into the student's own terminal on the cluster as keystrokes, holds it
  in a local variable only, clears the box as it sends, and records the whole sitting as one audit
  line carrying the counts of bytes read and bytes typed, never the text; it never places the code in
  storage or a message to the vendor. On the compute node the framework passes it to
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

- Beethoven never reads, stores, copies, prints or relays a Claude credential. The student signs in
  with `claude auth login` on a compute node; the framework starts Claude Code where that credential is
  and reads only `claude auth status`. Every credential variable (`CLAUDE_CODE_OAUTH_TOKEN`,
  `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, the file-descriptor variants) and,
  from framework 17, every provider switch (`CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`,
  `CLAUDE_CODE_USE_FOUNDRY`) is removed from the worker's environment before Claude Code starts.
  `claude auth logout` is never run.
- Tokens and secrets never appear on command lines, in argv, in logs, in job files or in
  `sbatch --export`; the per-job token is a mode-0600 file on shared storage.
- Supervised mode (`--permission-mode default`) by default; a task manifest enforced by the framework;
  input data read-only with a separate writable working directory.
- Nothing on the login node beyond one `sbatch`, `squeue` or `scancel`; no container commands there;
  container temp and cache on the compute node's local disk with a cleanup trap; IPC under `/dev/shm`;
  the job writes `status.json` and clients read the file.
- The worker refuses to start in a directory marked restricted and when Remote Control is unavailable
  under Zero Data Retention.
- The framework never deletes anything outside its own run directories (`<shared_state_dir>/<run>/`)
  and the job's node-local temp and `/dev/shm` directory: never the Claude Code login directory, the
  workspace, another run, or anything else under `$HOME`. Any destructive subcommand refuses when
  `CLAUDECODE`, `BEETHOVEN_REQUEST_ID` (or its older name `ASHLEY_REQUEST_ID`) or a similar agent
  marker is in the environment, or when stdin is not a terminal, so neither an agent nor a script
  can run it. Written after the incident recorded below.
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
- No long-lived store API key in CI. The publisher accounts and the kill-list signing key sit behind
  a hardware security key with no third-party OAuth grants; private keys never enter the repository.
  The access service's admin token lives in the vendor folder and is never on a command line. Since
  15.0.0 the store upload is the maintainer's own tool (`extension/scripts/publish-store.mjs` since
  16.0.0): a Desktop OAuth client in his own Google Cloud project, whose client file and refresh token
  sit in the vendor folder on his own computer (mode 0600), never on a command line, in a log or in CI.
- Nothing is signed since 16.0.0: the bridge's signed installers of 15.0.0 went with the bridge, so
  a release needs no signing identity, certificate or notarization profile, and none exists for it.
  How the identities were kept off every build service is in this file's git history and in
  `docs/TEXTS_V10_V11.md`.

## Incident record

- **2026-09-28, 22:34 local, Wayne State grid.** The student's whole `~/.ashley` folder was deleted
  while a Remote Control session spawned from the phone was open; the Claude Code login inside
  `~/.ashley/claude` was lost with it, and the open session stopped making progress. Which process
  deleted the folder is not established from the files that remain. Nothing in Beethoven should
  ever be able to do this, so two rules were added the same night and now stand in the controls above:
  the framework deletes nothing outside its own run directories and node-local temp, and a destructive
  subcommand refuses from an agent context or without a terminal. The login is redone with
  `hpcworker claude login`.

## What Beethoven holds, and where

- In the browser: portal hostname and granted origin, preferences, the account name the portal's
  dashboard showed and the last approval answer with its time, the access service's address, the
  acceptance record, the statement made about each worker's workspace, the strip's notes (last
  sign-in seen with the account and plan Claude Code reported, links opened, the probe job it
  submitted, the install it ran), the audit log, the last good kill-list, a random installation
  identifier, the ticks on optional checklist steps; session-only connection state (the run's name
  and folder, job number, the worker's last status file, session name, the session's claude.ai link,
  the last 4,000 characters of `rc.log`), the portal tab, the tab the icon was clicked from, when
  the portal sign-in was last seen, what the last automatic start did, and the last check results.
  Never the pasted sign-in code. Since 19.0.0, only if the student ticked *Remember it on this
  computer*: the grid password as AES-GCM ciphertext in the extension's IndexedDB, with the
  AccessID, the portal's origin, the passkey's credential id, the salts and the IV, and in
  `storage.local` a note of it (AccessID, portal origin, credential id, when it was saved, times of
  the last try, success, refusal and hold, the time of a typed try while it was saved until its
  outcome, refusal count, realm); in `storage.session` while unlocked, the passkey's PRF output; a
  password typed without the tick for one attempt and at most two minutes; and the request numbers
  and outcome of the last tries. The passkey itself is kept by Windows Hello, the Mac's Passwords
  app (iCloud Keychain) or Chrome's password manager, which may keep it in the Google account or
  iCloud and offer it on other devices; it is named "<AccessID> (grid)", and is not the old passkey
  of 12.0.0 to 15.0.0, which is named with the AccessID alone or "beethoven" and is no longer used.
  Chrome keeps a password Beethoven gave it in its own memory until it quits or browsing data with
  cookies is cleared.
- In the student's cluster account: the framework (at a site with a shared copy, such as Wayne State,
  only a small launcher, a one-line marker naming the lab's copy and the profile; the lab's copy itself is
  read-only to students), job files, `status.json`,
  `connection.json` (the session name and its claude.ai link), `rc.log`, the per-job token (0600), the
  successor job's id and the stop file, the consent marker `~/.hpcworker/consent` (one line: yes, the
  time, the browser's random installation identifier), and Claude Code's own sign-in (written by
  Claude Code, never read by Beethoven). On a compute node, for a sign-in sitting only: the
  sitting's transcript under `/dev/shm`, mode 0600, removed with the sitting.
- With the maintainer: the access record (the account name, name and e-mail given on the request
  page, the approval and withdrawal decisions with their dates) and one line per approval check from
  the extension (account name, portal hostname, product, version, time, a salted hash of the network
  address, the answer); from the two daily file downloads (`services.json`, the kill-list), only the
  network address in the web host's ordinary server logs. There are no error reports, no activation
  step and no licence key. Never the grid password, nor anything about the saved sign-in.
- On Anthropic's servers, under the student's own account: the session transcript while Remote
  Control is connected, retained under Anthropic's data-usage terms.

## Supported versions

The current release. Older releases receive no fixes; the diagnostics say when a newer one is needed,
and a withdrawn version stops sending commands.
