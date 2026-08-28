[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet(100, 125, 150, 175, 200)]
  [int]$ScalePercent,

  [Parameter(Mandatory = $true)]
  [string]$DiagnosticsFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$DiagnosticsFile = [System.IO.Path]::GetFullPath($DiagnosticsFile)
$diagnosticsDirectory = [System.IO.Path]::GetDirectoryName($DiagnosticsFile)
[System.IO.Directory]::CreateDirectory($diagnosticsDirectory) | Out-Null

$diagnostics = [ordered]@{
  schemaVersion = 1
  requestedScalePercent = $ScalePercent
  expectedDpi = [int][Math]::Round(96 * $ScalePercent / 100)
  startedAt = [DateTimeOffset]::UtcNow.ToString('o')
  applied = $false
  automationElements = @()
}

function Write-Diagnostics {
  $diagnostics.completedAt = [DateTimeOffset]::UtcNow.ToString('o')
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText(
    $DiagnosticsFile,
    ($diagnostics | ConvertTo-Json -Depth 8),
    $encoding
  )
}

function Get-Pattern {
  param(
    [Parameter(Mandatory = $true)]
    [System.Windows.Automation.AutomationElement]$Element,

    [Parameter(Mandatory = $true)]
    [System.Windows.Automation.AutomationPattern]$Pattern
  )

  $patternValue = $null
  if ($Element.TryGetCurrentPattern($Pattern, [ref]$patternValue)) {
    return $patternValue
  }
  return $null
}

function Get-ElementSnapshot {
  param(
    [Parameter(Mandatory = $true)]
    [System.Windows.Automation.AutomationElement]$Element
  )

  $value = $null
  $valuePattern = Get-Pattern `
    -Element $Element `
    -Pattern ([System.Windows.Automation.ValuePattern]::Pattern)
  if ($null -ne $valuePattern) {
    $value = $valuePattern.Current.Value
  }

  return [ordered]@{
    name = $Element.Current.Name
    automationId = $Element.Current.AutomationId
    className = $Element.Current.ClassName
    controlType = $Element.Current.ControlType.ProgrammaticName
    processId = $Element.Current.ProcessId
    value = $value
  }
}

