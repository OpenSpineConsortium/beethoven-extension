# Beethoven texts for 12.0.0: agreement version 9, privacy statement version 10

Drafted 2026-10-02 for Greg and for counsel, by the texts stream of the 12.0.0 build. **This is
drafting, not legal advice.** No lawyer has read these texts or this note; the questions at the end
are for one.

What changed, in one paragraph: `LICENSE.txt` goes from version 8 (2026-10-01) to version 9
(2026-10-02) and `PRIVACY.md` from version 9 to version 10 (2026-10-02), because Beethoven 12.0.0
tries a second road to the grid first: an ssh connection to the login node with no VPN, carried by a
small helper that ships inside the extension and that the student installs once; a first sign-in in
Beethoven's own sheet with the AccessID, the password and the Google Authenticator code, sent only to
the grid inside the encrypted session and never stored; a key kept in the browser, encrypted, with an
optional (off by default) Windows Hello / Touch ID protection; one restricted line in the student's
`authorized_keys` that runs only the lab's gate; Forget this computer; the phone route for setting up
the grid code; a relay that is not used unless a site profile names one; and the Isolated Web App as a
pilot given only to a student who asks. The approval check is unchanged and is sent only after the
grid accepts the sign-in. `THIRD_PARTY_NOTICES.md` says the ssh client, the passkey code and the
helper are Licensor's own work and names what the helper runs on. Every dispute, liability and risk
term is unchanged word for word (sections 7, 8, 12, 13, 14, 19, 20 and 21), and section numbers are
unchanged: the new material sits inside 5(b) as paragraphs (i) to (v), so 3(a), 5(b), 5(g), 8, 15,
19 and 20 stay where other documents cite them, and "the one-time step of section 5(b)" now reads
"5(b)(v)".

Sources, in order of authority: Greg's own words (2026-10-02, relayed by the workflow); the
orchestrator's decisions D1 to D4 and rules R1 to R7; the established facts in the task; the build
streams' code as it stood in the working tree on 2026-10-02 (`extension/src/core/keys.ts`,
`keyring.ts`, `bridge.ts`, `sshChannel.ts`, `model.ts` WORDS.direct, `extension/src/ui/model12.ts`,
`framework/lib/browser_key.sh`, `framework/profiles/wayne.json`, `helper/src/`). Where a sentence rests
on code another stream had not finished, its reason says **CONFIRM**. The texts were edited by one
script from one list of edits (`scratchpad/v12/build/texts/`), and this note is generated from the
same list, so the quotations below are exactly what changed (paragraphs are quoted unwrapped; in the
files each touched paragraph was re-wrapped at 100 columns).

Kept as they were: both texts stay plain ASCII with LF line endings; the agreement's version line is
`Version 9, 2026-10-02.` at the start of a line, as `extension/scripts/sync-profiles.mjs` and
`extension/test/terms.test.ts` read it; nothing uses the banned word.

The words used: the texts say "the ssh path" and "the portal path", and "the Bridge" for the helper
(defined once as what "Beethoven's screens call the helper"); the screens and the guides say "the
direct way", "GlobalProtect" and "the helper". The texts name the student's tools (Google
Authenticator, Windows Hello, Touch ID) only to say which of their own tools to use (section 15).

## LICENSE.txt, version 8 -> version 9

### L1. Head, version line

Old:

> Version 8, 2026-10-01. Applies to the Trial Edition of Beethoven 11.0.0 and later versions that ship this text

New:

> Version 9, 2026-10-02. Applies to the Trial Edition of Beethoven 12.0.0 and later versions that ship this text

