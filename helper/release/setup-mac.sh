#!/bin/bash
# The maintainer's Mac, made ready for a Beethoven release once and checked before every one:
# helper/release/release.sh runs this script's check first and stops with its list when anything is
# missing.
#
#   bash helper/release/setup-mac.sh                 the check: one line per prerequisite, then each missing
#                                                    one with its exact fix, then the steps only you can do
#   bash helper/release/setup-mac.sh --install       the Homebrew installs and the rustup target adds the check
#                                                    asks for, and nothing else (brew uninstall and rustup
#                                                    target remove undo them), then the check
#   bash helper/release/setup-mac.sh --write-config  asks at the terminal for each name release.json holds,
#                                                    and writes it
#
# The check, in order: the Xcode command line tools; Homebrew; the formulae that build and sign the
# Windows installer on a Mac (mingw-w64, msitools, osslsigncode, azure-cli, jsign) and node 22 or later;
# rustup with the two Apple targets and the Windows one; the two Developer ID identities in the keychain;
# the notarytool keychain profile (one call to Apple's notary service); the Azure sign-in (az account
# show); <vendor>/release.json; the Chrome Web Store sign-in (<vendor>/chrome-web-store/token.json is
# there; it is never opened here). The vendor folder is BEETHOVEN_VENDOR_DIR, else ASHLEY_VENDOR_DIR,
# else ~/.beethoven-vendor.
#
# Nothing here reads a password, a key or a token: the identities are certificate names, the notary
# profile is the name of a keychain entry, az is asked only whether it is signed in, and the store
# sign-in is checked by its file's presence alone. --write-config reads names at the terminal, never
# from arguments or a pipe, and writes them mode 0600 in a 0700 folder.
#
# Written for the bash 3.2 that macOS ships: no associative arrays, no mapfile, no ${x,,}, no |&. The
# check calls nothing outside the shell until it has found the tool it asks, so it still answers on a
# Mac whose PATH holds nothing (extension/test/releaseOneCommand.test.ts runs it that way).
# Exit status: 0 nothing is missing; 2 bad arguments, or --write-config without a terminal; 3 something
# is missing.

# not -e: a check that fails is an answer, not an error
set -uo pipefail

