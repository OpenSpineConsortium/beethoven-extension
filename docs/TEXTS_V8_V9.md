# Beethoven texts for 11.0.0: agreement version 8, privacy statement version 9

Drafted 2026-10-01 for Greg and for counsel, by the texts stream of the 11.0.0 build. **This is
drafting, not legal advice.** No lawyer has read these texts or this note; the questions at the end
are for one.

What changed, in one paragraph: `LICENSE.txt` goes from version 7 (2026-09-30) to version 8
(2026-10-01) and `PRIVACY.md` from version 8 to version 9 (2026-10-01), because Beethoven 11.0.0
forms the agreement differently (one box and "Agree and continue" on a welcome page, no typed name,
no scrolling requirement, the full text one click away and always offered for saving and printing),
reaches the portal from its background on the sign-in the browser keeps, closes the tabs it opens,
starts the worker and the Claude sign-in with one command, keeps new notes on the device, and adds
the one-time grid key step of amendment AM2. `THIRD_PARTY_NOTICES.md` gains the QR code generator
and a note on the tour's figure. Every dispute, liability, risk and licence term is unchanged word
for word: only the sentences that say *where* and *how* a term is shown or acknowledged were edited
(sections 8, 19 and 20), and section numbers are unchanged (3(a), 5(b), 8, 15, 19 and 20 are where
other documents cite them).

Sources, in order of authority: Greg's own words; the orchestrator's amendments AM1 to AM8; the
final specification (`scratchpad/v11/SPEC.md`, section "Sentences that change (old -> new)", called
"the spec's list" below); `docs/V11_CONTRACT.md`; the access service as deployed on 2026-10-01
(`ashley` repository, `tools/intake/worker.js` and `ACCESS_CHECK.md`). The texts were edited by one
script from one list of edits, and this note is generated from the same list, so the quotations
below are exactly what changed (paragraphs are quoted unwrapped; in the files each touched paragraph
was re-wrapped at 100 columns).

Kept as they were: both texts stay plain ASCII with LF line endings; the agreement's version line is
`Version 8, 2026-10-01.` at the start of a line, as `extension/scripts/sync-profiles.mjs` and
`extension/test/terms.test.ts` read it; nothing uses the banned word.

## LICENSE.txt, version 7 -> version 8

### L1. Head, version line

Old:

> Version 7, 2026-09-30. Applies to the Trial Edition of Beethoven 8.0.0 and later versions that ship this text

New:

> Version 8, 2026-10-01. Applies to the Trial Edition of Beethoven 11.0.0 and later versions that ship this text

Why: AM6 and the specification's list of sentences that change. The build (scripts/sync-profiles.mjs) and test/terms.test.ts read this line as /^Version (\d+), (\d{4}-\d{2}-\d{2})\./ and compare it with TERMS_VERSION 8 and TERMS_DATE '2026-10-01' in src/core/terms.ts, which another stream sets.

### L2. Head, where the text can be read

Old:

> on the extension's own page ("Read the license terms"), in the signing dialog ("Open in a tab", "Save a copy"), at

New:

> on Beethoven's welcome page ("Show terms", "Open in a tab", "Save a copy", "Print") and on its settings page, at

Why: the specification's list of sentences that change. 11.0.0 has no signing dialog; the welcome page and Settings carry the text, and saving and printing are always offered (MCL 450.838(3)).

### L3. Opening paragraph, how the agreement is formed and what is recorded

Old:

> It is formed when, in the signing dialog Beethoven shows on its own page before first use, you tick the boxes, type your name and choose the button labelled "Accept and Continue". Beethoven records the version of this text you accepted, its hash, the time, what you ticked and the name you typed, and keeps a copy of the text for you. If you do not agree, choose "Decline" and do not use Beethoven.

New:

> It is formed when, on the welcome page Beethoven shows before first use, you tick the box beside the sentence that names this agreement and choose the button labelled "Agree and continue". The full text is one click away there ("Show terms"); opening it is your choice, and you agree to all of it. Beethoven records the version and hash of this text and the hash of the privacy statement, the four-line summary and the sentence shown, that you ticked it, the label of the button, whether you opened the full text (and whether you scrolled it to its end, opened it in a tab, saved it or printed it), the time, the version of Beethoven, your browser and the installation identifier and, added once your portal first shows it after you agree, your account name and when it was seen; it keeps a copy of the text for you. If you do not agree, close the page and remove Beethoven.

Why: the specification's list of sentences that change, with the record's list completed from the specification's TermsRecord v2 (privacy_sha256, summary, button_label, terms_opened, terms_end_reached, opened_in_tab, saved_copy, printed, product_version, host, install_id, bound_account and bound_account_seen_at). One tick (AM3); no typed name, no scrolling gate, no Decline button. The account name is said to be added after acceptance because that is when the first grid sign-in shows it.

### L4. Section 1, your account name

Old:

> it is the only identifier of you that Beethoven uses, and there is nothing to type or paste (the Extension also names its own installation with a random number, section 3(e))

New:

> it is the only identifier of you that Beethoven uses, and you never type or paste it into Beethoven (the Extension also names its own installation with a random number, section 3(e))

Why: "There is nothing to type or paste" reads as untrue in 11.0.0, where the student pastes the one-time Claude code, may paste the one setup line of the key step, and types the AccessID into the browser's own sign-in box. What stays true is that the account name is never typed or pasted into Beethoven.

### L5. Section 3(a), when the approval is checked

Old:

> and again when you click its icon after a day has passed or after a no

New:

> and again when you open its panel after a day has passed or after a no

Why: the specification's list of sentences that change. The toolbar button now only toggles the panel (openPanelOnActionClick); the re-check is tied to the panel opening (messages.ts panel.opened).

### L6. Section 5(a), the Claude sign-in tab and the one command

Old:

> The Extension starts that terminal for you through your portal's shell, opens Anthropic's sign-in page in a new tab, and shows you one box; you sign in on Anthropic's page and paste the one-time code it shows into that box.

New:

> The Extension starts that terminal for you through your portal's shell, in the same command that starts your worker, opens Anthropic's sign-in page in a new tab, shows you one box, and closes that tab once Claude Code reports you are signed in, unless the tab has loaded another page since you pasted the code; you sign in on Anthropic's page and paste the one-time code it shows into that box.

Why: the specification's list of sentences that change (the tab closes itself), with the rule that limits it (contract section 17: only while the tab has started no new load since the paste). "In the same command that starts your worker" is the one connect line (contract D1, D2), as PRIVACY says too.

### L7. Section 5(a), what Beethoven reads of the sign-in

Old:

> and Beethoven reads Claude Code's yes-or-no answer about whether it is signed in, nothing more.

New:

> and Beethoven reads Claude Code's own report of whether it is signed in, with the account and plan that report names, nothing more.

Why: Untrue in 11.0.0: after every sign-in the panel shows "Signed in as <email> . <plan>", refuses a plan without Remote Control, and the Claude row reads the plan from status.json claude_login. (The 10.0.0 privacy statement already listed the account and plan in its sign-in note; this sentence had fallen behind it.)

### L8. Section 5(a), the Remote Control answer

Old:

> You answer Claude Code's one-time question about Remote Control yourself, in the Extension's own panel, before your first worker starts; the Extension records that answer in one file in your cluster account, and your worker gives it to Claude Code when Claude Code asks.

New:

> You answer Claude Code's one-time question about Remote Control yourself, with the box you tick in the Extension's panel before your first worker starts; the Framework records that answer in one file in your cluster account when you press Connect, and your worker gives it to Claude Code when Claude Code asks.

Why: the specification's list of sentences that change. The consent marker is now written by `hpcworker connect --consent` through the shell, not by the Extension through the Files app.

### L9. Section 5(b), how the portal is reached, and the one-time grid login setup (AM2)

Old:

