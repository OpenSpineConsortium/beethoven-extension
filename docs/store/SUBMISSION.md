# Submitting Beethoven to the Chrome Web Store, click by click

For the maintainer. `PASTE.md` beside this file is the paste sheet: every dashboard field in the
dashboard's order, with the text to paste or the file to upload. `LISTING.md` holds the texts and the
reasons behind them; this file says what to do around the paste, in what order. Written 2026-09-29
for 4.0.0, rewritten on 2026-09-30 for 8.0.0, brought up to date for 9.0.0 and 10.0.0, and brought up
to date for 12.0.0 on 2026-10-02. Neither 9.0.0, 10.0.0 nor 11.0.0 was submitted for review; 12.0.0
carries 11.0.0's changes (the welcome page with one tick, the window-wide panel, no `activeTab`) and
its own (the direct way over ssh through the helper inside the package, the `nativeMessaging`
permission, the Authentication information data type, agreement version 9 and privacy statement
version 10). Beethoven is offered in one place only: a **Private** item on the Chrome Web Store,
visible to the trusted testers the maintainer names, a Google Group he keeps with his personal Google
account and to which he adds each student he approves for Beethoven. No other store, no signed file,
no download from the website: the website shows no install link at all, the helper's installers are
files inside the package, and the item's link goes to approved students only. Store dashboards move
their fields around from time to time; the field names below are the ones in use at the time of
writing, and the texts are what matter.

