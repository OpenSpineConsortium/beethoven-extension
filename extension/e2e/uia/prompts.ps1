param([int]$ProcessId = 0, [double]$Seconds = 600, [string]$Press = "Allow", [string]$Names = "Allow,Deny", [string]$ShotDir = "")
# Watches the windows of ONE Chromium process (the harness's test browser) through Windows UI
# Automation for Chrome's permission prompt (buttons named Allow and Deny) for $Seconds, and prints
# one line per prompt it sees:  PROMPT <ms since start> | <window> | <the prompt's text> | <action>
# $Press is "Allow", "Deny" or "None" (log only). With $ShotDir, a picture of the window with the
# prompt on it (winshot.ps1) is saved there before anything is pressed. Never touches any other process.
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
if ($ProcessId -le 0) { Write-Output "ERROR no process id"; exit 2 }
$deadline = (Get-Date).AddMilliseconds($Seconds * 1000)
$started = Get-Date
$root = [System.Windows.Automation.AutomationElement]::RootElement
$pidCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $ProcessId)
$btnType = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
$textType = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Text)
$conds = @($Names.Split(',') | ForEach-Object { New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $_.Trim()) })
if ($conds.Count -eq 1) { $nameCond = $conds[0] } else { $nameCond = New-Object System.Windows.Automation.OrCondition($conds) }
$cond = New-Object System.Windows.Automation.AndCondition($btnType, $nameCond)
$lastKey = ""
$lastAt = Get-Date -Year 2000
[Console]::Out.Flush()
do {
  try {
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $pidCond)
    foreach ($w in $windows) {
      $found = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
      if ($found.Count -gt 0) {
        # the prompt's words: the text elements that sit beside its buttons
        $parent = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($found[0])
        $words = @()
        for ($i = 0; $i -lt 4 -and $parent; $i++) {
          $texts = $parent.FindAll([System.Windows.Automation.TreeScope]::Descendants, $textType)
          $words = @($texts | ForEach-Object { $_.Current.Name } | Where-Object { $_ })
          if ($words.Count -gt 0) { break }
          $parent = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($parent)
        }
        $text = ($words -join ' / ')
        $key = "$($w.Current.Name)|$text"
        $ms = [int]((Get-Date) - $started).TotalMilliseconds
        $buttonNames = (@($found | ForEach-Object { $_.Current.Name }) -join ',')
        $action = "none"
        if ($ShotDir -and $key -ne $lastKey) { & (Join-Path $PSScriptRoot 'winshot.ps1') -ProcessId $ProcessId -Out (Join-Path $ShotDir "prompt-$ms.png") | Out-Null }
        if ($Press -ne "None") {
          foreach ($b in $found) {
            if ($b.Current.Name -eq $Press) {
              $o = $null
              if ($b.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$o)) { $o.Invoke(); $action = "pressed $Press" }
            }
          }
        }
        if ($key -ne $lastKey -or ((Get-Date) - $lastAt).TotalSeconds -gt 3 -or $action -ne "none") {
          Write-Output ("PROMPT $ms | " + $w.Current.Name + " | " + $text + " | buttons [" + $buttonNames + "] | " + $action)
          [Console]::Out.Flush()
          $lastKey = $key
          $lastAt = Get-Date
        }
        if ($action -ne "none") { Start-Sleep -Milliseconds 600 }
      }
    }
  } catch { }
  Start-Sleep -Milliseconds 200
} while ((Get-Date) -lt $deadline)
Write-Output "END"
