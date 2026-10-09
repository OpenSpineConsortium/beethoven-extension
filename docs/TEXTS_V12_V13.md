# Beethoven texts for 19.0.0: agreement version 12, privacy statement version 13

Drafted 2026-10-09 for Greg and for counsel, by the texts stream (stage A4, the agreement half) of
the 19.0.0 build. **This is drafting, not legal advice.** No lawyer has read these texts or this
note; the questions at the end are for one.

What changed, in one paragraph: `LICENSE.txt` goes from version 11 (2026-10-08) to version 12
(2026-10-09) and `PRIVACY.md` from version 12 to version 13 (2026-10-09), because Beethoven 19.0.0
signs in to the grid (greg's card tap of 2026-10-09 03:01:45Z, option B, "Beethoven signs in":
"Beethoven keeps the password behind a passkey and signs in with no tab at all; reverses three
rules, new terms, store re-review"). In Chrome the panel shows Beethoven's own sign-in sheet for the
AccessID and password; the extension answers the portal's HTTP Basic challenge of its own background
dashboard request through `webRequest.onAuthRequired` (the permissions `webRequest` and
`webRequestAuthProvider`), on the one granted portal origin, once per check, and never a tab's, a
proxy's, another origin's or another realm's challenge; a password the grid turns down is sent at
most once by Beethoven and stops every automatic sign-in until the student types it again; saving it
is optional and off unless ticked, and a saved password is kept only as AES-GCM ciphertext under a
key derived from a passkey's PRF output, which lives in memory only. The texts reverse what
agreement 8 to 11 and privacy statement 9 to 12 said on this point ("never reads, stores or types a
portal password", "never signs in for you", "There is no durable secret", "never asks for your
cluster password", no `webRequest`), state the at-most-one-try rule, Chrome's own re-sends, the
institution's possible lockout, that saving is optional and that section 4(a) applies to it, where
the passkey lives and that Chrome stays signed in until it closes, and keep 18.0.0's tab path
(Chrome's own box) as the fallback and the only way where the extension cannot answer the portal's
request for a sign-in. They tell the old passkey of 12.0.0 to 15.0.0 apart from the new one. Every
dispute, liability and risk term is unchanged word for word, and so are the section numbers 1 to 23;
the new material sits inside 5(b)(i), so the citations of 5(b)(i) and 5(b)(ii) elsewhere still hold.
Nothing new reaches Licensor.

Sources: greg's card taps of 2026-10-09 03:01:45Z (option B) and 03:02:21Z ("Keep side panel"), and
his asks of 01:29Z and 01:38Z; the 19.0.0 build contract (revision 2, which folds in the 40 findings
of its four-lens design review), sections 1 to 6, which governs where the earlier survey of text
change points differs from it; the stage A code in the working tree (`extension/src/core/vault.ts`:
the passkey's user name `${username} (grid)`, `authenticatorAttachment: 'platform'`,
`userVerification: 'required'`, AES-GCM-256 under HKDF-SHA-256 with the info 'Beethoven grid sign-in
v1'; `extension/src/core/gridsignin.ts`: `authVerdict`'s order, `ONCE_MS` 120 000, `unlockWord`);
Wayne State's pages as the search index gave them on 2026-10-09 (KB 20082, "an account is disabled
after the fifth unsuccessful login", reactivation "within three business days"; the Strong Password
Standard, `https://tech.wayne.edu/policies/password-standard`: "Never save passwords in web browsers
or computer programs; instead, type them in each time you need them."; neither page opened from the
session); `TEXTS_V9_V10.md` for 12.0.0's wording of a password, a passkey and who could use a stored
secret; `TEXTS_V11_V12.md` for the record's shape. The background and the pages (stage B) were built
at the same time as these texts; where a sentence rests on their code, its entry below said
**CONFIRM** and what to check, and now says **Confirmed** with where (each read against the code and
its test on 2026-10-09, after every stage had finished). The texts were edited by one script from
one list of edits, and this note is generated from the same list, so the quotations below are
exactly what changed (paragraphs are quoted unwrapped; in the files each touched paragraph was
re-wrapped at 100 columns, the table's rows stay one line each). The second review of 2026-10-09
corrected both texts in place, with no new version (*Corrected in place after the second review*,
below): the quotations of L5, P5, P6, P12 and P16 show them as corrected, and that section says what
moved and why.

Kept as they were:

-  Both texts stay plain ASCII with LF line endings. The agreement's version line is `Version 12,
  2026-10-09.` at the start of a line, as `extension/scripts/sync-profiles.mjs` and
  `extension/test/terms.test.ts` read it; the privacy statement's is `Version 13, 2026-10-09.`,
  which `terms.test.ts` now reads too.
-  The welcome page's summary lines 1, 2 and 4 (`SUMMARY` in `extension/src/core/terms.ts`) and the
  tick's sentence, word for word; line 3 changed with the fourth Known Risk (L13), and with it
  `summary_sha256`. Line 2 ("To check your approval, it sends the lab your AccessID and an ID for
  this browser.") stays true: nothing new reaches
  Licensor. The password is consented to in the sheet, by typing it and pressing *Sign in*, which
  5(b)(i) says in terms; saving it takes a box that is never ticked for the student.
-  Section 8's first three Known Risks (Anthropic and Remote Control eligibility; the university and
  Open OnDemand's shell, files or reverse proxy; a browser store), and sections 2, 3, 4, 6, 7, 9,
  11, 12, 13, 14, 16, 17 and 19 to 23, word for word; the changes are in sections 1, 5, 8, 10, 15
  and 18 only. The at-most-one-try rule and Chrome's re-sends are stated in 5(b)(i) as behaviour;
  the institution's lockout is stated there and, since greg's card answer "Add it now"
  (2026-10-09 16:28Z), is section 8's fourth Known Risk (L13).
-  Section 3(a) ("There is no key and no password of Licensor's: your own sign-in to your
  institution's cluster identifies you"; "only once your cluster has accepted your sign-in to your
  portal") stays true whoever makes the sign-in. Section 4(a) (the institution's rules for its
  portal and computing systems, a breach of which is a breach of the agreement) already covers an
  institution's password rules; 5(b)(i) now says it applies to the choice to save. Section 7(a)
  already names the portal and the institution's policies as dependencies.
-  5(b)(i)'s account of the 11.0.0 one-time login-setup step, but for the clause "not even a
  password you gave it for the sign-in above" (the AM2 prompt is out of 19.0.0's scope; Beethoven
  still never types a password into a shell), and 5(f), whose "only page script" sentence stays
  true: the answer goes through the browser's webRequest event, not a page script.
-  `TERMS_VERSION` becomes 12 and `TERMS_DATE` '2026-10-09' in `extension/src/core/terms.ts`, and a
  version 11 acceptance stays in the history, out of force, so everyone accepts once more (the
  welcome page shows the changed agreement again, as for 12.0.0, 15.0.0 and 16.0.0). The
  `agreement-texts` export in `interface/INTERFACE.json` stays at version 1 (the files' names and
  shape are the same). `THIRD_PARTY_NOTICES.md` is unchanged: the passkey and encryption code is
  Licensor's own and uses the browser's WebCrypto, and no package was added.

The words used: the texts say "the Extension's own sign-in" and "sign-in sheet", and quote the
screen's labels: *Remember it on this computer*, *Sign in*, *Use Chrome's sign-in box instead*, *Not
now*, and *Forget* beside *Grid sign-in* in Settings. The new passkey is named by example, "ab1234
(grid)", or as "your account name followed by (grid)", never with angle brackets, because the
website renders `PRIVACY.md` with pandoc, which takes `<...>` for HTML. Invariant I1's sentence is
in the privacy statement word for word ("Chrome re-sends its cached copy once for each request
already started with it before the first refusal comes back; Beethoven then sends at most one; when
the answered request is abandoned before the grid replies, Chrome may re-send that copy once. How
many of these the grid counts is not yet measured."), and in the agreement in its own terms ("your
browser" for Chrome, "the Extension" for Beethoven, "your cluster" for the grid), since the
agreement covers whatever browser runs the listing's package. The lockout is said generally ("Your
institution may disable your account after a few wrong passwords, and getting it back may take
days"); Wayne State's numbers stay out of the texts because the pages were read from a search index
only.

## The agreement (`LICENSE.txt`), version 11 to 12

### L1. Head, version line

Old:

> Version 11, 2026-10-08. Applies to the Trial Edition of Beethoven 16.0.0 and later versions that ship this text

New:

> Version 12, 2026-10-09. Applies to the Trial Edition of Beethoven 19.0.0 and later versions that ship this text

Why: Spec A4: LICENSE version 12 dated 2026-10-09, the day of greg's card tap (03:01Z), for 19.0.0.
extension/scripts/sync-profiles.mjs and extension/test/terms.test.ts read this line as /^Version
(\d+), (\d{4}-\d{2}-\d{2})\./ and stop unless TERMS_VERSION and TERMS_DATE are 12 and '2026-10-09'.
17.0.0 and 18.0.0 shipped without a new version because neither touched the password; the head line
said 16.0.0 until now.

### L2. Section 1, the session the Extension works in

Old:

> through your institution's Open OnDemand portal, in the browser session you have signed in to there; the job runs Claude Code,

New:

> through your institution's Open OnDemand portal, in a browser session signed in to there, by you or, with the account name and password you give it, by the Extension (section 5(b)(i)); the job runs Claude Code,

Why: The session is no longer only one the student signed in to: on Chrome the Extension signs in
with the AccessID and password typed into its sheet (spec 5.3, 6.3).

### L3. Section 1, "your account name" is still the dashboard's, never the typed one

Old:

> as the cluster confirms it when you sign in: the name your portal's dashboard shows for the session you signed in to. It is the only identifier of you that Beethoven uses (the Extension also names its own installation with a random number, section 3(e)).

New:

> as the cluster confirms it when you or the Extension signs in: the name your portal's dashboard shows for that session. It is the only identifier of you that Beethoven uses to know who you are (the Extension also names its own installation with a random number, section 3(e)); an account name you type to sign in (section 5(b)(i)) is used only to sign in.

Why: Invariant I7: the approval check still uses the account name the dashboard shows, never the
typed AccessID, which is only the sign-in's user name. Without the last clause, "the only identifier
of you that Beethoven uses" would be false, since the typed AccessID is now used (and kept, in the
note and the saved record).

### L4. Section 5(b), the one way, and the new sheet told apart from the direct way

Old:

> (b) Your sign-in to your cluster. The Extension reaches your cluster in one way: through your institution's Open OnDemand portal, in the browser session you have signed in to there, which may need your institution's VPN (at Wayne State, GlobalProtect). It never signs in to Claude for you (see (a)). Versions 12.0.0 to 15.0.0 of the Extension also offered a direct way over ssh, through a helper program (the "Bridge") installed on your computer, a sign-in sheet of the Extension's own and a key kept in your browser; this version has none of that, and (ii) says what it leaves alone.

New:

> (b) Your sign-in to your cluster. The Extension reaches your cluster in one way: through your institution's Open OnDemand portal, which may need your institution's VPN (at Wayne State, GlobalProtect), in a browser session signed in to there. It signs in to your portal for you with the account name and password you give it, or uses the sign-in you make yourself in your browser's own sign-in box, as (i) says. It never signs in to Claude for you (see (a)). Versions 12.0.0 to 15.0.0 of the Extension also offered a direct way over ssh, through a helper program (the "Bridge") installed on your computer, a sign-in sheet of the Extension's own and a key kept in your browser; this version has no Bridge, no ssh connection of its own and no such key, and (ii) says what it leaves alone. The sign-in sheet of (i) is not that way: it signs in to your portal only, over the same connection as everything else the Extension does there, which still needs your institution's VPN where it requires one, and it asks for no verification code.

Why: "this version has none of that" became false (a sign-in sheet of the Extension's own is back).
The spec's CLAUDE.md wording, "19.0.0's sign-in sheet is not the direct way: no ssh, no bridge, no
one-time code, and the VPN is still needed", is carried here in the agreement's words.

### L5. Section 5(b)(i), Your portal: Beethoven's own sign-in, one wrong password at most, saving, Chrome's memory, the box

Old:

> (i) Your portal. The Extension uses the sign-in your browser already holds for your institution's Open OnDemand portal, on that one website only, from its own background and without a portal tab where your browser allows it. It never reads that sign-in, never reads, stores or types a portal password, never signs in for you and never touches a multi-factor step. When the portal asks for a sign-in, the Extension opens the portal in a tab for you to sign in there (in your browser's own sign-in box, or on the portal's own sign-in page), never sees what you type there, and closes that tab once you are signed in, while it is still on the portal. Where your portal does not share its sign-in with the Extension, it keeps that tab behind your other tabs until the work in hand is done and then closes it, and for a later action opens the portal in a background tab and closes it again. The one thing it reads about you from the portal is your account name, from the portal's own dashboard page. If your portal's shell asks for your cluster password, as it may for an account that has no key on the cluster, the Extension types nothing there and offers a one-time step instead:

New:

> (i) Your portal. The Extension makes its requests to your institution's Open OnDemand portal, on that one website only, from its own background and without a portal tab where your browser allows it, with the sign-in your browser holds for that website. It never reads that sign-in and never touches a multi-factor step. When the portal asks for a sign-in, the Extension signs in for you with the password you give it, or you sign in yourself in your browser's own sign-in box.
>
> The Extension's own sign-in. Where your browser lets the Extension answer a website's request for a sign-in, as Chrome does, it asks for your account name and your cluster password on its own sign-in sheet, in its panel, whenever your portal wants a sign-in. By typing them there and pressing "Sign in" you ask the Extension to sign in to your portal for you with them, and agree that it may. It answers, through your browser and not with a page script, only the portal's request for a sign-in that its own background reading of your portal's dashboard page receives, at most once each time it checks whether you are signed in, and only when that request comes from your one portal website itself, not from a proxy, asks for the portal's plain ("Basic") sign-in and, once a password the Extension gave has worked, in this browser session or, for the saved password, at any time since it was saved, names the same sign-in realm as that one; a sign-in in your browser's own box records no realm, and Forget, Disconnect and a change of portal remove the one on record. It never answers such a request from one of your browser tabs, which gets your browser's own sign-in box, nor from a proxy, another website or another realm, nor for the checks that ask whether your portal answers, which carry no sign-in. Of your own portal tabs' requests it keeps one mark only, and only while an answer it gave still waits for its outcome: that one of those tabs asked for a sign-in, or had a request answered by your portal without a refusal, meanwhile (see "One wrong password at most"); it keeps nothing about the tab or the request itself. It sends your password only to your portal, over the encrypted connection, as your browser's own box would; never to Licensor or anyone else. It never writes the password to a log, the audit log or the activity list, and keeps it only as the next paragraphs say. It never fills in a sign-in web page or your institution's identity provider, and never types a password into a shell (see the one-time step below). The account name you type is used only to sign in: the account name of section 1, which the approval check sends, is still the one your portal's dashboard shows.
>
> One wrong password at most. The Extension sends a password your cluster turns down at most once. The first refusal stops every sign-in the Extension makes by itself, with a saved password or one you have just typed, until you type the password again on the sheet, and a saved password your cluster turned down is not tried again after a restart of the Extension or of your browser; the sheet then asks you to check the password before you try again. Where the Extension cannot tell whether a password it gave worked, because your browser closed, or the Extension updated or reloaded, before your cluster replied, or because one of your portal tabs asked for a sign-in or had a request answered while that answer waited (you may have signed in in your browser's own box, and your browser may have used that password for the Extension's request as well), it counts the try as neither a success nor a refusal and puts a saved password on hold: the Extension does not send it again until a password you type on the sheet works, or you save one again. Your browser also keeps its own copy of a password it is given (see below) and sends it again by itself: when your cluster turns that password down, your browser re-sends its cached copy once for each request already started with it before the first refusal comes back; the Extension then sends at most one; when the answered request is abandoned before your cluster replies, your browser may re-send that copy once. How many of these your cluster counts is not yet measured. Your institution may disable your account after a few wrong passwords, and getting it back may take days; a password you have just changed may not work everywhere yet.
>
> Saving the password. Saving it is optional and off unless you tick the box "Remember it on this computer" on the sheet; the box is never ticked for you. Section 4(a) applies to that choice: where your institution says to type your password each time you need it, as Wayne State's password standard does, leave the box unticked. Unticked, the Extension keeps the password only in your browser's memory, for that one sign-in, and removes it afterwards, whether or not it worked, and at the latest two minutes after you pressed "Sign in". Ticked, the Extension has your computer make a passkey for it, unlocked with Windows Hello, Touch ID or your screen lock and named with your account name followed by "(grid)" (for example, "ab1234 (grid)"), and keeps the password in this browser profile, on this computer only, encrypted under a key that only that passkey releases. To use it you unlock it with the passkey, once each time you open your browser, when the Extension next needs your portal; what the passkey released stays in your browser's memory until the browser closes or the Extension updates or reloads, and the Extension then signs in with it when your portal asks, also while none of its pages is open. The passkey is kept by Windows Hello, your Mac's Passwords app (iCloud Keychain) or Chrome's password manager, not by the Extension; that store may keep it in your Google account or in iCloud and offer it on your other devices, but the saved password itself stays only in this browser profile. Someone who can use this browser profile while the saved password is unlocked, or who can unlock your passkey, could sign in to your portal with it, and so could the Extension's own code. Where your computer's passkey cannot lock a password, the Extension says so, uses the password for that one sign-in and from then on offers no box. "Forget", beside "Grid sign-in" in the Extension's Settings, deletes the saved password and everything the Extension keeps about it; Disconnect and changing to another portal do the same, and uninstalling the Extension removes it with the rest of its data. Forget may ask your passkey store to remove the passkey, but some stores keep it: your list of passkeys may still show it, and you can delete it there, after Forget. If a password you typed works while your saved one is turned down or on hold, the Extension forgets the saved one by itself, unless it can tell that the saved one is the same password, which it then keeps and uses again.
>
> Your browser stays signed in. Once your cluster has accepted a password the Extension gave it, your browser keeps it in its memory, as it keeps one you type into its own box, and sends it to your portal from your own portal tabs as well, until the browser closes or you clear its browsing data with cookies; Forget and Disconnect do not end that.
>
> Your browser's own sign-in box. "Use Chrome's sign-in box instead", on the sheet, opens the portal in a tab for you to sign in there, in your browser's own sign-in box or on the portal's own sign-in page; where the Extension cannot answer your portal's request for a sign-in, this is the only way. That includes a portal that sends you to your institution's own sign-in page instead of asking your browser for a password: the sheet may still appear there, but the Extension sends no password typed on it. The Extension never sees what you type in that tab, and closes it once you are signed in, while it is still on the portal. Your browser may offer to save what you type there; that offer, and where your browser keeps what it saves, are your browser's own, and section 4(a) applies to them too. Where your portal does not share its sign-in with the Extension, it keeps that tab behind your other tabs until the work in hand is done and then closes it, and for a later action opens the portal in a background tab and closes it again.
>
> The one thing it reads about you from the portal is your account name, from the portal's own dashboard page. If your portal's shell asks for your cluster password, as it may for an account that has no key on the cluster, the Extension types nothing there, not even a password you gave it for the sign-in above, and offers a one-time step instead:

Why: The core reversal (greg's card tap, option B, 2026-10-09 03:01:45Z: "Beethoven keeps the
password behind a passkey and signs in with no tab at all"; it reverses AM3's "never reads, stores
or types a portal password" of 11.0.0). Built from the spec, not from the map: the narrow answer is
I2 and 5.3 (tabId -1, the extension as initiator, the portal's origin, Basic, not a proxy, the
recorded realm, one answer per armed window; never a tab, a proxy, another origin or realm, or the
credential-free reach probe); the one-wrong-try rule is I1, with I1's sentence word for word in
substance ("your browser" for Chrome, "the Extension" for Beethoven, "your cluster" for the grid, in
the agreement's terms); the lockout is stated as behaviour and not as an assumed risk (A4; section 8
is unchanged); saving is I5 (never pre-ticked; unticked, storage.session for one attempt and at most
two minutes, ONCE_MS); the passkey is A1's (user.name "<AccessID> (grid)", platform authenticator,
user verification required, the password sealed with AES-GCM-256 under HKDF-SHA-256 of the PRF
output) and where it lives is section 3's PRIVACY wording; the unlock is I3 (storage.session,
cleared when the browser closes or the extension reloads); signing in with no page open is 5.6's
backgroundPoll; the no-PRF case is SIGNIN_NOPRF_KEY ("from then on offers no box"); Forget,
Disconnect and a change of portal are I8 and 5.7; the record forgotten after a typed password proves
is 5.4 (LOG_WORDS.signinReplaced; since the second review also a held one, LOG_WORDS.signinSetAside,
and never one holding that same password); Chrome's auth cache is section 1's fact (in memory,
shared with tabs, until the browser quits or browsing data with cookies is cleared) and I2's last
sentence; the box is I6 (the 18.0.0 tab path, unchanged, and the only path where browser.webRequest
is absent: the Firefox build, which is built and never offered and requests no webRequest, since
Firefox's MV2 answer would need the forbidden webRequestBlocking; so the text says "where the
Extension cannot answer a request for a sign-in" rather than naming a browser). "Your browser may
offer to save what you type there" is 18.0.0's behaviour (closeSigninTabSoon keeps Chrome's offer),
which no agreement had described; it now says section 4(a) applies to it too. "Wayne State's
password standard": research_policy-wayne.md, https://tech.wayne.edu/policies/password-standard,
"Never save passwords in web browsers or computer programs; instead, type them in each time you need
them" (search index, 2026-10-09; the page itself did not open from the session). The rest of the old
paragraph, from "it opens the portal's own terminal page in a tab" to its end, is unchanged and
follows in the last of the new paragraphs.

**Confirmed** against stage B's code: the answer only for checkGrid's armed dashboard GET
(core/gridsignin.ts authVerdict, background.ts checkGridClaimed arms `mem.grid.armed` and nothing
else does); a refused saved password not tried again after a worker or browser restart (the note's
refused_at; background19 test 2), and a try with no outcome on record when the browser session is
gone put on hold and not counted as a refusal (the note's stopped_at, loadGridAuth's restart rule;
tests 30 and 44); signing in with no page open (backgroundPoll's checkGrid('alarm'),
savedSigninReady); the tick hidden after a passkey gave no PRF (ext/gridSignin.ts supportNow and the
no-PRF mark; gridSigninPage.test.ts); Forget, Disconnect and a change of portal removing every store
(ext/connectApi.ts forgetGridSignin; test 8); the refused or held record forgotten when a typed
password proves, and kept when it holds that same password (background.ts typedWorkedOverSaved and
forgetReplaced; tests 12 and 19); the Settings row named "Grid sign-in" with Forget
(WORDS.settings.signinTitle and forget, ui/settings.ts).

### L6. Section 5(b)(ii), the old passkey told apart from the new one

Old:

> A passkey you made to protect that key is kept by your system or your browser's password manager, not by the Extension, and you delete it there.

New:

> A passkey you made to protect that key, the old passkey of versions 12.0.0 to 15.0.0, is kept by your system or your browser's password manager, not by the Extension; it is named with your account name alone, or "beethoven", this version never uses it, and you can delete it there. It is not the passkey of (i), named with your account name followed by "(grid)", which this version uses for a saved password: delete that one only after Forget.

Why: Spec A4: the old and new passkeys told apart (review finding 4 of the rules-texts lens: both
have rp name Beethoven and the same RP ID, and a student following the old advice would delete the
new one, leaving the saved sign-in locked until Forget).

### L7. Section 5(c), what the sign-in keeps

Old:

> are stored in the Extension's own storage in your browser. Nothing about your approval is copied

New:

> are stored in the Extension's own storage in your browser. What the sign-in of (b)(i) keeps in your browser, and for how long, is listed in PRIVACY.md. Nothing about your approval is copied

Why: Section 3's five stores are listed one per row in PRIVACY.md; the agreement points there rather
than repeat them.

### L8. Section 5(g), the password never reaches Licensor

Old:

> in the approval check that section 10 describes; nothing else is. Section 10

New:

> in the approval check that section 10 describes; nothing else is, and in particular not your cluster password or the account name you type to sign in. Section 10

Why: SUMMARY line 2 stays true (nothing new reaches Licensor); I4 keeps the password off every
message, and the approval check sends the dashboard's account name only (I7).

### L9. Section 10(c), the saved sign-in stays in the browser

Old:

> your statements, your audit log, your settings and what the Extension remembers about your worker stay in your browser;

New:

> your statements, your audit log, your settings, a password you chose to save (section 5(b)(i)) and what the Extension remembers about your worker stay in your browser;

Why: The saved record (IndexedDB 'beethoven-signin') and its note never leave the browser profile.

### L10. Section 15, the passkey service is not part of Beethoven; the marks named

Old:

> your cluster's ssh service and your authenticator app are not part of Beethoven:

New:

> your cluster's ssh service, your authenticator app and the passkey service of your system or browser are not part of Beethoven:

Why: Windows Hello, iCloud Keychain and Chrome's password manager keep the passkey (as 12.0.0's text
said, TEXTS_V9_V10.md L18).

### L11. Section 15, the marks sentence

Old:

> "Windows" is Microsoft's mark and "macOS" Apple's, each named only to say which of your own systems is meant.

New:

> "Windows" and "Windows Hello" are Microsoft's marks, "macOS", "Mac", "Touch ID" and "iCloud" Apple's, and "Chrome" Google's, each named only to say which of your own systems or programs is meant.

Why: 5(b)(i) now names Windows Hello, Touch ID, the Mac's Passwords app, iCloud Keychain and Chrome.

### L12. Section 18, the cryptography the Extension contains

Old:

> The Extension contains cryptography only to verify signatures (the list of withdrawn versions of section 3(d)), with your browser's own cryptography;

New:

> The Extension contains cryptography only to verify signatures (the list of withdrawn versions of section 3(d)) and, if you choose to save your cluster password (section 5(b)(i)), to encrypt it under a key your passkey releases, with your browser's own cryptography;

Why: src/core/vault.ts seals the password with WebCrypto (AES-GCM-256, HKDF-SHA-256); no
cryptography of its own.

### L13. Section 8 and the welcome page's summary: the lockout as the fourth Known Risk

greg's answer on the decision card, "Add it now" (2026-10-09 16:28:55Z), to "Add the AccessID
lockout to the agreement's Known Risks before 19.0.0 ships?". Version 12 was not released, so it
folds into version 12 with no new number.

Section 8, version 11:

> In particular, and as Known Risks named on the welcome page, above the box you tick, you accept
> the risk of these three events, which are specific to how Beethoven works: Anthropic changing or
> enforcing Remote Control eligibility; your university disabling or reconfiguring Open OnDemand's
> shell, files or reverse proxy; and a browser store removing or disabling the Extension.

Version 12:

> In particular, and as Known Risks named on the welcome page, above the box you tick, you accept
> the risk of these four events, which are specific to how Beethoven works: Anthropic changing or
> enforcing Remote Control eligibility; your university disabling or reconfiguring Open OnDemand's
> shell, files or reverse proxy; a browser store removing or disabling the Extension; and your
> institution disabling your account after wrong passwords, counting a password the Extension sent
> for you in the way section 5(b)(i) describes or a copy your browser re-sent by itself, with
> getting the account back taking days.

5(b)(i)'s lockout sentence gains "You accept that risk as a Known Risk (section 8)." The welcome
page's summary line 3, version 11: "The grid, Anthropic or the browser store can stop it working at
any time. You accept that risk." Version 12: "The grid, Anthropic or the browser store can stop it
working at any time, and wrong passwords can get your grid account disabled. You accept these
risks." So `summary_sha256` changes, and `extension/test/terms.test.ts` and
`extension/e2e/lib/words.mjs` pin the new line. The tick's sentence ("accepting the risks above")
points at the summary and is unchanged.

Why: a disabled AccessID is the worst thing the 19.0.0 sign-in can bring about. Getting it back can
take up to three business days at Wayne State (KB 20082, from the search index). Before this
change it was stated as behaviour only, so a student could tick without reading it. "In the way
section 5(b)(i) describes" keeps the assumption to the behaviour the agreement states: a
lockout caused by the Extension sending more than 5(b)(i) says is not assumed. Section 8's last
sentence still leaves out Licensor's gross negligence, wilful misconduct and fraud.

## The privacy statement (`PRIVACY.md`), version 12 to 13

### P1. Head, version line

Old:

> Version 12, 2026-10-08.

New:

> Version 13, 2026-10-09.

Why: Spec A4: PRIVACY version 13 dated 2026-10-09. extension/test/terms.test.ts now reads this line
too (nothing checked it before, review finding of the rules-texts lens).

### P2. Introduction: the session, the sections, the sign-in sheet again

Old:

> through your university's Open OnDemand portal, in the browser session you have signed in to there, and a set of scripts

New:

> through your university's Open OnDemand portal, in a browser session signed in to there, by you or by the extension with the account name and password you give it, and a set of scripts

Why: As L2.

### P3. Introduction, the list of sections

Old:

> what your portal sees, what happens when you sign in to Claude and when the portal's shell asks for your password,

New:

> what your portal sees, what happens when your portal asks you to sign in, when you sign in to Claude and when the portal's shell asks for your password,

Why: The new section *When your portal asks you to sign in* (P12).

### P4. Introduction, "never asks for your cluster password"

Old:

> this version has none of that, reaches your cluster only through your portal, and never asks for your cluster password.

New:

> this version has no Bridge and no ssh connection of its own and reaches your cluster only through your portal. It has a sign-in sheet again, for your portal only: it asks for your account name and cluster password when your portal asks for a sign-in, and saves the password, encrypted, only if you tick a box.

Why: "never asks for your cluster password" became false.

### P5. Table, two new rows on disk: the saved sign-in, and its note (which also holds the no-passkey mark)

Old:

> | *Forget* beside that note in Settings (which removes the note and nothing on the grid); uninstalling |

New:

> | *Forget* beside that note in Settings (which removes the note and nothing on the grid); uninstalling |
> | Only if you tick *Remember it on this computer* on the grid sign-in sheet (it is never ticked for you): your saved grid sign-in: the account name you typed, your portal's address, your passkey's credential identifier (not secret), two random salts, a random value used once, and your password encrypted with AES-GCM under a 256-bit key derived (HKDF-SHA-256) from what your passkey releases, which is never written to disk; with when it was saved | the extension's own database in this browser profile on this computer (IndexedDB, `beethoven-signin`), which no website can read | so the extension can sign you in to your portal by itself once you have unlocked it with your passkey | *Forget* beside *Grid sign-in* in Settings; *Disconnect*; changing to another portal; uninstalling. Someone who can use this browser profile while it is unlocked, or who can unlock your passkey, could sign in to your portal with it, and so could the extension's own code |
> | Only while a saved grid sign-in exists, a note of it (never the password): the account name you typed, your portal's address, the passkey's credential identifier, when it was saved, when the extension last tried it, when it last worked and when your portal last turned it down, when its use was put on hold without it being turned down (a password you typed was turned down while it was saved, or the outcome of an earlier try could no longer be told: the browser closed before your portal replied, or one of your portal tabs asked for a sign-in or had a request answered meanwhile), when the extension last tried a password you typed while this one was saved, until that try's outcome comes, how many times in a row a password was turned down while it was saved, and the name your portal gives its sign-in (its realm); and, if your computer's passkey could not lock a password, when that happened and the name of your computer's operating system | `storage.local` | so the panel knows a sign-in is saved and which passkey opens it, never tries a password your portal turned down again, and stops offering *Remember it on this computer* where it cannot work | *Forget*; *Disconnect*; changing to another portal; uninstalling |

Why: Section 3, rows (1) and (2): SigninRecord in IndexedDB 'beethoven-signin' (v, origin, username,
cred, prfSalt, hkdfSalt, iv, ct, saved_at); SIGNIN_NOTE_KEY 'bridge.signin' (origin, username,
saved_at, cred, attempt_at, typed_attempt_at, proven_at, refused_at, stopped_at, refusals, realm);
SIGNIN_NOPRF_KEY 'bridge.signinNoPrf' ({ at, os }). "no website can read": the extension origin's
database; the portal page script cannot reach it (section 3). The who-could-use-it sentence follows
12.0.0's precedent (TEXTS_V9_V10.md P4) and the map's risk on the threat model. Forget removes every
one of them (I8).

**Confirmed**: core/keys.ts SigninNote and SigninNoPrf, core/vault.ts SigninRecord; the page writes
the note whole with these four fields and nothing else (ext/gridSignin.ts), the background only the
outcome fields (attempt_at, typed_attempt_at, proven_at, refused_at, stopped_at, refusals and realm:
background.ts NotePatch and updateNote). The record and the note also go by themselves when a typed
password works while the saved one is turned down or on hold and is not that same password
(typedWorkedOverSaved, forgetReplaced), which the row's Forget column does not need to say.

### P6. Table, three new session rows

Old:

> | A plain-words list of what the extension did in this browser session, for *Show log*

New:

> | Only while a saved grid sign-in is unlocked: what your passkey released to open it, and the passkey's credential identifier | `storage.session`, in memory only, cleared when the browser closes or Beethoven updates or reloads | so you unlock it once each time you open the browser, not at every sign-in | closing the browser; *Forget*; *Disconnect*; changing to another portal |
> | A password you typed on the grid sign-in sheet without ticking *Remember it on this computer*, with the account name, your portal's address and when you typed it | `storage.session`, in memory only | for the one sign-in you asked for: it is removed once that sign-in has been tried, whether or not it worked, and at the latest two minutes after you typed it | it removes itself; *Forget*; *Disconnect*; changing to another portal; closing the browser |
> | The numbers your browser gave the requests the extension last answered with a password (at most 20); an answer still waiting for its outcome: when it was given, whether it was the saved or a typed password, which saved copy (by when it was saved) or when it was typed, and whether one of your portal tabs asked for a sign-in, or had a request answered by your portal without a refusal, meanwhile (never which tab or request); and the outcome of its last tries: when one was turned down, or when the outcome of one could no longer be told, whether it was a saved or a typed password, when it was given and which saved copy, how many were turned down in a row, and your portal's realm; nothing you typed | `storage.session`, cleared when the browser closes | so the extension answers each request at most once and stops after a refusal, even when it restarts | closing the browser; *Forget*; *Disconnect*; changing to another portal |
> | A plain-words list of what the extension did in this browser session, for *Show log*

Why: Section 3, rows (3) to (5): SIGNIN_UNLOCK_KEY 'bridge.signinUnlock' ({ prf, cred }),
SIGNIN_ONCE_KEY 'bridge.signinOnce' ({ origin, username, password, at }; I5: removed after the one
attempt on every path, the alarm at two minutes), SIGNIN_STATE_KEY 'bridge.signinState' ({ sent:
last 20 requestIds, pending with its `tainted` mark, refused, refusals, realm }; survives a worker
restart within the browser session). Placed before the activity list so the session rows stay
together.

**Confirmed**: core/keys.ts SigninUnlock, SigninOnce and SigninState as background.ts and
ext/gridSignin.ts write them; the one-shot is removed by the background's grid-signin (finally), by
the page after its send, and by the alarm `bridge.signinOnce` at two minutes.

### P7. Table, the audit log row

Old:

> The sign-in sitting is one line with how many bytes were read and typed; what you typed is never in it |

New:

> The sign-in sitting is one line with how many bytes were read and typed; what you typed is never in it. A sign-in the extension makes for you gets no line of its own (the request it answered is the line), and your password is never in it |

Why: Section 3's paragraph: "An answered challenge gets no audit line of its own (the dashboard
request is the line)"; I4 keeps the password out of the audit log. The map's "one audit line per
answer" is not built and is not claimed.

**Confirmed**: background.ts onGridAuth writes a debug line (the verdict, the request's type and,
for an answer or a cancel only, the dashboard's address) and no audit line; the dashboard GET itself
is audited as before (core/portal.ts, cls 'dashboard').

### P8. After the table, the one durable secret and what the browser attaches

Old:

> There is no durable secret in the extension's storage: there is no key of Licensor's, and your own sign-in to your cluster identifies you. The one-time step below, for when the portal's shell asks for your password, makes a key in your cluster account, never in your browser. The extension never reads your portal's sign-in: your browser attaches the sign-in it holds (a cookie, or the sign-in it keeps after you type into its own box) to requests to that one website, the extension's own background requests included, until the browser closes.

New:

> There is no key of Licensor's, and your own sign-in to your cluster identifies you. The one durable secret the extension may keep is your cluster password, and only if you tick *Remember it on this computer*: encrypted, as the table above and *When your portal asks you to sign in* say. The one-time step below, for when the portal's shell asks for your password, makes a key in your cluster account, never in your browser. The extension never reads your portal's sign-in: your browser attaches the sign-in it holds (a cookie, or the sign-in it keeps after you type into its own box or after the extension gives it your password) to requests to that one website, the extension's own background requests and your own portal tabs included, until the browser closes or you clear its browsing data with cookies.

Why: "There is no durable secret" became false. Section 3's paragraph: Chrome keeps the password
Beethoven gives it in memory until it quits or cookies are cleared, and uses it for the student's
own portal tabs too. The reach checks that follow ("requests that carry no sign-in or cookie") stay
true: the listener passes the credential-free reach probe (I2), whose credentials are omitted.

### P9. What an earlier version may have left: the new sheet and passkey told apart, the cleanup leaves them alone

Old:

> and, if you chose it, a passkey to protect that key. This version has none of it. On its first run after the update, the extension removes from your browser what that way kept there: the key and what protected it (deleted unread; the extension cannot use it and never sends it anywhere), the direct way's settings and one-time answers, and the *Connection* preference.

New:

> and, if you chose it, a passkey to protect that key. This version has none of it; the sign-in sheet and the passkey it has used since 19.0.0 are new and different (*When your portal asks you to sign in*). On its first run after the update, the extension removes from your browser what that way kept there: the key and what protected it (deleted unread; the extension cannot use it and never sends it anywhere), the direct way's settings and one-time answers, and the *Connection* preference; it never touches the grid sign-in this version saves.

Why: I8: cleanupDirectWay never touches the new names (background19 test 9).

### P10. What an earlier version may have left: the old passkey

Old:

> - **A passkey** you made to protect the key is kept by Windows Hello, your Mac's keychain or your browser's password manager, not by the extension; you delete it there, in your system's or your browser's list of passkeys.

New:

> - **The old passkey**, one you made to protect the key, is kept by Windows Hello, your Mac's keychain or your browser's password manager, not by the extension. It is named with your account name alone, or "beethoven" ("Beethoven on this computer"); this version never uses it, and you can delete it there, in your system's or your browser's list of passkeys. The passkey this version makes for a saved grid sign-in is named with your account name followed by "(grid)" (for example, "ab1234 (grid)"): delete that one only after *Forget*.

Why: As L6; the spec's wording: "the old passkey (12.0.0 to 15.0.0) is named with your AccessID alone,
or 'beethoven' (15.0.0 named a newly made one so), and can go; the one 19.0.0 uses for your grid sign-in is named '<AccessID> (grid)'; delete
that one only after Forget".

### P11. What your portal sees: whose sign-in, the two-second watch, the tab, "never signs in for you"

Old:

> using the sign-in your browser already holds, from the extension's own background, with no portal tab where your browser allows it:

New:

> using the sign-in your browser holds for it (one you made in its own box, or one the extension made with the password you gave it, as the next section says), from the extension's own background, with no portal tab where your browser allows it:

Why: As L2 and P8.

### P11a. What your portal sees, the dashboard readings

Old:

> about once a minute while the panel is open; every two seconds while you sign in);

New:

> about once a minute while the panel is open; every two seconds while you sign in with Chrome's own box; and, while no page of Beethoven's is open, a saved sign-in is unlocked and your portal has signed you out, once at each of the extension's checks of your worker, every thirty seconds to a minute);

Why: The two-second watch is the box path's (SIGNIN_WATCH_MS, only while a sign-in tab is watched).
Spec 5.6: backgroundPoll with no page open makes one checkGrid('alarm') per alarm when the grid note
says signed out and a saved sign-in is unlocked and not refused; the poll alarm runs every half
minute to a minute (setPollEvery(0.5 | 1), background.ts).

**Confirmed**: background.ts backgroundPoll, one checkGrid('alarm') per alarm while the grid note says
signed out, no page is open and savedSigninReady().

### P11b. What your portal sees, the sign-in tab

Old:

> The extension opens the portal in a tab only for you to sign in there (in your browser's own sign-in box, or on the portal's own sign-in page), never sees what you type there, and closes that tab;

New:

> The extension opens the portal in a tab for you to sign in there (in your browser's own sign-in box, or on the portal's own sign-in page) only when you choose *Use Chrome's sign-in box instead*, or in a browser where it cannot sign in for you, never sees what you type there, and closes that tab;

Why: I6 and 5.6: with ownSigninAvailable() no path opens a sign-in tab but 'sign-in-grid-box'.

### P11c. What your portal sees, "never signs in for you"

Old:

> The extension never signs in for you and never touches a multi-factor step.

New:

> The extension signs in for you only as the next section says, with the account name and password you typed on its sheet, and never touches a multi-factor step. A password it gives your portal arrives there as one typed into Chrome's own box would, and one your portal turns down is recorded in your institution's logs as a failed sign-in.

Why: The reversal (L5). The answer is an HTTP Basic Authorization header on the retried request,
which the portal cannot tell from the browser's own box; a refusal is a failed sign-in wherever the
institution records them (whether it counts toward the AccessID's lockout is not yet measured, spec
section 1).

### P12. New section: When your portal asks you to sign in

Old:

> ## What happens when you sign in to Claude

New:

> ## When your portal asks you to sign in
>
> Your university's portal may ask for your account name and cluster password (at Wayne State, your AccessID and its password) before it answers. In Chrome, the panel then shows Beethoven's own sign-in sheet: your account name, your password, the box *Remember it on this computer* (never ticked for you), *Sign in*, *Use Chrome's sign-in box instead* and, when you can leave it for later, *Not now*. Typing them there and pressing *Sign in* asks the extension to sign in to your portal for you.
>
> **How it signs in.** The extension holds two permissions for this, `webRequest` and `webRequestAuthProvider`, which let it answer a request for a sign-in on a website you granted it; your one portal is the only such website. It answers only the sign-in request that its own background reading of your portal's dashboard page receives, at most once each time it checks whether you are signed in, and only when that request comes from your portal itself, not from a proxy, asks for the portal's plain ("Basic") sign-in and, once a password the extension gave has worked, in this browser session or, for the saved password, at any time since it was saved, names the same sign-in realm as that one; a sign-in in Chrome's own box records no realm, and *Forget*, *Disconnect* and changing to another portal remove the one on record. It never answers a sign-in request from one of your own browser tabs (Chrome shows its own box there), from a proxy, from another website or for another realm, and never one of the checks that ask whether your portal answers, which carry no sign-in. The same permissions tell it of your own portal tabs' sign-in requests and of when requests to your portal end. It leaves your tabs' requests to Chrome and keeps one mark of them only, and only while an answer it gave still waits for its outcome: that one of your portal tabs asked for a sign-in, or had a request answered by your portal without a refusal, meanwhile (*One wrong password at most* says why); never which tab, which request or which page. The account name you type is used only to sign in; the approval check still sends the account name your portal's dashboard shows. The extension never fills in a sign-in web page or your university's identity provider, never touches a multi-factor step, and never types a password into the portal's shell.
>
> **One wrong password at most.** The extension sends a password your portal turns down at most once. The first refusal stops every sign-in the extension makes by itself, with a saved or a typed password, until you type the password again; the sheet asks you to check it first, and a saved password that was turned down is not tried again after Beethoven or the browser restarts. When the extension cannot tell whether a password it gave worked, because the browser closed, or Beethoven updated or reloaded, before the grid replied, or because one of your portal tabs asked for a sign-in or had a request answered while that answer waited (you may have signed in in Chrome's own box, and Chrome may have used that password for Beethoven's request as well), it counts the try as neither a success nor a refusal and puts a saved password on hold: it is not sent again until a password you type on the sheet works, or you save one again. Chrome keeps its own copy of a password it is given and sends it again by itself: when your portal turns that password down, Chrome re-sends its cached copy once for each request already started with it before the first refusal comes back; Beethoven then sends at most one; when the answered request is abandoned before the grid replies, Chrome may re-send that copy once. How many of these the grid counts is not yet measured. Your university may disable your account after a few wrong passwords, and getting it back may take days; a password you have just changed may not work everywhere yet.
>
> **If you do not tick the box**, the extension keeps the password in `storage.session`, in memory only, for the one sign-in you asked for, and removes it once that sign-in has been tried, whether or not it worked, and at the latest two minutes after you typed it.
>
> **If you tick it**, the extension asks your computer to make a passkey for your grid sign-in, unlocked with Windows Hello, Touch ID or your screen lock, with your account name followed by "(grid)" as its user name (for example, "ab1234 (grid)"). It encrypts the password with AES-GCM under a 256-bit key derived (HKDF-SHA-256) from a secret the passkey releases, which is never written to disk, and keeps only that encrypted copy, in the extension's own database in this browser profile. When the extension next needs your portal after you open the browser, the panel asks you to unlock it, once; what the passkey released then stays in `storage.session`, in memory, until the browser closes or Beethoven updates or reloads, and the extension signs in with it when your portal asks, also while no page of Beethoven's is open, so that a press you made, or *Keep my worker running*, can go ahead. The passkey is kept by Windows Hello, your Mac's Passwords app (iCloud Keychain) or Chrome's password manager, not by the extension; that store may keep it in your Google account or in iCloud and offer it on your other devices, but the saved password itself stays only in this browser profile. Someone who can use this browser profile while the saved password is unlocked, or who can unlock your passkey, could sign in to your portal with it, and so could the extension's own code; no website and no other extension can read it. Where your computer's passkey cannot lock a password, the extension says so, signs you in that once with the password you typed, and notes it so that the sheet stops offering the box. Saving is your choice, and your university's rules apply to it (the agreement, section 4(a)): where your university says to type your password each time you need it, as Wayne State's password standard does, leave the box unticked.
>
> **Forget.** *Forget*, beside *Grid sign-in* in Settings, deletes the saved password, its note, the note that a passkey could not lock a password, the unlocked secret, a typed password not yet used and the outcomes of the last tries. *Disconnect* does the same, and so does changing to another portal; uninstalling removes them with the rest of the extension's data. Forget may ask your list of passkeys to remove the passkey, but some lists keep it: yours may still show it, and you can delete it there, after Forget. It is not the old passkey of Beethoven 12.0.0 to 15.0.0, which is named with your account name alone, or "beethoven", and can go (*What an earlier version may have left*). If a password you typed works while your saved one is turned down or on hold, the extension forgets the saved one by itself, unless it can tell that the saved one is the same password, which it then keeps and uses again.
>
> **Chrome stays signed in.** Once your portal has accepted a password the extension gave it, Chrome keeps it in memory, as it keeps one you type into its own box, and uses it for your own portal tabs too, until Chrome closes or you clear its browsing data with cookies; *Forget* and *Disconnect* do not end that.
>
> **Chrome's own box.** *Use Chrome's sign-in box instead* opens your portal in a tab, where you sign in with Chrome's own box or on the portal's own sign-in page, as Beethoven 18.0.0 did; the extension never sees what you type there and closes that tab once you are signed in. Where the extension cannot answer your portal's request for a sign-in, this is the only way. That includes a portal that sends you to your university's own sign-in page instead of asking the browser for a password: in Chrome the sheet still appears there, but the extension sends no password typed on it. Chrome may offer to save what you type in that tab; that offer is Chrome's own, and your university's rules apply to it as well.
>
> Nothing of this reaches Licensor: not your password, not the account name you type, not the outcomes of the tries. This sign-in came with Beethoven 19.0.0 and has been tried only in Licensor's own tests, against its mock portal and a stand-in for a passkey, not yet against a real cluster or with a real Windows Hello or Touch ID.
>
> ## What happens when you sign in to Claude

Why: Section 3's "Plus" paragraph and rows, sections 2 and 5 to 6 of the spec, and section 4 A4's
5(b)(i) list, in the statement's own words; placed after *What your portal sees*, as the
introduction lists it. "tried only in Licensor's own tests": spec section 1's not-yet-measured list
(onAuthRequired against the live portal, WebAuthn from the side panel on real Windows and macOS,
real Windows Hello and Touch ID PRF); this sentence must change, with a new version, once those are
measured. "The same permissions tell it ... of when requests to your portal end": onCompleted and
onErrorOccurred are registered with the same filter as onAuthRequired (5.3), so the extension is
told of every request to the granted origin that ends, tabs' included; it acts on its own pending
requestId, and of a portal tab's request it keeps only the `tainted` mark on an answer still waiting
for its outcome (boxMaySignIn: a tab's challenge, or a tab's request ending with neither 401 nor 403
and not from the cache), never the tab, the request or a debug line (the debug line carries a URL
only for an answer or a cancel, 5.3).

**Confirmed** as L5; and the realm is recorded only on a sign-in Beethoven gave that worked
(background.ts provenNow writes it to the attempt state and, for the saved password, to the note).

### P13. When the portal's shell asks for your password: never a password the extension holds

Old:

> The extension never types a password: it stops before typing anything

New:

> The extension never types a password, not even one you gave it to sign in to your portal: it stops before typing anything

Why: Out of scope of 19.0.0 (spec section 0: the AM2 prompt is a different prompt, and Beethoven
still never types a password into a shell); said so that the new sheet cannot be read as reaching
the shell.

### P14. What Licensor receives: the list's items run together again as three

Old:

> offers you a button to ask for access. - **Two files, once a day.**

New:

> offers you a button to ask for access.
> - **Two files, once a day.**

Why: Formatting only, no word changed: an earlier re-wrap had run this list item into the one before
it, and the next list's three items into one, so the website showed a stray " - " mid-sentence
(11.0.0's text, a6bbae1, had them as separate items).

### P15. What Licensor receives, "In particular": the password

Old:

> - there is no key of Licensor's and no activation step; your institution's own sign-in identifies you; the extension never reads your portal's sign-in, cookie or password; - the extension sends no error reports, no crash reports and no usage data; it has no code for them and no address to send them to; - your acceptance record,

New:

> - there is no key of Licensor's and no activation step; your institution's own sign-in identifies you; the extension never reads your portal's sign-in or cookie, and never sends Licensor your cluster password, not even one you gave it to sign in to your portal;
> - the extension sends no error reports, no crash reports and no usage data; it has no code for them and no address to send them to;
> - your acceptance record,

Why: "never reads your portal's ... password" became false; that it never reaches Licensor stays
true. The three items are separate again (P14).

### P15a. What Licensor receives, "In particular": the saved sign-in stays

Old:

> your activity list, your settings and what the extension remembers about your worker stay in your browser.

New:

> your activity list, your settings, a grid sign-in you chose to save and what the extension remembers about your worker stay in your browser.

Why: As L9.

### P16. What is never collected: the password, browsing activity

Old:

> portal cookies or tokens, your portal password, your cluster password or verification code (you type them only into your browser's own sign-in box, your portal's own pages and the portal's own terminal page, never into the extension), the code you paste to sign in to Claude, anything the portal's terminal page shows, the key the one-time step makes, browsing activity, or anything from claude.ai or any Anthropic page.

New:

> portal cookies or tokens, a verification code, the code you paste to sign in to Claude, anything the portal's terminal page shows, the key the one-time step makes, browsing activity (of your own portal tabs it learns only of their sign-in requests and of when their requests end, and keeps of them only the one mark *When your portal asks you to sign in* describes, while an answer of its own waits for its outcome), or anything from claude.ai or any Anthropic page. Your portal or cluster password reaches the extension only if you type it into its own sign-in sheet; it then goes only to your portal, never to Licensor, and is kept only as *When your portal asks you to sign in* says. A password or code you type into your browser's own sign-in box, your portal's own pages or the portal's own terminal page the extension never sees.

Why: Spec section 3's last sentence (the extension sees the grid's sign-in requests from the
student's own portal tabs, leaves them to Chrome's box; since the second review the text says it
keeps of them only the mark P12 describes), and the review's finding on "browsing activity"
(rules-texts, minor): the debug line keeps no URL of a pass.

### P17. What is never collected: the permissions

Old:

> requests no `activeTab`, `cookies`, `tabs`, `webRequest`, `debugger`, `identity`, `clipboardRead` or `nativeMessaging` permission (so no program on your computer is started for it),

New:

> requests no `activeTab`, `cookies`, `tabs`, `webRequestBlocking`, `declarativeNetRequest`, `debugger`, `identity`, `clipboardRead` or `nativeMessaging` permission (so no program on your computer is started for it), requests `webRequest` and `webRequestAuthProvider` only to answer your portal's request for a sign-in, and to learn whether its answer worked, as *When your portal asks you to sign in* says,

Why: Spec 5.1: the Chromium manifest's permissions are storage, alarms, scripting, sidePanel,
webRequest and webRequestAuthProvider; webRequestBlocking and declarativeNetRequest stay forbidden
(I7), and test/hygiene.test.ts refuses them.

### P18. How Licensor uses and keeps it: the password

Old:

> Your cluster password and verification code reach neither Licensor nor any processor of Licensor's: the extension never sees them; you type them only into your browser's own sign-in box or your institution's own pages.

New:

> Your cluster password and verification code reach neither Licensor nor any processor of Licensor's: a password you give the extension goes only to your portal, and a password or code you type into your browser's own sign-in box or your institution's own pages the extension never sees.

Why: "the extension never sees them" became false for a password typed into the sheet; the first
half stays true.

### P19. Your choices and rights: Remember and Forget

Old:

> Remove the site permission or uninstall the extension at any time; press *Forget* on the note

New:

> Remove the site permission or uninstall the extension at any time; leave *Remember it on this computer* unticked, or press *Forget* beside *Grid sign-in* in Settings to delete a saved grid sign-in (and then delete its passkey, named with your account name followed by "(grid)", in your list of passkeys if it is still there); press *Forget* on the note

Why: The controls of section 6 (the tick, Settings' signin row with Forget).

**Confirmed**: WORDS.settings.signinTitle "Grid sign-in" and forget "Forget", behind the confirm row
(ui/settings.ts).

### P20. Changes, the version 13 entry

Old:

> Version 12 (2026-10-08, Beethoven 16.0.0): the direct way

New:

> Version 13 (2026-10-09, Beethoven 19.0.0): Beethoven signs in to your portal for you. In Chrome, when your portal asks for a sign-in, the panel shows Beethoven's own sign-in sheet for your account name and cluster password, and the extension answers your portal's request for a sign-in from its background, with no tab, under the `webRequest` and `webRequestAuthProvider` permissions, which it now requests: only for its own reading of your portal's dashboard, at most once per check, and never for a tab, a proxy, another website or another realm. It sends a password your portal turns down at most once, and that refusal stops every sign-in it makes by itself until you type the password again. Saving the password is optional and off unless you tick *Remember it on this computer*; a saved password is kept only encrypted, in the extension's database in this browser profile, under a key derived from what a passkey releases (Windows Hello, Touch ID or your screen lock, named with your account name followed by "(grid)"); what the passkey releases stays in memory only, from when you unlock it until the browser closes or Beethoven updates or reloads; a password not saved is kept in memory for one sign-in and at most two minutes. New in your browser: the saved sign-in, its note, the note that a passkey could not lock a password, the unlocked secret, the typed password for one sign-in and the outcomes of the last tries (the table). *Forget* beside *Grid sign-in* in Settings, *Disconnect* and changing to another portal delete them. Chrome keeps a password that worked in memory until it closes and uses it for your portal tabs too. *Use Chrome's sign-in box instead* keeps the way of 18.0.0, which is also the only way where the extension cannot answer a request for a sign-in. The statement now tells the old passkey of 12.0.0 to 15.0.0 apart from the new one. Nothing new reaches Licensor.
>
> Version 12 (2026-10-08, Beethoven 16.0.0): the direct way

Why: The statement's own record of each version, newest first.

## Corrected in place after the second review (2026-10-09)

The second review of 19.0.0 (2026-10-09, before any release) found sentences in the texts that
described a design the code no longer had after the background's round-two changes. Both texts were
corrected in place: `LICENSE.txt` stays version 12 and `PRIVACY.md` version 13, both dated
2026-10-09, since neither has been released or accepted by anyone; `TERMS_VERSION` stays 12, and
the round's fixes left `SUMMARY`, the tick and `summary_sha256` unchanged (no fix needed the
summary: nothing new reaches Licensor; summary line 3 changed afterwards, with L13). `extension/public/` holds byte-identical copies (`npm run sync-profiles`). Every
sentence below was read against `extension/src/entrypoints/background.ts` as round two left it, and
the quotations of L5, P5, P6, P12 and P16 above were taken again from the corrected files.

- **R2-06, the tabs' mark.** The texts said Beethoven keeps nothing of the tabs' sign-in requests.
  The code keeps one mark: while an answer of its own waits for its outcome, a portal tab's
  challenge, or a portal tab's request ending with neither 401 nor 403 and not from Chrome's cache,
  sets `pending.tainted` in `storage.session` (`boxMaySignIn`), with no tab id, request id, address
  or debug line. Now the agreement's 5(b)(i) says "Of your own portal tabs' requests it keeps one
  mark only, and only while an answer it gave still waits for its outcome", and the statement says
  the same in *When your portal asks you to sign in*, its session row ("never which tab or request")
  and *What is never collected*. Also `SECURITY.md`, the permission tables of `docs/ARCHITECTURE.md`
  and `docs/store/LISTING.md`, `docs/store/PASTE.md`'s webRequest justification (645 characters, the
  listing's row word for word) and the website's reviewers page.
- **R2-08, the hold (the texts' half).** A try whose outcome cannot be told is a hold
  (`stopped_at`), never a refusal: `unconfirmedNow` for a marked answer, and `loadGridAuth`'s
  restart rule for a saved try, or a typed try given while a password was saved
  (`typed_attempt_at`), with no outcome on record once the browser session is gone; neither counts a
  refusal. Both texts gain one sentence after the one-wrong-try paragraph, naming the causes (the
  browser closed, or the extension updated or reloaded, before the grid replied; a portal tab asked
  for a sign-in or had a request answered meanwhile, and Chrome may have used the box's password for
  Beethoven's request) and the way out (a password typed on the sheet that works, or a new save).
  The statement's note row names the causes and the field `typed_attempt_at`. Also `README.md`,
  `SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/guides/USE.md`, `docs/guides/LAB_LEAD.md` (its
  troubleshooting entry, with the debug lines that tell a refusal from a hold, and a `signin` row in
  the debug log's table), `extension/README.md` and the website's support and reviewers pages. What
  the sheet shows for a hold is the pages' half and is not changed here (it still shows the
  refusal's words); the texts say what Beethoven does, not what the sheet says then.
- **R2-09, forgotten by itself.** `typedWorkedOverSaved` runs when the saved password is turned down
  or on hold, and keeps the record when it holds the same password. Both texts now say: "If a
  password you typed works while your saved one is turned down or on hold, the Extension forgets the
  saved one by itself, unless it can tell that the saved one is the same password, which it then
  keeps and uses again." Also `docs/guides/USE.md` and the support page.
- **R2-07, the sheet and an identity provider.** The sheet comes on every signed-out reading
  (`needsGridSignin` in `core/steps.ts`), whatever the portal's sign-in; the code never reads the
  profile's `ood_auth` to tell the kinds apart. On a portal that redirects to an identity provider
  no challenge reaches the listener, so a password typed on the sheet is never sent and only the box
  signs in. The agreement now says the sheet comes "whenever your portal wants a sign-in" and names
  that portal's case in the box paragraph; the statement the same, in Chrome's terms. Also
  `README.md`, `docs/ARCHITECTURE.md` (the 19.0.0 paragraph and the session paragraph),
  `docs/store/LISTING.md` (the 19.0.0 note and the reviewer bullet), `docs/OPEN_QUESTIONS.md` (10)
  and the reviewers page. No such portal has been tried: not yet measured.
- **R2-12, the realm's limits.** The realm is learned only from a password Beethoven gave that
  worked (`provenNow`, `answeredRealm`), is the session's or else the note's (`state.realm ??
  note.realm`), and goes with Forget, Disconnect and a change of portal (`clearGridAuthMemory`,
  `forgetGridSignin`). Both texts now say so, and that a sign-in in the browser's own box records
  none. Also `README.md`, `SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/OPEN_QUESTIONS.md`'s two
  consequences, `docs/store/LISTING.md`, `docs/guides/LAB_LEAD.md`, `extension/README.md` and the
  reviewers page.
- **R2-10, locked means no password.** While the saved sign-in is locked the panel's checks still
  read the dashboard (`checkGrid('open')` and `'minute'`); only the alarm's check and the password
  wait. `docs/guides/USE.md` and `docs/store/TEST_BEFORE_UPLOAD.md` (items 9 and 12) now say no
  password is sent; the support page already did. The two canonical texts never said otherwise.
- **R2-13, the note's fields.** `SECURITY.md` (both lists) and the reviewers page now list the
  note's fields as the code keeps them: the portal's origin, when the password was saved, when its
  use was put on hold without a refusal and when a typed try was given while it was saved, beside
  the AccessID, the credential id, the times of the last try, success and refusal, the refusal count
  and the realm. The statement's row already had all but the typed try's time, which it has now
  (R2-08).

`docs/OPEN_QUESTIONS.md` also gains (9), the order in which a portal tab signed in through Chrome's
box and Beethoven's own answered request end (when Beethoven's ends first, the answer counts as
worked although Chrome may have used the box's password for it), and (11), how often a portal tab in
use while an answer waits puts a right saved password on hold; `docs/guides/LAB_LEAD.md` section 10
lists both. The website was rebuilt from these files (`tools/build_site.py`, then `--check-only`: 0
problems), and the reviewers page's negative block is still `docs/store/LISTING.md`'s word for word.
No change was needed in `docs/STORE_LISTING.md` (history), `docs/store/SUBMISSION.md`,
`docs/guides/INSTALL.md`, `docs/guides/ACCOUNTS.md`, or the listing's reviewed description and
negative block.

## The code that records acceptance

-  `extension/src/core/terms.ts`: `TERMS_VERSION` 11 to 12, `TERMS_DATE` '2026-10-08' to
  '2026-10-09', and in `recordInForce`'s comment the line "19.0.0 (LICENSE version 12, PRIVACY
  version 13: Beethoven signs in to the grid): a version 11 acceptance is kept in the history the
  same way and is out of force". Nothing else in the file changed (`SUMMARY`, the tick, the record's
  shape).
-  `extension/test/terms.test.ts`: the pins move to 12 and 2026-10-09; `expect(recordInForce({ ...r,
  terms_version: 11 })).toBe(false)` joins the versions out of force; the version 1 record that
  carries "this version's number" carries 12; and a new test reads `PRIVACY.md`'s head line at the
  repository root and expects version 13 with `TERMS_DATE`, since nothing else checked it and a
  statement left at its old number would have passed every gate.
-  `extension/public/LICENSE.txt` and `extension/public/PRIVACY.md` are rewritten by `node
  scripts/sync-profiles.mjs`, byte for byte from the root.

## For Greg (and counsel)

1.  **The lockout as a fourth Known Risk?** Decided: greg's card answer "Add it now"
   (2026-10-09 16:28:55Z); done in version 12 (L13). The question as it was put: Wayne State disables an AccessID after the fifth wrong
   password, and reactivation may take up to three business days (KB 20082, from the search index).
   Whether failed HTTP Basic answers at the portal count toward those five is not yet measured, nor
   how many stale tries Chrome sends after a password change. The agreement now states the
   at-most-one-try rule, Chrome's re-sends and the possible lockout as behaviour in 5(b)(i), and
   section 8 is unchanged. Making the lockout a fourth Known Risk would change section 8, the
   summary's line 3 ("The grid, Anthropic or the browser store can stop it working at any time. You
   accept that risk."), the `summary_sha256` every record carries, and `terms.test.ts`'s summary
   pin, together (the tick's "accepting the risks above" points at those lines). Done before 19.0.0
   ships, it folds into version 12; after, it is version 13.
2.  **Wayne State's Strong Password Standard, and whether to offer the tick there at all.**
   Decided: greg's card answer "Keep, ask C&IT" (2026-10-09 16:29:14Z): the tick stays with its
   warning, and greg asks hpc@wayne.edu. The question as it was put: The
   standard says: "Never save passwords in web browsers or computer programs; instead, type them in
   each time you need them." (`https://tech.wayne.edu/policies/password-standard`, from the search
   index, 2026-10-09; the same standard says never to share the password with anyone, and the access
   standard that passwords "should never be shared or known by anyone other than the user assigned
   the credentials"). Section 4(a) makes the institution's rules part of the agreement, and 5(b)(i)
   and the privacy statement now tell a Wayne State student to leave *Remember it on this computer*
   unticked. Wayne State is the one deployment, so the box is offered where the texts tell the
   student not to use it, and a student who ticks it there is arguably in breach of 4(a) (grounds
   for withdrawal under 3(d)). Should the tick be offered at Wayne State at all? A per-site switch
   would be a site profile key, added in hpcworker's module schema first; asking C&IT
   (hpc@wayne.edu) is the other way to settle it. The same standard bears on 18.0.0's tab path,
   which keeps Chrome's own offer to save the password; the texts now say 4(a) applies to that offer
   too. A third point for counsel: whether a program presenting the student's own password, at the
   student's request, is "sharing" under those standards (the research found no rule that addresses
   an application acting for its own user).
3.  Both texts quote or name Wayne State's pages from a search index; the pages did not open from
   the session. Confirm the standard's wording on the live page before the texts are published.
4.  "This sign-in came with Beethoven 19.0.0 and has been tried only in Licensor's own tests,
   against its mock portal and a stand-in for a passkey, not yet against a real cluster or with a
   real Windows Hello or Touch ID" (privacy statement). Not yet measured: onAuthRequired against the
   live portal from the service worker, a WebAuthn prompt from the side panel on real Windows and
   macOS, real Windows Hello and Touch ID PRF for an extension's passkey, and what passkey lists
   show for it. This sentence changes, with a new version, once they are.
5.  "Someone who can use this browser profile while the saved password is unlocked, or who can
   unlock your passkey, could sign in to your portal with it, and so could the extension's own
   code": the threat model stated plainly, as 12.0.0's text did for its key. A future update of the
   extension could read a password while it is unlocked; the store's review and the private listing
   are the only checks on that.
6.  Both texts are dated 2026-10-09, the day of the decision; the store build that ships them is not
   made yet. The website's `terms.html` and `privacy.html` are regenerated from these files by the
   site repository's `tools/build_site.py` (stage A5); the store upload waits until
   `https://openspineconsortium.com/beethoven/privacy.html` shows version 13.

Checked on 2026-10-09: `node scripts/sync-profiles.mjs` copies the three texts into
`extension/public/` byte for byte and reads `Version 12, 2026-10-09` as matching `TERMS_VERSION` and
`TERMS_DATE`; `test/terms.test.ts` (14 tests) and `test/hygiene.test.ts` pass; setting
`PRIVACY.md`'s line back to version 12 fails the new test, and setting `TERMS_VERSION` back to 11
fails four. With every part of 19.0.0 in place the same day: `npx tsc --noEmit -p .` is clean, the
whole suite gives 45 files, 702 tests passed and 4 skipped (the live kill-list check, which needs the
site's checkout), `node e2e/mock-selftest.mjs` 155 passed and none failed, and `npm run build` makes
both builds at 19.0.0, Chrome's with exactly `storage`, `alarms`, `scripting`, `sidePanel`,
`webRequest` and `webRequestAuthProvider`, Firefox's with neither of the last two.
