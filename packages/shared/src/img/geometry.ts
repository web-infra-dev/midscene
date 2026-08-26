import { Buffer } from 'node:buffer';
import type { PhotonImage as PhotonImageType } from '@silvia-odwyer/photon';
import { getDebug } from '../logger';
import type { Rect } from '../types';
import { ifInNode } from '../utils';
import { createImgBase64ByFormat, parseBase64 } from './base64';
import getPhoton from './get-photon';
import getSharp from './get-sharp';
import { detectScreenshotImageFormatFromBuffer } from './image-format';
import {
  DEFAULT_JPEG_SCREENSHOT_QUALITY,
  type ScreenshotImageOutputFormat,
  encodePhotonImage,
  encodeSharpImage,
  screenshotEncodeOptions,
} from './screenshot-encoding';

const imgDebug = getDebug('img');

/** Calculate dimensions that fit GPT-4o's recommended image bounds. */
export function zoomForGPT4o(originalWidth: number, originalHeight: number) {
  const maxWidth = 2048;
  const maxHeight = 768;
  let newWidth = originalWidth;
  let newHeight = originalHeight;
  const aspectRatio = originalWidth / originalHeight;

  if (originalWidth > maxWidth) {
    newWidth = maxWidth;
    newHeight = newWidth / aspectRatio;
  }
  if (newHeight > maxHeight) {
    newHeight = maxHeight;
    newWidth = newHeight * aspectRatio;
  }

  return {
    width: Math.round(newWidth),
    height: Math.round(newHeight),
  };
}

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
  if (rightPadding > 0) {
    result = padding_right(result, rightPadding, new Rgba(255, 255, 255, 255));
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
}

export async function paddingToMatchBlockByBase64(
  imageBase64: string,
  blockSize = 28,
  outputFormat: ScreenshotImageOutputFormat = 'jpeg',
): Promise<{
  width: number;
  height: number;
  imageBase64: string;
}> {
  if (ifInNode) {
    const { body } = parseBase64(imageBase64);
    const inputBuffer = Buffer.from(body, 'base64');
    const Sharp = await getSharp();
    const metadata = await Sharp(inputBuffer).metadata();
    const width = metadata.width;
    const height = metadata.height;
    if (!width || !height) {
      throw new Error('Failed to get image dimensions');
    }

    const targetWidth = Math.ceil(width / blockSize) * blockSize;
    const targetHeight = Math.ceil(height / blockSize) * blockSize;
    const inputFormat = detectScreenshotImageFormatFromBuffer(inputBuffer);
    if (!inputFormat) {
      throw new Error('imageBase64 must contain a PNG, JPEG, or WebP image');
    }
    if (
      targetWidth === width &&
      targetHeight === height &&
      inputFormat === outputFormat
    ) {
      return {
        width,
        height,
        imageBase64: createImgBase64ByFormat(outputFormat, body),
      };
    }

    const image =
      targetWidth === width && targetHeight === height
        ? Sharp(inputBuffer)
        : Sharp(inputBuffer).extend({
            right: targetWidth - width,
            bottom: targetHeight - height,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          });
    const output = await encodeSharpImage(
      image,
      screenshotEncodeOptions(outputFormat),
      'Sharp padding',
    );
    return {
      width: targetWidth,
      height: targetHeight,
      imageBase64: createImgBase64ByFormat(
        outputFormat,
        output.toString('base64'),
      ),
    };
  }

  const photonImage = await photonFromBase64(imageBase64);
  try {
    const paddedResult = await paddingToMatchBlock(photonImage, blockSize);
    const result = {
      width: paddedResult.width,
      height: paddedResult.height,
      imageBase64: await photonToBase64(
        paddedResult.image,
        DEFAULT_JPEG_SCREENSHOT_QUALITY,
        outputFormat,
      ),
    };
    if (paddedResult.image !== photonImage) {
      paddedResult.image.free();
    }
    return result;
  } finally {
    photonImage.free();
  }
}

