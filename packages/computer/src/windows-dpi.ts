import { execFileSync } from 'node:child_process';

const POWERSHELL_TIMEOUT_MS = 15_000;
// CopyFromScreen output can be several MB once base64-encoded.
const POWERSHELL_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Switch a fresh Windows PowerShell pipeline to Per-Monitor V2 DPI awareness.
 *
 * PowerShell 5.1 starts DPI-unaware, so WinForms virtualizes Screen.Bounds and
 * Cursor.Position while Graphics.CopyFromScreen still reads physical pixels.
 * That combination crops screenshots and scales pointer coordinates twice.
 * Reflection.Emit declares the required Win32 calls in memory and avoids a
 * runtime C# compiler dependency from Add-Type -TypeDefinition.
 */
export const WINDOWS_PHYSICAL_PIXEL_POWERSHELL_PREAMBLE = `
$midsceneAssemblyName = New-Object System.Reflection.AssemblyName('MidsceneDpiNative')
$midsceneAssembly = [System.AppDomain]::CurrentDomain.DefineDynamicAssembly(
  $midsceneAssemblyName,
  [System.Reflection.Emit.AssemblyBuilderAccess]::Run
)
$midsceneModule = $midsceneAssembly.DefineDynamicModule('MidsceneDpiNativeModule')
$midsceneType = $midsceneModule.DefineType(
  'MidsceneDpiNative.User32',
  [System.Reflection.TypeAttributes]'Public, Class, Sealed, Abstract'
)
$midsceneMethodAttributes =
  [System.Reflection.MethodAttributes]::Public -bor
  [System.Reflection.MethodAttributes]::Static -bor
  [System.Reflection.MethodAttributes]::PinvokeImpl
$midsceneSetDpiMethod = $midsceneType.DefinePInvokeMethod(
  'SetThreadDpiAwarenessContext',
  'user32.dll',
  $midsceneMethodAttributes,
  [System.Reflection.CallingConventions]::Standard,
  [System.IntPtr],
  [System.Type[]]@([System.IntPtr]),
  [System.Runtime.InteropServices.CallingConvention]::Winapi,
  [System.Runtime.InteropServices.CharSet]::None
)
$midsceneSetDpiMethod.SetImplementationFlags(
  $midsceneSetDpiMethod.GetMethodImplementationFlags() -bor
  [System.Reflection.MethodImplAttributes]::PreserveSig
)
$midsceneGetForegroundWindowMethod = $midsceneType.DefinePInvokeMethod(
  'GetForegroundWindow',
  'user32.dll',
  $midsceneMethodAttributes,
  [System.Reflection.CallingConventions]::Standard,
  [System.IntPtr],
  [System.Type[]]@(),
  [System.Runtime.InteropServices.CallingConvention]::Winapi,
  [System.Runtime.InteropServices.CharSet]::None
)
$midsceneGetForegroundWindowMethod.SetImplementationFlags(
  $midsceneGetForegroundWindowMethod.GetMethodImplementationFlags() -bor
  [System.Reflection.MethodImplAttributes]::PreserveSig
)
$midsceneGetWindowRectMethod = $midsceneType.DefinePInvokeMethod(
  'GetWindowRect',
  'user32.dll',
  $midsceneMethodAttributes,
  [System.Reflection.CallingConventions]::Standard,
  [bool],
  [System.Type[]]@([System.IntPtr], [System.IntPtr]),
  [System.Runtime.InteropServices.CallingConvention]::Winapi,
  [System.Runtime.InteropServices.CharSet]::None
)
$midsceneGetWindowRectMethod.SetImplementationFlags(
  $midsceneGetWindowRectMethod.GetMethodImplementationFlags() -bor
  [System.Reflection.MethodImplAttributes]::PreserveSig
)
$midsceneNativeMethods = $midsceneType.CreateType()
$midscenePerMonitorV2 = [System.IntPtr](-4)
$midscenePreviousDpiContext =
  $midsceneNativeMethods::SetThreadDpiAwarenessContext($midscenePerMonitorV2)
if ($midscenePreviousDpiContext -eq [System.IntPtr]::Zero) {
  throw 'Unable to enter the Per-Monitor V2 DPI awareness context.'
}
`.trim();

/**
 * Execute Windows desktop geometry and pointer work in one physical-pixel
 * boundary. Callers supply only the operation body, so they cannot forget the
 * Per-Monitor V2 preamble when adding another coordinate-bearing Win32 API.
 */
export function runWindowsPhysicalPixelPowershell(script: string): string {
  const physicalPixelScript = `$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
${WINDOWS_PHYSICAL_PIXEL_POWERSHELL_PREAMBLE}
${script}`;
  const encoded = Buffer.from(physicalPixelScript, 'utf16le').toString(
    'base64',
  );
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    {
      encoding: 'utf8',
      timeout: POWERSHELL_TIMEOUT_MS,
      maxBuffer: POWERSHELL_MAX_BUFFER,
      windowsHide: true,
    },
  );
}
