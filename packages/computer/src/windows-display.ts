import type { Size } from '@midscene/core';
import {
  runWindowsPhysicalPixelPowershell,
  runWindowsPowershell,
} from './windows-dpi';

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

export interface WindowsDisplayDiscovery {
  coordinateMode: 'physical' | 'legacy';
  geometries: WindowsDisplayGeometry[];
}

interface WindowsDisplayEnumerationRunners {
  physical: (script: string) => string;
  legacy: (script: string) => string;
}

export type WindowsCoordinateContext =
  | { mode: 'physical' }
  | { mode: 'legacy'; systemDpi: number };

class WindowsDisplayEnumerationEmptyError extends Error {}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isWindowsDisplayGeometry(
  value: unknown,
): value is WindowsDisplayGeometry {
  if (!value || typeof value !== 'object') return false;
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

function readWindowsDisplayGeometriesWith(
  runPowershell: (script: string) => string,
  context: 'physical' | 'legacy',
): WindowsDisplayGeometry[] {
  const serializeScreens =
    context === 'legacy'
      ? 'ConvertTo-Json -InputObject $screens -Compress'
      : '[Console]::Out.Write((ConvertTo-Json -InputObject $screens -Compress))';
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
${serializeScreens}
`.trim();
  const output = runPowershell(script).trim();
  if (!output) {
    throw new WindowsDisplayEnumerationEmptyError(
      `Windows ${context} display enumeration returned no data`,
    );
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
    throw new WindowsDisplayEnumerationEmptyError(
      `Windows ${context} display enumeration returned no displays`,
    );
  }
  return displays;
}

export function readWindowsDisplayGeometries(): WindowsDisplayGeometry[] {
  return readWindowsDisplayGeometriesWith(
    runWindowsPhysicalPixelPowershell,
    'physical',
  );
}

export function discoverWindowsDisplays(
  runners: WindowsDisplayEnumerationRunners = {
    physical: runWindowsPhysicalPixelPowershell,
    legacy: runWindowsPowershell,
  },
): WindowsDisplayDiscovery {
  try {
    return {
      geometries: readWindowsDisplayGeometriesWith(
        runners.physical,
        'physical',
      ),
      coordinateMode: 'physical',
    };
  } catch (error) {
    if (!(error instanceof WindowsDisplayEnumerationEmptyError)) {
      throw error;
    }
    const geometries = readWindowsDisplayGeometriesWith(
      runners.legacy,
      'legacy',
    );
    return { geometries, coordinateMode: 'legacy' };
  }
}

export function readPhysicalWindowsSystemDpi(): number {
  const output = runWindowsPhysicalPixelPowershell(
    '[Console]::Out.Write($midsceneNativeMethods::GetDpiForSystem())',
  ).trim();
  const dpi = Number(output);
  if (!Number.isFinite(dpi) || dpi <= 0) {
    throw new Error(`Windows returned an invalid system DPI value: ${output}`);
  }
  return dpi;
}

function readPngDimensions(dataUri: string): Size {
  const prefix = 'data:image/png;base64,';
  if (!dataUri.startsWith(prefix)) {
    throw new Error('Screenshot is not a PNG data URI');
  }
  const buffer = Buffer.from(dataUri.slice(prefix.length), 'base64');
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    buffer.length < 24 ||
    !buffer.subarray(0, pngSignature.length).equals(pngSignature)
  ) {
    throw new Error('Screenshot returned invalid PNG data');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width <= 0 || height <= 0) {
    throw new Error('Screenshot returned invalid PNG dimensions');
  }
  return { width, height };
}

export function assertLegacyWindowsCoordinateCompatibility({
  geometry,
  systemDpi,
  screenshotBase64,
  inputSize,
}: {
  geometry:
    | {
        primary: boolean;
        bounds: WindowsDisplayGeometry['bounds'];
      }
    | undefined;
  systemDpi: number;
  screenshotBase64: string;
  inputSize: Size;
}): void {
  if (!geometry?.primary) {
    throw new Error(
      'Windows legacy coordinate compatibility mode only supports the primary display',
    );
  }
  if (geometry.bounds.x !== 0 || geometry.bounds.y !== 0) {
    throw new Error(
      `Windows legacy coordinate compatibility mode requires a primary display origin of (0, 0), got (${geometry.bounds.x}, ${geometry.bounds.y})`,
    );
  }
  if (systemDpi !== 96) {
    throw new Error(
      `Windows legacy coordinate compatibility mode requires 100% display scaling (96 DPI), got ${systemDpi} DPI`,
    );
  }

  const screenshotSize = readPngDimensions(screenshotBase64);
  const displaySize = {
    width: Math.round(geometry.bounds.width),
    height: Math.round(geometry.bounds.height),
  };
  const sizesMatch =
    screenshotSize.width === displaySize.width &&
    screenshotSize.height === displaySize.height &&
    inputSize.width === displaySize.width &&
    inputSize.height === displaySize.height;
  if (!sizesMatch) {
    throw new Error(
      `Windows legacy coordinate compatibility check failed: display=${displaySize.width}x${displaySize.height}, screenshot=${screenshotSize.width}x${screenshotSize.height}, input=${inputSize.width}x${inputSize.height}. Refusing to continue because clicks may use incorrect coordinates.`,
    );
  }
}

export function resolveWindowsDisplayGeometryFromList(
  displayId: string | undefined,
  displays: WindowsDisplayGeometry[],
): WindowsDisplayGeometry | undefined {
  if (!displays.length) return undefined;
  if (displayId === undefined || displayId === '') {
    return displays.find((display) => display.primary) || displays[0];
  }
  return displays.find((display) => display.id === displayId);
}
