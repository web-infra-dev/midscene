import { prepareScreenshotForPersistence } from '@/agent/screenshot-preparation';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

import * as imgActual from '@midscene/shared/img' with {
  rstest: 'importActual',
};

const imageMocks = rs.hoisted(() => ({
  convertBase64ImageToWebp: rs.fn(),
  imageInfoOfBase64: rs.fn(),
  resizeBase64ImageToWebp: rs.fn(),
}));

rs.mock('@midscene/shared/img', () => ({
  ...imgActual,
  ...imageMocks,
}));

describe('prepareScreenshotForPersistence', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    imageMocks.convertBase64ImageToWebp.mockResolvedValue(
      'data:image/webp;base64,prepared',
    );
  });

  it('normalizes an unscaled frame without reading image dimensions', async () => {
    await expect(
      prepareScreenshotForPersistence('data:image/webp;base64,frame'),
    ).resolves.toBe('data:image/webp;base64,prepared');

    expect(imageMocks.convertBase64ImageToWebp).toHaveBeenCalledWith(
      'data:image/webp;base64,frame',
      { webpQuality: 90, webpEffort: 1 },
    );
    expect(imageMocks.imageInfoOfBase64).not.toHaveBeenCalled();
    expect(imageMocks.resizeBase64ImageToWebp).not.toHaveBeenCalled();
  });

  it('uses the full preparation pipeline when the frame must be shrunk', async () => {
    imageMocks.imageInfoOfBase64.mockResolvedValue({ width: 8, height: 6 });
    imageMocks.resizeBase64ImageToWebp.mockResolvedValue(
      'data:image/webp;base64,resized',
    );

    await expect(
      prepareScreenshotForPersistence('data:image/png;base64,frame', {
        shrinkFactor: 2,
      }),
    ).resolves.toBe('data:image/webp;base64,resized');

    expect(imageMocks.imageInfoOfBase64).toHaveBeenCalledOnce();
    expect(imageMocks.resizeBase64ImageToWebp).toHaveBeenCalledWith(
      'data:image/png;base64,frame',
      {
        sourceSize: { width: 8, height: 6 },
        targetSize: { width: 4, height: 3 },
        webpQuality: 90,
        webpEffort: 1,
      },
    );
    expect(imageMocks.convertBase64ImageToWebp).not.toHaveBeenCalled();
  });
});
