/**
 * Switch a fresh Windows PowerShell pipeline to Per-Monitor V2 DPI awareness.
 *
 * PowerShell 5.1 starts DPI-unaware, so WinForms virtualizes Screen.Bounds and
 * Cursor.Position while Graphics.CopyFromScreen still reads physical pixels.
 * That combination crops screenshots and scales pointer coordinates twice.
 * Reflection.Emit declares the one required Win32 call in memory and avoids a
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
$midsceneNativeMethods = $midsceneType.CreateType()
$midscenePerMonitorV2 = [System.IntPtr](-4)
$midscenePreviousDpiContext =
  $midsceneNativeMethods::SetThreadDpiAwarenessContext($midscenePerMonitorV2)
if ($midscenePreviousDpiContext -eq [System.IntPtr]::Zero) {
  throw 'Unable to enter the Per-Monitor V2 DPI awareness context.'
}
`.trim();
