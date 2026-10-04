#!/bin/bash
# A Beethoven release, start to finish, on the maintainer's own Mac, typed from the repository root:
#
#   bash helper/release/release.sh [--no-upload] [--dry-run] [--allow-branch]
#
# It builds and signs both bridge installers on this Mac (the .pkg through Apple's notary service, the
# .msi through Azure Artifact Signing, so no Windows machine should be needed; Artifact Signing from a
# Mac is not yet measured, and build-msi.ps1 on Windows is the fallback), merges them into the extension,
# runs the checks, zips the extension, records the shipped files in release/<version>/ and uploads the
# zip to the Chrome Web Store, submitted for Google's review. It commits and pushes nothing; it prints
# the git commands for the record at the end. greg, 2026-10-04: "save as much as possible to make this
# easy as possible on me".
#
# Every name it needs comes from <vendor>/release.json (BEETHOVEN_VENDOR_DIR, else ASHLEY_VENDOR_DIR,
# else ~/.beethoven-vendor), read by release-config.mjs beside this script: the store item and its
# publisher, the two Developer ID certificates' names, the notarytool keychain profile's name, and the
# Azure Artifact Signing endpoint, account and certificate profile. Names only. Nothing here holds, prints
# or passes a password, key or token: the Azure token is the Windows step's own business, through an
# environment variable it sets and unsets, and the Google sign-in the upload uses stays in
# <vendor>/chrome-web-store/, where only publish-store.mjs opens it. release.example.json shows the
# file; setup-mac.sh --write-config writes it.
#
# The steps, in order (helper/release/README.md, "Your release, start to finish", says why each is where
# it is):
#    1  the setup check (setup-mac.sh), whose list stops the release when anything is missing; then
#       release.json, the checkout complete, the version, no release/<version>/ yet, a clean tree on main
#    2  one git fetch, and main must equal origin/main
#    3  the last release's installers cleared, this script's own outputs and nothing else: the two
#       packages and their sidecars in helper/signed/, and the two copies the merge left in
#       extension/public/bridge/ (gitignored there, and the bridge tests fail while they are there)
#    4  npm ci   5  npm run sync-profiles, as CI does   6  tsc   7  the whole test suite, while
#       extension/public/bridge/ is still the tracked build: its bridge tests expect the placeholder
#       build and would fail on the merged one; then git status must still list nothing, so that a
#       tracked file these rewrote is found before the notarization, not at step 14
#    8  the Mac installer (mac/build-pkg.sh)   9  the Windows installer (windows/build-msi-mac.sh)
#   10  the merge (helper/build.mjs --store-id)   11  npm run zip   12  the package tests on that zip
#   13  the record in release/<version>/   14  the tracked bridge files back (git checkout), the two
#       copies removed, and CI's own check (helper/build.mjs --check --no-signed) that they are
#   15  the upload of the recorded zip, submitted for review (publish-store.mjs --require-signed --publish)
# The zip is recorded before it is uploaded, so the record holds the bytes the store got, and a failed
# upload leaves a complete record to upload again by hand. A failure at any step stops the release there
# with that step's own message, after putting the tracked extension/public/bridge/ back; a stop at step
# 13 or 14 also removes the record this run began, since nothing was uploaded, so the same version can
# simply run again. The record's zip and bridge/ name the store's extension and carry the signed
# installers, so .gitignore keeps them out of the repository: they stay on this Mac, and the record's
# README.md and its two SHA256SUMS.txt files, which are committed, pin them.
#
#   --no-upload     stop after the record and the restore; the summary says how to upload that same zip
#   --dry-run       print every command in order after "$ ", names filled in, and run none of them. The
#                   checks that only read (release.json, the checkout, the clean tree, the branch) still
#                   run; the fetch is printed and not run, so a dry run needs no network and compares
#                   nothing with origin
#   --allow-branch  a rehearsal on any branch: no fetch and no comparison with origin/main. A rehearsal
#                   never uploads, so it needs --no-upload
#
# Written for the bash 3.2 that macOS ships: no associative arrays, no mapfile, no ${x,,}, no |&.
# Exit status: 0 done; 2 bad arguments or release.json; 3 node is missing; 4 the checkout is not ready
# to release; 5 a step failed (its own message is above the line that says which).

