import { encodeRgbaToWebp } from '@/img';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

const validWebpBytes = Uint8Array.from(
  Buffer.from(
    'UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAMASJQBOl0AAjNAA/v4icv1difCfoP7mxzi2QwAA',
    'base64',
  ),
);

describe('encodeRgbaToWebp', () => {
  afterEach(() => {
    rs.unstubAllGlobals();
  });

  it('encodes RGBA pixels with the browser WebP encoder', async () => {
    const putImageData = rs.fn();
    const convertToBlob = rs.fn(
      async (options: ImageEncodeOptions) =>
        new Blob([validWebpBytes], { type: options.type }),
    );
    const context = {
      createImageData: rs.fn(() => ({ data: new Uint8ClampedArray(4) })),
      putImageData,
    };
    class FakeOffscreenCanvas {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}

      getContext() {
        return context;
      }

      convertToBlob(options: ImageEncodeOptions) {
        return convertToBlob(options);
      }
    }
    rs.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    const result = await encodeRgbaToWebp({
      pixels: new Uint8Array([255, 0, 0, 255]),
      width: 1,
      height: 1,
      quality: 80,
    });

    expect(result).toEqual(validWebpBytes);
    expect(putImageData).toHaveBeenCalledOnce();
    expect(convertToBlob).toHaveBeenCalledWith({
      type: 'image/webp',
      quality: 0.8,
    });
  });

  it('rejects invalid dimensions and RGBA lengths before encoding', async () => {
    await expect(
      encodeRgbaToWebp({ pixels: [], width: 0, height: 1 }),
    ).rejects.toThrow('WebP image dimensions must be positive safe integers');
    await expect(
      encodeRgbaToWebp({ pixels: [], width: 1, height: 1 }),
    ).rejects.toThrow('WebP RGBA pixel length must be 4, got 0');
  });
});
