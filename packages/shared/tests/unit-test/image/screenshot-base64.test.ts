import { describe, expect, it } from '@rstest/core';
import {
  localImg2Base64,
  normalizeScreenshotBase64,
  parseScreenshotBase64,
} from '../../../src/img';
import { getFixture } from '../../utils';

describe('parseScreenshotBase64', () => {
  it('uses encoded bytes as the canonical screenshot format', () => {
    const webp =
      'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAMASJQBOl0AAjNAA/v4icv1difCfoP7mxzi2QwAA';

    expect(parseScreenshotBase64(webp)).toMatchObject({
      dataUrl: webp,
      format: 'webp',
      mimeType: 'image/webp',
      extension: 'webp',
    });
  });

  it('rejects a MIME type that disagrees with the encoded bytes', () => {
    const webpBody =
      'UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAMASJQBOl0AAjNAA/v4icv1difCfoP7mxzi2QwAA';

    expect(() =>
      parseScreenshotBase64(`data:image/png;base64,${webpBody}`),
    ).toThrow('declares image/png but encoded bytes are image/webp');
  });

  it('rejects unsupported bytes instead of defaulting to PNG', () => {
    expect(() =>
      normalizeScreenshotBase64(Buffer.from('not an image').toString('base64')),
    ).toThrow('does not contain a PNG, JPEG, or WebP image');
  });

  it('canonicalizes a raw JPEG body without trusting a file extension', () => {
    const jpeg = localImg2Base64(getFixture('heytea.jpeg'));
    const body = jpeg.split(',')[1];

    expect(normalizeScreenshotBase64(body)).toBe(jpeg);
  });
});
