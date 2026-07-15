import type { UiNode } from '@midscene/core/internal/device-cache';
import { accessibilityJsonToUiNode } from './accessibility-tree';
import { escapePowershellSingleQuoted, runPowershellAsync } from './powershell';

const WINDOWS_ACCESSIBILITY_TIMEOUT_MS = 10_000;
const WINDOWS_ACCESSIBILITY_MAX_BUFFER = 16 * 1024 * 1024;

export interface WindowsAccessibilityTreeOptions {
  windowHandle: number;
  displayId?: string;
}

function assertWindowHandle(windowHandle: number): void {
  if (!Number.isSafeInteger(windowHandle) || windowHandle <= 0) {
    throw new Error(
      `readWindowsAccessibilityTree: invalid active window handle ${windowHandle}`,
    );
  }
}

export function buildWindowsAccessibilityTreeScript(
  options: WindowsAccessibilityTreeOptions,
): string {
  assertWindowHandle(options.windowHandle);
  const displayId = options.displayId?.trim();
  const selectScreen = displayId
    ? `$displayId = '${escapePowershellSingleQuoted(displayId)}'
$screen = [System.Windows.Forms.Screen]::AllScreens | Where-Object { $_.DeviceName -eq $displayId } | Select-Object -First 1
if (-not $screen) { throw "Requested display not found: $displayId" }`
    : '$screen = [System.Windows.Forms.Screen]::PrimaryScreen';

  return String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class MidsceneNativeWindowEnumerator {
  private delegate bool EnumWindowProc(IntPtr windowHandle, IntPtr parameter);

  [DllImport("user32.dll")]
  private static extern bool EnumChildWindows(
    IntPtr parentWindowHandle,
    EnumWindowProc callback,
    IntPtr parameter
  );

  public static IntPtr[] GetDescendantWindows(IntPtr parentWindowHandle) {
    var handles = new List<IntPtr>();
    EnumChildWindows(
      parentWindowHandle,
      (windowHandle, _) => {
        handles.Add(windowHandle);
        return true;
      },
      IntPtr.Zero
    );
    return handles.ToArray();
  }
}
'@
${selectScreen}

$windowHandle = [Int64]${options.windowHandle}
$root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$windowHandle)
if (-not $root) { throw "No UI Automation root for active window handle $windowHandle" }

$walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
$displayBounds = $screen.Bounds
$maxDepth = 5
$maxNodes = 300
$maxChildren = 80
$nodeCount = 0
$seenNativeWindowHandles = @{}

function Read-Property($element, $property) {
  try {
    $value = $element.GetCurrentPropertyValue($property, $true)
    if ([Object]::ReferenceEquals($value, [System.Windows.Automation.AutomationElement]::NotSupported)) {
      return $null
    }
    return $value
  } catch {
    return $null
  }
}

function Add-Attribute([hashtable]$attrs, [string]$name, $value) {
  if ($null -eq $value) { return }
  $text = [string]$value
  if ($text.Length -gt 0) { $attrs[$name] = $text }
}

