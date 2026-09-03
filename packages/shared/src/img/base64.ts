import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import {
  type ScreenshotImageFormat,
  type ScreenshotImageMimeType,
  detectScreenshotImageFormatFromBuffer,
  inferScreenshotImageFormatFromBase64,
  screenshotImageExtension,
  screenshotImageFormatFromMimeType,
  screenshotImageMimeType,
} from './image-format';

const base64ImageDataUrlPattern = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i;
const supportedScreenshotDataUriPattern =
  /^data:image\/(png|jpe?g|webp);base64,([\s\S]*)$/i;

export type JpegBase64DataUrl = `data:image/jpeg;base64,${string}`;
export type WebpBase64DataUrl = `data:image/webp;base64,${string}`;

export interface NormalizeScreenshotBase64Options {
  label?: string;
}

export interface ParsedScreenshotBase64 {
  /** Canonical data URL whose MIME type matches the encoded bytes. */
  dataUrl: string;
  body: string;
  bytes: Buffer;
  format: ScreenshotImageFormat;
  mimeType: ScreenshotImageMimeType;
  extension: ScreenshotImageFormat;
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

/**
 * Parse a screenshot from a data URL or raw Base64 body.
 *
 * The encoded bytes are authoritative. A declared MIME type must describe the
 * same format; unsupported, empty, malformed, or mismatched inputs throw.
 */
export function parseScreenshotBase64(
  base64: string,
  options?: NormalizeScreenshotBase64Options,
): ParsedScreenshotBase64 {
  const label = options?.label ?? 'screenshot base64';
  if (typeof base64 !== 'string' || !base64.trim()) {
    throw new Error(`${label} cannot be empty`);
  }

  const trimmedBase64 = base64.trim();
  const dataUriMatch = trimmedBase64.match(supportedScreenshotDataUriPattern);
  if (!dataUriMatch && trimmedBase64.startsWith('data:')) {
    throw new Error(
      `${label} must be a PNG/JPEG/WebP data URI or raw PNG/JPEG/WebP base64 string`,
    );
  }

  const declaredFormat = dataUriMatch
    ? screenshotImageFormatFromMimeType(`image/${dataUriMatch[1]}`)
    : undefined;
  const body = normalizeBase64Body(dataUriMatch?.[2] ?? trimmedBase64);
  if (!body || !/^[A-Za-z0-9+/]*={0,2}$/.test(body) || body.length % 4 === 1) {
    throw new Error(`${label} contains invalid base64 image data`);
  }

  const bytes = Buffer.from(body, 'base64');
  const format = detectScreenshotImageFormatFromBuffer(bytes);
  if (!format) {
    throw new Error(`${label} does not contain a PNG, JPEG, or WebP image`);
  }
  if (declaredFormat && declaredFormat !== format) {
    throw new Error(
      `${label} declares ${screenshotImageMimeType(declaredFormat)} but encoded bytes are ${screenshotImageMimeType(format)}`,
    );
  }

  const mimeType = screenshotImageMimeType(format);
  return {
    dataUrl: createImgBase64ByFormat(format, body),
    body,
    bytes,
    format,
    mimeType,
    extension: screenshotImageExtension(format),
  };
}

export const normalizeScreenshotBase64 = (
  base64: string,
  options?: NormalizeScreenshotBase64Options,
) => parseScreenshotBase64(base64, options).dataUrl;

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