Why: R5: LICENSE version 9 dated 2026-10-02 for 12.0.0. The build (extension/scripts/sync-profiles.mjs) and extension/test/terms.test.ts read this line as /^Version (\d+), (\d{4}-\d{2}-\d{2})\./ and stop unless TERMS_VERSION and TERMS_DATE in extension/src/core/terms.ts are 9 and '2026-10-02' (another stream's file).

### L2. Opening paragraph, when the account name joins the acceptance record

Old:

> and, added once your portal first shows it after you agree, your account name and when it was seen

New:

> and, added once your cluster first confirms it after you agree, your account name and when it was seen

Why: On the ssh path, which 12.0.0 tries first, no portal shows the account name: it is confirmed by the cluster accepting the sign-in (the password sign-in, or the gate's version line for a key sign-in).

### L3. Section 1, what Beethoven is: the Bridge

Old:

> "Beethoven" means the browser extension of that name (the "Extension"), the scripts and programs that your institution's lab keeps

New:

> "Beethoven" means the browser extension of that name (the "Extension"), the small helper program that ships inside the Extension for you to install on your computer and that carries the Extension's ssh connection (the "Bridge", which Beethoven's screens call the helper), the scripts and programs that your institution's lab keeps

Why: D1: the helper ships inside the extension package and is installed by the student; it is Licensor's software, so the licence must cover it (section 2(a) is extended to computers accordingly).

### L4. Section 1, what Beethoven is: the pilot app

Old:

> the recipe for the container image the Framework runs, its documentation, and updates Licensor provides.

New:

> the recipe for the container image the Framework runs, its documentation, and updates Licensor provides. A pilot edition of the Extension made as an installable web app (the "Pilot App") is given only to a person who asks for it, by their lab lead, as a file; it is not offered on the private listing, it is part of Beethoven while you use it, and it counts as an installation under section 3(e).

Why: The task's text list: the Isolated Web App as a pilot installed only if asked (established fact D: developer flags, a permanent warning bar). Without this sentence the pilot would be software of Licensor's under no agreement. Whether it counts as a separate installation is for Greg (see the unsure list).

### L5. Section 1, the two paths

Old:

> The Extension starts, watches and stops a job in your own cluster account through your institution's Open OnDemand portal; the job runs Claude Code

New:

> The Extension starts, watches and stops a job in your own cluster account, over a secure shell ("ssh") connection to your cluster's login node where it can make one (the "ssh path"), and otherwise through your institution's Open OnDemand portal (the "portal path"); the job runs Claude Code

Why: Untrue in 12.0.0 (D3): the extension tries ssh without the VPN first and uses the portal only when no bridge is available. The two names are used in the rest of the text.

### L6. Section 1, your account name

Old:

> and "your account name" means the name that portal's dashboard shows for the session you signed in to; it is the only identifier of you that Beethoven uses, and you never type or paste it into Beethoven (the Extension also names its own installation with a random number, section 3(e)).

New:

> and "your account name" means the name of your account on your institution's cluster as the cluster confirms it when you sign in: on the portal path, the name that portal's dashboard shows for the session you signed in to; on the ssh path, the name you type into Beethoven's own sign-in sheet, once the cluster has accepted the sign-in made with it, or the name the cluster reports for a sign-in made with the key of section 5(b)(iii). It is the only identifier of you that Beethoven uses (the Extension also names its own installation with a random number, section 3(e)).

Why: "You never type or paste it into Beethoven" is untrue in 12.0.0: the first ssh sign-in asks for the AccessID in Beethoven's own sheet. R4 and the established facts: the name counts only once the grid has accepted the sign-in, and the approval check is sent only after that.

### L7. Section 2(a), where the licence may be used

Old:

> in browsers you use and in computing accounts you are authorised to use

New:

> in browsers and on computers you use and in computing accounts you are authorised to use

Why: The Bridge is installed on the student's computer, outside the browser.

### L8. Section 3(a), what identifies you and when approval is checked

Old:

> There is no key and no password of Licensor's: your own sign-in to your portal identifies you. After you have accepted this agreement and connected your portal, the Extension asks Licensor's access service whether your account name is approved, when you first sign in to your portal after accepting it, about once a day while it is in use, and again when you open its panel after a day has passed or after a no, and it starts a worker only while the answer is yes.

New:

> There is no key and no password of Licensor's: your own sign-in to your institution's cluster identifies you. After you have accepted this agreement, and only once your cluster has accepted your sign-in (over the ssh path or the portal path), the Extension asks Licensor's access service whether your account name is approved: when you first sign in after accepting it, about once a day while it is in use, and again when you open its panel after a day has passed or after a no; and it starts a worker only while the answer is yes.

Why: Established facts and R4: with ssh first, the account name comes from the student until the grid accepts the sign-in, and the approval check is sent only after that. The cadence is unchanged.

### L9. Section 3(e), the Bridge and the key belong to the installation

Old:

> Licensor may refuse every check from a version of the Extension that sends no installation identifier; the current version is on the private listing.

New:

> Licensor may refuse every check from a version of the Extension that sends no installation identifier; the current version is on the private listing. The Bridge you install on the same computer, and the key the Extension keeps in that browser profile (section 5(b)(iii)), belong to that installation and are not installations of their own.

Why: So that nobody reads the Bridge or the browser key as a second installation that the one-installation rule would refuse. The approval check carries no new field (R4); the Bridge and the key never talk to the access service.

### L10. Section 5(a), where the Claude sign-in runs

Old:

> The Extension starts that terminal for you through your portal's shell, in the same command that starts your worker, opens Anthropic's sign-in page in a new tab,

New:

> The Extension starts that terminal for you, in the same command that starts your worker, through your portal's shell or, on the ssh path, through a connection you signed in to with your cluster password and code (the key of section 5(b)(iii) can never start it), opens Anthropic's sign-in page in a new tab,

Why: R3: the gate can never sign a worker in to Claude and connect through the gate is always --login never, so on the ssh path the sitting can run only in a password-and-code session. CONFIRM against the core stream: if 12.0.0 runs the Claude sign-in only on the portal path, drop the ssh clause.

### L11. Section 5(b), your sign-in to your cluster: the ssh path, the Bridge, the password and code, the key, Forget this computer; the portal path kept as (v)

Old:

> (b) Your portal session. The Extension uses the sign-in your browser already holds for your institution's Open OnDemand portal,

New:

> (b) Your sign-in to your cluster. The Extension reaches your cluster in one of two ways and tries the first before the second: the ssh path, which needs no VPN, and the portal path, which may need your institution's VPN (at Wayne State, GlobalProtect). It never signs in to Claude for you on either path (see (a)). The ssh path is new in this version and has been tried only against ssh servers that Licensor ran itself, set up like your institution's, not yet with a real account on a real cluster.
>
> (i) The Bridge. A browser extension cannot open an ssh connection by itself, so the ssh path needs a bridge that carries the Extension's encrypted connection to your cluster's ssh port and back. In this version that is the Bridge: a small helper program that ships inside the Extension, which you install once on your computer, in your own user account and without administrator rights, by saving the installer the Extension offers you from its own package and running it (the Extension cannot run a program for you). Your browser starts the Bridge only when the Extension asks for it, and the Bridge ends when the Extension lets it go. The Bridge opens a network connection only to your cluster's ssh port (at Wayne State, grid.wayne.edu, port 22, and another address only if its installer wrote one into its settings), carries bytes both ways without reading, keeping or logging them, holds no password, key or other credential, offers no shell and runs no other program. The uninstaller placed beside it removes it. The Extension can also carry the ssh path through a relay server, but only one that your institution's site profile names; none is named in this version, and if one ever is, the privacy statement will name who runs it and what it sees before any version uses it. If no Bridge is installed and you do not install one, or your cluster's ssh port cannot be reached from your network, the Extension uses the portal path.
>
> (ii) Your password and code. The first time you use the ssh path in this browser, again whenever the key of (iii) is missing or refused, and when you sign in to Claude on the ssh path (see (a)), the Extension asks you to sign in on its own sign-in sheet, a page of the Extension: your account name, your cluster password and, where your cluster asks for one, the one-time verification code from your authenticator app (at Wayne State, Google Authenticator). The Extension sends them only to your cluster, inside the encrypted ssh connection, after your cluster's identity (its host key) has matched the one the Extension carries for it, and only for that sign-in. It never stores them, never writes them to a log, never offers to remember them, and never sends them to Licensor or anyone else. It never makes a verification code and never holds the secret your authenticator app keeps. If your cluster refuses a code with words that may mean a mistyped code or no verification code set up, the Extension asks you which, and only if you say you have none does it show you your institution's own instructions for setting one up, which you follow yourself, on your institution's pages; Beethoven takes no part in that step. After your first sign-in on the sheet, the Extension keeps that signed-in connection open, in your browser's memory only, for up to ten minutes, so that your first Connect can run the Claude sign-in of (a) in it without asking for your password and code again; it closes when that sign-in ends, when the ten minutes pass, when you cancel, or when your browser closes, and nothing of it is stored.
>
> (iii) The key in your browser. In that sign-in the Extension makes a key in your browser and runs the Framework's browser-key step in your cluster account, which adds one line to your account's ~/.ssh/authorized_keys file. That line lets the key run only the Framework's gate: a fixed list of short commands that report the Framework's version and your account name, start a worker without any Claude sign-in, read your worker's state and its own named files, stop it, mark its workspace restricted, and remove the line itself, within limits on how many workers it may name and how often it may start one. Through that line the key gets no terminal, no other command, no file transfer and no forwarding, and the gate can never sign a worker in to Claude. Later connections from this browser sign in with the key and ask you for nothing. The key's private half never leaves your browser and is never sent to Licensor. By default it is stored encrypted under a second key that your browser keeps and lets no page or script copy out, and Beethoven uses it without asking you; both are stored with the Extension's data in your browser profile on this computer, so someone who can use that browser profile, or read your computer account's files, could use the key, within the limits of that line. If you choose, Beethoven instead keeps the key encrypted under a secret that only your passkey releases (Windows Hello, Touch ID, or your device's PIN or password), so that it cannot be used until you unlock it, once each time you open your browser. That protection is off unless you turn it on, on the sign-in sheet, when Beethoven offers it once after setup, or in Settings, and you can turn it off again in Settings. Turned on later, it protects the key from then on; for a while your browser's own files may still hold the earlier form, until the browser tidies its database, so if you want the protection from the start, choose it on the sign-in sheet. Your lab may set the line to lapse after a number of days, after which the Extension asks you to sign in with your password and code again.
>
> (iv) Forgetting this computer. "Forget this computer", in the Extension's Settings, deletes the key from your browser and asks your cluster, through the gate, to remove its line. If your cluster cannot be reached, or the key is protected and you do not unlock it, the Extension says so, and the line stays until it is removed, which the command "hpcworker browser-key remove", run in a terminal on your cluster, does. The line is what lets the key in: once it is gone from your cluster, a copy of the key left anywhere is of no use. Withdrawing your approval under section 3 does not remove the line; Forget this computer or that command does. In this version your account keeps one such line: signing in over ssh from another browser replaces it, and the key of the browser you used before stops working. Uninstalling the Extension deletes the key from your browser but cannot remove the line from your cluster, so use Forget this computer first. A passkey you made under (iii) is kept by your system or your browser's password manager, not by the Extension: Forget this computer asks it to drop the passkey, and where it does not, you delete it there.
>
> (v) The portal path. The Extension uses the sign-in your browser already holds for your institution's Open OnDemand portal,

Why: D3, R2, R3, D2 and the task's text list. 11.0.0's 5(b) described only the portal; 12.0.0 tries the ssh path first and adds the Bridge, the sign-in sheet, the browser key with its optional passkey, the one restricted line and the gate, and Forget this computer. Kept inside 5(b), as numbered paragraphs, so that items (c) to (g) keep their letters, 5(g) still covers every item, and "the one-time step of section 5(b)" that other texts cite still points into 5(b): the 11.0.0 text follows unchanged as (v). The gate's list is the prototype's (version, status, watch, connect --login never, stop, restrict, read of named files, forget); CONFIRM against framework 11. "Tried only against ssh servers that Licensor ran itself": the established facts allow two connections to grid.wayne.edu that stop at the "none" request, so no sign-in has been made on the grid; this sentence must change, with a new version, once one has. Fixer B: (ii) discloses the password session the core holds after the first sign-in (signin.ts HOLD_MS, up to ten minutes; security review). If Greg drops the hold, this sentence goes with it. Fixer B: (iii) says protection turned on later does not reach copies of the browser's files made before the browser tidies its database (security review: the old record was still in IndexedDB's log after an overwrite and a delete, in Chromium 153). Fixer B: (iv) covers a locked key, says what makes a copy of the key useless, and that a withdrawal leaves the line (security review; LAB_LEAD.md). Fixer B: (ii) follows the sheet as built after the security and look reviews: the grid's refusal names two causes, and running 2FA Setup by mistake destroys a working code, so the student is asked.

### L12. Section 5(c), the account name kept

Old:

> (c) Your account name, as the portal's dashboard shows it, and the answer of the last approval check with its time are stored in the Extension's own storage in your browser.

New:

> (c) Your account name, as your cluster confirmed it, and the answer of the last approval check with its time are stored in the Extension's own storage in your browser.

Why: Follows L6: on the ssh path no dashboard shows the name.

### L13. Section 5(f), the page script

Old:

> Its only page script runs on the one portal website you connect: where your portal does not share its sign-in with the Extension, to carry the Extension's requests there, and, during the one-time step in (b), on the portal's terminal page,

New:

> It runs no page script on the ssh path. Its only page script runs on the one portal website you connect, on the portal path: where your portal does not share its sign-in with the Extension, to carry the Extension's requests there, and, during the one-time step in (b)(v), on the portal's terminal page,

Why: The ssh path is the extension's own ssh client and the Bridge; no page is scripted. The cross-reference follows L11.

### L14. Section 10(a), when the approval check is sent

Old:

> (a) The approval check. Only after you have accepted this agreement, and only once your portal is connected and your account name is known, the Extension asks Licensor's access service

New:

> (a) The approval check. Only after you have accepted this agreement, and only once your cluster has accepted your sign-in and your account name is known, the Extension asks Licensor's access service

Why: R4 and the established facts: sent only after the grid accepts the sign-in. The fields and the service are unchanged.

### L15. Section 10(a), the first check

Old:

> when you first sign in to your portal after accepting this agreement

New:

> when you first sign in to your cluster after accepting this agreement

Why: Follows L14.

### L16. Section 10(a), what the check sends

Old:

> your account name as your portal's dashboard shows it, your portal's hostname,

New:

> your account name as your cluster confirmed it, your portal's hostname (on the ssh path, the hostname of the portal your institution's site profile names),

