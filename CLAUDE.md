# Beethoven — working context

A university-agnostic HPC worker framework (`framework/`, `hpcworker`) plus a lightweight browser
extension (`extension/`, published as "Beethoven"; the repository and its code name stay Ashley
Bridge) that make a student's own Claude Code worker, running as a batch job on their university
cluster, available inside claude.ai through Claude Code Remote Control, using only the student's
Open OnDemand sign-in on the cluster side, which Beethoven may make with the password the student gave
it (19.0.0). Vendor: Gregory Schwing, trading as
OpenSpineConsortium (an LLC is planned and becomes the named licensor when it exists). The product
name and identifier carry no university name.

## Read first

- `docs/RESEARCH_REPORT.md`: the whole report, especially "Build specification for the week of
  28 September 2026". It governs. The two `docs/prior_analysis_*.txt` files proposed intercepting
  claude.ai; the report rejects that, and nothing here may implement it. Its dated note of 2026-10-09
  (at the top) names the passages greg's decision for 19.0.0 supersedes: the 401-means-a-tab rule,
  "webRequest buys nothing", "no durable secret" and the never-requested row for `webRequest`.
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
- **No API key anywhere** (greg, 2026-10-04 13:27Z: "no api key anywhere thats the only fundamental
  rule of this software"): no Anthropic Console or API key, no `apiKeyHelper`, no Bedrock, Vertex or
  Foundry route, no `ANTHROPIC_BASE_URL` gateway, no CI on a key or token held as a secret, and no
  usage credits, in the product and in the maintainer's own tooling alike. Beethoven signs a student
  in only with a Claude subscription: only `claude auth status` authMethod `claude.ai` (apiProvider
  `firstParty` or absent) counts as signed in, and the Console's sign-in link (`platform.claude.com`,
  formerly `console.anthropic.com`) is refused by its host and never opened (`isClaudeAuthUrl` in
  `extension/src/core/contract.ts`). Code that refuses, strips or warns against a key is the rule
  working and stays.
- **Tokens and secrets never appear on command lines, in argv, in logs, in job files or in
  `sbatch --export`,** and neither does the grid password. Never echo one. The per-job token is a
  mode-0600 file.
- **No code on claude.ai.** No content script, no host permission, no fetch patch. The extension's
  only content script runs on the one Open OnDemand origin the student grants at click time. Never
  request `cookies`, `tabs`, `webRequestBlocking`, `declarativeNetRequest`, `debugger`, `identity`
  or `nativeMessaging` (requested from 12.0.0 to 15.0.0 for the bundled bridge of the direct way,
  which 16.0.0 removed whole; see the bullet below), and never any `claude.ai`, `anthropic.com` or
  `claude.com` origin. Beethoven signs in to the grid (greg's card tap of 2026-10-09 03:01Z, 19.0.0;
  until 18.0.0 the rule was "no automated login of the portal" and `webRequest` was never
  requested). `webRequest` and `webRequestAuthProvider` serve one `onAuthRequired` listener. It
  answers only the HTTP Basic challenge of Beethoven's own background dashboard request on the one
  granted portal origin, once per armed check, with the AccessID and password the student typed into
  Beethoven's sheet. It never answers a tab's, a proxy's, another origin's or another realm's
  challenge, and one refusal stops every automatic sign-in until the student types the password
  again. The password is saved only if the student ticks Remember (never pre-ticked), and then only
  as AES-GCM ciphertext under a key derived from the passkey's PRF output. It never appears in a
  message, a log, the audit log, storage.local or argv, and never reaches Licensor. No HTML sign-in
  page or identity provider is filled in, no multi-factor step is touched, and no password is typed
  into a shell. The approval check uses the account name the dashboard shows, never the typed
  AccessID. "Use Chrome's sign-in box instead" keeps 18.0.0's tab, Chrome's own box, as the
  fallback, and it is the only way where `browser.webRequest` is absent (the Firefox build).
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
- **One person's approval, every installation of their own (decided 2026-10-11, 20.0.0; one
  installation per account from 8.0.0 to 19.0.0).** The approval check also sends `install_id`, the
  random identifier `ext/storage.ts` `installId()` makes once per installation (16 random bytes,
  nothing about the device; a reinstall makes a new one). An approved account is approved from every
  installation that asks about it: the service records each one against the account (identifier,
  product, version, first and last seen), keeps the ten most recently seen, and e-mails the
  maintainer, at most once a day per account, when a new one asks, with one link, Withdraw approval,
  and none to move it (a notice, nothing refused). One installation still serves one account: an
  installation bound to one approved account gets `"reason":"other_account"` for any other, and the
  strip says "This installation of Beethoven is already set up for another account. Ask your lab
  lead to move it to yours." with no button; a request with no identifier gets `"update_required"`.
  The reason `"other_installation"` is never sent any more; the extension still reads it, as a reason
  an older service may send, and says it as before ("This account is already set up on another
  computer. Ask your lab lead to move it here.", no button). The wire stays `v:1` (the service before
  8.0.0 refuses any other `v` and ignores unknown fields). Never a hardware address, serial or other
  device identifier, no fingerprinting, no obfuscation (Chrome forbids it; Vite's minification
  only): everything the check sends and the service keeps is written in `LICENSE.txt` section 3(e)
  and 10 and in `PRIVACY.md`. It is a check in the client, not a proof, and no text may claim more.