set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd -P)
REPO=$(cd "$HERE/../.." && pwd -P)
cd "$REPO"

MAC_PKG=beethoven-bridge-mac.pkg
WIN_MSI=beethoven-bridge-windows.msi
BRIDGE=extension/public/bridge
SIX="beethoven-bridge-linux.zip beethoven-bridge-mac.pkg beethoven-bridge-mac.zip beethoven-bridge-windows.msi beethoven-bridge-windows.zip manifest.json"

say() { printf '%s\n' "$*"; }
refuse() { code=$1; shift; printf '%s\n' "$*" >&2; exit "$code"; }

usage() {
  cat <<'EOF'
Usage: bash helper/release/release.sh [--no-upload] [--dry-run] [--allow-branch]

  Builds and signs both bridge installers, merges them into the extension, tests and zips it, records
  release/<version>/ and uploads the zip to the Chrome Web Store for review. The names it needs come
  from release.json in your vendor folder (bash helper/release/setup-mac.sh --write-config).

  --no-upload     stop after the record; the summary says how to upload that same zip later
  --dry-run       print every command in order and run none of them
  --allow-branch  rehearse on another branch (no fetch, no comparison with origin/main); needs --no-upload
EOF
}

# ---- arguments -------------------------------------------------------------------------------

DRY=0
UPLOAD=1
ALLOW=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --no-upload) UPLOAD=0 ;;
    --allow-branch) ALLOW=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; refuse 2 "Unknown argument: $1" ;;
  esac
  shift
done
# a build from a branch that is not origin's main is exactly what must never reach students
if [ "$ALLOW" = 1 ] && [ "$UPLOAD" = 1 ]; then
  refuse 2 "--allow-branch is for a rehearsal, and a rehearsal never uploads: add --no-upload."
fi

VENDOR=${BEETHOVEN_VENDOR_DIR:-${ASHLEY_VENDOR_DIR:-${HOME:-}/.beethoven-vendor}}
CONFIG="$VENDOR/release.json"

if command -v shasum >/dev/null 2>&1; then
  SHA="shasum -a 256"
else
  SHA=sha256sum
fi

# ---- the steps -------------------------------------------------------------------------------

N=0
LABEL=
LOGTO=
ARMED=0
STOPPED=
HINT=
WORK=
# 1 from the moment this run makes release/<version>/ until step 14 has passed: an unfinished record of
# its own, which a stop removes (a failed upload keeps its complete record on purpose)
OWN_REL=0

# Prints one argument list as a shell line a person can paste: plain words as they are, anything
# else in single quotes.
show() {
  out=
  for a in "$@"; do
    case "$a" in
      ''|*[!A-Za-z0-9_./:=@%+,-]*) a="'$(printf '%s' "$a" | sed "s/'/'\\\\''/g")'" ;;
    esac
    out="$out${out:+ }$a"
  done
  printf '%s' "$out"
}

begin() { N=$((N + 1)); LABEL=$1; say ""; say "-- step $N: $1"; }

stop() {
  if [ "$N" = 0 ]; then STOPPED="Stopped before the first step: $*"; else STOPPED="Stopped at step $N ($LABEL): $*"; fi
  [ -z "$HINT" ] || STOPPED="$STOPPED
$HINT"
  exit 5
}

# Runs one command from DIR, its output to the terminal and, when LOGTO names a file, to that file
# too (the record quotes the test counts and the summary quotes the store's answer from there).
execute() {
  dir=$1; shift
  st=0
  if [ -n "$LOGTO" ]; then
    (cd "$dir" && "$@") 2>&1 | tee "$LOGTO" || st=$?
  else
    (cd "$dir" && "$@") || st=$?
  fi
  LOGTO=
  if [ "$st" != 0 ]; then stop "it exited with status $st; its own message is above."; fi
}

