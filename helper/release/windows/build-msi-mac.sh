#!/bin/bash
# Builds and signs beethoven-bridge-windows.msi, the per-user Windows installer of the Beethoven
# bridge's binary edition (helper/src/rust), on the maintainer's own Mac, with no Windows machine:
# Rust cross-builds the exe with the mingw-w64 linker, msitools' wixl builds the MSI from bridge.wxs
# (the package Package.wxs describes, in the WiX v3 schema wixl reads), and jsign signs both files
# through Azure Artifact Signing (formerly Trusted Signing; jsign still calls its store type
# TRUSTEDSIGNING). build-msi.ps1 remains the route on a Windows machine; both leave the same two files.
#
# Nothing here runs in CI, and nothing here is a secret. The three Azure names are the account's
# endpoint host, the account and its certificate profile, kept in the maintainer's vendor folder and
# passed in as arguments. The one credential is an access token for the maintainer's own Entra
# sign-in (az login): az writes it into a pipe this script reads, it is exported only for the one
# jsign call that needs it, jsign reads it from the environment (--storepass env:NAME), and it is
# unset the moment jsign returns. It is never an argument, never in a file, never printed.
#
#   bash helper/release/windows/build-msi-mac.sh --store-id <32 letters a-p> \
#     --azure-endpoint <region>.codesigning.azure.net --azure-account <account> --azure-profile <profile> \
#     [--out DIR] [--keep-work]
#   ... --no-sign      a trial of the steps; the result goes to <out>/trial, must never ship, gets no sidecar
#
# In order: check the tools (and that az can get a token); read helper/VERSION; cross-build the exe
# into a work folder (the repository's target/ is untouched); refuse an exe that needs a library
# Windows does not carry itself; stage the exe, the host manifest (its "path" the relative exe name,
# exactly as build-msi.ps1 writes it) and README.txt; sign the exe and check its signature; build the
# MSI with wixl, refusing any warning; read the MSI's tables back with msiinfo; sign the MSI and check
# its signature; copy it out and write the sidecar helper/build.mjs reads. The MSI reaches --out only
# after every check, so a refused signature leaves nothing behind for a build to pick up.
#
# Written for the bash 3.2 that macOS ships: no associative arrays, no mapfile, no ${x,,}, no |&.
# Exit status: 2 bad arguments, 3 a tool is missing, 4 a step did not produce what it should,
# 5 Azure refused or could not be reached. Test hook, used only by
# extension/test/releaseWindowsMac.test.ts and never by the maintainer: BEETHOVEN_MSI_TEST_EXE=<file>,
# accepted only with --no-sign, packages that file instead of building one (no cargo, no import check).

set -euo pipefail

HOST_NAME=com.openspineconsortium.beethoven.bridge
MSI_NAME=beethoven-bridge-windows.msi
EXE_NAME=beethoven-bridge.exe
TARGET=x86_64-pc-windows-gnu
LINKER=x86_64-w64-mingw32-gcc
OBJDUMP=x86_64-w64-mingw32-objdump
AZ_RESOURCE=https://codesigning.azure.net
TSA_URL=http://timestamp.acs.microsoft.com
# What a release exe may import: the libraries every Windows 10 and 11 carries. The first six are
# what the bridge imports when cross-built today (measured 2026-10-04); advapi32, bcrypt and userenv
# are Windows' own too and have been imported by other releases of Rust's standard library. A mingw
# runtime library (libgcc_s_seh-1.dll, libwinpthread-1.dll) is exactly what must not slip in: a
# student's computer does not have it, and the bridge would not start.
ALLOWED_DLLS="kernel32.dll ntdll.dll msvcrt.dll ws2_32.dll bcryptprimitives.dll api-ms-win-core-synch-l1-2-0.dll advapi32.dll bcrypt.dll userenv.dll"
HERE=$(cd "$(dirname "$0")" && pwd -P)
HELPER=$(cd "$HERE/../.." && pwd -P)
RUST="$HELPER/src/rust"
WXS="$HERE/bridge.wxs"
VENDOR=${BEETHOVEN_VENDOR_DIR:-${ASHLEY_VENDOR_DIR:-$HOME/.beethoven-vendor}}