What one private listing does and does not do, so nobody is told more than is true: only the Google
accounts in the group can open the listing and install from it, and the extension then works only
for an approved AccessID on the one installation that approval is bound to. It does not make a copy
impossible to pass around (an installed extension's files sit in the browser profile), and the
binding is checked by the extension itself against the access service; it keeps an approval from
being shared casually, and the agreement makes sharing a breach.

## 0. Before the first submission

Have these in hand, and check each once:

1. The package, built from a clean tree with Node 22 in `extension/`:
   `npm ci && npm run typecheck && npm test && npm run build && npm run zip`. The build writes
   `.output/beethoven-12.0.0-chrome.zip`; the file to upload is its copy in the release folder,
   `release/12.0.0/beethoven-12.0.0-chrome.zip`, whose SHA-256 must match
   `release/12.0.0/SHA256SUMS.txt` (a later build rewrites `.output/`). The same command also writes a
   Firefox zip and a sources zip; neither is uploaded or sent to anyone. A reviewer who asks for the
   mock portal gets `release/12.0.0/reviewer/beethoven-mock-portal.zip`, which holds the mock and no
   extension code (section 4). Confirm it is a release build: `unzip -p
   release/12.0.0/beethoven-12.0.0-chrome.zip manifest.json` must show `"name":"Beethoven"`,
   `"version":"12.0.0"`, the 128-character `description` in `LISTING.md`,
   `"homepage_url":"https://openspineconsortium.com/beethoven/"`,
   `"optional_host_permissions":["https://*/*"]` and no `localhost`, the permissions `storage`,
   `alarms`, `scripting`, `nativeMessaging` and `sidePanel`, all under `permissions`, and nothing
   else (no `activeTab` since 11.0.0), and no `host_permissions` key. `unzip -l` must list `fonts/` (eight
   `.woff2` files and two `-OFL.txt` texts) and `bridge/` (`beethoven-bridge-windows.zip`,
   `beethoven-bridge-mac.zip`, `beethoven-bridge-linux.zip` and `bridge/manifest.json`, whose SHA-256
   values must match the files beside it). Unzip one: its `allowed_origins.json` holds the placeholder
   `chrome-extension://REPLACE_WITH_EXTENSION_ID_SEE_HELPER_README/`, as it should: the page that offers
   the download writes the extension's own ID into the copy it saves (`core/bridgeZip.ts`), so no
   build needs the store item's ID. No page of the built extension may show the product's old name
   (`grep -ril` over the unpacked zip; the kill-list's format tag inside the bundle is the one allowed
   exception).
2. The images named in `PASTE.md` (all under `extension/store-assets/`; its `manifest.txt` says how
   each was made). **The five screenshots must be captured again from the 12.0.0 build**
   (`LISTING.md`, "Images and the promo video"); the promo video field stays empty until a 12.0.0
   video exists. Each PNG without alpha or JPEG at the exact size (`PASTE.md` has a one-line check).
   Look at each one before it is uploaded.
3. The five public pages, live and answering 200: `https://openspineconsortium.com/beethoven/`,
   `.../beethoven/privacy.html` (the text of `PRIVACY.md` version 10), `.../beethoven/terms.html`
   (the text of `LICENSE.txt` version 9), `.../beethoven/support.html` and
   `.../beethoven/request.html` (which must fill its AccessID field from `?access_id=<account>`,
   since the panel's *Ask for access* button opens it that way, and which asks for the Google
   account the invitation goes to). The pages show one install card, "Private listing, by
   invitation", and no download and no other browser. Reviewers open the privacy URL; a 404 there is
   a rejection. `docs/PUBLISHING_SITE.md` builds and checks them.
4. `https://openspineconsortium.com/beethoven/killlist.json`, the signed list of withdrawn
   versions the extension fetches once a day, published with `Access-Control-Allow-Origin: *`.
5. The access service, with the one-installation rule, exactly as for 10.0.0:
   `https://openspineconsortium.com/beethoven/services.json` must carry the `access_check` address
   `https://beethoven-access.openspineconsortium.workers.dev/access_check`, and the mock's username
   `st1234` must answer yes **from any installation**, at portal `localhost` only. From WSL (Windows
   sockets flake), two checks with two different installation identifiers:
   `curl -s -X POST -H 'content-type: text/plain;charset=UTF-8' --data '{"v":1,"access_id":"st1234","portal":"localhost","product":"bridge","version":"12.0.0","install_id":"00000000000000000000000000000001"}' https://beethoven-access.openspineconsortium.workers.dev/access_check`
   and the same with `...0002`. Both must answer `{"approved":true,"access_id":"st1234",...}` with
   `access-control-allow-origin: *`. If the second answers `"reason":"other_installation"`, the
   exemption is missing: `node tools/intake/admin.mjs seat-rule st1234 any` in the repository of
   Beethoven for VS Code (Desktop folder `ashley`; token from the vendor folder, never on the
   command line). Never run this check with a real student's AccessID: the first identifier that
   asks binds that account. The access service of 2026-10-01 (st1234 only at `localhost`, a public
   `GET /allowlist` that names nobody) must be deployed under both names first, in the order the
   10.0.0 text of this file gave (git history of this file, section 0, item 5). 12.0.0 changes
   nothing in the check: no new field, and it is sent only after the cluster accepted a sign-in.
6. The Google Group of testers, made once at `https://groups.google.com` with the personal Google
   account that owns the developer account: the name "Beethoven-users"; who can search for the group:
   only members; who can join: only invited users; who can view members and who can post: group
   managers. Add each student approved for Beethoven by the Google account they gave on the request
   form. A student approved for lab membership only is not added.
7. The developer account, one person, with a hardware security key or an authenticator app as the
   second factor. Nothing else should hold an OAuth grant on it. No store API key goes into any CI.
8. The name. Beethoven runs Claude Code and is not an Anthropic product; the name carries no
   Anthropic mark, and "Claude" and "Claude Code" appear in the listing only to say what it runs.
9. **New in 12.0.0: the grid side.** Framework 11, with the gate and `browser-key`, deployed to the
   lab's shared copy, and `hpcworker browser-key check` answering `ok` there
   (`docs/guides/LAB_LEAD.md`, section 2: every folder above the copy too). A reviewer never reaches
   the grid, but every student does: against framework 10 a student sees "The lab's copy of the tool on
   the grid is older than this Beethoven", and a student whose key the framework refuses sees "The
   grid's own tool said no:" with its reason. Send C&IT the note in `LAB_LEAD.md`, section 3, before
   the listing goes live.

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

4. Dashboard, **Items**, **New item**. Drag `beethoven-12.0.0-chrome.zip` in. The item ID appears in
   the URL and in the item header at once; note it: it is the link approved students get (section 5),
   and it goes nowhere public. It is also the ID the helper's registration names, and nothing has to
   be rebuilt for it: the zips under `bridge/` carry a placeholder, and the page that offers the
   download writes the running extension's own ID into the copy it saves (`core/bridgeZip.ts`). After
   the item is live, install it from the listing once and download the helper from its panel: the
   saved zip's `allowed_origins.json` must name `chrome-extension://<item-id>/`. A zip made out to
   another extension installs cleanly but Chrome refuses to start it for Beethoven, and the panel says
   "The helper is there but did not answer."
5. **Store listing** tab, from `PASTE.md`, top to bottom: the description (1,650 characters);
   Category Developer Tools; Language English (United States); the store icon; the promo video field
   empty; the small promo tile; the five screenshots captured from 12.0.0, in the order given; the
   marquee; Official URL (empty until the site is verified); Homepage URL
   `https://openspineconsortium.com/beethoven/`; Support URL
   `https://openspineconsortium.com/beethoven/support.html`; Mature content No. Save draft.
6. **Privacy practices** tab, from `PASTE.md`: the single-purpose statement; one justification per
   permission (`storage`, `alarms`, `scripting`, `sidePanel`, `nativeMessaging`) and the
   host-permission justification for `https://*/*`; "Are you using remote code?" No; Data usage:
   tick "Personally identifiable information" and "Authentication information", with the sentences
   from `PASTE.md`, and leave every other category unticked; tick the three certifications; Privacy
   policy URL `https://openspineconsortium.com/beethoven/privacy.html` (version 10 live). Save draft.
7. **Distribution** tab: Payments Free; Visibility **Private**, and add the address of the
   Beethoven-users group from section 0, item 6. Regions: United States only. Save draft. Chrome's
   documentation (`https://developer.chrome.com/docs/webstore/cws-dashboard-distribution`, read
   2026-09-30) says that Private lets trusted testers install the item and that "you can also include
   any Google Groups that you own or manage". Never choose Unlisted or Public.
8. **Test instructions** tab (under **Access** in the left menu), from `PASTE.md`: the username
   sentence, the password box left empty, and the Additional instructions (487 characters, within the
   box's 500). Save changes. Before pasting, walk the instructions on the 12.0.0 build
   (`TEST_BEFORE_UPLOAD.md`, "Just before uploading"). The fuller text below them in `PASTE.md` is
   not pasted: it goes into a reply if a reviewer asks (section 4).
9. **Submit for review** (top right). A Private item is reviewed like a public one.
10. Expected review time: a wildcard optional host permission puts the item into in-depth review, a
    native-messaging permission and executable scripts inside the package invite a closer look, and a
    new developer account with a first item adds to that, so allow up to a few weeks. The decision
    comes by e-mail; a rejection names the policy and can be appealed from the dashboard with a
    written explanation (section 4).

Updating later: **Package**, upload the new zip, submit. Every update is reviewed; students receive
it through Chrome's own update mechanism within hours of publication. The helper installed on a
student's computer is not updated by Chrome: a later version that needs a newer helper must say so
and offer it from its own package (LICENSE section 17).

## 2. The deploy order with the access service

Unchanged from 8.0.0: builds before 8.0.0 send no installation identifier, and the service refuses a
check without one (`"reason":"update_required"`) unless its `REQUIRE_INSTALL_ID` variable is `"0"`.
Keep it at `"0"` while anyone still uses 7.0.0 or older, and turn it on once 8.0.0 or later is live on
the private listing and installed by everyone who needs it.

The grid side has an order of its own: make every folder above the shared copy owner-only or sticky,
deploy framework 11 to the shared copy, run `browser-key check`, and only then let the listing go
live. A 12.0.0 extension that meets framework 10 on the grid cannot enrol a key: framework 10 answers
`hpcworker: unknown command 'browser-key'`, which the core recognises (`contract.ts`
`isUnknownVerb`) and shows as "The lab's copy of the tool on the grid is older than this Beethoven.
Ask your lab lead to update it, or use GlobalProtect." Never point `current` back below version 11
once students have keys: every key would then meet a copy with no gate.

## 3. Approving, moving and withdrawing, day to day

- **A request comes in.** The e-mail names the person, the AccessID, the e-mail, the Google account,
  what they will use Beethoven for, a link to the CV if one was attached, whether the mailbox was
  confirmed, and three choices: *Approve for Beethoven*, *Lab membership only*, *Deny*. For
  *Approve for Beethoven*, add their Google account to the group (section 0, item 6) and send them
  the item's link (`https://chromewebstore.google.com/detail/<item-id>`) with one line: open it in
  Chrome, signed in with that Google account, on the computer you will use; *Add to Chrome*; then
  follow `docs/guides/INSTALL.md` (send it, or the support page).
- **"... asked from a second installation; it was refused."** As before: *Move the approval to the
  new installation* when the student changed computers, Chrome profiles or reinstalled; withdraw and
  ask if they do not know of one. `node tools/intake/admin.mjs seat <AccessID>` shows the binding;
  `reset-seat <AccessID>` clears it. A student who moves computers also signs in directly once on the
  new one, which replaces the old computer's key line on the grid.
- **"This installation of Beethoven is already set up for another account."** One installation serves
  one account; two approved students who share a computer each need a Chrome profile of their own.
- **Withdrawing.** Withdraw in the admin console (or the e-mail link), and remove the Google account
  from the group. The extension stops starting workers at its next check. **The browser's key line
  stays in the student's grid account**, since the gate does not consult the access service: ask the
  student to press *Forget this computer*, or see `docs/guides/LAB_LEAD.md`, section 5.

## 4. When a reviewer asks for test access

A reviewer may ask for credentials to a live cluster. None can be given, and the answer must say so
plainly and offer the next best thing. Reply with this:

```
Thank you for reviewing Beethoven. The extension works only against a university's cluster, which requires a university account with its password and a second factor (and, on its portal path, a VPN). We cannot issue such an account to a reviewer, and we cannot lend ours: one person, one account is a term of the university and of Anthropic's Claude service the worker uses.

What we can offer:
1. A mock portal, attached as beethoven-mock-portal.zip: a small Node 22 server that serves the same routes the extension uses on its portal path, with a stand-in scheduler and a stand-in cluster tool; it contains no extension code. The recipe below runs it with the item you installed from the store; it needs Node 22, bash and openssl, and we have run it end to end only on Windows, with Git for Windows. The mock's username, st1234, is approved on our access service for a portal at localhost and accepted from any installation. The direct (ssh) way is not part of the mock; its helper is a plain script inside the package (bridge/) that you can read, and we ask you not to try it against the university's real server, where a test sign-in is a failed sign-in on a real account.
2. [Only if recorded by then: a walk-through of the same flow against the mock, and one against the real cluster with the AccessID, the codes and the key fingerprint blurred. Delete this item if there is no recording.]
3. A live screen-share at a time of your choosing, during which you may direct every click.

What the extension does not do, which may be what you need to confirm: it has no host permission, content script or code on claude.ai, anthropic.com or claude.com and only opens those pages in a new tab; it never reads a Claude credential (the user signs in on Anthropic's page and pastes a one-time code that is relayed once to the user's own cluster shell and kept nowhere); it never keeps the user's cluster password or verification code (on the direct way they are typed into its own page and sent only into the encrypted ssh session, after the cluster's host key matched the pinned one); its key's line in the user's cluster account runs a gate with eight fixed commands and can never sign a worker in to Claude; it uses nativeMessaging only to talk to its own helper, which connects only to the cluster's ssh port and holds no credential; it runs no remote code (its daily update check fetches one signed JSON list); it holds no install-time host permission, asks for one origin at a time and only inside a click, and refuses an address on claude.ai, anthropic.com or claude.com before any permission request; the one thing it sends us is the approval check (the account name the cluster accepted, the portal hostname, the product, the version and a random identifier the extension made for this installation), answered yes or no; no analytics, no error reports, no activation.

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher.
```

Then paste under it the fuller text from `PASTE.md` (section "Test instructions tab", the block
after "The fuller text, for a reply to a reviewer"), and attach
`release/12.0.0/reviewer/beethoven-mock-portal.zip`: the mock, its stand-in scheduler and cluster
tool and its one dependency (`ws`), and no extension code. Never attach
`.output/beethoven-<version>-sources.zip`: it holds the extension's full source, which is not handed
out (the helper's scripts are in the package anyway, as the store requires of everything it runs).
The recipe in `LISTING.md` is the same flow at more length, for a follow-up question. The mock flow
of 11.0.0 (scenarios 0 to 12) was not run on a 12.0.0 build; the 12.0.0 harness ran the direct way's
scenarios 13 to 16 against a local grid stand-in (`docs/V12_STATUS.md`). Walk the recipe once on the
release build before quoting it, and say so if a reviewer names another system.

## 5. After publication: how students install

- The student, approved for Beethoven and added to the group, opens
  `https://chromewebstore.google.com/detail/<item-id>` in Chrome while signed in to the Chrome Web
  Store with the Google account they gave, clicks **Add to Chrome**, then **Add extension** in the
  browser's own prompt. Anyone else who opens the link sees no item.
- The first time, the panel offers the helper from inside the extension ("One small download,
  once"); the student saves and opens it once (`docs/guides/INSTALL.md`, part 2). Nothing is
  downloaded from the website. A student who cannot run it uses GlobalProtect.
- Updates to the extension come through Chrome; nothing is downloaded from us.
- The first installation that checks their AccessID is bound to it (section 3).

The landing page `https://openspineconsortium.com/beethoven/` shows one card, Chrome, "Private
listing, by invitation: after approval you receive an invitation at the Google account you gave",
with no link. It keeps that card after publication: the item's link is never put on the site.
