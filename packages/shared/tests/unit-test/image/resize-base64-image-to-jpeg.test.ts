import { beforeEach, describe, expect, it, rs } from '@rstest/core';

const imageBackendMocks = rs.hoisted(() => {
  const metadata = rs.fn();
  const toBuffer = rs.fn();
  const jpeg = rs.fn(() => ({ toBuffer }));
  const resize = rs.fn(() => ({ jpeg }));
  const sharp = rs.fn(() => ({ jpeg, metadata, resize }));
  const getSharp = rs.fn(async () => sharp);

  return { getSharp, jpeg, metadata, resize, sharp, toBuffer };
});

rs.mock('@/img/get-sharp', () => ({
  default: imageBackendMocks.getSharp,
}));

import {
  constrainBase64ImageToMaxSize,
  convertBase64ImageToJpeg,
  resizeBase64ImageToJpeg,
} from '@/img';

const pngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQqbiDFTEMpAQAorNDgTX/VEoAAAAASUVORK5CYII=';
const jpegDataUrl =
  'data:image/jpeg;base64,/9j/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAADAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ9AFA4//9k=';

describe('resizeBase64ImageToJpeg image backend usage', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    imageBackendMocks.metadata.mockResolvedValue({ width: 8, height: 6 });
    imageBackendMocks.toBuffer.mockResolvedValue(
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    );
  });

  it('reuses an unchanged JPEG before loading an image backend', async () => {
    const result = await resizeBase64ImageToJpeg(jpegDataUrl, {
      sourceSize: { width: 4, height: 3 },
      targetSize: { width: 4, height: 3 },
    });

    expect(result).toBe(jpegDataUrl);
    expect(imageBackendMocks.getSharp).not.toHaveBeenCalled();
  });

  it('rejects source dimensions that do not match the encoded image', async () => {
    await expect(
      resizeBase64ImageToJpeg(jpegDataUrl, {
        sourceSize: { width: 1, height: 1 },
        targetSize: { width: 1, height: 1 },
      }),
    ).rejects.toThrow(
      'sourceSize 1x1 does not match encoded image dimensions 4x3',
    );
    expect(imageBackendMocks.getSharp).not.toHaveBeenCalled();
  });

  it('converts an unchanged PNG without reading metadata again', async () => {
    const result = await resizeBase64ImageToJpeg(pngDataUrl, {
      sourceSize: { width: 8, height: 6 },
      targetSize: { width: 8, height: 6 },
    });

    expect(result).toMatch(/^data:image\/jpeg;base64,/);
    expect(imageBackendMocks.metadata).not.toHaveBeenCalled();
    expect(imageBackendMocks.resize).not.toHaveBeenCalled();
    expect(imageBackendMocks.jpeg).toHaveBeenCalledWith({ quality: 90 });
  });

  it('resizes to JPEG without reading known source dimensions again', async () => {
    const result = await resizeBase64ImageToJpeg(pngDataUrl, {
      sourceSize: { width: 8, height: 6 },
      targetSize: { width: 4, height: 3 },
    });

    expect(result).toMatch(/^data:image\/jpeg;base64,/);
    expect(imageBackendMocks.metadata).not.toHaveBeenCalled();
    expect(imageBackendMocks.resize).toHaveBeenCalledWith(4, 3);
    expect(imageBackendMocks.jpeg).toHaveBeenCalledWith({ quality: 90 });
  });

  it('reads encoded dimensions without backend metadata when source dimensions are not provided', async () => {
    const result = await resizeBase64ImageToJpeg(pngDataUrl, {
      targetSize: { width: 8, height: 6 },
    });

    expect(result).toMatch(/^data:image\/jpeg;base64,/);
    expect(imageBackendMocks.metadata).not.toHaveBeenCalled();
    expect(imageBackendMocks.getSharp).toHaveBeenCalledTimes(1);
    expect(imageBackendMocks.resize).not.toHaveBeenCalled();
  });
});

describe('constrainBase64ImageToMaxSize image backend usage', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    imageBackendMocks.toBuffer.mockResolvedValue(
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    );
  });

  it('returns an already bounded image without loading an image backend', async () => {
    await expect(
      constrainBase64ImageToMaxSize(pngDataUrl, { maxSize: 8 }),
    ).resolves.toBe(pngDataUrl);

    expect(imageBackendMocks.getSharp).not.toHaveBeenCalled();
    expect(imageBackendMocks.metadata).not.toHaveBeenCalled();
  });

  it('parses once and resizes the longest edge while preserving aspect ratio', async () => {
    await expect(
      constrainBase64ImageToMaxSize(pngDataUrl, {
        maxSize: 4,
        jpegQuality: 82,
      }),
    ).resolves.toMatch(/^data:image\/jpeg;base64,/);

    expect(imageBackendMocks.metadata).not.toHaveBeenCalled();
    expect(imageBackendMocks.resize).toHaveBeenCalledWith(4, 3);
    expect(imageBackendMocks.jpeg).toHaveBeenCalledWith({ quality: 82 });
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'rejects invalid maxSize %s',
    async (maxSize) => {
      await expect(
        constrainBase64ImageToMaxSize(pngDataUrl, { maxSize }),
      ).rejects.toThrow('maxSize must be a positive integer');
    },
  );
});

describe('convertBase64ImageToJpeg image backend usage', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    imageBackendMocks.toBuffer.mockResolvedValue(
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    );
  });

  it('reuses JPEG bytes without loading an image backend', async () => {
    await expect(convertBase64ImageToJpeg(jpegDataUrl, 90)).resolves.toBe(
      jpegDataUrl,
    );
    expect(imageBackendMocks.getSharp).not.toHaveBeenCalled();
    expect(imageBackendMocks.metadata).not.toHaveBeenCalled();
  });

  it('converts PNG without reading image dimensions', async () => {
    await expect(convertBase64ImageToJpeg(pngDataUrl, 90)).resolves.toMatch(
      /^data:image\/jpeg;base64,/,
    );
    expect(imageBackendMocks.metadata).not.toHaveBeenCalled();
    expect(imageBackendMocks.jpeg).toHaveBeenCalledWith({ quality: 90 });
  });
});
