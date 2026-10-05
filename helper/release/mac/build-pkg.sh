#!/bin/bash
# Builds and signs beethoven-bridge-mac.pkg, the installer of the Beethoven bridge's binary edition
# (helper/src/rust), on the maintainer's own Mac. Nothing here runs in CI, and nothing here is a
# secret: the two identities are the names of certificates in the login keychain, and the notary
# profile is the name of an entry notarytool keeps in the keychain (xcrun notarytool
# store-credentials <name>). The script passes names and never a password, a key or a token.
#
#   bash helper/release/mac/build-pkg.sh --store-id <32 letters a-p> \
#     --app-identity "Developer ID Application: <Name> (<TEAMID>)" \
#     --installer-identity "Developer ID Installer: <Name> (<TEAMID>)" \
#     --notary-profile <name> [--out DIR] [--targets "aarch64-apple-darwin x86_64-apple-darwin"] [--keep-work]
#   ... --no-notarize       a trial of the steps; the result goes to <out>/trial, must never ship, gets no sidecar
#
# In order: check the tools; read helper/VERSION; build the bridge for each target into a work
# folder (the repository's target/ is untouched); join the builds with lipo; sign the binary with
# the hardened runtime and a timestamp and verify it; lay the payload out as it lands in the
# student's home, with the modes the contract names; pkgbuild the component with the postinstall
# script; productbuild the distribution package, signed; notarize, staple and validate; check the
# signature and Gatekeeper's verdict; copy the package out and write the sidecar helper/build.mjs
# reads. The package reaches --out only after every check, so a failed notarization leaves nothing
# behind for a build to pick up.
#
# Written for the bash 3.2 that macOS ships: no associative arrays, no mapfile, no ${x,,}, no |&.
# Exit status: 2 bad arguments, 3 a tool is missing, 4 a step did not produce what it should,
# 5 Apple or Gatekeeper refused. Test hook, used only by extension/test/releaseMac.test.ts and never
# by the maintainer: BEETHOVEN_PKG_PLAIN_JSON=1 writes the sidecar with printf even where
# /usr/bin/python3 exists, so both writers are exercised.

set -euo pipefail

IDENT=com.openspineconsortium.beethoven.bridge
PKG_NAME=beethoven-bridge-mac.pkg
HERE=$(cd "$(dirname "$0")" && pwd -P)
HELPER=$(cd "$HERE/../.." && pwd -P)
RUST="$HELPER/src/rust"

say() { printf '%s\n' "$*"; }
step() { printf '%s\n' "-- $*"; }
die() { code=$1; shift; printf '%s\n' "$*" >&2; exit "$code"; }

usage() {
  cat <<'EOF'
Usage: bash helper/release/mac/build-pkg.sh --store-id ID --app-identity NAME --installer-identity NAME
         (--notary-profile NAME | --no-notarize) [--out DIR] [--targets "T1 T2"] [--keep-work]

  --store-id ID             the extension's 32-letter identifier (letters a to p), as the Chrome Web
                            Store developer dashboard shows it; baked into allowed_origins.json
  --app-identity NAME       "Developer ID Application: <Name> (<TEAMID>)", a certificate in the login keychain
  --installer-identity NAME "Developer ID Installer: <Name> (<TEAMID>)", likewise
  --notary-profile NAME     the keychain profile made by: xcrun notarytool store-credentials NAME
  --no-notarize             a trial of the steps only: the package goes to <out>/trial, gets no
                            sidecar and must never ship
  --out DIR                 where the package and its sidecar go (default: helper/signed)
  --targets "T1 T2"         the Rust targets joined into one binary
                            (default: aarch64-apple-darwin x86_64-apple-darwin)
  --keep-work               keep the work folder instead of removing it at the end
EOF
}

# ---- arguments -------------------------------------------------------------------------------