# run LABEL CMD...: one step, one command from the repository root. run_in DIR LABEL CMD...: from DIR.
run() {
  begin "$1"; shift
  also "$@"
}
# also CMD...: one more command of the same step, from the repository root
also() {
  say "\$ $(show "$@")"
  if [ "$DRY" = 1 ]; then return 0; fi
  execute . "$@"
}
run_in() {
  d=$1; shift
  begin "$1"; shift
  say "\$ (cd $d && $(show "$@"))"
  if [ "$DRY" = 1 ]; then return 0; fi
  execute "$d" "$@"
}
logto() { if [ "$DRY" = 1 ]; then LOGTO=; else LOGTO="$WORK/$1.log"; fi; }
# what the script itself checks after a command: said in a dry run, done and said otherwise
then_check() { say "   then: $1"; }
passed() { say "   ok: $1"; }

finish() {
  st=$?
  trap - ERR
  if [ "$ARMED" = 1 ]; then
    ARMED=0
    if git checkout -- "$BRIDGE/" 2>/dev/null && rm -f "$BRIDGE/$MAC_PKG" "$BRIDGE/$WIN_MSI"; then
      say "   (the tracked $BRIDGE/ is back: git checkout -- $BRIDGE/, and the two installer copies removed)"
    else
      say "   Could not put the tracked $BRIDGE/ back; before anything else run: git checkout -- $BRIDGE/"
    fi
  fi
  if [ "$OWN_REL" = 1 ] && [ "$st" != 0 ]; then
    OWN_REL=0
    if rm -rf "$REL"; then
      say "   (the unfinished record $REL/ is removed: nothing was uploaded, so $VERSION can simply run again)"
    else
      say "   Could not remove this run's unfinished $REL/; nothing was uploaded: remove it, then run again."
    fi
  fi
  if [ -n "$STOPPED" ]; then printf '%s\n' "$STOPPED" >&2; fi
  if [ -n "$WORK" ]; then rm -rf "$WORK"; fi
  exit "$st"
}
trap finish EXIT
# a check the script makes itself, a $(...) or a ( ... ) that set -e would end the run on, is a failed
# step too: its stop names the step and exits 5. Not inherited by functions, so a function whose
# failure matters is called with || stop.
trap 'stop "a command this step runs itself exited with status $?; its own message is above."' ERR

# ---- before anything runs: the checkout holds every script the release calls ------------------

for f in helper/release/setup-mac.sh helper/release/release-config.mjs helper/release/mac/build-pkg.sh \
         helper/release/windows/build-msi-mac.sh helper/build.mjs helper/release/publish-store.mjs extension/package.json; do
  [ -f "$f" ] || refuse 4 "$f is not in this checkout, so the release cannot run to the end; pull main first."
done
command -v node >/dev/null 2>&1 || refuse 3 "node was not found on PATH; bash helper/release/setup-mac.sh says how to install it."
if [ "$DRY" = 1 ]; then
  say "Dry run: every command is printed after \"\$ \" and none is run."
else
  WORK=$(mktemp -d "${TMPDIR:-/tmp}/beethoven-release.XXXXXX")
fi

# ---- 1: this Mac, release.json and the checkout ----------------------------------------------

run "Checking this Mac has everything a release needs" bash helper/release/setup-mac.sh

NAMES=$(node helper/release/release-config.mjs "$CONFIG") || exit 2
nth() { printf '%s\n' "$NAMES" | sed -n "$1p"; }
STORE_ID=$(nth 1)
PUBLISHER_ID=$(nth 2)
APP_ID=$(nth 3)
INST_ID=$(nth 4)
PROFILE=$(nth 5)
AZ_ENDPOINT=$(nth 6)
AZ_ACCOUNT=$(nth 7)
AZ_PROFILE=$(nth 8)
passed "release.json in $VENDOR names everything a release needs"

VERSION=$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version))' extension/package.json 2>/dev/null || true)
printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.0\.0$' \
  || refuse 4 "extension/package.json must carry a whole-number version like 15.0.0."
