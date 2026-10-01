# Submitting Beethoven to the Chrome Web Store, click by click

For the maintainer. `PASTE.md` beside this file is the paste sheet: every dashboard field in the
dashboard's order, with the text to paste or the file to upload. `LISTING.md` holds the texts and the
reasons behind them; this file says what to do around the paste, in what order. Written 2026-09-29
for 4.0.0 (the first version without licence keys), brought up to date for 6.0.0 and 7.0.0 the same
night, rewritten on 2026-09-30 for 8.0.0, and brought up to date for 9.0.0 the same evening (the
extension's pages in the site's theme with the typefaces bundled, a new icon, new store images and a
short description; no change to permissions, requests, stored data or the agreement texts). Beethoven
is offered in one place only: a **Private** item on the Chrome Web Store, visible to the trusted
testers the maintainer names, a Google Group he keeps with his personal Google account and to which
he adds each student he approves for Beethoven. No other store, no signed file, no download from the
website: the website shows no install link at all, and the item's link goes to approved students
only. Store dashboards move their fields around from time to time; the field names below are the
ones in use at the time of writing, and the texts are what matter.

What one private listing does and does not do, so nobody is told more than is true: only the Google
accounts in the group can open the listing and install from it, and the extension then works only
for an approved AccessID on the one installation that approval is bound to. It does not make a copy
impossible to pass around (an installed extension's files sit in the browser profile), and the
binding is checked by the extension itself against the access service; it keeps an approval from
being shared casually, and the agreement makes sharing a breach.

## 0. Before the first submission

Have these in hand, and check each once:

1. The package, built from a clean tree with Node 22 in `extension/`:
   `npm ci && npm run typecheck && npm test && npm run build && npm run zip`. The file to upload is
   `.output/beethoven-9.0.0-chrome.zip` (the same command also writes a Firefox zip and a sources
   zip; neither is uploaded, and the sources zip is what a reviewer gets if they ask for the mock
   portal, section 4). Confirm it is a release build: `unzip -p .output/beethoven-9.0.0-chrome.zip
   manifest.json` must show `"name":"Beethoven"`, `"version":"9.0.0"`, the 128-character
   `description` in `LISTING.md` ("Starts, watches and stops ..."),
   `"homepage_url":"https://openspineconsortium.com/beethoven/"`,
   `"optional_host_permissions":["https://*/*"]` and no `localhost`,
   `"permissions":["storage","alarms","scripting","activeTab","sidePanel"]`, and no
   `host_permissions` key. No page of the built extension may show the product's old name (`grep
   -ril` over the unpacked zip; the kill-list's format tag inside the bundle is the one allowed
   exception). From 9.0.0 the zip also holds `fonts/`: five IBM Plex and two Newsreader `.woff2`
   files and the two SIL Open Font License texts (`unzip -l` shows them), and nothing else new.
2. The images named in `PASTE.md` (all under `extension/store-assets/`; its `manifest.txt` says how
   each was made): the 128x128 store icon, five screenshots 1280x800, the 440x280 tile and the
   1400x560 marquee, each PNG without alpha or JPEG at the exact size (`PASTE.md` has a one-line
   check), and the promo video file, which goes to YouTube, not to the dashboard. Look at each one
   before it is uploaded.
3. The five public pages, live and answering 200: `https://openspineconsortium.com/beethoven/`,
   `.../beethoven/privacy.html` (the text of `PRIVACY.md` version 8), `.../beethoven/terms.html`
   (the text of `LICENSE.txt` version 7), `.../beethoven/support.html` and
   `.../beethoven/request.html` (which must fill its AccessID field from `?access_id=<account>`,
   since the panel's *Ask for access* button opens it that way, and which asks for the Google
   account the invitation goes to). The pages show one install card, "Private listing, by
   invitation", and no download and no other browser. Reviewers open the privacy URL; a 404 there is
   a rejection. `docs/PUBLISHING_SITE.md` builds and checks them.
4. `https://openspineconsortium.com/beethoven/killlist.json`, the signed list of withdrawn
   versions the extension fetches once a day, published with `Access-Control-Allow-Origin: *`. The
   extension works without it (it keeps the last good list and refuses only on a verified
   revocation), but a reviewer watching the network will see a 404 otherwise.
5. The access service, with the one-installation rule.
   `https://openspineconsortium.com/beethoven/services.json` must carry the `access_check` address
   on the service's second name,
   `https://beethoven-access.openspineconsortium.workers.dev/access_check`, and the mock's username
   `st1234`, which the reviewer recipe in `LISTING.md` runs with, must answer yes **from any
   installation**: every reviewer's installation is a new one, and a second installation of any
   other account is refused. From WSL (Windows sockets flake), two checks with two different
   installation identifiers:
   `curl -s -X POST -H 'content-type: text/plain;charset=UTF-8' --data '{"v":1,"access_id":"st1234","portal":"localhost","product":"bridge","version":"9.0.0","install_id":"00000000000000000000000000000001"}' https://beethoven-access.openspineconsortium.workers.dev/access_check`
   and the same with `...0002`. Both must answer `{"approved":true,"access_id":"st1234",...}` with
   `access-control-allow-origin: *`. If the second answers `"reason":"other_installation"`, the
   service does not exempt the reviewer account yet, and a reviewer would see "This account is
   already set up on another computer."; do not submit until it does. The exemption is set with
   `node tools/intake/admin.mjs seat-rule st1234 any` (clearing the seat with `reset-seat st1234`
   only lets the next single installation in). It is set: on 2026-09-30, after the checks of run M in
   `extension/store-assets/e2e/`, `admin.mjs seat st1234` answered `"any_installation": true` with no
   seat and no conflict. Never run this check with a real student's
   AccessID: the first identifier that asks binds that account. If it answers `approved:false`
   without a reason, add the account in the admin console (or `node tools/intake/admin.mjs add
   st1234 "Store reviewer (mock portal)" st1234@wayne.edu "store-reviewer mock username"` in the
   sibling repository of Beethoven for VS Code, Desktop folder `ashley`; token from the vendor
   folder, never on the command line). The `product` field stays `bridge`, the extension's name on
   the wire since 4.0.0.
6. The Google Group of testers, made once at `https://groups.google.com` with the personal Google
   account that owns the developer account: *Create group*; the name "Beethoven-users" and an
   address such as `beethoven-users@googlegroups.com` (whatever is free); who can search for
   the group: only members; who can join: only invited users; who can view members and who can post:
   group managers (nobody writes to it). Add each student approved for Beethoven by the Google
   account they gave on the request form (*Members*, *Add members*; if the page offers only
   *Invite*, the student accepts the invitation Google e-mails them). A student approved for lab
   membership only is not added.
7. The developer account, one person, with a hardware security key or an authenticator app as the
   second factor. Nothing else should hold an OAuth grant on it. No store API key goes into any CI.
8. The name. Beethoven runs Claude Code and is not an Anthropic product; the name carries no
   Anthropic mark, and "Claude" and "Claude Code" appear in the listing only to say what it runs.
   The listing's last paragraph, the landing page and the reviewer notes say so in the same words;
   if a reviewer asks about the marks, answer with that sentence.

## 1. The Chrome Web Store item

Registration (once, about ten minutes):

1. Sign in to the personal Google account. Turn on 2-Step Verification at
   `https://myaccount.google.com/signinoptions/two-step-verification` and add a hardware security
   key (or an authenticator app); Chrome Web Store requires 2-Step Verification on every developer
   account.
2. Open `https://chrome.google.com/webstore/devconsole/register`. Accept the Developer Agreement and
   pay the one-time US$5 registration fee.
3. In the dashboard, open **Account**: set the publisher display name (Gregory Schwing, trading as
   OpenSpineConsortium, or the LLC once it exists), verify the contact e-mail, and answer the trader
   / non-trader question (asked of everyone for the EU Digital Services Act; the item is offered in
   the United States only, but the field must be answered). The **Official URL** field lists only
   sites verified in Google Search Console with the same Google account; `PASTE.md`, field 9, gives
   the four steps (a URL-prefix property for `https://openspineconsortium.com/` with an HTML file at
   the site root). The field can stay empty until then.

The item (about thirty minutes):

4. Dashboard, **Items**, **New item**. Drag `beethoven-9.0.0-chrome.zip` in. The item ID appears
   in the URL and in the item header at once; note it: it is the link approved students get
   (section 5), and it goes nowhere public. A draft left from the extension's earlier name can be
   archived (it is hidden from the list and can be shown again; nobody ever saw it), or kept and
   turned into Beethoven by uploading the 9.0.0 zip under its **Package** tab; either ends in the
   same place.
5. **Store listing** tab, from `PASTE.md`, top to bottom: the description (1,049 characters);
   Category Developer Tools; Language English (United States); the store icon; the promo video's
   YouTube link (upload the file as Unlisted first, or leave the field empty); the small promo tile;
   the five screenshots in the order given; the marquee; Official URL (empty until the site is
   verified); Homepage URL `https://openspineconsortium.com/beethoven/`; Support URL
   `https://openspineconsortium.com/beethoven/support.html`; Mature content No. Save draft.
6. **Privacy practices** tab, from `PASTE.md`: the single-purpose statement; one justification per permission
   (`storage`, `alarms`, `scripting`, `activeTab`, `sidePanel`) and the host-permission
   justification for `https://*/*`; "Are you using remote code?" No; Data usage: tick "Personally
   identifiable information" only, with the sentence from `LISTING.md` (the institutional account
   name the portal shows and the random installation identifier, sent in the approval check), and
   leave every other category unticked; tick the three certifications; Privacy policy URL
   `https://openspineconsortium.com/beethoven/privacy.html`. Save draft.