Why: R4: no new field. CONFIRM against the core stream what the portal field carries on the ssh path; this text assumes the site profile's ood_base_url hostname (ondemand.grid.wayne.edu). If the core sends the ssh host (grid.wayne.edu) there, this parenthesis must say so, and PRIVACY's with it.

### L17. Section 10(c), what stays in the browser

Old:

> your statements, your audit log, your settings and what the Extension remembers about your worker stay in your browser; Licensor does not receive them.

New:

> your statements, your audit log, your settings, the key of section 5(b)(iii) and what the Extension remembers about your worker stay in your browser; Licensor does not receive them.

Why: R3: the key never leaves the browser.

### L18. Section 15, what is not part of Beethoven

Old:

> Claude Code, Node.js, the container image, the container runtime and the Open OnDemand portal are not part of Beethoven: they are provided by their own publishers or by your institution under their own terms.

New:

> Claude Code, Node.js, the container image, the container runtime, the Open OnDemand portal, your cluster's ssh service, the programs your computer already has that the Bridge runs on (Windows PowerShell, Perl or Python), your authenticator app and the passkey service of your system or browser are not part of Beethoven: they are provided by their own publishers or by your institution under their own terms.

Why: D1: the Bridge is a script run by the system's own interpreter (PowerShell on Windows, /usr/bin/perl on macOS, Perl or python3 on Linux); those interpreters, Google Authenticator and Windows Hello / Touch ID are not Licensor's.

### L19. Section 15, the marks named

Old:

> "GlobalProtect" is the mark of Palo Alto Networks, named only to say which VPN program to turn on.

New:

> "GlobalProtect" is the mark of Palo Alto Networks, named only to say which VPN program to turn on; "Google Authenticator" is Google's mark, "Windows Hello" Microsoft's and "Touch ID" Apple's, each named only to say which of your own tools to use.

Why: 12.0.0 names these on screen (the sign-in sheet, the optional passkey, the phone route).

### L20. Section 17, the Bridge does not update itself

Old:

> Updates to the Extension are distributed through its private listing on the Chrome Web Store, and your browser installs them by itself.

New:

> Updates to the Extension are distributed through its private listing on the Chrome Web Store, and your browser installs them by itself. The Bridge you installed on your computer does not update itself: if a later version of the Extension needs a newer Bridge, the Extension says so and offers the newer installer from its own package, which you run as you ran the first.

Why: D1: an installed native host is a file on the student's computer; nothing in Chrome updates it. The helper's hello carries its version, so the extension can tell.

### L21. Section 18, the cryptography

Old:

> The Extension contains cryptography used only to verify signatures; the Framework generates random per-job tokens and, in the one-time step of section 5(b), has the cluster's own ssh-keygen make a key in your account.

New:

> The Extension contains cryptography to verify signatures and, for the ssh path, an ssh client that encrypts its connection to your cluster and makes and uses the key of section 5(b)(iii), all with your browser's own cryptography; the Bridge carries that connection and has no cryptography of its own; the Framework generates random per-job tokens and, in the one-time step of section 5(b)(v), has the cluster's own ssh-keygen make a key in your account.

Why: The ssh client (AES-CTR with HMAC-SHA1, curve25519 or ECDH key exchange, an ECDSA or Ed25519 user key, all in WebCrypto) is encryption in the extension, which the old sentence denied. For counsel: mass-market encryption (see the unsure list).

## PRIVACY.md, version 9 -> version 10

### P1. Head, version line

Old:

> Version 9, 2026-10-01. Part of the Beethoven Trial Edition License Agreement

New:

> Version 10, 2026-10-02. Part of the Beethoven Trial Edition License Agreement

Why: R5: PRIVACY version 10 dated 2026-10-02.

### P2. Opening, what Beethoven is and what the statement covers

Old:

> Beethoven is a browser extension that starts, watches and stops a job in your own cluster account through your university's Open OnDemand portal, and a set of scripts (the framework) that runs in that account. The job runs Claude Code, which you signed in to yourself. This statement says what stays in your browser, what goes to your cluster account, what your portal sees, what happens when you sign in to Claude and when the portal's shell asks for your password, what Anthropic receives, what Licensor receives, and what is never collected.

New:

