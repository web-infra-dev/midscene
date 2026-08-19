import { beforeEach, describe, expect, it, vi } from 'vitest';

const imageBackendMocks = vi.hoisted(() => {
  const metadata = vi.fn();
  const toBuffer = vi.fn();
  const jpeg = vi.fn(() => ({ toBuffer }));
  const resize = vi.fn(() => ({ jpeg }));
  const sharp = vi.fn(() => ({ jpeg, metadata, resize }));
  const getSharp = vi.fn(async () => sharp);

  return { getSharp, jpeg, metadata, resize, sharp, toBuffer };
});

vi.mock('@/img/get-sharp', () => ({
  default: imageBackendMocks.getSharp,
}));

import { resizeBase64ImageToJpeg } from '@/img';

const pngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQqbiDFTEMpAQAorNDgTX/VEoAAAAASUVORK5CYII=';
const jpegDataUrl =
  'data:image/jpeg;base64,/9j/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAADAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAACP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ0AWYyP/9k=';

describe('resizeBase64ImageToJpeg image backend usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('reads metadata once when source dimensions are not provided', async () => {
    const result = await resizeBase64ImageToJpeg(pngDataUrl, {
      targetSize: { width: 8, height: 6 },
    });

    expect(result).toMatch(/^data:image\/jpeg;base64,/);
    expect(imageBackendMocks.metadata).toHaveBeenCalledTimes(1);
    expect(imageBackendMocks.resize).not.toHaveBeenCalled();
  });
});