REL="release/$VERSION"
ZIP_NAME="beethoven-$VERSION-chrome.zip"
ZIP="extension/.output/$ZIP_NAME"
UPLOAD_CMD="node helper/release/publish-store.mjs upload --publisher $(show "$PUBLISHER_ID") --item $STORE_ID --zip $REL/$ZIP_NAME --require-signed --publish"
# a record is never overwritten, and the store takes only a higher version than it has
if [ -e "$REL" ]; then
  refuse 4 "$REL/ is already there: a release record is never overwritten. If its zip reached the store, raise the version in extension/package.json; if it did not (a rehearsal, --no-upload, a failed upload, a run cut off), upload that zip with the command its run printed, or move the folder away and run again."
fi
DIRTY=$(git status --porcelain)
if [ -n "$DIRTY" ]; then
  refuse 4 "The working tree is not clean (git status --porcelain lists what changed); commit or set the changes aside first, since the record names one commit."
fi
BRANCH=$(git symbolic-ref --short -q HEAD || true)
if [ "$ALLOW" != 1 ] && [ "$BRANCH" != main ]; then
  refuse 4 "This checkout is on ${BRANCH:-a detached HEAD}, not main: a release is made from main (a rehearsal elsewhere: --allow-branch --no-upload)."
fi
COMMIT=$(git rev-parse HEAD)
SHORT=$(git rev-parse --short HEAD)
passed "version $VERSION; the working tree is clean on ${BRANCH:-a detached HEAD} at $SHORT"

# ---- 2: what GitHub holds --------------------------------------------------------------------

if [ "$ALLOW" = 1 ]; then
  begin "Comparing main with origin"
  say "   skipped (--allow-branch): a rehearsal is not compared with origin/main"
else
  run "Fetching origin's main, to compare" git fetch origin main
  if [ "$DRY" = 1 ]; then
    then_check "HEAD must be origin/main"
  else
    UPSTREAM=$(git rev-parse -q --verify origin/main || true)
    if [ "$UPSTREAM" != "$COMMIT" ]; then
      refuse 4 "main ($SHORT) is not origin/main (${UPSTREAM:-unknown}) after the fetch: push or pull first, so that the store gets what GitHub holds."
    fi
    passed "main is origin/main"
  fi
fi

# ---- 3-7: the last release's outputs cleared, then the checks on the tracked bridge build -----

run "Clearing the last release's installers out of helper/signed/ and $BRIDGE/" \
  rm -f "helper/signed/$MAC_PKG" "helper/signed/$MAC_PKG.json" "helper/signed/$WIN_MSI" "helper/signed/$WIN_MSI.json" "$BRIDGE/$MAC_PKG" "$BRIDGE/$WIN_MSI"
run_in extension "Installing the extension's locked dependencies" npm ci
# sync-profiles copies the site profiles and the texts the tests read into public/; npm ci does not
# run it, and CI runs it at this same point
run_in extension "Copying the site profiles and the texts into the extension" npm run sync-profiles
run_in extension "Type-checking the extension" npx tsc --noEmit
logto suite
run_in extension "Running the whole test suite, on the tracked bridge build" npx vitest run
# what step 14 would find, found before the notarization: npm run sync-profiles rewrites tracked copies
# (extension/public/'s LICENSE.txt, PRIVACY.md and others) when the committed ones are out of step
if [ "$DRY" = 1 ]; then
  then_check "git status lists nothing: the checks changed no tracked file and left no file behind"
else
  left=$(git status --porcelain -uall)
  [ -z "$left" ] || stop "after the checks git status lists $(printf '%s' "$left" | tr '\n' ';'); they must change nothing, or the zip would not be this commit's. Commit what they write (or remove what they left), then run again."
  passed "the checks changed no tracked file and left no file behind"
fi

# ---- 8-9: the two installers -----------------------------------------------------------------

run "Building, signing and notarizing the Mac installer" \
  bash helper/release/mac/build-pkg.sh --store-id "$STORE_ID" --app-identity "$APP_ID" --installer-identity "$INST_ID" --notary-profile "$PROFILE"
run "Building and signing the Windows installer" \
  bash helper/release/windows/build-msi-mac.sh --store-id "$STORE_ID" --azure-endpoint "$AZ_ENDPOINT" --azure-account "$AZ_ACCOUNT" --azure-profile "$AZ_PROFILE"