> (b) Your portal session. The Extension uses the sign-in your browser already holds for your institution's Open OnDemand portal, on that one website only, in the same way the portal's own pages do. It never reads the sign-in cookie, never stores a portal password, never signs in for you and never touches a multi-factor step. When the portal asks for a sign-in, the Extension asks you to sign in in a tab. The one thing it reads about you from the portal is your account name, from the portal's own dashboard page.

New:

> (b) Your portal session. The Extension uses the sign-in your browser already holds for your institution's Open OnDemand portal, on that one website only, from its own background and without a portal tab where your browser allows it. It never reads that sign-in, never reads, stores or types a portal password, never signs in for you and never touches a multi-factor step. When the portal asks for a sign-in, the Extension opens the portal in a tab for you to sign in there (in your browser's own sign-in box, or on the portal's own sign-in page), never sees what you type there, and closes that tab once you are signed in, while it is still on the portal. Where your portal does not share its sign-in with the Extension, it keeps that tab behind your other tabs until the work in hand is done and then closes it, and for a later action opens the portal in a background tab and closes it again. The one thing it reads about you from the portal is your account name, from the portal's own dashboard page. If your portal's shell asks for your cluster password, as it may for an account that has no key on the cluster, the Extension types nothing there and offers a one-time step instead: it opens the portal's own terminal page in a tab, and you type your password there yourself; the Extension never sees it. Once you say you are in, or the page's title shows that your shell is up, the Extension types one line into that terminal (or leaves it on your clipboard for you to paste), which runs the Framework's login-setup step in your own account. That step makes a key in your cluster account, in its ~/.ssh folder, that opens your account only from the computer the terminal came from, which is your institution's Open OnDemand server, and has ssh offer it when the portal's shell connects you, so that the shell need not ask for your password; it never reads, changes or prints a key you already have. The key stays in your cluster account: the Extension never sees it, keeps nothing about it in your browser and sends nothing about it to Licensor. The command "hpcworker login-setup --remove", run in a terminal on the cluster, removes it.

Why: the specification's list of sentences that change for the first five sentences, corrected for tab mode (the spec's own portal-tab section: in tab mode the sign-in tab stays, out of the way, until the work ends, so "closes that tab once you are signed in" is true only in direct mode). "Never reads the sign-in cookie" becomes "never reads that sign-in" because Wayne State's portal signs in with the browser's own HTTP box, not a cookie (AM1). "Never reads, stores or types a portal password" is AM3. The rest is AM2's one-time step: the student types the grid password into the university's own terminal page, Beethoven types one setup line there, and the key it makes lives only in the grid account, restricted with from= to the OnDemand server; nothing about it is kept in the browser. It is placed in 5(b), not in a new item, so that items (c) to (g) keep their letters and 5(g) still covers it.

### L10. Section 5(e), when the data statement is shown

Old:

> The Extension shows these sentences at first run and before each job start, and does not start a worker in a folder you have marked restricted.

New:

> The Extension shows these sentences in short form, with the full text one click away, before your first worker starts, and a one-line reminder beside Connect each time you start one, and does not start a worker in a folder you have marked restricted.

Why: the specification's list of sentences that change (statement version 3: the four short lines and the tick at moment 6, the seven full sentences under "More about your data", and "Your worker's files and output go to Anthropic. Keep restricted data out." beside Connect). The specification says "one tap away"; this text says "one click away" to match the opening paragraph.

### L11. Section 5(f), the page script and the tabs

Old:

> Its only page script runs on the one portal website you connect. It opens an Anthropic page only in a new tab, as a bookmark would: the sign-in page during the sign-in described in (a), your worker's session page when the worker connects, and the connectors settings page if you choose the optional Google Drive step.

New:

> Its only page script runs on the one portal website you connect: where your portal does not share its sign-in with the Extension, to carry the Extension's requests there, and, during the one-time step in (b), on the portal's terminal page, where it watches only the page's title and types only the one line described there. It opens an Anthropic page only in a new tab, as a bookmark would: the sign-in page during the sign-in described in (a), your worker's session page when a worker you started is ready (unless you turn that off) and when you choose "Open my session" or "New session", and the connectors settings page if you choose the optional Google Drive step; it closes the sign-in tab it opened once you are signed in, and it may bring forward a claude.ai tab it opened itself. Of an Anthropic tab it opened, it learns only that the tab has begun loading a page, which the browser tells it without the page's address or content.

Why: the specification's list of sentences that change ("used only where your portal does not share its sign-in"; "closes the sign-in tab it opened"), extended because the spec's page-script sentence is made untrue by AM2: the page script also runs on the grid's terminal page in direct mode, injected with scripting.executeScript (contract section 2, item 3, and section 20). The session page now also opens from "Open my session" and "New session", and "Open my session" brings the tab it opened forward. The last sentence says what the tab-load counting (no "tabs" permission; tabs.onUpdated status events) actually learns.

### L12. Section 7, where the dependencies are disclosed

Old:

> each is disclosed here, in the signing dialog and where Beethoven is offered

New:

> each is disclosed here, on the welcome page and where Beethoven is offered

Why: the specification's list of sentences that change

### L13. Section 8, where the Known Risks are named

Old:

> In particular, and as Known Risks named in the signing dialog, you accept

New:

> In particular, and as Known Risks named on the welcome page, above the box you tick, you accept

Why: the specification's list of sentences that change

### L14. Section 8, the acknowledgement

Old:

> This section is one of the terms you specifically acknowledge in the signing dialog. It does not cover

New:

> This section is one of the terms named in the sentence you tick on the welcome page. It does not cover

Why: the specification's list of sentences that change. Shipping variant (one tick); the two-tick wording is below.

### L15. Section 9(d), where a Full Edition would be accepted

Old:

> Full Edition License Agreement in the signing dialog.

New:

> Full Edition License Agreement on the welcome page.

Why: the specification's list of sentences that change

### L16. Section 10(a), when the approval is checked

Old:

> and again when you click the Extension's icon after a day has passed or after a no

New:

> and again when you open the Extension's panel after a day has passed or after a no

Why: the specification's list of sentences that change

### L17. Section 10(a), what the access service records

Old:

> Licensor's service records each check: the account name, the portal's hostname, the product, the version, the time, a salted hash of your network address (never the address itself) and the answer.

New:

> Licensor's service keeps one record of the checks for each account and product: the account name, the product, the portal's hostname and the version of the latest check, when the account was first and last checked, how many checks there have been, the answer of the latest check and the reason given with a no, when the answer last changed, and a salted hash of the network address of the latest check (never the address itself); it also counts each day's checks per account and per hashed address, to limit them, and deletes those counts after two days.

Why: The 10.0.0 review asked that the next texts name the count and the reason. Written from the access service as deployed on 2026-10-01 (ashley repository, tools/intake/worker.js accessCheck and ACCESS_CHECK.md "What the service records": seen:<product>:<access_id> holds portal, version, first_seen, last_seen, checks, approved, reason, ip_hash and changed_at; chk:/chkip: day counters kept 2 days). The fields sent are unchanged.

### L18. Section 10(c), the acceptance record

Old:

> Your acceptance record (the version and hash of this text, what you ticked, your typed name, the time, the install id, the software versions), your statements, your audit log and your settings stay in your browser; Licensor does not receive them. The install id is the installation identifier of section 3(e), which the approval check in (a) sends.

New:

> Your acceptance record (the version and hash of this text, the summary and the sentence shown, what you ticked, whether you opened the full text, the time, the install id, your account name once known, the software versions), your statements, your audit log, your settings and what the Extension remembers about your worker stay in your browser; Licensor does not receive them. The install id is the installation identifier of section 3(e), which the approval check in (a) sends, as it sends your account name.

Why: the specification's list of sentences that change for the record. "What the Extension remembers about your worker" covers the new local notes (last known state, link, waits). The last clause keeps the sentence true now that the record holds the account name, which the check also sends.

### L19. Section 10(d), the check records

Old:

> and the record of each approval check described in (a)

New:

> and the record of the approval checks described in (a)

