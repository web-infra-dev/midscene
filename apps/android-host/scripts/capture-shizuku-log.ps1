<#
.SYNOPSIS
  Capture the host app's Shizuku / user-service log from a Windows PC.

.DESCRIPTION
  Reproduces the "shizuku user service shows missing even though the app is
  authorized" investigation in one run:

    1. force-stop the app so the next launch binds the user service cleanly
    2. clear logcat
    3. launch the console activity
    4. wait while you tap Provision in the app (interactive by default)
    5. dump logcat to files and print the relevant lines

  It writes two files into the output directory:
    * logcat-<stamp>-full.txt    everything (for anything the filter misses)
    * logcat-<stamp>-filtered.txt just the midscene / shizuku / binder lines

  Send the filtered file back; the full one only if asked.

.PARAMETER Serial
  Target device serial, e.g. from `adb devices`. Omit when exactly one device
  is connected.

.PARAMETER Mode
  Repro    (default) force-stop, relaunch, wait, then dump.
  Quick    Print device/app/Shizuku facts only, no log capture.

.PARAMETER Interactive
  Wait for you to press Enter before dumping, instead of a fixed sleep. Use this
  so you can tap Provision in the app at your own pace.

.PARAMETER SettleSeconds
  Fixed wait before dumping when -Interactive is not used. Default 20.

.EXAMPLE
  .\capture-shizuku-log.ps1 -Interactive
  .\capture-shizuku-log.ps1 -Serial 192.168.1.50:5555 -SettleSeconds 30
  .\capture-shizuku-log.ps1 -Mode Quick
#>
# AdbPath is read by Resolve-Adb, which the analyzer cannot follow.
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSReviewUnusedParameter', 'AdbPath')]
[CmdletBinding()]
param(
    [string]$AdbPath,
    [string]$Serial,
    [ValidateSet('Repro', 'Quick')]
    [string]$Mode = 'Repro',
    [switch]$Interactive,
    [int]$SettleSeconds = 20,
    [string]$Package = 'com.midscene.localagent',
    [string]$Activity = 'com.midscene.localagent/.ConsoleActivity',
    [string]$OutDir = (Join-Path (Get-Location) 'shizuku-logs'),
    [string]$CaptureFile
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Write-Note([string]$Text) {
    Write-Host "    $Text" -ForegroundColor DarkGray
}

function Resolve-Adb {
    if ($AdbPath) {
        if (-not (Test-Path -LiteralPath $AdbPath)) {
            throw "adb not found at -AdbPath '$AdbPath'."
        }
        return (Resolve-Path -LiteralPath $AdbPath).Path
    }

    $onPath = Get-Command adb -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }

    $roots = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT,
        (Join-Path $env:LOCALAPPDATA 'Android\Sdk')) |
        Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    foreach ($root in $roots) {
        $candidate = Join-Path $root 'platform-tools\adb.exe'
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }

    throw @'
adb was not found. Either put it on PATH, or pass its path explicitly:
    .\capture-shizuku-log.ps1 -AdbPath "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
'@
}

$Adb = Resolve-Adb

function Invoke-Adb {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$AdbArgs)

    $argv = @()
    if ($Serial) { $argv += @('-s', $Serial) }
    $argv += $AdbArgs

    # adb writes progress to stderr; keep it out of the pipeline's error stream.
    $output = & $Adb @argv 2>&1
    return ($output | Out-String).Trim()
}

function Write-Utf8NoBom([string]$Path, [string[]]$Lines) {
    # Windows PowerShell 5.1's `-Encoding UTF8` writes a BOM; write the bytes
    # explicitly so the file is plain UTF-8 everywhere.
    [System.IO.File]::WriteAllLines($Path, $Lines, (New-Object System.Text.UTF8Encoding($false)))
}

