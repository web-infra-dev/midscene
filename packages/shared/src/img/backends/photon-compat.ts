import { Buffer } from 'node:buffer';
import type { PhotonImage as PhotonImageType } from '@silvia-odwyer/photon';
import { createImgBase64ByFormat, parseBase64 } from '../base64';
import getPhoton from '../get-photon';
import {
  DEFAULT_JPEG_SCREENSHOT_QUALITY,
  type ScreenshotImageOutputFormat,
  screenshotEncodeOptions,
} from '../screenshot-encoding';
import { encodePhotonImage } from './photon';

// Compatibility boundary for APIs that explicitly expose Photon objects.
// New consumers use ImageBackend, whose resource ownership is private.
export async function photonFromBase64(
  base64: string,
): Promise<PhotonImageType> {
  const { PhotonImage } = await getPhoton();
  const { body } = parseBase64(base64);
  return PhotonImage.new_from_base64(body);
}

// https://help.aliyun.com/zh/model-studio/user-guide/vision/
export async function paddingToMatchBlock(
  image: PhotonImageType,
  blockSize = 28,
): Promise<{
  width: number;
  height: number;
  image: PhotonImageType;
}> {
  if (!Number.isSafeInteger(blockSize) || blockSize <= 0) {
    throw new Error('blockSize must be a positive safe integer');
  }
  const width = image.get_width();
  const height = image.get_height();
  const targetWidth = Math.ceil(width / blockSize) * blockSize;
  const targetHeight = Math.ceil(height / blockSize) * blockSize;

  if (targetWidth === width && targetHeight === height) {
    return { width, height, image };
  }

  const { padding_right, padding_bottom, Rgba } = await getPhoton();
  const rightPadding = targetWidth - width;
  const bottomPadding = targetHeight - height;

  let result = image;
  try {
    if (rightPadding > 0) {
      result = padding_right(
        result,
        rightPadding,
        new Rgba(255, 255, 255, 255),
      );
    }
    if (bottomPadding > 0) {
      const previousResult = result;
      result = padding_bottom(
        previousResult,
        bottomPadding,
        new Rgba(255, 255, 255, 255),
      );
      if (previousResult !== image) {
        previousResult.free();
      }
    }

    return { width: targetWidth, height: targetHeight, image: result };
  } catch (error) {
    // The caller still owns the input. Only dispose intermediates created here.
    if (result !== image) result.free();
    throw error;
  }
}

export async function photonToBase64(
  image: PhotonImageType,
  quality = DEFAULT_JPEG_SCREENSHOT_QUALITY,
  outputFormat: ScreenshotImageOutputFormat = 'jpeg',
): Promise<string> {
  const defaultOptions = screenshotEncodeOptions(outputFormat);
  const bytes = await encodePhotonImage(image, {
    ...defaultOptions,
    quality,
  });
  return createImgBase64ByFormat(
    outputFormat,
    Buffer.from(bytes).toString('base64'),
  );
}
