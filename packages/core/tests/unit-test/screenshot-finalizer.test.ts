import { finalizeScreenshotBase64 } from '@/agent/screenshot-finalizer';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { describe, expect, it } from 'vitest';

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('screenshot finalizer', () => {
  it('converts a PNG screenshot to the final WebP format', async () => {
    const result = await finalizeScreenshotBase64(ONE_PIXEL_PNG);

    expect(result).toMatch(/^data:image\/webp;base64,UklGR/);
    await expect(imageInfoOfBase64(result)).resolves.toEqual({
      width: 1,
      height: 1,
    });
  });

  it('passes an existing final WebP through byte-for-byte', async () => {
    const webp = await finalizeScreenshotBase64(ONE_PIXEL_PNG);

    await expect(finalizeScreenshotBase64(webp)).resolves.toBe(webp);
  });

  it('still returns WebP when a rounded resize target matches the source size', async () => {
    const result = await finalizeScreenshotBase64(ONE_PIXEL_PNG, {
      targetSize: { width: 1, height: 1 },
    });

    expect(result).toMatch(/^data:image\/webp;base64,UklGR/);
  });
});
