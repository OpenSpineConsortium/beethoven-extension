# Beethoven texts for 20.0.0: agreement version 13, privacy statement version 14

Drafted 2026-10-11 for Greg and for counsel, with the 20.0.0 change. **This is drafting, not legal
advice.** No lawyer has read these texts or this note; the questions at the end are for one.

What changed, in one paragraph: `LICENSE.txt` goes from version 12 (2026-10-09) to version 13
(2026-10-11) and `PRIVACY.md` from version 13 to version 14 (2026-10-11), because the maintainer
decided on 2026-10-11 to relax the rule of 8.0.0 that one approved account works on one installation
("i want to relax the one beethoven installation to one computer restriction"). Since 20.0.0 an
approved account is approved from every installation of the student's own: a second computer,
another Chrome profile or a reinstallation works at its first check, where 8.0.0 to 19.0.0 refused
it until Licensor moved the approval. Licensor's access service records each installation the
account asks from (its random identifier, the product, the version, the first and last check) and
keeps the ten most recently seen; when a new one asks, it e-mails Licensor, at most once a day per
account, a notice with one link, which withdraws the approval; there is no link that moves an
approval, since nothing needs moving. The other half of 8.0.0's rule stays: an installation serves
one account, and a check from it for another approved account is refused until Licensor releases it.
The sharing ban of section 3(b), the identifier's description, the update_required rule, every
dispute, liability and risk term, and the section numbers 1 to 23 are unchanged. Nothing new reaches
Licensor: the check sends what it sent; the service keeps up to ten identifiers per account where it
kept one.

Sources: the maintainer's message of 2026-10-11 in the session that made the change; the access
service's branch claude/any-installation (OpenSpineConsortium/beethoven-access, `worker.js`
`installationRule`, `MAX_INSTALLS` 10, `notifyNewInstall`, `RETIRED_DECISIONS`; `ACCESS_CHECK.md`,
"Installations"), which the texts describe; the extension's reading of the answers, unchanged
(`extension/src/licensing/access.ts`: `other_installation` is still read, as an older service's
answer, with its sentence). The quotations below are generated from the two files at `main` and on
this branch, paragraph by paragraph, unwrapped (in the files each touched paragraph is wrapped at
100 columns; table rows stay one line each).

Kept as they were:

