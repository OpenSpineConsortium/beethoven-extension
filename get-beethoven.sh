#!/bin/bash
# Get Beethoven from the private repository and set it up in Chrome, in one sitting: sign in to
# GitHub if needed, clone (or update) the repository, then install the newest green CI build.
# Works in Git Bash on Windows, and in any macOS or Linux shell; needs git and gh
# (https://cli.github.com) and nothing else — no Node, no build. Authorization is simply your
# GitHub account: if the repository was shared with you, this works; no token is typed or stored
# by this script (gh keeps its own sign-in).
#
#   bash get-beethoven.sh [owner/repo]        # default OpenSpineConsortium/beethoven-extension
#
# Chrome's part stays manual once: chrome://extensions -> Developer mode -> Load unpacked ->
# the folder this prints. After that, re-run this script and press the reload arrow on the
# Beethoven card. (A true one-click install exists only on the Chrome Web Store: students use
# the private listing, not this script.)
set -uo pipefail
REPO=${1:-OpenSpineConsortium/beethoven-extension}
DIR="${BEETHOVEN_DIR:-$HOME/beethoven-extension}"
GH() { env -u GITHUB_TOKEN -u GH_TOKEN gh "$@"; }
command -v git >/dev/null 2>&1 || { echo "git is not installed" >&2; exit 1; }
command -v gh  >/dev/null 2>&1 || { echo "gh is not installed: https://cli.github.com" >&2; exit 1; }
GH auth status >/dev/null 2>&1 || GH auth login --hostname github.com --git-protocol https --web || exit 1
if [ ! -d "$DIR/.git" ]; then
  GH repo clone "$REPO" "$DIR" -- -q || { echo "clone failed: is $REPO shared with your account?" >&2; exit 1; }
  # later pulls speak through the same gh sign-in, whatever ~/.gitconfig says
  git -C "$DIR" config credential.helper '' && git -C "$DIR" config --add credential.helper '!env -u GITHUB_TOKEN -u GH_TOKEN gh auth git-credential'
else
  git -C "$DIR" pull -q --ff-only origin main || echo "note: could not update the clone; installing from CI anyway"
fi
bash "$DIR/extension/scripts/dev-install.sh" "$REPO"
