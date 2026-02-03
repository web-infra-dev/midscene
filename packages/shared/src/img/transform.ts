import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PhotonImage as PhotonImageType } from '@silvia-odwyer/photon-node';
import type { Rect } from 'src/types';
import { getDebug } from '../logger';
import { ifInNode } from '../utils';
import getPhoton from './get-photon';
import getSharp from './get-sharp';

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

/**
 * Resizes an image from Buffer, maybe return a new format
 * - If the image is Resized, the returned format will be jpg.
 * - If the image is not Resized, it will return to its original format.
 * @returns { buffer: resized buffer, format: the new format}
 */
export async function resizeAndConvertImgBuffer(
  inputFormat: string,
  inputData: Buffer,
  newSize: {
    width: number;
    height: number;
  },
): Promise<{
  buffer: Buffer;
  // jpg, png, etc.
  format: string;
}> {
  if (typeof inputData === 'string')
    throw Error('inputData is base64, use resizeImgBase64 instead');

  assert(
    newSize && newSize.width > 0 && newSize.height > 0,
    'newSize must be positive',
  );

  const resizeStartTime = Date.now();
  imgDebug(`resizeImg start, target size: ${newSize.width}x${newSize.height}`);

  if (ifInNode) {
    // Node.js environment: use Sharp
    try {
      const Sharp = await getSharp();
      const metadata = await Sharp(inputData).metadata();
      const { width: originalWidth, height: originalHeight } = metadata;

      if (!originalWidth || !originalHeight) {
        throw Error('Undefined width or height from the input image.');
      }

      if (
        newSize.width === originalWidth &&
        newSize.height === originalHeight
      ) {
        return {
          buffer: inputData,
          format: inputFormat,
        };
      }

      const resizedBuffer = await Sharp(inputData)
        .resize(newSize.width, newSize.height)
        .jpeg({ quality: 90 })
        .toBuffer();

      const resizeEndTime = Date.now();
      imgDebug(
        `resizeImg done (Sharp), target size: ${newSize.width}x${newSize.height}, cost: ${resizeEndTime - resizeStartTime}ms`,
      );

      return {
        buffer: resizedBuffer,
        // by Sharp.jpeg()
        format: 'jpeg',
      };
    } catch (error) {
      imgDebug('Sharp failed, falling back to Photon:', error);
    }
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
  const originalWidth = inputImage.get_width();
  const originalHeight = inputImage.get_height();

  if (!originalWidth || !originalHeight) {
    inputImage.free();
    throw Error('Undefined width or height from the input image.');
  }

  if (newSize.width === originalWidth && newSize.height === originalHeight) {
    inputImage.free();
    return {
      buffer: inputData,
      format: inputFormat,
    };
  }

  // Resize image using photon with bicubic-like sampling
  const outputImage = resize(
    inputImage,
    newSize.width,
    newSize.height,
    SamplingFilter.CatmullRom,
  );

  const outputBytes = outputImage.get_bytes_jpeg(90);
  const resizedBuffer = Buffer.from(outputBytes);

  // Free memory
  inputImage.free();
  outputImage.free();

  const resizeEndTime = Date.now();

  imgDebug(
    `resizeImg done (Photon), target size: ${newSize.width}x${newSize.height}, cost: ${resizeEndTime - resizeStartTime}ms`,
  );

  return {
    buffer: resizedBuffer,
    // by Photon.get_bytes_jpeg()
    format: 'jpeg',
  };
}

export const createImgBase64ByFormat = (format: string, body: string) => {
  return `data:image/${format};base64,${body}`;
};

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
): Promise<{
  width: number;
  height: number;
  imageBase64: string;
}> {
  const photonImage = await photonFromBase64(imageBase64);
  try {
    const paddedResult = await paddingToMatchBlock(photonImage, blockSize);
    const result = {
      width: paddedResult.width,
      height: paddedResult.height,
      imageBase64: await photonToBase64(paddedResult.image),
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
  paddingImage: boolean,
): Promise<{
  width: number;
  height: number;
  imageBase64: string;
}> {
  const { crop } = await getPhoton();
  const photonImage = await photonFromBase64(imageBase64);
  const { left, top, width, height } = rect;

  // Photon crop uses coordinates (x1, y1, x2, y2), not (x, y, width, height)
  const cropped = crop(photonImage, left, top, left + width, top + height);
  photonImage.free();

  try {
    if (paddingImage) {
      const paddedResult = await paddingToMatchBlock(cropped);
      const result = {
        width: paddedResult.width,
        height: paddedResult.height,
        imageBase64: await photonToBase64(paddedResult.image),
      };
      if (paddedResult.image !== cropped) {
        paddedResult.image.free();
      }
      return result;
    }
    return {
      width: cropped.get_width(),
      height: cropped.get_height(),
      imageBase64: await photonToBase64(cropped),
    };
  } finally {
    cropped.free();
  }
}

export async function photonToBase64(
  image: PhotonImageType,
  quality = 90,
): Promise<string> {
  const bytes = image.get_bytes_jpeg(quality);
  const base64Body = Buffer.from(bytes).toString('base64');
  return `data:image/jpeg;base64,${base64Body}`;
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
 * TODO: convert to webp to reduce base64 size.
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
    return url;
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
      throw new Error('Invalid base64 string');
    }
    return {
      // 5 means 'data:'
      mimeType: fullBase64String.slice(5, index),
      body: fullBase64String.slice(index + separator.length),
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
    // Node.js environment: use Sharp
    try {
      const Sharp = await getSharp();
      const metadata = await Sharp(buffer).metadata();
      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;

      if (originalWidth === 0 || originalHeight === 0) {
        throw new Error('Failed to get image dimensions');
      }

      const newWidth = Math.round(originalWidth * scale);
      const newHeight = Math.round(originalHeight * scale);

      const resizedBuffer = await Sharp(buffer)
        .resize(newWidth, newHeight, {
          kernel: 'lanczos3',
          fit: 'fill',
        })
        .jpeg({
          quality: 90,
        })
        .toBuffer();

      const scaleEndTime = Date.now();
      imgDebug(
        `scaleImage done (Sharp): ${originalWidth}x${originalHeight} -> ${newWidth}x${newHeight} (scale=${scale}), cost: ${scaleEndTime - scaleStartTime}ms`,
      );

      const base64 = `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`;

      return {
        width: newWidth,
        height: newHeight,
        imageBase64: base64,
      };
    } catch (error) {
      imgDebug('Sharp failed, falling back to Photon:', error);
    }
  }

  // Browser environment or Sharp failed: use Photon (or Canvas fallback)
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

  const outputBytes = outputImage.get_bytes_jpeg(90);
  const resizedBuffer = Buffer.from(outputBytes);

  // Free memory
  inputImage.free();
  outputImage.free();

  const scaleEndTime = Date.now();
  imgDebug(
    `scaleImage done (Photon): ${originalWidth}x${originalHeight} -> ${newWidth}x${newHeight} (scale=${scale}), cost: ${scaleEndTime - scaleStartTime}ms`,
  );

  const base64 = `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`;

  return {
    width: newWidth,
    height: newHeight,
    imageBase64: base64,
  };
}
