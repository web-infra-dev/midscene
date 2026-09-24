import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseBase64 } from './base64';
import { EncodedImage } from './encoded-image';
import { transformImage } from './image-pipeline';
import { assertValidJpegQuality } from './screenshot-encoding';

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

export interface ConstrainBase64ImageToMaxSizeOptions {
  /** Maximum allowed width or height in positive integer pixels. */
  maxSize: number;
  /** JPEG quality used when resizing is required. Defaults to 90. */
  jpegQuality?: number;
}

/** Android capture boundary: preserve bounded inputs; resize oversized captures to JPEG. */
export async function constrainBase64ImageToMaxSize(
  inputBase64: string,
  options: ConstrainBase64ImageToMaxSizeOptions,
): Promise<string> {
  if (!Number.isSafeInteger(options.maxSize) || options.maxSize <= 0) {
    throw new Error('maxSize must be a positive safe integer');
  }
  const quality = options.jpegQuality ?? 90;
  assertValidJpegQuality(quality);
  const image = EncodedImage.fromBase64(inputBase64);
  const { width, height } = image.size;
  const largestDimension = Math.max(width, height);
  if (largestDimension <= options.maxSize) return inputBase64;
  const scale = options.maxSize / largestDimension;
  return (
    await transformImage(image, {
      operations: [
        {
          type: 'resize',
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
        },
      ],
      output: { format: 'jpeg', quality },
    })
  ).toBase64();
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
