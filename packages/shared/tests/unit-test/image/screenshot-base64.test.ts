import { describe, expect, it, rs } from '@rstest/core';
import {
  EncodedImage,
  imageInfoOfBase64,
  localImg2Base64,
  splitImageDataUrl,
} from '../../../src/img';
import { parseScreenshotBase64 } from '../../../src/img/base64';
import * as sharpLoader from '../../../src/img/get-sharp';
import { getFixture } from '../../utils';

describe('screenshot Base64 boundary', () => {
  it('keeps only bytes and format at the parser boundary', () => {
    const source = localImg2Base64(getFixture('icon.png'));
    expect(Object.keys(parseScreenshotBase64(source)).sort()).toEqual([
      'bytes',
      'format',
    ]);
    const image = EncodedImage.fromBase64(source);
    const parts = image.toBase64Parts();
    expect(parts.mimeType).toBe('image/png');
    expect(`data:${parts.mimeType};base64,${parts.body}`).toBe(source);
    expect(EncodedImage.fromBase64(parts.body).bytes).toEqual(image.bytes);
  });

  it('accepts JPEG aliases and wrapped bytes without re-encoding pixels', () => {
    const jpeg = localImg2Base64(getFixture('heytea.jpeg'));
    const body = jpeg.split(',')[1];
    const wrapped = body.match(/.{1,64}/g)!.join('\r\n');
    expect(
      EncodedImage.fromBase64(` DATA:image/JPG;base64,${wrapped} `).toBase64(),
    ).toBe(jpeg);
  });

  it.each(['iVBORw0KGgo===', 'iVBORw0=KGgo', '/9j/=', '/9j/!'])(
    'rejects malformed Base64 %s',
    (body) => {
      expect(() => EncodedImage.fromBase64(body, { label: 'Capture' })).toThrow(
        'Capture contains invalid base64',
      );
    },
  );

  it('does not confuse RIFF/WAVE with WebP', () => {
    const wav = Buffer.from('RIFF0000WAVEdata').toString('base64');
    expect(() => EncodedImage.fromBase64(wav)).toThrow(
      'does not contain a PNG, JPEG, or WebP image',
    );
  });

  it('shares header dimensions without loading a pixel backend', async () => {
    const load = rs
      .spyOn(sharpLoader, 'default')
      .mockRejectedValue(new Error('must not load'));
    try {
      for (const file of ['icon.png', 'heytea.jpeg']) {
        const source = localImg2Base64(getFixture(file));
        const image = EncodedImage.fromBase64(source);
        expect(await imageInfoOfBase64(source)).toEqual(image.size);
        expect(image.size).toBe(image.size);
      }
      expect(load).not.toHaveBeenCalled();
    } finally {
      load.mockRestore();
    }
  });

  it('rejects MIME disagreement when querying dimensions too', async () => {
    const source = localImg2Base64(getFixture('icon.png')).replace(
      'image/png',
      'image/jpeg',
    );
    await expect(imageInfoOfBase64(source)).rejects.toThrow(
      'declares image/jpeg but encoded bytes are image/png',
    );
  });

  it('reports a malformed PNG header instead of reading beyond the buffer', () => {
    const bytes = Buffer.from(
      '89504e470d0a1a0a0000000049454e44ae426082',
      'hex',
    );
    expect(() => EncodedImage.fromBytes(bytes).size).toThrow(
      'malformed PNG IHDR',
    );
  });
  it('uses encoded bytes as the canonical screenshot format', () => {
    const webp =
      'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAMASJQBOl0AAjNAA/v4icv1difCfoP7mxzi2QwAA';

    expect(EncodedImage.fromBase64(webp)).toMatchObject({
      format: 'webp',
    });
  });

  it('rejects a MIME type that disagrees with the encoded bytes', () => {
    const webpBody =
      'UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAMASJQBOl0AAjNAA/v4icv1difCfoP7mxzi2QwAA';

    expect(() =>
      EncodedImage.fromBase64(`data:image/png;base64,${webpBody}`),
    ).toThrow('declares image/png but encoded bytes are image/webp');
  });

  it('rejects unsupported bytes instead of defaulting to PNG', () => {
    expect(() =>
      EncodedImage.fromBase64(Buffer.from('not an image').toString('base64')),
    ).toThrow('does not contain a PNG, JPEG, or WebP image');
  });

  it('canonicalizes a raw JPEG body without trusting a file extension', () => {
    const jpeg = localImg2Base64(getFixture('heytea.jpeg'));
    const body = jpeg.split(',')[1];

    expect(EncodedImage.fromBase64(body).toBase64()).toBe(jpeg);
  });
});

describe('image data URL protocol splitter', () => {
  it.each(['gif', 'bmp', 'svg+xml'])(
    'preserves %s without imposing screenshot formats',
    (format) => {
      expect(
        splitImageDataUrl(`data:image/${format};base64, Zm9v\r\n`),
      ).toEqual({ mimeType: `image/${format}`, body: 'Zm9v' });
    },
  );
  it('only splits declarations; screenshot ingress owns signature validation', () => {
    expect(splitImageDataUrl('data:image/png;base64,Zm9v')).toEqual({
      mimeType: 'image/png',
      body: 'Zm9v',
    });
    expect(() => EncodedImage.fromBase64('data:image/png;base64,Zm9v')).toThrow(
      'does not contain',
    );
    expect(() => splitImageDataUrl('Zm9v')).toThrow(
      'Expected a base64 image data URL',
    );
  });
});
