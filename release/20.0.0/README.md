# Beethoven 20.0.0 package, guides and reviewers' mock portal

Built 2026-10-13 at 20:24 UTC from commit be0b86d on `main` (the merge of pull request #11,
"Beethoven 20.0.0 goes to the Chrome Web Store as a public listing: agreement 14, privacy 15"), in a
cloud session with Node 22.22.0. The steps were, in `extension/`: `npm run typecheck`, `npm run
build`, `npm run zip`, then `npx vitest run` with the built package present (764 tests passed, 4
skipped); CI's run for the same tree,
https://github.com/OpenSpineConsortium/beethoven-extension/actions/runs/38461550900, passed
typecheck, vitest, the mock's selftest and the build. `SHA256SUMS.txt` holds the checksums of every
other file in this folder; check them with `sha256sum -c SHA256SUMS.txt`, run inside this folder.

**Nothing in this build touched the real grid, the access service or the store.** The tests ran
against stand-ins on the build machine. Nothing was uploaded.

| File | For | Size (bytes) |
|---|---|---|
| `beethoven-20.0.0-chrome.zip` | The Chrome Web Store listing (public since this version), or the hand test by hand. Not in the repository (`.gitignore`); `SHA256SUMS.txt` pins it | 441,350 |
| `guides/` | From `docs/guides/` at the same commit: `INSTALL.md` and `USE.md` (students), `ACCOUNTS.md`, and `LAB_LEAD.md` (Greg) | 4 files |
| `reviewer/beethoven-mock-portal.zip` | Only for a store reviewer who asks for the mock portal (`docs/store/SUBMISSION.md`, section 4) | 103,736 |
| `store-kit/` | The submission package: every file the dashboard takes, numbered by its field in `docs/store/PASTE.md`'s order (the package as `00`, the description, the icon, the 9.0.0 promo video and its thumbnail, the tile, the five screenshots, the marquee, the three Test instructions texts and the fuller reply, and the paste sheet). Assembled 2026-10-14; screenshots 2 to 5 are 20.0.0's. The `00` zip is not in the repository; the other 16 files are | 17 files |
| `store-kit-20.0.0.zip` | The same folder zipped, for the maintainer's download. Not in the repository (`.gitignore`); `SHA256SUMS.txt` pins it | 2,520,685 |
| `SHA256SUMS.txt` | SHA-256 of every other file in this folder | |

The package's SHA-256 is `33294f8b9ea662d9354eef416a05ca1d570918dbcb74cd4b8f73e05f9bbbd790`. Upload
this copy (`release/20.0.0/beethoven-20.0.0-chrome.zip`), not `extension/.output/`, which the next
build rewrites; a zip built again from the same commit has another checksum, since the zip carries
its files' times.

The release-build checks of `docs/store/SUBMISSION.md`, section 0, item 1, pass on this zip:
`manifest.json` says `"name":"Beethoven"`, `"version":"20.0.0"`, the 128-character description,
`"homepage_url":"https://openspineconsortium.com/beethoven/"`,
`"optional_host_permissions":["https://*/*"]`, the six permissions `storage`, `alarms`, `scripting`,
`sidePanel`, `webRequest` and `webRequestAuthProvider` and nothing else, no `host_permissions` and
no `"key"`; the zip lists `fonts/` (eight `.woff2` files and two `-OFL.txt` texts) and no `bridge/`;
`LICENSE.txt` inside it is version 14 and `PRIVACY.md` version 15, both of 2026-10-13,
byte-identical with the repository's.

## What 20.0.0 changes against 19.0.0

19.0.0 was uploaded on 2026-10-09 and the store accepted it (Greg, 2026-10-13). 20.0.0 carries two
changes, both on the access side; the grid side and the way to it (the university's VPN, then the
Open OnDemand portal, with Beethoven signing in to the grid as 19.0.0 does) are unchanged.

- **One person's approval, every installation of their own** (pull request #10, 2026-10-11). A
  student's second computer, another Chrome profile or a reinstallation is approved at its first
  check, where 8.0.0 to 19.0.0 refused it until the maintainer moved the approval. The access
  service keeps the ten most recent installations an account asked from and e-mails the maintainer
  about a new one, with a link to withdraw the approval and none to move it. One installation still
  serves one account.
- **A public listing** (pull request #11, 2026-10-13; Greg: "i want to release 20 and public"). The
  Chrome Web Store item goes from Private, open only to the Google accounts in the lab's Google
  Group `Beethoven-users`, to Public: installing needs no invitation, and the approval check alone
  decides whether an installation works. The request page no longer asks for a Google account, the
  maintainer's invitation step and its daily reminder are retired in the access service
  (OpenSpineConsortium/beethoven-access#6, deployed 2026-10-13), and the site's install card links
  the listing (openspineconsortium.github.io#17). The panel's sentence for a build the service calls
  too old is "Install the current Beethoven from the Chrome Web Store."
- **Agreement version 14 and privacy statement version 15**, both of 2026-10-13; `TERMS_VERSION` is
  14, so every student accepts once more. Versions 13 and 14 of 2026-10-11, drafted for 20.0.0
  before the listing went public, never shipped. The changed sentences are recorded in
  `docs/TEXTS_V14_V15.md`. The texts say the listing "needs no invitation", not that anyone can
  install it, since the item's regions stay the United States.

## The reviewers' mock portal

`reviewer/beethoven-mock-portal.zip` holds 30 files under `beethoven-mock-portal/`: `server.mjs`,
`lib/` (`common.mjs`, `jobs.mjs`, `jobsim.mjs`, `tool.mjs`) and `bin/` (`hpcworker`, `sbatch`,
`scancel`, `sinfo`, `squeue`, Unix mode 0755) from `extension/mock-ood` at the same commit (the type
declaration `lib/jobsim.d.mts` left out), a `package.json` naming `ws` 8.22.0, and
`node_modules/ws/` (its MIT `LICENSE` included). No extension source, no certificate or key, no
source map. It is sent only to a reviewer who asks, with the recipe in `docs/store/PASTE.md`.

## Before the upload

The upload is Greg's, with his own tool and sign-in (`docs/store/SUBMISSION.md`, section 0): the
listing's address goes into the site's `BROWSERS` first; the dashboard's Visibility becomes Public
and its Trusted testers field stays empty; the hand test (`docs/store/TEST_BEFORE_UPLOAD.md`) runs
on the real grid; and the access service answers `st1234` yes from two installation identifiers.
None of these was done in this build. Screenshots 2 to 5 were captured from this build on
2026-10-14 (`extension/store-assets/raw-20/`) and are in `store-kit/`, with the listing's address,
https://chromewebstore.google.com/detail/beethoven/heoopgbkbkfckhhpbkkcgigohfekjicn, on the site's
install card since the same day; the diagram screenshot and the promo video are still 9.0.0's.