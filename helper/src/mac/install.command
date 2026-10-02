#!/bin/bash
# Installs the Beethoven bridge for this macOS account. No administrator password: everything goes
# under ~/Library/Application Support, which the student's own account may always write.
#
# In order: check that the folder it runs from is complete, was built with Beethoven's extension
# identifier, and that /usr/bin/perl (part of macOS) can run the bridge; say in one sentence what
# will happen and wait for Return; copy the bridge, the uninstaller and the README into
# ~/Library/Application Support/Beethoven/bridge; remove the com.apple.quarantine mark macOS puts on
# downloaded files from those copies, so Chrome can start the bridge; write the native messaging
# manifest for Chrome (and for Edge and Chromium when they are installed); start the installed
# bridge once and check that it answers; say in one sentence how that went.
#
# Written for the bash 3.2 that macOS ships: no associative arrays, no ${x,,}, no mapfile.
# Test hooks, used only by helper/test (a student never sets them): BEETHOVEN_BRIDGE_ROOT,
# BEETHOVEN_BRIDGE_MANIFEST_DIRS (colon-separated), BEETHOVEN_BRIDGE_YES=1.

set -u
NAME=com.openspineconsortium.beethoven.bridge
VERSION=1.0.0
HERE=$(cd "$(dirname "$0")" && pwd -P)
AS="$HOME/Library/Application Support"
ROOT=${BEETHOVEN_BRIDGE_ROOT:-"$AS/Beethoven/bridge"}
QUIET=${BEETHOVEN_BRIDGE_YES:-0}
PERL=/usr/bin/perl

say() { printf '%s\n' "$*"; }
json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

for f in bridge.pl uninstall.command allowed_origins.json; do
  if [ ! -f "$HERE/$f" ]; then
    say "Some of the bridge's files are missing from this folder. Double-click the zip file to unpack it, then open install.command in the folder that appears."
    exit 2
  fi
done

ORIGINS=$(tr -d '\r\n' < "$HERE/allowed_origins.json")
if ! printf '%s' "$ORIGINS" | grep -Eq '^\[ *"chrome-extension://[a-p]{32}/"( *, *"chrome-extension://[a-p]{32}/")* *\]$'; then
  say "This copy of the bridge was built without Beethoven's extension identifier, so Chrome would not let Beethoven use it. Ask your lab lead for the bridge from a released Beethoven."
  exit 3
fi

if ! "$PERL" -MIO::Socket::INET -MIO::Select -MMIME::Base64 -MFindBin -e 1 >/dev/null 2>&1; then
  say "This Mac has no working /usr/bin/perl, which the bridge needs (Apple has said later versions of macOS may leave it out). Use GlobalProtect in Beethoven instead."
  exit 4
fi

if [ -n "${BEETHOVEN_BRIDGE_MANIFEST_DIRS:-}" ]; then
  DIRS=$BEETHOVEN_BRIDGE_MANIFEST_DIRS
else
  DIRS="$AS/Google/Chrome/NativeMessagingHosts"
  [ -d "$AS/Microsoft Edge" ] && DIRS="$DIRS:$AS/Microsoft Edge/NativeMessagingHosts"
  [ -d "$AS/Chromium" ] && DIRS="$DIRS:$AS/Chromium/NativeMessagingHosts"
fi

say "Beethoven bridge $VERSION"
say ""
say "This installs the Beethoven bridge for your macOS account only, with no administrator password: it copies one small Perl script and its uninstaller into $ROOT, removes the mark macOS puts on downloaded files (com.apple.quarantine) from those copies so Chrome can start the bridge, and tells Chrome where to find it."
if [ "$QUIET" != 1 ]; then
  say ""
  printf 'Press Return to install, or close this window to cancel. '
  read -r _ || exit 1
fi

fail() { say "The bridge could not be installed: $1"; exit 5; }

mkdir -p "$ROOT" || fail "the folder $ROOT could not be made"
cp "$HERE/bridge.pl" "$ROOT/bridge.pl" || fail "bridge.pl could not be copied"
cp "$HERE/uninstall.command" "$ROOT/uninstall.command" || fail "uninstall.command could not be copied"
[ -f "$HERE/README.txt" ] && cp "$HERE/README.txt" "$ROOT/README.txt"
# allow.txt is the only way to add a host beside the grid; the installed copy always matches the
# folder it was installed from.
if [ -f "$HERE/allow.txt" ]; then cp "$HERE/allow.txt" "$ROOT/allow.txt"; else rm -f "$ROOT/allow.txt"; fi
chmod 755 "$ROOT/bridge.pl" "$ROOT/uninstall.command"
if command -v xattr >/dev/null 2>&1; then
  for f in bridge.pl uninstall.command README.txt allow.txt; do
    [ -f "$ROOT/$f" ] && xattr -d com.apple.quarantine "$ROOT/$f" >/dev/null 2>&1
  done
fi

HOSTPATH=$(json_escape "$ROOT/bridge.pl")
OLDIFS=$IFS
IFS=:
set -f
for d in $DIRS; do
  [ -n "$d" ] || continue
  mkdir -p "$d" || fail "the folder $d could not be made"
  printf '{\n  "name": "%s",\n  "description": "%s",\n  "path": "%s",\n  "type": "stdio",\n  "allowed_origins": %s\n}\n' \
    "$NAME" "The Beethoven bridge: carries Beethoven's encrypted ssh connection to the grid." \
    "$HOSTPATH" "$ORIGINS" > "$d/$NAME.json" || fail "the manifest in $d could not be written"
done
set +f
IFS=$OLDIFS

# Started the way Chrome starts it, with one hello message (19 bytes) on stdin.
RESP=$(printf '\023\000\000\000{"t":"hello","v":1}' | "$ROOT/bridge.pl" chrome-extension://installer-check/ 2>/dev/null | tail -c +5)
say ""
case "$RESP" in
  *'"t":"hello"'*'"helper":"'"$VERSION"'"'*)
    say "The Beethoven bridge $VERSION is installed for Chrome. Go back to Beethoven and press Check again."
    exit 0 ;;
esac
say "The bridge is installed, but it did not answer when started. Press Check again in Beethoven; if it still does not connect, use GlobalProtect in Beethoven instead and tell your lab lead."
exit 4
