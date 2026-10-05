#!/bin/bash
# Removes the Beethoven bridge that beethoven-bridge-mac.pkg installed for this macOS account: the
# files that tell Chrome, Edge and Chromium about it, then the bridge's own files in
# ~/Library/Application Support/Beethoven/bridge, by name, the two folders if nothing else is left,
# and last the Installer's own record of the package. Nothing else is touched. Bash 3.2.
# Test hook, never set by a student: BEETHOVEN_BRIDGE_YES=1 skips the prompt.

set -u
NAME=com.openspineconsortium.beethoven.bridge
AS="$HOME/Library/Application Support"
ROOT="$AS/Beethoven/bridge"
QUIET=${BEETHOVEN_BRIDGE_YES:-0}

say() { printf '%s\n' "$*"; }

say "This removes the Beethoven bridge from your macOS account: its files in $ROOT and the entries that tell Chrome about it."
if [ "$QUIET" != 1 ]; then
  printf 'Press Return to remove it, or close this window to cancel. '
  read -r _ || exit 1
fi

for d in "$AS/Google/Chrome/NativeMessagingHosts" "$AS/Microsoft Edge/NativeMessagingHosts" "$AS/Chromium/NativeMessagingHosts"; do
  rm -f "$d/$NAME.json"
done

# This script is the last to go: bash keeps reading the open file after its name is gone.
for f in beethoven-bridge allowed_origins.json allow.txt README.txt uninstall.command; do
  rm -f "$ROOT/$f"
done
rmdir "$ROOT" 2>/dev/null
rmdir "$AS/Beethoven" 2>/dev/null
pkgutil --forget "$NAME" --volume "$HOME" 2>/dev/null || true

say "The Beethoven bridge is removed from this Mac."
exit 0