7. **Distribution** tab: Payments Free; Visibility **Private**, and add the address of the
   Beethoven-users group from section 0, item 6. Regions: United States only. Save draft. Chrome's documentation
   (`https://developer.chrome.com/docs/webstore/cws-dashboard-distribution`, read 2026-09-30) says
   that Private lets trusted testers install the item, that besides them "you can also include any
   Google Groups that you own or manage", and that the members of those groups can install it; the
   group must therefore be owned or managed by the Google account of the developer account. Single
   trusted testers, if ever needed, are listed under **Account**, and that list covers every item of
   the developer account, not this one only. The dashboard itself was not opened while this was
   written, so the exact field names may differ. Never choose Unlisted or Public: either would let
   anyone with the link install.
8. **Submit for review** (top right). A Private item is reviewed like a public one.
9. Expected review time: most items are reviewed within a few days; a wildcard optional host
   permission (`https://*/*`) puts the item into in-depth review, and a new developer account with a
   first item adds to that, so allow up to a few weeks. The decision comes by e-mail; a rejection
   names the policy and can be appealed from the dashboard with a written explanation (section 4).

Updating later: **Package**, upload the new zip, submit. Every update is reviewed; students receive
it through Chrome's own update mechanism within hours of publication, and nobody downloads anything.

## 2. The deploy order with the access service

