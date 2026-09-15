import { prepareRawScreenshot } from '@/agent/screenshot-preparation';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { describe, expect, it } from '@rstest/core';

const pngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQqbiDFTEMpAQAorNDgTX/VEoAAAAASUVORK5CYII=';
const jpegDataUrl =
  'data:image/jpeg;base64,/9j/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAADAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAACP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ0AWYyP/9k=';
const webpDataUrl =
  'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAMASJQBOl0AAjNAA/v4icv1difCfoP7mxzi2QwAA';

describe('prepareRawScreenshot', () => {
  it('normalizes a PNG to WebP without changing its dimensions', async () => {
    const prepared = await prepareRawScreenshot(pngDataUrl);

    expect(prepared.originalSize).toEqual({ width: 8, height: 6 });
    expect(prepared.shotSize).toEqual({ width: 8, height: 6 });
    expect(prepared.base64).toMatch(/^data:image\/webp;base64,/);
    await expect(imageInfoOfBase64(prepared.base64)).resolves.toEqual(
      prepared.shotSize,
    );
  });

  it('applies the shrink factor once and returns the prepared dimensions', async () => {
    const prepared = await prepareRawScreenshot(pngDataUrl, {
      shrinkFactor: 2,
    });

    expect(prepared.originalSize).toEqual({ width: 8, height: 6 });
    expect(prepared.shotSize).toEqual({ width: 4, height: 3 });
    expect(prepared.base64).toMatch(/^data:image\/webp;base64,/);
    await expect(imageInfoOfBase64(prepared.base64)).resolves.toEqual(
      prepared.shotSize,
    );
  });

  it('converts JPEG to the final WebP output contract', async () => {
    const prepared = await prepareRawScreenshot(jpegDataUrl);

    expect(prepared.base64).toMatch(/^data:image\/webp;base64,/);
    expect(prepared.originalSize).toEqual({ width: 4, height: 3 });
    expect(prepared.shotSize).toEqual(prepared.originalSize);
    await expect(imageInfoOfBase64(prepared.base64)).resolves.toEqual(
      prepared.shotSize,
    );
  });

  it('reuses an unchanged WebP byte-for-byte', async () => {
    const prepared = await prepareRawScreenshot(webpDataUrl);

    expect(prepared.base64).toBe(webpDataUrl);
    expect(prepared.originalSize).toEqual({ width: 2, height: 3 });
    expect(prepared.shotSize).toEqual(prepared.originalSize);
  });

  it.each([0, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid shrink factor %s',
    async (shrinkFactor) => {
      await expect(
        prepareRawScreenshot(pngDataUrl, { shrinkFactor }),
      ).rejects.toThrow(/screenshotShrinkFactor/);
    },
  );

  it('rejects a shrink factor that rounds the target size to zero', async () => {
    await expect(
      prepareRawScreenshot(pngDataUrl, { shrinkFactor: 100 }),
    ).rejects.toThrow(/prepared screenshot dimensions/);
  });
});
