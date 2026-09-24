import { commonContextParser } from '@/agent/utils';
import type { AbstractInterface } from '@/device';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

import { imageInfoOfBase64 } from '@midscene/shared/img';
import sharp from 'sharp';
async function setScreenshot(
  device: AbstractInterface,
  size: { width: number; height: number },
) {
  const bytes = await sharp({
    create: { ...size, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  rs.mocked(device.screenshotBase64).mockResolvedValue(
    `data:image/png;base64,${bytes.toString('base64')}`,
  );
}

function createMockInterface(
  logicalWidth: number,
  logicalHeight: number,
): AbstractInterface {
  return {
    screenshotBase64: rs.fn(),
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

  it('preserves source PNG bytes until a consumer chooses an encoding', async () => {
    const mockInterface = createMockInterface(800, 400);
    await setScreenshot(mockInterface, { width: 2400, height: 1200 });

    const result = await commonContextParser(mockInterface, {});

    expect(await imageInfoOfBase64(result.screenshot.base64)).toEqual(
      result.shotSize,
    );
    expect(result.screenshot.base64).toBe(
      await mockInterface.screenshotBase64(),
    );
  });

  it('does not shrink when screenshotShrinkFactor is not provided', async () => {
    const mockInterface = createMockInterface(800, 400);
    await setScreenshot(mockInterface, { width: 2400, height: 1200 });

    const result = await commonContextParser(mockInterface, {});

    expect(await imageInfoOfBase64(result.screenshot.base64)).toEqual(
      result.shotSize,
    );
    expect(result.shotSize).toEqual({ width: 2400, height: 1200 });
  });

  it('uses screenshotShrinkFactor when configured', async () => {
    const mockInterface = createMockInterface(800, 400);
    await setScreenshot(mockInterface, { width: 2400, height: 1200 });

    const result = await commonContextParser(mockInterface, {
      screenshotShrinkFactor: 2,
    });

    expect(await imageInfoOfBase64(result.screenshot.base64)).toEqual({
      width: 2400,
      height: 1200,
    });
    expect(result.shotSize).toEqual({ width: 1200, height: 600 });
  });

  it('should handle dpr=1 (logical equals physical) with screenshotShrinkFactor', async () => {
    // Simulates HarmonyOS where size() returns physical dimensions (dpr=1)
    const mockInterface = createMockInterface(1216, 2688);
    await setScreenshot(mockInterface, { width: 1216, height: 2688 });

    const result = await commonContextParser(mockInterface, {
      screenshotShrinkFactor: 2,
    });

    expect(await imageInfoOfBase64(result.screenshot.base64)).toEqual({
      width: 1216,
      height: 2688,
    });
    expect(result.shotSize).toEqual({ width: 608, height: 1344 });
    // dpr=1, shrunkShotToLogicalRatio = 1/2 = 0.5
    // AI coord 304 (middle of 608) -> logical 304/0.5 = 608 (middle of 1216) ✓
    expect(result.shrunkShotToLogicalRatio).toBeCloseTo(0.5, 5);
  });

  it('should handle dpr=1 (logical equals physical) without screenshotShrinkFactor', async () => {
    // Simulates HarmonyOS default: no shrinking, dpr=1
    const mockInterface = createMockInterface(1216, 2688);
    await setScreenshot(mockInterface, { width: 1216, height: 2688 });

    const result = await commonContextParser(mockInterface, {});

    expect(await imageInfoOfBase64(result.screenshot.base64)).toEqual(
      result.shotSize,
    );
    expect(result.shotSize).toEqual({ width: 1216, height: 2688 });
    expect(result.shrunkShotToLogicalRatio).toBeCloseTo(1, 5);
  });
});
