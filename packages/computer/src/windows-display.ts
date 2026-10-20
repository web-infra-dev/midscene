import { runWindowsPhysicalPixelPowershell } from './windows-dpi';

export interface WindowsDisplayGeometry {
  id: string;
  name: string;
  primary: boolean;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isWindowsDisplayGeometry(
  value: unknown,
): value is WindowsDisplayGeometry {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as WindowsDisplayGeometry;
  const bounds = candidate.bounds;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.name === 'string' &&
    typeof candidate.primary === 'boolean' &&
    !!bounds &&
    isFiniteNumber(bounds.x) &&
    isFiniteNumber(bounds.y) &&
    isFiniteNumber(bounds.width) &&
    isFiniteNumber(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}

export function readWindowsDisplayGeometries(): WindowsDisplayGeometry[] {
  const script = `
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
[Console]::Out.Write((ConvertTo-Json -InputObject $screens -Compress))
`.trim();
  const output = runWindowsPhysicalPixelPowershell(script).trim();
  if (!output) {
    throw new Error('Windows display enumeration returned no data');
  }

  const parsed: unknown = JSON.parse(output);
  if (!Array.isArray(parsed)) {
    throw new Error('Windows display enumeration returned invalid data');
  }
  const displays = parsed.filter(isWindowsDisplayGeometry);
  if (displays.length !== parsed.length) {
    throw new Error('Windows display enumeration returned invalid geometry');
  }
  if (displays.length === 0) {
    throw new Error('Windows display enumeration returned no displays');
  }
  return displays;
}

export function resolveWindowsDisplayGeometryFromList(
  displayId: string | undefined,
  displays: WindowsDisplayGeometry[],
): WindowsDisplayGeometry | undefined {
  if (!displays.length) {
    return undefined;
  }
  if (displayId === undefined || displayId === '') {
    return displays.find((display) => display.primary) || displays[0];
  }
  return displays.find((display) => display.id === displayId);
}
