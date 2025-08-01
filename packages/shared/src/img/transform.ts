import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import getDebug from 'debug';
import type Jimp from 'jimp';
import type { Rect } from 'src/types';
import getJimp from './get-jimp';
const debugImg = getDebug('img');
import path from 'node:path';

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
  debugImg(`saveBase64Image start: ${options.outputPath}`);
  const { base64Data, outputPath } = options;
  // Remove the base64 data prefix (if any)
  const base64Image = base64Data.split(';base64,').pop() || base64Data;

  // Converts base64 data to buffer
  const imageBuffer = Buffer.from(base64Image, 'base64');

  // Use Jimp to process the image and save it to the specified location
  const Jimp = await getJimp();
  const image = await Jimp.read(imageBuffer);
  await image.writeAsync(outputPath);
  debugImg(`saveBase64Image done: ${options.outputPath}`);
}

/**
 * Resizes an image from a base64-encoded string
 *
 * @param base64Data - A base64-encoded string representing the image
 * @returns A Promise that resolves to a base64-encoded string representing the resized image
 * @throws An error if the width or height cannot be determined from the metadata
 */
export async function resizeImg(
  inputData: Buffer,
  newSize: {
    width: number;
    height: number;
  },
): Promise<Buffer> {
  if (typeof inputData === 'string')
    throw Error('inputData is base64, use resizeImgBase64 instead');

  assert(
    newSize && newSize.width > 0 && newSize.height > 0,
    'newSize must be positive',
  );

  debugImg(`resizeImg start, target size: ${newSize.width}x${newSize.height}`);
  const Jimp = await getJimp();
  const image = await Jimp.read(inputData);
  const { width, height } = image.bitmap;

  if (!width || !height) {
    throw Error('Undefined width or height from the input image.');
  }

  if (newSize.width === width && newSize.height === height) {
    return inputData;
  }

  image.resize(newSize.width, newSize.height, Jimp.RESIZE_BICUBIC);
  image.quality(90);
  const resizedBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
  debugImg(`resizeImg done, target size: ${newSize.width}x${newSize.height}`);

  return resizedBuffer;
}

export async function bufferFromBase64(base64: string) {
  const splitFlag = ';base64,';
  const dataSplitted = base64.split(splitFlag);
  if (dataSplitted.length !== 2) {
    throw Error('Invalid base64 data');
  }
  debugImg(`bufferFromBase64 start: ${base64}`);
  const res = Buffer.from(dataSplitted[1], 'base64');
  debugImg(`bufferFromBase64 done: ${base64}`);
  return res;
}

export async function resizeImgBase64(
  inputBase64: string,
  newSize: {
    width: number;
    height: number;
  },
): Promise<string> {
  debugImg(`resizeImgBase64 start: ${inputBase64}`);
  const splitFlag = ';base64,';
  const dataSplitted = inputBase64.split(splitFlag);
  if (dataSplitted.length !== 2) {
    throw Error('Invalid base64 data');
  }

  const imageBuffer = Buffer.from(dataSplitted[1], 'base64');
  const buffer = await resizeImg(imageBuffer, newSize);
  const content = buffer.toString('base64');
  const res = `${dataSplitted[0]}${splitFlag}${content}`;
  debugImg(`resizeImgBase64 done: ${inputBase64}`);
  return res;
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
  const imageBuffer = await bufferFromBase64(base64);
  return Jimp.read(imageBuffer);
}

// https://help.aliyun.com/zh/model-studio/user-guide/vision/
export async function paddingToMatchBlock(
  image: Jimp,
  blockSize = 28,
): Promise<Jimp> {
  debugImg('paddingToMatchBlock start');
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