-  Both texts stay plain ASCII with LF line endings. The agreement's version line is `Version 13,
   2026-10-11.` at the start of a line, as `extension/scripts/sync-profiles.mjs` and
   `extension/test/terms.test.ts` read it; the privacy statement's is `Version 14, 2026-10-11.`
-  The welcome page's four summary lines (`SUMMARY` in `extension/src/core/terms.ts`) and the tick's
   sentence, word for word, and so `summary_sha256`: line 2 ("To check your approval, it sends the lab
   your AccessID and an ID for this browser.") stays true.
-  Section 3(b) (the approval is for the student alone; sharing the copy, the installation or the
   account is a breach), 3(d) (Licensor may withdraw an approval, including one shared with anyone
   else) and every section but 3(e), 10(a) and 10(d), word for word. 3(d)'s "or used from an
   installation other than yours" still reads right: an installation of someone else's is still not the
   student's.
-  `TERMS_VERSION` becomes 13 and `TERMS_DATE` '2026-10-11', and a version 12 acceptance stays in the
   history, out of force, so everyone accepts once more. `THIRD_PARTY_NOTICES.md` is unchanged.

## The agreement (`LICENSE.txt`), version 12 to 13

### L1. Head, version line

Old:

> Version 12, 2026-10-09. Applies to the Trial Edition of Beethoven 19.0.0 and later versions that ship this text, as distributed through its private listing on the Chrome Web Store, which only the Google accounts Licensor has invited can open. You can read, copy, save and print this text at any time: it is in the file LICENSE.txt inside the extension and inside the framework (in your computing account, or in your institution's shared copy), on Beethoven's welcome page ("Show terms", "Open in a tab", "Save a copy", "Print") and on its settings page, at https://openspineconsortium.com/beethoven/terms.html, and from the support page at https://openspineconsortium.com/beethoven/support.html. You may ask for a paper copy at the notice address there.

New:

> Version 13, 2026-10-11. Applies to the Trial Edition of Beethoven 20.0.0 and later versions that ship this text, as distributed through its private listing on the Chrome Web Store, which only the Google accounts Licensor has invited can open. You can read, copy, save and print this text at any time: it is in the file LICENSE.txt inside the extension and inside the framework (in your computing account, or in your institution's shared copy), on Beethoven's welcome page ("Show terms", "Open in a tab", "Save a copy", "Print") and on its settings page, at https://openspineconsortium.com/beethoven/terms.html, and from the support page at https://openspineconsortium.com/beethoven/support.html. You may ask for a paper copy at the notice address there.

Why: LICENSE version 13 dated 2026-10-11, the day of the maintainer's decision, for 20.0.0.
extension/scripts/sync-profiles.mjs and extension/test/terms.test.ts read this line as /^Version
(\d+), (\d{4}-\d{2}-\d{2})\./ and stop unless TERMS_VERSION and TERMS_DATE are 13 and '2026-10-11';
the welcome page shows the agreement again and a version 12 acceptance stays in the history, out of
force.

### L2. Section 3(e), the installations

Old:

> (e) One installation. Your approval covers one installation of the Extension: one browser profile on one computer. The Extension makes a random installation identifier for itself the first time it needs one (when you accept this agreement), from the browser's random number generator; it is not taken or derived from your computer, its hardware or anything else about you, and it is removed when you uninstall the Extension, so a reinstallation is a new installation. The first installation that asks about your approved account is bound to it. An approval check from any other installation (another computer, another browser profile or a reinstallation) is refused, and the Extension says so, until Licensor moves your approval to that installation; ask your lab lead, or write to the notice address on the support page. Likewise, an installation bound to one approved account serves that account only: a check from it for any other account is refused, and the Extension says so, until Licensor releases it. Licensor may refuse every check from a version of the Extension that sends no installation identifier; the current version is on the private listing.

New:

> (e) Your installations. Your approval covers the Extension on the computers and browser profiles you use yourself, as many as you need, and remains yours alone (see (b)). The Extension makes a random installation identifier for itself the first time it needs one (when you accept this agreement), from the browser's random number generator; it is not taken or derived from your computer, its hardware or anything else about you, and it is removed when you uninstall the Extension, so a reinstallation is a new installation. Each installation that asks about your approved account is recorded against it, and Licensor is told when a new one asks (section 10). An installation serves one account: the first approved account it asks about is bound to it, and a check from it for any other account is refused, and the Extension says so, until Licensor releases it; ask your lab lead, or write to the notice address on the support page. Licensor may refuse every check from a version of the Extension that sends no installation identifier; the current version is on the private listing.

Why: The rule itself. The approval covers the student's own computers and browser profiles, as many
as they need; the sharing ban stays where it was, in 3(b), unchanged and now pointed at from here.
The identifier's sentence is word for word. What was "bound to the first installation, every other
refused until Licensor moves it" becomes "recorded against the account, and Licensor told when a new
one asks", with section 10 named for what is recorded. The other half of 8.0.0's rule stays: an
installation serves one account, and a check from it for another account is refused until Licensor
releases it; the lab lead and the notice address are now named for that case. The update_required
sentence is word for word.

### L3. Section 10(a), the approval check

Old:

> (a) The approval check. Only after you have accepted this agreement, and only once your cluster has accepted your sign-in and your account name is known, the Extension asks Licensor's access service (https://beethoven-access.openspineconsortium.workers.dev) whether that account is approved: when you first sign in to your cluster after accepting this agreement, about once a day while it is in use, and again when you open the Extension's panel after a day has passed or after a no. Each check sends, over an encrypted connection and without cookies, your account name as your cluster confirmed it, your portal's hostname, the product name, the Extension's version, the installation identifier of section 3(e) and, as any request does, the time it was made. The service answers yes or no, and for a no may say that your account is bound to another installation, that this installation is bound to another account, or that the version is too old. Licensor's service keeps one record of the checks for each account and product: the account name, the product, the portal's hostname and the version of the latest check, when the account was first and last checked, how many checks there have been, the answer of the latest check and the reason given with a no, when the answer last changed, and a salted hash of the network address of the latest check (never the address itself); it also counts each day's checks per account and per hashed address, to limit them, and deletes those counts after two days. For each approved account it also records the installation identifier the account is bound to, with the product, the version and when that installation first and last asked, and for that installation the account it is bound to; and, when a check is refused because of another installation or another account, how many times and when the first and the last time were, with the first eight characters of a one-way hash of the refused installation's identifier. When another installation asks about your account, Licensor is told by e-mail, at most once a day per account, with a link that can move your approval to that installation. The Extension keeps a yes for up to a day, and for up to seven days when the service cannot be reached, so that an outage on Licensor's side does not stop your work; it keeps a no for ten minutes.

New:

> (a) The approval check. Only after you have accepted this agreement, and only once your cluster has accepted your sign-in and your account name is known, the Extension asks Licensor's access service (https://beethoven-access.openspineconsortium.workers.dev) whether that account is approved: when you first sign in to your cluster after accepting this agreement, about once a day while it is in use, and again when you open the Extension's panel after a day has passed or after a no. Each check sends, over an encrypted connection and without cookies, your account name as your cluster confirmed it, your portal's hostname, the product name, the Extension's version, the installation identifier of section 3(e) and, as any request does, the time it was made. The service answers yes or no, and for a no may say that this installation is bound to another account, or that the version is too old. Licensor's service keeps one record of the checks for each account and product: the account name, the product, the portal's hostname and the version of the latest check, when the account was first and last checked, how many checks there have been, the answer of the latest check and the reason given with a no, when the answer last changed, and a salted hash of the network address of the latest check (never the address itself); it also counts each day's checks per account and per hashed address, to limit them, and deletes those counts after two days. For each approved account it also records the installations the account has asked from, up to the ten most recent (each one's identifier, product and version, and when it first and last asked), and for each installation the account it is bound to; and, when a check is refused because the installation is bound to another account, how many times and when the first and the last time were, with the first eight characters of a one-way hash of that installation's identifier. When a new installation asks about your account, Licensor is told by e-mail, at most once a day per account, with a link that can withdraw your approval. The Extension keeps a yes for up to a day, and for up to seven days when the service cannot be reached, so that an outage on Licensor's side does not stop your work; it keeps a no for ten minutes.

Why: The reasons a no may carry lose the first of three ("your account is bound to another
installation"), which the service no longer sends. The record sentence says what the service now
keeps (the installations the account asked from, up to the ten most recent, each with its
identifier, product, version and first and last check; for each installation the account it is bound
to; a refusal for another account counted with an eight-character hash), and the e-mail is a notice
with a link that can withdraw the approval, where it had a link that could move it. The rest of the
paragraph (when the check runs, what it sends, the check record, the day's counters, the caches) is
word for word.

### L4. Section 10(d), the access records

Old:

> (d) Access records. An access request on the request page records what you enter there: your account name, your name, your institutional e-mail, the Google account at which you are to receive the invitation to the private listing (Licensor adds it to the Google Group that may open that listing), what you will use Beethoven for and, if you attach one, your CV; and, when the service asks you to confirm your institutional mailbox, the time you confirmed it. Licensor's own records hold the approval and withdrawal decisions about your account, with the name and e-mail given and their dates, the installation your approval is bound to (section 3(e)) and the record of the approval checks described in (a). Licensor deletes a CV twelve months after deciding on the request (twelve months after the request, if no decision is made), or at once if it refuses the request or withdraws the approval, and keeps the other records for the life of your access and six years after, to prove the license and its terms.

New:

> (d) Access records. An access request on the request page records what you enter there: your account name, your name, your institutional e-mail, the Google account at which you are to receive the invitation to the private listing (Licensor adds it to the Google Group that may open that listing), what you will use Beethoven for and, if you attach one, your CV; and, when the service asks you to confirm your institutional mailbox, the time you confirmed it. Licensor's own records hold the approval and withdrawal decisions about your account, with the name and e-mail given and their dates, the installations your account has asked from (section 3(e)) and the record of the approval checks described in (a). Licensor deletes a CV twelve months after deciding on the request (twelve months after the request, if no decision is made), or at once if it refuses the request or withdraws the approval, and keeps the other records for the life of your access and six years after, to prove the license and its terms.

Why: "the installation your approval is bound to" becomes "the installations your account has asked
from", to match 3(e) and 10(a).

## The privacy statement (`PRIVACY.md`), version 13 to 14

### P1. Head, version line

Old:

> Version 13, 2026-10-09. Part of the Beethoven Trial Edition License Agreement (LICENSE.txt) and of any Full Edition agreement that names it. You can save and print this text; it is also at `https://openspineconsortium.com/beethoven/privacy.html`.

