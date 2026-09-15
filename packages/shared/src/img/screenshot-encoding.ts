import { Buffer } from 'node:buffer';
import type { PhotonImage as PhotonImageType } from '@silvia-odwyer/photon';
import type { Sharp } from 'sharp';
import { encodeRgbaToWebp } from './browser-webp-encoder';
import getSharp from './get-sharp';
import { isValidWebPImageBuffer } from './info';

export const DEFAULT_JPEG_SCREENSHOT_QUALITY = 90;
export const DEFAULT_WEBP_SCREENSHOT_QUALITY = 90;
export const DEFAULT_WEBP_SCREENSHOT_EFFORT = 1;

export interface WebpScreenshotEncodeOptions {
  /** WebP quality from 1 to 100. Defaults to 90. */
  webpQuality?: number;
  /** Sharp encoder CPU effort from 0 to 6. Defaults to 1. */
  webpEffort?: number;
}

/** Explicit output choices for pixel-changing screenshot transforms. */
export type ScreenshotImageOutputFormat = 'jpeg' | 'webp';

export type ScreenshotImageEncodeOptions =
  | { format: 'jpeg'; quality: number; chromaSubsampling?: '4:4:4' }
  | { format: 'webp'; quality: number; effort: number };

interface BrowserImagePixels {
  get_raw_pixels(): Uint8Array;
  get_width(): number;
  get_height(): number;
}

export function assertValidJpegQuality(jpegQuality: number): void {
  if (!Number.isInteger(jpegQuality) || jpegQuality < 1 || jpegQuality > 100) {
    throw new Error(
      `jpegQuality must be an integer between 1 and 100. Received: ${jpegQuality}`,
    );
  }
}

export function resolveWebpScreenshotEncodeOptions(
  options: WebpScreenshotEncodeOptions = {},
): Required<WebpScreenshotEncodeOptions> {
  const webpQuality = options.webpQuality ?? DEFAULT_WEBP_SCREENSHOT_QUALITY;
  const webpEffort = options.webpEffort ?? DEFAULT_WEBP_SCREENSHOT_EFFORT;
  if (!Number.isInteger(webpQuality) || webpQuality < 1 || webpQuality > 100) {
    throw new Error(
      `webpQuality must be an integer between 1 and 100. Received: ${webpQuality}`,
    );
  }
  if (!Number.isInteger(webpEffort) || webpEffort < 0 || webpEffort > 6) {
    throw new Error(
      `webpEffort must be an integer between 0 and 6. Received: ${webpEffort}`,
    );
  }
  return { webpQuality, webpEffort };
}

export function screenshotEncodeOptions(
  format: ScreenshotImageOutputFormat,
): ScreenshotImageEncodeOptions {
  if (format === 'jpeg') {
    return { format, quality: DEFAULT_JPEG_SCREENSHOT_QUALITY };
  }
  return {
    format,
    quality: DEFAULT_WEBP_SCREENSHOT_QUALITY,
    effort: DEFAULT_WEBP_SCREENSHOT_EFFORT,
  };
}

export function assertWebpBuffer(buffer: Uint8Array, label: string): void {
  if (!isValidWebPImageBuffer(Buffer.from(buffer))) {
    throw new Error(`${label} did not produce a valid WebP image`);
  }
}

export async function encodeBrowserImageToWebp(
  image: BrowserImagePixels,
  quality: number,
): Promise<Buffer> {
  const output = Buffer.from(
    await encodeRgbaToWebp({
      pixels: image.get_raw_pixels(),
      width: image.get_width(),
      height: image.get_height(),
      quality,
    }),
  );
  assertWebpBuffer(output, 'Browser image encoder');
  return output;
}

export async function encodePhotonImage(
  image: PhotonImageType,
  options: ScreenshotImageEncodeOptions,
): Promise<Buffer> {
  if (options.format === 'jpeg') {
    return Buffer.from(image.get_bytes_jpeg(options.quality));
  }
  return encodeBrowserImageToWebp(image, options.quality);
}

export async function encodeSharpImage(
  image: Sharp,
  options: ScreenshotImageEncodeOptions,
  label: string,
): Promise<Buffer> {
  const output = await (options.format === 'jpeg'
    ? image.jpeg({
        quality: options.quality,
        chromaSubsampling: options.chromaSubsampling,
      })
    : image.webp({ quality: options.quality, effort: options.effort })
  ).toBuffer();
  if (options.format === 'webp') {
    assertWebpBuffer(output, label);
  }
  return output;
}

export async function encodeRgbaWithSharp(
  pixels: Uint8Array,
  width: number,
  height: number,
  format: ScreenshotImageOutputFormat,
): Promise<Buffer> {
  const Sharp = await getSharp();
  const options = screenshotEncodeOptions(format);
  return encodeSharpImage(
    Sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } }),
    options.format === 'jpeg'
      ? { ...options, chromaSubsampling: '4:4:4' }
      : options,
    'Sharp RGBA screenshot encoding',
  );
}
