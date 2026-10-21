import { commonContextParser } from '@/agent/utils';
import type { AbstractInterface } from '@/device';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

rs.mock('@midscene/shared/img', () => ({
  createImgBase64ByFormat: rs.fn(),
  imageInfoOfBase64: rs.fn(),
  resizeBase64ImageToJpeg: rs
    .fn()
    .mockResolvedValue('data:image/jpeg;base64,mock-resized-base64-data'),
}));

import {
  imageInfoOfBase64,
  resizeBase64ImageToJpeg,
} from '@midscene/shared/img';

const mockScreenshotBase64 = 'data:image/png;base64,mock-base64-data';
const mockedImageInfo = rs.mocked(imageInfoOfBase64);
const mockedResizeToJpeg = rs.mocked(resizeBase64ImageToJpeg);

function createMockInterface(
  logicalWidth: number,
  logicalHeight: number,
): AbstractInterface {
  return {
    screenshotBase64: rs.fn().mockResolvedValue(mockScreenshotBase64),
    size: rs
      .fn()
      .mockResolvedValue({ width: logicalWidth, height: logicalHeight }),
    actionSpace: rs.fn(() => []),
    describe: rs.fn(() => ''),
  } as unknown as AbstractInterface;
}

describe('commonContextParser screenshotShrinkFactor', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  it('converts PNG screenshots to JPEG quality 90 when not shrinking', async () => {
    const mockInterface = createMockInterface(800, 400);
    mockedImageInfo.mockResolvedValue({ width: 2400, height: 1200 });
    mockedResizeToJpeg.mockResolvedValue('data:image/jpeg;base64,jpeg-image');

    const result = await commonContextParser(mockInterface, {});

    expect(mockedResizeToJpeg).toHaveBeenCalledWith(mockScreenshotBase64, {
      sourceSize: { width: 2400, height: 1200 },
      targetSize: { width: 2400, height: 1200 },
      jpegQuality: 90,
    });
    expect(result.screenshot.base64).toBe('data:image/jpeg;base64,jpeg-image');
  });

  it('does not shrink when screenshotShrinkFactor is not provided', async () => {
    const mockInterface = createMockInterface(800, 400);
    mockedImageInfo.mockResolvedValue({ width: 2400, height: 1200 });

    const result = await commonContextParser(mockInterface, {});

    expect(mockedResizeToJpeg).toHaveBeenCalledWith(mockScreenshotBase64, {
      sourceSize: { width: 2400, height: 1200 },
      targetSize: { width: 2400, height: 1200 },
      jpegQuality: 90,
    });
    expect(result.shotSize).toEqual({ width: 2400, height: 1200 });
  });

  it('uses screenshotShrinkFactor when configured', async () => {
    const mockInterface = createMockInterface(800, 400);
    mockedImageInfo.mockResolvedValue({ width: 2400, height: 1200 });

    const result = await commonContextParser(mockInterface, {
      screenshotShrinkFactor: 2,
    });

    expect(mockedResizeToJpeg).toHaveBeenCalledWith(mockScreenshotBase64, {
      sourceSize: { width: 2400, height: 1200 },
      targetSize: { width: 1200, height: 600 },
      jpegQuality: 90,
    });
    expect(result.shotSize).toEqual({ width: 1200, height: 600 });
  });

  it('should handle dpr=1 (logical equals physical) with screenshotShrinkFactor', async () => {
    // Simulates HarmonyOS where size() returns physical dimensions (dpr=1)
    const mockInterface = createMockInterface(1216, 2688);
    mockedImageInfo.mockResolvedValue({ width: 1216, height: 2688 });

    const result = await commonContextParser(mockInterface, {
      screenshotShrinkFactor: 2,
    });

    expect(mockedResizeToJpeg).toHaveBeenCalledWith(mockScreenshotBase64, {
      sourceSize: { width: 1216, height: 2688 },
      targetSize: { width: 608, height: 1344 },
      jpegQuality: 90,
    });
    expect(result.shotSize).toEqual({ width: 608, height: 1344 });
    // dpr=1, shrunkShotToLogicalRatio = 1/2 = 0.5
    // AI coord 304 (middle of 608) -> logical 304/0.5 = 608 (middle of 1216) ✓
    expect(result.shrunkShotToLogicalRatio).toBeCloseTo(0.5, 5);
  });

  it('should handle dpr=1 (logical equals physical) without screenshotShrinkFactor', async () => {
    // Simulates HarmonyOS default: no shrinking, dpr=1
    const mockInterface = createMockInterface(1216, 2688);
    mockedImageInfo.mockResolvedValue({ width: 1216, height: 2688 });

    const result = await commonContextParser(mockInterface, {});

    expect(mockedResizeToJpeg).toHaveBeenCalledWith(mockScreenshotBase64, {
      sourceSize: { width: 1216, height: 2688 },
      targetSize: { width: 1216, height: 2688 },
      jpegQuality: 90,
    });
    expect(result.shotSize).toEqual({ width: 1216, height: 2688 });
    expect(result.shrunkShotToLogicalRatio).toBeCloseTo(1, 5);
  });
});
