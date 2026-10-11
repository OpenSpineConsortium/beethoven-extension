# Submitting Beethoven to the Chrome Web Store, click by click

For the maintainer. `PASTE.md` beside this file is the paste sheet: every dashboard field in the
dashboard's order, with the text to paste or the file to upload. `LISTING.md` holds the texts and
the reasons behind them; this file says what to do around the paste, in what order. Written
2026-09-29 for 4.0.0, rewritten on 2026-09-30 for 8.0.0, brought up to date for 9.0.0 and 10.0.0,
brought up to date for 12.0.0 on 2026-10-02, for 15.0.0 on 2026-10-04, for 16.0.0 on
2026-10-08, for 19.0.0 on 2026-10-09, and for 20.0.0 on 2026-10-11. Neither 9.0.0, 10.0.0 nor 11.0.0 was submitted for review; 12.0.0 carried 11.0.0's
changes (the welcome page with one tick, the window-wide panel, no `activeTab`) and its own (the
direct way over ssh through the helper inside the package, the `nativeMessaging` permission, the
Authentication information data type, agreement version 9 and privacy statement version 10), and
15.0.0 added the helper's signed installers for Windows and macOS (agreement version 10, privacy
statement version 11). 16.0.0 removes the direct way whole: one way to the grid, the university's
VPN and the student's own portal, as in 11.0.0; the manifest is 11.0.0's again, the package carries
no helper, and Authentication information is No again (agreement version 11, privacy statement
version 12). 19.0.0 signs in to the grid itself, with the AccessID and password the student types
into its own sheet (saved behind a passkey only if the student ticks *Remember it on this
computer*), and keeps Chrome's sign-in box as the other way: the Chrome manifest adds `webRequest`
and `webRequestAuthProvider` (never `webRequestBlocking`), Authentication information is Yes again,
and the agreement is version 12 and the privacy statement version 13. 17.0.0 and 18.0.0 were not
submitted with texts of their own. 20.0.0 (2026-10-11) changes no permission and no data type: an
approved account now works from every installation of its own, the service keeping the ten most
recent and e-mailing the maintainer of a new one with a link to withdraw and none to move, and the
agreement is version 13 and the privacy statement version 14. Beethoven is offered in one place only: a **Private** item on the Chrome Web Store,
visible to the trusted testers the maintainer names, a Google Group he keeps with his personal
Google account and to which he adds each student he approves for Beethoven. No other store, no
download from the website and no signed file: the website shows no install link at all, the package
is the extension alone, and the item's link goes to approved students only. Store dashboards move
their fields around from time to time; the field names below are the ones in use at the time of
writing, and the texts are what matter.

