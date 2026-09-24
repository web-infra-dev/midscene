import {
  EncodedImage,
  constrainBase64ImageToMaxSize,
  planImageTransform,
  transformImage,
} from '@/img';
import * as sharpLoader from '@/img/get-sharp';
import { describe, expect, it, rs } from '@rstest/core';
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
  it('does not load a backend for no-ops and propagates backend failures for required work', async () => {
    const source = await fixture('jpeg');
    const load = rs
      .spyOn(sharpLoader, 'default')
      .mockRejectedValue(new Error('sharp unavailable'));
    try {
      expect(
        await transformImage(source, {
          operations: [{ type: 'resize', ...source.size }],
          output: { format: 'jpeg', quality: 90 },
        }),
      ).toBe(source);
      expect(
        await constrainBase64ImageToMaxSize(source.toBase64(), { maxSize: 12 }),
      ).toBe(source.toBase64());
      expect(load).not.toHaveBeenCalled();
      await expect(
        transformImage(source, {
          operations: [{ type: 'resize', width: 6, height: 4 }],
        }),
      ).rejects.toThrow('sharp unavailable');
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      load.mockRestore();
    }
  });
  it.each(['png', 'jpeg', 'webp'] as const)(
    'converts and resizes %s through the same pipeline',
    async (format) => {
      const source = await fixture(format);
      for (const output of [
        { format: 'png' },
        { format: 'jpeg', quality: 90 },
        { format: 'webp', quality: 90, effort: 1 },
      ] as const) {
        const converted = await transformImage(source, { output });
        expect(converted.format).toBe(output.format);
        expect(converted.size).toEqual(source.size);
        if (format === output.format) expect(converted).toBe(source);
        const resized = await transformImage(source, {
          operations: [{ type: 'resize', width: 5, height: 7 }],
          output,
        });
        const metadata = await sharp(resized.bytes).metadata();
        expect([metadata.width, metadata.height, metadata.format]).toEqual([
          5,
          7,
          output.format,
        ]);
      }
    },
  );

  it('resizes to the coordinate space without a hidden cover crop', async () => {
    const pixels = Buffer.from(
      Array.from({ length: 12 * 8 * 3 }, (_, i) => (i * 37) % 256),
    );
    const bytes = await sharp(pixels, {
      raw: { width: 12, height: 8, channels: 3 },
    })
      .png()
      .toBuffer();
    const result = await transformImage(EncodedImage.fromBytes(bytes), {
      operations: [{ type: 'resize', width: 5, height: 7 }],
      output: { format: 'jpeg', quality: 90 },
    });
    expect(Buffer.from(result.bytes)).toEqual(
      await sharp(bytes)
        .resize(5, 7, { fit: 'fill' })
        .jpeg({ quality: 90 })
        .toBuffer(),
    );
  });

  it('preserves transparent PNG pixels on identity operations', async () => {
    const source = EncodedImage.fromBytes(
      await sharp({
        create: {
          width: 28,
          height: 28,
          channels: 4,
          background: { r: 50, g: 100, b: 200, alpha: 0.3 },
        },
      })
        .png()
        .toBuffer(),
    );
    const result = await transformImage(source, {
      operations: [{ type: 'pad', right: 0, bottom: 0 }],
    });
    expect(result).toBe(source);
    expect((await sharp(result.bytes).metadata()).hasAlpha).toBe(true);
  });

  it.each([0, 101, 1.5, Number.NaN])(
    'rejects invalid JPEG quality %s',
    async (quality) => {
      await expect(
        transformImage(await fixture('jpeg'), {
          output: { format: 'jpeg', quality },
        }),
      ).rejects.toThrow(/jpegQuality/);
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid resize width %s',
    async (width) => {
      await expect(
        transformImage(await fixture('png'), {
          operations: [{ type: 'resize', width, height: 5 }],
        }),
      ).rejects.toThrow(/dimensions/);
    },
  );

  it('plans ordered dimensions and removes no-ops without encoding', async () => {
    const source = await fixture('png');
    const plan = planImageTransform(source, [
      { type: 'resize', width: 12, height: 8 },
      { type: 'crop', rect: { left: 1, top: 2, width: 4, height: 3 } },
      { type: 'resize', width: 8, height: 6 },
      { type: 'pad', right: 2, bottom: 1 },
    ]);
    expect(plan.size).toEqual({ width: 10, height: 7 });
    expect(plan.operations).toHaveLength(3);
    expect(source.size).toEqual({ width: 12, height: 8 });
    expect((await transformImage(source, plan)).size).toEqual(plan.size);
    expect(() =>
      planImageTransform(source, [
        { type: 'crop', rect: { left: 10, top: 0, width: 4, height: 3 } },
      ]),
    ).toThrow('Crop rectangle must be inside the image');
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

describe('Android capture size boundary', () => {
  it.each(['png', 'jpeg', 'webp'] as const)(
    'preserves bounded %s and resizes oversized input to JPEG',
    async (format) => {
      const source = (await fixture(format)).toBase64();
      expect(await constrainBase64ImageToMaxSize(source, { maxSize: 12 })).toBe(
        source,
      );
      const resized = EncodedImage.fromBase64(
        await constrainBase64ImageToMaxSize(source, {
          maxSize: 6,
          jpegQuality: 82,
        }),
      );
      expect(resized.format).toBe('jpeg');
      expect(resized.size).toEqual({ width: 6, height: 4 });
    },
  );
  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid maxSize %s',
    async (maxSize) => {
      await expect(
        constrainBase64ImageToMaxSize((await fixture('png')).toBase64(), {
          maxSize,
        }),
      ).rejects.toThrow(/maxSize/);
    },
  );
  it('validates quality even when no resize is needed', async () => {
    await expect(
      constrainBase64ImageToMaxSize((await fixture('png')).toBase64(), {
        maxSize: 12,
        jpegQuality: 0,
      }),
    ).rejects.toThrow(/jpegQuality/);
  });
});
