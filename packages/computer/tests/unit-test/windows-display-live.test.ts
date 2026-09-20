import {
  type WindowsDisplayGeometry,
  discoverWindowsDisplays,
} from '@/windows-display';
import {
  runWindowsPhysicalPixelPowershell,
  runWindowsPowershell,
} from '@/windows-dpi';
import { describe, expect, it } from '@rstest/core';

const DISPLAY_ENUMERATION_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
$screens = @([System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
  $bounds = $_.Bounds
  [PSCustomObject]@{
    id = $_.DeviceName
    name = $_.DeviceName
    primary = $_.Primary
    bounds = [PSCustomObject]@{
      x = $bounds.X
      y = $bounds.Y
      width = $bounds.Width
      height = $bounds.Height
    }
  }
})
ConvertTo-Json -InputObject $screens -Compress
`.trim();

function parseDisplays(output: string): WindowsDisplayGeometry[] {
  if (!output.trim()) return [];
  const parsed: unknown = JSON.parse(output);
  expect(Array.isArray(parsed)).toBe(true);
  return parsed as WindowsDisplayGeometry[];
}

describe.skipIf(process.platform !== 'win32')(
  'Windows display enumeration live diagnostics',
  () => {
    it('compares the plain and Per-Monitor V2 PowerShell contexts', () => {
      const legacyDisplays = parseDisplays(
        runWindowsPowershell(DISPLAY_ENUMERATION_SCRIPT),
      );
      const physicalDisplays = parseDisplays(
        runWindowsPhysicalPixelPowershell(DISPLAY_ENUMERATION_SCRIPT),
      );
      const discovery = discoverWindowsDisplays();

      console.info(
        '[Windows display enumeration diagnostics]',
        JSON.stringify({
          legacyDisplayCount: legacyDisplays.length,
          physicalDisplayCount: physicalDisplays.length,
          selectedCoordinateMode: discovery.coordinateMode,
          legacyDisplays,
          physicalDisplays,
        }),
      );

      expect(legacyDisplays.length).toBeGreaterThan(0);
      expect(discovery.geometries.length).toBeGreaterThan(0);
      expect(discovery.coordinateMode).toBe(
        physicalDisplays.length === 0 ? 'legacy' : 'physical',
      );
    });
  },
);
