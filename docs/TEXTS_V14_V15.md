# Beethoven texts for 20.0.0's public listing: agreement version 14, privacy statement version 15

Drafted 2026-10-13 for Greg and for counsel, with the change of the listing's visibility. **This is
drafting, not legal advice.** No lawyer has read these texts or this note; the questions at the end
are for one.

What changed, in one paragraph: `LICENSE.txt` goes from version 13 (2026-10-11) to version 14
(2026-10-13) and `PRIVACY.md` from version 14 to version 15 (2026-10-13), because the maintainer
decided on 2026-10-13 that 20.0.0 goes to the Chrome Web Store as a Public item ("i want to release
20 and public"), where 8.0.0 to 19.0.0 were a Private item open only to the Google accounts in the
lab's Google Group `Beethoven-users`. Installing the extension needs no invitation now (the listing's
regions stay the United States, so the texts never say "anyone"); the approval check of
section 3 still decides whether it works for an account, so nothing the agreement protected by the
group is lost: the group was a second gate the approval made redundant. With it go the request
page's Google account (the invitation it served is no longer sent) and the access service's
invitation step and daily reminder. A Google account given on the request page before this version
stays in the access record and is no longer used; the texts say so. Version 13 and 14 were drafted
for 20.0.0 on 2026-10-11 and never shipped (20.0.0 was not uploaded before this change), so 19.0.0's
students, who accepted version 12, are shown version 14 with 20.0.0 and accept it again. Every other
term, the section numbers 1 to 23 and the welcome page's four summary lines are unchanged, so
`summary_sha256` is unchanged.

Sources: the maintainer's message of 2026-10-13 in the Symphony project ("the store accepted 19 but i
want to release 20 and public, do everything i have to"); the site generator's `BROWSERS` table
(`store_url`, which now links the listing) and the access service's branch `claude/public-listing`
(OpenSpineConsortium/beethoven-access: `google_account` optional on `POST /request`, the invitation
reminder no longer sent, the approval mails pointing at the site's Install section), which the texts
describe. The quotations below are unwrapped (in the files each touched paragraph is wrapped at 100
columns).

Kept as they were:

-  Both texts stay plain ASCII with LF line endings. The agreement's version line is `Version 14,
   2026-10-13.` at the start of a line, as `extension/scripts/sync-profiles.mjs` and
   `extension/test/terms.test.ts` read it; the privacy statement's is `Version 15, 2026-10-13.`
-  The welcome page's four summary lines (`SUMMARY` in `extension/src/core/terms.ts`) and the tick's
   sentence, word for word.
-  Section 3(b) (sharing is a breach), 3(e) but for its last sentence (every installation of the
   student's own; one account per installation), 10(a) (the approval check and what it sends), the dispute, liability and risk
   terms, and the retention periods.

## The agreement (`LICENSE.txt`), version 13 to 14

### L1. Head, version line

Old:

> Version 13, 2026-10-11. Applies to the Trial Edition of Beethoven 20.0.0 and later versions that ship this text, as distributed through its private listing on the Chrome Web Store, which only the Google accounts Licensor has invited can open.

New:

> Version 14, 2026-10-13. Applies to the Trial Edition of Beethoven 20.0.0 and later versions that ship this text, as distributed through its public listing on the Chrome Web Store, which needs no invitation to open or install from; the approval of section 3 decides whether it works for you.

Why: the listing is public, so the sentence that said who can open it would be false; the new
sentence says what gates use instead.

### L2. Section 3(a), the request

Old:

> ... with your account name and the Google account at which you are to receive the invitation to the Extension's private listing, and may be refused ...

New:

> ... with your account name, and may be refused ...

Why: no invitation is sent, so no Google account is asked for.

### L3. Section 3(e), the last sentence

Old:

> ... the current version is on the private listing.

New:

> ... the current version is the one on the Chrome Web Store, which your browser installs by itself (section 17).

### L4. Section 10(d), the access records

Old:

> ... your institutional e-mail, the Google account at which you are to receive the invitation to the private listing (Licensor adds it to the Google Group that may open that listing), what you will use Beethoven for and, if you attach one, your CV; ...

New:

> ... your institutional e-mail, what you will use Beethoven for and, if you attach one, your CV (a Google account given on the request page before version 14 of this agreement, for the invitation the then private listing needed, stays in the record and is no longer used); ...

Why: the record no longer takes a Google account, and the ones taken before stay in the records the
service already holds, so the text says both.

### L5. Section 17, updates

Old:

> Updates to the Extension are distributed through its private listing on the Chrome Web Store, and your browser installs them by itself.

New:

> Updates to the Extension are distributed through its listing on the Chrome Web Store, and your browser installs them by itself.

## The privacy statement (`PRIVACY.md`), version 14 to 15

### P1. Head, version line

`Version 14, 2026-10-11.` becomes `Version 15, 2026-10-13.`

### P2. The approval check's too-old answer

Old: `(the panel asks you to install the current one from the lab's private listing)`. New: `(the
panel asks you to install the current one from the Chrome Web Store)`. The panel's sentence
(`UPDATE_REQUIRED` in `extension/src/licensing/access.ts`) changes with it: "Install the current
Beethoven from the Chrome Web Store."

### P3. Access requests

Old:

> ... your institutional e-mail, the Google account at which you want the invitation to Beethoven's private listing on the Chrome Web Store, what you will use Beethoven for, ... If you are approved for Beethoven, Licensor adds that Google account to the Google Group whose members may open the private listing; Google then holds it as a member of that group, under Google's own terms.

New:

> ... your institutional e-mail, what you will use Beethoven for, ... If you are approved for Beethoven, you install it from its listing on the Chrome Web Store, which is public since 20.0.0: no invitation is sent, and the request page no longer asks for a Google account. A Google account given on the request page before 2026-10-13, for the invitation the then private listing needed, stays in your access record and is no longer used.

### P4. Changes, a new entry, and version 14's entry

New:

> Version 15 (2026-10-13, Beethoven 20.0.0): Beethoven's listing on the Chrome Web Store is public: installing it needs no invitation, and your approval still decides whether it works. The request page no longer asks for a Google account, since no invitation is sent; a Google account given earlier stays in the access record and is no longer used. Version 14's other terms are unchanged.

Version 14's entry now says it was drafted for 20.0.0 and replaced by version 15 before 20.0.0
shipped, so a reader of the list sees that no one accepted version 14.

## Questions for counsel

1.  The Google accounts taken by the request page until 2026-10-13 stay in the access records with
    no use. Should they be deleted instead, and the texts say so? Deleting them is one admin step in
    the access service.
2.  Students on 19.0.0 accepted version 12. 20.0.0 shows them version 14, whose entry list names
    version 13 as never shipped. Is a one-line note in the welcome page's "What changed" wanted, or
    is the Changes list enough?
3.  Public visibility means the store's own terms for a listed item apply to anyone who installs it,
    approved or not. Section 1's "available only to persons whose institutional account Licensor has
    approved" (3(a)) still holds for use; is a sentence wanted for someone who installs and is never
    approved (the panel offers the request page and starts nothing)?

Checked on 2026-10-13, on this branch: `npm run build`'s `sync-profiles` reads `Version 14,
2026-10-13` as matching `TERMS_VERSION` and `TERMS_DATE`; `npx tsc --noEmit` and the vitest suite are
in the pull request's description. The website's `terms.html` and `privacy.html` are regenerated from
these files by the site repository's `tools/build_site.py`, and the store upload waits until
`https://openspineconsortium.com/beethoven/privacy.html` shows version 15.
