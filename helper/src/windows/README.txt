The Beethoven bridge for Windows

Beethoven uses this small program to reach the grid's sign-in (ssh) without the GlobalProtect VPN.
It carries Beethoven's encrypted connection to grid.wayne.edu and nothing else: it cannot read
what passes through it, keeps no password or key, and starts no other program.

Install
1. Right-click the zip file and choose Extract All, then open the folder that appears.
2. Double-click install.cmd. If Windows shows a warning about the file, choose Run (or More info,
   then Run anyway). No administrator rights are needed.
3. Press Enter. When the window says the bridge is installed, go back to Beethoven and press
   Check again.

What it changes: a folder at %LOCALAPPDATA%\Beethoven\bridge with the bridge's script files, and
one registry entry each for Chrome and Edge under HKEY_CURRENT_USER that tells them where it is.

Remove
Open %LOCALAPPDATA%\Beethoven\bridge (paste it into the File Explorer address bar) and
double-click uninstall.cmd.
