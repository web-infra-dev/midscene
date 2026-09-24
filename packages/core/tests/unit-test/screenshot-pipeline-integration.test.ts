import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commonContextParser } from '@/agent/utils';
import { prepareModelImage } from '@/ai-model/model-adapter/image-preprocess';
import { buildSearchAreaConfig } from '@/ai-model/workflows/grounding/search-area';
import { prepareContextImage } from '@/image-output';
import { ScreenshotItem } from '@/screenshot-item';
import { EncodedImage, type ImageOperation } from '@midscene/shared/img';
import { describe, expect, it, rs } from '@rstest/core';
import sharp from 'sharp';

async function capture() {
  const pixels = Buffer.from(
    Array.from(
      { length: 80 * 60 * 3 },
      (_, index) => (index * 37 + (index >> 4)) % 256,
    ),
  );
  return EncodedImage.fromBytes(
    await sharp(pixels, { raw: { width: 80, height: 60, channels: 3 } })
      .jpeg({ quality: 97 })
      .toBuffer(),
  );
}

describe('capture to consumer image preparation', () => {
  it('retains captured bytes and combines context shrinking, crop, resize and padding before one JPEG encoding', async () => {
    const original = await capture();
    const device = {
      size: async () => ({ width: 80, height: 60 }),
      screenshot: async () => ({
        bytes: original.bytes,
        format: original.format,
      }),
      screenshotBase64: rs.fn(() => {
        throw new Error('byte capture must not use Base64');
      }),
    };
    const context = await commonContextParser(
      device as Parameters<typeof commonContextParser>[0],
      { screenshotShrinkFactor: 2 },
    );
    expect(context.screenshot.image.bytes).toBe(original.bytes);
    expect(context.shotSize).toEqual({ width: 40, height: 30 });
    expect(device.screenshotBase64).not.toHaveBeenCalled();

    const operations: ImageOperation[] = [
      { type: 'resize', ...context.shotSize },
      { type: 'crop', rect: { left: 3, top: 4, width: 21, height: 13 } },
      { type: 'resize', width: 42, height: 26 },
    ];
    const prepared = await prepareModelImage({
      image: context.screenshot.image,
      operations,
      width: 42,
      height: 26,
      policy: { padBlockSize: 28 },
    });

    // Reference uses only raw RGBA between stages. Any intermediate lossy
    // encoding in the production path changes the final JPEG bytes.
    const resized = await sharp(original.bytes)
      .resize(40, 30, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const cropped = await sharp(resized, {
      raw: { width: 40, height: 30, channels: 4 },
    })
      .extract({ left: 3, top: 4, width: 21, height: 13 })
      .raw()
      .toBuffer();
    const enlarged = await sharp(cropped, {
      raw: { width: 21, height: 13, channels: 4 },
    })
      .resize(42, 26, { fit: 'fill' })
      .raw()
      .toBuffer();
    const expected = await sharp(enlarged, {
      raw: { width: 42, height: 26, channels: 4 },
    })
      .extend({
        right: 14,
        bottom: 2,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
      .toBuffer();
    expect(Buffer.from(prepared.image.bytes)).toEqual(expected);
    expect(prepared.contentSize).toEqual({ width: 42, height: 26 });
    expect(prepared.preparedSize).toEqual({ width: 56, height: 28 });
    expect(context.screenshot.image.bytes).toBe(original.bytes);
    expect(context.screenshot.toSerializable().mimeType).toBe('image/jpeg');
    const directory = mkdtempSync(
      join(tmpdir(), 'midscene-pipeline-roundtrip-'),
    );
    try {
      const file = join(directory, 'capture.jpeg');
      writeFileSync(file, context.screenshot.image.bytes);
      const ref = context.screenshot.markPersistedToPath('capture.jpeg', file);
      expect(ref.mimeType).toBe('image/jpeg');
      expect(context.screenshot.hasBase64()).toBe(false);
      expect(context.screenshot.image.bytes).toEqual(original.bytes);
      const recovered = await prepareModelImage({
        image: context.screenshot.image,
        operations,
        width: 42,
        height: 26,
        policy: { padBlockSize: 28 },
      });
      expect(recovered.image.bytes).toEqual(prepared.image.bytes);
      expect(context.screenshot.hasBase64()).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('defers search-area encoding until model padding is known', async () => {
    const original = await capture();
    const context = {
      screenshot: ScreenshotItem.fromImage(original, 0),
      shotSize: { width: 40, height: 30 },
      shrunkShotToLogicalRatio: 0.5,
    };
    const search = await buildSearchAreaConfig({
      context,
      baseRect: { left: 10, top: 10, width: 5, height: 5 },
    });
    expect(search.image.image).toBe(original);
    expect(search.image.imageBase64).toBeUndefined();
    const prepared = await prepareModelImage({
      ...search.image,
      policy: { padBlockSize: 28 },
    });
    expect(prepared.image.size).toEqual(prepared.preparedSize);
    expect(prepared.contentSize).toEqual({
      width: search.image.width,
      height: search.image.height,
    });
    expect(search.mapping.scale).toBe(2);
  });

  it('applies overlay coordinates after shrinking the original capture', async () => {
    const original = await capture();
    const pixels = new Uint8Array(40 * 30 * 4);
    for (let y = 10; y < 20; y++)
      for (let x = 10; x < 20; x++)
        pixels.set([255, 0, 0, 255], (y * 40 + x) * 4);
    const image = await prepareContextImage(
      {
        screenshot: ScreenshotItem.fromImage(original, 0),
        shotSize: { width: 40, height: 30 },
      },
      [{ type: 'overlay', pixels, width: 40, height: 30 }],
    );
    expect(image.size).toEqual({ width: 40, height: 30 });
    const { data, info } = await sharp(image.bytes)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const offset = (15 * 40 + 15) * info.channels;
    expect(data[offset]).toBeGreaterThan(230);
    expect(data[offset + 1]).toBeLessThan(25);
  });
});