try {
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
  Add-Type -AssemblyName System.Windows.Forms

  Start-Process 'ms-settings:display'

  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $settingsElements = @()
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 500
    $allElements = $root.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition
    )
    $settingsElements = @(
      $allElements | Where-Object {
        $_.Current.ProcessId -gt 0 -and (
          $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::ComboBox -or
          $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::ListItem -or
          $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Text
        )
      }
    )
    if ($settingsElements.Count -gt 0) {
      $settingsProcessIds = @(
        Get-Process -Name 'SystemSettings', 'ApplicationFrameHost' -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty Id
      )
      if ($settingsProcessIds.Count -gt 0) {
        $settingsElements = @(
          $settingsElements | Where-Object {
            $_.Current.ProcessId -in $settingsProcessIds
          }
        )
      }
    }
    if (
      $settingsElements | Where-Object {
        $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::ComboBox
      }
    ) {
      break
    }
  }

  $diagnostics.automationElements = @(
    $settingsElements |
      Select-Object -First 500 |
      ForEach-Object { Get-ElementSnapshot -Element $_ }
  )

  $comboBoxes = @(
    $settingsElements | Where-Object {
      $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::ComboBox
    }
  )
  if ($comboBoxes.Count -eq 0) {
    throw 'Windows Display Settings exposed no UI Automation combo boxes.'
  }

  $currentScalePattern = '(?i)^\s*\d{2,3}%\s*(\(recommended\))?\s*$'
  $scaleCombo = $comboBoxes | Where-Object {
    $snapshot = Get-ElementSnapshot -Element $_
    $snapshot.name -match $currentScalePattern -or
      $snapshot.value -match $currentScalePattern -or
      $snapshot.automationId -eq 'SystemSettings_Display_Scaling_ItemSizeOverride_ComboBox'
  } | Select-Object -First 1

  if ($null -eq $scaleCombo) {
    throw 'Unable to identify the Scale combo box in Windows Display Settings.'
  }

  $diagnostics.scaleComboBefore = Get-ElementSnapshot -Element $scaleCombo
  $scaleCombo.SetFocus()
  $expandPattern = Get-Pattern `
    -Element $scaleCombo `
    -Pattern ([System.Windows.Automation.ExpandCollapsePattern]::Pattern)
  if ($null -ne $expandPattern) {
    $expandPattern.Expand()
    Start-Sleep -Milliseconds 750
  }
  else {
    [System.Windows.Forms.SendKeys]::SendWait('%{DOWN}')
    Start-Sleep -Milliseconds 750
  }

  $targetPattern = "^\s*$ScalePercent%"
  $targetItem = $null
  $expandedListItems = @()
  $selectionDeadline = [DateTime]::UtcNow.AddSeconds(15)
  while ([DateTime]::UtcNow -lt $selectionDeadline -and $null -eq $targetItem) {
    $allElements = $root.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition
    )
    $expandedListItems = @(
      $allElements | Where-Object {
        $_.Current.ProcessId -eq $scaleCombo.Current.ProcessId -and
        $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::ListItem
      }
    )
    $targetItem = $expandedListItems | Where-Object {
      $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::ListItem -and
      $_.Current.Name -match $targetPattern
    } | Select-Object -First 1
    if ($null -eq $targetItem) {
      Start-Sleep -Milliseconds 250
    }
  }
  $diagnostics.expandedListItems = @(
    $expandedListItems | ForEach-Object { Get-ElementSnapshot -Element $_ }
  )

  $availableScaleItems = @(
    $expandedListItems | Where-Object {
      $_.Current.ClassName -eq 'ComboBoxItem' -and
      $_.Current.Name -match '^\s*\d{2,3}%'
    }
  )
  $diagnostics.availableScales = @(
    $availableScaleItems | ForEach-Object { $_.Current.Name }
  )

  if ($null -ne $targetItem) {
    $diagnostics.selectionMethod = 'UIAutomation.SelectionItemPattern'
    $diagnostics.targetItem = Get-ElementSnapshot -Element $targetItem
    $selectionPattern = Get-Pattern `
      -Element $targetItem `
      -Pattern ([System.Windows.Automation.SelectionItemPattern]::Pattern)
    if ($null -ne $selectionPattern) {
      $selectionPattern.Select()
    }
    else {
      $targetItem.SetFocus()
      [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    }
  }
  else {
    if ($availableScaleItems.Count -gt 0) {
      throw "Windows Display Settings does not offer $ScalePercent% on this runner. Available scales: $($diagnostics.availableScales -join ', ')."
    }
    # Some Windows builds keep expanded combo-box items out of the automation
    # tree. The standard scale choices are ordered 100, 125, 150, 175, 200;
    # select by keyboard index through the same public Settings control. Do not
    # send a literal "%": SendKeys interprets it as the Alt modifier.
    $standardScales = @(100, 125, 150, 175, 200)
    $targetIndex = [Array]::IndexOf($standardScales, $ScalePercent)
    if ($targetIndex -lt 0) {
      throw "No standard Settings keyboard index for $ScalePercent%."
    }
    $diagnostics.selectionMethod = 'Settings combo keyboard index'
    $scaleCombo.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait('{HOME}')
    if ($targetIndex -gt 0) {
      [System.Windows.Forms.SendKeys]::SendWait("{DOWN $targetIndex}")
    }
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  }

  Start-Sleep -Seconds 3
  $diagnostics.scaleComboAfter = Get-ElementSnapshot -Element $scaleCombo
  $diagnostics.applied = $true
  Write-Diagnostics
}
catch {
  $diagnostics.error = $_.Exception.ToString()
  Write-Diagnostics
  throw
}
