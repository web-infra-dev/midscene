import { Buffer } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalizeRecorderScreenshot } from '../src/utils/screenshot';

describe('canonicalizeRecorderScreenshot', () => {
  const pngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const webpBytes = Buffer.from(
    'UklGRioAAABXRUJQVlA4IB4AAAAwAQCdASoBAAEAAUAmJQBOgCHwAP7+hNQAAAA=',
    'base64',
  );
  const drawImage = vi.fn();
  const close = vi.fn();
  const convertToBlob = vi.fn(
    async () => new Blob([webpBytes], { type: 'image/webp' }),
  );

  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1, height: 1, close })),
    );
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return { drawImage };
        }

        convertToBlob = convertToBlob;
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('turns captureVisibleTab PNG output into a real WebP image', async () => {
    const result = await canonicalizeRecorderScreenshot(pngDataUrl);
    const bytes = Buffer.from(result.split(',')[1], 'base64');

    expect(result).toMatch(/^data:image\/webp;base64,/);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(convertToBlob).toHaveBeenCalledWith({
      type: 'image/webp',
      quality: 0.9,
    });
  });

  it('passes an existing WebP through without re-encoding', async () => {
    const webp = `data:image/webp;base64,${webpBytes.toString('base64')}`;
    await expect(canonicalizeRecorderScreenshot(webp)).resolves.toBe(webp);
    expect(convertToBlob).not.toHaveBeenCalled();
  });
});