say() { printf '%s\n' "$*"; }
step() { printf '%s\n' "-- $*"; }
die() { code=$1; shift; printf '%s\n' "$*" >&2; exit "$code"; }

usage() {
  cat <<'EOF'
Usage: bash helper/release/windows/build-msi-mac.sh --store-id ID
         (--azure-endpoint HOST --azure-account NAME --azure-profile NAME | --no-sign) [--out DIR] [--keep-work]

  --store-id ID           the extension's 32-letter identifier (letters a to p), as the Chrome Web
                          Store developer dashboard shows it; baked into the host manifest
  --azure-endpoint HOST   the Artifact Signing account's endpoint host, like <region>.codesigning.azure.net
  --azure-account NAME    the Artifact Signing account
  --azure-profile NAME    the certificate profile in that account
  --no-sign               a trial of the steps only: the MSI goes to <out>/trial unsigned, gets no
                          sidecar and must never ship
  --out DIR               where the MSI and its sidecar go (default: helper/signed)
  --keep-work             keep the work folder instead of removing it at the end

The access token comes from your own az login; nothing here asks for a key or a secret.
EOF
}

# ---- arguments -------------------------------------------------------------------------------

STORE_ID=
ENDPOINT=
ACCOUNT=
PROFILE=
OUT=
KEEP=0
SIGN=1

while [ $# -gt 0 ]; do
  case "$1" in
    --store-id|--azure-endpoint|--azure-account|--azure-profile|--out)
      [ -n "${2:-}" ] || die 2 "$1 needs a value."
      case "$1" in
        --store-id) STORE_ID=$2 ;;
        --azure-endpoint) ENDPOINT=$2 ;;
        --azure-account) ACCOUNT=$2 ;;
        --azure-profile) PROFILE=$2 ;;
        --out) OUT=$2 ;;
      esac
      shift 2 ;;
    --no-sign) SIGN=0; shift ;;
    --keep-work) KEEP=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die 2 "Unknown argument: $1" ;;
  esac
done

printf '%s' "$STORE_ID" | grep -Eq '^[a-p]{32}$' \
  || die 2 "--store-id must be the extension's 32-letter identifier (letters a to p), as the Chrome Web Store developer dashboard shows it."

