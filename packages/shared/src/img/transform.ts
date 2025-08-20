import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type Jimp from 'jimp';
import type { Rect } from 'src/types';
import { getDebug } from '../logger';
import { ifInNode } from '../utils';
import getJimp from './get-jimp';
import getPhoton from './get-photon';
import getSharp from './get-sharp';

const imgDebug = getDebug('img');

/**
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

  // Converts base64 data to buffer
  const imageBuffer = Buffer.from(body, 'base64');

  // Use Jimp to process the image and save it to the specified location
  const Jimp = await getJimp();
  const image = await Jimp.read(imageBuffer);
  await image.writeAsync(outputPath);
}

/**
 * Resizes an image from Buffer, maybe return a new format
 * - If the image is Resized, the returned format will be jpg.
 * - If the image is not Resized, it will return to its original format.
 * @returns { buffer: resized buffer, format: the new format}
 */
export async function resizeAndConvertImgBuffer(
  format: string,
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
          format,
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

  // browser environment: use Photon
  const { PhotonImage, SamplingFilter, resize } = await getPhoton();
  const inputBytes = new Uint8Array(inputData);
  const inputImage = PhotonImage.new_from_byteslice(inputBytes);
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
      format,
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

export async function jimpFromBase64(base64: string): Promise<Jimp> {
  const Jimp = await getJimp();
  const { body } = parseBase64(base64);
  const imageBuffer = Buffer.from(body, 'base64');
  return Jimp.read(imageBuffer);
}

// https://help.aliyun.com/zh/model-studio/user-guide/vision/
export async function paddingToMatchBlock(
  image: Jimp,
  blockSize = 28,
): Promise<Jimp> {
  const { width, height } = image.bitmap;

  const targetWidth = Math.ceil(width / blockSize) * blockSize;
  const targetHeight = Math.ceil(height / blockSize) * blockSize;

  if (targetWidth === width && targetHeight === height) {
    return image;
  }

  const Jimp = await getJimp();
  const paddedImage = new Jimp(targetWidth, targetHeight, 0xffffffff);

  // Composite the original image onto the new canvas
  paddedImage.composite(image, 0, 0);
  return paddedImage;
}

export async function paddingToMatchBlockByBase64(
  imageBase64: string,
  blockSize = 28,
): Promise<string> {
  const jimpImage = await jimpFromBase64(imageBase64);
  const paddedImage = await paddingToMatchBlock(jimpImage, blockSize);
  return jimpToBase64(paddedImage);
}
export async function cropByRect(
  imageBase64: string,
  rect: Rect,
  paddingImage: boolean,
): Promise<string> {
  const jimpImage = await jimpFromBase64(imageBase64);
  const { left, top, width, height } = rect;
  jimpImage.crop(left, top, width, height);

  if (paddingImage) {
    const paddedImage = await paddingToMatchBlock(jimpImage);
    return jimpToBase64(paddedImage);
  }
  return jimpToBase64(jimpImage);
}

export async function jimpToBase64(image: Jimp): Promise<string> {
  const Jimp = await getJimp();
  return image.getBase64Async(Jimp.MIME_JPEG);
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