function Assert-Device {
    $devices = Invoke-Adb -AdbArgs @('devices')

    # `adb devices` separates serial and state with a tab, and every line worth
    # keeping ends in exactly `device` (not `offline` / `unauthorized`).
    $serials = @(
        $devices -split "`r?`n" |
            Where-Object { $_ -match "\tdevice$" } |
            ForEach-Object { ($_ -split '\s+')[0] }
    )

    if ($serials.Count -eq 0) {
        throw ("No device in 'device' state. adb said: $devices " +
            'Connect the device, accept the USB debugging prompt, then retry.')
    }

    if (-not $Serial) {
        if ($serials.Count -gt 1) {
            throw ("Several devices are connected: $($serials -join ', '). " +
                'Pass one with -Serial <id>.')
        }
        # @() above is what keeps this an array: a single match would otherwise
        # come back as a bare string and indexing it would yield a character.
        $script:Serial = $serials[0]
        Write-Note "using the only connected device: $script:Serial"
    } elseif ($serials -notcontains $Serial) {
        throw "Device '$Serial' is not in 'device' state. Connected: $($serials -join ', ')"
    }
}

function Get-Prop([string]$Name) {
    (Invoke-Adb -AdbArgs @('shell', 'getprop', $Name)) -replace "`r", ''
}

# ---------------------------------------------------------------------------
# Quick mode: facts only
# ---------------------------------------------------------------------------

Assert-Device

if ($Mode -eq 'Quick') {
    Write-Step 'Device'
    Write-Host "    model            : $(Get-Prop ro.product.model)"
    Write-Host "    android          : $(Get-Prop ro.build.version.release) (API $(Get-Prop ro.build.version.sdk))"
    Write-Host "    abi              : $(Get-Prop ro.product.cpu.abi)"

    Write-Step 'Shizuku'
    $shizukuPkg = Invoke-Adb -AdbArgs @('shell', 'pm list packages moe.shizuku.privileged.api')
    $shizukuInstalled = $shizukuPkg -match 'moe\.shizuku\.privileged\.api'
    Write-Host "    manager installed: $shizukuInstalled"

    # A running Shizuku server is visible as its own process.
    # `ps -A` exists on Android 8+; fall back for older/car ROMs that only have -ef.
    $psArgs = @('shell', 'ps -A 2>/dev/null | grep -i shizuku || ps -ef 2>/dev/null | grep -i shizuku')
    $shizukuProc = Invoke-Adb -AdbArgs $psArgs
    Write-Host "    server process   : $(if ($shizukuProc) { 'running' } else { 'NOT running' })"
    if ($shizukuProc) { $shizukuProc -split "`r?`n" | ForEach-Object { Write-Note $_ } }

    $granted = Invoke-Adb -AdbArgs @('shell', "dumpsys package $Package | grep -i API_V23")
    Write-Host "    permission line  : $(if ($granted) { $granted.Trim() } else { '(not found)' })"

    Write-Step 'Midscene host'
    $installed = Invoke-Adb -AdbArgs @('shell', "pm list packages $Package")
    Write-Host "    installed        : $($installed -match [regex]::Escape($Package))"
    Write-Host "    yadb on device   : $(if ((Invoke-Adb -AdbArgs @('shell', 'ls /data/local/tmp/yadb 2>/dev/null')) -match 'yadb') { 'present' } else { 'missing' })"
    Write-Host "    rish on device   : $(if ((Invoke-Adb -AdbArgs @('shell', 'ls /data/local/tmp/rish 2>/dev/null')) -match 'rish') { 'present (unused by this build)' } else { 'absent' })"

    Write-Host ''
    Write-Host 'Quick mode done. Run without -Mode Quick to capture a repro log.' -ForegroundColor Green
    return
}

# ---------------------------------------------------------------------------
# Repro mode
# ---------------------------------------------------------------------------