New:

> Version 14, 2026-10-11. Part of the Beethoven Trial Edition License Agreement (LICENSE.txt) and of any Full Edition agreement that names it. You can save and print this text; it is also at `https://openspineconsortium.com/beethoven/privacy.html`.

Why: Version 14 dated 2026-10-11, with the agreement's version 13; extension/test/terms.test.ts
reads this line too.

### P2. The table's row on the approval answer

Old:

> | The account name your portal's dashboard showed for the session you signed in to, and the answer of the last approval check: yes or no, the time it was given, the portal it was given for and, when it was no, the address of the page where you can ask for access and the reason the service gave, if it gave one (your account is set up on another installation; this installation is set up for another account; this version is too old) | `storage.local` | to know which account to ask about, and to keep working for a day without asking again | *Disconnect* in Settings; uninstalling |

New:

> | The account name your portal's dashboard showed for the session you signed in to, and the answer of the last approval check: yes or no, the time it was given, the portal it was given for and, when it was no, the address of the page where you can ask for access and the reason the service gave, if it gave one (this installation is set up for another account; this version is too old) | `storage.local` | to know which account to ask about, and to keep working for a day without asking again | *Disconnect* in Settings; uninstalling |

Why: The reasons a no may carry, in the parenthesis, lose "your account is set up on another
installation".

