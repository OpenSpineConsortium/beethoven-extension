The Beethoven bridge for macOS

Beethoven uses this small program to reach your university's grid from Chrome without the
GlobalProtect VPN. It carries Beethoven's encrypted connection to the grid and nothing else: it
cannot read what passes through it, keeps no password or key, starts no other program, and runs
only while Chrome starts it for Beethoven.

The Beethoven bridge installer put it in your own account: this folder, and one small file that
tells Chrome where to find it (and Edge or Chromium, if they were installed at the time). Nothing
was put anywhere else, and no administrator password was used. The installer was signed by
Beethoven's maker, so your Mac could check where it came from before it ran.

Remove
Open uninstall.command in this folder (double-click it; a Terminal window opens) and press Return.
It removes this folder and the files that told Chrome about the bridge, and nothing else.