if (-not (Test-Path -LiteralPath $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

Write-Step 'Device'
Write-Host "    serial  : $Serial"
Write-Host "    model   : $(Get-Prop ro.product.model)"
Write-Host "    android : $(Get-Prop ro.build.version.release) (API $(Get-Prop ro.build.version.sdk))"

Write-Step "Force-stopping $Package"
Write-Note 'so the next launch performs a fresh user-service bind'
Invoke-Adb -AdbArgs @('shell', 'am force-stop', $Package) | Out-Null
Start-Sleep -Milliseconds 800

Write-Step 'Clearing logcat'
Invoke-Adb -AdbArgs @('logcat', '-c') | Out-Null

Write-Step 'Launching the console'
Invoke-Adb -AdbArgs @('shell', 'am start -n', $Activity) | Out-Null

if ($Interactive) {
    Write-Step 'Now do this in the app'
    Write-Host '    1. open Diagnostics' -ForegroundColor Yellow
    Write-Host '    2. tap Provision (and Authorize first, if it is not authorized yet)' -ForegroundColor Yellow
    Write-Host '    3. wait for the log line at the bottom of the Diagnostics card' -ForegroundColor Yellow
    Write-Host ''
    Read-Host '    Press Enter here once the app has finished its attempt'
} else {
    Write-Step "Waiting $SettleSeconds s"
    Write-Note 'tap Provision in the app now if you have not already'
    Start-Sleep -Seconds $SettleSeconds
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$fullPath = Join-Path $OutDir "logcat-$stamp-full.txt"
$filteredPath = Join-Path $OutDir "logcat-$stamp-filtered.txt"

Write-Step 'Dumping logcat'
$logLines = (Invoke-Adb -AdbArgs @('logcat', '-d', '-v', 'threadtime')) -split "`r?`n"
Write-Utf8NoBom -Path $fullPath -Lines $logLines
Write-Note "full log: $fullPath"

# The interesting lines: our own tags, Shizuku itself, and the binder/service
# machinery that fails silently when a user service cannot be started.
$pattern = 'midscene|shizuku|rikka|IExecService|bindUserService|UserService|unbind|' +
    'SecurityException|Unable to start service|Unable to bind|Binder|RemoteException|' +
    'Permission Denial|ActivityManager.*midscene'

$interesting = Select-String -LiteralPath $fullPath -Pattern $pattern
Write-Utf8NoBom -Path $filteredPath -Lines @($interesting | ForEach-Object { $_.Line })
Write-Note "filtered log: $filteredPath ($($interesting.Count) lines)"

function Write-Section([string]$Title, [string]$Filter) {
    $hits = $interesting | Where-Object { $_.Line -match $Filter }
    if (-not $hits) { return }
    Write-Host ''
    Write-Host "--- $Title ---" -ForegroundColor Yellow
    $hits | ForEach-Object { Write-Host $_.Line }
}

Write-Host ''
Write-Host '=== filtered highlights ===' -ForegroundColor Cyan
Write-Section 'Permission / authorization' 'permission|Permission|API_V23|grant'
Write-Section 'Binding' 'bind|Bind|ServiceConnection|UserService'
Write-Section 'App log' 'Midscene|midscene'
Write-Section 'Failures' 'SecurityException|Unable to|Denial|RemoteException|Error|error'

# yadb landing in /data/local/tmp is the symptom that started this
# investigation, so report it explicitly instead of leaving it to the log.
$yadb = Invoke-Adb -AdbArgs @('shell', 'ls -l /data/local/tmp/yadb 2>/dev/null')
Write-Host ''
Write-Host "yadb on device: $(if ($yadb -match 'yadb') { $yadb.Trim() } else { 'missing' })" -ForegroundColor Yellow

# The app also keeps its own service log; it survives what logcat rotates away.
# `run-as` only works on a debuggable build, hence the silent failure path.
$serviceLogPath = Join-Path $OutDir "service-log-$stamp.txt"
$serviceLines =
    (Invoke-Adb -AdbArgs @('shell', "run-as $Package cat files/run/agent.log 2>/dev/null")) -split "`r?`n"
if ($serviceLines -and $serviceLines[0]) {
    Write-Utf8NoBom -Path $serviceLogPath -Lines $serviceLines
    Write-Note "app service log: $serviceLogPath"
    Write-Host ''
    Write-Host '--- app service log (tail) ---' -ForegroundColor Yellow
    $serviceLines | Select-Object -Last 25 | ForEach-Object { Write-Host $_ }
} else {
    if ($CaptureFile) {
        Write-Utf8NoBom -Path $CaptureFile -Lines @('(no service log available)')
    }
    Write-Note 'app service log: not readable (run-as needs a debuggable build)'
}

Write-Host ''
Write-Host 'Done. Send back the filtered log (attach it to the chat).' -ForegroundColor Green
Write-Host "    $filteredPath"
