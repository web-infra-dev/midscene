import { commonContextParser } from '@/agent/utils';
import type { AbstractInterface } from '@/device';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock imageInfoOfBase64 to control screenshot dimensions
vi.mock('@midscene/shared/img', () => ({
  imageInfoOfBase64: vi.fn(),
  resizeImgBase64: vi.fn().mockResolvedValue('mock-resized-base64-data'),
}));

import { imageInfoOfBase64 } from '@midscene/shared/img';

const mockedImageInfo = vi.mocked(imageInfoOfBase64);

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

describe('commonContextParser orientation mismatch detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should compute correct dpr when logical size and screenshot have same orientation (both portrait)', async () => {
    // Logical: 360x720 (portrait), Screenshot: 1080x2160 (portrait)
    // Expected dpr = 1080/360 = 3
    const mockInterface = createMockInterface(360, 720);
    mockedImageInfo.mockResolvedValue({ width: 1080, height: 2160 });

    const result = await commonContextParser(mockInterface, {});

    expect(result.deprecatedDpr).toBe(3);
    expect(result.shrunkShotToLogicalRatio).toBe(3);
    expect(result.shotSize).toEqual({ width: 1080, height: 2160 });
  });

  it('should compute correct dpr when logical size and screenshot have same orientation (both landscape)', async () => {
    // Logical: 720x360 (landscape), Screenshot: 2160x1080 (landscape)
    // Expected dpr = 2160/720 = 3
    const mockInterface = createMockInterface(720, 360);
    mockedImageInfo.mockResolvedValue({ width: 2160, height: 1080 });

    const result = await commonContextParser(mockInterface, {});

    expect(result.deprecatedDpr).toBe(3);
    expect(result.shrunkShotToLogicalRatio).toBe(3);
  });

  it('should swap logical dimensions when orientation mismatches (logical portrait but screenshot landscape)', async () => {
    // Bug scenario: OPPO device reports wrong orientation
    // size() returns portrait 359x717 but screenshot is landscape 1972x988
    // Without fix: dpr = 1972/359 = 5.49 (WRONG)
    // With fix: swap to 717x359, dpr = 1972/717 ≈ 2.75 (CORRECT)
    const mockInterface = createMockInterface(359, 717);
    mockedImageInfo.mockResolvedValue({ width: 1972, height: 988 });

    const result = await commonContextParser(mockInterface, {});

    // dpr should be calculated with swapped dimensions: 1972/717
    const expectedDpr = 1972 / 717;
    expect(result.deprecatedDpr).toBeCloseTo(expectedDpr, 5);
    expect(result.shrunkShotToLogicalRatio).toBeCloseTo(expectedDpr, 5);
  });

  it('should swap logical dimensions when orientation mismatches (logical landscape but screenshot portrait)', async () => {
    // Reverse scenario: size() returns landscape but screenshot is portrait
    const mockInterface = createMockInterface(717, 359);
    mockedImageInfo.mockResolvedValue({ width: 988, height: 1972 });

    const result = await commonContextParser(mockInterface, {});

    // dpr should be calculated with swapped dimensions: 988/359
    const expectedDpr = 988 / 359;
    expect(result.deprecatedDpr).toBeCloseTo(expectedDpr, 5);
  });

  it('should not swap dimensions for square screenshots', async () => {
    // Square screenshot should not trigger swap
    const mockInterface = createMockInterface(400, 400);
    mockedImageInfo.mockResolvedValue({ width: 1200, height: 1200 });

    const result = await commonContextParser(mockInterface, {});

    expect(result.deprecatedDpr).toBe(3);
  });

  it('should handle shrink factor correctly with orientation mismatch', async () => {
    // Orientation mismatch + shrink factor
    const mockInterface = createMockInterface(359, 717);
    mockedImageInfo.mockResolvedValue({ width: 1972, height: 988 });

    const result = await commonContextParser(mockInterface, {
      screenshotShrinkFactor: 2,
    });

    // dpr uses swapped logical width: 1972/717
    const expectedDpr = 1972 / 717;
    // shrunkShotToLogicalRatio = dpr / shrinkFactor
    expect(result.shrunkShotToLogicalRatio).toBeCloseTo(expectedDpr / 2, 5);
    // Shot size should be halved
    expect(result.shotSize).toEqual({ width: 986, height: 494 });
  });
});
