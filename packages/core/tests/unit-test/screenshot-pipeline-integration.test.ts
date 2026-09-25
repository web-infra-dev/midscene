import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commonContextParser } from '@/agent/utils';
import { prepareModelImage } from '@/ai-model/model-adapter/image-preprocess';
import { buildSearchAreaConfig } from '@/ai-model/workflows/grounding/search-area';
import { prepareContextImage } from '@/image-output';
import { ScreenshotItem } from '@/screenshot-item';
import { EncodedImage, transformImage } from '@midscene/shared/img';
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
  it('stores the actual shrunk pixels and keeps model padding out of the context and report', async () => {
    const original = await capture();
    const device = {
      size: async () => ({ width: 80, height: 60 }),
      screenshot: async () => ({
        bytes: original.bytes,
        format: original.format,
      }),
      screenshotBase64: rs.fn(),
    };
    const context = await commonContextParser(device as any, {
      screenshotShrinkFactor: 2,
    });
    expect(context).not.toHaveProperty('shotSize');
    expect(context.screenshot.size).toEqual({ width: 40, height: 30 });
    expect(context.screenshot.image.size).toEqual(context.screenshot.size);
    expect(device.screenshotBase64).not.toHaveBeenCalled();
    const shrunk = context.screenshot.image;
    const prepared = await prepareModelImage({
      image: shrunk,
      policy: { padBlockSize: 28 },
    });
    expect(prepared.contentSize).toEqual({ width: 40, height: 30 });
    expect(prepared.preparedSize).toEqual({ width: 56, height: 56 });
    expect(context.screenshot.image).toBe(shrunk);
    expect(context.screenshot.size).toEqual({ width: 40, height: 30 });
    const directory = mkdtempSync(
      join(tmpdir(), 'midscene-context-roundtrip-'),
    );
    try {
      const file = join(directory, 'capture.jpeg');
      writeFileSync(file, shrunk.bytes);
      const ref = context.screenshot.markPersistedToPath('capture.jpeg', file);
      expect(ref.size).toEqual({ width: 40, height: 30 });
      expect(context.screenshot.hasBase64()).toBe(false);
      expect(context.screenshot.size).toEqual(ref.size);
      expect(context.screenshot.hasBase64()).toBe(false);
      expect(context.screenshot.image.bytes).toEqual(shrunk.bytes);
      const recovered = await prepareModelImage({
        image: context.screenshot.image,
        policy: {},
      });
      expect(recovered.image.bytes).toEqual(shrunk.bytes);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('finishes search-area crop and scaling before model preprocessing', async () => {
    const original = await capture();
    const context = {
      screenshot: ScreenshotItem.fromImage(original, 0),
      shrunkShotToLogicalRatio: 1,
    };
    const search = await buildSearchAreaConfig({
      context,
      baseRect: { left: 10, top: 10, width: 5, height: 5 },
    });
    expect(search.image).not.toHaveProperty('operations');
    expect(search.image.image.size).toEqual({
      width: search.sourceRect.width * 2,
      height: search.sourceRect.height * 2,
    });
    const model = await prepareModelImage({ ...search.image, policy: {} });
    expect(model.image).toBe(search.image.image);
    expect(search.mapping.scale).toBe(2);
    expect(context.screenshot.image).toBe(original);
  });

  it('draws overlays in the actual screenshot coordinate space', async () => {
    const original = await capture();
    const shrunk = await transformImage(original, {
      operations: [{ type: 'resize', width: 40, height: 30 }],
    });
    const pixels = new Uint8Array(40 * 30 * 4);
    for (let y = 10; y < 20; y++)
      for (let x = 10; x < 20; x++)
        pixels.set([255, 0, 0, 255], (y * 40 + x) * 4);
    const image = await prepareContextImage(
      { screenshot: ScreenshotItem.fromImage(shrunk, 0) },
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