case "$0" in
  */*) HERE=${0%/*} ;;
  *) HERE=. ;;
esac
HERE=$(cd "$HERE" && pwd -P)
CONFIG_JS="$HERE/release-config.mjs"
VENDOR=${BEETHOVEN_VENDOR_DIR:-${ASHLEY_VENDOR_DIR:-${HOME:-}/.beethoven-vendor}}
CONFIG="$VENDOR/release.json"
TOKEN_FILE="$VENDOR/chrome-web-store/token.json"
TARGETS="aarch64-apple-darwin x86_64-apple-darwin x86_64-pc-windows-gnu"
NL='
'

say() { printf '%s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

usage() {
  cat <<'EOF'
Usage: bash helper/release/setup-mac.sh [--install | --write-config]

  (nothing)        check this Mac for everything a release needs, and say how to fix what is missing
  --install        install the missing Homebrew formulae and Rust targets, then check
  --write-config   ask for each name release.json holds, at the terminal, and write it in your vendor folder
EOF
}

MODE=check
while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE=check ;;
    --install) MODE=install ;;
    --write-config) MODE=write ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; printf '%s\n' "Unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

# ---- release.json's names, when it has them ----------------------------------------------------

STORE_ID= PUBLISHER_ID= APP_NAME= INST_NAME= PROFILE_NAME=
CONFIG_STATE=absent
CONFIG_WHY=
read_config() {
  if [ ! -f "$CONFIG" ]; then CONFIG_STATE=absent; return; fi
  if ! have node; then CONFIG_STATE=unread; return; fi
  if names=$(node "$CONFIG_JS" "$CONFIG" 2>/dev/null); then
    CONFIG_STATE=ok
    {
      IFS= read -r STORE_ID; IFS= read -r PUBLISHER_ID; IFS= read -r APP_NAME; IFS= read -r INST_NAME; IFS= read -r PROFILE_NAME
    } <<EOF
$names
EOF
  else
    CONFIG_STATE=bad
    CONFIG_WHY=$(node "$CONFIG_JS" "$CONFIG" 2>&1 >/dev/null)
  fi
}

# ---- the check -----------------------------------------------------------------------------------

MISSING=0
FIXES=
ok() { printf '  ok       %s\n' "$1"; }
missing() {
  MISSING=$((MISSING + 1))
  printf '  missing  %s\n' "$1"
  FIXES="$FIXES  $MISSING. $1: $2$NL"
}

node_major() {
  v=
  if have node; then v=$(node -p 'process.versions.node' 2>/dev/null); fi
  m=${v%%.*}
  case "$m" in ''|*[!0-9]*) m=0 ;; esac
  printf '%s' "$m"
}
# Homebrew's prefix is /opt/homebrew on Apple silicon and /usr/local on an Intel Mac
node_bin() {
  if have brew; then
    printf '%s/opt/node@22/bin' "$(brew --prefix 2>/dev/null)"
  else
    printf '/opt/homebrew/opt/node@22/bin'
  fi
}
jsign_jar() {
  for j in "$VENDOR/jsign.jar" "$VENDOR"/jsign/*.jar; do
    if [ -f "$j" ]; then printf '%s' "$j"; return 0; fi
  done
  return 1
}
# security find-identity prints each identity's name in double quotes
listed() { case "$1" in *"\"$2"*) return 0 ;; esac; return 1; }

check() {
  read_config
  say "Checking this Mac for a Beethoven release (vendor folder: $VENDOR)"

  xcode=0
  if have xcode-select && xcode-select -p >/dev/null 2>&1; then
    xcode=1
    for t in xcrun codesign pkgbuild productbuild lipo spctl pkgutil git; do have "$t" || xcode=0; done
  fi
  if [ $xcode = 1 ]; then ok "Xcode command line tools"; else missing "Xcode command line tools" "xcode-select --install (a window asks; it takes a few minutes)"; fi

  if have brew; then
    ok "Homebrew"
    after=
  else
    missing "Homebrew" "install it from https://brew.sh (one line in Terminal), then open a new Terminal window"
    after=" (once Homebrew is there)"
  fi

  formula() {
    f=$1; shift
    all=1
    for c in "$@"; do have "$c" || all=0; done
    if [ $all = 1 ]; then ok "$f ($*)"; else missing "$f ($*)" "brew install $f$after"; fi
  }
  formula mingw-w64 x86_64-w64-mingw32-gcc
  formula msitools wixl msiinfo
  formula osslsigncode osslsigncode
  formula azure-cli az

  m=$(node_major)
  if [ "$m" -ge 22 ] && have npm && have npx; then
    ok "node 22 or later (node $(node -p 'process.versions.node' 2>/dev/null), npm, npx)"
  else
    intel=
    have brew || intel=" (/usr/local in place of /opt/homebrew on an Intel Mac)"
    missing "node 22 or later (node, npm, npx)" "brew install node@22$after, then put it first on PATH: echo 'export PATH=\"$(node_bin):\$PATH\"' >> ~/.zprofile$intel, and open a new Terminal window"
  fi

  if have jsign; then
    ok "jsign (the jsign command)"
  elif jar=$(jsign_jar) && have java && java -version >/dev/null 2>&1; then
    ok "jsign (the jar $jar, run with java)"
  else
    missing "jsign" "brew install jsign$after (whether Homebrew carries a jsign formula is not yet measured); if it has none: brew install openjdk, put openjdk's bin folder on PATH as brew says, and save jsign's jar (net.jsign:jsign 7.5, on Maven Central) as $VENDOR/jsign.jar"
  fi

  if have rustup && have cargo; then
    ok "rustup and cargo"
    installed=$(rustup target list --installed 2>/dev/null)
    for t in $TARGETS; do
      case "$NL$installed$NL" in
        *"$NL$t$NL"*) ok "Rust target $t" ;;
        *) missing "Rust target $t" "rustup target add $t" ;;
      esac
    done
  else
    missing "rustup and cargo" "install Rust with rustup from https://rustup.rs, then open a new Terminal window"
    for t in $TARGETS; do missing "Rust target $t" "rustup target add $t (once rustup is there)"; done
  fi

  cs=
  all=
  if have security; then
    cs=$(security find-identity -v -p codesigning 2>/dev/null)
    all=$(security find-identity -v 2>/dev/null)
  fi
  if [ -n "$APP_NAME" ]; then
    if listed "$cs" "$APP_NAME\""; then ok "Developer ID Application identity ($APP_NAME)"
    else missing "Developer ID Application identity ($APP_NAME)" "release.json names it, but security find-identity -v -p codesigning does not list it: add that certificate to the login keychain (step 2 below), or correct the name with --write-config"; fi
  elif listed "$cs" "Developer ID Application: "; then ok "a Developer ID Application identity"
  else missing "Developer ID Application identity" "make the certificate and add it to the login keychain (step 2 below)"; fi
  if [ -n "$INST_NAME" ]; then
    if listed "$all" "$INST_NAME\""; then ok "Developer ID Installer identity ($INST_NAME)"
    else missing "Developer ID Installer identity ($INST_NAME)" "release.json names it, but security find-identity -v does not list it: add that certificate to the login keychain (step 2 below), or correct the name with --write-config"; fi
  elif listed "$all" "Developer ID Installer: "; then ok "a Developer ID Installer identity"
  else missing "Developer ID Installer identity" "make the certificate and add it to the login keychain (step 2 below)"; fi

  if [ -z "$PROFILE_NAME" ]; then
    missing "notarytool keychain profile" "it is checked once release.json names it (--write-config); make it with step 3 below"
  elif ! have xcrun; then
    missing "notarytool keychain profile \"$PROFILE_NAME\"" "the Xcode command line tools come first"
  else
    say "  (asking Apple's notary service once, with the keychain profile \"$PROFILE_NAME\")"
    if xcrun notarytool history --keychain-profile "$PROFILE_NAME" >/dev/null 2>&1; then
      ok "notarytool keychain profile \"$PROFILE_NAME\""
    else
      missing "notarytool keychain profile \"$PROFILE_NAME\"" "xcrun notarytool store-credentials \"$PROFILE_NAME\" (step 3 below); this check is one call to Apple's notary service, so it also fails without a network"
    fi
  fi

  if have az && az account show >/dev/null 2>&1; then
    ok "signed in to Azure (az account show)"
  else
    if have az; then azfix="az login (a browser opens; step 5 below)"; else azfix="az login once azure-cli is there (a browser opens; step 5 below)"; fi
    missing "signed in to Azure" "$azfix"
  fi

  case "$CONFIG_STATE" in
    ok) ok "release.json ($CONFIG)" ;;
    absent) missing "release.json ($CONFIG)" "bash helper/release/setup-mac.sh --write-config asks for each name and writes it" ;;
    unread) missing "release.json ($CONFIG)" "it is checked with node, which comes first" ;;
    *) missing "release.json ($CONFIG)" "$CONFIG_WHY Run bash helper/release/setup-mac.sh --write-config" ;;
  esac

  if [ -f "$TOKEN_FILE" ]; then
    ok "the Chrome Web Store sign-in (saved in $VENDOR/chrome-web-store/)"
  else
    missing "the Chrome Web Store sign-in" "node helper/release/publish-store.mjs sign-in --client <the Desktop OAuth client's JSON file> (step 8 below)"
  fi

  if [ "$MISSING" = 0 ]; then
    say ""
    say "Everything a release needs is on this Mac."
    return 0
  fi
  say ""
  say "Missing: $MISSING. The fixes, in this order:"
  printf '%s' "$FIXES"
  say "bash helper/release/setup-mac.sh --install runs the brew install and rustup target add lines above for you."
  say ""
  hand_steps
  return 3
}

# read line by line rather than through cat, so the list prints on a Mac whose PATH holds nothing
hand_steps() {
  while IFS= read -r l; do printf '%s\n' "$l"; done <<EOF
What only you can do, once, and where:
  1. Join the Apple Developer Program as yourself (or, later, the LLC): developer.apple.com/programs.
  2. Make the two certificates, Developer ID Application and Developer ID Installer (only the account
     holder can): developer.apple.com/account, Certificates, Identifiers & Profiles, Certificates, +.
     Download each and double-click it, so that it lands in the login keychain. Then
     security find-identity -v lists both.
  3. The notarization profile: in Terminal, xcrun notarytool store-credentials <a name you choose>.
     It asks for your Apple ID, your team ID and an app-specific password (account.apple.com,
     Sign-In and Security, App-Specific Passwords); they stay in the keychain under that name.
  4. Azure Artifact Signing (Trusted Signing until its rename), in the Azure portal (portal.azure.com):
     an Artifact Signing account, its identity validation, a certificate profile (public trust) under
     it, and the Certificate Profile Signer role on the account for your own sign-in. The endpoint is
     the account's URI on its Overview page.
  5. Sign in to Azure on this Mac: az login (a browser opens).
  6. The Chrome Web Store item id and publisher id, from the developer dashboard
     (chrome.google.com/webstore/devconsole). Where the dashboard shows the publisher id is not yet
     measured from here; publish-store.mjs's own help says what it expects.
  7. Write the names: bash helper/release/setup-mac.sh --write-config.
  8. The store upload's Google sign-in: in the Google Cloud console (console.cloud.google.com), a
     project with the Chrome Web Store API on and an OAuth client of type Desktop app; download its
     JSON, then node helper/release/publish-store.mjs sign-in --client <that file>. The sign-in is kept
     in $VENDOR/chrome-web-store/.
EOF
}

# ---- --install -----------------------------------------------------------------------------------

do_install() {
  if ! have brew; then
    say "Homebrew is not on this Mac: install it from https://brew.sh first (not done here), then run this again."
    return 3
  fi
  list=
  have x86_64-w64-mingw32-gcc || list="$list mingw-w64"
  { have wixl && have msiinfo; } || list="$list msitools"
  have osslsigncode || list="$list osslsigncode"
  have az || list="$list azure-cli"
  if [ "$(node_major)" -lt 22 ]; then list="$list node@22"; fi
  if [ -n "$list" ]; then
    say "\$ brew install$list"
    brew install $list || return 3
  fi
  if ! have jsign && ! { jsign_jar >/dev/null && have java && java -version >/dev/null 2>&1; }; then
    say "\$ brew install jsign"
    if ! brew install jsign; then
      say "Homebrew did not install jsign, so openjdk instead, to run jsign's jar; the jar itself is yours to save as $VENDOR/jsign.jar."
      say "\$ brew install openjdk"
      brew install openjdk || return 3
    fi
  fi
  if have rustup; then
    installed=$(rustup target list --installed 2>/dev/null)
    add=
    for t in $TARGETS; do
      case "$NL$installed$NL" in *"$NL$t$NL"*) ;; *) add="$add $t" ;; esac
    done
    if [ -n "$add" ]; then
      say "\$ rustup target add$add"
      rustup target add $add || return 3
    fi
  else
    say "rustup is not on this Mac: install Rust from https://rustup.rs (not done here), then run this again for its targets."
  fi
  say ""
  check
}

# ---- --write-config ------------------------------------------------------------------------------

ANSWER=
# ask FIELD HELP DEFAULT: one name, asked until release-config.mjs accepts it
ask() {
  say ""
  say "$1: $2"
  while :; do
    if [ -n "$3" ]; then printf '  [%s] > ' "$3"; else printf '  > '; fi
    if ! IFS= read -r ANSWER; then say ""; return 1; fi
    # a pasted name often carries a space at either end
    ANSWER=${ANSWER#"${ANSWER%%[![:space:]]*}"}
    ANSWER=${ANSWER%"${ANSWER##*[![:space:]]}"}
    [ -n "$ANSWER" ] || ANSWER=$3
    if err=$(RC_VALUE=$ANSWER node "$CONFIG_JS" --field "$1" 2>&1); then return 0; fi
    say "  $err"
  done
}
# the one identity of a kind in the keychain, offered as the answer when release.json has none yet
only_identity() {
  have security || return 0
  found=
  count=0
  while IFS= read -r l; do
    case "$l" in
      *"\"$1"*) n=${l#*\"}; found=${n%\"*}; count=$((count + 1)) ;;
    esac
  done <<EOF
$(security find-identity -v $2 2>/dev/null)
EOF
  if [ "$count" = 1 ]; then printf '%s' "$found"; fi
}

write_config() {
  if [ ! -t 0 ]; then
    printf '%s\n' "--write-config asks for each name at the terminal and reads nothing from a pipe or a file: run it in Terminal." >&2
    return 2
  fi
  if ! have node; then
    say "--write-config checks each name with node, which is not on PATH; bash helper/release/setup-mac.sh says how to install it."
    return 3
  fi
  if [ ! -d "$VENDOR" ]; then
    mkdir -p "$VENDOR" && chmod 700 "$VENDOR" || return 3
  else
    case "$(ls -ld "$VENDOR")" in
      d???------*) ;;
      *) say "Note: $VENDOR can be read by other accounts on this Mac; chmod 700 \"$VENDOR\" closes it (not done here)." ;;
    esac
  fi
  cur=$(node "$CONFIG_JS" --current "$CONFIG")
  c1= c2= c3= c4= c5= c6= c7= c8=
  {
    IFS= read -r c1; IFS= read -r c2; IFS= read -r c3; IFS= read -r c4; IFS= read -r c5; IFS= read -r c6; IFS= read -r c7; IFS= read -r c8
  } <<EOF
$cur
EOF
  [ -n "$c3" ] || c3=$(only_identity "Developer ID Application: " "-p codesigning")
  [ -n "$c4" ] || c4=$(only_identity "Developer ID Installer: " "")
  say "Each name goes into $CONFIG. Press Return to keep the one in brackets. Names only: never a password, key or token."
  ask store_id "the extension's 32-letter id (letters a to p), on the item's page in the Chrome Web Store developer dashboard" "$c1" || return 2; v1=$ANSWER
  ask publisher_id "the publisher id the Chrome Web Store developer dashboard shows" "$c2" || return 2; v2=$ANSWER
  ask mac.app_identity "the full name of the Developer ID Application certificate, as security find-identity -v -p codesigning shows it" "$c3" || return 2; v3=$ANSWER
  ask mac.installer_identity "the full name of the Developer ID Installer certificate, as security find-identity -v shows it" "$c4" || return 2; v4=$ANSWER
  ask mac.notary_profile "the name you gave xcrun notarytool store-credentials" "$c5" || return 2; v5=$ANSWER
  ask windows.azure_endpoint "the Artifact Signing account's endpoint, its URI on the account's Overview page in the Azure portal" "$c6" || return 2; v6=$ANSWER
  ask windows.azure_account "the Artifact Signing account's name" "$c7" || return 2; v7=$ANSWER
  ask windows.azure_profile "the certificate profile's name under that account" "$c8" || return 2; v8=$ANSWER
  RC_STORE_ID=$v1 RC_PUBLISHER_ID=$v2 RC_APP_IDENTITY=$v3 RC_INSTALLER_IDENTITY=$v4 RC_NOTARY_PROFILE=$v5 \
  RC_AZURE_ENDPOINT=$v6 RC_AZURE_ACCOUNT=$v7 RC_AZURE_PROFILE=$v8 \
    node "$CONFIG_JS" --write "$CONFIG" || return 3
  say ""
  say "Wrote $CONFIG (mode 0600). It holds names only."
}

case "$MODE" in
  check) check; exit $? ;;
  install) do_install; exit $? ;;
  write) write_config; exit $? ;;
esac