STORE_ID=
APP_ID=
INST_ID=
PROFILE=
OUT=
KEEP=0
NOTARIZE=1
TARGETS="aarch64-apple-darwin x86_64-apple-darwin"

while [ $# -gt 0 ]; do
  case "$1" in
    --store-id|--app-identity|--installer-identity|--notary-profile|--out|--targets)
      [ -n "${2:-}" ] || die 2 "$1 needs a value."
      case "$1" in
        --store-id) STORE_ID=$2 ;;
        --app-identity) APP_ID=$2 ;;
        --installer-identity) INST_ID=$2 ;;
        --notary-profile) PROFILE=$2 ;;
        --out) OUT=$2 ;;
        --targets) TARGETS=$2 ;;
      esac
      shift 2 ;;
    --no-notarize) NOTARIZE=0; shift ;;
    --keep-work) KEEP=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die 2 "Unknown argument: $1" ;;
  esac
done

printf '%s' "$STORE_ID" | grep -Eq '^[a-p]{32}$' \
  || die 2 "--store-id must be the extension's 32-letter identifier (letters a to p), as the Chrome Web Store developer dashboard shows it."
# The two certificate kinds are easy to swap, and a package signed with the wrong one (or with an
# "Apple Development" certificate) is one Gatekeeper rejects on every student's Mac.
case "$APP_ID" in
  "Developer ID Application: "*) ;;
  *) die 2 '--app-identity must name the "Developer ID Application: <Name> (<TEAMID>)" certificate in the login keychain.' ;;
esac
case "$INST_ID" in
  "Developer ID Installer: "*) ;;
  *) die 2 '--installer-identity must name the "Developer ID Installer: <Name> (<TEAMID>)" certificate in the login keychain.' ;;
esac
if [ "$NOTARIZE" = 1 ] && [ -z "$PROFILE" ]; then
  die 2 "--notary-profile is required (the name given to xcrun notarytool store-credentials), unless --no-notarize is given for a trial that never ships."
fi
[ -n "$TARGETS" ] || die 2 "--targets needs at least one Rust target."
for t in $TARGETS; do
  case "$t" in
    *-apple-darwin) ;;
    *) die 2 "--targets takes Apple targets only (like aarch64-apple-darwin), not $t." ;;
  esac
done

# ---- tools and sources -----------------------------------------------------------------------

step "Checking the tools"
need() { command -v "$1" >/dev/null 2>&1 || die 3 "$1 was not found on PATH: $2"; }
need cargo "install Rust with rustup."
need rustup "install Rust with rustup."
for t in lipo codesign pkgbuild productbuild xcrun spctl pkgutil; do
  need "$t" "it comes with the Xcode command line tools (xcode-select --install)."
done
if command -v shasum >/dev/null 2>&1; then
  SHA_CMD="shasum -a 256"
elif command -v sha256sum >/dev/null 2>&1; then
  SHA_CMD=sha256sum
else
  die 3 "neither shasum nor sha256sum was found on PATH."
fi
INSTALLED=$(rustup target list --installed)
for t in $TARGETS; do
  printf '%s\n' "$INSTALLED" | grep -Fxq "$t" || die 3 "the Rust target $t is not installed: rustup target add $t"
done

step "Reading helper/VERSION"
VERSION=$(tr -d '\r\n' < "$HELPER/VERSION")
printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.0\.0$' || die 4 "helper/VERSION must be a whole-number version like 1.0.0, not $VERSION."
for f in distribution.xml scripts/postinstall payload/uninstall.command payload/README.txt; do
  [ -f "$HERE/$f" ] || die 4 "$HERE/$f is missing."
done
[ -f "$RUST/Cargo.toml" ] || die 4 "$RUST/Cargo.toml is missing."
say "   bridge $VERSION"

[ -n "$OUT" ] || OUT="$HELPER/signed"
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd -P)
if [ "$NOTARIZE" != 1 ]; then
  OUT="$OUT/trial"
  mkdir -p "$OUT"
