import type { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import {
  normalizeImageForModel,
  normalizeImagesForModel,
  resolveModelInputImageCapabilities,
} from '../../../src/img/model-input';

function toDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

describe('model input image normalization', () => {
  test('normalizes a 4K image larger than 10 MiB below the safe provider budget', async () => {
    const width = 3840;
    const height = 2160;
    const source = await sharp(randomBytes(width * height * 3), {
      raw: { width, height, channels: 3 },
    })
      .jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
      .toBuffer();
    expect(source.byteLength).toBeGreaterThan(10 * 1024 * 1024);

    const result = await normalizeImageForModel(
      toDataUrl(source, 'image/jpeg'),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.originalBytes).toBe(source.byteLength);
    expect(result.finalBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(Math.max(result.finalSize.width, result.finalSize.height)).toBe(
      2048,
    );
    expect(result.format).toBe('image/jpeg');
    expect(result.degradedReason).toBe('resized');
  }, 20_000);

  test('returns a structured failure instead of forwarding an invalid image', async () => {
    const result = await normalizeImageForModel('not-an-image');
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'model_image_invalid' },
    });
  });

  test('enforces the request-level total image budget', async () => {
    const png = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: '#123456',
      },
    })
      .png()
      .toBuffer();
    const dataUrl = toDataUrl(png, 'image/png');
    const result = await normalizeImagesForModel([dataUrl, dataUrl], {
      maxBytes: png.byteLength,
      maxTotalBytes: png.byteLength,
      maxLongEdge: 64,
      minLongEdge: 16,
    });

    expect(result.images).toHaveLength(1);
    expect(result.omitted).toHaveLength(1);
    expect(result.omitted[0].error.code).toBe('model_image_total_too_large');
  });

  test('enforces a provider-specific image count budget', async () => {
    const png = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: '#abcdef',
      },
    })
      .png()
      .toBuffer();
    const dataUrl = toDataUrl(png, 'image/png');

    const result = await normalizeImagesForModel([dataUrl, dataUrl, dataUrl], {
      maxImages: 2,
    });

    expect(result.images.map((image) => image.index)).toEqual([0, 1]);
    expect(result.omitted).toEqual([
      expect.objectContaining({
        index: 2,
        error: expect.objectContaining({
          code: 'model_image_count_exceeded',
        }),
      }),
    ]);
  });

  test('resolves explicit provider capabilities over conservative defaults', () => {
    expect(
      resolveModelInputImageCapabilities({
        maxBytes: 16,
        maxTotalBytes: 12,
        maxLongEdge: 1024,
        minLongEdge: 256,
        maxImages: 3,
      }),
    ).toEqual({
      maxBytes: 12,
      maxTotalBytes: 12,
      maxLongEdge: 1024,
      minLongEdge: 256,
      maxImages: 3,
    });
    expect(() =>
      resolveModelInputImageCapabilities({
        maxLongEdge: 256,
        minLongEdge: 512,
      }),
    ).toThrow('minLongEdge must not exceed maxLongEdge');
    expect(() =>
      resolveModelInputImageCapabilities({ maxImages: 0.5 }),
    ).toThrow('maxImages must be at least 1');
  });
});
