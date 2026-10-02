@echo off
rem Installs the Beethoven bridge for this Windows account. No administrator rights are needed.
rem Everything happens in install.ps1 beside this file; this file only starts it, because Windows
rem runs a .cmd on a double-click and opens a .ps1 in Notepad.
setlocal
if not exist "%~dp0install.ps1" goto missing
if not exist "%~dp0bridge.ps1" goto missing
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
exit /b %errorlevel%

:missing
rem Explorer runs a file from inside a zip without unpacking the files beside it.
echo Windows opened this file without the rest of the bridge. Right-click the zip file, choose Extract All, then open install.cmd in the folder that appears.
if not defined BEETHOVEN_BRIDGE_YES pause
exit /b 2
