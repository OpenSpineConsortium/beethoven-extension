#!/bin/bash
# Installs the Beethoven bridge for this Linux account. No root: everything goes under the home
# directory (~/.local/share/beethoven/bridge and ~/.config/<browser>/NativeMessagingHosts).
#
# In order: check that the folder it runs from is complete and was built with Beethoven's extension
# identifier; pick the interpreter (perl with its core modules, or else python3); say in one
# sentence what will happen and wait for Return; copy both hosts, the uninstaller and the README;
# write a two-line launcher that runs the chosen host; write the native messaging manifest for
# Chrome (and for Chromium and Edge when their settings folders exist); start the installed bridge
# once and check that it answers; say in one sentence how that went.
#
#   bash install.sh [--yes]
#
# Test hooks, used only by helper/test: BEETHOVEN_BRIDGE_ROOT, BEETHOVEN_BRIDGE_MANIFEST_DIRS
# (colon-separated), BEETHOVEN_BRIDGE_YES=1 (same as --yes), BEETHOVEN_BRIDGE_PREFER=python.
# Chrome or Chromium installed as a Snap or Flatpak cannot start programs outside its sandbox, so
# the bridge does not work there; the guide says to use GlobalProtect instead.

set -u
NAME=com.openspineconsortium.beethoven.bridge
VERSION=1.0.0
HERE=$(cd "$(dirname "$0")" && pwd -P)
DATA=${XDG_DATA_HOME:-"$HOME/.local/share"}
CONF=${XDG_CONFIG_HOME:-"$HOME/.config"}
ROOT=${BEETHOVEN_BRIDGE_ROOT:-"$DATA/beethoven/bridge"}
QUIET=${BEETHOVEN_BRIDGE_YES:-0}
[ "${1:-}" = "--yes" ] && QUIET=1

say() { printf '%s\n' "$*"; }
json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
shell_quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

for f in bridge.pl bridge.py uninstall.sh allowed_origins.json; do
  if [ ! -f "$HERE/$f" ]; then
    say "Some of the bridge's files are missing from this folder. Unpack the whole zip file (unzip beethoven-bridge-linux.zip -d beethoven-bridge), then run bash install.sh inside it."
    exit 2
  fi
done

ORIGINS=$(tr -d '\r\n' < "$HERE/allowed_origins.json")
if ! printf '%s' "$ORIGINS" | grep -Eq '^\[ *"chrome-extension://[a-p]{32}/"( *, *"chrome-extension://[a-p]{32}/")* *\]$'; then
  say "This copy of the bridge was built without Beethoven's extension identifier, so Chrome would not let Beethoven use it. Ask your lab lead for the bridge from a released Beethoven."
  exit 3
fi

RUNTIME=
PERL=$(command -v perl 2>/dev/null || true)
PY=$(command -v python3 2>/dev/null || true)
if [ "${BEETHOVEN_BRIDGE_PREFER:-}" != python ] && [ -n "$PERL" ] && "$PERL" -MIO::Socket::INET -MIO::Select -MMIME::Base64 -MFindBin -e 1 >/dev/null 2>&1; then
  RUNTIME=perl
elif [ -n "$PY" ] && "$PY" -c 'import sys, selectors, socket, json, base64, struct; sys.exit(0 if sys.version_info >= (3, 6) else 1)' >/dev/null 2>&1; then
  RUNTIME=python
else
  say "This computer has neither perl nor python 3.6 or later, and the bridge needs one of them. Install perl with your package manager, or use GlobalProtect in Beethoven instead."
  exit 4
fi

if [ -n "${BEETHOVEN_BRIDGE_MANIFEST_DIRS:-}" ]; then
  DIRS=$BEETHOVEN_BRIDGE_MANIFEST_DIRS
else
  DIRS="$CONF/google-chrome/NativeMessagingHosts"
  [ -d "$CONF/chromium" ] && DIRS="$DIRS:$CONF/chromium/NativeMessagingHosts"
  [ -d "$CONF/microsoft-edge" ] && DIRS="$DIRS:$CONF/microsoft-edge/NativeMessagingHosts"
fi

say "Beethoven bridge $VERSION"
say ""
say "This installs the Beethoven bridge for your Linux account only, with no root: it copies its small script files into $ROOT, runs them with $RUNTIME, and tells Chrome where to find them."
if [ "$QUIET" != 1 ]; then
  say ""
  printf 'Press Return to install, or Ctrl-C to cancel. '
  read -r _ || exit 1
fi

fail() { say "The bridge could not be installed: $1"; exit 5; }

mkdir -p "$ROOT" || fail "the folder $ROOT could not be made"
for f in bridge.pl bridge.py uninstall.sh README.txt; do
  [ -f "$HERE/$f" ] && { cp "$HERE/$f" "$ROOT/$f" || fail "$f could not be copied"; }
done
# allow.txt is the only way to add a host beside the grid; the installed copy always matches the
# folder it was installed from.
if [ -f "$HERE/allow.txt" ]; then cp "$HERE/allow.txt" "$ROOT/allow.txt"; else rm -f "$ROOT/allow.txt"; fi
chmod 755 "$ROOT/bridge.pl" "$ROOT/bridge.py" "$ROOT/uninstall.sh"

if [ "$RUNTIME" = perl ]; then INTERP=$PERL; SCRIPT="$ROOT/bridge.pl"; else INTERP=$PY; SCRIPT="$ROOT/bridge.py"; fi
{
  printf '#!/bin/sh\n# Started by Chrome (native messaging): runs the Beethoven bridge with the interpreter the installer found.\n'
  printf 'exec %s %s "$@"\n' "$(shell_quote "$INTERP")" "$(shell_quote "$SCRIPT")"
} > "$ROOT/bridge" || fail "the launcher could not be written"
chmod 755 "$ROOT/bridge"

HOSTPATH=$(json_escape "$ROOT/bridge")
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
TO=
command -v timeout >/dev/null 2>&1 && TO="timeout 30"
RESP=$(printf '\023\000\000\000{"t":"hello","v":1}' | $TO "$ROOT/bridge" chrome-extension://installer-check/ 2>/dev/null | tail -c +5)
say ""
case "$RESP" in
  *'"t":"hello"'*'"helper":"'"$VERSION"'"'*)
    say "The Beethoven bridge $VERSION is installed for Chrome ($RUNTIME). Go back to Beethoven and press Check again."
    exit 0 ;;
esac
say "The bridge is installed, but it did not answer when started. Press Check again in Beethoven; if it still does not connect, use GlobalProtect in Beethoven instead and tell your lab lead."
exit 4
