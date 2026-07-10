param(
  [Parameter(Mandatory = $true)]
  [string]$ReadyFile
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing, System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class MidsceneWindowFixtureNative {
  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@

[void][MidsceneWindowFixtureNative]::SetProcessDPIAware()
[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)

$form = New-Object System.Windows.Forms.Form
$form.Name = 'midscene_cache_fixture_window'
$form.Text = 'Midscene Windows Cache Fixture'
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.ClientSize = New-Object System.Drawing.Size(640, 360)
$form.ShowInTaskbar = $true
$form.TopMost = $true

$screenBounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$form.Location = New-Object System.Drawing.Point(
  ($screenBounds.Left + [Math]::Max(0, [Math]::Floor(($screenBounds.Width - $form.Width) / 2))),
  ($screenBounds.Top + [Math]::Max(0, [Math]::Floor(($screenBounds.Height - $form.Height) / 2)))
)

$button = New-Object System.Windows.Forms.Button
$button.Name = 'cache_target_button'
$button.Text = 'Midscene Cache Target'
$button.AccessibleName = 'Midscene Cache Target'
$button.AccessibleDescription = 'Midscene Windows accessibility cache target'
$button.AccessibleRole = [System.Windows.Forms.AccessibleRole]::PushButton
$button.Location = New-Object System.Drawing.Point(190, 130)
$button.Size = New-Object System.Drawing.Size(260, 72)
$button.TabIndex = 0
$form.Controls.Add($button)

$focusTimer = New-Object System.Windows.Forms.Timer
$focusTimer.Interval = 100
$focusTimer.Add_Tick({
  $form.Activate()
  $form.BringToFront()
  [void][MidsceneWindowFixtureNative]::SetForegroundWindow($form.Handle)
  [void]$button.Focus()
})

$form.Add_Shown({
  $form.Activate()
  $form.BringToFront()
  [void][MidsceneWindowFixtureNative]::SetForegroundWindow($form.Handle)
  [void]$button.Focus()

  $graphics = $form.CreateGraphics()
  try {
    $buttonHandle = [Int64]$button.Handle
    $buttonAccessibilityObject = $button.AccessibilityObject
    $buttonBounds = $button.RectangleToScreen($button.ClientRectangle)
    $metadata = [PSCustomObject]@{
      processId = $PID
      sessionId = (Get-Process -Id $PID).SessionId
      userInteractive = [Environment]::UserInteractive
      windowHandle = [Int64]$form.Handle
      buttonHandle = $buttonHandle
      accessibilityObjectType = $buttonAccessibilityObject.GetType().FullName
      dpiX = [double]$graphics.DpiX
      dpiY = [double]$graphics.DpiY
      screenBounds = [PSCustomObject]@{
        left = $screenBounds.Left
        top = $screenBounds.Top
        width = $screenBounds.Width
        height = $screenBounds.Height
      }
      buttonBounds = [PSCustomObject]@{
        left = $buttonBounds.Left - $screenBounds.Left
        top = $buttonBounds.Top - $screenBounds.Top
        width = $buttonBounds.Width
        height = $buttonBounds.Height
      }
    }
    [System.IO.File]::WriteAllText(
      $ReadyFile,
      ($metadata | ConvertTo-Json -Depth 5 -Compress)
    )
    [Console]::Out.WriteLine("[WindowsCacheFixture] ready $($metadata | ConvertTo-Json -Depth 5 -Compress)")
  } finally {
    $graphics.Dispose()
  }

  $focusTimer.Start()
})

$form.Add_FormClosed({
  $focusTimer.Stop()
  $focusTimer.Dispose()
})

[System.Windows.Forms.Application]::Run($form)
