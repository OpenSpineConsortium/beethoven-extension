@echo off
rem The Beethoven bridge, Windows launcher. Chrome and Edge start this file (it is the "path" in
rem the native messaging manifest the installer wrote) and talk to it over stdin and stdout; it
rem only starts Windows PowerShell on bridge.ps1 beside it, which does the work. Nothing here may
rem print anything: every byte on stdout belongs to the message stream.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0bridge.ps1"
