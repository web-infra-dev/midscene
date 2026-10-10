import {
  EncodedImage,
  convertImgBufferToJpeg,
  cropByRect,
  resizeAndConvertImgBuffer,
  scaleImage,
  transformImage,
} from '@/img';
import { describe, expect, it } from '@rstest/core';
import sharp from 'sharp';

async function fixture(format: 'png' | 'jpeg' | 'webp') {
  return EncodedImage.fromBytes(
    await sharp({
      create: {
        width: 12,
        height: 8,
        channels: 4,
        background: '#efaa44',
      },
    })
      .toFormat(format)
      .toBuffer(),
  );
}

describe('encoded image pipeline', () => {
  it('retains legacy Node cover resizing while the coordinate pipeline uses fill', async () => {
    const pixels = Buffer.from(
      Array.from({ length: 12 * 8 * 3 }, (_, index) => (index * 37) % 256),
    );
    const bytes = await sharp(pixels, {
      raw: { width: 12, height: 8, channels: 3 },
    })
      .png()
      .toBuffer();
    const legacy = await resizeAndConvertImgBuffer('png', bytes, {
      width: 5,
      height: 7,
    });
    const expected = await sharp(bytes)
      .resize(5, 7)
      .jpeg({ quality: 90 })
      .toBuffer();
    expect(legacy.buffer).toEqual(expected);
    const modern = await transformImage(EncodedImage.fromBytes(bytes), {
      operations: [{ type: 'resize', width: 5, height: 7 }],
      output: { format: 'jpeg', quality: 90 },
    });
    expect(Buffer.from(modern.bytes)).not.toEqual(expected);
  });

  it('preserves legacy support for decoder-readable non-screenshot formats', async () => {
    const gif = await sharp({
      create: { width: 12, height: 8, channels: 3, background: '#f00' },
    })
      .gif()
      .toBuffer();
    const unchanged = await resizeAndConvertImgBuffer('gif', gif, {
      width: 12,
      height: 8,
    });
    expect(unchanged.buffer).toBe(gif);
    expect(unchanged.format).toBe('gif');
    const resized = await resizeAndConvertImgBuffer('gif', gif, {
      width: 6,
      height: 4,
    });
    expect(EncodedImage.fromBytes(resized.buffer).size).toEqual({
      width: 6,
      height: 4,
    });
    expect(resized.format).toBe('jpeg');
  });

  it('explicit legacy conversion, crop and scale still encode on identity operations', async () => {
    const image = await fixture('jpeg');
    const expected = await sharp(image.bytes).jpeg({ quality: 90 }).toBuffer();
    expect(await convertImgBufferToJpeg(Buffer.from(image.bytes))).toEqual(
      expected,
    );
    const crop = await cropByRect(image.toBase64(), {
      left: 0,
      top: 0,
      ...image.size,
    });
    expect(
      Buffer.from(EncodedImage.fromBase64(crop.imageBase64).bytes),
    ).toEqual(expected);
    const scaled = await scaleImage(image.toBase64(), 1);
    expect(
      Buffer.from(EncodedImage.fromBase64(scaled.imageBase64).bytes),
    ).toEqual(expected);
    expect(await transformImage(image)).toBe(image);
  });
  it.each(['png', 'jpeg', 'webp'] as const)(
    'reuses unchanged %s bytes and caches dimensions',
    async (format) => {
      const image = await fixture(format);
      expect(await transformImage(image)).toBe(image);
      expect(image.size).toBe(image.size);
      expect(image.size).toEqual({ width: 12, height: 8 });
      expect(EncodedImage.fromBase64(image.toBase64()).bytes).toEqual(
        image.bytes,
      );
      expect(
        await transformImage(image, {
          operations: [
            { type: 'resize', width: 12, height: 8 },
            { type: 'pad', right: 0, bottom: 0 },
          ],
        }),
      ).toBe(image);
    },
  );

  it('checks declared formats against bytes', async () => {
    const image = await fixture('png');
    expect(() => EncodedImage.fromBytes(image.bytes, 'jpeg')).toThrow(
      /declares/,
    );
  });

  it('executes crop, resize, and padding in order with one lossy encoding', async () => {
    const image = await fixture('png');
    const result = await transformImage(image, {
      operations: [
        { type: 'crop', rect: { left: 2, top: 1, width: 6, height: 4 } },
        { type: 'resize', width: 18, height: 12 },
        { type: 'pad', right: 2, bottom: 3 },
      ],
      output: { format: 'webp', quality: 90, effort: 1 },
    });
    const expected = await sharp(image.bytes)
      .extract({ left: 2, top: 1, width: 6, height: 4 })
      .resize(18, 12)
      .raw()
      .toBuffer();
    const expectedWebp = await sharp(expected, {
      raw: { width: 18, height: 12, channels: 4 },
    })
      .extend({
        right: 2,
        bottom: 3,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .webp({ quality: 90, effort: 1 })
      .toBuffer();
    expect(result.format).toBe('webp');
    expect(result.size).toEqual({ width: 20, height: 15 });
    expect(Buffer.from(result.bytes)).toEqual(expectedWebp);
  });

  it('honors multiple resize operations instead of Sharp ignoring earlier ones', async () => {
    const image = await fixture('png');
    const result = await transformImage(image, {
      operations: [
        { type: 'resize', width: 6, height: 4 },
        { type: 'crop', rect: { left: 1, top: 1, width: 4, height: 2 } },
        { type: 'resize', width: 20, height: 10 },
      ],
    });
    expect(result.format).toBe('png');
    expect(result.size).toEqual({ width: 20, height: 10 });
  });

  it('rejects invalid operations and encoding options even on no-op paths', async () => {
    const image = await fixture('jpeg');
    await expect(
      transformImage(image, { output: { format: 'jpeg', quality: 0 } }),
    ).rejects.toThrow(/jpegQuality/);
    await expect(
      transformImage(image, {
        operations: [{ type: 'resize', width: 0, height: 2 }],
      }),
    ).rejects.toThrow(/dimensions/);
    await expect(
      transformImage(image, {
        operations: [
          { type: 'crop', rect: { left: 11, top: 0, width: 3, height: 2 } },
        ],
      }),
    ).rejects.toThrow(/rectangle/);
  });
});