### P3. The table's row on the installation identifier

Old:

> | The last good copy of the withdrawn-versions list, the address of Licensor's access service as read once a day from a small file on Licensor's website, and a random installation identifier the extension makes for itself when you accept the agreement, from the browser's random number generator and from nothing about your device | `storage.local` | to keep working when Licensor's website cannot be reached; to know where the approval check goes; to name your acceptance record and the marker below without naming you; and, sent in the approval check, so that an approval is used from one installation (see *What Licensor receives*) | uninstalling (a reinstallation makes a new identifier) |

New:

> | The last good copy of the withdrawn-versions list, the address of Licensor's access service as read once a day from a small file on Licensor's website, and a random installation identifier the extension makes for itself when you accept the agreement, from the browser's random number generator and from nothing about your device | `storage.local` | to keep working when Licensor's website cannot be reached; to know where the approval check goes; to name your acceptance record and the marker below without naming you; and, sent in the approval check, so that Licensor sees which installations ask about your account (see *What Licensor receives*) | uninstalling (a reinstallation makes a new identifier) |

Why: Why the identifier is sent: no longer "so that an approval is used from one installation" but
so that Licensor sees which installations ask about the account, which is what the service now does
with it.

### P4. What Licensor receives: the approval check

Old:

> - **The approval check.** Once your cluster has accepted your sign-in and the extension knows your account name, it asks Licensor's access service whether that account is approved: when you first sign in to your cluster after you agree, about once a day while it is in use, and again when you open the panel after a day has passed or after a no. The request is sent without cookies, over an encrypted connection, to the address named in the services file below (Licensor's access service, `https://beethoven-access.openspineconsortium.workers.dev`), and carries: the account name your portal's dashboard shows for your session, your portal's hostname, the product name (`bridge`), the extension's version and the random installation identifier described above; like any request, it arrives at a time. The service answers yes or no, and nothing else about you or anyone else. A no may carry one of three reasons: that your account is already set up on another installation (the panel then says so and offers no button: your lab lead moves the approval), that this installation is already set up for another account (the panel says so and offers no button: your lab lead releases it), or that this version is too old (the panel asks you to install the current one from the lab's private listing). The extension keeps a yes for up to a day, and for up to seven days when the service cannot be reached, so an outage on Licensor's side does not stop your work; it keeps a no for ten minutes, and while the answer is no it starts no worker and, unless the reason is one of those three, offers you a button to ask for access. - **Two files, once a day.** `https://openspineconsortium.com/beethoven/services.json` (the address of the access service) and `https://openspineconsortium.com/beethoven/killlist.json` (the signed list of withdrawn extension versions). Both requests are sent without cookies and carry nothing about you beyond what any web request carries (your network address, which the web host's ordinary server logs may record for a short time); the files hold addresses and the list only.

