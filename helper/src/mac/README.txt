The Beethoven bridge for macOS

Beethoven uses this small program to reach the grid's sign-in (ssh) without the GlobalProtect VPN.
It carries Beethoven's encrypted connection to grid.wayne.edu and nothing else: it cannot read
what passes through it, keeps no password or key, and starts no other program. It is a Perl
script run by the perl that comes with macOS.

Install
1. Double-click the zip file; a folder appears beside it.
2. Control-click install.command in that folder and choose Open, then Open again. (macOS blocks a
   plain double-click on files from developers it has not verified. On macOS 15 or later, if there
   is no Open button: System Settings, Privacy & Security, then Open Anyway beside install.command.)
3. Press Return. No administrator password is needed. When the window says the bridge is
   installed, go back to Beethoven and press Check again.

What it changes: a folder at ~/Library/Application Support/Beethoven/bridge with the script and its
uninstaller, and one small file in Chrome's NativeMessagingHosts folder that tells Chrome where it
is. The installer removes the downloaded-file mark (com.apple.quarantine) from the copies it makes,
so that Chrome can start the bridge.

Remove
In Finder choose Go, Go to Folder, paste ~/Library/Application Support/Beethoven/bridge, and open
uninstall.command.