# The endpoint is the host jsign talks to; the Azure portal shows it as a URL, so a leading https://
# and a trailing slash are taken off rather than refused.
ENDPOINT=${ENDPOINT#https://}
ENDPOINT=${ENDPOINT%/}
if [ "$SIGN" = 1 ]; then
  [ -n "$ENDPOINT" ] || die 2 "--azure-endpoint is required (the account's endpoint host, like <region>.codesigning.azure.net), unless --no-sign is given for a trial that never ships."
  [ -n "$ACCOUNT" ] || die 2 "--azure-account is required (the Artifact Signing account's name), unless --no-sign is given for a trial that never ships."
  [ -n "$PROFILE" ] || die 2 "--azure-profile is required (the certificate profile's name), unless --no-sign is given for a trial that never ships."
fi
if [ -n "$ENDPOINT" ]; then
  printf '%s' "$ENDPOINT" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' \
    || die 2 "--azure-endpoint must be a host name in lower case, like <region>.codesigning.azure.net, with no path."
fi
# Names only: letters, digits and hyphens, which also refuses an example's <placeholder> and the
# "account/profile" pair jsign is given, so a name cannot be put in the wrong place.
for pair in "--azure-account=$ACCOUNT" "--azure-profile=$PROFILE"; do
  opt=${pair%%=*}
  v=${pair#*=}
  [ -z "$v" ] && continue
  printf '%s' "$v" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9-]*$' \
    || die 2 "$opt must be a name of letters, digits and hyphens, as the Azure portal shows it."
done

TEST_EXE=${BEETHOVEN_MSI_TEST_EXE:-}
if [ -n "$TEST_EXE" ]; then
  [ "$SIGN" = 0 ] || die 2 "BEETHOVEN_MSI_TEST_EXE is a test hook and is accepted only with --no-sign; unset it to build a release."
  [ -f "$TEST_EXE" ] || die 2 "BEETHOVEN_MSI_TEST_EXE names $TEST_EXE, which is not a file."
fi

# ---- tools and sources -----------------------------------------------------------------------

step "Checking the tools"
need() { command -v "$1" >/dev/null 2>&1 || die 3 "$1 was not found on PATH: $2"; }
if [ -z "$TEST_EXE" ]; then
  need cargo "install Rust with rustup."
  need rustup "install Rust with rustup."
  need "$LINKER" "brew install mingw-w64 (Rust links the Windows exe with it)."
  need "$OBJDUMP" "brew install mingw-w64 (it lists the libraries the exe imports)."
  rustup target list --installed | grep -Fxq "$TARGET" || die 3 "the Rust target $TARGET is not installed: rustup target add $TARGET"
fi
need wixl "brew install msitools (wixl builds the MSI)."
need msiinfo "brew install msitools (msiinfo reads the MSI's tables back)."
if command -v shasum >/dev/null 2>&1; then
  SHA_CMD="shasum -a 256"
elif command -v sha256sum >/dev/null 2>&1; then
  SHA_CMD=sha256sum
else
  die 3 "neither shasum nor sha256sum was found on PATH."
fi
if [ "$SIGN" = 1 ]; then
  need az "brew install azure-cli, then az login with the account that may sign with the certificate profile."
  need osslsigncode "brew install osslsigncode (it checks both signatures)."
  # jsign: the command in JSIGN if set (it may be "java -jar /path/jsign.jar"), else jsign on PATH,
  # else jsign.jar in the vendor folder run with java.
  if [ -n "${JSIGN:-}" ]; then
    set -f
    JSIGN_CMD=($JSIGN)
    set +f
    command -v "${JSIGN_CMD[0]}" >/dev/null 2>&1 || die 3 "JSIGN names ${JSIGN_CMD[0]}, which was not found."
  elif command -v jsign >/dev/null 2>&1; then
    JSIGN_CMD=(jsign)
  elif [ -f "$VENDOR/jsign.jar" ]; then
    need java "brew install openjdk (jsign.jar in the vendor folder runs on it)."
    JSIGN_CMD=(java -jar "$VENDOR/jsign.jar")
  else
    die 3 "jsign was not found: brew install jsign, or put jsign.jar from Maven Central (net.jsign:jsign) in $VENDOR with java on PATH, or set JSIGN to the command."
  fi
  # A sign-in that has lapsed is found now, before anything is built; --output none means az prints
  # nothing on success, so the token goes nowhere.
  step "Checking that az can get a token for Artifact Signing (az login)"
  az account get-access-token --resource "$AZ_RESOURCE" --output none >/dev/null \
    || die 5 "az could not get a token for Artifact Signing: sign in with az login (the identity that may sign with the certificate profile) and run this again."
fi

step "Reading helper/VERSION"
VERSION=$(tr -d '\r\n' < "$HELPER/VERSION")
printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.0\.0$' || die 4 "helper/VERSION must be a whole-number version like 1.0.0, not $VERSION."
for f in "$WXS" "$HERE/README.txt" "$RUST/Cargo.toml"; do
  [ -f "$f" ] || die 4 "$f is missing."
done
UPGRADE_CODE=$(sed -n 's/.*UpgradeCode="\([0-9A-F-]*\)".*/\1/p' "$WXS" | sed -n 1p)
printf '%s' "$UPGRADE_CODE" | grep -Eq '^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$' || die 4 "bridge.wxs carries no UpgradeCode this script can read."
say "   bridge $VERSION"

[ -n "$OUT" ] || OUT="$HELPER/signed"
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd -P)
if [ "$SIGN" != 1 ]; then
  OUT="$OUT/trial"
  mkdir -p "$OUT"
