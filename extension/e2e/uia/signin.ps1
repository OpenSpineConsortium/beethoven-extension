param([int]$ProcessId = 0, [double]$TimeoutSec = 20, [string]$User = "st1234", [string]$Pass = "mockpass", [string]$Action = "SignIn", [string]$Shot = "")
# Finds Chrome's own HTTP sign-in box ("Sign in · https://... · Username · Password · Sign in ·
# Cancel") in ONE test Chromium process and acts on it the way a person does: types the Username and
# Password fields through UI Automation and presses "Sign in" ($Action SignIn), or presses "Cancel"
# ($Action Cancel). The credentials are the local mock portal's test account; never used anywhere else.
# Prints BOX <ms> | <window> | edits [...] and then SIGNED-IN pressed / CANCEL pressed, or NONE.
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
if ($ProcessId -le 0) { Write-Output "ERROR no process id"; exit 2 }
$deadline = (Get-Date).AddMilliseconds($TimeoutSec * 1000)
$root = [System.Windows.Automation.AutomationElement]::RootElement
$pidCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $ProcessId)
$editType = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
$btnType = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
$signCond = New-Object System.Windows.Automation.AndCondition($btnType, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Sign in')))
$cancelCond = New-Object System.Windows.Automation.AndCondition($btnType, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Cancel')))
$started = Get-Date
do {
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $pidCond)
  foreach ($w in $windows) {
    try {
      $btn = $w.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $signCond)
      if (-not $btn) { continue }
      $edits = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editType)
      $u = $null; $p = $null
      foreach ($e in $edits) { if ($e.Current.Name -match 'Username') { $u = $e } elseif ($e.Current.Name -match 'Password') { $p = $e } }
      if (-not $u -or -not $p) { continue }
      $ms = [int]((Get-Date) - $started).TotalMilliseconds
      Write-Output ("BOX $ms | " + $w.Current.Name + " | edits [" + (@($edits | ForEach-Object { $_.Current.Name }) -join ',') + "]")
      if ($Shot) { & (Join-Path $PSScriptRoot 'winshot.ps1') -ProcessId $ProcessId -Out $Shot | Out-Null }
      if ($Action -eq "Cancel") {
        $c = $w.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cancelCond)
        $ip = $null
        if ($c -and $c.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$ip)) { $ip.Invoke(); Write-Output "CANCEL pressed"; exit 0 }
        Write-Output "CANCEL not found"; exit 4
      }
      $vp = $null
      if ($u.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)) { $vp.SetValue($User) }
      $vp = $null
      if ($p.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)) { $vp.SetValue($Pass) }
      Start-Sleep -Milliseconds 300
      $ip = $null
      if ($btn.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$ip)) { $ip.Invoke(); Write-Output "SIGNED-IN pressed"; exit 0 }
      Write-Output "BUTTON not invokable"; exit 4
    } catch { Write-Output "ERR $_" }
  }
  Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $deadline)
Write-Output "NONE within $TimeoutSec s"
exit 1
