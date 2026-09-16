import type { DisplayInfo, DisplayRotation } from '../types';

/**
 * Pure parsers for the shell output that describes displays.
 *
 * Kept free of process/transport concerns so they can be unit tested against
 * captured device output (see `tests/unit-test/fixtures/dumpsys-display.txt`,
 * captured from a 2560x1600 Android 12 emulator that also hosts a scrcpy
 * virtual display).
 */

export interface RawDisplayDeviceInfo {
  name: string;
  uniqueId?: string;
  width: number;
  height: number;
  density?: number;
  rotation: DisplayRotation;
  type?: string;
  state?: string;
  hasDefaultFlag: boolean;
}

export interface RawDisplayInfo {
  name: string;
  id: number;
  width: number;
  height: number;
  density?: number;
  rotation: DisplayRotation;
  type?: string;
  state?: string;
  uniqueId?: string;
}

export interface RawViewport {
  displayId: number;
  type: string;
  uniqueId?: string;
  isActive: boolean;
}

export interface Rect {
  width: number;
  height: number;
}

export interface WmSize {
  physical?: Rect;
  override?: Rect;
}

export interface WmDensity {
  physical?: number;
  override?: number;
}

function toRotation(value: number): DisplayRotation {
  if (value === 90 || value === 180 || value === 270) {
    return value;
  }

  return 0;
}

function firstMatch(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern);
  return match?.[1]?.trim();
}

function firstNumber(text: string, pattern: RegExp): number | undefined {
  const raw = firstMatch(text, pattern);
  if (raw === undefined) {
    return undefined;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : undefined;
}

/** Parse every `DisplayDeviceInfo{...}` block. */
export function parseDisplayDeviceInfos(
  dumpsysDisplay: string,
): RawDisplayDeviceInfo[] {
  const entries: RawDisplayDeviceInfo[] = [];
  const pattern = /DisplayDeviceInfo\{([^\n]*)\}/g;
  let match = pattern.exec(dumpsysDisplay);

  while (match) {
    const body = match[1] ?? '';
    const name = firstMatch(body, /^\s*"([^"]*)"/);
    const size = body.match(/(\d+)\s*x\s*(\d+)/);

    if (name !== undefined && size) {
      entries.push({
        name,
        uniqueId: firstMatch(body, /uniqueId="([^"]*)"/),
        width: Number.parseInt(size[1] as string, 10),
        height: Number.parseInt(size[2] as string, 10),
        density: firstNumber(body, /density\s+(\d+)/),
        rotation: toRotation(firstNumber(body, /rotation\s+(\d+)/) ?? 0),
        type: firstMatch(body, /type\s+([A-Z_]+)/),
        state: firstMatch(body, /state\s+([A-Z]+)/),
        hasDefaultFlag: /FLAG_DEFAULT_DISPLAY/.test(body),
      });
    }

    match = pattern.exec(dumpsysDisplay);
  }

  return entries;
}

/**
 * Parse every `mBaseDisplayInfo=DisplayInfo{...}` block. This is where the
 * numeric display id lives; the dump prints it as `displayId 0"` (note the
 * stray quote), so the pattern tolerates an optional trailing quote.
 */
export function parseDisplayInfos(dumpsysDisplay: string): RawDisplayInfo[] {
  const entries: RawDisplayInfo[] = [];
  const pattern = /mBaseDisplayInfo=DisplayInfo\{([^\n]*)\}/g;
  let match = pattern.exec(dumpsysDisplay);

  while (match) {
    const body = match[1] ?? '';
    const name = firstMatch(body, /^\s*"([^"]*)"/);
    const id = firstNumber(body, /displayId\s+(\d+)/);
    const realSize = firstMatch(body, /real\s+(\d+\s*x\s*\d+)/);

    if (name !== undefined && id !== undefined && realSize) {
      const [width, height] = realSize
        .split('x')
        .map((part) => Number.parseInt(part.trim(), 10));

      if (Number.isFinite(width) && Number.isFinite(height)) {
        entries.push({
          name,
          id,
          width: width as number,
          height: height as number,
          density: firstNumber(body, /density\s+(\d+)/),
          rotation: toRotation(firstNumber(body, /rotation\s+(\d+)/) ?? 0),
          type: firstMatch(body, /type\s+([A-Z_]+)/),
          state: firstMatch(body, /state\s+([A-Z]+)/),
          uniqueId: firstMatch(body, /uniqueId\s+"([^"]*)"/),
        });
      }
    }

    match = pattern.exec(dumpsysDisplay);
  }

  return entries;
}