fi

WORK=$(mktemp -d "${TMPDIR:-/tmp}/beethoven-bridge-msi.XXXXXX")
cleanup() {
  unset BEETHOVEN_SIGNING_TOKEN
  if [ "$KEEP" = 1 ]; then say "Work folder kept: $WORK"; else rm -rf "$WORK"; fi
}
trap cleanup EXIT

# ---- signing and checking a signature --------------------------------------------------------

# One token per file: az is asked again for the second signature rather than the token being kept
# exported while wixl and msiinfo run in between.
azure_sign() {
  f=$1
  if ! BEETHOVEN_SIGNING_TOKEN=$(az account get-access-token --resource "$AZ_RESOURCE" --query accessToken --output tsv); then
    unset BEETHOVEN_SIGNING_TOKEN
    die 5 "az could not get a token for Artifact Signing (sign in again with az login); nothing was written to $OUT."
  fi
  export BEETHOVEN_SIGNING_TOKEN
  if [ -z "$BEETHOVEN_SIGNING_TOKEN" ]; then
    unset BEETHOVEN_SIGNING_TOKEN
    die 5 "az answered with an empty token; nothing was written to $OUT."
  fi
  if "${JSIGN_CMD[@]}" --storetype TRUSTEDSIGNING --keystore "$ENDPOINT" --alias "$ACCOUNT/$PROFILE" \
       --storepass env:BEETHOVEN_SIGNING_TOKEN --alg SHA-256 --tsaurl "$TSA_URL" --tsmode RFC3161 "$f"; then
    unset BEETHOVEN_SIGNING_TOKEN
  else
    unset BEETHOVEN_SIGNING_TOKEN
    die 5 "jsign did not sign $(basename "$f"): Artifact Signing refused it or could not be reached (jsign's message is above); nothing was written to $OUT."
  fi
}

# osslsigncode reads the signature back. What must hold: a signature is there, the digest it carries
# is the file's own (osslsigncode recomputes it), and it carries a timestamp. Whether osslsigncode
# can also follow the certificate chain to Microsoft's root depends on the certificate list it was
# built with, which on a Mac is not yet measured, so that verdict is printed and does not decide.
check_signature() {
  f=$1
  what=$2
  chain=0
  out=$(osslsigncode verify -in "$f" 2>&1) && chain=1
  if printf '%s\n' "$out" | grep -q 'No signature found'; then
    printf '%s\n' "$out" >&2
    die 4 "$(basename "$f") carries no signature after jsign signed it; nothing was written to $OUT."
  fi
  cur=$(printf '%s\n' "$out" | sed -n -E "s/^Current $what *: *([0-9A-Fa-f]+).*/\\1/p" | sed -n 1p)
  calc=$(printf '%s\n' "$out" | sed -n -E "s/^Calculated $what *: *([0-9A-Fa-f]+).*/\\1/p" | sed -n 1p)
  if [ -z "$cur" ] || [ "$cur" != "$calc" ] || printf '%s\n' "$out" | grep -q 'MISMATCH'; then
    printf '%s\n' "$out" >&2
    die 4 "the signature on $(basename "$f") does not match the file (osslsigncode's report is above); nothing was written to $OUT."
  fi
  if ! printf '%s\n' "$out" | grep -Eq '^[[:space:]]*Timestamp time:'; then
    printf '%s\n' "$out" >&2
    die 4 "the signature on $(basename "$f") carries no timestamp, so it would stop being valid when the short-lived certificate expires; nothing was written to $OUT."
  fi
  # what is shown, not what decides: a report without these lines must not stop the script here
  printf '%s\n' "$out" | grep -E '^[[:space:]]*(Subject|Issuer ?):' | sed -n 1,2p | sed -e 's/^[[:space:]]*/   signer /' || true
  printf '%s\n' "$out" | grep -E '^[[:space:]]*Timestamp time:' | sed -n 1p | sed -e 's/^[[:space:]]*/   /' || true
  say "   the signature's digest is the file's own: $cur"
  if [ "$chain" = 1 ]; then
    say "   osslsigncode also followed the certificate chain to a root this computer trusts."
  else
    say "   osslsigncode could not follow the certificate chain with this computer's certificate list; Windows checks it against its own."
  fi
}

