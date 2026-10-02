param([int]$ProcessId = 0, [string]$Out = "")
# A picture of the largest visible top-level window of ONE test Chromium process: the tab, the side
# panel beside it, and Chrome's own permission prompt and sign-in box (which no page screenshot
# contains). PrintWindow with PW_RENDERFULLCONTENT asks the window to draw itself, so the picture is
# right even when another window covers it on the screen.
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
if ($ProcessId -le 0 -or -not $Out) { Write-Output "ERROR usage"; exit 2 }
[Win]::SetProcessDPIAware() | Out-Null
$root = [System.Windows.Automation.AutomationElement]::RootElement
$pidCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $ProcessId)
$best = $null; $bestArea = 0
foreach ($w in $root.FindAll([System.Windows.Automation.TreeScope]::Children, $pidCond)) {
  $r = $w.Current.BoundingRectangle
  $area = $r.Width * $r.Height
  if ($area -gt $bestArea -and $w.Current.NativeWindowHandle -ne 0) { $best = $w; $bestArea = $area }
}
if (-not $best) { Write-Output "NONE"; exit 1 }
$h = [IntPtr]$best.Current.NativeWindowHandle
$rect = New-Object Win+RECT
[Win]::GetWindowRect($h, [ref]$rect) | Out-Null
$wd = $rect.Right - $rect.Left; $ht = $rect.Bottom - $rect.Top
if ($wd -le 0 -or $ht -le 0) { Write-Output "NONE empty window"; exit 1 }
$bmp = New-Object System.Drawing.Bitmap($wd, $ht)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$ok = [Win]::PrintWindow($h, $hdc, 2)
$g.ReleaseHdc($hdc)
# Chrome's permission bubble and its sign-in box are windows of their own: draw each over the picture where it sits
$extra = 0
foreach ($w in $root.FindAll([System.Windows.Automation.TreeScope]::Children, $pidCond)) {
  $hw = [IntPtr]$w.Current.NativeWindowHandle
  if ($hw -eq $h -or $hw -eq [IntPtr]::Zero) { continue }
  $r2 = New-Object Win+RECT
  [Win]::GetWindowRect($hw, [ref]$r2) | Out-Null
  $w2 = $r2.Right - $r2.Left; $h2 = $r2.Bottom - $r2.Top
  if ($w2 -le 0 -or $h2 -le 0 -or $r2.Right -lt $rect.Left -or $r2.Left -gt $rect.Right -or $r2.Bottom -lt $rect.Top -or $r2.Top -gt $rect.Bottom) { continue }
  $b2 = New-Object System.Drawing.Bitmap($w2, $h2)
  $g2 = [System.Drawing.Graphics]::FromImage($b2)
  $d2 = $g2.GetHdc()
  [Win]::PrintWindow($hw, $d2, 2) | Out-Null
  $g2.ReleaseHdc($d2)
  $g.DrawImage($b2, $r2.Left - $rect.Left, $r2.Top - $rect.Top)
  $g2.Dispose(); $b2.Dispose()
  $extra++
}
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "SAVED $wd x $ht $Out (PrintWindow $ok; $extra window(s) of Chrome's own drawn over it)"