New:

> - **The approval check.** Once your cluster has accepted your sign-in and the extension knows your account name, it asks Licensor's access service whether that account is approved: when you first sign in to your cluster after you agree, about once a day while it is in use, and again when you open the panel after a day has passed or after a no. The request is sent without cookies, over an encrypted connection, to the address named in the services file below (Licensor's access service, `https://beethoven-access.openspineconsortium.workers.dev`), and carries: the account name your portal's dashboard shows for your session, your portal's hostname, the product name (`bridge`), the extension's version and the random installation identifier described above; like any request, it arrives at a time. The service answers yes or no, and nothing else about you or anyone else. A no may carry one of two reasons: that this installation is already set up for another account (the panel says so and offers no button: your lab lead releases it), or that this version is too old (the panel asks you to install the current one from the lab's private listing). The extension keeps a yes for up to a day, and for up to seven days when the service cannot be reached, so an outage on Licensor's side does not stop your work; it keeps a no for ten minutes, and while the answer is no it starts no worker and, unless the reason is one of those two, offers you a button to ask for access. - **Two files, once a day.** `https://openspineconsortium.com/beethoven/services.json` (the address of the access service) and `https://openspineconsortium.com/beethoven/killlist.json` (the signed list of withdrawn extension versions). Both requests are sent without cookies and carry nothing about you beyond what any web request carries (your network address, which the web host's ordinary server logs may record for a short time); the files hold addresses and the list only.

