#!/bin/bash
# Removes the Beethoven bridge from this Linux account: the native messaging manifests that tell
# Chrome, Chromium and Edge about it, then the bridge's own files, by name, and its folder if
# nothing else is left. Nothing else is touched.   bash uninstall.sh [--yes]
# Test hooks as in install.sh.

set -u
NAME=com.openspineconsortium.beethoven.bridge
DATA=${XDG_DATA_HOME:-"$HOME/.local/share"}
CONF=${XDG_CONFIG_HOME:-"$HOME/.config"}
ROOT=${BEETHOVEN_BRIDGE_ROOT:-"$DATA/beethoven/bridge"}
QUIET=${BEETHOVEN_BRIDGE_YES:-0}
[ "${1:-}" = "--yes" ] && QUIET=1
DIRS=${BEETHOVEN_BRIDGE_MANIFEST_DIRS:-"$CONF/google-chrome/NativeMessagingHosts:$CONF/chromium/NativeMessagingHosts:$CONF/microsoft-edge/NativeMessagingHosts"}

say() { printf '%s\n' "$*"; }

say "This removes the Beethoven bridge from your Linux account: its files in $ROOT and the entries that tell Chrome about it."
if [ "$QUIET" != 1 ]; then
  printf 'Press Return to remove it, or Ctrl-C to cancel. '
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

for f in bridge bridge.pl bridge.py allow.txt README.txt uninstall.sh; do
  rm -f "$ROOT/$f"
done
rmdir "$ROOT" 2>/dev/null
[ -z "${BEETHOVEN_BRIDGE_ROOT:-}" ] && rmdir "$DATA/beethoven" 2>/dev/null

say "The Beethoven bridge is removed from this computer."
exit 0