# a step that exits 0 and leaves no package would merge the other one alone, a plausible-looking build
if [ "$DRY" = 1 ]; then
  then_check "helper/signed/ holds both installers and both sidecars"
else
  for f in "$MAC_PKG" "$MAC_PKG.json" "$WIN_MSI" "$WIN_MSI.json"; do
    [ -f "helper/signed/$f" ] || stop "helper/signed/$f is not there after the two installer steps."
  done
  passed "helper/signed/ holds both installers and both sidecars"
fi

# ---- 10-12: the merge, the zip and the package tests ------------------------------------------

if [ "$DRY" != 1 ]; then ARMED=1; fi
logto merge
run "Merging both installers into the extension" node helper/build.mjs --store-id "$STORE_ID"
if [ "$DRY" = 1 ]; then
  then_check "build.mjs printed one NOTE line for each of the two signed installers"
else
  notes=$(grep -c '^NOTE: signed installer' "$WORK/merge.log" || true)
  [ "$notes" = 2 ] || stop "helper/build.mjs printed $notes NOTE lines for signed installers, not 2."
  passed "build.mjs verified both sidecars and listed both installers"
fi

run_in extension "Packaging the extension" npm run zip
if [ "$DRY" = 1 ]; then
  then_check "$ZIP is there and its bridge/ holds exactly the six files, byte for byte the merged ones"
else
  [ -f "$ZIP" ] || stop "$ZIP was not written."
  got=$(unzip -Z1 "$ZIP" | sed -n 's|^bridge/\(..*\)$|\1|p' | LC_ALL=C sort | tr '\n' ' ')
  want=$(printf '%s\n' $SIX | LC_ALL=C sort | tr '\n' ' ')
  [ "$got" = "$want" ] || stop "the zip's bridge/ holds $got, not the six files $want."
  for n in $SIX; do
    a=$(unzip -p "$ZIP" "bridge/$n" | $SHA | cut -d' ' -f1)
    b=$($SHA "$BRIDGE/$n" | cut -d' ' -f1)
    [ "$a" = "$b" ] || stop "bridge/$n in the zip is not the merged $BRIDGE/$n."
  done
  passed "$ZIP carries the six bridge files"
fi
logto package
run_in extension "Testing the package that ships (the package tests read extension/.output)" npx vitest run test/hygiene.test.ts

# ---- 13: the record --------------------------------------------------------------------------

# the vitest summary lines, without colour codes, for the record
counts() {
  esc=$(printf '\033')
  sed "s/$esc\[[0-9;]*m//g" "$1" | grep -E '^ *(Test Files|Tests) ' | sed 's/^ *//' | tr '\n' ';' | sed 's/;$//; s/;/; /g' || true
}
# a sidecar's own record of how its package was built
built_with() {
  node -e '
    const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    console.log(`Signed ${j.signed}; built ${j.built_at}.`);
    console.log("");
    for (const [k, v] of Object.entries(j.tools || {})) console.log(`- ${k}: ${v}`);
  ' "$1"
}
size() { wc -c < "$1" | tr -d ' '; }
sum() { $SHA "$1" | cut -d' ' -f1; }