export async function cropByRect(
  imageBase64: string,
  rect: Rect,
  outputFormat: ScreenshotImageOutputFormat = 'jpeg',
): Promise<{
  width: number;
  height: number;
  imageBase64: string;
}> {
  if (ifInNode) {
    const { body } = parseBase64(imageBase64);
    const Sharp = await getSharp();
    const left = Math.trunc(rect.left);
    const top = Math.trunc(rect.top);
    const width = Math.trunc(rect.left + rect.width) - left;
    const height = Math.trunc(rect.top + rect.height) - top;
    const image = Sharp(Buffer.from(body, 'base64')).extract({
      left,
      top,
      width,
      height,
    });
    const output = await encodeSharpImage(
      image,
      screenshotEncodeOptions(outputFormat),
      'Sharp crop',
    );
    return {
      width,
      height,
      imageBase64: createImgBase64ByFormat(
        outputFormat,
        output.toString('base64'),
      ),
    };
  }

  const { crop } = await getPhoton();
  const photonImage = await photonFromBase64(imageBase64);
  const { left, top, width, height } = rect;
  const cropped = crop(photonImage, left, top, left + width, top + height);
  photonImage.free();

  try {
    return {
      width: cropped.get_width(),
      height: cropped.get_height(),
      imageBase64: await photonToBase64(
        cropped,
        DEFAULT_JPEG_SCREENSHOT_QUALITY,
        outputFormat,
      ),
    };
  } finally {
    cropped.free();
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

/** Scale an image by a positive factor using Sharp or Photon. */
export async function scaleImage(
  imageBase64: string,
  scale: number,
  outputFormat: ScreenshotImageOutputFormat = 'jpeg',
): Promise<{
  width: number;
  height: number;
  imageBase64: string;
}> {
  if (scale <= 0) {
    throw new Error('Scale factor must be positive');
  }

  const { body } = parseBase64(imageBase64);
  const buffer = Buffer.from(body, 'base64');
  const scaleStartTime = Date.now();
  imgDebug(`scaleImage start, scale factor: ${scale}`);

  if (ifInNode) {
    const Sharp = await getSharp();
    const metadata = await Sharp(buffer).metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;
    if (originalWidth === 0 || originalHeight === 0) {
      throw new Error('Failed to get image dimensions');
    }

    const newWidth = Math.round(originalWidth * scale);
    const newHeight = Math.round(originalHeight * scale);
    const resizedBuffer = await encodeSharpImage(
      Sharp(buffer).resize(newWidth, newHeight, {
        kernel: 'lanczos3',
        fit: 'fill',
      }),
      screenshotEncodeOptions(outputFormat),
      'Sharp scale',
    );
    imgDebug(
      `scaleImage done (Sharp): ${originalWidth}x${originalHeight} -> ${newWidth}x${newHeight} (scale=${scale}), cost: ${Date.now() - scaleStartTime}ms`,
    );
    return {
      width: newWidth,
      height: newHeight,
      imageBase64: createImgBase64ByFormat(
        outputFormat,
        resizedBuffer.toString('base64'),
      ),
    };
  }

  const { PhotonImage, SamplingFilter, resize } = await getPhoton();
  const inputImage = PhotonImage.new_from_byteslice(new Uint8Array(buffer));
  const originalWidth = inputImage.get_width();
  const originalHeight = inputImage.get_height();
  if (!originalWidth || !originalHeight) {
    inputImage.free();
    throw new Error('Failed to get image dimensions');
  }

  const newWidth = Math.round(originalWidth * scale);
  const newHeight = Math.round(originalHeight * scale);
  const outputImage = resize(
    inputImage,
    newWidth,
    newHeight,
    SamplingFilter.CatmullRom,
  );
  try {
    const resizedBuffer = await encodePhotonImage(
      outputImage,
      screenshotEncodeOptions(outputFormat),
    );
    imgDebug(
      `scaleImage done (Photon): ${originalWidth}x${originalHeight} -> ${newWidth}x${newHeight} (scale=${scale}), cost: ${Date.now() - scaleStartTime}ms`,
    );
    return {
      width: newWidth,
      height: newHeight,
      imageBase64: createImgBase64ByFormat(
        outputFormat,
        resizedBuffer.toString('base64'),
      ),
    };
  } finally {
    inputImage.free();
    outputImage.free();
  }
}