fi

WORK=$(mktemp -d "${TMPDIR:-/tmp}/beethoven-bridge-pkg.XXXXXX")
cleanup() {
  if [ "$KEEP" = 1 ]; then say "Work folder kept: $WORK"; else rm -rf "$WORK"; fi
}
trap cleanup EXIT

# ---- the binary ------------------------------------------------------------------------------

BINS=()
for t in $TARGETS; do
  step "Building the bridge for $t (cargo build --release --locked)"
  (cd "$RUST" && cargo build --release --locked --target "$t" --target-dir "$WORK/target")
  b="$WORK/target/$t/release/beethoven-bridge"
  [ -f "$b" ] || die 4 "cargo did not produce $b."
  BINS[${#BINS[@]}]=$b
done

BIN="$WORK/beethoven-bridge"
step "Joining ${#BINS[@]} build(s) into one binary with lipo"
lipo -create "${BINS[@]}" -output "$BIN"
chmod 755 "$BIN"

step "Signing the binary with the hardened runtime and a timestamp (codesign)"
codesign --force --options runtime --timestamp --sign "$APP_ID" "$BIN"
step "Verifying the binary's signature (codesign --verify --strict)"
codesign --verify --strict --verbose=2 "$BIN"

# ---- the payload -----------------------------------------------------------------------------

step "Laying out the payload as it lands in the student's home"
ROOT="$WORK/root"
DEST="$ROOT/Library/Application Support/Beethoven/bridge"
mkdir -p "$DEST"
cp "$BIN" "$DEST/beethoven-bridge"
cp "$HERE/payload/uninstall.command" "$DEST/uninstall.command"
cp "$HERE/payload/README.txt" "$DEST/README.txt"
ORIGIN="chrome-extension://$STORE_ID/"
printf '["%s"]\n' "$ORIGIN" > "$DEST/allowed_origins.json"
chmod 755 "$DEST/beethoven-bridge" "$DEST/uninstall.command"
chmod 644 "$DEST/README.txt" "$DEST/allowed_origins.json"
# The folders above the bridge's own land on the student's: the home folder itself (the root, "."),
# ~/Library and ~/Library/Application Support. The package records a mode for each, and whether the
# Installer applies it to a folder that is already there is not yet measured, so none is wider than
# macOS makes it for a new account (0750 for the home folder, 0700 for the two below it; from macOS's
# defaults as known, not read on a Mac here): no other account is ever let in. Only Beethoven/ and
# bridge/, which are the package's own, are 0755.
chmod 750 "$ROOT"
chmod 700 "$ROOT/Library" "$ROOT/Library/Application Support"
chmod 755 "$ROOT/Library/Application Support/Beethoven" "$DEST"

SCRIPTS="$WORK/scripts"
mkdir -p "$SCRIPTS"
cp "$HERE/scripts/postinstall" "$SCRIPTS/postinstall"
chmod 755 "$SCRIPTS/postinstall"

# The Installer shows the welcome text from a file in the resources folder, so the plain words a
# student reads before clicking Install live here and distribution.xml points at them.
RESOURCES="$WORK/resources"
mkdir -p "$RESOURCES"
cat > "$RESOURCES/welcome.txt" <<EOF
Beethoven bridge $VERSION

This installs the Beethoven bridge, a small program Beethoven uses to reach your university's grid from Chrome without the GlobalProtect VPN. It carries Beethoven's encrypted connection to the grid and nothing else: it cannot read what passes through it, keeps no password or key, and starts no other program.

It installs into your own account only, in the folder Library/Application Support/Beethoven/bridge inside your home folder, and tells Chrome where to find it. No administrator password is asked.

To remove it later, open that folder and open uninstall.command.
EOF
chmod 644 "$RESOURCES/welcome.txt"

# ---- the packages ----------------------------------------------------------------------------

COMPONENT_NAME=component.pkg
step "Building the component package (pkgbuild)"
pkgbuild --root "$ROOT" --scripts "$SCRIPTS" --identifier "$IDENT" --version "$VERSION" --install-location / "$WORK/$COMPONENT_NAME"

step "Filling in distribution.xml"
sed -e "s|@COMPONENT_PKG@|$COMPONENT_NAME|g" -e "s|@VERSION@|$VERSION|g" "$HERE/distribution.xml" > "$WORK/distribution.xml"
if grep -q '@[A-Z_]*@' "$WORK/distribution.xml"; then
  die 4 "distribution.xml still carries a token the script does not know."
fi

PKG="$WORK/$PKG_NAME"
step "Building the installer package, signed (productbuild)"
productbuild --distribution "$WORK/distribution.xml" --resources "$RESOURCES" --package-path "$WORK" --sign "$INST_ID" --timestamp "$PKG"
[ -f "$PKG" ] || die 4 "productbuild did not produce $PKG."

# ---- notarization ----------------------------------------------------------------------------

if [ "$NOTARIZE" = 1 ]; then
  step "Submitting the package to Apple's notary service and waiting for its answer (notarytool)"
  if NOTARY_OUT=$(xcrun notarytool submit "$PKG" --keychain-profile "$PROFILE" --wait 2>&1); then
    printf '%s\n' "$NOTARY_OUT"
  else
    printf '%s\n' "$NOTARY_OUT"
    die 5 "notarytool did not complete; nothing was written to $OUT."
  fi
  # notarytool --wait ends with the submission's status; anything but Accepted means Apple found
  # something, and "xcrun notarytool log <id> --keychain-profile <name>" says what.
  if ! printf '%s\n' "$NOTARY_OUT" | grep -q 'status: Accepted'; then
    die 5 "Apple did not accept the package (xcrun notarytool log <id> --keychain-profile $PROFILE shows why); nothing was written to $OUT."
  fi
  step "Stapling the notarization ticket to the package (stapler staple)"
  xcrun stapler staple "$PKG"
  step "Validating the stapled ticket (stapler validate)"
  xcrun stapler validate "$PKG"
else
  step "Skipping notarization (--no-notarize): this is a trial build"
fi

# ---- checks ----------------------------------------------------------------------------------

step "Checking the installer signature (pkgutil --check-signature)"
pkgutil --check-signature "$PKG"

step "Asking Gatekeeper (spctl -a -vv -t install)"
# "accepted" followed by "source=Notarized Developer ID" is this Mac's Gatekeeper saying the package
# is signed with a Developer ID and a notarization ticket for it is known, which is the check a
# student's Mac makes when the Installer opens; a signed but un-notarized package is "rejected"
# here. That a real Mac prints these words for this package is not yet measured.
if SPCTL_OUT=$(spctl -a -vv -t install "$PKG" 2>&1); then
  printf '%s\n' "$SPCTL_OUT"
else
  printf '%s\n' "$SPCTL_OUT"
  if [ "$NOTARIZE" = 1 ]; then
    die 5 "Gatekeeper did not accept the package, so nothing was written to $OUT and no sidecar was made."
  fi
  say "   (Gatekeeper rejects a package that was not notarized; a trial build is expected to be rejected.)"
fi

# ---- output ----------------------------------------------------------------------------------

step "Copying the package to $OUT"
cp "$PKG" "$OUT/$PKG_NAME"
FINAL="$OUT/$PKG_NAME"

if [ "$NOTARIZE" != 1 ]; then
  say ""
  say "Wrote $FINAL"
  say "This package was NOT notarized. It is a trial of the build steps and must never ship: no sidecar was written, so helper/build.mjs will not pick it up."
  exit 0
fi

step "Writing the sidecar"
SIZE=$(wc -c < "$FINAL" | tr -d ' ')
SHA=$($SHA_CMD "$FINAL" | cut -d' ' -f1)
printf '%s' "$SHA" | grep -Eq '^[0-9a-f]{64}$' || die 4 "the SHA-256 of $FINAL could not be read."
BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# The tool versions are a record of what built the package, nothing more; each is optional.
# Whether pkgbuild and productbuild answer --version with a line is not yet measured; an empty
# answer is simply left out.
RUSTC_V=$(rustc --version 2>/dev/null || true)
MACOS_V=$(sw_vers -productVersion 2>/dev/null || true)
XCODE_V=$(xcodebuild -version 2>/dev/null | sed -n 1p || true)
PKGBUILD_V=$(pkgbuild --version 2>/dev/null | sed -n 1p || true)
PRODUCTBUILD_V=$(productbuild --version 2>/dev/null | sed -n 1p || true)
SIDECAR="$FINAL.json"

jesc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
write_sidecar_plain() {
  {
    printf '{\n'
    printf '  "name": "%s",\n' "$PKG_NAME"
    printf '  "os": "mac",\n'
    printf '  "kind": "binary",\n'
    printf '  "helper": "%s",\n' "$VERSION"
    printf '  "protocol": 1,\n'
    printf '  "size": %s,\n' "$SIZE"
    printf '  "sha256": "%s",\n' "$SHA"
    printf '  "allowed_origins": ["%s"],\n' "$ORIGIN"
    printf '  "signed": "developer-id-notarized",\n'
    printf '  "built_at": "%s",\n' "$BUILT_AT"
    printf '  "tools": {'
    sep=
    for pair in "rustc=$RUSTC_V" "macos=$MACOS_V" "xcodebuild=$XCODE_V" "pkgbuild=$PKGBUILD_V" "productbuild=$PRODUCTBUILD_V"; do
      k=${pair%%=*}
      v=${pair#*=}
      [ -n "$v" ] || continue
      printf '%s\n    "%s": "%s"' "$sep" "$k" "$(jesc "$v")"
      sep=,
    done
    printf '\n  }\n}\n'
  } > "$SIDECAR"
}

if [ -x /usr/bin/python3 ] && [ "${BEETHOVEN_PKG_PLAIN_JSON:-0}" != 1 ]; then
  BP_NAME="$PKG_NAME" BP_HELPER="$VERSION" BP_SIZE="$SIZE" BP_SHA="$SHA" BP_ORIGIN="$ORIGIN" BP_BUILT="$BUILT_AT" \
  BP_RUSTC="$RUSTC_V" BP_MACOS="$MACOS_V" BP_XCODE="$XCODE_V" BP_PKGBUILD="$PKGBUILD_V" BP_PRODUCTBUILD="$PRODUCTBUILD_V" \
  /usr/bin/python3 - "$SIDECAR" <<'PY'
import json, os, sys
e = os.environ
tools = {}
for key, var in (("rustc", "BP_RUSTC"), ("macos", "BP_MACOS"), ("xcodebuild", "BP_XCODE"), ("pkgbuild", "BP_PKGBUILD"), ("productbuild", "BP_PRODUCTBUILD")):
    if e.get(var):
        tools[key] = e[var]
doc = {
    "name": e["BP_NAME"], "os": "mac", "kind": "binary", "helper": e["BP_HELPER"], "protocol": 1,
    "size": int(e["BP_SIZE"]), "sha256": e["BP_SHA"], "allowed_origins": [e["BP_ORIGIN"]],
    "signed": "developer-id-notarized", "built_at": e["BP_BUILT"], "tools": tools,
}
with open(sys.argv[1], "w") as f:
    json.dump(doc, f, indent=2)
    f.write("\n")
PY
else
  write_sidecar_plain
fi

say ""
say "Wrote $FINAL ($SIZE bytes, sha256 $SHA)"
say "Wrote $SIDECAR"
say "Next: node helper/build.mjs --store-id $STORE_ID on the releasing machine copies the package into the extension when the sidecar checks out."
exit 0