write_readme() {
  if [ "$ALLOW" = 1 ]; then
    where="branch ${BRANCH:-(a detached HEAD)}, a rehearsal (--allow-branch), not compared with origin/main"
  else
    where="main, equal to origin/main after a fetch"
  fi
  if [ "$UPLOAD" = 1 ]; then
    upload="This folder was written before the upload, so whether the store took the zip is not in it: the run's own output says, and the store's developer dashboard shows the item's state."
  else
    upload="This run did not upload (--no-upload)."
  fi
  macos=$(sw_vers -productVersion 2>/dev/null || uname -sr)
  cat <<EOF
# Beethoven $VERSION package and signed bridge installers

Built $(date -u '+%Y-%m-%d at %H:%M UTC') by \`bash helper/release/release.sh\` on the maintainer's Mac
(macOS $macos) from commit \`$COMMIT\` on $where, with a clean working tree. \`SHA256SUMS.txt\`
holds the checksum of every file in this folder but the two checksum files; check it with
\`shasum -a 256 -c SHA256SUMS.txt\` inside this folder, and \`bridge/SHA256SUMS.txt\` inside \`bridge/\`.

| File | For | Size (bytes) |
|---|---|---|
| \`$ZIP_NAME\` | The private Chrome Web Store listing: the file this run uploads | $(size "$REL/$ZIP_NAME") |
| \`bridge/\` | The six files of \`extension/public/bridge/\` as packaged: the three script zips, the two signed installers and \`manifest.json\`, with their own \`SHA256SUMS.txt\` | 6 files and the sums |
| \`guides/\` | \`docs/guides/\` at this commit | |
| \`SHA256SUMS.txt\` | SHA-256 of every other file in this folder | |

The package's SHA-256 is \`$(sum "$REL/$ZIP_NAME")\`. $upload

The zip and the six files of \`bridge/\` name the store's extension, and the two installers carry their
signing certificates, so \`.gitignore\` keeps them out of the repository: they stay on the maintainer's
Mac, and the two \`SHA256SUMS.txt\` files, committed with this README and \`guides/\`, pin them.

## The signed installers

### \`$MAC_PKG\`, $(size "$REL/bridge/$MAC_PKG") bytes, SHA-256 \`$(sum "$REL/bridge/$MAC_PKG")\`

$(built_with "helper/signed/$MAC_PKG.json")

### \`$WIN_MSI\`, $(size "$REL/bridge/$WIN_MSI") bytes, SHA-256 \`$(sum "$REL/bridge/$WIN_MSI")\`

$(built_with "helper/signed/$WIN_MSI.json")

The tools of the rest of the build: node $(node --version), npm $(npm --version 2>/dev/null || say unknown), $(git --version).

## What this run checked

- \`setup-mac.sh\`: everything on its list was on this Mac.
- The working tree was clean on $where.
- \`npm ci\`, \`npm run sync-profiles\`, \`npx tsc --noEmit\`, then \`npx vitest run\` on the tracked bridge
  build: $(counts "$WORK/suite.log").
- \`mac/build-pkg.sh\` exited 0. By its own checks Apple's notary service answered Accepted, the ticket
  was stapled and validated, and this Mac's Gatekeeper accepted the package.
- \`windows/build-msi-mac.sh\` exited 0, by its own checks.
- \`node helper/build.mjs --store-id <the store's id>\` checked both sidecars against their files
  (helper version, protocol, size, SHA-256, the store's origin, the way each is signed) and printed one
  NOTE line for each installer.
- \`npm run zip\`; the zip's \`bridge/\` holds exactly the six files, byte for byte the merged ones.
- \`npx vitest run test/hygiene.test.ts\` on the built package: $(counts "$WORK/package.log").
- Both \`SHA256SUMS.txt\` files verified with \`shasum -c\`.

## What is not proven

- No installer was opened by this run, on this Mac or anywhere else: a student's Mac taking the
  \`.pkg\` without a prompt, and Windows taking the \`.msi\`, are not shown here.
- SmartScreen's verdict on an \`.msi\` from a publisher it has not seen before is not yet measured.
- Google's review: the upload submits the zip for review, and the store sends the update to students
  only after approval.
- Everything \`helper/release/README.md\` lists under "Not yet measured" that no later record says was measured.
EOF
}

begin "Recording the shipped files in $REL/"
if [ "$DRY" = 1 ]; then
  say "   writes in $REL/: $ZIP_NAME, a copy of $ZIP and the file the upload sends;"
  say "   bridge/, the six files of $BRIDGE/ with their SHA256SUMS.txt; guides/, from docs/guides;"
  say "   README.md; and SHA256SUMS.txt over the folder"
else
  OWN_REL=1
  mkdir -p "$REL/bridge"
  cp "$ZIP" "$REL/$ZIP_NAME"
  for n in $SIX; do cp "$BRIDGE/$n" "$REL/bridge/$n"; done
  (cd "$REL/bridge" && for n in $(printf '%s\n' $SIX | LC_ALL=C sort); do $SHA -b "$n"; done) > "$WORK/bridge-sums"
  mv "$WORK/bridge-sums" "$REL/bridge/SHA256SUMS.txt"
  if ls docs/guides/*.md >/dev/null 2>&1; then
    mkdir -p "$REL/guides"
    cp docs/guides/*.md "$REL/guides/"
  fi
  write_readme > "$WORK/README.md" || stop "the record's README.md could not be written."
  mv "$WORK/README.md" "$REL/README.md"
  (cd "$REL" && find . -type f ! -name SHA256SUMS.txt | sed 's|^\./||' | LC_ALL=C sort | while IFS= read -r f; do $SHA "$f"; done) > "$WORK/sums"
  mv "$WORK/sums" "$REL/SHA256SUMS.txt"
  (cd "$REL" && $SHA -c SHA256SUMS.txt >/dev/null && cd bridge && $SHA -c SHA256SUMS.txt >/dev/null) \
    || stop "the checksums written in $REL/ do not verify."
  passed "$REL/ written, and both SHA256SUMS.txt files verify"
fi

# ---- 14: the tracked files back --------------------------------------------------------------

run "Putting the tracked bridge files back" git checkout -- "$BRIDGE/"
also rm -f "$BRIDGE/$MAC_PKG" "$BRIDGE/$WIN_MSI"
also node helper/build.mjs --check --no-signed
if [ "$DRY" = 1 ]; then
  then_check "git status lists nothing but $REL/"
else
  ARMED=0
  # the build must not have changed a tracked file, or the zip is not quite this commit; every
  # untracked file is listed one by one, since a first record shows only as "release/" otherwise
  left=$(git status --porcelain -uall | sed "\\|^?? $REL/|d")
  [ -z "$left" ] || stop "besides $REL/, git status lists $(printf '%s' "$left" | tr '\n' ';'), so the zip may not be this commit's; nothing was uploaded."
  OWN_REL=0
  passed "git status lists nothing but $REL/"
fi

# ---- 15: the upload --------------------------------------------------------------------------

if [ "$UPLOAD" = 1 ]; then
  HINT="The record in $REL/ is complete. Once the cause is fixed, upload that same file with:
  $UPLOAD_CMD"
  logto upload
  run "Uploading to the Chrome Web Store and submitting it for review" \
    node helper/release/publish-store.mjs upload --publisher "$PUBLISHER_ID" --item "$STORE_ID" --zip "$REL/$ZIP_NAME" --require-signed --publish
  HINT=
else
  begin "Uploading to the Chrome Web Store"
  say "   skipped (--no-upload)"
fi

# ---- the summary -----------------------------------------------------------------------------

say ""
if [ "$DRY" = 1 ]; then
  say "Dry run: nothing was run, written or uploaded."
  exit 0
fi
say "Beethoven $VERSION"
say "  Mac installer      $MAC_PKG      sha256 $(sum "$REL/bridge/$MAC_PKG" | cut -c1-12)..."
say "  Windows installer  $WIN_MSI  sha256 $(sum "$REL/bridge/$WIN_MSI" | cut -c1-12)..."
if [ "$UPLOAD" = 1 ]; then
  # the upload is done: a summary that cannot read its log must not report a failed step
  answer=$(sed '/^[[:space:]]*$/d' "$WORK/upload.log" | tail -n 1) || answer=
  say "  The store's answer: ${answer:-(it printed nothing)}"
  say "Google reviews it; students get it within hours of approval."
else
  say "  Not uploaded (--no-upload). To upload this same file later:"
  say "  $UPLOAD_CMD"
fi
say ""
say "The record is in $REL/. Its zip and bridge/ name the store's extension, so .gitignore keeps them out"
say "of the repository: keep the folder on this Mac. To commit the rest (this script commits and pushes nothing):"
say "  git add $REL"
say "  git commit -m \"Beethoven $VERSION: the release record\""
if [ "$ALLOW" != 1 ]; then say "  git push origin main"; fi
exit 0