function Convert-Node($element, [int]$depth) {
  $script:nodeCount += 1

  $controlType = Read-Property $element ([System.Windows.Automation.AutomationElement]::ControlTypeProperty)
  $typeName = 'Element'
  if ($controlType -is [System.Windows.Automation.ControlType]) {
    $typeName = $controlType.ProgrammaticName -replace '^ControlType\.', ''
  }
  $typeName = $typeName -replace '[^A-Za-z0-9_.:-]', ''
  if (-not $typeName) { $typeName = 'Element' }

  $attrs = @{}
  $nativeWindowHandle = Read-Property $element ([System.Windows.Automation.AutomationElement]::NativeWindowHandleProperty)
  $automationId = Read-Property $element ([System.Windows.Automation.AutomationElement]::AutomationIdProperty)
  $generatedAutomationId = (
    $null -ne $nativeWindowHandle -and
    [string]$nativeWindowHandle -ne '0' -and
    [string]$automationId -eq [string]$nativeWindowHandle
  )
  if (-not $generatedAutomationId) {
    Add-Attribute $attrs 'AutomationId' $automationId
  }
  if ($null -ne $nativeWindowHandle -and [string]$nativeWindowHandle -ne '0') {
    Add-Attribute $attrs 'NativeWindowHandle' $nativeWindowHandle
    $script:seenNativeWindowHandles[[string]$nativeWindowHandle] = $true
  }
  Add-Attribute $attrs 'Name' (Read-Property $element ([System.Windows.Automation.AutomationElement]::NameProperty))
  Add-Attribute $attrs 'HelpText' (Read-Property $element ([System.Windows.Automation.AutomationElement]::HelpTextProperty))
  Add-Attribute $attrs 'AccessKey' (Read-Property $element ([System.Windows.Automation.AutomationElement]::AccessKeyProperty))
  Add-Attribute $attrs 'LocalizedControlType' (Read-Property $element ([System.Windows.Automation.AutomationElement]::LocalizedControlTypeProperty))
  Add-Attribute $attrs 'ClassName' (Read-Property $element ([System.Windows.Automation.AutomationElement]::ClassNameProperty))
  Add-Attribute $attrs 'FrameworkId' (Read-Property $element ([System.Windows.Automation.AutomationElement]::FrameworkIdProperty))

  $left = 0
  $top = 0
  $width = 0
  $height = 0
  $rect = Read-Property $element ([System.Windows.Automation.AutomationElement]::BoundingRectangleProperty)
  if ($rect -is [System.Windows.Rect] -and -not $rect.IsEmpty) {
    $left = [double]$rect.X - [double]$displayBounds.X
    $top = [double]$rect.Y - [double]$displayBounds.Y
    $width = [double]$rect.Width
    $height = [double]$rect.Height
  }

  $children = @()
  if ($depth -lt $maxDepth -and $script:nodeCount -lt $maxNodes) {
    try { $child = $walker.GetFirstChild($element) } catch { $child = $null }
    $childCount = 0
    while ($null -ne $child -and $childCount -lt $maxChildren -and $script:nodeCount -lt $maxNodes) {
      $children += ,(Convert-Node $child ($depth + 1))
      $childCount += 1
      try { $child = $walker.GetNextSibling($child) } catch { $child = $null }
    }
  }

  return [PSCustomObject]@{
    type = "UIA$typeName"
    attrs = $attrs
    bounds = [PSCustomObject]@{
      left = $left
      top = $top
      width = $width
      height = $height
    }
    children = $children
  }
}

$tree = Convert-Node $root 0
$detachedNativeChildren = @()
foreach ($descendantHandle in [MidsceneNativeWindowEnumerator]::GetDescendantWindows([IntPtr]$windowHandle)) {
  if ($script:nodeCount -ge $maxNodes) { break }
  $handleKey = [string][Int64]$descendantHandle
  if ($script:seenNativeWindowHandles.ContainsKey($handleKey)) { continue }
  try {
    $descendant = [System.Windows.Automation.AutomationElement]::FromHandle($descendantHandle)
  } catch {
    $descendant = $null
  }
  if ($null -eq $descendant) { continue }
  $detachedNativeChildren += ,(Convert-Node $descendant 1)
}
if ($detachedNativeChildren.Count -gt 0) {
  $tree.children = @($tree.children) + @($detachedNativeChildren)
}
[Console]::Out.Write((ConvertTo-Json -InputObject $tree -Depth 50 -Compress))
`.trim();
}

export function windowsAccessibilityJsonToUiNode(json: string): UiNode {
  return accessibilityJsonToUiNode(json, {
    defaultType: 'UIAElement',
    errorPrefix: 'windowsAccessibilityJsonToUiNode',
  });
}

export async function readWindowsAccessibilityTree(
  options: WindowsAccessibilityTreeOptions,
): Promise<UiNode> {
  if (process.platform !== 'win32') {
    throw new Error(
      'readWindowsAccessibilityTree is only supported on Windows',
    );
  }

  const stdout = await runPowershellAsync(
    buildWindowsAccessibilityTreeScript(options),
    {
      timeout: WINDOWS_ACCESSIBILITY_TIMEOUT_MS,
      maxBuffer: WINDOWS_ACCESSIBILITY_MAX_BUFFER,
    },
  );
  if (!stdout.trim()) {
    throw new Error(
      'readWindowsAccessibilityTree: PowerShell returned no accessibility data',
    );
  }
  return windowsAccessibilityJsonToUiNode(stdout);
}
