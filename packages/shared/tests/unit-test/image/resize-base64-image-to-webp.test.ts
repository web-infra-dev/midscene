import { beforeEach, describe, expect, it, rs } from '@rstest/core';

const imageBackendMocks = rs.hoisted(() => {
  const metadata = rs.fn();
  const toBuffer = rs.fn();
  const webp = rs.fn(() => ({ toBuffer }));
  const resize = rs.fn(() => ({ webp }));
  const sharp = rs.fn(() => ({ metadata, resize, webp }));
  const getSharp = rs.fn(async () => sharp);

  return { getSharp, metadata, resize, sharp, toBuffer, webp };
});

rs.mock('@/img/get-sharp', () => ({
  default: imageBackendMocks.getSharp,
}));

import { convertBase64ImageToWebp, resizeBase64ImageToWebp } from '@/img';

const pngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQqbiDFTEMpAQAorNDgTX/VEoAAAAASUVORK5CYII=';
const webpDataUrl =
  'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAMASJQBOl0AAjNAA/v4icv1difCfoP7mxzi2QwAA';
const encodedWebp = Buffer.from(webpDataUrl.split(',')[1], 'base64');

describe('resizeBase64ImageToWebp image backend usage', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    imageBackendMocks.toBuffer.mockResolvedValue(encodedWebp);
  });

  it('reuses an unchanged WebP before loading an image backend', async () => {
    const result = await resizeBase64ImageToWebp(webpDataUrl, {
      sourceSize: { width: 2, height: 3 },
      targetSize: { width: 2, height: 3 },
    });

    expect(result).toBe(webpDataUrl);
    expect(imageBackendMocks.getSharp).not.toHaveBeenCalled();
  });

  it('rejects source dimensions that do not match encoded WebP dimensions', async () => {
    await expect(
      resizeBase64ImageToWebp(webpDataUrl, {
        sourceSize: { width: 1, height: 1 },
        targetSize: { width: 1, height: 1 },
      }),
    ).rejects.toThrow(
      'sourceSize 1x1 does not match encoded image dimensions 2x3',
    );
    expect(imageBackendMocks.getSharp).not.toHaveBeenCalled();
  });

  it('converts an unchanged PNG without reading metadata', async () => {
    const result = await resizeBase64ImageToWebp(pngDataUrl, {
      sourceSize: { width: 8, height: 6 },
      targetSize: { width: 8, height: 6 },
    });

    expect(result).toMatch(/^data:image\/webp;base64,/);
    expect(imageBackendMocks.metadata).not.toHaveBeenCalled();
    expect(imageBackendMocks.resize).not.toHaveBeenCalled();
    expect(imageBackendMocks.webp).toHaveBeenCalledWith({
      quality: 90,
      effort: 1,
    });
  });

  it('combines resize and WebP encoding in one backend operation', async () => {
    const result = await resizeBase64ImageToWebp(pngDataUrl, {
      sourceSize: { width: 8, height: 6 },
      targetSize: { width: 4, height: 3 },
      webpQuality: 80,
      webpEffort: 2,
    });

    expect(result).toMatch(/^data:image\/webp;base64,/);
    expect(imageBackendMocks.metadata).not.toHaveBeenCalled();
    expect(imageBackendMocks.resize).toHaveBeenCalledWith(4, 3);
    expect(imageBackendMocks.webp).toHaveBeenCalledWith({
      quality: 80,
      effort: 2,
    });
    expect(imageBackendMocks.webp).toHaveBeenCalledTimes(1);
  });
});

describe('convertBase64ImageToWebp image backend usage', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    imageBackendMocks.toBuffer.mockResolvedValue(encodedWebp);
  });

  it('reuses WebP bytes without loading an image backend', async () => {
    await expect(convertBase64ImageToWebp(webpDataUrl)).resolves.toBe(
      webpDataUrl,
    );
    expect(imageBackendMocks.getSharp).not.toHaveBeenCalled();
  });

  it('encodes PNG to WebP without reading dimensions', async () => {
    await expect(convertBase64ImageToWebp(pngDataUrl)).resolves.toMatch(
      /^data:image\/webp;base64,/,
    );
    expect(imageBackendMocks.metadata).not.toHaveBeenCalled();
    expect(imageBackendMocks.webp).toHaveBeenCalledTimes(1);
  });
});