# ---- the exe ---------------------------------------------------------------------------------

EXE="$WORK/$EXE_NAME"
if [ -n "$TEST_EXE" ]; then
  step "Using $TEST_EXE instead of building one (BEETHOVEN_MSI_TEST_EXE, a test hook: no cargo, no import check)"
  cp "$TEST_EXE" "$EXE"
else
  step "Building the bridge for $TARGET (cargo build --release --locked, linked with $LINKER)"
  (cd "$RUST" && CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER="$LINKER" cargo build --release --locked --target "$TARGET" --target-dir "$WORK/target")
  b="$WORK/target/$TARGET/release/$EXE_NAME"
  [ -f "$b" ] || die 4 "cargo did not produce $b."
  cp "$b" "$EXE"

  step "Checking that the exe imports only Windows' own libraries ($OBJDUMP -p)"
  if ! IMPORTS=$("$OBJDUMP" -p "$EXE" | sed -n 's/^[[:space:]]*DLL Name:[[:space:]]*//p' | tr -d '\r'); then
    die 4 "$OBJDUMP could not read $EXE."
  fi
  [ -n "$IMPORTS" ] || die 4 "$OBJDUMP listed no imported library in $EXE, which no Windows program lacks; the build is not what it should be."
  for dll in $IMPORTS; do
    lower=$(printf '%s' "$dll" | tr '[:upper:]' '[:lower:]')
    case " $ALLOWED_DLLS " in
      *" $lower "*) say "   imports $dll" ;;
      *) die 4 "the exe imports $dll, which is not one of Windows' own libraries, so the bridge would not start on a student's computer; nothing was signed." ;;
    esac
  done
fi
chmod 644 "$EXE"

# ---- the payload -----------------------------------------------------------------------------

step "Staging $EXE_NAME, the host manifest and README.txt"
STAGE="$WORK/stage"
mkdir -p "$STAGE"
cp "$EXE" "$STAGE/$EXE_NAME"
cp "$HERE/README.txt" "$STAGE/README.txt"
ORIGIN="chrome-extension://$STORE_ID/"
# The same text build-msi.ps1 writes, byte for byte: UTF-8 without a byte order mark, LF, and the
# relative path Chrome resolves against the manifest's own folder on Windows.
{
  printf '{\n'
  printf '  "name": "%s",\n' "$HOST_NAME"
  printf '  "description": "%s",\n' "The Beethoven bridge: carries Beethoven's encrypted ssh connection to the grid."
  printf '  "path": "%s",\n' "$EXE_NAME"
  printf '  "type": "stdio",\n'
  printf '  "allowed_origins": ["%s"]\n' "$ORIGIN"
  printf '}\n'
} > "$STAGE/$HOST_NAME.json"
chmod 644 "$STAGE/$EXE_NAME" "$STAGE/README.txt" "$STAGE/$HOST_NAME.json"

if [ "$SIGN" = 1 ]; then
  step "Signing $EXE_NAME through Azure Artifact Signing (jsign, SHA-256, RFC 3161 timestamp)"
  azure_sign "$STAGE/$EXE_NAME"
  step "Checking the exe's signature (osslsigncode verify)"
  check_signature "$STAGE/$EXE_NAME" 'message digest'
else
  step "Not signing $EXE_NAME (--no-sign): this is a trial build"
fi

# ---- the MSI ---------------------------------------------------------------------------------