- **The project's page before a plain session (decided 2026-10-16, 21.0.0).** A Claude project
  (`https://claude.ai/code/project/<id>`, or the same on `claude.com`) cannot take a session the
  worker started by itself: it reaches the worker's folder only when the student asks for the work
  in the project (*Work locally* from the + menu) and allows the folder on the card (greg,
  2026-10-15: the extension "opens a worker in claude code but projects can only be opened in" the
  project). So Settings takes the project's
  address (`Prefs.project_url`, kept in one form by `projectLinkOf` in `core/contract.ts`, cleared by
  an empty one), and with one named the primary of the home and of the "You're online." moment is
  *Open my project* with that sentence under it, whatever the worker's link looks like; the tab
  opened when a worker the student started comes online is the project's page; the worker's link and
  the project's page each keep a claude.ai tab record of their own (`CLAUDE_TAB_KEY`,
  `PROJECT_TAB_KEY`), so each is brought forward rather than opened twice; and *New session*, *Copy
  link* and *Phone* keep the worker's link, with an outline *Open my session* where no new session
  can start. While none is named, a one-time card after the tour card points at Settings. hpcworker
  is unchanged. Agreement 15, privacy 16.
- **The grid's ssh gate from a lab lead's button (decided 2026-10-18, 22.0.0).** greg chose a
  Beethoven button over typing (2026-10-18: "i want this to be done by a button click"): Settings'
  folded *For your lab lead* has *Connect GitHub Actions* and *Remove*, which type hpcworker's
  published lines `grid-gate-setup` and `grid-gate-off` (its `contract` export, cli.json) through
  the portal's shell, run from the lab lead's own hpcworker clone in their home (default
  `hpcworker`) for one repository (OWNER/NAME), with the site profile's name, only for an approved
  account and one press at a time across pages (`mem.gateBusy`). The tool does the rest with the
  account's own `gh` sign-in, and its own check that a person pressed it holds because the portal's
  shell is a terminal with no agent's marker; the pull asks nothing at that terminal (ssh in batch
  mode). Two exceptions this makes, on purpose: the press runs git, ssh-keygen and a few `gh` calls
  on the login node, as typing the setup there does (no container, nothing under its `/tmp`); and
  the fold's words (`WORDS.settings.labLeadGate`) name hpcworker, gh and grid-gate.yml, so the
  hygiene test skips them as it skips Details, though any student can open the fold. Beethoven never
  sees the key or a GitHub sign-in and stores nothing of it. Privacy 17 alone, greg's choice of
  2026-10-18 ("Statement only"): the agreement stays 15 and an acceptance in force stays in force,
  the change counted as not material since nothing is typed unless a lab lead presses; the
  statement's Changes says so.
- **Beethoven restarts into a new version by itself (decided 2026-10-18, 23.0.0).** greg asked how
  students get the newest version without doing anything; Chrome downloads it within hours but waits for
  the extension to be idle, which a panel left open never is. The background listens for the downloaded
  version (`runtime.onUpdateAvailable`, which stops Chrome installing it by itself), asks the store once
  a day besides (`runtime.requestUpdateCheck`), and calls `runtime.reload` only while nothing a restart
  would lose is under way (`core/update.ts`: no page of Beethoven's open, no press, no kept press, no
  sitting, no stop, no gate press, no grid sign-in or one-shot password), asking again on every poll and
  when the last page closes. The worker on the grid keeps running through it. No text changes: the
  privacy statement already says the passkey's unlock is cleared when Beethoven updates or reloads.
