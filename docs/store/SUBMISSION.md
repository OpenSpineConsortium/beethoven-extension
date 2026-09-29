# Submitting Ashley Bridge to the stores, click by click

For the maintainer. `LISTING.md` beside this file holds every text to paste; this file says where
it goes and in what order. Written 2026-09-29 for version 4.0.0 (the first version without licence
keys: the person's own portal sign-in identifies them and the extension confirms approval with the
access service) and brought up to date for 5.0.0 the same evening. 5.0.0 changes how the cluster
side is set up (where the university's lab keeps one shared copy of the cluster-side tool, the
extension points the student's account at it instead of uploading its own); the permissions, the data
and every answer to a store's questions stay as they were. The mock portal of the reviewer recipe
changed with it: until 5.0.0 its home held only the stand-in command, so the strip uploaded the real
tool, whose install refuses a mock site ("no profile named 'localhost'"), and the recipe stopped at
"Setting up the cluster failed" (measured on the 5.0.0 build on 2026-09-29, `extension/store-assets/e2e/`
run-D1; 4.0.0's mock and tool have the same code there, so its recipe had the same fault, not measured). Its command line now sets the stand-in up as the account's own copy, and the recipe reaches the
green button (run-D2); the recipe's text did not change. Store dashboards move their fields
around from time to time; the field names below are the ones in use at the time of writing, and
the texts are what matter.

## 0. Before the first submission

Have these in hand, and check each once:

1. The packages, built from a clean tree with Node 22 in `extension/`:
   `npm ci && npm run typecheck && npm test && npm run build && npm run zip`. The three files are
   `.output/ashley-bridge-5.0.0-chrome.zip` (Chrome and Edge), `.output/ashley-bridge-5.0.0-firefox.zip`
   (Firefox) and `.output/ashley-bridge-5.0.0-sources.zip` (Firefox source upload). Confirm they are
   release builds: `unzip -p .output/ashley-bridge-5.0.0-chrome.zip manifest.json` must show
   `"optional_host_permissions":["https://*/*"]` and no `localhost`, `"permissions":["storage","alarms","scripting","activeTab","sidePanel"]`,
   and no `host_permissions` key. The Firefox manifest must show
   `"data_collection_permissions":{"required":["personallyIdentifyingInfo"]}`.
2. The images in `extension/store-assets/` (see its `manifest.txt`): screenshots 1280x800, the
   440x280 tile, the 1400x560 marquee, the 300x300 Edge logo; the 128x128 icon is
   `extension/public/icon/128.png`.
3. The five public pages, live and answering 200: `https://openspineconsortium.com/ashley/bridge/`,
   `.../ashley/bridge/privacy.html` (the text of `PRIVACY.md` version 5), `.../ashley/bridge/terms.html`
   (the text of `LICENSE.txt` version 4), `.../ashley/support.html` and `.../ashley/request.html`
   (which must fill its AccessID field from `?access_id=<account>`, since the panel's *Ask for access*
   button opens it that way). Reviewers open the privacy URL; a 404 there is a rejection.
4. `https://openspineconsortium.com/ashley/bridge-killlist.json`, the signed list of withdrawn
   versions the extension fetches once a day, published with `Access-Control-Allow-Origin: *`. The
   extension works without it (it keeps the last good list and refuses only on a verified
   revocation), but a reviewer watching the network will see a 404 otherwise; publish an empty signed
   list before going live.
5. The access service, which replaces the reviewer key of 3.0.0: `https://openspineconsortium.com/ashley/services.json`
   must carry the `access_check` address, and a check for the mock's username must answer yes, since
   the reviewer recipe in `LISTING.md` runs the mock with `--user st1234`. From WSL (Windows sockets
   flake):
   `curl -s -X POST -H 'content-type: text/plain;charset=UTF-8' --data '{"v":1,"access_id":"st1234","portal":"localhost","product":"bridge","version":"5.0.0"}' <the access_check address>`
   must answer `{"approved":true,"access_id":"st1234",...}` with `access-control-allow-origin: *`.
   If it answers `approved:false`, add the account in the admin console (or
   `node tools/intake/admin.mjs add st1234 "Store reviewer (mock portal)" st1234@wayne.edu "store-reviewer mock username"`
   in the Ashley repository, token from the vendor folder, never on the command line). Nothing is
   pasted anywhere: there is no key.
6. Accounts, one person, with a hardware security key or an authenticator app as the second factor
   on each: the personal Google account (Chrome), a Microsoft account (Edge) and a Mozilla account
   (Firefox). Nothing else should hold an OAuth grant on these accounts. No store API key goes into
   any CI.

## 1. Chrome Web Store

Registration (once, about ten minutes):

1. Sign in to the personal Google account. Turn on 2-Step Verification at
   `https://myaccount.google.com/signinoptions/two-step-verification` and add a hardware security key
   (or an authenticator app); Chrome Web Store requires 2-Step Verification on every developer account.
2. Open `https://chrome.google.com/webstore/devconsole/register`. Accept the Developer Agreement and
   pay the one-time US$5 registration fee.
3. In the dashboard, open **Account**: set the publisher display name (Gregory Schwing, trading as
   OpenSpineConsortium, or the LLC once it exists), verify the contact e-mail, and answer the trader /
   non-trader question (asked of everyone for the EU Digital Services Act; the item is offered in the
   United States only, but the field must be answered). To show the homepage as the "official" URL,
   verify `openspineconsortium.com` in Google Search Console with the same account.

The item (about thirty minutes):

4. Dashboard, **Items**, **New item**. Drag `ashley-bridge-5.0.0-chrome.zip` in. The item ID appears
   in the URL and in the item header at once; note it, the landing page needs it (section 5).
5. **Store listing** tab, from `LISTING.md`: the detailed description; Category Developer Tools;
   Language English (United States); store icon (`icon/128.png`); the five screenshots; the small promo
   tile and the marquee; Official URL / Homepage `https://openspineconsortium.com/ashley/bridge/`;
   Support URL `https://openspineconsortium.com/ashley/support.html`; Mature content No. Save draft.
6. **Privacy practices** tab: the single-purpose statement; one justification per permission
   (`storage`, `alarms`, `scripting`, `activeTab`, `sidePanel`) and the host-permission justification for
   `https://*/*`; "Are you using remote code?" No; Data usage: tick "Personally identifiable
   information" only, with the sentence from `LISTING.md` (the institutional account name the portal
   shows, sent in the approval check), and leave every other category unticked; tick the three
   certifications; Privacy policy URL `https://openspineconsortium.com/ashley/bridge/privacy.html`.
   Save draft.
7. **Distribution** tab: Payments Free; Visibility **Unlisted** (anyone with the link can install,
   the item is not searchable; the review is the same as for Public); Regions: select United States
   only. Save draft.
8. **Submit for review** (top right). If the option is offered, leave "publish automatically after
   review" on, or defer if the landing page is not ready.
9. Expected review time: most items are reviewed within a few days; a wildcard optional host
   permission (`https://*/*`) puts the item into in-depth review, and a new developer account with a
   first item adds to that, so allow up to a few weeks. The decision comes by e-mail; a rejection names
   the policy and can be appealed from the dashboard with a written explanation (section 4).
10. After it is published and the landing page carries the link, change Visibility to **Public** on
    the Distribution tab and submit again; a visibility change alone is reviewed quickly.

Updating later: **Package**, upload the new zip, submit. Every update is reviewed; users receive it
through Chrome's own update mechanism within hours of publication.

## 2. Edge Add-ons (Partner Center)

1. Sign in at `https://partner.microsoft.com/dashboard/microsoftedge/public/login` with the
   Microsoft account (second factor on). Enrol in the Microsoft Edge program (free, no fee) and set the
   publisher display name.
2. **Overview**, **Create new extension**. Upload the same `ashley-bridge-5.0.0-chrome.zip`; Edge
   accepts the Chromium MV3 package unchanged and validates it. The product's store ID (the "CRX ID")
   appears on the overview page; note it for the landing page.
3. **Availability**: Visibility **Hidden** first (the listing is reachable only by its link and is
   not searchable; the certification is the same as for Public); Markets: United States.
4. **Properties**: Category Developer tools; Privacy policy URL
   `https://openspineconsortium.com/ashley/bridge/privacy.html`; Website URL
   `https://openspineconsortium.com/ashley/bridge/`; Support contact
   `https://openspineconsortium.com/ashley/support.html`; Mature content No; the question whether the
   extension accesses, collects, transmits or uses personal information: Yes (the institutional
   account name the portal shows, in the approval check; the privacy policy says what and why).
5. **Store listings**, English (United States): Description and Short description from `LISTING.md`;
   Store logo `edge-store-logo-300x300.png` (required); the screenshots; the small and large
   promotional tiles (optional); the search terms.
6. **Notes for certification**: paste the reviewer notes from `LISTING.md` (nothing to fill in: the
   mock's username is approved on the access service, and there is no key).
7. **Publish**. Certification takes up to seven business days; the status shows on the overview and
   comes by e-mail. A failure report names the policy; fix and publish again.
8. Once live and linked from the landing page, set Visibility to **Public** and publish again.

Edge users could also install the Chrome Web Store item ("Allow extensions from other stores"), but
the Edge Add-ons listing is what a student should be sent to: one click, no setting to change.

## 3. Firefox Add-ons (AMO)

1. Create a Mozilla account at `https://accounts.firefox.com`, turn on two-step authentication in the
   account settings (an authenticator app; keep the recovery codes with the other vendor secrets), then
   open `https://addons.mozilla.org/developers/` and register as a developer (accept the Firefox Add-on
   Distribution Agreement; free). AMO requires two-step authentication for developer accounts.
2. **Submit a New Add-on**. Choose the distribution: **On this site** for the public listing, or **On
   your own** for a signed `.xpi` you distribute yourself (the equivalent of Chrome's unlisted channel:
   same automated checks, same policies, no listing page; the file comes back signed and can be handed to
   a campus). An add-on ID keeps one distribution state at a time; the choice can be changed later under
   Manage Status & Versions, but decide with that in mind.
3. Upload `ashley-bridge-5.0.0-firefox.zip`. The validator runs; warnings are shown, errors block.
4. "Do you need to submit source code?" **Yes**. Upload `ashley-bridge-5.0.0-sources.zip` and paste the
   build note from `LISTING.md` (Node 22, `npm ci`, `npm run build:firefox`).
5. Describe the add-on: Name Ashley Bridge; slug `ashley-bridge`; the summary (241 characters) and the
   description; categories Web Development and Other; support e-mail and website; homepage; the privacy
   policy text (paste `PRIVACY.md`); license: Custom, paste `LICENSE.txt`; tick "requires payment,
   non-free services or software, or additional hardware" and give the sentence from `LISTING.md`;
   the version notes; **Notes to reviewer**: the reviewer notes, then the build note.
6. Submit. The package is signed automatically within minutes to hours when the automated checks
   pass; because source code was submitted and the add-on uses an optional wildcard host permission, a
   human review of the source can follow and take days. Listed add-ons appear at
   `https://addons.mozilla.org/firefox/addon/ashley-bridge/` once approved; a self-distributed build's
   signed `.xpi` is downloadable from Manage Status & Versions.
7. Updating later: Manage Status & Versions, **Upload a New Version**, with a new sources zip each time.

## 4. When a reviewer asks for test access

Every store may ask for credentials to a live portal. None can be given, and the answer must say so
plainly and offer the next best thing. Reply with this (adjust the store's name):

```
Thank you for reviewing Ashley Bridge. The extension works only against a university's Open OnDemand portal, which requires a university account, a VPN and a second factor. We cannot issue such an account to a reviewer, and we cannot lend ours: one person, one account is a term of the portal and of Anthropic's Claude service the worker uses.

What we can offer, and what the submission already contains:
1. A mock portal in the source package (mock-ood/server.mjs) that serves the same routes the extension uses, with a stand-in scheduler and a stand-in cluster tool, and a recipe to run it in ten minutes on any machine with Node 22 (the reviewer notes). The mock's username is approved on our access service, so the extension works against it with nothing to paste; there is no key.
2. [Only if recorded by then: a walk-through of the same flow against the mock, and one against a live university portal with the hostname and the pasted code blurred, so you see exactly what a student sees. Delete this item if there is no recording.]
3. A live screen-share at a time of your choosing, during which you may direct every click.

What the extension does not do, which may be what you need to confirm: it has no host permission, content script or code on claude.ai, anthropic.com or claude.com and only opens those pages in a new tab; it never reads a Claude credential (the user signs in on Anthropic's page and pastes a one-time code that is relayed once to the user's own cluster shell and kept nowhere); it runs no remote code (its daily update check fetches one signed JSON list); it holds no install-time host permission and asks for one origin at the click; the one thing it sends us is the approval check (the account name the portal shows, the portal hostname, the product and the version), answered yes or no; no analytics, no error reports, no activation.
```

One thing to know before sending that reply: the two recordings named in
`../STORE_LISTING.md` ("Reviewer access", item 2) have not been made as of 2026-09-29; record them
(under five minutes each, the mock one from the recipe in `LISTING.md`, the live one with the portal
hostname and the pasted code blurred) if you want item 2 in the reply; otherwise leave item 2 out, as the draft says.
The mock is not hosted publicly either; the recipe runs it locally, which every store's reviewers
can do.

## 5. After publication: how people install, and the landing page

No developer mode anywhere once the items are live:

- **Chrome**: the student opens `https://chromewebstore.google.com/detail/<item-id>` (the item ID
  from section 1, step 4) and clicks **Add to Chrome**, then **Add extension** in the browser's own
  prompt. Unlisted items install the same way from the link; they are only absent from search.
- **Edge**: `https://microsoftedge.microsoft.com/addons/detail/<crx-id>` (the ID from section 2,
  step 2), **Get**, then **Add extension**. Hidden items install the same way from the link.
- **Firefox**: `https://addons.mozilla.org/firefox/addon/ashley-bridge/`, **Add to Firefox**, then
  **Add** in Firefox's prompt. For a self-distributed build, the student opens the signed `.xpi` link;
  Firefox asks to allow the installation and then to add the extension; no `about:debugging`, and the
  add-on stays after Firefox restarts (unlike a temporary add-on).
- Updates come through each store; nothing is downloaded from us.

The landing page `https://openspineconsortium.com/ashley/bridge/` (in the website repository,
`openspineconsortium.github.io/ashley/bridge/index.html`) has one button per browser. Until the
items exist the buttons say "listing pending review" and the Testers line describes the flow of
`docs/TESTERS.md` (ask for access with the account name the portal shows, wait for approval,
install the package Greg sends, click the icon; nothing to paste); as each ID becomes known
(Chrome's at item creation, Edge's at first upload, Firefox's slug at submission) replace that
button's `href` with the store URL above, and once all three are live drop the Testers line from
the landing template and the "load the package by hand" section from `docs/TESTERS.md`. The same
three URLs go into `docs/WAYNE_STATE_PILOT.md` where it says "install the extension from the store".

Then change each item's visibility to public (sections 1.10, 2.8 and, for Firefox, the listed
channel).
