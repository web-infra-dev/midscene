import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PhotonImage as PhotonImageType } from '@silvia-odwyer/photon';
import { getDebug } from '../logger';
import type { Rect, Size } from '../types';
import { ifInNode } from '../utils';
import { encodeRgbaToWebp } from './browser-webp-encoder';
import getPhoton from './get-photon';
import getSharp from './get-sharp';
import {
  type ScreenshotImageFormat,
  detectScreenshotImageFormatFromBuffer,
  inferScreenshotImageFormatFromBase64,
  screenshotImageMimeType,
} from './image-format';
import { encodedImageInfoOfBuffer, isValidWebPImageBuffer } from './info';

const imgDebug = getDebug('img');

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

type ImageEncodeOptions =
  | { format: 'jpeg'; quality: number }
  | { format: 'webp'; quality: number; effort: number };

function assertWebpBuffer(buffer: Uint8Array, label: string): void {
  if (!isValidWebPImageBuffer(Buffer.from(buffer))) {
    throw new Error(`${label} did not produce a valid WebP image`);
  }
}

interface BrowserImagePixels {
  get_raw_pixels(): Uint8Array;
  get_width(): number;
  get_height(): number;
}

async function encodeBrowserImageToWebp(
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

/**
 * Saves a Base64-encoded image to a file
 *
 * @param options - An object containing the Base64-encoded image data and the output file path
 * @param options.base64Data - The Base64-encoded image data
 * @param options.outputPath - The path where the image will be saved
 * @throws Error if there is an error during the saving process
 */
export async function saveBase64Image(options: {
  base64Data: string;
  outputPath: string;
}): Promise<void> {
  const { base64Data, outputPath } = options;
  const { body } = parseBase64(base64Data);

  const imageBuffer = Buffer.from(body, 'base64');
  await writeFile(outputPath, imageBuffer);
}

interface ResizeImageBufferOptions {
  sourceSize?: Size;
  preserveOriginalWhenUnchanged: boolean;
  encode: ImageEncodeOptions;
}

async function resizeImageBuffer(
  inputFormat: string,
  inputData: Buffer,
  targetSize: Size,
  options: ResizeImageBufferOptions,
): Promise<{
  buffer: Buffer;
  format: string;
}> {
  if (typeof inputData === 'string') {
    throw Error('inputData is base64, use resizeImgBase64 instead');
  }

  assert(
    targetSize && targetSize.width > 0 && targetSize.height > 0,
    'newSize must be positive',
  );

  const resizeStartTime = Date.now();
  imgDebug(
    `resizeImg start, target size: ${targetSize.width}x${targetSize.height}`,
  );

  if (ifInNode) {
    const Sharp = await getSharp();
    let originalWidth = options.sourceSize?.width;
    let originalHeight = options.sourceSize?.height;
    if (!originalWidth || !originalHeight) {
      const metadata = await Sharp(inputData).metadata();
      originalWidth = metadata.width;
      originalHeight = metadata.height;
    }

    if (!originalWidth || !originalHeight) {
      throw Error('Undefined width or height from the input image.');
    }

    const dimensionsUnchanged =
      targetSize.width === originalWidth &&
      targetSize.height === originalHeight;
    if (options.preserveOriginalWhenUnchanged && dimensionsUnchanged) {
      return {
        buffer: inputData,
        format: inputFormat,
      };
    }

    const image = Sharp(inputData);
    const imageToEncode = dimensionsUnchanged
      ? image
      : image.resize(targetSize.width, targetSize.height);
    const resizedBuffer = await (options.encode.format === 'jpeg'
      ? imageToEncode.jpeg({ quality: options.encode.quality })
      : imageToEncode.webp({
          quality: options.encode.quality,
          effort: options.encode.effort,
        })
    ).toBuffer();
    if (options.encode.format === 'webp') {
      assertWebpBuffer(resizedBuffer, 'Sharp resize');
    }

    const resizeEndTime = Date.now();
    imgDebug(
      `resizeImg done (Sharp), target size: ${targetSize.width}x${targetSize.height}, cost: ${resizeEndTime - resizeStartTime}ms`,
    );

    return {
      buffer: resizedBuffer,
      format: options.encode.format,
    };
  }

  // browser environment: use Photon (or Canvas fallback)
  const { PhotonImage, SamplingFilter, resize } = await getPhoton();
  const inputBytes = new Uint8Array(inputData);
  // Support both sync (Photon) and async (Canvas fallback) versions
  const bytesliceResult = PhotonImage.new_from_byteslice(inputBytes);
  const inputImage =
    bytesliceResult instanceof Promise
      ? await bytesliceResult
      : bytesliceResult;
  const originalWidth = options.sourceSize?.width ?? inputImage.get_width();
  const originalHeight = options.sourceSize?.height ?? inputImage.get_height();

  if (!originalWidth || !originalHeight) {
    inputImage.free();
    throw Error('Undefined width or height from the input image.');
  }

  const dimensionsUnchanged =
    targetSize.width === originalWidth && targetSize.height === originalHeight;
  if (options.preserveOriginalWhenUnchanged && dimensionsUnchanged) {
    inputImage.free();
    return {
      buffer: inputData,
      format: inputFormat,
    };
  }

  let outputImage: PhotonImageType | undefined;
  let resizedBuffer: Buffer;
  try {
    outputImage = dimensionsUnchanged
      ? undefined
      : resize(
          inputImage,
          targetSize.width,
          targetSize.height,
          SamplingFilter.CatmullRom,
        );
    const imageToEncode = outputImage ?? inputImage;
    resizedBuffer =
      options.encode.format === 'jpeg'
        ? Buffer.from(imageToEncode.get_bytes_jpeg(options.encode.quality))
        : await encodeBrowserImageToWebp(imageToEncode, options.encode.quality);
  } finally {
    inputImage.free();
    outputImage?.free();
  }

  const resizeEndTime = Date.now();

  imgDebug(
    `resizeImg done (Photon), target size: ${targetSize.width}x${targetSize.height}, cost: ${resizeEndTime - resizeStartTime}ms`,
  );

  return {
    buffer: resizedBuffer,
    format: options.encode.format,
  };
}

/**
 * Resizes an image buffer.
 *
 * This API preserves the original bytes and format when the requested
 * dimensions are unchanged. When dimensions change, it returns JPEG. Callers
 * must inspect the returned `format` instead of assuming an output format.
 */
export async function resizeAndConvertImgBuffer(
  inputFormat: string,
  inputData: Buffer,
  newSize: Size,
): Promise<{
  buffer: Buffer;
  /** The actual encoded format of `buffer`, such as `png` or `jpeg`. */
  format: string;
}> {
  return resizeImageBuffer(inputFormat, inputData, newSize, {
    preserveOriginalWhenUnchanged: true,
    encode: { format: 'jpeg', quality: 90 },
  });
}

export const normalizeBase64Body = (body: string) => body.replace(/\s/g, '');

/** Convert an image buffer to JPEG without changing its dimensions. */
export async function convertImgBufferToJpeg(
  inputData: Buffer,
  quality = 90,
): Promise<Buffer> {
  if (ifInNode) {
    try {
      const Sharp = await getSharp();
      return await Sharp(inputData).jpeg({ quality }).toBuffer();
    } catch (error) {
      imgDebug('Sharp failed, falling back to Photon:', error);
    }
  }

  const mimeType = detectImageMimeTypeFromBuffer(inputData) ?? 'image/png';
  const photonImage = await photonFromBase64(
    `data:${mimeType};base64,${inputData.toString('base64')}`,
  );
  try {
    return Buffer.from(photonImage.get_bytes_jpeg(quality));
  } finally {
    photonImage.free();
  }
}

/** Convert an image buffer to a validated WebP image without resizing it. */
export async function convertImgBufferToWebp(
  inputData: Buffer,
  options: WebpScreenshotEncodeOptions = {},
): Promise<Buffer> {
  const webpQuality = options.webpQuality ?? DEFAULT_WEBP_SCREENSHOT_QUALITY;
  const webpEffort = options.webpEffort ?? DEFAULT_WEBP_SCREENSHOT_EFFORT;
  assertValidWebpOptions(webpQuality, webpEffort);

  if (ifInNode) {
    const Sharp = await getSharp();
    const output = await Sharp(inputData)
      .webp({ quality: webpQuality, effort: webpEffort })
      .toBuffer();
    assertWebpBuffer(output, 'Sharp');
    return output;
  }

  const mimeType = detectImageMimeTypeFromBuffer(inputData);
  if (!mimeType) {
    throw new Error('Cannot encode WebP from an unsupported image buffer');
  }
  const photonImage = await photonFromBase64(
    `data:${mimeType};base64,${inputData.toString('base64')}`,
  );
  try {
    return await encodeBrowserImageToWebp(photonImage, webpQuality);
  } finally {
    photonImage.free();
  }
}

const base64ImageDataUrlPattern = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i;
const supportedScreenshotDataUriPattern =
  /^data:image\/(png|jpe?g|webp);base64,([\s\S]*)$/i;
const rawBase64BodyPattern = /^[A-Za-z0-9+/=\s]+$/;

export const inferBase64ImageFormat = (
  base64Body: string,
): ScreenshotImageFormat =>
  inferScreenshotImageFormatFromBase64(base64Body) ?? 'jpeg';

function detectImageMimeTypeFromBuffer(buffer: Buffer): string | undefined {
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

export const createImgBase64ByFormat = (format: string, body: string) => {
  return `data:image/${format};base64,${normalizeBase64Body(body)}`;
};

export interface NormalizeScreenshotBase64Options {
  label?: string;
}

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

export type JpegBase64DataUrl = `data:image/jpeg;base64,${string}`;
export type WebpBase64DataUrl = `data:image/webp;base64,${string}`;

export interface ResizeBase64ImageToJpegOptions {
  /**
   * Expected input dimensions in positive integer pixels. When provided, they
   * are checked against the encoded image header before processing.
   */
  sourceSize?: Size;
  /** Exact output dimensions in positive integer pixels. */
  targetSize: Size;
  /** JPEG quality used only when encoding is required. Defaults to 90. */
  jpegQuality?: number;
}

export interface ResizeBase64ImageToWebpOptions
  extends WebpScreenshotEncodeOptions {
  /**
   * Expected input dimensions in positive integer pixels. When provided, they
   * are checked against the encoded image header before processing.
   */
  sourceSize?: Size;
  /** Exact output dimensions in positive integer pixels. */
  targetSize: Size;
}

function assertValidJpegQuality(jpegQuality: number): void {
  if (!Number.isInteger(jpegQuality) || jpegQuality < 1 || jpegQuality > 100) {
    throw new Error(
      `jpegQuality must be an integer between 1 and 100. Received: ${jpegQuality}`,
    );
  }
}

function assertValidWebpOptions(webpQuality: number, webpEffort: number): void {
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
}

function assertValidImageSize(size: Size, label: string): void {
  if (
    !Number.isInteger(size.width) ||
    !Number.isInteger(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new Error(
      `${label} width and height must be positive integers. Received width: ${size.width}, height: ${size.height}`,
    );
  }
}

function validatedEncodedSourceSize(
  imageBuffer: Buffer,
  sourceSize?: Size,
): Size {
  const encodedSourceSize = encodedImageInfoOfBuffer(imageBuffer);
  if (!sourceSize) {
    return encodedSourceSize;
  }

  assertValidImageSize(sourceSize, 'sourceSize');
  if (
    sourceSize.width !== encodedSourceSize.width ||
    sourceSize.height !== encodedSourceSize.height
  ) {
    throw new Error(
      `sourceSize ${sourceSize.width}x${sourceSize.height} does not match encoded image dimensions ${encodedSourceSize.width}x${encodedSourceSize.height}`,
    );
  }
  return encodedSourceSize;
}

/**
 * Ensures that a PNG/JPEG/WebP Base64 image is represented as JPEG without resizing.
 * Existing JPEG bytes are reused; PNG/WebP input is encoded with `jpegQuality`.
 * This function does not read image dimensions.
 *
 * @param inputBase64 - A PNG/JPEG/WebP data URL or raw Base64 image body.
 * @param jpegQuality - JPEG quality from 1 to 100 when encoding. Defaults to 90.
 * @returns A JPEG data URL with unchanged dimensions.
 */
export async function convertBase64ImageToJpeg(
  inputBase64: string,
  jpegQuality = 90,
): Promise<JpegBase64DataUrl> {
  assertValidJpegQuality(jpegQuality);
  const { body } = parseBase64(inputBase64);
  const imageBuffer = Buffer.from(body, 'base64');
  const detectedMimeType = detectImageMimeTypeFromBuffer(imageBuffer);
  if (detectedMimeType === 'image/jpeg') {
    return createImgBase64ByFormat('jpeg', body) as JpegBase64DataUrl;
  }
  if (detectedMimeType !== 'image/png' && detectedMimeType !== 'image/webp') {
    throw new Error(
      `inputBase64 must contain a PNG, JPEG, or WebP image. Detected: ${detectedMimeType ?? 'unsupported format'}`,
    );
  }

  const jpegBuffer = await convertImgBufferToJpeg(imageBuffer, jpegQuality);
  return createImgBase64ByFormat(
    'jpeg',
    jpegBuffer.toString('base64'),
  ) as JpegBase64DataUrl;
}

/**
 * Ensures that a PNG/JPEG/WebP Base64 image is represented as WebP without resizing.
 * Existing WebP bytes are reused; PNG/JPEG input is encoded once.
 */
export async function convertBase64ImageToWebp(
  inputBase64: string,
  options: WebpScreenshotEncodeOptions = {},
): Promise<WebpBase64DataUrl> {
  const webpQuality = options.webpQuality ?? DEFAULT_WEBP_SCREENSHOT_QUALITY;
  const webpEffort = options.webpEffort ?? DEFAULT_WEBP_SCREENSHOT_EFFORT;
  assertValidWebpOptions(webpQuality, webpEffort);

  const { body } = parseBase64(inputBase64);
  const imageBuffer = Buffer.from(body, 'base64');
  const inputFormat = detectScreenshotImageFormatFromBuffer(imageBuffer);
  if (inputFormat === 'webp') {
    assertWebpBuffer(imageBuffer, 'inputBase64');
    return createImgBase64ByFormat('webp', body) as WebpBase64DataUrl;
  }
  if (!inputFormat) {
    throw new Error(
      'inputBase64 must contain a PNG, JPEG, or WebP image. Detected: unsupported format',
    );
  }

  const webpBuffer = await convertImgBufferToWebp(imageBuffer, {
    webpQuality,
    webpEffort,
  });
  return createImgBase64ByFormat(
    'webp',
    webpBuffer.toString('base64'),
  ) as WebpBase64DataUrl;
}

/**
 * Resizes a PNG/JPEG/WebP Base64 image and ensures that the result is JPEG.
 *
 * An unchanged JPEG is returned without re-encoding. An unchanged PNG is
 * converted to JPEG, while a size change performs resize and JPEG encoding.
 * `jpegQuality` applies only when encoding is required.
 *
 * @param inputBase64 - A PNG/JPEG/WebP data URL or raw Base64 image body.
 * @param options - Source dimensions, target dimensions, and JPEG quality.
 * @returns A JPEG data URL with the requested dimensions.
 */
export async function resizeBase64ImageToJpeg(
  inputBase64: string,
  options: ResizeBase64ImageToJpegOptions,
): Promise<JpegBase64DataUrl> {
  const jpegQuality = options.jpegQuality ?? 90;
  assertValidJpegQuality(jpegQuality);
  assertValidImageSize(options.targetSize, 'targetSize');

  const { body } = parseBase64(inputBase64);
  const imageBuffer = Buffer.from(body, 'base64');
  const sourceSize = validatedEncodedSourceSize(
    imageBuffer,
    options.sourceSize,
  );
  const dimensionsUnchanged =
    sourceSize.width === options.targetSize.width &&
    sourceSize.height === options.targetSize.height;
  const inputFormat = detectScreenshotImageFormatFromBuffer(imageBuffer);
  if (!inputFormat) {
    throw new Error('inputBase64 must contain a PNG, JPEG, or WebP image');
  }
  if (dimensionsUnchanged && inputFormat === 'jpeg') {
    return createImgBase64ByFormat('jpeg', body) as JpegBase64DataUrl;
  }

  const { buffer } = await resizeImageBuffer(
    inputFormat,
    imageBuffer,
    options.targetSize,
    {
      sourceSize,
      preserveOriginalWhenUnchanged: false,
      encode: { format: 'jpeg', quality: jpegQuality },
    },
  );
  return createImgBase64ByFormat(
    'jpeg',
    buffer.toString('base64'),
  ) as JpegBase64DataUrl;
}

/**
 * Resizes a PNG/JPEG/WebP Base64 image and ensures that the result is WebP.
 * An unchanged WebP is returned byte-for-byte. Any required resize and WebP
 * conversion are performed by one encoder operation.
 */
export async function resizeBase64ImageToWebp(
  inputBase64: string,
  options: ResizeBase64ImageToWebpOptions,
): Promise<WebpBase64DataUrl> {
  const webpQuality = options.webpQuality ?? DEFAULT_WEBP_SCREENSHOT_QUALITY;
  const webpEffort = options.webpEffort ?? DEFAULT_WEBP_SCREENSHOT_EFFORT;
  assertValidWebpOptions(webpQuality, webpEffort);
  assertValidImageSize(options.targetSize, 'targetSize');

  const { body } = parseBase64(inputBase64);
  const imageBuffer = Buffer.from(body, 'base64');
  const sourceSize = validatedEncodedSourceSize(
    imageBuffer,
    options.sourceSize,
  );
  const inputFormat = detectScreenshotImageFormatFromBuffer(imageBuffer);
  if (!inputFormat) {
    throw new Error('inputBase64 must contain a PNG, JPEG, or WebP image');
  }

  const dimensionsUnchanged =
    sourceSize.width === options.targetSize.width &&
    sourceSize.height === options.targetSize.height;
  if (dimensionsUnchanged && inputFormat === 'webp') {
    return createImgBase64ByFormat('webp', body) as WebpBase64DataUrl;
  }

  const { buffer } = await resizeImageBuffer(
    inputFormat,
    imageBuffer,
    options.targetSize,
    {
      sourceSize,
      preserveOriginalWhenUnchanged: false,
      encode: {
        format: 'webp',
        quality: webpQuality,
        effort: webpEffort,
      },
    },
  );
  return createImgBase64ByFormat(
    'webp',
    buffer.toString('base64'),
  ) as WebpBase64DataUrl;
}

/**
 * @deprecated Use `resizeBase64ImageToJpeg` when JPEG output is required.
 * This API retains its historical behavior: unchanged dimensions preserve the
 * input format, while resized output is encoded as JPEG.
 */
export async function resizeImgBase64(
  inputBase64: string,
  newSize: {
    width: number;
    height: number;
  },
): Promise<string> {
  const { body, mimeType } = parseBase64(inputBase64);
  const imageBuffer = Buffer.from(body, 'base64');
  const { buffer, format } = await resizeAndConvertImgBuffer(
    mimeType.split('/')[1],
    imageBuffer,
    newSize,
  );
  return createImgBase64ByFormat(format, buffer.toString('base64'));
}

/**
 * Calculates new dimensions for an image while maintaining its aspect ratio.
 *
 * This function is designed to resize an image to fit within a specified maximum width and height
 * while maintaining the original aspect ratio. If the original width or height exceeds the maximum
 * dimensions, the image will be scaled down to fit.
 *
 * @param {number} originalWidth - The original width of the image.
 * @param {number} originalHeight - The original height of the image.
 * @returns {Object} An object containing the new width and height.
 * @throws {Error} Throws an error if the width or height is not a positive number.
 */
export function zoomForGPT4o(originalWidth: number, originalHeight: number) {
  // In low mode, the image is scaled to 512x512 pixels and 85 tokens are used to represent the image.
  // In high mode, the model looks at low-resolution images and then creates detailed crop images, using 170 tokens for each 512x512 pixel tile. In practical applications, it is recommended to control the image size within 2048x768 pixels
  const maxWidth = 2048; // Maximum width
  const maxHeight = 768; // Maximum height
  let newWidth = originalWidth;
  let newHeight = originalHeight;

  // Calculate the aspect ratio
  const aspectRatio = originalWidth / originalHeight;

  // Width adjustment
  if (originalWidth > maxWidth) {
    newWidth = maxWidth;
    newHeight = newWidth / aspectRatio;
  }

  // Adjust height
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
  // Support both sync (Photon) and async (Canvas fallback) versions
  const result = PhotonImage.new_from_base64(body);
  return result instanceof Promise ? await result : result;
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
    // Rgba object is consumed by padding_right, so create new one for each call
    const white = new Rgba(255, 255, 255, 255);
    result = padding_right(result, rightPadding, white);
  }
  if (bottomPadding > 0) {
    const white = new Rgba(255, 255, 255, 255);
    const previousResult = result;
    result = padding_bottom(previousResult, bottomPadding, white);
    // Free intermediate PhotonImage created by padding_right, but not the original input
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
    if (targetWidth === width && targetHeight === height) {
      return { width, height, imageBase64 };
    }

    const image = Sharp(inputBuffer).extend({
      right: targetWidth - width,
      bottom: targetHeight - height,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    });
    const output = await (outputFormat === 'webp'
      ? image.webp({
          quality: DEFAULT_WEBP_SCREENSHOT_QUALITY,
          effort: DEFAULT_WEBP_SCREENSHOT_EFFORT,
        })
      : image.jpeg({ quality: 90 })
    ).toBuffer();
    if (outputFormat === 'webp') {
      assertWebpBuffer(output, 'Sharp padding');
    }
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
      imageBase64: await photonToBase64(paddedResult.image, 90, outputFormat),
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
    const output = await (outputFormat === 'webp'
      ? image.webp({
          quality: DEFAULT_WEBP_SCREENSHOT_QUALITY,
          effort: DEFAULT_WEBP_SCREENSHOT_EFFORT,
        })
      : image.jpeg({ quality: 90 })
    ).toBuffer();
    if (outputFormat === 'webp') {
      assertWebpBuffer(output, 'Sharp crop');
    }
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

  // Photon crop uses coordinates (x1, y1, x2, y2), not (x, y, width, height)
  const cropped = crop(photonImage, left, top, left + width, top + height);
  photonImage.free();

  try {
    return {
      width: cropped.get_width(),
      height: cropped.get_height(),
      imageBase64: await photonToBase64(cropped, 90, outputFormat),
    };
  } finally {
    cropped.free();
  }
}

export async function photonToBase64(
  image: PhotonImageType,
  quality = 90,
  outputFormat: ScreenshotImageOutputFormat = 'jpeg',
): Promise<string> {
  const bytes =
    outputFormat === 'webp'
      ? await encodeBrowserImageToWebp(image, quality)
      : Buffer.from(image.get_bytes_jpeg(quality));
  const base64Body = Buffer.from(bytes).toString('base64');
  return createImgBase64ByFormat(outputFormat, base64Body);
}

export const httpImg2Base64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${url}`);
  }
  const contentType = response.headers.get('content-type');
  if (!contentType) {
    throw new Error(`Failed to fetch image: ${url}`);
  }
  assert(
    contentType.startsWith('image/'),
    `The url ${url} is not a image, because of content-type in header is ${contentType}.`,
  );
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
};

/**
 * Convert image file to base64 string
 * Because this method is synchronous, the npm package `sharp` cannot be used to detect the file type.
 * Keep the source encoding here; Core's screenshot preparation pipeline owns
 * final WebP conversion so callers do not encode the same pixels twice.
 */
export const localImg2Base64 = (
  imgPath: string,
  withoutHeader = false,
): string => {
  const body = readFileSync(imgPath).toString('base64');
  if (withoutHeader) {
    return body;
  }

  // Detect image type by extname.
  const type = path.extname(imgPath).slice(1);
  const finalType = type === 'svg' ? 'svg+xml' : type || 'jpg';

  return `data:image/${finalType};base64,${body}`;
};

/**
 * PreProcess image url to ensure image is accessible to LLM.
 * @param url - The url of the image, it can be a http url or a base64 string or a file path
 * @param convertHttpImage2Base64 - Whether to convert http image to base64, if true, the http image will be converted to base64, otherwise, the http image will be returned as is
 * @returns The base64 string of the image (when convertHttpImage2Base64 is true or url is a file path) or the http image url
 */
export const preProcessImageUrl = async (
  url: string,
  convertHttpImage2Base64: boolean,
) => {
  if (typeof url !== 'string') {
    throw new Error(
      `url must be a string, but got ${url} with type ${typeof url}`,
    );
  }
  if (url.startsWith('data:')) {
    const { mimeType, body } = parseBase64(url);
    return `data:${mimeType};base64,${body}`;
  } else if (url.startsWith('http://') || url.startsWith('https://')) {
    if (!convertHttpImage2Base64) {
      return url;
    }
    return await httpImg2Base64(url);
  } else {
    return await localImg2Base64(url);
  }
};

/**
 * parse base64 string to get mimeType and body
 */
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
      // 5 means 'data:'
      mimeType: fullBase64String.slice(5, index),
      body: normalizeBase64Body(
        fullBase64String.slice(index + separator.length),
      ),
    };
  } catch (e) {
    throw new Error(
      `parseBase64 fail because intput is not a valid base64 string: ${fullBase64String}`,
      {
        cause: e,
      },
    );
  }
};

/**
 * Scales an image by a specified factor using Sharp or Photon
 * @param imageBase64 - Base64 encoded image
 * @param scale - Scale factor (e.g., 2 for 2x, 1.5 for 1.5x)
 * @returns Scaled image with new dimensions
 */
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

    const image = Sharp(buffer).resize(newWidth, newHeight, {
      kernel: 'lanczos3',
      fit: 'fill',
    });
    const resizedBuffer = await (outputFormat === 'webp'
      ? image.webp({
          quality: DEFAULT_WEBP_SCREENSHOT_QUALITY,
          effort: DEFAULT_WEBP_SCREENSHOT_EFFORT,
        })
      : image.jpeg({ quality: 90 })
    ).toBuffer();
    if (outputFormat === 'webp') {
      assertWebpBuffer(resizedBuffer, 'Sharp scale');
    }

    const scaleEndTime = Date.now();
    imgDebug(
      `scaleImage done (Sharp): ${originalWidth}x${originalHeight} -> ${newWidth}x${newHeight} (scale=${scale}), cost: ${scaleEndTime - scaleStartTime}ms`,
    );

    const base64 = createImgBase64ByFormat(
      outputFormat,
      resizedBuffer.toString('base64'),
    );

    return {
      width: newWidth,
      height: newHeight,
      imageBase64: base64,
    };
  }

  // Browser environment: use Photon (or Canvas fallback)
  const { PhotonImage, SamplingFilter, resize } = await getPhoton();
  const inputBytes = new Uint8Array(buffer);
  // Support both sync (Photon) and async (Canvas fallback) versions
  const bytesliceResult = PhotonImage.new_from_byteslice(inputBytes);
  const inputImage =
    bytesliceResult instanceof Promise
      ? await bytesliceResult
      : bytesliceResult;
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

  const resizedBuffer =
    outputFormat === 'webp'
      ? await encodeBrowserImageToWebp(
          outputImage,
          DEFAULT_WEBP_SCREENSHOT_QUALITY,
        )
      : Buffer.from(outputImage.get_bytes_jpeg(90));

  // Free memory
  inputImage.free();
  outputImage.free();

  const scaleEndTime = Date.now();
  imgDebug(
    `scaleImage done (Photon): ${originalWidth}x${originalHeight} -> ${newWidth}x${newHeight} (scale=${scale}), cost: ${scaleEndTime - scaleStartTime}ms`,
  );

  const base64 = createImgBase64ByFormat(
    outputFormat,
    resizedBuffer.toString('base64'),
  );

  return {
    width: newWidth,
    height: newHeight,
    imageBase64: base64,
  };
}