- **Your workers, and the claude.ai account of this browser (decided 2026-10-23, 24.0.0).** greg asked to switch
  which worker the claude.ai tab shows, at once, and to reach workers on his other Claude accounts (hpcworker framework
  22 runs several workers, each kept to one account by `accounts start N`). A claude.ai tab shows one account's workers
  and an extension cannot open a tab in another Chrome profile, so the design is one Chrome profile per Claude account,
  each with Beethoven: the panel reads every run folder's `status.json` under the state directory (`core/workers.ts`,
  once a minute while a page is open, and when the fold opens) and lists them under the folded *Your workers*, with
  the account Claude Code reports (`claude_login.email`). *Show* loads a worker's link in the claude.ai tab Beethoven
  opened (`tabs.update`, no permission; a new tab only when none is open). Settings' *Your Claude account in this
  browser* (`Prefs.claude_account`, picked from the accounts the workers report) marks a worker on another account
  with the profile to open it in and *Copy link*, and no *Show*. Beethoven still never reads claude.ai. The same
  worker moving accounts on its own (auto mode, `accounts use`) shows in the fold as its account changes. Privacy 18
  alone, as 22.0.0 did; the agreement stays 15.
- **Add account (decided 2026-10-24, 24.1.0).** greg found no way to name an account no worker reports yet ("i dont
  have an add account button on the beethoven extension settings page"). *Your Claude account in this browser* is now
  always in Settings, and *Add account* opens an e-mail field, kept through the same `set-pref` and `accountOf` as a
  picked one, refused with the reason when it is not an address; it stays among the options while picked, and
  picking another drops it unless a worker reports it. Still one account per browser and Beethoven never reads
  claude.ai. Privacy 19 alone; the agreement stays 15.
- **The sign-in stays on screen (decided 2026-10-25, 24.2.0).** greg: the panel "offers a login screen, the screen
  will be preempted by "trying to connect to the grid" and that is annoying, it can run in the background but dont
  steal the login screen". Where the grid moment is Beethoven's own sheet (`sheetUp` in `core/steps.ts`: the browser
  answers the grid's sign-in itself and no box tab is watched), the reach check never replaces it: the sheet stays,
  with "Can't reach the grid. Is GlobalProtect on?" and *Try again* in its problem line while there is no route, and
  a press made out of reach waits on the sheet rather than on the GlobalProtect moment; the check itself runs as
  before (every 3 s with a page open, once a minute without). The box path (Chrome's box chosen, or the build that
  cannot answer the sign-in) keeps GlobalProtect first, since its tab cannot load without the VPN. No text changes.
- **Open in Beethoven (decided 2026-10-25, 25.0.0).** greg asked for "a profile selection suggester based on the
  session id" and "an Open in Beethoven option which automatically starts on the right account", needing no VPN
  and no grid sign-in. An extension cannot open a tab in another Chrome profile (only a native helper could, and
  `nativeMessaging` stays off the list), so the menu does what one profile can: `contextMenus` (no install warning)
  puts an entry on the links of each worker last read online, through match patterns built from its link, so
  Chrome shows it only on that worker's links (`linkPatterns` in `core/workers.ts`; Chrome matches a pattern
  against the path and the query, measured on 2026-10-25). For a worker on this browser's account, or any worker
  while Settings names none, the entry is *Open in Beethoven*, which loads the link in the claude.ai tab Beethoven
  keeps, as *Show* does, or in a new tab of the window it was clicked in; for a worker on another account it is a
  greyed line naming that account, beside Chrome's own *Open link as*. The workers are kept in `storage.local`
  (`bridge.menu`, replaced at each read, removed when a read finds none online, by *Disconnect* and by another
  portal), and the entries are rebuilt from them at install, at browser start and when Settings names another
  account, so neither the grid nor the VPN is needed to use or rebuild them. A pattern is a filter, not a grant: no
  claude.ai origin and no code there. Privacy 20 alone; the agreement stays 15.
