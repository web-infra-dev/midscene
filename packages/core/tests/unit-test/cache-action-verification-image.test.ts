import {
  calculateCacheActionVerificationCrop,
  createFocusedComparisonScreenshot,
} from '@/agent/cache-action-verification-image';
import { ScreenshotItem } from '@/screenshot-item';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { describe, expect, it } from 'vitest';

const PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('cache action verification image', () => {
  it('biases the crop to preserve context across the target row', () => {
    expect(
      calculateCacheActionVerificationCrop(
        { width: 2880, height: 1600 },
        { left: 2190, top: 530, width: 80, height: 80 },
      ),
    ).toEqual({
      left: 1180,
      top: 370,
      width: 1400,
      height: 800,
    });
  });

  it('creates one before-and-after comparison image', async () => {
    const comparison = await createFocusedComparisonScreenshot(
      ScreenshotItem.create(PNG_BASE64, 1),
      ScreenshotItem.create(PNG_BASE64, 2),
      { left: 0, top: 0, width: 1, height: 1 },
    );

    expect(comparison.cropRect).toEqual({
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    });
    expect(comparison.comparisonImageSize).toEqual({ width: 10, height: 1 });
    await expect(
      imageInfoOfBase64(comparison.screenshot.base64),
    ).resolves.toEqual({ width: 10, height: 1 });
  });
});
