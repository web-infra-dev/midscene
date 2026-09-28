import { EncodedImage } from '@midscene/shared/img';
import { describe, expect, it } from '@rstest/core';
import sharp from 'sharp';
import { constrainBase64ImageToMaxSize } from '../../src/screenshot';

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
});