Builds before 8.0.0 send no installation identifier, and the service refuses a check without one
(`"reason":"update_required"`) unless its `REQUIRE_INSTALL_ID` variable is `"0"`. Keep it at `"0"`
while any student, you included, still uses 7.0.0 or an older build, and turn it on (remove it, or
set it to `"1"`, and deploy both service names) once 8.0.0 or later is live on the private listing and
installed by everyone who needs it. Until then an old build keeps working and is not bound to an
installation.

## 3. Approving, moving and withdrawing, day to day

- **A request comes in.** The e-mail names the person, the AccessID, the e-mail, the Google account,
  what they will use Beethoven for, a link to the CV if one was attached, whether the mailbox was
  confirmed, and three choices: *Approve for Beethoven*, *Lab membership only*, *Deny*. For
  *Approve for Beethoven*, add their Google account to the group (section 0, item 6) and send them
  the item's link (`https://chromewebstore.google.com/detail/<item-id>`) with one line: open it in
  Chrome, signed in with that Google account, on the computer you will use; *Add to Chrome*.
- **"... asked from a second installation; it was refused."** The e-mail comes at most once a day
  per account, with *Move the approval to the new installation* and *Withdraw approval*. Move it
  when the student changed computers, Chrome profiles or reinstalled; the new installation works at
  its next check, and the old one stops at its own next check (within a day while it is online). If
  the student does not know of a second installation, the account or the copy is being shared:
  withdraw, and ask. `node tools/intake/admin.mjs seat <AccessID>` shows the binding; `reset-seat
  <AccessID>` clears it so the next installation to ask binds.
