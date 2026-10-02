#!/bin/bash
# Removes the Beethoven bridge from this macOS account: the native messaging manifests that tell
# Chrome, Edge and Chromium about it, then the bridge's own files in
# ~/Library/Application Support/Beethoven/bridge, by name, and the folder if nothing else is left.
# Nothing else is touched. Bash 3.2. Test hooks as in install.command.

set -u
NAME=com.openspineconsortium.beethoven.bridge
AS="$HOME/Library/Application Support"
ROOT=${BEETHOVEN_BRIDGE_ROOT:-"$AS/Beethoven/bridge"}
QUIET=${BEETHOVEN_BRIDGE_YES:-0}
DIRS=${BEETHOVEN_BRIDGE_MANIFEST_DIRS:-"$AS/Google/Chrome/NativeMessagingHosts:$AS/Microsoft Edge/NativeMessagingHosts:$AS/Chromium/NativeMessagingHosts"}

say() { printf '%s\n' "$*"; }

say "This removes the Beethoven bridge from your macOS account: its files in $ROOT and the entries that tell Chrome about it."
if [ "$QUIET" != 1 ]; then
  printf 'Press Return to remove it, or close this window to cancel. '
  read -r _ || exit 1
fi

OLDIFS=$IFS
IFS=:
set -f
for d in $DIRS; do
  [ -n "$d" ] && rm -f "$d/$NAME.json"
done
set +f
IFS=$OLDIFS

for f in bridge.pl allow.txt README.txt uninstall.command; do
  rm -f "$ROOT/$f"
done
rmdir "$ROOT" 2>/dev/null
[ -z "${BEETHOVEN_BRIDGE_ROOT:-}" ] && rmdir "$AS/Beethoven" 2>/dev/null

say "The Beethoven bridge is removed from this Mac."
exit 0
