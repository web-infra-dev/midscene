const POINTER_REFERENCE_IMAGE_WIDTH = 1920;

export const POINTER_WIDTH = 44;
export const POINTER_HEIGHT = 56;
export const POINTER_HOTSPOT_X = 6;
export const POINTER_HOTSPOT_Y = 4;

export interface PointerLayout {
  scale: number;
  width: number;
  height: number;
  hotspotX: number;
  hotspotY: number;
  centerOffsetX: number;
  centerOffsetY: number;
}

export interface SpinnerLayout {
  size: number;
  centerOffset: number;
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
}

function buildPointerLayout(scale: number): PointerLayout {
  return {
    scale,
    width: POINTER_WIDTH * scale,
    height: POINTER_HEIGHT * scale,
    hotspotX: POINTER_HOTSPOT_X * scale,
    hotspotY: POINTER_HOTSPOT_Y * scale,
    centerOffsetX: (POINTER_WIDTH * scale) / 2,
    centerOffsetY: (POINTER_HEIGHT * scale) / 2,
  };
}

export function resolvePointerLayout(imageWidth: number): PointerLayout {
  assertPositiveFinite(imageWidth, 'imageWidth');

  return buildPointerLayout(
    Math.max(1, Math.sqrt(imageWidth / POINTER_REFERENCE_IMAGE_WIDTH)),
  );
}

export function resolveExportPointerLayout(
  imageWidth: number,
  contentWidth: number,
): PointerLayout {
  assertPositiveFinite(contentWidth, 'contentWidth');

  const liveLayout = resolvePointerLayout(imageWidth);
  return buildPointerLayout(liveLayout.scale * (contentWidth / imageWidth));
}

export function resolveSpinnerLayout(
  pointerLayout: PointerLayout,
): SpinnerLayout {
  const size = pointerLayout.height;
  return {
    size,
    centerOffset: size / 2,
  };
}
