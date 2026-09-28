import { Buffer } from 'node:buffer';
import {
  type ScreenshotImageFormat,
  detectScreenshotImageFormatFromBuffer,
  screenshotImageFormatFromMimeType,
  screenshotImageMimeType,
} from './image-format';

export interface ParseScreenshotBase64Options {
  label?: string;
}

export const createImgBase64ByFormat = (format: string, body: string) =>
  `data:image/${format};base64,${body.replace(/\s/g, '')}`;

/**
 * Split an image data URL for a string protocol. Trusts the declared MIME type:
 * this does not identify bytes or validate image content. Raw Base64 is not a
 * data URL; screenshot callers must use EncodedImage.fromBase64 instead.
 * General reference-image formats (including GIF, BMP and SVG) are preserved.
 */
export function splitImageDataUrl(dataUrl: string): {
  mimeType: `image/${string}`;
  body: string;
} {
  const match = dataUrl
    .trim()
    .match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]*)$/i);
  if (!match) throw new Error('Expected a base64 image data URL');
  return {
    mimeType: match[1].toLowerCase() as `image/${string}`,
    body: match[2].replace(/\s/g, ''),
  };
}

/**
 * Screenshot ingress: validate Base64 syntax and identify PNG/JPEG/WebP from
 * bytes, checking any declared MIME against that signature. This does not decode
 * pixels or promise a complete image. Only bytes and format enter the pipeline.
 */
export function parseScreenshotBase64(
  base64: string,
  options?: ParseScreenshotBase64Options,
): { bytes: Buffer; format: ScreenshotImageFormat } {
  const label = options?.label ?? 'screenshot base64';
  if (typeof base64 !== 'string' || !base64.trim())
    throw new Error(`${label} cannot be empty`);
  const input = base64.trim();
  const match = input.match(/^data:image\/(png|jpe?g|webp);base64,([\s\S]*)$/i);
  if (!match && /^data:/i.test(input)) {
    throw new Error(
      `${label} must be a PNG/JPEG/WebP data URI or raw PNG/JPEG/WebP base64 string`,
    );
  }
  const body = (match?.[2] ?? input).replace(/\s/g, '');
  if (
    !body ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(body) ||
    body.length % 4 === 1 ||
    (body.includes('=') && body.length % 4 !== 0)
  ) {
    throw new Error(`${label} contains invalid base64 image data`);
  }
  const bytes = Buffer.from(body, 'base64');
  const format = detectScreenshotImageFormatFromBuffer(bytes);
  if (!format)
    throw new Error(`${label} does not contain a PNG, JPEG, or WebP image`);
  const declared = match
    ? screenshotImageFormatFromMimeType(`image/${match[1]}`)
    : undefined;
  if (declared && declared !== format) {
    throw new Error(
      `${label} declares ${screenshotImageMimeType(declared)} but encoded bytes are ${screenshotImageMimeType(format)}`,
    );
  }
  return { bytes, format };
}