> Beethoven is a browser extension that starts, watches and stops a job in your own cluster account, over a secure shell (ssh) connection to your cluster's login node (the ssh path, which it tries first) or through your university's Open OnDemand portal (the portal path); a small helper program, the Bridge, that ships inside the extension and that you may install on your computer to carry the ssh connection; and a set of scripts (the framework) that runs in your cluster account. The job runs Claude Code, which you signed in to yourself. This statement says what stays in your browser, what the Bridge does on your computer, what happens when you sign in to your cluster over ssh, what goes to your cluster account, what your university sees on the ssh path, what your portal sees, what happens when you sign in to Claude and when the portal's shell asks for your password, what Anthropic receives, what Licensor receives, and what is never collected. The ssh path and the Bridge are new in this version and have been tried only against ssh servers Licensor ran itself, set up like your university's, not yet with a real account on a real cluster.

Why: D3 (ssh first), D1 (the Bridge in the package) and the four new sections. The last sentence is the same honesty as 11.0.0's sentence on the key step: no sign-in has been made on the grid.

### P3. Table, the account name row

Old:

> | The account name your portal's dashboard showed for your session, and the answer of the last approval check:

New:

> | The account name your cluster confirmed when you signed in (the name your portal's dashboard showed for your session, or, on the ssh path, the name you typed into the sign-in sheet once your cluster accepted it, or the name your cluster reported for a sign-in with the browser's key), and the answer of the last approval check:

Why: Follows LICENSE L6. CONFIRM against keys.ts whether the typed AccessID is also kept before the grid accepts it (for example to fill the sheet in next time); if it is, this row must say so.

### P4. Table, three new rows: the browser's key, the optional passkey protection, and the direct way's notes

Old:

> | *Disconnect* in Settings; uninstalling |

New:

> | *Disconnect* in Settings; uninstalling |
> | The browser's key for the ssh path: a key pair the extension makes the first time you sign in over ssh, stored only encrypted: by default under a second key that the browser keeps and lets no page or script copy out, or, if you turn on the protection in the next row, under a secret only your passkey releases; with it its public half, the account it was added for, and when it was made and added | the extension's own database in your browser profile (IndexedDB) | so that later connections sign in without your password or code. The second key is kept beside the key, in the same browser files: anyone who could copy your browser profile's files could use the key, and so could Beethoven's own code, within its line's limits (below); no website and no other extension can | *Forget this computer* in Settings, which also asks your cluster to remove the key's line; uninstalling deletes the key but leaves the line on your cluster, so use *Forget this computer* first |
> | Only if you turn on *Protect my key with Windows Hello / Touch ID* (off unless you do): beside the key above, the passkey's identifier and the random values used with it. The passkey itself is kept by Windows Hello, your Mac's keychain or your browser's password manager (which may keep it in your Google account), not by the extension, under the name Beethoven, with your AccessID as its user name once Beethoven knows it | the extension's own database in your browser profile | so that the stored key is useless until you unlock it with your fingerprint, face, PIN or password, once each time you open the browser. Turned on after the key was made, it protects the key from then on; until the browser tidies its database, its files may still hold the earlier, unprotected form, so to have the protection from the start, tick it on the sign-in sheet | turning it off in Settings; *Forget this computer*, which also asks your passkey store to drop the passkey (not every store does); the passkey itself, in your system's or your browser's list of passkeys |
> | The direct way on this computer: the account name your cluster accepted and when, when this computer's key was added and its fingerprint, whether you chose *Use GlobalProtect instead*, and which of its one-time screens you have answered (*Protect the key on this computer?*, *This computer is set up.*, and the screen that says Beethoven is using GlobalProtect) | `storage.local` | so the panel takes the way you chose and does not ask again | *Forget this computer*; uninstalling |

Why: R3 and D2, from the core stream's storage (extension/src/core/keys.ts, read 2026-10-02): the key is in IndexedDB ('beethoven-key', core/keyring.ts), "wrapped by a non-extractable browser key (the default) or by the student's passkey (opt-in), never in the clear"; DIRECT_KEY ('bridge.direct', storage.local) holds the accepted account, enrolled_at, key_fp, vpn_chosen_at, protect_offer_done_at, enrolled_seen_at and fallback_seen_at, and nothing secret. D2's literal default (the ssh key itself non-extractable) is built as a key wrapped under a non-extractable key, so that it can be re-wrapped under a passkey when the student opts in later; the row says what is built. CONFIRM that Forget this computer clears DIRECT_KEY. Fixer B: the key row says the wrapping key lies beside the key on disk (security review), not only that no page can copy it out. Fixer B: the passkey row no longer promises more than the build does for protection turned on later (security review: IndexedDB residue).

### P5. Table, a new session row: the bridges, the route, the unlock

Old:

> | A plain-words list of what the extension did in this browser session, for *Show log*

New:

> | What the last check of the ways to reach your cluster found: whether a browser-only bridge, a relay or the Bridge is available (in this version only the Bridge can be), the Bridge's version, system and kind as it reported them, and whether your cluster's ssh port answered with the identity your university's site profile names, with the time; while you set up a verification code, which route you chose; for the account name you typed into the sign-in sheet, how many sign-ins in a row your cluster refused and when the last one was, so that after three the sheet waits fifteen minutes before it asks your cluster again (never what you typed); and, only while your key is protected by a passkey and you have unlocked it in this browser session, the secret your passkey released to open it | `storage.session`, cleared when the browser closes | to use the first way that works, to show you the right steps, and to ask for Windows Hello or Touch ID only once each time you open the browser | closing the browser |
> | A plain-words list of what the extension did in this browser session, for *Show log*

