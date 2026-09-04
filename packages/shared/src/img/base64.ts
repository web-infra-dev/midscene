import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import {
  type ScreenshotImageFormat,
  detectScreenshotImageFormatFromBuffer,
  inferScreenshotImageFormatFromBase64,
  screenshotImageMimeType,
} from './image-format';

const base64ImageDataUrlPattern = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i;
const supportedScreenshotDataUriPattern =
  /^data:image\/(png|jpe?g|webp);base64,([\s\S]*)$/i;
const rawBase64BodyPattern = /^[A-Za-z0-9+/=\s]+$/;

export type JpegBase64DataUrl = `data:image/jpeg;base64,${string}`;
export type WebpBase64DataUrl = `data:image/webp;base64,${string}`;

export interface NormalizeScreenshotBase64Options {
  label?: string;
}

export const normalizeBase64Body = (body: string) => body.replace(/\s/g, '');

export function detectImageMimeTypeFromBuffer(
  buffer: Buffer,
): string | undefined {
  const screenshotFormat = detectScreenshotImageFormatFromBuffer(buffer);
  if (screenshotFormat) {
    return screenshotImageMimeType(screenshotFormat);
  }
  if (buffer.length >= 6 && buffer.subarray(0, 3).toString('ascii') === 'GIF') {
    return 'image/gif';
  }
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return 'image/bmp';
  }
  return undefined;
}

export const inferBase64ImageFormat = (
  base64Body: string,
): ScreenshotImageFormat =>
  inferScreenshotImageFormatFromBase64(base64Body) ?? 'jpeg';

export const createImgBase64ByFormat = (format: string, body: string) => {
  return `data:image/${format};base64,${normalizeBase64Body(body)}`;
};

export const normalizeScreenshotBase64 = (
  base64: string,
  options?: NormalizeScreenshotBase64Options,
) => {
  const label = options?.label ?? 'screenshot base64';
  const trimmedBase64 = base64.trim();
  if (!trimmedBase64) {
    throw new Error(`${label} cannot be empty`);
  }

  const dataUriMatch = trimmedBase64.match(supportedScreenshotDataUriPattern);
  if (dataUriMatch) {
    const imageFormat: ScreenshotImageFormat =
      dataUriMatch[1].toLowerCase() === 'jpg'
        ? 'jpeg'
        : (dataUriMatch[1].toLowerCase() as ScreenshotImageFormat);
    const body = dataUriMatch[2];
    if (!normalizeBase64Body(body)) {
      throw new Error(`${label} cannot be empty`);
    }
    return createImgBase64ByFormat(imageFormat, body);
  }

  if (trimmedBase64.startsWith('data:')) {
    throw new Error(
      `${label} must be a PNG/JPEG/WebP data URI or raw PNG/JPEG/WebP base64 string`,
    );
  }

  if (!rawBase64BodyPattern.test(trimmedBase64)) {
    throw new Error(
      `${label} must be a PNG/JPEG/WebP data URI or raw PNG/JPEG/WebP base64 string`,
    );
  }

  const base64Body = normalizeBase64Body(trimmedBase64);
  const inferredFormat = inferScreenshotImageFormatFromBase64(base64Body);
  return createImgBase64ByFormat(inferredFormat ?? 'png', base64Body);
};

export const normalizeBase64Image = (base64: string) => {
  const trimmedBase64 = base64.trim();
  if (base64ImageDataUrlPattern.test(trimmedBase64)) {
    return trimmedBase64;
  }

  const base64Body = normalizeBase64Body(trimmedBase64);
  assert(base64Body, 'base64 image must include image data');
  return createImgBase64ByFormat(
    inferBase64ImageFormat(base64Body),
    base64Body,
  );
};

/** Parse a Base64 image data URL, or infer the MIME type for a raw body. */
export const parseBase64 = (
  fullBase64String: string,
): {
  mimeType: string;
  body: string;
} => {
  try {
    const separator = ';base64,';
    const index = fullBase64String.indexOf(separator);
    if (index === -1) {
      const body = normalizeBase64Body(fullBase64String);
      const mimeType = detectImageMimeTypeFromBuffer(
        Buffer.from(body, 'base64'),
      );
      if (!mimeType) {
        throw new Error('Invalid base64 string');
      }
      return { mimeType, body };
    }
    return {
      mimeType: fullBase64String.slice(5, index),
      body: normalizeBase64Body(
        fullBase64String.slice(index + separator.length),
      ),
    };
  } catch (error) {
    throw new Error(
      `parseBase64 fail because intput is not a valid base64 string: ${fullBase64String}`,
      { cause: error },
    );
  }
};
