# Beethoven texts for 16.0.0: agreement version 11, privacy statement version 12

Drafted 2026-10-08 for Greg and for counsel, by the extension thread of the 16.0.0 build. **This is
drafting, not legal advice.** No lawyer has read these texts or this note; the questions at the end
are for one.

What changed, in one paragraph: `LICENSE.txt` goes from version 10 (2026-10-04) to version 11
(2026-10-08) and `PRIVACY.md` from version 11 to version 12 (2026-10-08), because Beethoven 16.0.0
removes the direct way of 12.0.0 to 15.0.0 whole (Greg's message of 2026-10-08 15:30Z, confirmed on
the decision card at 17:52Z with "Remove"): no Bridge, no sign-in sheet, no key in the browser, no
gate line, no passkey, no Forget this computer, no phone route, no relay, no pilot app, no
`nativeMessaging` permission, no signed installer. The one way is the university's VPN and the Open
OnDemand portal, as agreement 8 and privacy statement 9 (11.0.0) described it. Both texts say what an
earlier version may have left outside the browser (the Bridge on the computer, the line in the grid
account, a passkey), that this version uses none of it, and that on its first run it removes what
that version kept in the browser, the key unread. They also describe what 16.0.0 adds on the one
way: a press kept while the grid is out of reach, the reach checks (every three seconds with a page
of Beethoven's open, once a minute without one), "Keep my worker running" starting an ended worker
again at most three times in a row, the note in Settings with *Forget*, and the links to the
university's own pages and to Anthropic's plans page. `THIRD_PARTY_NOTICES.md` loses the Rust
standard library's notice, the MinGW-w64 and GCC runtimes' notice and the paragraph on the ssh
client and the Bridge; its item 4 (the QR code generator) names only the Phone card. Every dispute,
liability and risk term is unchanged word for word, and so are the section numbers 1 to 23; section
5(b)'s sub-items are renumbered ((i) Your portal, the old (v) unchanged; (ii) What an earlier version
may have left, new) and the references to 5(b)(iii) and 5(b)(v) elsewhere follow. Nothing new
reaches Licensor.

Sources: Greg's message of 2026-10-08 15:30Z and his card answer of 17:52Z; the code on branch
`claude/extension-vpn-first-xjhm0g` at 25e7822 (`extension/src/entrypoints/background.ts`:
`cleanupDirectWay`, `backgroundPoll`, `REACH_EVERY_MS`, `KEEP_RUNNING_MAX`; `extension/src/core/keys.ts`:
`OldKeyNote`; `extension/src/core/model.ts`: the welcome page's three needs and their links, the
GlobalProtect step's sentence and link, the Settings note and *Forget*); hpcworker `main` at 3b22e70
(framework 18), where `hpcworker browser-key remove` still exists and is named as the way a student
removes the line; `TEXTS_V9_V10.md` and `TEXTS_V10_V11.md` for what the removed passages said.

Kept as they were: both texts stay plain ASCII with LF line endings; the agreement's version line is
`Version 11, 2026-10-08.` at the start of a line, as `extension/scripts/sync-profiles.mjs` and
`extension/test/terms.test.ts` read it; `TERMS_VERSION` is 11 and `TERMS_DATE` '2026-10-08' in
`extension/src/core/terms.ts`, and a version 10 acceptance stays in the history, out of force, so
everyone accepts once more; the welcome page's summary lines and the tick's sentence are unchanged
(neither names the Bridge); the `agreement-texts` export in `interface/INTERFACE.json` stays at
version 1 (the files' names and shape are the same).

## The agreement (`LICENSE.txt`), version 10 to 11

- The head line: version 11, 2026-10-08, "Beethoven 16.0.0 and later versions".
- Section 1: the definition of Beethoven drops the Bridge and the Pilot App; the Extension starts,
  watches and stops the job "through your institution's Open OnDemand portal, in the browser session
  you have signed in to there"; "your account name" is the name the portal's dashboard shows for the
  session; the terms "ssh path" and "portal path" are gone from the whole text.
- 3(a): "only once your cluster has accepted your sign-in to your portal".
- 3(e): the sentence saying the Bridge and the key belong to the installation is removed.
- 5(a): the sign-in terminal starts "through your portal's shell".
- 5(b): the introduction says there is one way, which may need the VPN, and names as history what
  12.0.0 to 15.0.0 offered; (i) Your portal is the old (v), word for word; (ii) What an earlier
  version may have left is new: the Bridge and how it is removed, that this version holds no
  permission to start it; the line in `~/.ssh/authorized_keys`, that this version deletes the key it
  admitted from the browser unread so the line admits nothing, that it never let the key run
  anything but the gate, that the lab lead or `hpcworker browser-key remove` removes it and
  withdrawing approval does not; the Settings note with "Forget", which changes nothing on the
  cluster; a passkey, deleted in its own store. The old (i) to (iv) (the Bridge, the password and
  code, the key in the browser, Forgetting this computer) are removed.
- 5(f): "It runs no page script on the ssh path" and "on the portal path" are gone; the one-time
  step is (b)(i); a last sentence says the welcome page and the VPN step link the institution's own
  pages, which open in a new tab only when chosen, and the Extension learns nothing of the visit.
- 10(a): "your portal's hostname" without the ssh-path parenthesis. 10(c): "the key of section
  5(b)(iii)" is removed from what stays in the browser.
- 15: the sentences on the Rust standard library and the runtimes are removed; what is not part of
  Beethoven is Claude Code, Node.js, the container image, the container runtime, the Open OnDemand
  portal, your institution's VPN program, your cluster's ssh service and your authenticator app; the
  marks sentence keeps GlobalProtect, Windows and macOS (named in 5(b)(ii)) and drops Google
  Authenticator, Windows Hello and Touch ID, which the text no longer names.
- 17: the sentence on the Bridge not updating itself is removed.
- 18: "The Extension contains cryptography only to verify signatures (the list of withdrawn versions
  of section 3(d)), with your browser's own cryptography"; the one-time step is 5(b)(i).

## The privacy statement (`PRIVACY.md`), version 11 to 12

- The head line, and the introduction: one way; the list of sections (with the new one); a sentence
  that 12.0.0 to 15.0.0 reached the cluster over ssh through the Bridge after a sign-in on a sheet,
  and that this version has none of that and never asks for the cluster password.
- The table: the preferences row loses the *Connection* choice; the account-name row is the
  portal's dashboard name only; the rows for the browser's key, the passkey and the last check of
  the ways to reach the cluster are removed; the direct-way row becomes the old-key note row (what
  the note holds, why, and *Forget*); the audit-log row loses the ssh clause and the password words.
- The paragraph under the table: there is no durable secret in the extension's storage; the reach
  checks as built (once on agreeing; every three seconds while a page of Beethoven's is open and the
  grid is out of reach; once a minute while none is open and the grid was last out of reach, so a
  waiting press and *Keep my worker running* go ahead by themselves; *Try again*); the one QR code;
  the links to the university's pages and the plans page.
- New section "What an earlier version may have left", in place of "The Bridge on your computer",
  "When you sign in to your cluster over ssh" and "Relays and the pilot app": what the first run
  removes from the browser, and the three things outside it (the Bridge, the line with what it holds
  and who removes it, a passkey).
- "What goes to your own cluster account": the consent marker is written "through the portal's
  shell"; the ssh-path paragraph on the browser-key line is removed (what of it still matters is in
  the new section). "What your university sees on the ssh path" is removed.