MSI="$WORK/$MSI_NAME"
step "Building $MSI_NAME from bridge.wxs (wixl -a x64)"
# wixl warns about an attribute it does not know and then leaves it out, and the MSI it writes looks
# right and is not the package Package.wxs describes; so a warning, or anything like one, refuses.
if ! WIXL_OUT=$(wixl -a x64 -D "Version=$VERSION" -D "StageDir=$STAGE" -o "$MSI" "$WXS" 2>&1); then
  printf '%s\n' "$WIXL_OUT" >&2
  die 4 "wixl did not build the MSI (its message is above)."
fi
if [ -n "$WIXL_OUT" ]; then
  printf '%s\n' "$WIXL_OUT"
  if printf '%s\n' "$WIXL_OUT" | grep -Eiq 'warning|critical|error|unhandled|no property'; then
    die 4 "wixl warned while building the MSI (above), so it may have left part of bridge.wxs out; nothing was signed."
  fi
fi
[ -f "$MSI" ] || die 4 "wixl did not produce $MSI."

step "Reading the MSI's tables back (msiinfo)"
# msiinfo export prints three header lines (columns, types, table and key) and then one row per line,
# tab-separated, with CRLF.
table() {
  msiinfo export "$MSI" "$1" | tr -d '\r' | sed 1,3d
}
TAB=$(printf '\t')
if ! REGISTRY=$(table Registry) || ! UPGRADE=$(table Upgrade) || ! PROPERTY=$(table Property) || ! FILES=$(table File) || ! SUMMARY=$(msiinfo suminfo "$MSI"); then
  die 4 "msiinfo could not read the tables of $MSI."
fi
# Every registry value under HKEY_CURRENT_USER (Root 1), nothing under the machine's hive.
[ "$(printf '%s\n' "$REGISTRY" | grep -c .)" = 6 ] || die 4 "the MSI's Registry table does not hold the six values bridge.wxs names."
if printf '%s\n' "$REGISTRY" | cut -f2 | grep -vqx 1; then
  die 4 "the MSI writes a registry value outside HKEY_CURRENT_USER (Root other than 1)."
fi
for browser in 'Google\Chrome' 'Microsoft\Edge'; do
  row="${TAB}1${TAB}Software\\${browser}\\NativeMessagingHosts\\${HOST_NAME}${TAB}${TAB}[BridgeFolder]${HOST_NAME}.json${TAB}HostRegistration"
  printf '%s\n' "$REGISTRY" | grep -Fq -- "$row" \
    || die 4 "the MSI does not set the default value of the $browser NativeMessagingHosts key to the manifest's path."
done
# MajorUpgrade: one row finds an older bridge to replace, one finds a newer one and refuses.
for prop in WIX_UPGRADE_DETECTED WIX_DOWNGRADE_DETECTED; do
  printf '%s\n' "$UPGRADE" | grep -E "^\{$UPGRADE_CODE\}${TAB}" | grep -Eq "${TAB}${prop}\$" \
    || die 4 "the MSI's Upgrade table has no $prop row for the UpgradeCode in bridge.wxs."
done
# Per user: no ALLUSERS (nor the per-user-or-machine switch), and the summary's "no elevation" bit.
if printf '%s\n' "$PROPERTY" | cut -f1 | grep -Eqx 'ALLUSERS|MSIINSTALLPERUSER'; then
  die 4 "the MSI sets ALLUSERS or MSIINSTALLPERUSER, so it is not the per-user package bridge.wxs describes."
fi
printf '%s\n' "$PROPERTY" | grep -Fxq "ProductVersion${TAB}$VERSION" || die 4 "the MSI's ProductVersion is not $VERSION."
printf '%s\n' "$PROPERTY" | grep -Fxq "ARPNOMODIFY${TAB}1" || die 4 "the MSI does not set ARPNOMODIFY."
WORD_COUNT=$(printf '%s\n' "$SUMMARY" | sed -n 's/^Source: \([0-9][0-9]*\).*/\1/p' | sed -n 1p)
[ -n "$WORD_COUNT" ] && [ $((WORD_COUNT & 8)) = 8 ] || die 4 "the MSI's summary does not say it installs without administrator rights."
printf '%s\n' "$SUMMARY" | grep -Fxq 'Template: x64;1033' || die 4 "the MSI is not marked x64 (wixl -a x64)."
# The three files, each the size of the staged one, so the exe in the MSI is the one that was checked.
[ "$(printf '%s\n' "$FILES" | grep -c .)" = 3 ] || die 4 "the MSI's File table does not hold exactly the three payload files."
for name in "$EXE_NAME" "$HOST_NAME.json" README.txt; do
  size=$(wc -c < "$STAGE/$name" | tr -d ' ')
  printf '%s\n' "$FILES" | cut -f3,4 | grep -Fxq "$name${TAB}$size" || die 4 "the MSI does not carry $name as staged ($size bytes)."
