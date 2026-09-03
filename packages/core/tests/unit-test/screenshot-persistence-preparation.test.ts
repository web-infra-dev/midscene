import { prepareScreenshotForPersistence } from '@/agent/screenshot-preparation';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

import * as imgActual from '@midscene/shared/img' with {
  rstest: 'importActual',
};

const imageMocks = rs.hoisted(() => ({
  convertBase64ImageToJpeg: rs.fn(),
  imageInfoOfBase64: rs.fn(),
  resizeBase64ImageToJpeg: rs.fn(),
}));

rs.mock('@midscene/shared/img', () => ({
  ...imgActual,
  ...imageMocks,
}));

describe('prepareScreenshotForPersistence', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    imageMocks.convertBase64ImageToJpeg.mockResolvedValue(
      'data:image/jpeg;base64,prepared',
    );
  });

  it('normalizes an unscaled frame without reading image dimensions', async () => {
    await expect(
      prepareScreenshotForPersistence('data:image/jpeg;base64,frame'),
    ).resolves.toBe('data:image/jpeg;base64,prepared');

    expect(imageMocks.convertBase64ImageToJpeg).toHaveBeenCalledWith(
      'data:image/jpeg;base64,frame',
      90,
    );
    expect(imageMocks.imageInfoOfBase64).not.toHaveBeenCalled();
    expect(imageMocks.resizeBase64ImageToJpeg).not.toHaveBeenCalled();
  });

  it('uses the full preparation pipeline when the frame must be shrunk', async () => {
    imageMocks.imageInfoOfBase64.mockResolvedValue({ width: 8, height: 6 });
    imageMocks.resizeBase64ImageToJpeg.mockResolvedValue(
      'data:image/jpeg;base64,resized',
    );

    await expect(
      prepareScreenshotForPersistence('data:image/png;base64,frame', {
        shrinkFactor: 2,
      }),
    ).resolves.toBe('data:image/jpeg;base64,resized');

    expect(imageMocks.imageInfoOfBase64).toHaveBeenCalledOnce();
    expect(imageMocks.resizeBase64ImageToJpeg).toHaveBeenCalledWith(
      'data:image/png;base64,frame',
      {
        sourceSize: { width: 8, height: 6 },
        targetSize: { width: 4, height: 3 },
        jpegQuality: 90,
      },
    );
    expect(imageMocks.convertBase64ImageToJpeg).not.toHaveBeenCalled();
  });
});