- "What your portal sees", "What happens when you sign in to Claude" and the heading of the
  password section lose the "portal path" and "ssh path" words.
- "What Licensor receives": the approval check carries "the account name your portal's dashboard
  shows for your session, your portal's hostname, the product name (`bridge`)"; the sheet, the
  browser's key and the Bridge clauses are gone. "What is never collected": the cluster password and
  code are typed only into the browser's own box, the portal's pages and the portal's terminal page;
  `nativeMessaging` joins the never-requested list. "How Licensor uses and keeps it": the password
  sentence says the extension never sees them. "Your choices and rights": *Forget* on the note, the
  line (lab lead or `hpcworker browser-key remove`), a Bridge an earlier version had you install.
- Changes: the version 12 entry.

## `THIRD_PARTY_NOTICES.md`

Items 5 (the Rust standard library) and 6 (the MinGW-w64 and GCC runtimes) and the paragraph on
the ssh client, the passkey code and the Bridge are removed; item 4 says the QR code generator draws
the Phone card's code only. Items 1 to 4, the tour paragraph and the Claude Code paragraph stay.

## For Greg (and counsel)

1. The Pilot App definition is removed from section 1, and the pilot app from the privacy
   statement. No such app is in the tree since 16.0.0 and none was given to anyone; if one is ever
   made, both texts take it back first.
2. Both texts name `hpcworker browser-key remove` as a way to remove the line an earlier version
   added. It exists on hpcworker's `main` (framework 18). If hpcworker drops the command, the
   sentence becomes "ask your lab lead" alone.
3. 5(f) and the privacy statement now say that the welcome page's and the VPN step's links to the
   institution's own pages open in a new tab only when chosen and that the Extension learns nothing
   of the visit. New text about a new behaviour, stated from the code.
4. Both texts are dated 2026-10-08, the day of the decision; the store build that ships them is not
   made yet. Earlier records were dated on the day of drafting too.
5. The website's `terms.html` and `privacy.html` are regenerated by the site repository's
   `tools/build_site.py` from these files; until that runs, the website shows version 10 and 11.
6. The privacy statement names, as files of the student's that stay, `~/.ssh/authorized_keys.beethoven-prev`
   and the gate's counts file; nothing of ours removes them (the deletion rule), and the lab lead's
   guide says what they are.

Checked on 2026-10-08: `node scripts/sync-profiles.mjs` copies the three texts into
`extension/public/` byte for byte and reads `Version 11, 2026-10-08` as matching `TERMS_VERSION` and
`TERMS_DATE`; `test/terms.test.ts` and `test/hygiene.test.ts` pass; the whole suite and the Chrome
build are run before the change is committed (the pull request says the result).
