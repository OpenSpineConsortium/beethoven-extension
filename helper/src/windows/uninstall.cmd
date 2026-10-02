@echo off
rem Removes the Beethoven bridge from this Windows account. No administrator rights are needed.
rem The work is in uninstall.ps1 beside this file. When this copy is the one inside the installed
rem folder, uninstall.ps1 leaves this file alone and exits with 10, and the last line below deletes
rem it and the then empty folders: "(goto)" ends the batch file first, so cmd no longer reads it.
setlocal
if not exist "%~dp0uninstall.ps1" goto missing
cd /d "%TEMP%"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" -Caller "%~f0"
if errorlevel 10 goto selfdelete
exit /b %errorlevel%

:missing
echo The bridge's uninstaller is incomplete here. Open the folder %LOCALAPPDATA%\Beethoven\bridge and double-click uninstall.cmd there.
if not defined BEETHOVEN_BRIDGE_YES pause
exit /b 2

:selfdelete
(goto) 2>nul & del "%~f0" & rmdir "%~dp0." 2>nul & rmdir "%~dp0.." 2>nul