Why: Three reasons become two, and the sentence about the first ("the panel then says so and offers
no button: your lab lead moves the approval") goes with it; the bullet is otherwise word for word.

### P5. What Licensor records, and the installations paragraph

Old:

> **What Licensor records from the checks.** One record for each account and product: the account name, the product, and the portal hostname and the version of the latest check; when the account was first and last checked; how many checks there have been; the answer of the latest check and, with a no, the reason the service gave, if any (another installation, another account, a version too old); when the answer last changed; and a salted hash of the network address of the latest check (the address itself is not kept). The service also counts each day's checks per account and per hashed address, to limit them, and deletes those counts after two days. This record sits with your access record.
> **One approved account, one installation.** The first installation that asks about an approved account is bound to it: the service keeps that installation's identifier with the product, the version and the times it first and last asked, and, for that identifier, the account it is bound to. A check for the same account from any other installation (another computer, another browser profile, a reinstallation) is refused, and so is a check from that installation for any other account; the service counts such refusals and keeps the times of the first and the last one and the first eight characters of a one-way hash of the refused installation's identifier. When another installation asks about an account, the service e-mails Licensor, at most once a day per account, with a link that can move the approval to that installation, so that Licensor can move it or withdraw it. The identifier is random: it is not read from your device or derived from it, and Licensor cannot tell from it which computer it is on. One account is the exception: the account the store's reviewers use with the lab's mock portal (`st1234`) is approved only in a check whose portal is on the reviewer's own computer (`localhost`), from any installation, and binds none; from any other portal it is answered as an unknown account is, and nothing is bound or e-mailed.

New:

> **What Licensor records from the checks.** One record for each account and product: the account name, the product, and the portal hostname and the version of the latest check; when the account was first and last checked; how many checks there have been; the answer of the latest check and, with a no, the reason the service gave, if any (another account, a version too old); when the answer last changed; and a salted hash of the network address of the latest check (the address itself is not kept). The service also counts each day's checks per account and per hashed address, to limit them, and deletes those counts after two days. This record sits with your access record.
> **Your installations.** Your approval works from every installation of your own: a second computer, another browser profile or a reinstallation is approved at its first check. For each approved account the service keeps the installations the account has asked from, up to the ten most recently seen, each with its identifier, the product, the version and the times it first and last asked, and, for each identifier, the account it is bound to. An installation serves one account: the first approved account it asks about is bound to it, and a check from it for any other account is refused (the panel says so and offers no button: your lab lead releases it); the service counts such refusals and keeps the times of the first and the last one and the first eight characters of a one-way hash of that installation's identifier. When a new installation asks about an account, the service e-mails Licensor, at most once a day per account, a notice with a link that can withdraw the approval; nothing is refused by the notice, and there is no link to move an approval, since nothing needs moving. The identifier is random: it is not read from your device or derived from it, and Licensor cannot tell from it which computer it is on. One account is the exception: the account the store's reviewers use with the lab's mock portal (`st1234`) is approved only in a check whose portal is on the reviewer's own computer (`localhost`), from any installation, and binds none; from any other portal it is answered as an unknown account is, and nothing is bound or e-mailed.

Why: The record's list of reasons loses "another installation". The paragraph "One approved account,
one installation" becomes "Your installations", in the same terms as LICENSE 3(e) and 10(a): every
installation of the student's own is approved at its first check; up to the ten most recently seen
are kept per account; an installation serves one account, and a check from it for another is refused
with no button until the lab lead releases it; the notice e-mail carries a link that can withdraw
the approval and none to move one. The sentences on the random identifier and on the reviewers' mock
account (st1234) are word for word.

### P6. Your access record

Old:

> **Your access record.** Licensor's records hold the approval and withdrawal decisions about your account (an approval is for Beethoven, or for membership of Licensor's lab only), with the name and e-mail you gave when you asked, their dates, the installation your approval is bound to, and the check record above. Licensor does not publish the list of approved accounts: the access service answers about one account at a time. The same approved list serves Licensor's other product, an extension for VS Code, so one approval covers both.

New:

> **Your access record.** Licensor's records hold the approval and withdrawal decisions about your account (an approval is for Beethoven, or for membership of Licensor's lab only), with the name and e-mail you gave when you asked, their dates, the installations your account has asked from, and the check record above. Licensor does not publish the list of approved accounts: the access service answers about one account at a time. The same approved list serves Licensor's other product, an extension for VS Code, so one approval covers both.

Why: "the installation your approval is bound to" becomes "the installations your account has asked
from".

### P7. What you can do

Old:

> Remove the site permission or uninstall the extension at any time; leave *Remember it on this computer* unticked, or press *Forget* beside *Grid sign-in* in Settings to delete a saved grid sign-in (and then delete its passkey, named with your account name followed by "(grid)", in your list of passkeys if it is still there); press *Forget* on the note in Settings about a key an earlier version added; have the line an earlier version added to your cluster account removed (ask your lab lead, or run `hpcworker browser-key remove` in a terminal on the cluster); remove a Bridge an earlier version had you install (on Windows from Settings, Apps; on a Mac or on Linux, and for a Bridge installed from a zip file with Beethoven 14.0.0 or earlier, with its uninstaller); remove the key of the one-time step from your cluster account with `hpcworker login-setup --remove`; ask Licensor to move your approval to another installation, or for a copy or deletion of your access records (deletion of your access record ends your approval and with it the license). Michigan residents and residents of other states may have further rights under their state's laws; Licensor honours requests it is obliged to honour and answers others where it reasonably can. Beethoven is offered in the United States.