Why: Follows the corrected 10(a): one record per account, not a line per check.

### L20. Section 15, your institution's name

Old:

> Your institution's names and marks belong to it, and Beethoven carries none of them.

New:

> Your institution's names and marks belong to it: Beethoven uses its name only in plain words, to say where your worker runs (for example, "Wayne State grid"), and carries none of its logos or other marks. "GlobalProtect" is the mark of Palo Alto Networks, named only to say which VPN program to turn on.

Why: Untrue in 11.0.0: the welcome page reads "A Wayne State grid account" and "Not at Wayne State?", the panel "Look for Wayne State grid", and the session title is "Wayne State grid" (site profile session_title). 10.0.0 showed no institution's name. GlobalProtect is newly named on screen (site profile vpn_app). The trademark sentence before it is kept word for word.

### L21. Section 17, where a changed agreement is shown

Old:

> Beethoven shows a changed agreement in the signing dialog and asks you to accept it again

New:

> Beethoven shows a changed agreement on its welcome page and asks you to accept it again

Why: the specification's list of sentences that change

### L22. Section 18, what the Framework generates

Old:

> the Framework generates random per-job tokens.

New:

> the Framework generates random per-job tokens and, in the one-time step of section 5(b), has the cluster's own ssh-keygen make a key in your account.

Why: AM2: login-setup makes an ed25519 key with the cluster's ssh-keygen. The export sentence otherwise named only signatures and tokens.

### L23. Section 19, the acknowledgement

Old:

> and is one of the terms you specifically acknowledge in the signing dialog.

New:

> and is one of the terms named in the sentence you tick on the welcome page.

Why: the specification's list of sentences that change. Only the sentence about how the term is acknowledged changes; the dispute terms of section 19 are unchanged.

### L24. Section 19(a), where the install id is shown

Old:

> the install id shown with the acceptance record on the Extension's setup page

New:

> the install id shown with the acceptance record on Beethoven's settings page

Why: the specification's list of sentences that change. True only if Settings shows the install id with the acceptance record (see the list of unsure sentences).

### L25. Section 20, the acknowledgement

Old:

> This section is one of the terms you specifically acknowledge in the signing dialog.

New:

> This section is one of the terms named in the sentence you tick on the welcome page.

Why: the specification's list of sentences that change. The jury waiver itself is unchanged.

### L26. Section 21(f), a parent or guardian

Old:

> accepts this agreement on their behalf in the signing dialog and remains

New:

> accepts this agreement on their behalf on the welcome page and remains

Why: the specification's list of sentences that change

## PRIVACY.md, version 8 -> version 9

### P1. Head, version line

Old:

> Version 8, 2026-09-30.

New:

> Version 9, 2026-10-01.

Why: AM6 and the specification's list of sentences that change.

### P2. Opening, what the statement covers

Old:

> This statement says what stays in your browser, what your portal sees, what happens when you sign in to Claude, what Anthropic receives, what Licensor receives, and what is never collected.

New:

> This statement says what stays in your browser, what goes to your cluster account, what your portal sees, what happens when you sign in to Claude and when the portal's shell asks for your password, what Anthropic receives, what Licensor receives, and what is never collected.

Why: Names the new section on the one-time key step (AM2) and the cluster-account section the list had left out.

### P3. Table, row 1 (the portal address)

Old:

> | The portal address you connected from its tab or typed, and the one website you granted the extension access to | the extension's own storage (`storage.local`) | to reach your portal | the options page; removing the site permission in your browser; uninstalling |

New:

> | The portal address (your university's, filled in from the site profile, or one you typed), and the one website you granted the extension access to | the extension's own storage (`storage.local`) | to reach your portal | Settings (in the panel's *More* menu); removing the site permission in your browser; uninstalling |

Why: the specification's list of sentences that change: the address now comes from the site profile's ood_base_url by default, and "the options page" is Settings, reached from the panel's More menu (the button with aria-label "More"; the spec's glyph is not ASCII).

### P4. Table, row 2 (preferences)

Old:

> | Your preferences: the shell host and site profile name, the worker's name and permission mode, whether your worker starts by itself when your portal tab connects, and whether the claude.ai tab opens by itself when your worker connects (in this build both are on until you turn them off; the options page says so where each is switched) | `storage.local` | convenience | the options page |

New:

> | Your preferences: the shell host and site profile name, the worker's name and permission mode, whether your worker is kept running, whether claude.ai opens when a worker you started is ready (in this build both are on until you turn them off; Settings says so where each is switched), and your appearance choice | `storage.local` | convenience | Settings |

Why: the specification's list of sentences that change. DEFAULT_PREFS in keys.ts still has auto_start and open_claude_on_connect true, so the parenthesis stays; appearance is new (default cream).

### P5. Table, row 3 (account name and last answer), how you control it

Old:

> | to know which account to ask about, and to keep working for a day without asking again | disconnecting the portal on the options page; uninstalling |

New:

> | to know which account to ask about, and to keep working for a day without asking again | *Disconnect* in Settings; uninstalling |

Why: "The options page" is Settings, whose "Your grid" card has Disconnect.

### P6. Table, row 4 (the acceptance record)

Old:

> | Your acceptance of the agreement: its version and text hashes, the statements you ticked with their wording, your typed name, the time, and the exact texts shown |

New:

> | Your acceptance of the agreement: its version and date, the hashes of the agreement and of this statement as shown, the four-line summary and the sentence shown with the box, that you ticked it, the label of the button, whether you opened the full text and whether you scrolled it to its end, opened it in a tab, saved it or printed it, the time, the version of Beethoven, your browser and the installation identifier, and your account name with the time it was seen, added once your portal first shows it after you agree |

Why: the specification's list of sentences that change, completed from TermsRecord v2 as in LICENSE's opening paragraph. No typed name any more.

### P7. Table, row 5 (the data statement)

Old:

> | Your statement about a worker's workspace: that it holds none of the restricted data the notice names, and that Remote Control will be enabled for that worker; kept as the workspace name, the exact text and its version, the time, and the time the marker below was written, one record per workspace | `storage.local` | so the notice is shown at every start but you are not asked to tick it again for the same workspace | making it again for a workspace on the options page; uninstalling. It is asked again when the text or the workspace changes |

New:

> | Your statement about a worker's workspace, made with the box you tick in the panel before your first worker starts: that you will keep FERPA, IRB, health and export-controlled data out of it, and that Remote Control is turned on for that worker; kept as the workspace name, the sentence and the lines shown with their version, the label of the button, the time, and the time the framework reported writing the marker below, one record per workspace | `storage.local` | so you are not asked to tick it again for the same workspace (a one-line reminder sits beside *Connect* each time) | making it again for a workspace in the panel; uninstalling. It is asked again when the text or the workspace changes |

Why: the specification's list of sentences that change ("made with the box you tick in the panel"; "in the panel"). Acknowledgement v3: the tick sentence (STATEMENT_TICK) and the four lines, button_label "Connect", acknowledged_at, and consent_recorded_at from `HPCW-STEP consent`. "So the notice is shown at every start" became untrue: the full notice is shown before the first worker, and a one-line reminder beside Connect each time.

### P8. Table, row 7 (notes of automatic steps)

Old:

> a note of the check job it submitted by itself (the time and the job number), so it is not submitted again while it runs;

New:

> a note of the check job submitted from *Details* (the time and the job number), so it is not submitted again while it runs;

Why: The probe leaves the student's path in 11.0.0 and stays only as "Check a compute node" under Details, so it is no longer submitted by itself.

### P9. Table, row 7, why

Old:

> | `storage.local` | so the automatic steps do not repeat themselves | uninstalling |

New:

> | `storage.local` | so these steps do not repeat themselves | uninstalling |

Why: The row no longer holds only automatic steps (the check job is pressed for).

### P10. Table, row 8 (the Google Drive tick), why

Old:

> | `storage.local` | so the checklist remembers what you finished |

New:

> | `storage.local` | so Settings remembers what you finished |

Why: 11.0.0 has no checklist strip; the optional Drive step sits in Settings ("Google Drive in Claude (optional)").

### P11. Table, new local rows (last known state; channel; small notes), 1 of 3

Old:

> (none: added)

New:

> | Your worker's last known state, kept across browser restarts so the panel can show it, and *Open my session* can work, before you sign in to the grid again: the worker's name, its claude.ai link and session title, its state and when it was seen, since when it has been online and when it renews itself, and the account name the portal showed with it | `storage.local` | so the panel is never blank and your session's link works without the grid or the VPN | uninstalling |

Why: the specification's list of sentences that change (the four new local rows: link, title, last known state and time; how the extension reaches the portal; the last five waits; the tour seen), plus ONCE_KEY, which the contract added (D16). The claude.ai tab id is not in the first row: the contract keeps it in session storage (D15), so it is listed in the session row instead. LastKnown also holds online_since, ends_at and account (keys.ts), named here.

### P12. Table, new local rows (last known state; channel; small notes), 2 of 3

Old:

> (none: added)

New:

> | How the extension reaches your portal (directly from its background, or through a tab it opens), and whether the portal's shell opened without asking for a password, with the time this was last tested | `storage.local` | so it uses the way that works without testing again before every action | uninstalling |

Why: the specification's list of sentences that change (the four new local rows: link, title, last known state and time; how the extension reaches the portal; the last five waits; the tour seen), plus ONCE_KEY, which the contract added (D16). The claude.ai tab id is not in the first row: the contract keeps it in session storage (D15), so it is listed in the session row instead. LastKnown also holds online_since, ends_at and account (keys.ts), named here.

### P13. Table, new local rows (last known state; channel; small notes), 3 of 3

Old:

> (none: added)

New:

> | Small notes for the panel: how long your last five waits for a computer took, in minutes ("Last time: 6 min."); whether the tour was seen, and to its end; and which one-time tips you have seen or dismissed (pinning the toolbar button, *Try asking*, the tour card, the *New session* tip), with when | `storage.local` | so the panel can tell you what to expect and does not repeat itself | uninstalling |

Why: the specification's list of sentences that change (the four new local rows: link, title, last known state and time; how the extension reaches the portal; the last five waits; the tour seen), plus ONCE_KEY, which the contract added (D16). The claude.ai tab id is not in the first row: the contract keeps it in session storage (D15), so it is listed in the session row instead. LastKnown also holds online_since, ends_at and account (keys.ts), named here.

### P14. Table, connection-state row (session storage)

Old:

> | Connection state while a job runs: the worker's name and its folder on the cluster, the job number, what the worker's status file last said (its state, its one-line message, the node, the account and plan Claude Code reports, whether your Remote Control answer is on record), the session name and its claude.ai link, the last 4,000 characters of the worker's own log (Claude Code's registration output as the job printed it), the portal tab the extension talks to and the tab the icon was clicked from, when your portal sign-in was last seen, what the last automatic start did, and the last results of its checks |

