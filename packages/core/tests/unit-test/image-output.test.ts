import {
  prepareRawScreenshot,
  prepareScreenshotForPersistence,
} from '@/agent/screenshot-preparation';
import { prepareModelImage } from '@/ai-model/model-adapter/image-preprocess';
import { prepareImageOutput } from '@/image-output';
import { ScreenshotItem } from '@/screenshot-item';
import { EncodedImage } from '@midscene/shared/img';
import { describe, expect, it } from '@rstest/core';
import sharp from 'sharp';

describe('consumer image output policy', () => {
  it.each(['jpeg', 'webp'] as const)(
    'keeps unchanged %s byte-for-byte through context, model, and persistence',
    async (format) => {
      const source = EncodedImage.fromBytes(
        await sharp({
          create: { width: 8, height: 6, channels: 3, background: '#aabbcc' },
        })
          .toFormat(format)
          .toBuffer(),
      );
      const prepared = await prepareRawScreenshot(source);
      expect(prepared.image).toBe(source);
      expect(await prepareImageOutput(source)).toBe(source);
      expect(await prepareScreenshotForPersistence(source)).toBe(source);
      const model = await prepareModelImage({
        image: source,
        ...source.size,
        policy: {},
      });
      expect(model.image).toBe(source);
    },
  );

  it('model and observation compression do not mutate the report source', async () => {
    const source = EncodedImage.fromBytes(
      await sharp({
        create: { width: 8, height: 6, channels: 3, background: '#aabbcc' },
      })
        .png()
        .toBuffer(),
    );
    const context = await prepareRawScreenshot(source);
    const report = ScreenshotItem.fromImage(context.image, 0);
    const modelImage = await prepareImageOutput(context.image);
    const observationImage = await prepareScreenshotForPersistence(
      context.image,
    );
    expect(modelImage.format).toBe('webp');
    expect(observationImage.format).toBe('webp');
    expect(report.image).toBe(source);
    expect(report.format).toBe('png');
    expect(report.base64).toBe(source.toBase64());
  });
});