- **"This installation of Beethoven is already set up for another account."** A student sees this
  when the installation they use was first used for another approved AccessID: one installation
  serves one account. No e-mail comes for it; `admin.mjs seat <AccessID>` shows it among the
  refusals. Two approved students who share one computer each need a Chrome profile of their own (a
  new profile is a new installation, which binds at its first check); `reset-seat` the account that
  holds this installation only if it should give it up. If neither expected it, one of them is
  lending their installation.
- **Withdrawing.** Withdraw in the admin console (or the e-mail link), and remove the Google account
  from the group so the listing stops offering updates to it; the extension stops starting workers
  at its next check.

## 4. When a reviewer asks for test access

A reviewer may ask for credentials to a live portal. None can be given, and the answer must say so
plainly and offer the next best thing. Reply with this:

```
Thank you for reviewing Beethoven. The extension works only against a university's Open OnDemand portal, which requires a university account, a VPN and a second factor. We cannot issue such an account to a reviewer, and we cannot lend ours: one person, one account is a term of the portal and of Anthropic's Claude service the worker uses.

What we can offer:
1. A mock portal (mock-ood/server.mjs in the extension's project, which we attach as a zip) that serves the same routes the extension uses, with a stand-in scheduler and a stand-in cluster tool, and a recipe to run it in ten minutes on any machine with Node 22 (below). The mock's username is approved on our access service and accepted from any installation, so the extension works against it with nothing to paste; there is no key.
2. [Only if recorded by then: a walk-through of the same flow against the mock, and one against a live university portal with the hostname and the pasted code blurred, so you see exactly what a student sees. Delete this item if there is no recording.]
3. A live screen-share at a time of your choosing, during which you may direct every click.

What the extension does not do, which may be what you need to confirm: it has no host permission, content script or code on claude.ai, anthropic.com or claude.com and only opens those pages in a new tab; it never reads a Claude credential (the user signs in on Anthropic's page and pastes a one-time code that is relayed once to the user's own cluster shell and kept nowhere); it runs no remote code (its daily update check fetches one signed JSON list); it holds no install-time host permission and asks for one origin at the click; the one thing it sends us is the approval check (the account name the portal shows, the portal hostname, the product, the version and a random identifier the extension made for this installation), answered yes or no; no analytics, no error reports, no activation.

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher.
```

Then paste the reviewer recipe from `LISTING.md` under it, and attach
`.output/beethoven-9.0.0-sources.zip`. The two recordings named in `../STORE_LISTING.md` ("Reviewer
access", item 2) have not been made as of 2026-09-30; record them (under five minutes each, the mock
one from the recipe in `LISTING.md`, the live one with the portal hostname and the pasted code
blurred) if you want item 2 in the reply; otherwise leave item 2 out, as the draft says. The mock is
not hosted publicly; the recipe runs it locally.

## 5. After publication: how students install

No developer mode, no file, no download:

- The student, approved for Beethoven and added to the group, opens
  `https://chromewebstore.google.com/detail/<item-id>` in Chrome while signed in to the Chrome Web
  Store with the Google account they gave, clicks **Add to Chrome**, then **Add extension** in the
  browser's own prompt. Anyone else who opens the link sees no item.
- Updates come through Chrome; nothing is downloaded from us.
- The first installation that checks their AccessID is bound to it (section 3).

The landing page `https://openspineconsortium.com/beethoven/` (generated by the site repository's
`tools/build_site.py`; `docs/PUBLISHING_SITE.md`) shows one card, Chrome, "Private listing, by
invitation: after approval you receive an invitation at the Google account you gave", with no link.
It keeps that card after publication: the item's link is never put on the site.