New:

> | Connection state during this browser session: the worker's name and its folder on the cluster, the job number, what the worker's files last said (its state, its one-line message, the node, the account and plan Claude Code reports, whether your Remote Control answer is on record, the grid's reason for the wait and its estimate, and when it was asked for, got a computer and came online), the session name and its claude.ai link, the last 4,000 characters of the worker's own log (Claude Code's registration output as the job printed it) and the last lines of its progress log; whether your portal answers and whether you are signed in to it, with the account name it showed and when this was checked; a press that waits until the grid can carry it; the tabs the extension opened itself (the grid sign-in tab, Anthropic's sign-in tab, your claude.ai tab, the portal's terminal tab for the one-time step, and, on a portal that does not share its sign-in, the portal tab it works through), so it can close them or bring them forward; what the last automatic start did; and the last results of its checks |

Why: the specification's list of sentences that change ("the tabs the extension opened itself ... so it can close them or bring them forward"), plus what the contract added to session storage: the terminal tab (TERMINAL_TAB_KEY), the claude.ai tab (CLAUDE_TAB_KEY, D15), whether the portal answers and whether you are signed in (GRID_KEY), and a press waiting for the grid (PRESS_KEY). "The tab the icon was clicked from" goes with activeTab. The portal tab stays for tab mode. The status file's new fields (framework 10: reason, expected_start, submitted_at, got_computer_at, online_at) and the progress log are named.

### P15. Table, new session row (Show log)

Old:

> (none: added)

New:

> | A plain-words list of what the extension did in this browser session, for *Show log* (for example, that you signed in to the grid and as which account, that you were approved, and the plan you signed in to Claude with), at most 200 lines | `storage.session`, cleared when the browser closes | so *Show log* can say what happened, beside your worker's own progress log | closing the browser; *Copy log* copies it only when you press it |

Why: the specification's list of sentences that change ("a plain-words activity list for Show log"; ACTIVITY_KEY, ACTIVITY_MAX 200 in keys.ts).

### P16. Table, audit-log row, how you control it

Old:

> | the log under *Details* and on the options page (view, export, clear); it is never transmitted |

New:

> | the log under *Details* and under *Activity* in Settings (show, export, clear); it is never transmitted |

Why: Settings' Activity card (Show, Export, Clear) replaces the options page.

### P17. After the table: the sign-in the browser keeps, the reach check, the Claude report, the clipboard, the QR code and the tour

Old:

> There is no durable secret in the extension's storage, and there is no key: your own sign-in to your portal identifies you. The extension never reads your portal's sign-in cookie: your browser attaches it to requests to that one website, as it does for the portal's own pages. The one thing it reads about you from the portal is the account name the portal's own dashboard page shows for your session; there is nowhere to type a different one. The extension never reads, stores, copies or relays a Claude credential: Claude Code keeps its own sign-in in your cluster account, and the framework reads only Claude Code's yes-or-no answer about whether it is signed in.

New:

> There is no durable secret in the extension's storage, and no key: your own sign-in to your portal identifies you (the one-time step below makes a key in your cluster account, never in your browser). The extension never reads your portal's sign-in: your browser attaches the sign-in it holds (a cookie, or the sign-in it keeps after you type into its own box) to requests to that one website, the extension's own background requests included, until the browser closes. Before you agree to the terms, the extension sends nothing anywhere. After you agree, it asks your portal's address whether it answers, with requests that carry no sign-in or cookie and from which it learns only whether an answer came: once when you agree, every three seconds while it waits for you to turn on your VPN (GlobalProtect at Wayne State), and when you press *Try again*. The one thing it reads about you from the portal is the account name the portal's own dashboard page shows for your session; there is nowhere to type a different one. The extension never reads, stores, copies or relays a Claude credential: Claude Code keeps its own sign-in in your cluster account, and the framework reads only Claude Code's own report of whether it is signed in, with the account and plan that report names. The extension writes to your clipboard only when you press a *Copy* button and when you open the portal's terminal for the one-time step below, to put its one line there; it never reads your clipboard. The QR code for your phone is drawn on your device from your session's link, and the tour is drawn from files in the extension's package: nothing is fetched or sent to show either.

Why: the specification's list of sentences that change for the sign-in sentence and the reach check, widened to every time the reach check runs (moment 2 step 3, the GlobalProtect moment every 3 s, Try again: spec and contract section 12). The "no key" clause now points at the one key there is, in the cluster account (AM2). The Claude-report clause as in LICENSE 5(a). The clipboard sentence: Beethoven writes on Copy (link, prompts, VPN address, log, details) and for the one setup line (AM2), and never reads it. The QR code (nayuki qrcodegen, drawn on the device) and the tour (bundled site figure) are named so that nothing about them is a surprise.

### P18. What goes to your own cluster account: the progress log

Old:

> The framework's settings, the job files, a random per-job token in a file only you can read, and the job's status files.

New:

> The framework's settings, the job files, a random per-job token in a file only you can read, the job's status files, and a plain-words progress log for each worker (when it was asked for, got a computer, came online with its claude.ai link, renewed itself or stopped).

Why: the specification's list of sentences that change ("a plain-words progress log for each worker"; contract section 11).

### P19. What goes to your own cluster account: who writes the Remote Control marker

Old:

> When you make the statement above for a worker, the extension also writes one small file in your account (the framework's own marker, `~/.hpcworker/consent`), one line: the word yes, the time, and the random installation identifier from your browser.

New:

> When you tick the statement in the panel and press *Connect*, the framework writes one small file in your account through the portal's shell (its own marker, `~/.hpcworker/consent`), one line: the word yes, the time, and the random installation identifier from your browser.

Why: the specification's list of sentences that change ("When you tick the statement in the panel and press Connect, the lab's tool writes one small file in your account through the portal's shell"; this text says "the framework", the term the statement defines, for "the lab's tool").

### P20. What goes to your own cluster account: the key step's files

Old:

> Everything there is in your own account under your institution's rules; Licensor has no access to it.

New:

> If your portal's shell asks for your password, the one-time step below adds three things in your account's `~/.ssh` folder: a key of its own (`beethoven_ed25519` and its public half), a marked block in `~/.ssh/config` that has ssh offer that key first when the portal's shell connects you to the login node, and one line in `~/.ssh/authorized_keys` that lets that key in only from your institution's Open OnDemand server; it leaves your own keys and lines as they are. Everything there is in your own account under your institution's rules; Licensor has no access to it.

Why: AM2: the files login-setup writes (contract section 8.2), placed after the Remote Control sentences so that "that answer" still follows the marker it refers to.

### P21. What your portal sees

Old:

> The extension makes requests to your university's Open OnDemand portal, and only to it, using the sign-in your browser already holds: waking the portal's own web server up if it is asleep, opening the portal's shell once to submit a job and closing it, holding the shell open once for the sign-in sitting described below and closing it when the sitting ends, listing and reading files in your own account through the portal's Files app (and reading the version number of your lab's shared copy of the framework) and writing the marker there, listing your jobs, and cancelling a job when you ask. Your institution's logs record those requests as they record any use of the portal; the shell's page token appears in the portal's access log, as it does when you open the shell yourself. The extension never signs in for you and never touches a multi-factor step. It reads no other website and makes no request to claude.ai. When it opens a claude.ai page (your session's link when your worker connects, or the connectors page from the optional step) or Anthropic's sign-in page, it opens it in a new browser tab, as a bookmark would, and runs nothing there.

New:

> The extension makes requests to your university's Open OnDemand portal, and only to it, using the sign-in your browser already holds, from the extension's own background, with no portal tab where your browser allows it: waking the portal's own web server up if it is asleep; reading the dashboard (when the panel opens, on each press that needs the grid, and about once a minute while the panel is open; every two seconds while you sign in); listing and reading your worker's files through the portal's Files app (every five seconds while a worker starts and the panel is open, every thirty seconds while it starts and the panel is closed, and about once a minute otherwise), and reading the version number of your lab's shared copy of the framework; and opening the shell for one command at a time (setting your account up to use the lab's copy; connect, which starts your worker and, when needed, holds the sign-in sitting described below; status, about once a minute while your worker waits for a computer and the panel is open; stop; and mark restricted), and, from *Details*, for the checks and the check job you start there. A shell connection from the extension's background arrives with the extension's own origin (`chrome-extension://...`) in the portal's logs. Your institution's logs record those requests as they record any use of the portal; the shell's page token appears in the portal's access log, as it does when you open the shell yourself. The extension opens the portal in a tab only for you to sign in there (in your browser's own sign-in box, or on the portal's own sign-in page), never sees what you type there, and closes that tab; where your portal does not share its sign-in with the extension, it opens a background tab for one action and closes it. It also opens the portal's own terminal page in a tab for the one-time step below, and your worker's folder in the portal's Files app when you press *Your files*. The extension never signs in for you and never touches a multi-factor step. It reads no other website and makes no request to claude.ai. When it opens a claude.ai page (your session's link when a worker you started is ready, *Open my session* and *New session*, or the connectors page from the optional step) or Anthropic's sign-in page, it opens it in a new browser tab, as a bookmark would, and runs nothing there; it closes Anthropic's sign-in tab once you are signed in, and *Open my session* may bring forward the claude.ai tab it opened itself.

Why: the specification's list of sentences that change, with the cadence made exact from the contract (section 12: 5 s with the panel open, a 30 s alarm with it closed while starting, 60 s otherwise; the dashboard GET of D37; the grid sign-in moment's 2 s tick), the setup line and Details' checks and probe added to the shell list, "Your files" and the terminal tab of AM2 added to the tabs it opens, and "A shell connection from the extension's background" in place of the spec's "The shell connection" because in tab mode the page script on the portal makes it. The Files write ("writing the marker there"), the job listing and the job cancel leave the background path: every write moves to the shell (spec, portal-tab section).

### P22. What happens when you sign in to Claude: the one command, the lines read, the tab closed

Old:

> The extension starts that sitting for you through the portal's shell, reads the short lines the framework prints (that the sitting is running, the address of Anthropic's sign-in page, that it is waiting for the code, and Claude Code's own yes-or-no answer afterwards with the account and plan it reports), opens the sign-in page in a new tab, and shows you one box.

New:

> When Claude Code on your cluster already reports you signed in, no sitting runs. Otherwise the extension starts that sitting for you through the portal's shell, in the same command that starts your worker, reads the short lines the framework prints (that your account is set up, that your Remote Control answer is recorded, that your worker is in line, with its job number and folder, that the sitting is running and still waiting, the address of Anthropic's sign-in page, that it is waiting for the code, and Claude Code's own report afterwards with the account and plan it names), opens the sign-in page in a new tab, and shows you one box.

Why: the specification's list of sentences that change ("in the same command that starts your worker"). The skip (connect --login auto, contract D5) and the framework 10 step and keepalive lines the extension now reads (contract sections 5.3 to 5.5) are named.

### P23. What happens when you sign in to Claude: closing the tab

Old:

> that credential stays in Claude Code's own folder in your cluster account.

New:

> that credential stays in Claude Code's own folder in your cluster account. The extension closes the sign-in tab it opened once Claude Code reports you are signed in, unless that tab has loaded another page since you pasted the code.

Why: the specification's list of sentences that change ("Add: The extension closes the sign-in tab it opened once Claude Code reports you are signed in."), with the rule that limits it.

### P24. New section: when the portal's shell asks for your password (AM2), 1 of 2

Old:

> (none: added)

New:

> ## When the portal's shell asks for your password

Why: AM2: the one-time key step inside the first Connect, replacing the specification's dead end ("The grid asked for a password, which Beethoven never types. Ask your lab lead."). Every statement is from AM2 and contract section 8: the trigger (8.4), the clipboard line and the tab (8.5 step 1), the page script that watches only the title (8.5 step 2, D31), typing only after "I'm in" or the title sign (8.5 step 3), what login-setup does and never does (8.2), the 2-second test, the tab closing and carrying on (8.5 step 4), the address change (AM2), --remove (8.2). The last sentence follows AM2's "label it everywhere as unproven on the grid".

### P25. New section: when the portal's shell asks for your password (AM2), 2 of 2

Old:

> (none: added)

New:

> An account with no key on the cluster may find that the portal's shell asks for a password when the extension opens it. The extension never types a password: it stops before typing anything and, when you next press a button that needs the grid, asks you, once, to open the portal's own terminal page. When you press *Open the grid terminal*, it opens that page (the portal's Shell app) in a tab beside the panel and puts one line on your clipboard. You type your password there yourself, into your institution's own page; the extension never sees it. On that page the extension's page script watches only the page's title, to tell when your shell is up: it listens to no keys, reads nothing the terminal shows and stores nothing from the page. When you press *I'm in*, or the title shows that your shell is up, it types the one line into the terminal for you; where it cannot, you paste it. The line runs `hpcworker login-setup` from your lab's shared copy, in your own account: it makes a key there, lets that key into your account only from the computer the terminal came from, which is your institution's Open OnDemand server, and has ssh offer it when the portal's shell connects you (see *What goes to your own cluster account*). It never reads, changes or prints a key you already have, and never prints a private key. The key never leaves your cluster account: the extension does not see it, keeps nothing about it in your browser and sends nothing about it to anyone; it keeps only which tab it opened, until the browser closes, and whether the shell still asks for a password (see the table above). It then checks every two seconds whether the shell opens without a password, closes the terminal tab it opened once it does, and carries on with what you pressed. If the computer the terminal comes from changes, the shell asks again and the step is offered again. `hpcworker login-setup --remove`, run in a terminal on the cluster, removes the key and both entries. This step is new in this version and has been tried only against the lab's mock portal, not yet on a real cluster by an account without a key.

Why: AM2: the one-time key step inside the first Connect, replacing the specification's dead end ("The grid asked for a password, which Beethoven never types. Ask your lab lead."). Every statement is from AM2 and contract section 8: the trigger (8.4), the clipboard line and the tab (8.5 step 1), the page script that watches only the title (8.5 step 2, D31), typing only after "I'm in" or the title sign (8.5 step 3), what login-setup does and never does (8.2), the 2-second test, the tab closing and carrying on (8.5 step 4), the address change (AM2), --remove (8.2). The last sentence follows AM2's "label it everywhere as unproven on the grid".

### P26. What Anthropic receives: the session title

Old:

> Through Claude Code, which you signed in to with your own account: your prompts, the files the worker reads, and every command's output.

New:

> Through Claude Code, which you signed in to with your own account: your prompts, the files the worker reads, every command's output, and the title your worker's session shows in claude.ai (at Wayne State, "Wayne State grid").

Why: Framework 10 names the Remote Control session from the site profile's session_title ("Wayne State grid") instead of "<site>-<run>"; Claude Code sends that title to Anthropic, and it now names the university in plain words.

### P27. What Anthropic receives: when the facts are shown

Old:

> The extension shows these facts before each job start.

New:

> The extension shows these facts in short form before your first worker starts, with the full text one click away, and a one-line reminder beside *Connect* each time you start one.

Why: the specification's list of sentences that change, with "one click away" for "one tap away" as in LICENSE 5(e).

### P28. What Licensor receives: when the approval is checked

Old:

> and again when you click the icon after a day has passed or after a no

New:

> and again when you open the panel after a day has passed or after a no

Why: the specification's list of sentences that change

### P29. What Licensor receives: the portal's sign-in

Old:

> and the extension never reads your portal's cookie or password;

New:

> and the extension never reads your portal's sign-in, cookie or password;

Why: Wayne State's portal signs in with the browser's own HTTP box (AM1), which is not a cookie.

### P30. What Licensor receives: what stays in the browser

Old:

> - your acceptance record, your statements, your audit log and your settings stay in your browser.

New:

> - your acceptance record, your statements, your audit log, your activity list, your settings and what the extension remembers about your worker stay in your browser.

Why: The new local and session notes (the table's new rows) stay on the device too.

### P31. What Licensor records from the checks (the count and the reason)

Old:

> **What Licensor records from each check.** The account name, the portal hostname, the product, the version, the time, a salted hash of your network address (the address itself is not kept) and the answer given. These lines sit with your access record.

New:

> **What Licensor records from the checks.** One record for each account and product: the account name, the product, and the portal hostname and the version of the latest check; when the account was first and last checked; how many checks there have been; the answer of the latest check and, with a no, the reason the service gave, if any (another installation, another account, a version too old); when the answer last changed; and a salted hash of the network address of the latest check (the address itself is not kept). The service also counts each day's checks per account and per hashed address, to limit them, and deletes those counts after two days. This record sits with your access record.

Why: As LICENSE 10(a): the 10.0.0 review asked that the count and the reason be named; written from the deployed access service (ACCESS_CHECK.md, "What the service records"). The fields sent are unchanged.

### P32. One approved account, one installation: the reviewers' mock account

Old:

> The identifier is random: it is not read from your device or derived from it, and Licensor cannot tell from it which computer it is on.

New:

> The identifier is random: it is not read from your device or derived from it, and Licensor cannot tell from it which computer it is on. One account is the exception: the account the store's reviewers use with the lab's mock portal (`st1234`) is approved only in a check whose portal is on the reviewer's own computer (`localhost`), from any installation, and binds none; from any other portal it is answered as an unknown account is, and nothing is bound or e-mailed.

Why: The access service deployed on 2026-10-01 (9ba36d2) approves the reviewers' mock account only for a localhost portal (worker.js approvedFor, isReviewerMock); the statement now says so.

### P33. Your access record: no public list

Old:

> and the check lines above.

New:

> and the check record above. Licensor does not publish the list of approved accounts: the access service answers about one account at a time.

Why: Since the access service of 2026-10-01 (deployed and checked that day: the public GET /allowlist answers an empty list) and the site's services.json of 9c47d38, the list of approved accounts is no longer published. "Check lines" becomes "check record" as above.

### P34. What is never collected: the password, the terminal page, the key

Old:

> the extension does not collect command text, file paths, prompt content, job output, portal cookies or tokens, the code you paste to sign in to Claude, browsing activity, or anything from claude.ai or any Anthropic page.

New:

> the extension does not collect command text, file paths, prompt content, job output, portal cookies or tokens, your portal password, the code you paste to sign in to Claude, anything the portal's terminal page shows, the key the one-time step makes, browsing activity, or anything from claude.ai or any Anthropic page.

Why: AM2 and AM3: Beethoven never reads, stores or types the university password, reads nothing of the terminal page but its title, and keeps nothing about the key.

### P35. What is never collected: the permissions

Old:

> It has no access to claude.ai, requests no `cookies`, `tabs`, `webRequest`, `nativeMessaging`, `debugger`, `identity` or `clipboardRead` permission, and runs no code fetched from anywhere.

New:

> It has no site permission on claude.ai, claude.com or anthropic.com and never asks for one, requests no `activeTab`, `cookies`, `tabs`, `webRequest`, `nativeMessaging`, `debugger`, `identity` or `clipboardRead` permission, is granted no website when it is installed (it asks for your portal's one website when you press *Agree and continue*, *Use this portal* or *Change* under Settings), and runs no code fetched from anywhere.

Why: The 10.0.0 review: "no access to claude.ai" becomes "no site permission on claude.ai". 11.0.0 drops activeTab and keeps no install-time host (Decision 2, AM3); the one origin is requested from the welcome page's press, "Use this portal" or Settings' Change (contract section 15).

### P36. How Licensor uses and keeps it

Old:

> including the check lines and the installation record,

New:

> including the check record and the installation record,

Why: Follows "What Licensor records from the checks".

### P37. Your choices and rights: removing the key

Old:

> Remove the site permission or uninstall the extension at any time;

New:

> Remove the site permission or uninstall the extension at any time; remove the key of the one-time step from your cluster account with `hpcworker login-setup --remove`;

Why: AM2: the step is undone by login-setup --remove.

### P38. Changes: version 9 entry

Old:

> (none: added)

New:

> Version 9 (2026-10-01, Beethoven 11.0.0): the agreement is accepted on a welcome page with one box and one button, with no typed name; the acceptance record now holds the summary and the sentence shown, whether you opened, scrolled to the end of, saved or printed the full text, and, once your portal first shows it, your account name. The extension now reaches your portal from its own background, on the sign-in your browser keeps, and opens a portal tab only for you to sign in, closing it afterwards, or, on a portal that does not share its sign-in, in the background for one action; after you agree, and before you sign in, it checks whether your portal answers, with requests that carry no sign-in. One command starts your worker and, when needed, the Claude sign-in, and writes your Remote Control answer; the framework keeps a plain-words progress log for each worker. Where the portal's shell asks for a password, a one-time step makes a key in your cluster account that only your institution's Open OnDemand server can use; you type your password into the portal's own terminal page, and the extension never sees it and keeps nothing about the key. New on your device: your worker's last known state and link, how the extension reaches your portal, your last five waits, the tour and the one-time tips seen, an activity list for Show log, the tabs it opened itself, and your appearance choice; the note of the tab the toolbar button was clicked from is gone, with the activeTab permission. The QR code for your phone and the tour are drawn on your device. The statement now names what the access service keeps from the checks (how many, and the reason given with a no), the reviewers' mock account, and that the list of approved accounts is not published, and says "no site permission on claude.ai" where it said "no access". Nothing new reaches Licensor.

Why: the specification's list of sentences that change ("Add a 'Version 9 (Beethoven 11.0.0)' entry under Changes that summarises the items below").

## THIRD_PARTY_NOTICES.md

### T1. Item 4, the QR code generator

Old:

> (none: added)

New:

> 4. QR Code generator library, TypeScript edition, by Project Nayuki (https://www.nayuki.io/page/qr-code-generator-library; source at https://github.com/nayuki/QR-Code-generator), in a shortened port (byte mode and error correction level M only) kept in the extension's source. It draws the QR code of your session's link on the panel's Phone card, on your device. It is compiled into the panel's script, from which the build removes every comment, so its notice is kept here. MIT License.
>
> Copyright (c) Project Nayuki. (MIT License)
> https://www.nayuki.io/page/qr-code-generator-library
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
> - The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
> - The Software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose and noninfringement. In no event shall the authors or copyright holders be liable for any claim, damages or other liability, whether in an action of contract, tort or otherwise, arising from, out of or in connection with the Software or the use or other dealings in the Software.

Why: The specification's Phone card draws the QR code on the device with nayuki qrcodegen (MIT; the spec's home panel, item 4, and its file list, which names src/vendor/qrcodegen.ts). The MIT condition requires the notice in every copy; the bundle is minified with every comment removed (test/hygiene.test.ts), so the notice must ship in this file. The copyright and permission text is the header of Nayuki's TypeScript source (scratchpad v11/channel/qr/qrcodegen.ts), word for word, re-wrapped; it is the same in the pages stream's port, extension/src/vendor/qrcodegen.ts, which calls itself 'a compact port' (byte mode, error correction level M), so the item says it is a shortened port.

### T2. After the list, the tour's figure

Old:

> (none: added)

New:

> The tour in the panel ("See what it can do") shows the figure from the home page of the lab's own website, https://openspineconsortium.com/: its drawing and its style sheet, copied into the package for the tour, with the label "H200 GPU" shortened to "GPU". It is Licensor's own work, not third-party material, and is part of Beethoven under the Beethoven agreement; the website's source, where the figure first appeared, is also published under the Apache License, Version 2.0.

Why: The spec's tour reuses the website's home-page figure (diagram.js and diagram.css synced from tools/pages/index/body.html and assets/css/hero.css, "H200 GPU" relabelled "GPU"). It is the lab's own work: both website files have one author in git, Gregory Schwing, and the website's NOTICE reads "Copyright 2026 Gregory Schwing and the OpenSpine Consortium contributors", Apache License 2.0. It is not third-party material, but the brief for this build asked that the notices say it is reused, and saying where it comes from avoids a reader taking it for someone else's.

## The two-tick variant (`TWO_TICKS`, shipped switched off)

The spec's Decision 1 keeps a second, separate, unticked box ready for counsel. Greg chose one tick
(AM3). If the second box is ever switched on, these sentences replace the shipping ones, and because
the text then changes, the agreement becomes version 9 with a new date (whole numbers only) and
everyone accepts again.

- The second box itself (spec): "I specifically accept the dispute terms (no jury trial, no class
  actions) and the known risks (sections 8, 19 and 20)."
- Opening paragraph: "you tick the box beside the sentence that names this agreement" becomes "you
  tick its two boxes", and "the four-line summary and the sentence shown, that you ticked it"
  becomes "the four-line summary and the sentences shown, that you ticked them".
- Section 8: "as Known Risks named on the welcome page, above the box you tick" becomes "as Known
  Risks named on the welcome page and in the second box you tick there"; "This section is one of the
  terms named in the sentence you tick on the welcome page." becomes "This section is one of the
  terms that you specifically accept with the second box on the welcome page."
- Section 19, first paragraph: "and is one of the terms named in the sentence you tick on the
  welcome page." becomes "and is one of the terms that you specifically accept with the second box
  on the welcome page."
- Section 20, last sentence: as section 8.
- PRIVACY, the acceptance row: "the sentence shown with the box, that you ticked it" becomes "the
  sentences shown with the two boxes, that you ticked them".

## Where these texts depart from the spec's list, and why

- **5(b): the portal tab in tab mode.** The spec's sentence "closes that tab once you are signed in"
  is true only in direct mode; its own portal-tab section keeps the sign-in tab, out of the way,
  until the work ends on a portal that does not share its sign-in. The text says both.
- **5(b) and PRIVACY: where the student signs in.** The spec says "in your browser's own sign-in
  box", which is Wayne State's portal (HTTP Basic, AM1). The agreement covers any portal, and a
  cookie portal (tab mode) signs in on its own page, so both texts say "in your browser's own
  sign-in box, or on the portal's own sign-in page".
- **5(b) and 5(f): the one-time key step (AM2).** The spec's dead end ("The grid asked for a
  password, which Beethoven never types. Ask your lab lead.") is replaced by AM2, so 5(b) describes
  the step and 5(f) can no longer say the page script runs "only where your portal does not share
  its sign-in": it also runs, once, on the portal's terminal page (contract section 2, item 3).
- **"one click away" for the spec's "one tap away"** in LICENSE 5(e) and PRIVACY's Anthropic
  section, to match "one click away" in the agreement's opening paragraph.
- **"the framework" for the spec's "the lab's tool"** in PRIVACY's cluster-account section: the
  statement defines "the framework" in its third paragraph.
- **The acceptance record's list is completed** from the spec's own TermsRecord v2 (the spec's
  sentence named about half of its fields), in LICENSE's opening paragraph, 10(c) and PRIVACY's
  table, as the task asked.
- **The claude.ai tab** is listed with the session rows, not in the new local row: the contract
  keeps its id in session storage (D15).
- **Cadence.** The spec's "about once a minute otherwise" for the file listing is untrue while a
  worker starts with the panel closed (a 30-second alarm, contract section 12); the text gives the
  three rates.
- **"A shell connection from the extension's background"** for the spec's "The shell connection":
  in tab mode the page script on the portal makes it, with the portal's own origin.

## Sentences I am unsure about (for Greg and for counsel)

1. **One tick and "specifically consented"** (MCL 445.903(1)(t); the spec's Decision 1 and risk 5).
   Sections 8, 19 and 20 now rest on "the sentence you tick", whose soft line names "giving up a
   jury trial and class actions, and accepting the risks above". It does not name the notice-and-cure
   requirement, the one-year limit, the warranty disclaimer or the liability limits, which 10.0.0's
   separate box named. The two-tick variant above is ready.
2. **Section 8, "Known Risks named on the welcome page, above the box you tick".** The welcome
   page's summary names three parties ("The grid, Anthropic or the browser store can stop it working
   at any time. You accept that risk."), not the three events section 8 lists (Remote Control
   eligibility; the portal's shell, files or reverse proxy; a store removing the extension). The full
   text is one click away. Either the summary line names the events or counsel accepts this.
3. **Sections 19 and 20 were edited**, but only in the sentence that says how the term is
   acknowledged. Section 17 says "A change to section 19 or 20 applies only to disputes that arise
   after you accept it", and the lab's research report wants a typed name "for any re-acceptance of
   changed dispute terms". I read the dispute terms as unchanged; counsel should confirm that this
   edit is not a change to them.
4. **No typed name.** At the moment of acceptance the record names an installation, not a person;
   the account name is added when the first grid sign-in shows it, and the record says so. The
   research report says a click adopted with intent is a signature under UETA.
5. **19(a), "the install id shown with the acceptance record on Beethoven's settings page".** The
   contract's `SettingsView.agreement` (model.ts) carries only the acceptance date and the Show,
   Save and Print controls, not the install id. Unless the pages stream shows it there (and in the
   saved copy), this sentence, which a notice under 19(a) relies on, is untrue.
6. **4(a), "nothing beyond a job submission may run on a login node"**, which the student promises
   to keep. Beethoven itself runs more than a submission there: `connect` waits on the login node up
   to 14 minutes for the sign-in computer (as 10.0.0's sign-in sitting already did), and status,
   stop, restrict, the setup line and the student's own `login-setup` run there briefly. Left
   unchanged, because 11.0.0 does not change it in kind.
7. **The key step and Wayne State's rules (AM2).** The spec itself argued that "a key in
   authorized_keys is a durable credential that would skip the grid's password-each-time rule". The
   AM2 key is made by the student in their own account and opens it only from the OnDemand server,
   but the portal's shell then opens without the password. The texts describe the step; they do not
   say the university allows it. Greg (and C&IT if needed) should confirm before a student meets it.
8. **"opens your account only from ... your institution's Open OnDemand server".** True if the
   client address the login node sees (SSH_CONNECTION) is that server's alone. Behind address
   translation, or on an address shared with other machines, "only from" is wider than it reads.
   Not seen on the grid (contract 8.1).
9. **PRIVACY says the step "has been tried only against the lab's mock portal, not yet on a real
   cluster by an account without a key"** (AM2: label it unproven everywhere). When a student without
   a key has tried it, that sentence must change, which is privacy statement version 10. LICENSE
   describes the step without that clause; section 12 already disclaims performance.
10. **Retention of the check records.** Both texts keep "the other records for the life of your
    access and six years after", but the access service deletes `seen:<product>:<id>` when an
    account is removed and a conflict record twelve months after its last refusal, and keeps the day
    counters two days. The texts now describe what a check record holds; the retention sentence is
    unchanged and does not match the service. For Greg.
11. **Section 15, the institution's name.** The new sentence says Beethoven uses the institution's
    name only in plain words ("Wayne State grid") and names GlobalProtect as Palo Alto Networks'
    mark. A question of nominative use for counsel. Other marks shown in passing (Chrome, Google
    Drive, Slurm in an example prompt) were already shown or are not named here.
12. **Section 18, export.** "The Extension contains cryptography used only to verify signatures" was
    already narrower than the code before 11.0.0 (it also computes SHA-256 digests for the acceptance
    record); only the Framework's ssh key was added. Left for counsel.
13. **5(e), "in short form".** The four short lines fold "the transcript is stored on Anthropic's
    servers" into "Anthropic keeps the chat under your plan" and say "health" for protected health
    information; the seven full sentences are one click away under "More about your data". Whether
    that meets 5(e)'s purpose is for counsel.
14. **Rows to check against the core stream when it lands.** PRIVACY lists, from keys.ts and the
    spec: the last lines of the progress log in session storage; the check job "submitted from
    Details" (PROBE_KEY); the note of the last Claude sign-in (LOGIN_SEEN_KEY); what the last
    automatic start did (AUTO_START_KEY). If the core stream stops writing one, its words must go
    from the table. If it keeps something the table does not name, a row must be added.
15. **"Nothing new reaches Licensor"** (the version 9 entry) rests on AM7: the approval check's
    fields are unchanged and the reach check goes to the portal, not to Licensor.
16. **The tour's figure** is said to be Licensor's own work under the Beethoven agreement, and the
    website's source is also published under the Apache License 2.0. Both website files have one
    author in git (Gregory Schwing); the website's NOTICE says "Gregory Schwing and the OpenSpine
    Consortium contributors". If anyone else drew part of the figure, the notice must say so.
17. **"Settings (in the panel's *More* menu)".** The menu button shows a glyph that is not ASCII; its
    accessible name is "More". If the pages stream labels it otherwise, this changes.

## Outside these four files: what must change to match

Not edited here (other streams' files, or other repositories):

- `extension/src/core/terms.ts`: TERMS_VERSION 8 and TERMS_DATE '2026-10-01' (AM6); the build stops
  if they disagree with `LICENSE.txt`'s first line.
- `extension/src/core/model.ts` / the Settings page: show the install id with the acceptance record
  (19(a); item 5 above).
- `extension/test/terms.test.ts`: it expects the 10.0.0 tick (`read_agree`, naming "(version N,
  date)"); the 11.0.0 tick does not name the version.
- `extension/test/hygiene.test.ts`: the package allow-list must admit the tour's files and the lit
  icons (`icon/on-*.png`), and the permission test must drop `activeTab`.
- `extension/wxt.config.ts` header comment, `docs/store/LISTING.md` and `PASTE.md`: `scripting` is
  used for tab mode *and* for the one-time terminal step (contract section 20).
- The repository's `CLAUDE.md`, "Terms": updated in the integration pass (version 8 and 9,
  TERMS_VERSION 8).
- The website: `beethoven/terms.html` and `privacy.html` regenerated from these texts; the site's
  copy of the third-party notices, if it carries one.
- Beethoven for VS Code (another repository): its privacy statement version 5 still says it fetches
  the approved list, which the access service stopped publishing on 2026-10-01.

## After the review (the integration pass, 2026-10-01)

The verifier of the cluster tool and the texts, and the code review, found sentences in version 8
and version 9 that the build did not bear out. They were corrected in place, without a new version
number: neither text has been published or accepted by anyone yet, and both stay version 8 and 9 of
2026-10-01. The hashes in the acceptance record are of the corrected files. The copies in
`extension/public/` were synced by the build; the package's copies are byte-identical to these.

**LICENSE.txt (version 8)**
- Sections 3(a) and 10(a): the approval is first checked "when you first sign in to your portal after
  accepting it", not "when you connect" (the first check comes with the first sign-in).
- Section 5(b), the one-time key step: the key is let in from the address the terminal came from,
  "which at your institution is its Open OnDemand server"; the key is a file in your own account,
  hidden from Claude Code inside your worker, and anyone who obtained it and could connect from that
  server could use it; the step has been tried only against Licensor's mock portal.
- Section 5(f): the plans page is named among the pages opened (the welcome page's "See plans").

**PRIVACY.md (version 9)**
- The acceptance row: an acceptance made with an earlier version is kept beside the new one, out of
  force; the saved copy is in Settings (*Save your acceptance record*, shown with the installation
  identifier).
- The note of the last Claude sign-in is gone from the local rows (11.0.0 does not keep it); the
  claude.ai link opened once is kept with the session's connection state, not in local storage.
- The small notes row: when the worker was first seen online (Try asking shows for three days from
  then) and whether the tour began during the first wait.
- The session row: that you pressed *Agree and continue*, for a few minutes, and how far this
  computer's clock is from the grid's.
- What goes to your own cluster account: `~/.ssh` and `authorized_keys` made readable by you alone, a
  link refused, the key hidden from Claude Code, the restricted marker, the sign-in sitting's last line
  kept under `~/.hpcworker/log` while *Connect* runs, and the marker that keeps a waiting worker from
  giving up while you are on Anthropic's page.
- How the portal is reached: the shell test once after the first sign-in (nothing typed but `exit`),
  the tests during the key step, and that the extension types only once the shell shows its prompt,
  never at a password prompt.
- The key step's re-test: every two seconds for ten seconds, then every ten seconds for up to five
  minutes, each a sign-in that stops at the password prompt in the login node's records.
- The approval check's timing, as in the agreement.

`final/LICENSE.before-integration.txt` and `final/PRIVACY.before-integration.md` in the build
session's scratchpad hold the texts as they were before these corrections.
