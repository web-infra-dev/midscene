import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PhotonImage as PhotonImageType } from '@silvia-odwyer/photon';
import { getDebug } from '../logger';
import type { Size } from '../types';
import { ifInBrowser, ifInNode, ifInWorker } from '../utils';
import {
  type JpegBase64DataUrl,
  type WebpBase64DataUrl,
  createImgBase64ByFormat,
  detectImageMimeTypeFromBuffer,
  parseBase64,
} from './base64';
import { photonFromBase64 } from './geometry';
import getPhoton from './get-photon';
import getSharp from './get-sharp';
import { detectScreenshotImageFormatFromBuffer } from './image-format';
import { encodedImageInfoOfBuffer } from './info';
import {
  DEFAULT_JPEG_SCREENSHOT_QUALITY,
  type ScreenshotImageEncodeOptions,
  type ScreenshotImageOutputFormat,
  type WebpScreenshotEncodeOptions,
  assertValidJpegQuality,
  assertWebpBuffer,
  encodeBrowserImageToWebp,
  encodePhotonImage,
  encodeSharpImage,
  resolveWebpScreenshotEncodeOptions,
} from './screenshot-encoding';

export {
  cropByRect,
  paddingToMatchBlock,
  paddingToMatchBlockByBase64,
  photonFromBase64,
  photonToBase64,
  scaleImage,
  zoomForGPT4o,
} from './geometry';
export {
  type JpegBase64DataUrl,
  type NormalizeScreenshotBase64Options,
  type ParsedScreenshotBase64,
  type WebpBase64DataUrl,
  createImgBase64ByFormat,
  inferBase64ImageFormat,
  normalizeBase64Body,
  normalizeBase64Image,
  normalizeScreenshotBase64,
  parseBase64,
  parseScreenshotBase64,
} from './base64';
export {
  DEFAULT_JPEG_SCREENSHOT_QUALITY,
  DEFAULT_WEBP_SCREENSHOT_EFFORT,
  DEFAULT_WEBP_SCREENSHOT_QUALITY,
  type ScreenshotImageOutputFormat,
  type WebpScreenshotEncodeOptions,
} from './screenshot-encoding';

const imgDebug = getDebug('img');

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
  encode: ScreenshotImageEncodeOptions;
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
    const resizedBuffer = await encodeSharpImage(
      imageToEncode,
      options.encode,
      'Sharp resize',
    );

    const resizeEndTime = Date.now();
    imgDebug(
      `resizeImg done (Sharp), target size: ${targetSize.width}x${targetSize.height}, cost: ${resizeEndTime - resizeStartTime}ms`,
    );

    return {
      buffer: resizedBuffer,
      format: options.encode.format,
    };
  }

  // Browser/worker environment: use Photon.
  const { PhotonImage, SamplingFilter, resize } = await getPhoton();
  const inputBytes = new Uint8Array(inputData);
  const inputImage = PhotonImage.new_from_byteslice(inputBytes);
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
    resizedBuffer = await encodePhotonImage(imageToEncode, options.encode);
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
    encode: {
      format: 'jpeg',
      quality: DEFAULT_JPEG_SCREENSHOT_QUALITY,
    },
  });
}

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
      if (!ifInBrowser && !ifInWorker) {
        throw new Error(
          `Failed to convert image to JPEG with Sharp: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
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
  const { webpQuality, webpEffort } =
    resolveWebpScreenshotEncodeOptions(options);

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

export interface ConstrainBase64ImageToMaxSizeOptions {
  /** Maximum allowed width or height in positive integer pixels. */
  maxSize: number;
  /** JPEG quality used when resizing is required. Defaults to 90. */
  jpegQuality?: number;
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
  const { webpQuality, webpEffort } =
    resolveWebpScreenshotEncodeOptions(options);

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
  const { webpQuality, webpEffort } =
    resolveWebpScreenshotEncodeOptions(options);
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
 * Constrains a PNG/JPEG Base64 image to a maximum width or height while
 * preserving its aspect ratio.
 *
 * Images already within the bound are returned unchanged, including their
 * original format. Oversized images are parsed once, resized, and encoded as
 * JPEG.
 *
 * @param inputBase64 - A PNG/JPEG data URL or raw Base64 image body.
 * @param options - Maximum dimension and optional JPEG quality.
 * @returns The original image when already bounded, otherwise a JPEG data URL.
 */
export async function constrainBase64ImageToMaxSize(
  inputBase64: string,
  options: ConstrainBase64ImageToMaxSizeOptions,
): Promise<string> {
  if (!Number.isInteger(options.maxSize) || options.maxSize <= 0) {
    throw new Error(
      `maxSize must be a positive integer. Received: ${options.maxSize}`,
    );
  }

  const jpegQuality = options.jpegQuality ?? 90;
  assertValidJpegQuality(jpegQuality);

  const { body } = parseBase64(inputBase64);
  const imageBuffer = Buffer.from(body, 'base64');
  const sourceSize = encodedImageInfoOfBuffer(imageBuffer);
  const largestDimension = Math.max(sourceSize.width, sourceSize.height);
  if (largestDimension <= options.maxSize) return inputBase64;

  const scale = options.maxSize / largestDimension;
  const targetSize = {
    width: Math.max(1, Math.round(sourceSize.width * scale)),
    height: Math.max(1, Math.round(sourceSize.height * scale)),
  };
  const inputFormat = detectScreenshotImageFormatFromBuffer(imageBuffer);
  if (!inputFormat) {
    throw new Error('inputBase64 must contain a PNG, JPEG, or WebP image');
  }
  const { buffer } = await resizeImageBuffer(
    inputFormat,
    imageBuffer,
    targetSize,
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
