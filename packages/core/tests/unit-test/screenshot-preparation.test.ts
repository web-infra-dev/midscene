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
  it('preserves a PNG without changing its dimensions', async () => {
    const prepared = await prepareRawScreenshot(pngDataUrl);

    expect(prepared.size).toEqual({ width: 8, height: 6 });
    expect(prepared.toBase64()).toMatch(/^data:image\/png;base64,/);
    await expect(imageInfoOfBase64(prepared.toBase64())).resolves.toEqual(
      prepared.size,
    );
  });

  it('finishes shrinking before returning the context image', async () => {
    const prepared = await prepareRawScreenshot(pngDataUrl, {
      shrinkFactor: 2,
    });

    expect(prepared.size).toEqual({ width: 4, height: 3 });
    expect(prepared.toBase64()).not.toBe(pngDataUrl);
    expect(prepared.toBase64()).toMatch(/^data:image\/webp;base64,/);
    await expect(imageInfoOfBase64(prepared.toBase64())).resolves.toEqual(
      prepared.size,
    );
  });

  it('preserves JPEG bytes without re-encoding', async () => {
    const prepared = await prepareRawScreenshot(jpegDataUrl);

    expect(prepared.toBase64()).toBe(jpegDataUrl);
    expect(prepared.size).toEqual({ width: 4, height: 3 });
    await expect(imageInfoOfBase64(prepared.toBase64())).resolves.toEqual(
      prepared.size,
    );
  });

  it('reuses an unchanged WebP byte-for-byte', async () => {
    const prepared = await prepareRawScreenshot(webpDataUrl);

    expect(prepared.toBase64()).toBe(webpDataUrl);
    expect(prepared.size).toEqual({ width: 2, height: 3 });
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