What one private listing does and does not do, so nobody is told more than is true: only the Google
accounts in the group can open the listing and install from it, and the extension then works only
for an approved AccessID, from the installations of that person's own (since 20.0.0; 8.0.0 to 19.0.0
bound an approval to one installation). It does not make a copy impossible to pass around (an
installed extension's files sit in the browser profile), and the check is made by the extension
itself against the access service, which records every installation an account asks from and tells
the maintainer of a new one; it keeps an approval from being shared casually, and the agreement
makes sharing a breach.

## 0. Before the first submission

Have these in hand, and check each once:

1. The package, made on the maintainer's own computer once the version is raised, committed on
   `main` and pushed: in `extension/`, `npm ci`, `npm run typecheck`, `npm test`, `npm run build`
   and `npm run zip`, which writes `extension/.output/beethoven-20.0.0-chrome.zip`. Copy it to
   `release/20.0.0/beethoven-20.0.0-chrome.zip` and record the folder as 14.0.0's was
   (`release/14.0.0/README.md`: a `README.md`, `guides/` and `SHA256SUMS.txt`); the zip itself stays
   out of the repository (`.gitignore`) and the committed checksums pin it, so a later build, which
   rewrites `.output/`, cannot be mistaken for it. The hand test (`TEST_BEFORE_UPLOAD.md`) comes
   between the build and the upload. The upload is the maintainer's own tool, `node
   extension/scripts/publish-store.mjs upload --publisher <id> --item <id> --zip
   release/20.0.0/beethoven-20.0.0-chrome.zip`, with `--publish` to submit it for review in the same
   run (item 7; its header says how it signs in; the first submission goes by hand, section 1, item
   4), or by hand under the item's **Package** tab. Nothing is signed and nothing is built outside
   `extension/`: 20.0.0, like 16.0.0, has no helper, no installer and no signing step. `npm run
   zip` also writes a Firefox zip and a sources zip; neither is uploaded or sent to anyone. A
   reviewer who asks for the mock portal gets `release/20.0.0/reviewer/beethoven-mock-portal.zip`,
   which holds the mock (20.0.0's, with `--auth basic`) and no extension code (section 4); make it
   by hand after the record, as 12.0.0's was
   (`release/12.0.0/README.md`, "The reviewers' mock portal"). Confirm it is a release build: `unzip
   -p release/20.0.0/beethoven-20.0.0-chrome.zip manifest.json` must show `"name":"Beethoven"`,
   `"version":"20.0.0"`, the 128-character `description` in `LISTING.md`,
   `"homepage_url":"https://openspineconsortium.com/beethoven/"`,
   `"optional_host_permissions":["https://*/*"]` and no `localhost`, the six permissions `storage`,
   `alarms`, `scripting`, `sidePanel`, `webRequest` and `webRequestAuthProvider`, all under
   `permissions`, and nothing else (no `activeTab` since 11.0.0, no `nativeMessaging` since 16.0.0,
   never `webRequestBlocking`), no `host_permissions` key and no `"key"`.
   `unzip -l` must list `fonts/` (eight `.woff2` files and two `-OFL.txt` texts) and no `bridge/`:
   no `.msi`, no `.pkg`, no script zip, nothing bound to the store item. No page of the built
   extension may show the product's old name (`grep -ril` over the unpacked zip; the kill-list's
   format tag inside the bundle is the one allowed exception).
2. The images named in `PASTE.md` (all under `extension/store-assets/`; its `manifest.txt` says how
   each was made). **The five screenshots must be captured again from the 20.0.0 build**
   (`LISTING.md`, "Images and the promo video"; none exists yet); the promo video field stays empty
   until a 20.0.0 video exists. Each PNG without alpha or JPEG at the exact size (`PASTE.md` has a
   one-line check). Look at each one before it is uploaded.
3. The five public pages, live and answering 200: `https://openspineconsortium.com/beethoven/`,
   `.../beethoven/privacy.html` (the text of `PRIVACY.md` version 14), `.../beethoven/terms.html`
   (the text of `LICENSE.txt` version 13), `.../beethoven/support.html` and
   `.../beethoven/request.html` (which must fill its AccessID field from `?access_id=<account>`,
   since the panel's *Ask for access* button opens it that way, and which asks for the Google
   account the invitation goes to). The pages show one install card, "Private listing, by
   invitation", and no download and no other browser. Reviewers open the privacy URL; a 404 there is
   a rejection. `docs/PUBLISHING_SITE.md` builds and checks them. **The upload waits until
   https://openspineconsortium.com/beethoven/privacy.html shows version 14**: 19.0.0's Authentication
   information answer and its two permissions rest on that text, and 20.0.0's installation rule too, and the reviewers page
   (`/beethoven/reviewers.html`) must carry `LISTING.md`'s negative-statement block word for word.
4. `https://openspineconsortium.com/beethoven/killlist.json`, the signed list of withdrawn
   versions the extension fetches once a day, published with `Access-Control-Allow-Origin: *`.
5. The access service, with the installation rule of 20.0.0 (an approved account from every
   installation of its own; an installation serves one account):
   `https://openspineconsortium.com/beethoven/services.json` must carry the `access_check` address
   `https://beethoven-access.openspineconsortium.workers.dev/access_check`, and the mock's username
   `st1234` must answer yes **from any installation**, at portal `localhost` only. From WSL (Windows
   sockets flake), two checks with two different installation identifiers: `curl -s -X POST -H
   'content-type: text/plain;charset=UTF-8' --data
   '{"v":1,"access_id":"st1234","portal":"localhost","product":"bridge","version":"20.0.0","install_id":"00000000000000000000000000000001"}'
   https://beethoven-access.openspineconsortium.workers.dev/access_check` and the same with
   `...0002`. Both must answer `{"approved":true,"access_id":"st1234",...}` with
   `access-control-allow-origin: *`. If the second answers `"reason":"other_installation"`, the
   service is still the one of 8.0.0 to 19.0.0, which bound an account to one installation, and the
   mock account's exemption is missing: deploy the service of 2026-10-11, or `admin.mjs seat-rule
   st1234 any` in the access service's own repository, `OpenSpineConsortium/beethoven-access`
   (`tools/intake/` of Beethoven for VS Code until 2026-10-07; token from the vendor folder, never
   on the command line). Never run this check with a real student's AccessID: the identifier is
   recorded against that account as one of its installations, bound to it, and the maintainer is
   e-mailed about a new installation. The access service of 2026-10-01 (st1234 only at `localhost`,
   a public `GET /allowlist` that names nobody) must be deployed under both names first, in the
   order the 10.0.0 text of this file gave (git history of this file, section 0, item 5). 12.0.0,
   15.0.0, 16.0.0 and 19.0.0 change nothing in the check: no new field, and it is sent only after
   the portal has shown the account name. In 19.0.0 that name is still the one the portal's
   dashboard shows, never the AccessID typed into the sign-in sheet.
6. The Google Group of testers, made once at `https://groups.google.com` with the personal Google
   account that owns the developer account: the name "Beethoven-users"; who can search for the group:
   only members; who can join: only invited users; who can view members and who can post: group
   managers. Add each student approved for Beethoven by the Google account they gave on the request
   form. A student approved for lab membership only is not added.
7. The developer account, one person, with a hardware security key or an authenticator app as the
   second factor. The one OAuth grant on it is the maintainer's own upload tool
   (`extension/scripts/publish-store.mjs`: a Desktop OAuth client in his own Google Cloud project, its
   saved sign-in in the vendor folder on his own computer; the tool's own header says how it is run);
   nothing else should hold one. No store sign-in or API key goes into any CI.
8. The name. Beethoven runs Claude Code and is not an Anthropic product; the name carries no
   Anthropic mark, and "Claude" and "Claude Code" appear in the listing only to say what it runs.
9. **The grid side.** The lab's shared copy of the cluster-side tool, published to the site's
   shared folder with hpcworker's `tools/deploy_shared.sh` (`docs/guides/LAB_LEAD.md`), and the
   student's account able to read it. A reviewer never reaches the grid, but every student does: a
   student whose account cannot use the copy yet sees "Your grid account can't use the lab's copy
   yet. Ask your lab lead." 12.0.0 to 15.0.0 also needed framework 11's gate and `hpcworker
   browser-key check` on the grid before the listing went live, and the two signing memberships
   for the helper's installers (Apple Developer Program, Azure Artifact Signing); 16.0.0 and 19.0.0
   need none of it, and never call the shared copy outdated.

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
   / non-trader question. The **Official URL** field lists only sites verified in Google Search
   Console with the same Google account; `PASTE.md`, field 9, gives the four steps.

The item (about thirty minutes):

4. The item ID. If the item exists already (a draft or an earlier version), its ID is in its
   dashboard address. If not: Dashboard, **Items**, **New item**, and drag in the package (section
   0, item 1). The item ID appears in the URL and in the item header at once; note it: it is the
   link approved students get (section 5) and the `--item` of the upload tool, and it goes nowhere
   public. Nothing in the package depends on it: 19.0.0 carries no installer bound to the item
   (15.0.0's were built for its ID, which is why the ID then had to come before the package).
   Submitting comes last, at item 9, once every tab below is filled.
5. **Store listing** tab, from `PASTE.md`, top to bottom: the description (1,570 characters);
   Category Developer Tools; Language English (United States); the store icon; the promo video field
   empty; the small promo tile; the five screenshots captured from 19.0.0, in the order given; the
   marquee; Official URL (empty until the site is verified); Homepage URL
   `https://openspineconsortium.com/beethoven/`; Support URL
   `https://openspineconsortium.com/beethoven/support.html`; Mature content No. Save draft.
6. **Privacy practices** tab, from `PASTE.md`: the single-purpose statement; one justification per
   permission, six of them (`storage`, `alarms`, `scripting`, `sidePanel`, `webRequest`,
   `webRequestAuthProvider`), and the host-permission justification for `https://*/*`; "Are you
   using remote code?" No; Data usage: tick "Personally identifiable information" and
   "Authentication information", each with its sentence from `PASTE.md`, and leave every other
   category unticked; tick the three certifications; Privacy policy URL
   `https://openspineconsortium.com/beethoven/privacy.html` (version 14 live). Save draft.
7. **Distribution** tab: Payments Free; Visibility **Private**, and add the address of the
   Beethoven-users group from section 0, item 6. Regions: United States only. Save draft. Chrome's
   documentation (`https://developer.chrome.com/docs/webstore/cws-dashboard-distribution`, read
   2026-09-30) says that Private lets trusted testers install the item and that "you can also include
   any Google Groups that you own or manage". Never choose Unlisted or Public.
8. **Test instructions** tab (under **Access** in the left menu), from `PASTE.md`: the username
   sentence, the password sentence (the mock's made-up password, never a real one), and the
   Additional instructions (494 characters, within the box's 500). Save changes. Before pasting,
   walk the instructions on the 19.0.0 build
   (`TEST_BEFORE_UPLOAD.md`, "Just before uploading"). The fuller text below them in `PASTE.md` is
   not pasted: it goes into a reply if a reviewer asks (section 4).
9. **Submit for review** (top right). A Private item is reviewed like a public one.
10. Expected review time: a wildcard optional host permission puts the item into in-depth review,
    and a new developer account with a first item adds to that, so allow up to a few weeks. (12.0.0
    to 15.0.0's native-messaging permission and the helper's scripts and signed installers inside
    the package would have invited a closer look; 16.0.0 had neither. 19.0.0's `webRequest`
    permission invites a closer look again, though it acts only on its own sign-in: allow for it.) The decision
    comes by
    e-mail; a rejection names the policy and can be appealed from the dashboard with a written
    explanation (section 4).

Updating later: raise the version, commit and push, build and record the package (section 0, item
1), then `node extension/scripts/publish-store.mjs upload ... --publish`, which uploads the zip and
submits it for review; by hand, **Package**, upload the new zip, submit. Every update is reviewed;
students receive it through Chrome's own update mechanism within hours of publication, and nothing
else of Beethoven is on the student's computer to update (12.0.0 to 15.0.0's helper was; a copy
updated from one of them loses the `nativeMessaging` permission without a prompt, removes what the
direct way left in the browser on its first run, and notes once in Settings a key an earlier version
added to the grid account). An update to 19.0.0 adds `webRequest` and `webRequestAuthProvider`,
neither of which shows a line in Chrome's install dialog, so Chrome does not disable the installed
copy or ask the student anything; an update to 20.0.0 changes no permission at all. The changed
agreement (version 13) is shown again on the first run and accepted again before Beethoven does
anything.

## 2. The deploy order with the access service

Unchanged from 8.0.0: builds before 8.0.0 send no installation identifier, and the service refuses a
check without one (`"reason":"update_required"`) unless its `REQUIRE_INSTALL_ID` variable is `"0"`.
Keep it at `"0"` while anyone still uses 7.0.0 or older, and turn it on once 8.0.0 or later is live on
the private listing and installed by everyone who needs it.

The grid side has no order of its own since 16.0.0: the lab's shared copy is published as section 0,
item 9 says, and a student who meets it before their account can read it sees "Your grid account
can't use the lab's copy yet. Ask your lab lead." (12.0.0 to 15.0.0 needed framework 11's gate on
the grid before the listing went live, and refused an older copy; 16.0.0 has no such condition and
never calls the shared copy outdated.)

## 3. Approving, moving and withdrawing, day to day

- **A request comes in.** The e-mail names the person, the AccessID, the e-mail, the Google account,
  what they will use Beethoven for, a link to the CV if one was attached, whether the mailbox was
  confirmed, and three choices: *Approve for Beethoven*, *Lab membership only*, *Deny*. For
  *Approve for Beethoven*, add their Google account to the group (section 0, item 6) and send them
  the item's link (`https://chromewebstore.google.com/detail/<item-id>`) with one line: open it in
  Chrome, signed in with that Google account, on the computer you will use; *Add to Chrome*; then
  follow `docs/guides/INSTALL.md` (send it, or the support page).
- **"Beethoven: <name> (<AccessID>) is using a new installation."** A notice, since 20.0.0: the
  student's second computer, another Chrome profile or a reinstallation was approved at its first
  check, and the e-mail says so, at most once a day per account, with one link, *Withdraw approval*,
  for the case where the student knows of no such installation (ask them first). There is no Move
  link and nothing to move; the service of 8.0.0 to 19.0.0 refused the second installation and
  offered a move instead. The access service's `admin.mjs seat <AccessID>` shows the account's
  installations; `reset-seat <AccessID>` forgets them.
- **"This installation of Beethoven is already set up for another account."** One installation serves
  one account; two approved students who share a computer each need a Chrome profile of their own.
- **Withdrawing.** Withdraw in the admin console (or the e-mail link), and remove the Google account
  from the group. The extension stops starting workers at its next check. **A key line a 12.0.0 to
  15.0.0 build put in the student's grid account is not removed by withdrawing**: 16.0.0 and later
  never touch it, its Settings tells the student such a key exists ("A key from an earlier version")
  and that their lab lead can remove it, and `docs/guides/LAB_LEAD.md`, section 5, says how.

## 4. When a reviewer asks for test access

A reviewer may ask for credentials to a live cluster. None can be given, and the answer must say so
plainly and offer the next best thing. Reply with this:

```
Thank you for reviewing Beethoven. The extension works only against a university's cluster, which requires a university account with its password and a second factor, and a VPN. We cannot issue such an account to a reviewer, and we cannot lend ours: one person, one account is a term of the university and of Anthropic's Claude service the worker uses.

What we can offer:
1. A mock portal, attached as beethoven-mock-portal.zip: a small Node 22 server that serves the same routes the extension uses on the portal, including the portal's HTTP sign-in, with a stand-in scheduler and a stand-in cluster tool; it contains no extension code. The recipe below runs it with the item you installed from the store; it needs Node 22, bash and openssl, and we have run it end to end only on Windows, with Git for Windows. The mock's username, st1234, with the made-up password mockpass, is approved on our access service for a portal at localhost and accepted from any installation.
2. [Only if recorded by then: a walk-through of the same flow against the mock, and one against the real cluster with the AccessID, the codes and the key fingerprint blurred. Delete this item if there is no recording.]
3. A live screen-share at a time of your choosing, during which you may direct every click.

What the extension does not do, which may be what you need to confirm: it has no host permission, content script or code on claude.ai, anthropic.com or claude.com and only opens those pages in a new tab; it never reads a Claude credential (the user signs in on Anthropic's page and pastes a one-time code that is relayed once to the user's own cluster shell and kept nowhere); the cluster password the user types into its own sign-in sheet goes only to the user's portal, as the answer to the HTTP sign-in the portal asks of the extension's own background request, once per check, never to a tab's, a proxy's or another site's, and nothing more after the first refusal (Chrome re-sends its cached copy once for each request already started with it before the first refusal comes back; Beethoven then sends at most one; when the answered request is abandoned before the grid replies, Chrome may re-send that copy once. How many of these the grid counts is not yet measured; the webRequest and webRequestAuthProvider permissions serve only that; no webRequestBlocking); it keeps that password only if the user ticks "Remember it on this computer", encrypted under a key the user's passkey releases, and never sends it to us or writes it to a log; it fills in no sign-in page or identity provider and touches no multi-factor step; it asks for no native-messaging permission and installs nothing outside the browser; it runs no remote code (its daily update check fetches one signed JSON list); it holds no install-time host permission, asks for one origin at a time and only inside a click, and refuses an address on claude.ai, anthropic.com or claude.com before any permission request; the one thing it sends us is the approval check (the account name the portal shows, the portal hostname, the product, the version and a random identifier the extension made for this installation), answered yes or no; no analytics, no error reports, no activation.

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher.
```

Then paste under it the fuller text from `PASTE.md` (section "Test instructions tab", the block
after "The fuller text, for a reply to a reviewer"), and attach
`release/19.0.0/reviewer/beethoven-mock-portal.zip`: the mock, its stand-in scheduler and cluster
tool and its one dependency (`ws`), and no extension code. Never attach
`.output/beethoven-<version>-sources.zip`: it holds the extension's full source, which is not handed
out. The recipe in `LISTING.md` is the same flow at more length, for a follow-up question. The mock
flow of 11.0.0 (scenarios 0 to 12) has not been run on a 19.0.0 build, in `--auth basic` or not
(nor on a 16.0.0 build; nor on a 12.0.0 or 15.0.0 build, whose harness ran the direct way against
a local grid stand-in instead, `docs/V12_STATUS.md`). Walk the recipe once on the release build before quoting it, and say so if a
reviewer names another system.

## 5. After publication: how students install

- The student, approved for Beethoven and added to the group, opens
  `https://chromewebstore.google.com/detail/<item-id>` in Chrome while signed in to the Chrome Web
  Store with the Google account they gave, clicks **Add to Chrome**, then **Add extension** in the
  browser's own prompt. Anyone else who opens the link sees no item.
- The first time, the welcome page names the three things the student needs (a Wayne State grid
  account, GlobalProtect, Claude Pro or Max), each with a link to the university's or Anthropic's
  own page, and asks Chrome for the portal at "Agree and continue"; the panel then waits for
  GlobalProtect if the grid is out of reach and asks for the AccessID and password in its own sheet,
  *Sign in to the grid*, with *Use Chrome's sign-in box instead* as the other way
  (`docs/guides/INSTALL.md`). Nothing is downloaded from the website and nothing is installed
  outside the browser.
- Updates to the extension come through Chrome; nothing is downloaded from us.
- The first installation that checks their AccessID is bound to it (section 3).

The landing page `https://openspineconsortium.com/beethoven/` shows one card, Chrome, "Private
listing, by invitation: after approval you receive an invitation at the Google account you gave",
with no link. It keeps that card after publication: the item's link is never put on the site.
