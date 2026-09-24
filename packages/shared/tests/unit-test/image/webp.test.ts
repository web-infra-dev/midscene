import { describe, expect, it } from '@rstest/core';
import sharp from 'sharp';
import {
  EncodedImage,
  detectScreenshotImageFormatFromBuffer,
  encodedImageInfoOfBuffer,
  imageInfoOfBase64,
  isScreenshotImageMimeType,
  isValidWebPImageBuffer,
  localImg2Base64,
  parseBase64,
  screenshotImageFormatFromMimeType,
} from '../../../src/img';
import { getFixture } from '../../utils';

async function webpFixture(base64: string) {
  const image = EncodedImage.fromBase64(base64);
  return EncodedImage.fromBytes(
    await sharp(image.bytes).webp().toBuffer(),
  ).toBase64();
}

describe('WebP image primitives', () => {
  it('distinguishes canonical screenshot MIME types from accepted aliases', () => {
    expect(screenshotImageFormatFromMimeType('image/jpg')).toBe('jpeg');
    expect(isScreenshotImageMimeType('image/jpg')).toBe(false);
    expect(isScreenshotImageMimeType('image/jpeg')).toBe(true);
    expect(isScreenshotImageMimeType('image/webp')).toBe(true);
  });

  it('detects WebP and reads dimensions from its encoded header', async () => {
    const png = localImg2Base64(getFixture('icon.png'));
    const webp = await webpFixture(png);
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
    expect(() => EncodedImage.fromBytes(signatureOnly).size).toThrow(
      'malformed WebP container',
    );
  });

  it('rejects a WebP whose declared RIFF size does not match its bytes', async () => {
    const webp = await webpFixture(localImg2Base64(getFixture('icon.png')));
    const { body } = parseBase64(webp);
    const truncated = Buffer.from(body, 'base64').subarray(0, -1);

    expect(isValidWebPImageBuffer(truncated)).toBe(false);
    expect(() => encodedImageInfoOfBuffer(truncated)).toThrow(
      'RIFF size does not match buffer',
    );
  });
});
