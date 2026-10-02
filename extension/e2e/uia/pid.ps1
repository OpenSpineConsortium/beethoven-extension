param([string]$ProfileLike)
# The main process of the test browser whose command line names this profile folder (and no --type=)
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -like "*$ProfileLike*" -and $_.CommandLine -notlike '*--type=*' } |
  Select-Object -ExpandProperty ProcessId