- **One store, one public listing (decided 2026-10-13, 20.0.0; private from 8.0.0 to 19.0.0).**
  Beethoven is offered only on the Chrome Web Store, as a Public item since 20.0.0 (greg,
  2026-10-13: "i want to release 20 and public"): installing it needs no invitation, and the
  approval check decides whether it works, so nothing is lost by the open listing (its regions stay
  the United States, so the texts say "no invitation", never "anyone"). From 8.0.0 to 19.0.0 it was
  a Private item whose trusted testers were the maintainer's Google Group `Beethoven-users` of
  approved students; with 20.0.0 the group, the request page's Google account and the access
  service's invitation step are retired (`docs/store/SUBMISSION.md`), and the site's install card
  links the listing. No Edge, Firefox or Safari listing, no download on the website or for students
  anywhere else. No signed file: since 16.0.0 the package carries no installer (15.0.0's two signed
  bridge installers went with the bridge). The Firefox build script stays because the code builds
  for it; nothing submits it. Since 2026-10-13 (greg: "i want to setup the automatic updates being
  pushed to the chrome webstore") `.github/workflows/release.yml` calls the organisation's Chrome
  Web Store release kit on every push to `main`: tests, `npm run zip`, a build number appended to
  the version, a GitHub release `extension-v<version>`, and the upload to the item through the five
  `CWS_` repository secrets once the maintainer sets them and the variable `CWS_ON_PUSH`
  (`docs/store/SUBMISSION.md`, "Releases from CI"). Those secrets are the store account's own OAuth
  grant and never a Claude credential; the first upload of 20.0.0 stays by hand.
- **The direct way is gone (decided 2026-10-08, 16.0.0).** From 12.0.0 to 15.0.0 the extension first
  tried ssh to the login node with no VPN, through a native-messaging bridge bundled in the package
  (from 15.0.0 as signed, per-user installers for Windows and macOS, built and signed on the
  maintainer's Mac by one command), with a sign-in sheet for the grid password and one-time code, a
  key in the browser and one gate line in the grid account, and fell back to the portal. greg
  removed it whole (his card answer "Remove", 2026-10-08 17:52Z, after his message of 15:30Z): the
  extension cannot do it without a program outside the browser, and a student with the VPN has the
  portal. Nothing of it is in the tree (`helper/`, `extension/src/ssh/`, `public/bridge/`, the two
  program exports, the browser harness's direct-way lane, their tests); `docs/V12_CONTRACT.md`,
  `docs/V12_STATUS.md`, `docs/BRIDGE_TRANSPORT.md`, `docs/TEXTS_V9_V10.md` and
  `docs/TEXTS_V10_V11.md` stay as history, and `release/14.0.0/bridge/SHA256SUMS.txt` as a record.
  The one way is the university's VPN and the portal, and the panel recommends only it: the welcome
  page lists three needs with their pages; a press made while the grid is out of reach waits on the
  GlobalProtect step ("Beethoven carries on by itself as soon as the grid answers.", with the
  profile's `vpn_help_url` linked) and goes ahead by itself once the grid answers (reach re-checked
  every 3 s with a page open, once a minute without one, never a sign-in tab from the alarm); "Keep
  my worker running" also covers a run read as ended, at most three times; Settings note once, with
  *Forget*, a key an earlier version put in the grid account (`bridge.oldKey`), and nothing on the
  grid is ever touched for it; the first run after the update removes the direct way's storage and
  deletes its key unread (`cleanupDirectWay`). The 11.0.0 one-time login-setup step on the portal's
  terminal page stays. 19.0.0's sign-in sheet is not the direct way: no ssh, no bridge, no one-time
  code, and the VPN is still needed; `cleanupDirectWay` never touches its names.
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
- **The grid's approved list is the named-user ACL on the volume root, kept by
  `tools/grid_access.sh` equal to `admin.mjs roster` (extension grant only; lab-only approvals and the
  reviewers' mock are not on it, by design); `deploy_shared` never closes the tree to other below the
  gate (its `deploy.log` is 0644); `shared/access` and the owner's folder stay closed.** The scheduled
  run makes only cheap checks (the full sweep is `--check-tree`) and reports any root entry in another
  student's place.
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
  Edition; since 2026-10-18 and extension 22.0.0 `PRIVACY.md` is version 17 alone, which adds the
  lab lead's gate buttons (the cluster account's paragraph, the shell's commands and Changes), with
  `LICENSE.txt`, `TERMS_VERSION` and `TERMS_DATE` unchanged by greg's choice that day; since 2026-10-16 and extension 21.0.0 `LICENSE.txt` is version 15 and `PRIVACY.md`
  version 16, which add the project's page among the pages Beethoven opens and the project's
  address among the preferences it keeps (the head and section 5(f) of the agreement; the
  preferences row, the small-notes row, the page paragraph and Changes of the statement) on top of
  version 14 and 15 (2026-10-13, 20.0.0), which describe the public listing (the head, sections 3(a), 3(e), 10(d) and 17: anyone
  can install it, the approval decides whether it works, the request page asks for no Google account
  and one given earlier stays in the record unused) on top of version 13 and 14 (2026-10-11, drafted
  for 20.0.0 and never shipped: the relaxed installation rule, sections 3(e) and 10: one person's
  approval on every installation of their own, the ten most recent installations kept per account,
  a notice e-mail with a Withdraw link and none to move) on top of version 12 and 13 (19.0.0:
  Beethoven's own grid sign-in: the sheet, the answer to the portal's HTTP sign-in under the narrow
  rule above, one wrong try and then stop, the Remember tick and the passkey that unlocks the saved
  password, the one-shot password kept at most two minutes, Forget, Chrome's box as the fallback,
  Chrome keeping the sign-in until it closes) on top of version 11 and 12 (16.0.0: the one way (the university's VPN and the portal; no bridge, no sign-in
  sheet, no key in the browser), what an earlier version may have left (the bridge on the computer,
  the gate line in the grid account, a passkey; `hpcworker browser-key remove` or the lab lead
  removes the line) and 16.0.0's waiting press, keep-running and old-key note);
  `THIRD_PARTY_NOTICES.md` lost the bridge's two notices with it. They replace version 10 and 11
  (15.0.0: the bridge as a compiled program of Licensor's in signed installers) and version 9 and 10
  (12.0.0: the direct way over ssh through the bridge, the sign-in sheet, the browser's key and its
  gate line, Forget this computer), version 8 and 9 (11.0.0's first run: one tick with "Show terms"
  optional, no scroll gate; the grid sign-in in the browser's own box; the one-time grid key step;
  the acceptance history and the installation identifier in Settings), and version 7 and 8, which
  added the shared copy as the only install, one installation per approved account with the
  installation identifier in the approval check, the request page's Google account, purpose,
  optional CV (deleted twelve months after the decision) and mailbox confirmation, and the private
  Chrome Web Store listing as the only channel; both describe the software as built (no keys; the
  approval check against the access service with the account name the cluster confirmed and the
  installation identifier; the daily fetch of `services.json` and the withdrawn-versions list; no
  activation step, no error reports; all requests only after acceptance); `TERMS_VERSION` in
  `extension/src/core/terms.ts` is 15 to match, with `TERMS_DATE` 2026-10-16; the framework's
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

(Pre-split text: the `framework/` pieces below, beyond `profiles/`, live in the sibling repository `OpenSpineConsortium/hpcworker`; see the split section at the end.)

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
  portal, with a stand-in for the access service that still binds one installation per approved
  account, 8.0.0 to 19.0.0's rule, so the `other_installation` answer the extension still reads is
  played),
  `scripts/sync-profiles.mjs` (copies `../framework/profiles/*.json` as data, and the two agreement
  texts, into `public/` before every build and zip; since 8.0.0 no framework code enters the
  package).
- `docs/`: the report, the design documents, the pilot plan, open questions and measurements.
- `tools/`: `push_via_grid.sh` and `push_org.sh` (the two remotes), (the site pages are generated by the site repository's
  `tools/build_site.py`, which reads `LICENSE.txt` and `PRIVACY.md` from here; it hosts no package),
  `deploy_shared.sh` (publishes the framework to a site's shared copy over ssh, from the laptop; on
  the login node only tar, chmod, setfacl and one link; older versions are kept).

## Building and testing

(Pre-split text: the `framework/` pieces below, beyond `profiles/`, live in the sibling repository `OpenSpineConsortium/hpcworker`; see the split section at the end.)

Windows: Node 22 is at `/c/Users/grego/tools/node22`; python is `python -X utf8`; inline shell heredocs
eat backslashes, so write scripts with the Write tool and run them by path; line endings LF.

```
export PATH=/c/Users/grego/tools/node22:$PATH
cd extension && npm ci                   # pinned: wxt 0.21.4, vite 8.3.1, typescript 5.9.3, vitest 5.0.2, ws 8.22.0, linkedom 0.18.13
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
and others read and execute, no write; until 2026-09-30 the lab folder was `shared/ashley` and the
sign-in folder `~/.ashley/claude`, both now links). The volume's root behind `/rs/rs_grp_oschome`
is `drwxrws--T go2432 oschome` with `other::---`; a student reaches anything under it only through
the approved list, the root's `user:<AccessID>:rwx` entries kept by `tools/grid_access.sh`
(`docs/guides/LAB_LEAD.md`, section 9). Group `oschome` is C&IT's (two members) and is not the list.
`#SBATCH --output` resolves
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
the panel's green *Open in Claude* button (*Open my session* since 14.0.0; *Open my project* with a project named, 21.0.0) opens `environment_url` with `browser.tabs.create` (no
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
updates itself through its Chrome Web Store listing. Fetching the framework from the private
GitHub repository is not possible for a student (no token) and is not designed.

## How to be useful here

The recurring failure mode in the neighbouring projects is a number or a state that is wrong but
plausible. Check against something outside the computation: the report's cited behaviour, the portal's
actual response, a render of the panel, the raw line in `rc.log`. When a tidy explanation presents
itself, test it before believing it. Say plainly what is not known; "not yet measured" is the preferred
form.

## This repository (the split, 2026-10-03)

This is the **client half** of the split of `OpenSpineConsortium/beethoven`: `extension/` (the
Beethoven browser extension) and `release/` (the store packages). The **server half** — `framework/`
(hpcworker) and the maintainer's tools — lives in `OpenSpineConsortium/hpcworker`. The original
repository remains as the history up to the split; new work goes here.

The seam between the two is the contract, not a checkout: `extension/src/core/contract.ts` reads the
files and lines the cluster side writes, as the server repository publishes them in its export
`contract`, pinned here in `framework/contract/` (with `contract-text`, the prose of
`V11_CONTRACT.md` and `V12_CONTRACT.md`, in `framework/contract-text/`);
`extension/test/conformance.test.ts` holds the code to it and runs every vector through the real
readers. A change to what the cluster side writes is made in the server repository first and reaches
here as a new pin, with the readers and their tests changed in the same pull request. Every pinned
folder has an `ORIGIN` and is taken only by `bash interface/pull.sh` (`interface/README.md`):
`framework/profiles/`, the site profiles **as data** for `extension/scripts/sync-profiles.mjs`, the
only server-side files that enter the package; `framework/contract/` and `framework/contract-text/`,
read by tests and people only. Since 8.0.0 nothing else of the cluster side may enter the package.
Since 17.0.0 a fourth pin, `extension/src/base/`, is beethoven-base's `browser` export (`profile.ts`:
the site profile's reader with module-schema 1's keys and types, the path rules, the portal's origin
and the deployment a portal belongs to, by what its own profile declares and never a default site or
a host-name guess), the one import compiled into the package: `extension/src/core/deployments.ts` and
`contract.ts` read through it, `extension/scripts/sync-profiles.mjs` writes `public/deployments.json`
(the carried profiles' ids, read by the welcome page's "Your grid", the Wayne State profile first,
greg's default of 2026-10-08), and a portal no carried profile declares is stored with no site at all.
The copy is taken the same way (`bash interface/pull.sh extension/src/base`) and never edited here.

CI (`.github/workflows/ci.yml`) runs the whole client suite hermetically on ubuntu: typecheck,
vitest, the mock portal's full selftest with Playwright's Chromium for the terminal section, and a
chrome build uploaded as an artifact. CI needs no secret; the only secrets in this repository are
the release workflow's five `CWS_` ones, the store's own. The browser e2e harness
(`extension/e2e/run.mjs`) stays a maintainer's tool, since its Chrome-native moments need Windows
UIA (headless on a cluster node: `E2E_HEADLESS=1`).