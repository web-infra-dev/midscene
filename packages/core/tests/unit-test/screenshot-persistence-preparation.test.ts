import { prepareScreenshotForPersistence } from '@/agent/screenshot-preparation';
import { EncodedImage } from '@midscene/shared/img';
import { describe, expect, it, rs } from '@rstest/core';
import sharp from 'sharp';

describe('prepareScreenshotForPersistence', () => {
  it.each(['jpeg', 'webp'] as const)(
    'reuses unscaled %s bytes without reading dimensions',
    async (format) => {
      const image = EncodedImage.fromBytes(
        await sharp({
          create: {
            width: 8,
            height: 6,
            channels: 3,
            background: '#fff',
          },
        })
          .toFormat(format)
          .toBuffer(),
      );
      const readSize = rs.spyOn(image, 'size', 'get');
      expect(await prepareScreenshotForPersistence(image)).toBe(image);
      expect(readSize).not.toHaveBeenCalled();
    },
  );

  it('shrinks and encodes a PNG frame in one pipeline', async () => {
    const image = EncodedImage.fromBytes(
      await sharp({
        create: {
          width: 8,
          height: 6,
          channels: 3,
          background: '#fff',
        },
      })
        .png()
        .toBuffer(),
    );
    const result = await prepareScreenshotForPersistence(image, {
      shrinkFactor: 2,
    });
    expect(result.format).toBe('webp');
    expect(result.size).toEqual({ width: 4, height: 3 });
    const expected = await sharp(image.bytes)
      .resize(4, 3, { fit: 'fill' })
      .webp({ quality: 90, effort: 1 })
      .toBuffer();
    expect(Buffer.from(result.bytes)).toEqual(expected);
  });
});
