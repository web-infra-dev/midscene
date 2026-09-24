import { Buffer } from 'node:buffer';
import type { Rect } from '../types';
import { createImgBase64ByFormat, parseBase64 } from './base64';
import { getImageBackend } from './image-backend';
import { detectScreenshotImageFormatFromBuffer } from './image-format';
import {
  type ScreenshotImageOutputFormat,
  screenshotEncodeOptions,
} from './screenshot-encoding';

export {
  photonFromBase64,
  photonToBase64,
  paddingToMatchBlock,
} from './backends/photon-compat';

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

export async function paddingToMatchBlockByBase64(
  imageBase64: string,
  blockSize = 28,
  outputFormat: ScreenshotImageOutputFormat = 'jpeg',
): Promise<{ width: number; height: number; imageBase64: string }> {
  if (!Number.isSafeInteger(blockSize) || blockSize <= 0) {
    throw new Error('blockSize must be a positive safe integer');
  }
  const { body } = parseBase64(imageBase64);
  const bytes = Buffer.from(body, 'base64');
  const backend = await getImageBackend();
  const size = await backend.info(bytes);
  const width = Math.ceil(size.width / blockSize) * blockSize;
  const height = Math.ceil(size.height / blockSize) * blockSize;
  const format = detectScreenshotImageFormatFromBuffer(bytes);
  if (!format)
    throw new Error('imageBase64 must contain a PNG, JPEG, or WebP image');
  if (
    width === size.width &&
    height === size.height &&
    format === outputFormat
  ) {
    return {
      width,
      height,
      imageBase64: createImgBase64ByFormat(format, body),
    };
  }
  const result = await backend.transform(
    { bytes, format },
    [{ type: 'pad', right: width - size.width, bottom: height - size.height }],
    screenshotEncodeOptions(outputFormat),
  );
  return {
    width,
    height,
    imageBase64: createImgBase64ByFormat(
      outputFormat,
      Buffer.from(result).toString('base64'),
    ),
  };
}

export async function cropByRect(
  imageBase64: string,
  rect: Rect,
  outputFormat: ScreenshotImageOutputFormat = 'jpeg',
): Promise<{ width: number; height: number; imageBase64: string }> {
  const { body, mimeType } = parseBase64(imageBase64);
  const left = Math.trunc(rect.left);
  const top = Math.trunc(rect.top);
  const width = Math.trunc(rect.left + rect.width) - left;
  const height = Math.trunc(rect.top + rect.height) - top;
  const backend = await getImageBackend();
  const result = await backend.transform(
    { bytes: Buffer.from(body, 'base64'), format: mimeType.split('/')[1] },
    [{ type: 'crop', rect: { left, top, width, height } }],
    screenshotEncodeOptions(outputFormat),
  );
  return {
    width,
    height,
    imageBase64: createImgBase64ByFormat(
      outputFormat,
      Buffer.from(result).toString('base64'),
    ),
  };
}

/** Scale and encode, including scale=1, preserving this legacy API's contract. */
export async function scaleImage(
  imageBase64: string,
  scale: number,
  outputFormat: ScreenshotImageOutputFormat = 'jpeg',
): Promise<{ width: number; height: number; imageBase64: string }> {
  if (!Number.isFinite(scale) || scale <= 0)
    throw new Error('Scale factor must be positive');
  const { body, mimeType } = parseBase64(imageBase64);
  const bytes = Buffer.from(body, 'base64');
  const backend = await getImageBackend();
  const size = await backend.info(bytes);
  const width = Math.round(size.width * scale);
  const height = Math.round(size.height * scale);
  if (width <= 0 || height <= 0)
    throw new Error('Scaled dimensions must be positive');
  const result = await backend.transform(
    { bytes, format: mimeType.split('/')[1] },
    [{ type: 'resize', width, height }],
    screenshotEncodeOptions(outputFormat),
  );
  return {
    width,
    height,
    imageBase64: createImgBase64ByFormat(
      outputFormat,
      Buffer.from(result).toString('base64'),
    ),
  };
}