Why: D3's probe, from keys.ts: BRIDGE_KEY ('bridge.bridges': chosen, store, relay, helper, helper_version, helper_os, helper_kind, reach22, checked_at), ROUTE_KEY ('bridge.route') and KEY_UNLOCK_KEY ('bridge.keyUnlock': the passkey's output, "memory only, never on disk; never readable by a page script"), all in storage.session. Fixer B: the refusal count fixer A keeps for the fifteen-minute pause after three refusals (keys.ts REFUSALS_KEY, storage.session; the security review's cooldown) is named, as R4 and R5 require.

### P5b. Table, preferences: the connection choice

Old:

> and your appearance choice | `storage.local` | convenience | Settings |

New:

> your appearance choice, and how Beethoven reaches the grid (*Direct when possible*, the default, or *GlobalProtect only*, under *Connection*) | `storage.local` | convenience | Settings |

Why: keys.ts Prefs.connection, 'direct' by default; Settings' "Connection" (model.ts WORDS.direct.settings).

### P6. Table, the audit log row

Old:

> | The audit log: one line per request the extension made to your portal (time, endpoint, method, job number, byte count, outcome). The sign-in sitting is one line with how many bytes were read and typed; what you typed is never in it |

New:

> | The audit log: one line per request the extension made to your portal (time, endpoint, method, job number, byte count, outcome), and one line per command it sent over the ssh path (time, the command's name, byte count, outcome). The sign-in sitting is one line with how many bytes were read and typed; what you typed, your cluster password and your verification code are never in it |

Why: R2: never logged. CONFIRM that the core audits ssh commands this way; if it writes nothing for them, drop the added clause and keep the last sentence.

### P7. After the table, the one durable secret

Old:

> There is no durable secret in the extension's storage, and no key: your own sign-in to your portal identifies you (the one-time step below makes a key in your cluster account, never in your browser).

New:

> The one durable secret in the extension's storage is the browser's key for the ssh path (above), whose line in your cluster account lets it run only the gate described below; there is no key of Licensor's, and your own sign-in to your cluster identifies you. The one-time step of the portal path, below, makes a key in your cluster account, never in your browser.

Why: Untrue in 12.0.0: the browser now keeps a key (R3).

### P8. After the table, what is sent after you agree

Old:

> After you agree, it asks your portal's address whether it answers,

New:

> After you agree, it opens a connection to your cluster's ssh port, through the Bridge, only to check that it can reach your cluster, to sign in, or to do what you pressed; and it asks your portal's address whether it answers,

Why: D3. CONFIRM against the core stream whether it probes the ssh port before a press (this text allows it).

### P9. After the table, the account name

Old:

> The one thing it reads about you from the portal is the account name the portal's own dashboard page shows for your session; there is nowhere to type a different one.

New:

> The one thing it reads about you from the portal is the account name the portal's own dashboard page shows for your session. On the ssh path your account name is the one you type into the sign-in sheet, and it counts only once your cluster has accepted the sign-in made with it.

Why: "There is nowhere to type a different one" is untrue in 12.0.0 (the sign-in sheet).

### P10. After the table, the QR codes

Old:

> The QR code for your phone is drawn on your device from your session's link, and the tour is drawn from files in the extension's package: nothing is fetched or sent to show either.

New:

> The QR codes are drawn on your device: your session's link, for your phone, and, on the welcome page, under *What you need* and on the phone route below, the addresses of your university's instructions and of the app stores' pages for GlobalProtect and Google Authenticator, each printed under its code; the tour is drawn from files in the extension's package. Nothing is fetched or sent to show them.

Why: The phone route's QR codes (Greg's order 1), drawn by the same bundled generator.

### P11. New sections: the Bridge, the ssh sign-in, relays and the pilot app

Old:

> ## What goes to your own cluster account

New:

> ## The Bridge on your computer
>
> The ssh path needs a program on your computer, because a browser extension cannot open an ssh connection itself. The Bridge, which the extension's screens call the helper, is that program. It ships inside the extension's package, and the extension offers its installer from there: nothing is downloaded from Licensor or anyone else. You save the installer and run it once, in your own user account; it needs no administrator rights. It puts the Bridge's few files in a folder of your user account and registers it with Chrome, and with the other browsers built on Chromium that it finds, so that the browser knows where it is (on Windows a key in your own part of the registry, on a Mac or on Linux a small file in the browser's folder in your home folder); the registration names Beethoven as the only extension that may start it. On Windows the Bridge is a script run by Windows PowerShell; on a Mac and on Linux it is a script run by Perl, or by Python 3 where Perl is absent; these come with your system. Chrome starts the Bridge when the extension asks for it, and the Bridge ends when the extension lets it go. The Bridge opens a network connection only to your cluster's ssh port (at Wayne State, grid.wayne.edu, port 22, which is written into the Bridge; another address only if its installer wrote one into the settings file beside it) and carries bytes between the extension and that port. What it carries is the ssh connection, which is encrypted between the extension and your cluster: the Bridge does not read it, keep it or log it, holds no password, key or other credential, offers no shell, runs no other program and sends nothing to Licensor. The uninstaller placed beside it removes its files and the registration. If you do not install the Bridge, the extension uses the portal path.
>
> ## When you sign in to your cluster over ssh
>
> The first time you use the ssh path in this browser, the extension asks you to sign in on its own sign-in sheet, a page of the extension: your account name (your AccessID at Wayne State), your cluster password, and the one-time verification code from Google Authenticator that your university's cluster asks for. The extension opens the ssh connection through the Bridge, checks that the server's identity (its host key) is the one your university's site profile names, and stops without sending anything about you if it is not. It then sends your account name, your password and your code to your cluster inside the encrypted connection, as the cluster asks for them, and to nobody else. The password and code are not kept: they stay in the browser's memory only until they are sent, and are dropped then (a browser cannot promise when its memory is overwritten); they are not kept in any storage, not written to the audit log or to *Show log*, not sent to Licensor or anyone else, and the sheet never offers to remember them. The extension never makes a verification code and never sees the secret your authenticator app keeps.
>
> In that same sign-in the extension makes the browser's key (see the table above) and runs one command in your account, the lab's framework's browser-key step, which adds the key's line there (see *What goes to your own cluster account*). The connection you signed in to with your password and code stays open, in the browser's memory only, for up to ten minutes after setup, so that your first *Connect* can run the Claude sign-in in it without asking for your password and code again; it closes when that sign-in ends, when the ten minutes pass, when you cancel, or when the browser closes. From then on this browser signs in with the key and asks you for nothing, and your cluster knows those connections by the key, not by your password. Protecting the key with a passkey is your choice and off unless you turn it on, on the sign-in sheet, on the screen that offers it once after setup, or in Settings: then the extension asks Windows Hello or Touch ID (or your device's PIN or password) to unlock the key once each time you open the browser, and keeps what unlocks it only in the browser's memory until the browser closes. You can turn it off again in Settings. If your lab sets a number of days for the key's line, the extension asks you to sign in with your password and code again once the line has lapsed, and it asks the same whenever the key is missing or refused.
>
> If your cluster refuses a code with its message that may mean a mistyped code or no verification code set up, the extension asks you which; if you say you have none, it shows two ways to set one up: on your computer, or on your phone. Both use your university's own pages and its 2FA Setup app, which you run yourself, with your university's VPN; the extension takes no part in them and sees nothing of them. The phone route shows QR codes drawn on your device, for the app stores' pages of GlobalProtect and Google Authenticator and for your university's instructions for Google Authenticator on the grid, with each address printed under its code (the welcome page and *What you need* also show one for its instructions for GlobalProtect); scanning one opens that page on your phone, which its website sees as it sees any visit. On the computer route, *Open the grid's website* opens your portal in a new tab, as a link would; the extension runs nothing there. Before any step that could lead you to run 2FA Setup a second time, the extension warns you that running it replaces the code you already have.
>
> The Claude sign-in (see *What happens when you sign in to Claude*) runs only in a connection you signed in to with your password and code, or through your portal, never through the browser's key.
>
> *Forget this computer*, in Settings, deletes the key from your browser and asks your cluster, through the gate, to remove the key's line. If your cluster cannot be reached, or the key is protected and you do not unlock it, the extension says so, and the line stays until it is removed, which `hpcworker browser-key remove`, run in a terminal on the cluster, does. A passkey you made is kept by your system or your browser's password manager: the extension asks it to drop the passkey, and where it does not, you delete it there.
>
> ## Relays and the pilot app
>
> Beethoven can carry the ssh path through a relay server instead of the Bridge, but only through one your university's site profile names. None is named in this version, and none is used. If one is ever named, this statement will first say who runs it and what it sees: a relay would see the encrypted connection, your network address and the times, never your password, your code or anything inside the connection.
>
> A pilot edition of Beethoven made as an installable web app (an Isolated Web App) can reach the grid over ssh without the Bridge. It is given only to a student who asks for it, by the lab lead, as a file the student installs after turning on two of Chrome's developer settings, which make Chrome show a warning at every start. It keeps and sends what this statement says the extension keeps and sends; anything it does differently will be written here before it is given to anyone.
>
> ## What goes to your own cluster account

Why: The task's text list: the Bridge (what it is, bytes only to the grid's ssh port, inside the extension, installed once, how it is removed); the password and code in Beethoven's own sheet, sent only to the grid inside the encrypted session after the host key matched, never stored (R2); the optional passkey (D2); Forget this computer; the phone route; the relay as not used unless the lab names one; the pilot as installed only if asked. The phone route's four addresses are KB 20314, KB 20242 and the two app stores' pages; CONFIRM against the pages stream which addresses the codes carry. Fixer B: the code-refused question (security and look reviews). Fixer B: 'cleared then' overstated what the code does (security review: JavaScript strings and the cipher's copies are not zeroed). Fixer B: the held password session is disclosed (security review). Fixer B: Forget with a locked key (security review).

### P12. What goes to your own cluster account: the browser key's line and the gate

Old:

> Everything there is in your own account under your institution's rules; Licensor has no access to it.

New:

> Everything there is in your own account under your institution's rules; Licensor has no access to it.
>
> On the ssh path, the first sign-in's browser-key step adds one line to `~/.ssh/authorized_keys`, makes `~/.ssh` readable by you alone if it has to create it, keeps the file's previous contents, without any line of Beethoven's, as `~/.ssh/authorized_keys.beethoven-prev`, refuses to change a file there that is a link or that others can change, and leaves your own keys and lines as they are. The line holds `restrict`, the command `hpcworker gate` from the lab's shared copy, the public half of the browser's key, the tag `beethoven-browser` and the date it was added. `restrict` takes away a terminal, forwarding and file transfer, and the command means that whatever the key asks for, the gate runs instead. The gate does only this, each a short command on the login node: report the framework's version, your account name and whether Claude Code says you are signed in; start your worker, always without any Claude sign-in; report your worker's state; read four of your worker's own files (its status, its connection, its node and its progress log); stop it; mark its workspace restricted; and remove the line. It refuses anything else, and it allows at most three worker names in any seven days (your own sign-in with your password and code clears them), twelve starts or new restrictions in any hour, and two watches at once, which it counts in a small file in your account's state folder on the cluster (the worker names and when each was last used, and the times of the last hour's starts). The line stays until you or the gate remove it: withdrawing your approval does not remove it. Your account keeps one such line: signing in over ssh from another browser replaces it. If your lab sets a number of days for it, the gate removes the line once it is older.

Why: R3 and the gate prototype (lib/browser_key.sh: the line restrict,command="<shared copy>/bin/hpcworker gate" <type> <base64> beethoven-browser <date>; the verbs version, status, watch, connect --login never, stop, restrict, read of five named files, forget; one line per account; browser_key_days). The caps are the security review's (a cap on jobs, a rate); CONFIRM the words against framework 11. Fixer B: framework 11 now leaves Beethoven's line out of the kept copy (security review). Fixer B: the caps as framework 11 keeps them after the framework review, what the caps file holds, and that a withdrawal leaves the line.

### P13. New section: what your university sees on the ssh path

Old:

> ## What your portal sees

New:

> ## What your university sees on the ssh path
>
> Your university's login node records each ssh connection as it records any other: the time, the network address it came from (your computer's own, with no VPN), your account, and whether it signed in with a password and code or with a key. Your network and your university's see a connection to the cluster's ssh port. On the ssh path your worker is started, watched and stopped without your portal: the extension asks your portal only whether it answers (see *What stays in your browser*), with requests that carry no sign-in.
>
> ## What your portal sees

Why: Says what the university's side records, since the connection now comes from the student's own address. In the working tree of 2026-10-02 the background still asks the portal whether it answers after the agreement (11.0.0's reach check), so the text does not say the portal is never asked; CONFIRM against the core stream's final background.

### P14. What your portal sees, on the portal path

Old:

> The extension makes requests to your university's Open OnDemand portal, and only to it,

New:

> On the portal path, the extension makes requests to your university's Open OnDemand portal, and only to it,

Why: The section now describes the portal path only (P13).

### P15. What happens when you sign in to Claude: where the sitting runs

Old:

> Otherwise the extension starts that sitting for you through the portal's shell, in the same command that starts your worker,

New:

> Otherwise the extension starts that sitting for you, in the same command that starts your worker, through the portal's shell or, on the ssh path, through a connection you signed in to with your password and code (never with the browser's key, which the gate refuses for this),

Why: R3. CONFIRM against the core stream, as for LICENSE L10.

### P16. What happens when you sign in to Claude: the connection

Old:

> The extension types the code once into the sitting on your cluster, through the same portal connection, and then forgets it:

New:

> The extension types the code once into the sitting on your cluster, through the same connection, and then forgets it:

Why: Follows P15.

### P17. The portal shell's password section: its heading

Old:

> ## When the portal's shell asks for your password

New:

> ## When the portal's shell asks for your password (the portal path)

Why: The key step of 11.0.0 belongs to the portal path; the ssh path has its own section.

### P18. The portal shell's password section: no longer new

Old:

> This step is new in this version and has been tried only against the lab's mock portal, not yet on a real cluster by an account without a key.

New:

> This step came with Beethoven 11.0.0 and has been tried only against the lab's mock portal, not yet on a real cluster by an account without a key.

Why: "New in this version" is untrue in version 10; the rest is still true (V11_STATUS section 3 B has not been run).

### P19. What Licensor receives: when the approval check is sent

Old:

> Once your portal is connected and the extension has read your account name from the portal's dashboard, it asks Licensor's access service whether that account is approved: when you first sign in to your portal after you agree,

New:

> Once your cluster has accepted your sign-in and the extension knows your account name, it asks Licensor's access service whether that account is approved: when you first sign in to your cluster after you agree,

Why: R4: unchanged check, sent only after the grid accepts the sign-in.

### P20. What Licensor receives: the account name and the portal field

Old:

> the account name your portal shows for your session (never one you typed; there is nowhere to type one), your portal's hostname,

New:

> the account name your cluster accepted for your sign-in (the one your portal's dashboard shows, or, on the ssh path, the one you typed into the sign-in sheet, sent only after your cluster accepted the sign-in made with it, or the one your cluster reports for a sign-in with the browser's key), your portal's hostname (on the ssh path, the hostname of the portal your university's site profile names),

Why: "Never one you typed" is untrue on the ssh path. No new field (R4). CONFIRM the portal field, as for LICENSE L16.

### P21. What Licensor receives: no key, and the password and code

Old:

> - there is no key and no activation step; your institution's own sign-in identifies you, and the extension never reads your portal's sign-in, cookie or password;

New:

> - there is no key of Licensor's and no activation step; your institution's own sign-in identifies you; the extension never reads your portal's sign-in, cookie or password, and the cluster password and code you type into its sign-in sheet go only to your cluster;

Why: R2. "No key" alone is untrue now that the browser keeps one; it was always about a licence key.

### P22. What Licensor receives: what stays in the browser

Old:

> - your acceptance record, your statements, your audit log, your activity list, your settings and what the extension remembers about your worker stay in your browser.

New:

> - your acceptance record, your statements, your audit log, your activity list, your settings, the browser's key and what the extension remembers about your worker stay in your browser, and the Bridge sends nothing to Licensor.

Why: R3, R4.

### P23. One approved account, one installation: the Bridge and the key

Old:

> from any other portal it is answered as an unknown account is, and nothing is bound or e-mailed.

New:

> from any other portal it is answered as an unknown account is, and nothing is bound or e-mailed. The Bridge on the same computer and the browser's key belong to the installation they serve; neither talks to the access service.

Why: Follows LICENSE L9.

### P24. What is never collected: the password, the code, the key, the Bridge

Old:

> the extension does not collect command text, file paths, prompt content, job output, portal cookies or tokens, your portal password, the code you paste to sign in to Claude, anything the portal's terminal page shows, the key the one-time step makes, browsing activity, or anything from claude.ai or any Anthropic page.

New:

> the extension does not collect command text, file paths, prompt content, job output, portal cookies or tokens, your portal password, the cluster password and verification code you type into its sign-in sheet (it sends them to your cluster and keeps nothing of them), the code you paste to sign in to Claude, anything the portal's terminal page shows, the key the portal path's one-time step makes, the private half of the browser's key (it never leaves your browser), browsing activity, or anything from claude.ai or any Anthropic page. The Bridge collects nothing: it carries the encrypted connection and keeps no record of it.

Why: R2, R3, D1.

### P25. What is never collected: the permissions

Old:

> requests no `activeTab`, `cookies`, `tabs`, `webRequest`, `nativeMessaging`, `debugger`, `identity` or `clipboardRead` permission,

New:

> requests no `activeTab`, `cookies`, `tabs`, `webRequest`, `debugger`, `identity` or `clipboardRead` permission, uses its `nativeMessaging` permission only to talk to the Bridge (Chrome lets it reach only a program that registered itself for this extension, and only once you installed one),

Why: D1 adds nativeMessaging, which version 9 listed as never requested. CONFIRM against wxt.config.ts whether it is a required or an optional permission; the sentence holds either way.

### P26. How Licensor uses and keeps it: the password and code, and Limited Use

Old:

> Licensor's use of data complies with the Chrome Web Store's Limited Use requirements.

New:

> Your cluster password and verification code reach neither Licensor nor any processor of Licensor's: the extension uses them only to sign you in to your own cluster, when you ask it to, and keeps nothing of them. Licensor's use of data complies with the Chrome Web Store's Limited Use requirements.

Why: The store's data type now ticked is Authentication information (handled on the device, sent only to the user's own cluster, never stored); the Limited Use sentence is kept and the use is stated beside it.

### P27. Your choices and rights

Old:

> Remove the site permission or uninstall the extension at any time; remove the key of the one-time step from your cluster account with `hpcworker login-setup --remove`;

New:

> Remove the site permission or uninstall the extension at any time; turn the passkey protection of the browser's key on or off in Settings; use *Forget this computer* to delete the browser's key and remove its line from your cluster (or remove the line with `hpcworker browser-key remove` on the cluster); remove the Bridge with its uninstaller; remove the key of the portal path's one-time step from your cluster account with `hpcworker login-setup --remove`;

Why: D2 and the new controls.

### P28. Changes: the version 10 entry

Old:

> Version 9 (2026-10-01, Beethoven 11.0.0): the agreement is accepted

New:

> Version 10 (2026-10-02, Beethoven 12.0.0): the extension now tries the ssh path first: an ssh connection to your cluster's login node, with no VPN, carried by the Bridge, a small helper program that ships inside the extension and that you install once on your computer, without administrator rights; it reaches only your cluster's ssh port and keeps nothing. The first time, you sign in on the extension's own sign-in sheet with your account name, password and verification code, which go only to your cluster, inside the encrypted connection, and are never stored; the extension then keeps a key in your browser that no script can copy out, and adds one restricted line to your cluster account that lets that key run only a short list of commands and never sign a worker in to Claude. Protecting that key with a passkey (Windows Hello or Touch ID) is optional and off unless you turn it on. *Forget this computer* removes the key and the line. Where your cluster has no verification code for you, the extension shows how to set one up yourself, on a computer or on your phone, with QR codes drawn on your device. A relay is not used unless your university's site profile names one, and this statement would name it first; the pilot app is given only to a student who asks. Without the Bridge the extension works through your portal, as before. The approval check is unchanged and is sent only after your cluster accepts your sign-in. Nothing new reaches Licensor.
>
> Version 9 (2026-10-01, Beethoven 11.0.0): the agreement is accepted

Why: The statement's own history.

### P29. What goes to your own cluster account: the Remote Control marker on the ssh path

Old:

> the framework writes one small file in your account through the portal's shell (its own marker, `~/.hpcworker/consent`)

New:

> the framework writes one small file in your account, through the portal's shell or, on the ssh path, through the gate (its own marker, `~/.hpcworker/consent`)

Why: The gate's connect verb carries the installation identifier as --consent (framework 11, lib/browser_key.sh: connect NAME SITE INSTALLID|- MODE chain|no-chain), so on the ssh path the marker is written through the gate, not the portal's shell.

## THIRD_PARTY_NOTICES.md

### T1. Item 4, the QR code generator draws the phone route's codes too

Old:

> It draws the QR code of your session's link on the panel's Phone card, on your device.

New:

> It draws, on your device, the QR code of your session's link on the panel's Phone card and the QR codes of the phone route's pages (your university's instructions, and the app stores' pages for GlobalProtect and Google Authenticator).

Why: 12.0.0 draws the phone route's codes with the same bundled generator; nothing new is bundled for them.

### T2. After the tour's paragraph, the ssh client, the passkey code and the Bridge are Licensor's own

Old:

> the website's source, where the figure first appeared, is also published under the Apache License, Version 2.0.

New:

> the website's source, where the figure first appeared, is also published under the Apache License, Version 2.0.
>
> The ssh client of the ssh path, the code that protects its key with a passkey, and the Bridge (its installers, uninstallers and helper scripts for Windows, macOS and Linux) are Licensor's own work, written for Beethoven without third-party code, and are part of Beethoven under the Beethoven agreement. The ssh client uses only your browser's own cryptography (WebCrypto). The Bridge runs on programs your computer already has, which are not part of this package and are provided under their publishers' own terms: Windows PowerShell on Windows, and Perl on macOS and Linux (or Python 3 where Perl is absent).

Why: So that a reader of the notices does not look for a licence for the ssh client or the helper. Read on 2026-10-02: the client's sources (scratchpad/v12/iwa/app/client/src) carry no third-party code or licence header, and the passkey library (iwa/passkey/lib) none either. CONFIRM against what the build streams actually bundle (extension/src and extension/public/bridge); if a compiled helper is ever shipped, its language's standard-library notice (Go: BSD-3-Clause) must be added here.


## Where these texts depart from the task's list, and why

- **The default key is not literally a non-extractable ssh key.** D2 says "by default the browser's key
  is a non-extractable WebCrypto key with no biometric step". The core stream built it as an ssh key
  wrapped under a non-extractable browser key (`core/keyring.ts`), so that turning the passkey on or
  off later moves the same key from one wrap to the other with nothing to change on the grid; the
  signing key is always unwrapped as non-extractable, in memory. The texts describe what is built
  ("stored encrypted under a second key that your browser keeps and lets no page or script copy out")
  and add what a reader needs to know: both are stored in the browser profile, so someone who can use
  that profile or read the computer account's files could use the key within the limits of its line.
- **"Bridge" in the texts, "helper" on screen.** A defined term was needed in the agreement; "the
  helper" is too common a word there. LICENSE section 1 and PRIVACY tie the two together.
- **5(b) holds the new material as (i) to (v)** rather than new lettered items, for the reason in L11.
- **"Tried only against servers Licensor ran itself"** is added to LICENSE 5(b) and PRIVACY, as 11.0.0
  did for the key step: no sign-in has been made on the grid (the established facts allow only two
  connections that stop at the "none" request).
