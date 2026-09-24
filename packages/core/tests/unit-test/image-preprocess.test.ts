import { prepareModelImage } from '@/ai-model/model-adapter/image-preprocess';
import { buildSearchAreaConfig } from '@/ai-model/workflows/grounding';
import { ScreenshotItem } from '@/screenshot-item';
import { EncodedImage } from '@midscene/shared/img';
import { describe, expect, it } from '@rstest/core';
import sharp from 'sharp';

async function screenshot(width: number, height: number) {
  return EncodedImage.fromBytes(
    await sharp({ create: { width, height, channels: 3, background: '#fff' } })
      .png()
      .toBuffer(),
  );
}

describe('prepareModelImage', () => {
  it('keeps an image untouched when no padding is required', async () => {
    const source = EncodedImage.fromBytes(
      await sharp({
        create: { width: 112, height: 84, channels: 3, background: '#fff' },
      })
        .jpeg()
        .toBuffer(),
    );
    for (const policy of [{}, { padBlockSize: 28 }]) {
      const image = await prepareModelImage({
        image: source,
        width: 112,
        height: 84,
        policy,
      });
      expect(image).toEqual({
        image: source,
        imageBase64: source.toBase64(),
        preparedSize: { width: 112, height: 84 },
        contentSize: { width: 112, height: 84 },
      });
    }
  });
  it('pads while retaining the original content coordinate bounds', async () => {
    const source = await screenshot(101, 77);
    const image = await prepareModelImage({
      imageBase64: source.toBase64(),
      width: 101,
      height: 77,
      policy: { padBlockSize: 28 },
    });
    expect(image.contentSize).toEqual({ width: 101, height: 77 });
    expect(image.preparedSize).toEqual({ width: 112, height: 84 });
    expect(EncodedImage.fromBase64(image.imageBase64).size).toEqual(
      image.preparedSize,
    );
  });
  it.each([0, -1, 1.5, Number.NaN])(
    'rejects invalid block size %s',
    async (padBlockSize) => {
      await expect(
        prepareModelImage({
          imageBase64: 'unused',
          width: 1,
          height: 1,
          policy: { padBlockSize },
        }),
      ).rejects.toThrow(/padBlockSize/);
    },
  );
});

describe('buildSearchAreaConfig', () => {
  it('crops then scales real pixels and preserves the coordinate mapping', async () => {
    const source = await screenshot(1000, 800);
    const result = await buildSearchAreaConfig({
      context: {
        screenshot: ScreenshotItem.fromImage(source, 0),
        shotSize: source.size,
        shrunkShotToLogicalRatio: 1,
      },
      baseRect: { left: 400, top: 300, width: 100, height: 100 },
    });
    expect(result.mapping).toEqual({
      offset: { x: result.sourceRect.left, y: result.sourceRect.top },
      scale: 2,
    });
    expect(result.image.width).toBe(result.sourceRect.width * 2);
    expect(result.image.height).toBe(result.sourceRect.height * 2);
    const prepared = await prepareModelImage({ ...result.image, policy: {} });
    expect(prepared.image.size).toEqual({
      width: result.image.width,
      height: result.image.height,
    });
    expect(source.format).toBe('png');
  });
});
