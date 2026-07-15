import { commonContextParser } from '@/agent/utils';
import type { AbstractInterface } from '@/device';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/shared/img', () => ({
  convertImgBufferToJpeg: vi.fn(),
  createImgBase64ByFormat: vi.fn(),
  imageInfoOfBase64: vi.fn(),
  parseBase64: vi.fn(),
  resizeImgBase64: vi.fn().mockResolvedValue('mock-resized-base64-data'),
}));

import {
  convertImgBufferToJpeg,
  createImgBase64ByFormat,
  imageInfoOfBase64,
  parseBase64,
  resizeImgBase64,
} from '@midscene/shared/img';

const mockedConvertToJpeg = vi.mocked(convertImgBufferToJpeg);
const mockedCreateBase64 = vi.mocked(createImgBase64ByFormat);
const mockedImageInfo = vi.mocked(imageInfoOfBase64);
const mockedParseBase64 = vi.mocked(parseBase64);
const mockedResizeImg = vi.mocked(resizeImgBase64);

function createMockInterface(
  logicalWidth: number,
  logicalHeight: number,
): AbstractInterface {
  return {
    screenshotBase64: vi.fn().mockResolvedValue('mock-base64-data'),
    size: vi
      .fn()
      .mockResolvedValue({ width: logicalWidth, height: logicalHeight }),
    actionSpace: vi.fn(() => []),
    describe: vi.fn(() => ''),
  } as unknown as AbstractInterface;
}

describe('commonContextParser screenshotShrinkFactor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedParseBase64.mockReturnValue({
      mimeType: 'image/jpeg',
      body: 'mock-base64-data',
    });
  });

  it('converts PNG screenshots to JPEG quality 90 when not shrinking', async () => {
    const mockInterface = createMockInterface(800, 400);
    const pngBody = Buffer.from('png-image').toString('base64');
    const jpegBuffer = Buffer.from('jpeg-image');
    mockedImageInfo.mockResolvedValue({ width: 2400, height: 1200 });
    mockedParseBase64.mockReturnValue({
      mimeType: 'image/png',
      body: pngBody,
    });
    mockedConvertToJpeg.mockResolvedValue(jpegBuffer);
    mockedCreateBase64.mockReturnValue('data:image/jpeg;base64,jpeg-image');

    const result = await commonContextParser(mockInterface, {});

    expect(mockedConvertToJpeg).toHaveBeenCalledWith(
      Buffer.from(pngBody, 'base64'),
      90,
    );
    expect(mockedCreateBase64).toHaveBeenCalledWith(
      'jpeg',
      jpegBuffer.toString('base64'),
    );
    expect(result.screenshot.base64).toBe('data:image/jpeg;base64,jpeg-image');
  });

  it('does not shrink when screenshotShrinkFactor is not provided', async () => {
    const mockInterface = createMockInterface(800, 400);
    mockedImageInfo.mockResolvedValue({ width: 2400, height: 1200 });

    const result = await commonContextParser(mockInterface, {});

    expect(mockedResizeImg).not.toHaveBeenCalled();
    expect(result.shotSize).toEqual({ width: 2400, height: 1200 });
  });

  it('uses screenshotShrinkFactor when configured', async () => {
    const mockInterface = createMockInterface(800, 400);
    mockedImageInfo.mockResolvedValue({ width: 2400, height: 1200 });

    const result = await commonContextParser(mockInterface, {
      screenshotShrinkFactor: 2,
    });

    expect(mockedResizeImg).toHaveBeenCalledWith('mock-base64-data', {
      width: 1200,
      height: 600,
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

    expect(mockedResizeImg).toHaveBeenCalledWith('mock-base64-data', {
      width: 608,
      height: 1344,
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

    expect(mockedResizeImg).not.toHaveBeenCalled();
    expect(result.shotSize).toEqual({ width: 1216, height: 2688 });
    expect(result.shrunkShotToLogicalRatio).toBeCloseTo(1, 5);
  });
});
