import { prepareRawScreenshot } from '@/agent/screenshot-preparation';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { describe, expect, it } from 'vitest';

const pngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQqbiDFTEMpAQAorNDgTX/VEoAAAAASUVORK5CYII=';
const jpegDataUrl =
  'data:image/jpeg;base64,/9j/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAADAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAACP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ0AWYyP/9k=';

describe('prepareRawScreenshot', () => {
  it('normalizes a PNG to JPEG without changing its dimensions', async () => {
    const prepared = await prepareRawScreenshot(pngDataUrl);

    expect(prepared.originalSize).toEqual({ width: 8, height: 6 });
    expect(prepared.shotSize).toEqual({ width: 8, height: 6 });
    expect(prepared.base64).toMatch(/^data:image\/jpeg;base64,/);
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
    expect(prepared.base64).toMatch(/^data:image\/jpeg;base64,/);
    await expect(imageInfoOfBase64(prepared.base64)).resolves.toEqual(
      prepared.shotSize,
    );
  });

  it('keeps JPEG dimensions while preserving the JPEG output contract', async () => {
    const prepared = await prepareRawScreenshot(jpegDataUrl);

    expect(prepared.base64).toBe(jpegDataUrl);
    expect(prepared.originalSize).toEqual({ width: 4, height: 3 });
    expect(prepared.shotSize).toEqual(prepared.originalSize);
    await expect(imageInfoOfBase64(prepared.base64)).resolves.toEqual(
      prepared.shotSize,
    );
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
