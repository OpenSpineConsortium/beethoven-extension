#!/bin/bash
# The collaborator's way to run the extension from this private repository: one command that
# pulls the newest green build straight from CI over the person's own GitHub sign-in. No Node,
# no checkout, no token typed anywhere (gh keeps its own sign-in; a GITHUB_TOKEN another tool
# exported is set aside). This is the DEVELOPER path for people with repository access;
# students get Beethoven only through the private Chrome Web Store listing, the one offering
# channel (CLAUDE.md, LICENSE.txt) — and only the store gives a true one-click install, which
# Chrome allows from nowhere else.
#
#   bash extension/scripts/dev-install.sh            # or run it straight from a downloaded copy
#
# First time: open chrome://extensions, turn on "Developer mode", "Load unpacked", pick the
# folder this prints. Every later run: re-run this, then press the reload arrow on the
# Beethoven card (the folder is updated in place, same path).
set -uo pipefail
REPO=${1:-OpenSpineConsortium/beethoven-extension}
DEST="${BEETHOVEN_DEV_DIR:-$HOME/.beethoven-dev}/chrome-mv3"
GH() { env -u GITHUB_TOKEN -u GH_TOKEN gh "$@"; }
command -v gh >/dev/null 2>&1 || { echo "gh is not installed (https://cli.github.com), then: gh auth login" >&2; exit 1; }
RUN=$(GH run list -R "$REPO" -b main -s success -L 1 --json databaseId --jq '.[0].databaseId') || { echo "could not list CI runs of $REPO (is gh signed in, and the repository shared with you?)" >&2; exit 1; }
[ -n "$RUN" ] && [ "$RUN" != null ] || { echo "no green CI run on main yet" >&2; exit 1; }
T=$(mktemp -d) && trap 'rm -rf "$T"' EXIT
GH run download "$RUN" -R "$REPO" -n chrome-mv3 -D "$T" || { echo "could not download the build from run $RUN" >&2; exit 1; }
[ -s "$T/manifest.json" ] || { echo "run $RUN's artifact carries no manifest.json" >&2; exit 1; }
mkdir -p "$(dirname "$DEST")" && rm -rf "$DEST" && mv "$T" "$DEST" && trap - EXIT
V=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$DEST/manifest.json" | head -1)
echo "Beethoven $V (CI run $RUN) is in: $DEST"
echo "First time: chrome://extensions -> Developer mode on -> Load unpacked -> that folder."
echo "Already loaded: press the reload arrow on the Beethoven card."