- **The Claude sign-in on the ssh path** is said to run only in a password-and-code session (R3; the
  sheet's `purpose: 'claude'` and "Getting your Claude sign-in ready..." in `model.ts`).
- **The phone route's QR codes** are described as the core and pages streams draw them
  (`model12.ts` PUBLIC_PAGES, `routeQr`): the App Store and Google Play pages of GlobalProtect and
  Google Authenticator and KB 20242 on the phone route, KB 20314 and KB 20199 on the welcome page.
- **The passkey's name.** The core creates it with the relying party name "Beethoven" and the AccessID
  as its user name where known (`keyring.ts`), and on Forget asks the store to drop it
  (`signalUnknownCredential`, best effort). PRIVACY says so, since a passkey saved to Google Password
  Manager may sit in the student's Google account.
- **Store data types.** The task says "Authentication information: handled on the device only, never
  stored". The password and code do leave the device, to the student's own cluster, so the store
  answer (`docs/store/PASTE.md`) says "handled on the device and sent only to the user's own university
  cluster ... never stored, logged or sent to the developer", which is what the store's definitions
  need to hear.

## Sentences I am unsure about (for Greg and for counsel)

1. **Section 4(a), "nothing beyond a job submission may run on a login node"**, which the student
   promises to keep. Unchanged, as in version 8, but the ssh path now runs every gate verb on the
   login node (each short, in shell; framework 11's README says no `python3` runs on the extension's
   path after the first connect, which still runs it briefly). Counsel and Greg: narrow the promise
   to the student's own use, or say what Beethoven runs there.
2. **Sections 7 and 8 are unchanged** (risk terms). Section 7(a) covers the grid's firewalls and
   policies, which covers a university closing its ssh port to the internet; section 8's three named
   Known Risks do not name it, nor a store's or an operating system's refusal to run the helper. A
   change there is a change to a risk term and needs its own decision.
3. **Relaying the password and the code.** Until 11.0.0 the texts (and the repository's CLAUDE.md) said
   Beethoven "never touches a multi-factor step". On the ssh path it carries the student's typed code
   to the grid, once, without storing it; the texts now say exactly that and keep "never touches a
   multi-factor step" only for the portal path (5(b)(v)). Whether Wayne State's acceptable-use and
   authentication rules allow a third-party program to carry a student's password and code to the
   grid is for C&IT (`docs/guides/LAB_LEAD.md`, section 3); the texts do not say the university allows
   it.
4. **A key on the student's computer that skips the password-and-code rule.** The 11.0.0 note said a key
   in the browser "would be a durable credential outside the university's password-each-time rule" and
   chose not to keep one. 12.0.0 keeps one, restricted to the gate, by Greg's order. The texts describe
   it and its limits; they do not say the university allows it.
5. **The Pilot App counts as an installation (section 1).** The access service binds one installation
   per account; a student who uses both the extension and the pilot would be refused on one of them
   until Licensor moves the approval. Say so to a pilot student, or exempt the pilot in the service.
6. **The portal field on the ssh path (LICENSE 10(a), PRIVACY "What Licensor receives").** The texts say
   the check carries "the hostname of the portal your institution's site profile names". In the
   working tree the background still sends `settings.hostname` (the portal granted on the welcome
   page). If the core sends `grid.wayne.edu` instead on the ssh path, both texts must say so; it is not
   a new field (R4), but it is a different value.
7. **"In this version your account keeps one such line" (LICENSE 5(b)(iv)).** True of framework 11's
   `browser-key add` (a newer line replaces an older one). It means one direct computer per account,
   which matches one installation per approval; if the lab ever wants two, this sentence changes.
8. **Export (section 18).** The extension now contains an ssh client that encrypts (AES-CTR or
   AES-GCM, HMAC-SHA1, curve25519 or ECDH key exchange, ECDSA or Ed25519 signatures), all in the
   browser's WebCrypto. Counsel: mass-market encryption under the EAR, as any browser's TLS.
9. **Section 15, the marks.** "Google Authenticator", "Windows Hello" and "Touch ID" are named as
   nominative use, as "GlobalProtect" was in version 8.
10. **"Beethoven takes no part in that step" (5(b)(ii)).** It shows the university's own instructions
    and QR codes for public pages; it never opens or reads the 2FA Setup page. True of the code read
    on 2026-10-02 (`routes.ts`: "Beethoven never shows, reads or copies the code's secret").
11. **The phone route's fallback sentence** in the pages stream (`model12.ts`, `routes.phoneNoKey`):
    "No setup key on the page? Do that step on a computer screen instead, ... Launching 2FA Setup there
    replaces the one on your phone". It sends a student who cannot run GlobalProtect on a computer to a
    computer screen with the grid's website open, which needs GlobalProtect there; and it asks them to
    run 2FA Setup a second time, which the texts warn about. Not a sentence of these texts; flagged
    for the pages stream and Greg.
12. **Retention.** Unchanged from version 9 (the check records are kept "for the life of your access
    and six years after", which does not match the service's own deletions; item 10 of the 11.0.0
    note).

## Outside these files: what must change to match

Not edited here (other streams' files, or other repositories):

- `extension/src/core/terms.ts`: `TERMS_VERSION = 9` and `TERMS_DATE = '2026-10-02'`; the build stops
  if they disagree with `LICENSE.txt`'s first line. The four summary lines and the tick are unchanged
  and still true ("To check your approval, it sends the lab your AccessID and an ID for this
  browser.").
- `extension/test/terms.test.ts` and `hygiene.test.ts`: the version, and `nativeMessaging` moving from
  the never-requested list to the manifest.
- `extension/wxt.config.ts`: its header comment lists `nativeMessaging` among the permissions that
  "must stay absent"; 12.0.0 needs it (D1).
- The repository's `CLAUDE.md`, "Rules that are not negotiable": "Never request ... `nativeMessaging`"
  and "No automated login; the MFA step is never touched" are no longer true of 12.0.0 by Greg's order
  of 2026-10-02 (the helper; the code typed in Beethoven's sheet and carried to the grid); "Terms":
  version 9 and 10, `TERMS_VERSION` 9. For the maintainer to change, not a stream.
- `SECURITY.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/STORE_LISTING.md`, `docs/TESTERS.md`,
  `docs/WAYNE_STATE_PILOT.md`: still 10.0.0 or 11.0.0 (`docs/V11_STATUS.md`, section 5), and none
  names the ssh path, the helper or the browser's key.
- The pages stream's macOS step (`model.ts` WORDS.direct.installHelper.steps.mac): "If your Mac says it
  can't check the developer, Control-click the file, choose Open, then Open again." Apple removed the
  Control-click override in macOS 15 (Sequoia); there the student must use System Settings, Privacy &
  Security, Open Anyway (or run the file with `sh` in Terminal). `docs/guides/INSTALL.md` gives both.
- The pages stream's helper steps and the helper stream's installers disagree (read 2026-10-02):
  the installers are zips (`beethoven-bridge-<os>.zip`) whose Windows and macOS installers refuse to
  run from inside the zip and whose Linux installer is `bash install.sh` after `unzip`, while the
  panel says "Open the file you downloaded" (Windows) and "Type sh followed by the file name" (Linux);
  the panel says "When the window says Done", and the installers end "The Beethoven bridge 1.0.0 is
  installed for Chrome. Go back to Beethoven and press Try again.", while the panel's button is
  "Check again". `docs/guides/INSTALL.md` follows the installers and names the panel's button.
- `helper/src/common/allowed_origins.json` holds a placeholder
  (`chrome-extension://REPLACE_WITH_EXTENSION_ID_SEE_HELPER_README/`); the store build must put the
  store item's ID there (`docs/store/SUBMISSION.md`, section 1, step 4).
- The website: `beethoven/terms.html` and `privacy.html` regenerated from these texts by
  `tools/build_site.py` (not run by this stream); `tools/pages/beethoven/support/body.html` and
  `reviewers/body.html` were rewritten by this stream for 12.0.0.
- Beethoven for VS Code is untouched.

## Places left for the integrator

Every **[INTEGRATOR]** mark in `docs/guides/` and `docs/store/` (in the student guides, as HTML
comments that a reader of the rendered page does not see) waits on another stream: whether
`nativeMessaging` is required or optional, how the build puts the store item's ID into each helper
zip's `allowed_origins.json`, the exact warnings Chrome, Windows and macOS showed in a real run, the
store bridge (exploration A), prices (exploration B), KB 20242's steps after Launch and whether the
2FA Setup page shows a setup key (exploration B), framework 11's final login-node table, and the
12.0.0 harness runs. Each mark says what to fill. The helper's file names, folders and messages were
filled from `helper/src/` as it stood on 2026-10-02 (`beethoven-bridge-windows.zip`,
`beethoven-bridge-mac.zip`, `beethoven-bridge-linux.zip`; `%LOCALAPPDATA%\Beethoven\bridge`,
`~/Library/Application Support/Beethoven/bridge`, `~/.local/share/beethoven/bridge`).
