# Beethoven 8.0.0 package

Built 2026-09-30 at 14:26 UTC from this repository (`extension/`, Node 22.23.3: `npx tsc --noEmit`,
`npx vitest run`, `npm run build`, `npm run zip`). Checksum in `SHA256SUMS.txt`.

| File | For | Notes |
|---|---|---|
| `beethoven-8.0.0-chrome.zip` | The private Chrome Web Store listing, and nothing else | Manifest V3; permissions storage, alarms, scripting, activeTab, sidePanel; optional host `https://*/*`; no `host_permissions` |

This is the only package of 8.0.0. There is no Edge, Firefox or Safari package, no download on the
website, and no file for students: they install from the private listing after the lab lead approves
them and adds their Google account to the listing's Google Group (`docs/store/SUBMISSION.md`). The zip
goes to the Chrome Web Store dashboard and nowhere else. The repository's two GitHub copies
(`GregorySchwing/ashley-bridge` and `OpenSpineConsortium/beethoven`, pushed by `tools/push_via_grid.sh`
and `tools/push_org.sh`) both answered 404 to an anonymous request on 2026-09-30, so neither is public;
keep it that way, or this zip becomes a download. To test by hand before uploading:
`docs/store/TEST_BEFORE_UPLOAD.md`.

## What 8.0.0 is

- **A private listing only.** One store, Chrome, with Private visibility and a Google Group of trusted
  testers. The site's install card says "Private listing, by invitation" and links nothing.
- **One approved account, one installation.** Every approval check carries `install_id`, the random
  identifier the extension makes for itself when its agreement is accepted (`ext/storage.ts`
  `installId()`: 16 random bytes from the browser's generator; nothing read from the computer; removed on
  uninstall, so a reinstall is a new installation). The access service binds an approved account to the
  first installation that asks. A no can now carry a reason, and the strip says it in its own sentence with
  no button:
  - `other_installation`: "This account is already set up on another computer. Ask your lab lead to move
    it here."
  - `other_account`: "This installation of Beethoven is already set up for another account. Ask your lab
    lead to move it to yours."
  - `update_required`: "Install the current Beethoven from the lab's private listing."
  The wire format stays `v: 1`; `install_id` is an added field, which the service before 8.0.0 ignored.
- **No bundled tool.** The package carries no copy of the cluster-side tool. The strip points the account
  at the lab's shared copy named in the site profile (`profiles/wayne.json`: the shared copy at
  `/rs/rs_grp_oschome/shared/beethoven/hpcworker/current`, framework 8, `current -> v8`), or says whom to
  ask when a site has none. In runs I and L below, the only file written into the account's home
  through the portal's Files app was the consent marker.
- **Texts.** Agreement `LICENSE.txt` version 7 and `PRIVACY.md` version 8 (both 2026-09-30): one
  installation per approval, the identifier and what the service keeps about it (the bound identifier, the
  product, the version and the first and last check; for refusals a count, the first and last time and
  eight characters of a one-way hash of the refused identifier), the request records (Google account,
  purpose, optional CV deleted twelve months after the decision or at once on refusal) and the private
  listing. `TERMS_VERSION` 7, so an agreement accepted in 7.0.0 is shown and accepted again.

## Order of deployment

The access service is live with the rule, under both Worker names. Its `REQUIRE_INSTALL_ID` variable is
`"0"` (`ashley/tools/intake/wrangler.toml`), so builds before 8.0.0, which send no identifier, are still
approved from the list alone, on any number of computers. Once 8.0.0 is installed from the private listing
by everyone who uses Beethoven (the maintainer included), set it to `"1"` and deploy both names; from then
on a build before 8.0.0 is refused with `update_required`. Until then the one-installation rule holds only
for 8.0.0 installations.

## What was checked on this file

- `npx tsc --noEmit` clean; `npx vitest run` 19 files, 167 passed (run with the packages present, so the
  hygiene test also read the built package).
- The zip holds 17 files: `manifest.json`, `background.js`, three chunks, `content-scripts/portal.js`, one
  stylesheet, two HTML pages, five icons, `profiles/wayne.json`, `LICENSE.txt` and `PRIVACY.md`. No `.map`
  file, no `sourceMappingURL`, no framework file (no shell, Python or template file, no `hpcworker`, no
  `VERSION`); every `.js` file is minified (1 to 12 lines, none indented, no comments). `LICENSE.txt` and
  `PRIVACY.md` are byte-identical to the repository's root texts (SHA-256 `49d4ef3f5e82a34d...` and
  `712ce3a8756cfa1d...`). The manifest: name Beethoven, version 8.0.0, the 128-character description,
  permissions exactly `storage, alarms, scripting, activeTab, sidePanel`, `optional_host_permissions`
  `["https://*/*"]`, `minimum_chrome_version` 148. It also carries a `browser_specific_settings.gecko`
  block, which WXT writes for every target and Chrome does not use (it was in 7.0.0 too).
- End to end, the Chrome build in Playwright's Chromium against the mock portal
  (`extension/store-assets/e2e/`):
  - run I: approved and bound (st1234) on the lab's shared copy at the Wayne State path, the mock's access
    stub enforcing one installation per account: the check carried `install_id`; one install line; online;
    seventeen checks OK; the stub then refused another identifier (`other_installation`) and a check
    without one (`update_required`);
  - run J: a second installation (a fresh browser profile, the same user, the stub already bound to run
    I's installation): the strip said "This account is already set up on another computer. Ask your lab
    lead to move it here." with no button; in 75 s nothing was typed into the portal's shell and no job
    was submitted;
  - run K: a client without `install_id`, played with curl against the stub: `update_required`;
  - run L: the store reviewer's recipe against the real access service: approved (st1234 is accepted from
    any installation there), online, seventeen checks OK, the nine store screenshots;
  - run M: the rule on the real access service with curl: with st1234's exemption switched off for the
    run, a fresh identifier was approved and bound and a second one refused with `other_installation`;
    then `admin.mjs reset-seat st1234` and `admin.mjs seat-rule st1234 any` put the reviewers' account back
    as it was (checked afterwards: exemption on, no seat, no conflict).

## What this does not do

The one-installation rule is a check in the client against the service's answer, not a proof. A modified
or unpacked copy can skip the check, a copied browser profile carries the same identifier, and the account
name in a check is not authenticated by the service, so anyone who knows an approved AccessID can bind it
first or cause refusals. A move or a withdrawal reaches an installation that holds a fresh yes when its
cache runs out: up to a day online, up to seven days offline. The texts say this and claim no more.