done
say "   six HKCU values with both browsers' keys, the upgrade rows, per user, x64, three files"

if [ "$SIGN" = 1 ]; then
  step "Signing $MSI_NAME the same way"
  azure_sign "$MSI"
  step "Checking the MSI's signature (osslsigncode verify)"
  check_signature "$MSI" DigitalSignature
fi

# ---- output ----------------------------------------------------------------------------------

step "Copying the MSI to $OUT"
cp "$MSI" "$OUT/$MSI_NAME"
FINAL="$OUT/$MSI_NAME"

if [ "$SIGN" != 1 ]; then
  say ""
  say "Wrote $FINAL"
  say "This MSI was NOT signed. It is a trial of the build steps and must never ship: no sidecar was written, so helper/build.mjs will not pick it up."
  exit 0
fi

step "Writing the sidecar"
SIZE=$(wc -c < "$FINAL" | tr -d ' ')
SHA=$($SHA_CMD "$FINAL" | cut -d' ' -f1)
printf '%s' "$SHA" | grep -Eq '^[0-9a-f]{64}$' || die 4 "the SHA-256 of $FINAL could not be read."
BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# The tool versions are a record of what built the package, nothing more; an empty answer is left out.
first_line() { "$@" 2>/dev/null | sed -n 1p | tr -d '\000-\037' || true; }
RUSTC_V=$(first_line rustc --version)
MINGW_V=$(first_line "$LINKER" --version)
WIXL_V=$(first_line wixl --version)
JSIGN_V=$(first_line "${JSIGN_CMD[@]}" --version)
OSSL_V=$(first_line osslsigncode --version)
OSSL_V=${OSSL_V%, using:}
MACOS_V=$(first_line sw_vers -productVersion)
SYSTEM_V=$(first_line uname -srm)
SIDECAR="$FINAL.json"

jesc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
{
  printf '{\n'
  printf '  "name": "%s",\n' "$MSI_NAME"
  printf '  "os": "windows",\n'
  printf '  "kind": "binary",\n'
  printf '  "helper": "%s",\n' "$VERSION"
  printf '  "protocol": 1,\n'
  printf '  "size": %s,\n' "$SIZE"
  printf '  "sha256": "%s",\n' "$SHA"
  printf '  "allowed_origins": ["%s"],\n' "$ORIGIN"
  printf '  "signed": "authenticode",\n'
  printf '  "built_at": "%s",\n' "$BUILT_AT"
  printf '  "tools": {'
  sep=
  for pair in "rustc=$RUSTC_V" "mingw=$MINGW_V" "wixl=$WIXL_V" "jsign=$JSIGN_V" "osslsigncode=$OSSL_V" "macos=$MACOS_V" "system=$SYSTEM_V"; do
    k=${pair%%=*}
    v=${pair#*=}
    [ -n "$v" ] || continue
    printf '%s\n    "%s": "%s"' "$sep" "$k" "$(jesc "$v")"
    sep=,
  done
  printf '\n  }\n}\n'
} > "$SIDECAR"

say ""
say "Wrote $FINAL ($SIZE bytes, sha256 $SHA)"
say "Wrote $SIDECAR"
say "Next: node helper/build.mjs --store-id $STORE_ID on the releasing machine copies the MSI into the extension when the sidecar checks out."
exit 0
