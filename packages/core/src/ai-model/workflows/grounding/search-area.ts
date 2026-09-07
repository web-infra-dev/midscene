import type { Rect, Size, UIContext } from '@/types';
import { cropByRect, scaleImage } from '@midscene/shared/img';
import type { PixelLocateResult } from '../../shared/model-locate-result';
import type { SearchAreaConfig } from './types';

/** Merge target and reference regions for DeepLocate; point-only results cover one pixel. */
export function mergeSearchAreaResults(
  target: PixelLocateResult,
  references: PixelLocateResult[] = [],
): Rect {
  const bounds = [target, ...references].map(({ rect, center }) => {
    const left = rect?.left ?? Math.round(center[0]);
    const top = rect?.top ?? Math.round(center[1]);
    return {
      left,
      top,
      right: left + (rect?.width ?? 1),
      bottom: top + (rect?.height ?? 1),
    };
  });
  const left = Math.min(...bounds.map((bound) => bound.left));
  const top = Math.min(...bounds.map((bound) => bound.top));
  const right = Math.max(...bounds.map((bound) => bound.right));
  const bottom = Math.max(...bounds.map((bound) => bound.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Expand the search region toward a minimum area of 160,000 square pixels.
 *
 * Step 1: Extend 100px on each side (top, right, bottom, left)
 * - If the element is near a boundary, expansion on that side will be limited
 * - No compensation is made for boundary limitations (this is intentional)
 *
 * Step 2: Scale proportionally toward the minimum area.
 * - Scale up proportionally from the center if needed
 * - Clamping to screen boundaries may leave the final area below this target.
 */
export function expandSearchArea(rect: Rect, screenSize: Size): Rect {
  const minArea = 400 * 400;
  const expandSize = 100;

  // Step 1: Extend each side by expandSize (100px), clamped to screen boundaries
  // Note: If element is near boundary, actual expansion may be less than 100px on that side
  const expandedLeft = Math.max(rect.left - expandSize, 0);
  const expandedTop = Math.max(rect.top - expandSize, 0);

  const expandRect = {
    left: expandedLeft,
    top: expandedTop,
    width: Math.min(
      rect.left - expandedLeft + rect.width + expandSize,
      screenSize.width - expandedLeft,
    ),
    height: Math.min(
      rect.top - expandedTop + rect.height + expandSize,
      screenSize.height - expandedTop,
    ),
  };

  // Step 2: Check if area is already >= 400x400
  const currentArea = expandRect.width * expandRect.height;

  if (currentArea >= minArea) {
    return expandRect;
  }

  // Step 2: Scale up from center to reach minimum 400x400 area
  const centerX = expandRect.left + expandRect.width / 2;
  const centerY = expandRect.top + expandRect.height / 2;

  // Calculate scale factor needed to reach minimum area
  const scaleFactor = Math.sqrt(minArea / currentArea);
  const newWidth = Math.round(expandRect.width * scaleFactor);
  const newHeight = Math.round(expandRect.height * scaleFactor);

  // Calculate new position based on center point
  const newLeft = Math.round(centerX - newWidth / 2);
  const newTop = Math.round(centerY - newHeight / 2);

  // Clamp to screen boundaries
  const left = Math.max(newLeft, 0);
  const top = Math.max(newTop, 0);

  return {
    left,
    top,
    width: Math.min(newWidth, screenSize.width - left),
    height: Math.min(newHeight, screenSize.height - top),
  };
}

export async function buildSearchAreaConfig(options: {
  context: UIContext;
  baseRect: Rect;
}): Promise<SearchAreaConfig> {
  const { context, baseRect } = options;
  const scaleRatio = 2;
  const sectionRect = expandSearchArea(baseRect, context.shotSize);

  const croppedResult = await cropByRect(
    context.screenshot.base64,
    sectionRect,
  );

  const scaledResult = await scaleImage(croppedResult.imageBase64, scaleRatio);
  return {
    sourceRect: sectionRect,
    image: {
      imageBase64: scaledResult.imageBase64,
      width: scaledResult.width,
      height: scaledResult.height,
    },
    mapping: {
      offset: {
        x: sectionRect.left,
        y: sectionRect.top,
      },
      scale: scaleRatio,
    },
  };
}
