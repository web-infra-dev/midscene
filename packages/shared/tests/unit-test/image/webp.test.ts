import { describe, expect, it } from '@rstest/core';
import {
  convertBase64ImageToJpeg,
  convertBase64ImageToWebp,
  cropByRect,
  detectScreenshotImageFormatFromBuffer,
  encodedImageInfoOfBuffer,
  imageInfoOfBase64,
  isScreenshotImageMimeType,
  isValidWebPImageBuffer,
  localImg2Base64,
  paddingToMatchBlockByBase64,
  parseBase64,
  resizeBase64ImageToWebp,
  resizeImgBase64,
  scaleImage,
  screenshotImageFormatFromMimeType,
} from '../../../src/img';
import { getFixture } from '../../utils';

describe('WebP image primitives', () => {
  it('distinguishes canonical screenshot MIME types from accepted aliases', () => {
    expect(screenshotImageFormatFromMimeType('image/jpg')).toBe('jpeg');
    expect(isScreenshotImageMimeType('image/jpg')).toBe(false);
    expect(isScreenshotImageMimeType('image/jpeg')).toBe(true);
    expect(isScreenshotImageMimeType('image/webp')).toBe(true);
  });

  it('detects WebP and reads dimensions from its encoded header', async () => {
    const png = localImg2Base64(getFixture('icon.png'));
    const webp = await convertBase64ImageToWebp(png);
    const { body } = parseBase64(webp);
    const buffer = Buffer.from(body, 'base64');

    expect(detectScreenshotImageFormatFromBuffer(buffer)).toBe('webp');
    expect(isValidWebPImageBuffer(buffer)).toBe(true);
    expect(encodedImageInfoOfBuffer(buffer)).toEqual({ width: 68, height: 56 });
    await expect(imageInfoOfBase64(webp)).resolves.toEqual({
      width: 68,
      height: 56,
    });
  });

  it('validates lossy, lossless, and extended still WebP containers', () => {
    const fixtures = [
      // Lossless VP8L.
      'UklGRjIAAABXRUJQVlA4TCYAAAAvAUAAEB8w/wKCIv9HExAU+T+agKDouuUC+KOCkgABUJSRiP7HAA==',
      // Extended VP8X with alpha and a lossy VP8 image chunk.
      'UklGRnwAAABXRUJQVlA4WAoAAAAQAAAAAQAAAQAAQUxQSAUAAAAAAID//wBWUDggUAAAANACAJ0BKgIAAgAAwBIloAJ0ugH4AfgAD+qnTgO2+wAA/v3Y//cDtfuHxMf6/H/8YtJxXE71EWdfD+1UwKujj/+0sl6xB+mh/9ZV0gPfybgA',
    ];

    for (const fixture of fixtures) {
      const buffer = Buffer.from(fixture, 'base64');
      expect(isValidWebPImageBuffer(buffer)).toBe(true);
      expect(encodedImageInfoOfBuffer(buffer)).toEqual({
        width: 2,
        height: 2,
      });
    }
  });

  it('combines resizing and WebP encoding', async () => {
    const png = localImg2Base64(getFixture('icon.png'));
    const webp = await resizeBase64ImageToWebp(png, {
      sourceSize: { width: 68, height: 56 },
      targetSize: { width: 34, height: 28 },
    });

    expect(webp).toMatch(/^data:image\/webp;base64,/);
    await expect(imageInfoOfBase64(webp)).resolves.toEqual({
      width: 34,
      height: 28,
    });
  });

  it('rejects incomplete WebP containers instead of trusting the RIFF signature', async () => {
    const signatureOnly = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    const vp8xWithoutImageData = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x16, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x58, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    expect(detectScreenshotImageFormatFromBuffer(signatureOnly)).toBe('webp');
    expect(isValidWebPImageBuffer(signatureOnly)).toBe(false);
    expect(isValidWebPImageBuffer(vp8xWithoutImageData)).toBe(false);
    expect(() => encodedImageInfoOfBuffer(signatureOnly)).toThrow(
      'malformed WebP container',
    );
    await expect(
      convertBase64ImageToWebp(
        `data:image/webp;base64,${signatureOnly.toString('base64')}`,
      ),
    ).rejects.toThrow('did not produce a valid WebP image');
  });

  it('rejects a WebP whose declared RIFF size does not match its bytes', async () => {
    const webp = await convertBase64ImageToWebp(
      localImg2Base64(getFixture('icon.png')),
    );
    const { body } = parseBase64(webp);
    const truncated = Buffer.from(body, 'base64').subarray(0, -1);

    expect(isValidWebPImageBuffer(truncated)).toBe(false);
    expect(() => encodedImageInfoOfBuffer(truncated)).toThrow(
      'RIFF size does not match buffer',
    );
  });

  it('keeps the deprecated resize alias behavior for unchanged WebP', async () => {
    const webp = await convertBase64ImageToWebp(
      localImg2Base64(getFixture('icon.png')),
    );

    await expect(
      resizeImgBase64(webp, { width: 68, height: 56 }),
    ).resolves.toBe(webp);
  });

  it('allows the JPEG-specific API to consume WebP', async () => {
    const webp = await convertBase64ImageToWebp(
      localImg2Base64(getFixture('icon.png')),
    );

    await expect(convertBase64ImageToJpeg(webp)).resolves.toMatch(
      /^data:image\/jpeg;base64,/,
    );
  });

  it('lets pixel-changing transforms explicitly produce WebP', async () => {
    const png = localImg2Base64(getFixture('icon.png'));
    const cropped = await cropByRect(
      png,
      { left: 0, top: 0, width: 34, height: 28 },
      'webp',
    );
    const scaled = await scaleImage(cropped.imageBase64, 2, 'webp');
    const padded = await paddingToMatchBlockByBase64(
      scaled.imageBase64,
      30,
      'webp',
    );

    expect(cropped.imageBase64).toMatch(/^data:image\/webp;base64,/);
    expect(scaled.imageBase64).toMatch(/^data:image\/webp;base64,/);
    expect(padded.imageBase64).toMatch(/^data:image\/webp;base64,/);
  });

  it('honors explicit WebP output when block padding is a no-op', async () => {
    const png = localImg2Base64(getFixture('icon.png'));
    const sourceSize = await imageInfoOfBase64(png);

    const padded = await paddingToMatchBlockByBase64(png, 1, 'webp');

    expect(padded).toMatchObject(sourceSize);
    expect(padded.imageBase64).toMatch(/^data:image\/webp;base64,/);
    expect(
      detectScreenshotImageFormatFromBuffer(
        Buffer.from(parseBase64(padded.imageBase64).body, 'base64'),
      ),
    ).toBe('webp');
  });
});
