[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ReadyFile,

  [Parameter(Mandatory = $true)]
  [string]$StateFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([System.Threading.Thread]::CurrentThread.ApartmentState -ne [System.Threading.ApartmentState]::STA) {
  throw 'The Windows desktop smoke fixture must run in a PowerShell STA process.'
}

$ReadyFile = [System.IO.Path]::GetFullPath($ReadyFile)
$StateFile = [System.IO.Path]::GetFullPath($StateFile)

if ($ReadyFile -eq $StateFile) {
  throw 'ReadyFile and StateFile must be different paths.'
}

if (-not [Environment]::UserInteractive) {
  throw 'The Windows desktop smoke fixture requires an interactive user session.'
}
if ([System.Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0) {
  throw 'The Windows desktop smoke fixture cannot run in Windows session 0.'
}

function Write-JsonAtomically {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [object]$Value
  )

  $directory = [System.IO.Path]::GetDirectoryName($Path)
  if (-not [System.IO.Directory]::Exists($directory)) {
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
  }

  $fileName = [System.IO.Path]::GetFileName($Path)
  $suffix = [System.Guid]::NewGuid().ToString('N')
  $temporaryPath = [System.IO.Path]::Combine($directory, ".$fileName.$suffix.tmp")
  $encoding = New-Object System.Text.UTF8Encoding($false)
  $json = $Value | ConvertTo-Json -Depth 8 -Compress

  try {
    [System.IO.File]::WriteAllText($temporaryPath, $json, $encoding)
    Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
  }
  finally {
    if ([System.IO.File]::Exists($temporaryPath)) {
      [System.IO.File]::Delete($temporaryPath)
    }
  }
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class MidsceneWindowsFixtureNativeMethods
{
    [DllImport("user32.dll")]
    public static extern uint GetDpiForSystem();

    [DllImport("user32.dll")]
    public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindowVisible(IntPtr windowHandle);
}
'@

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)
[System.Windows.Forms.Application]::SetUnhandledExceptionMode(
  [System.Windows.Forms.UnhandledExceptionMode]::ThrowException
)

function New-BoundsValue {
  param(
    [Parameter(Mandatory = $true)]
    [int]$X,

    [Parameter(Mandatory = $true)]
    [int]$Y,

    [Parameter(Mandatory = $true)]
    [int]$Width,

    [Parameter(Mandatory = $true)]
    [int]$Height
  )

  return [ordered]@{
    x = $X
    y = $Y
    width = $Width
    height = $Height
    left = $X
    top = $Y
    right = $X + $Width
    bottom = $Y + $Height
    centerX = $X + [int][Math]::Floor($Width / 2)
    centerY = $Y + [int][Math]::Floor($Height / 2)
  }
}

function Get-ControlScreenBounds {
  param(
    [Parameter(Mandatory = $true)]
    [System.Windows.Forms.Control]$Control
  )

  $screenLocation = $Control.PointToScreen([System.Drawing.Point]::Empty)
  return New-BoundsValue `
    -X $screenLocation.X `
    -Y $screenLocation.Y `
    -Width $Control.Width `
    -Height $Control.Height
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Midscene Windows Desktop Smoke'
$form.Name = 'MidsceneWindowsDesktopSmoke'
$form.AccessibleName = 'Midscene Windows Desktop Smoke'
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.ClientSize = New-Object System.Drawing.Size(520, 340)
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedSingle
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ShowInTaskbar = $true
$form.TopMost = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(242, 246, 250)

$primaryScreen = [System.Windows.Forms.Screen]::PrimaryScreen
if ($null -eq $primaryScreen) {
  throw 'Windows Forms did not report a primary screen.'
}

$workingArea = $primaryScreen.WorkingArea
$form.Left = $workingArea.Left + [Math]::Max(20, [int][Math]::Floor(($workingArea.Width - $form.Width) / 2))
$form.Top = $workingArea.Top + [Math]::Max(20, [int][Math]::Floor(($workingArea.Height - $form.Height) / 2))

$heading = New-Object System.Windows.Forms.Label
$heading.AutoSize = $true
$heading.Location = New-Object System.Drawing.Point(24, 18)
$heading.Font = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Bold)
$heading.ForeColor = [System.Drawing.Color]::FromArgb(31, 41, 55)
$heading.Text = 'Midscene Windows CI desktop fixture'

$button = New-Object System.Windows.Forms.Button
$button.Name = 'MidsceneSmokeButton'
$button.AccessibleName = 'Midscene Smoke Button'
$button.Location = New-Object System.Drawing.Point(340, 72)
$button.Size = New-Object System.Drawing.Size(150, 58)
$button.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$button.FlatAppearance.BorderSize = 2
$button.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(0, 92, 52)
$button.BackColor = [System.Drawing.Color]::FromArgb(0, 210, 80)
$button.ForeColor = [System.Drawing.Color]::FromArgb(10, 35, 20)
$button.UseVisualStyleBackColor = $false
$button.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$button.Text = 'GREEN TAP TARGET'

$doubleClickButton = New-Object System.Windows.Forms.Button
$doubleClickButton.Name = 'MidsceneDoubleClickButton'
$doubleClickButton.AccessibleName = 'Midscene Double Click Button'
$doubleClickButton.Location = New-Object System.Drawing.Point(340, 145)
$doubleClickButton.Size = New-Object System.Drawing.Size(150, 48)
$doubleClickButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$doubleClickButton.FlatAppearance.BorderSize = 2
$doubleClickButton.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(20, 60, 130)
$doubleClickButton.BackColor = [System.Drawing.Color]::FromArgb(80, 150, 255)
$doubleClickButton.ForeColor = [System.Drawing.Color]::FromArgb(10, 25, 55)
$doubleClickButton.UseVisualStyleBackColor = $false
$doubleClickButton.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
$doubleClickButton.Text = 'DOUBLE-CLICK TARGET'

$textLabel = New-Object System.Windows.Forms.Label
$textLabel.AutoSize = $true
$textLabel.Location = New-Object System.Drawing.Point(24, 68)
$textLabel.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$textLabel.ForeColor = [System.Drawing.Color]::FromArgb(55, 65, 81)
$textLabel.Text = 'Type into the real WinForms TextBox:'

$textBox = New-Object System.Windows.Forms.TextBox
$textBox.Name = 'MidsceneSmokeTextBox'
$textBox.AccessibleName = 'Midscene Smoke Text Box'
$textBox.Location = New-Object System.Drawing.Point(24, 94)
$textBox.Size = New-Object System.Drawing.Size(270, 34)
$textBox.Font = New-Object System.Drawing.Font('Segoe UI', 12)

$scrollLabel = New-Object System.Windows.Forms.Label
$scrollLabel.AutoSize = $true
$scrollLabel.Location = New-Object System.Drawing.Point(24, 205)
$scrollLabel.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$scrollLabel.ForeColor = [System.Drawing.Color]::FromArgb(31, 41, 55)
$scrollLabel.Text = 'Hover here and send a real mouse-wheel event'

$scrollArea = New-Object System.Windows.Forms.ListBox
$scrollArea.Name = 'MidsceneSmokeScrollArea'
$scrollArea.AccessibleName = 'Midscene Smoke Scroll Area'
$scrollArea.Location = New-Object System.Drawing.Point(24, 230)
$scrollArea.Size = New-Object System.Drawing.Size(466, 82)
$scrollArea.IntegralHeight = $false
$scrollArea.TabStop = $true
$scrollArea.BackColor = [System.Drawing.Color]::FromArgb(231, 245, 255)
$scrollArea.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$scrollArea.Font = New-Object System.Drawing.Font('Segoe UI', 11)

for ($index = 0; $index -lt 30; $index += 1) {
  $scrollArea.Items.Add("Scrollable evidence row $($index + 1)") | Out-Null
}

$form.Controls.AddRange(@(
  $heading,
  $button,
  $doubleClickButton,
  $textLabel,
  $textBox,
  $scrollLabel,
  $scrollArea
))

$state = [ordered]@{
  schemaVersion = 1
  processId = [System.Diagnostics.Process]::GetCurrentProcess().Id
  updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  visible = $false
  clickCount = 0
  doubleClickCount = 0
  text = ''
  lastKey = ''
  keyEventCount = 0
  wheelEventCount = 0
  lastWheelDelta = 0
  wheelDelta = 0
  totalWheelDelta = 0
  scrollX = 0
  scrollY = 0
  scrollValue = 0
}

function Write-State {
  $state.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  $state.visible = $form.Visible -and
    [MidsceneWindowsFixtureNativeMethods]::IsWindowVisible($form.Handle) -and
    ($form.WindowState -ne [System.Windows.Forms.FormWindowState]::Minimized)
  $state.text = $textBox.Text
  $state.scrollX = 0
  $state.scrollY = [int]$scrollArea.TopIndex
  $state.scrollValue = $state.scrollY
  Write-JsonAtomically -Path $StateFile -Value $state
}

$button.Add_Click({
  $state.clickCount += 1
  Write-State
})

$doubleClickButton.Add_Click({
  $state.doubleClickCount += 1
  Write-State
})

$textBox.Add_TextChanged({
  $state.text = $textBox.Text
  Write-State
})

$textBox.Add_KeyDown({
  param($sender, $eventArgs)
  $state.lastKey = $eventArgs.KeyCode.ToString()
  $state.keyEventCount += 1
  Write-State
})

$scrollArea.Add_MouseWheel({
  param($sender, $eventArgs)
  $state.lastWheelDelta = $eventArgs.Delta
  $state.wheelDelta = $eventArgs.Delta
  $state.totalWheelDelta += $eventArgs.Delta
  $state.wheelEventCount += 1
  $currentScrollValue = [int]$scrollArea.TopIndex
  $rowsPerDetent = 3
  $detents = [Math]::Max(1, [Math]::Abs([int]($eventArgs.Delta / 120)))
  $rowDelta = if ($eventArgs.Delta -lt 0) {
    $rowsPerDetent * $detents
  }
  else {
    -$rowsPerDetent * $detents
  }
  $targetScrollValue = [Math]::Min(
    $scrollArea.Items.Count - 1,
    [Math]::Max(0, $currentScrollValue + $rowDelta)
  )
  $scrollArea.TopIndex = $targetScrollValue
  Write-State
})

$focusScrollArea = {
  if ($scrollArea.CanFocus) {
    $scrollArea.Focus() | Out-Null
  }
}
$scrollArea.Add_MouseEnter($focusScrollArea)

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 750
$timer.Add_Tick({
  $focusedControl = $form.ActiveControl
  $form.BringToFront()
  if (
    $null -ne $focusedControl -and
    -not $focusedControl.IsDisposed -and
    $focusedControl.CanFocus -and
    $form.Contains($focusedControl)
  ) {
    $focusedControl.Focus() | Out-Null
  }
  Write-State
})

$form.Add_Shown({
  $currentProcess = [System.Diagnostics.Process]::GetCurrentProcess()
  $form.Activate()
  $form.BringToFront()
  $form.Refresh()

  $systemAwareContext = [System.IntPtr]::new(-2)
  $previousDpiContext = [MidsceneWindowsFixtureNativeMethods]::SetThreadDpiAwarenessContext(
    $systemAwareContext
  )
  if ($previousDpiContext -eq [System.IntPtr]::Zero) {
    throw 'Unable to enter a system-aware thread DPI context for the fixture probe.'
  }
  try {
    $dpi = [MidsceneWindowsFixtureNativeMethods]::GetDpiForSystem()
  }
  finally {
    [MidsceneWindowsFixtureNativeMethods]::SetThreadDpiAwarenessContext(
      $previousDpiContext
    ) | Out-Null
  }
  if ($dpi -eq 0) {
    throw 'GetDpiForSystem returned zero for the system-aware fixture probe.'
  }

  $screenBounds = $primaryScreen.Bounds
  $screenWorkingArea = $primaryScreen.WorkingArea
  $formBounds = $form.Bounds
  $visible = $form.Visible -and
    [MidsceneWindowsFixtureNativeMethods]::IsWindowVisible($form.Handle) -and
    ($form.WindowState -ne [System.Windows.Forms.FormWindowState]::Minimized)

  if (-not $visible) {
    throw 'The Windows desktop smoke fixture window is not visible.'
  }

  Write-State

  $screenMetadata = New-BoundsValue `
    -X $screenBounds.X `
    -Y $screenBounds.Y `
    -Width $screenBounds.Width `
    -Height $screenBounds.Height
  $screenMetadata['deviceName'] = $primaryScreen.DeviceName
  $screenMetadata['primary'] = $primaryScreen.Primary
  $screenMetadata['workingArea'] = New-BoundsValue `
    -X $screenWorkingArea.X `
    -Y $screenWorkingArea.Y `
    -Width $screenWorkingArea.Width `
    -Height $screenWorkingArea.Height

  $formMetadata = New-BoundsValue `
    -X $formBounds.X `
    -Y $formBounds.Y `
    -Width $formBounds.Width `
    -Height $formBounds.Height
  $formMetadata['handle'] = $form.Handle.ToInt64().ToString()
  $formMetadata['title'] = $form.Text
  $formMetadata['visible'] = $visible

  $buttonMetadata = Get-ControlScreenBounds -Control $button
  $buttonMetadata['handle'] = $button.Handle.ToInt64().ToString()
  $buttonMetadata['name'] = $button.Name
  $buttonMetadata['text'] = $button.Text

  $doubleClickButtonMetadata = Get-ControlScreenBounds -Control $doubleClickButton
  $doubleClickButtonMetadata['handle'] = $doubleClickButton.Handle.ToInt64().ToString()
  $doubleClickButtonMetadata['name'] = $doubleClickButton.Name
  $doubleClickButtonMetadata['text'] = $doubleClickButton.Text

  $textBoxMetadata = Get-ControlScreenBounds -Control $textBox
  $textBoxMetadata['handle'] = $textBox.Handle.ToInt64().ToString()
  $textBoxMetadata['name'] = $textBox.Name

  $scrollMetadata = Get-ControlScreenBounds -Control $scrollArea
  $scrollMetadata['handle'] = $scrollArea.Handle.ToInt64().ToString()
  $scrollMetadata['name'] = $scrollArea.Name

  $ready = [ordered]@{
    schemaVersion = 1
    userInteractive = [Environment]::UserInteractive
    sessionId = $currentProcess.SessionId
    processId = $currentProcess.Id
    visible = $visible
    dpi = [int]$dpi
    screen = $screenMetadata
    form = $formMetadata
    button = $buttonMetadata
    doubleClickButton = $doubleClickButtonMetadata
    textBox = $textBoxMetadata
    scroll = $scrollMetadata
  }

  Write-JsonAtomically -Path $ReadyFile -Value $ready
  $timer.Start()
  [Console]::Out.WriteLine(
    "MIDSCENE_WINDOWS_FIXTURE_READY pid=$($ready.processId) session=$($ready.sessionId) dpi=$($ready.dpi)"
  )
  [Console]::Out.Flush()
})

$form.Add_FormClosed({
  $timer.Stop()
  $state.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  $state.visible = $false
  Write-JsonAtomically -Path $StateFile -Value $state
})

[Console]::Out.WriteLine('MIDSCENE_WINDOWS_FIXTURE_STARTING')
[Console]::Out.Flush()
[System.Windows.Forms.Application]::Run($form)