New:

> Remove the site permission or uninstall the extension at any time; leave *Remember it on this computer* unticked, or press *Forget* beside *Grid sign-in* in Settings to delete a saved grid sign-in (and then delete its passkey, named with your account name followed by "(grid)", in your list of passkeys if it is still there); press *Forget* on the note in Settings about a key an earlier version added; have the line an earlier version added to your cluster account removed (ask your lab lead, or run `hpcworker browser-key remove` in a terminal on the cluster); remove a Bridge an earlier version had you install (on Windows from Settings, Apps; on a Mac or on Linux, and for a Bridge installed from a zip file with Beethoven 14.0.0 or earlier, with its uninstaller); remove the key of the one-time step from your cluster account with `hpcworker login-setup --remove`; ask Licensor to release an installation that is bound to another account, or for a copy or deletion of your access records (deletion of your access record ends your approval and with it the license). Michigan residents and residents of other states may have further rights under their state's laws; Licensor honours requests it is obliged to honour and answers others where it reasonably can. Beethoven is offered in the United States.

Why: "ask Licensor to move your approval to another installation" becomes "ask Licensor to release
an installation that is bound to another account": there is nothing to move.

### P8. Changes, a new entry

Old:

> (none)

New:

> Version 14 (2026-10-11, Beethoven 20.0.0): your approval works on every installation of your own: a second computer, browser profile or reinstall is approved at its first check instead of refused, Licensor's service keeps the list of the ten most recent installations your account asked from and tells Licensor of a new one by e-mail with a link to withdraw the approval and none to move it; an installation still serves one account. Version 13's other terms are unchanged.

Why: The entry at the top of the list says what version 14 changes, as every earlier version's entry
does.

## Questions for counsel

1.  3(e) says the approval covers "the computers and browser profiles you use yourself, as many as you
    need", and 3(b) still forbids sharing. Is that clear for a lab's shared workstation, where the
    student uses their own Chrome profile on a computer others also use? The texts mean yes (the
    installation is the student's profile), but they do not say it in terms.
2.  The service now keeps up to ten installation identifiers per approved account, for as long as the
    approval lasts (until it is removed, or the installations are cleared). The privacy statement says
    what is kept and that the ten most recently seen are; it does not give a period in days. Should it
    say "until your approval is removed" in so many words?
3.  The notice e-mail lets Licensor withdraw an approval with one press. The maintainer's own documents
    say to ask the student first, since the account name in a check is not proved and anyone who knows
    an AccessID can cause the e-mail; the agreement's 3(d) allows withdrawal "for any other reason".
    Should the agreement promise a question before a withdrawal for an unknown installation?
4.  Students on 19.0.0 accepted version 12, which says a second installation is refused. The access
    service applies the new rule as soon as it is deployed, before they accept version 13 with 20.0.0.
    The practice is more generous than the text they accepted; is a sentence needed anywhere for that
    interval?
5.  Both texts are dated 2026-10-11, the day of the decision; the store build that ships them is not
    made yet. The website's `terms.html` and `privacy.html` are regenerated from these files by the site
    repository's `tools/build_site.py`; the store upload waits until
    `https://openspineconsortium.com/beethoven/privacy.html` shows version 14.

Checked on 2026-10-11, on this branch with the review's fixes: `npm run build` (whose
`sync-profiles` copies the three texts into `extension/public/` byte for byte) reads `Version 13,
2026-10-11` as matching `TERMS_VERSION` and `TERMS_DATE` and makes both builds at 20.0.0; `npx tsc
--noEmit` is clean; the whole suite gives 45 files, 763 tests passed and 5 skipped. Not yet
measured: a second installation against the deployed access service, which waits on that service's
merge, and the hand test in `docs/store/TEST_BEFORE_UPLOAD.md`, step 18.