/** Parse `mViewports=[DisplayViewport{...}]` — authoritative displayId list. */
export function parseViewports(dumpsysDisplay: string): RawViewport[] {
  const entries: RawViewport[] = [];
  const pattern = /DisplayViewport\{([^}]*)\}/g;
  let match = pattern.exec(dumpsysDisplay);

  while (match) {
    const body = match[1] ?? '';
    const displayId = firstNumber(body, /displayId=(\d+)/);
    const type = firstMatch(body, /type=([A-Z_]+)/);

    if (displayId !== undefined && type !== undefined) {
      entries.push({
        displayId,
        type,
        uniqueId: firstMatch(body, /uniqueId='([^']*)'/),
        isActive: /isActive=true/.test(body),
      });
    }

    match = pattern.exec(dumpsysDisplay);
  }

  return entries;
}

/** Parse `wm size` (`Physical size: WxH`, `Override size: WxH`). */
export function parseWmSize(text: string): WmSize {
  const parseRect = (value: string | undefined): Rect | undefined => {
    if (!value) {
      return undefined;
    }

    const match = value.match(/(\d+)\s*x\s*(\d+)/);
    if (!match) {
      return undefined;
    }

    return {
      width: Number.parseInt(match[1] as string, 10),
      height: Number.parseInt(match[2] as string, 10),
    };
  };

  return {
    physical: parseRect(firstMatch(text, /Physical size:\s*([^\n]*)/)),
    override: parseRect(firstMatch(text, /Override size:\s*([^\n]*)/)),
  };
}

/** Parse `wm density` (`Physical density: N`, `Override density: N`). */
export function parseWmDensity(text: string): WmDensity {
  return {
    physical: firstNumber(text, /Physical density:\s*(\d+)/),
    override: firstNumber(text, /Override density:\s*(\d+)/),
  };
}

export interface CombineDisplayInput {
  dumpsysDisplay: string;
  wmSize?: string;
  wmDensity?: string;
}

function resolveDisplayId(
  device: RawDisplayDeviceInfo,
  index: number,
  displayInfos: RawDisplayInfo[],
  viewports: RawViewport[],
): number | undefined {
  const byName = displayInfos.find((info) => info.name === device.name);
  if (byName) {
    return byName.id;
  }

  if (device.uniqueId) {
    const byUniqueId = viewports.find(
      (viewport) => viewport.uniqueId === device.uniqueId,
    );
    if (byUniqueId) {
      return byUniqueId.displayId;
    }
  }

  return viewports[index]?.displayId;
}

/**
 * Merge `dumpsys display`, `wm size` and `wm density` into the public
 * {@link DisplayInfo} shape.
 *
 * `width`/`height` are the device-pixel dimensions exactly as the device
 * reports them for the current rotation — they are deliberately NOT swapped
 * here. Rotation-aware coordinate conversion belongs to the device layer, and
 * the rotated orientation still has to be validated on a real rotated display.
 */
export function parseDisplays(input: CombineDisplayInput): DisplayInfo[] {
  const devices = parseDisplayDeviceInfos(input.dumpsysDisplay);
  const displayInfos = parseDisplayInfos(input.dumpsysDisplay);
  const viewports = parseViewports(input.dumpsysDisplay);
  const wmSize = input.wmSize ? parseWmSize(input.wmSize) : {};
  const wmDensity = input.wmDensity ? parseWmDensity(input.wmDensity) : {};

  const results: DisplayInfo[] = devices.map((device, index) => {
    const resolvedId = resolveDisplayId(device, index, displayInfos, viewports);
    const id = resolvedId ?? index;
    const info = displayInfos.find((candidate) => candidate.id === id);
    const viewport = viewports.find((candidate) => candidate.displayId === id);
    const type = device.type ?? info?.type ?? viewport?.type;
    const isDefault =
      device.hasDefaultFlag ||
      (id === 0 && (type === 'INTERNAL' || type === undefined));

    return {
      id,
      name: device.name,
      width: device.width,
      height: device.height,
      density:
        device.density ??
        info?.density ??
        wmDensity.override ??
        wmDensity.physical ??
        0,
      rotation: device.rotation,
      isDefault,
      isVirtual: type === 'VIRTUAL',
    };
  });

  if (results.length === 0) {
    // Older/newer Android builds do not always print DisplayDeviceInfo; fall
    // back to `wm size` so a single default display is still usable.
    const fallbackSize = wmSize.override ?? wmSize.physical;
    if (fallbackSize) {
      return [
        {
          id: 0,
          name: 'default',
          width: fallbackSize.width,
          height: fallbackSize.height,
          density: wmDensity.override ?? wmDensity.physical ?? 0,
          rotation: 0,
          isDefault: true,
          isVirtual: false,
        },
      ];
    }

    return [];
  }

  if (!results.some((display) => display.isDefault)) {
    const internal = results.find((display) => !display.isVirtual);
    if (internal) {
      internal.isDefault = true;
    }
  }

  return results.sort((a, b) => a.id - b.id);
}

export function findDisplay(
  displays: DisplayInfo[],
  displayId: number,
): DisplayInfo | undefined {
  return displays.find((display) => display.id === displayId);
}
