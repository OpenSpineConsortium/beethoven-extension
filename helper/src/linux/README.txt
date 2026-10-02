The Beethoven bridge for Linux

Beethoven uses this small program to reach the grid's sign-in (ssh) without the GlobalProtect VPN.
It carries Beethoven's encrypted connection to grid.wayne.edu and nothing else: it cannot read
what passes through it, keeps no password or key, and starts no other program. It runs with perl,
or with python3 where perl is missing.

Install (no root needed)
  unzip beethoven-bridge-linux.zip -d beethoven-bridge
  bash beethoven-bridge/install.sh
Then go back to Beethoven and press Check again.

What it changes: ~/.local/share/beethoven/bridge (the scripts and a two-line launcher) and one
small file in ~/.config/google-chrome/NativeMessagingHosts (and the Chromium and Edge folders when
they exist). Chrome or Chromium installed as a Snap or Flatpak cannot start the bridge; use
GlobalProtect in Beethoven there.

Remove
  bash ~/.local/share/beethoven/bridge/uninstall.sh
