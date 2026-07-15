import { ScreenshotItem } from '@/screenshot-item';
import type { Rect, Size } from '@/types';
import {
  combineImagesHorizontally,
  cropByRect,
  imageInfoOfBase64,
  resizeImgBase64,
} from '@midscene/shared/img';

const MIN_CROP_WIDTH = 1400;
const MIN_CROP_HEIGHT = 800;
const MAX_PANEL_WIDTH = 640;
const MAX_PANEL_HEIGHT = 448;
const COMPARISON_GAP = 8;

export interface FocusedComparisonScreenshot {
  screenshot: ScreenshotItem;
  cropRect: Rect;
  comparisonImageSize: Size;
}

function isValidRect(rect: Rect): boolean {
  return (
    [rect.left, rect.top, rect.width, rect.height].every((value) =>
      Number.isFinite(value),
    ) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function targetPositionWithinCrop(targetCenter: number, imageSize: number) {
  const relativePosition = targetCenter / imageSize;
  if (relativePosition < 0.4) {
    return 0.25;
  }
  if (relativePosition > 0.6) {
    return 0.75;
  }
  return 0.5;
}

export function calculateCacheActionVerificationCrop(
  imageSize: Size,
  targetRect: Rect,
): Rect {
  if (
    imageSize.width <= 0 ||
    imageSize.height <= 0 ||
    !isValidRect(targetRect)
  ) {
    throw new Error('Cannot calculate verification crop from invalid geometry');
  }

  const width = Math.min(
    imageSize.width,
    Math.max(MIN_CROP_WIDTH, targetRect.width * 8),
  );
  const height = Math.min(
    imageSize.height,
    Math.max(MIN_CROP_HEIGHT, targetRect.height * 10),
  );
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const targetXRatio = targetPositionWithinCrop(targetCenterX, imageSize.width);
  const targetYRatio = targetPositionWithinCrop(
    targetCenterY,
    imageSize.height,
  );

  return {
    left: Math.round(
      clamp(targetCenterX - width * targetXRatio, 0, imageSize.width - width),
    ),
    top: Math.round(
      clamp(
        targetCenterY - height * targetYRatio,
        0,
        imageSize.height - height,
      ),
    ),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function fitWithin(size: Size, bounds: Size): Size {
  const scale = Math.min(
    bounds.width / size.width,
    bounds.height / size.height,
    1,
  );
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

export async function createFocusedComparisonScreenshot(
  beforeScreenshot: ScreenshotItem,
  afterScreenshot: ScreenshotItem,
  targetRect: Rect,
): Promise<FocusedComparisonScreenshot> {
  const [beforeSize, afterSize] = await Promise.all([
    imageInfoOfBase64(beforeScreenshot.base64),
    imageInfoOfBase64(afterScreenshot.base64),
  ]);
  if (
    beforeSize.width !== afterSize.width ||
    beforeSize.height !== afterSize.height
  ) {
    throw new Error(
      `Before and after screenshot sizes differ: ${beforeSize.width}x${beforeSize.height} and ${afterSize.width}x${afterSize.height}`,
    );
  }

  const cropRect = calculateCacheActionVerificationCrop(beforeSize, targetRect);
  const panelSize = fitWithin(cropRect, {
    width: MAX_PANEL_WIDTH,
    height: MAX_PANEL_HEIGHT,
  });
  const [beforeCrop, afterCrop] = await Promise.all([
    cropByRect(beforeScreenshot.base64, cropRect),
    cropByRect(afterScreenshot.base64, cropRect),
  ]);
  const [beforePanel, afterPanel] = await Promise.all([
    resizeImgBase64(beforeCrop.imageBase64, panelSize),
    resizeImgBase64(afterCrop.imageBase64, panelSize),
  ]);
  const comparison = await combineImagesHorizontally(
    beforePanel,
    afterPanel,
    COMPARISON_GAP,
  );

  return {
    screenshot: ScreenshotItem.create(
      comparison.imageBase64,
      afterScreenshot.capturedAt,
    ),
    cropRect,
    comparisonImageSize: {
      width: comparison.width,
      height: comparison.height,
    },
  };
}
