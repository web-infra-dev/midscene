import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import getDebug from 'debug';
import getJimp from './get-jimp';

const debugImg = getDebug('img');
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
 * Transforms an image path into a base64-encoded string
 * @param inputPath - The path of the image file to be encoded
 * @returns A Promise that resolves to a base64-encoded string representing the image file
 */
export async function transformImgPathToBase64(inputPath: string) {
  // Use Jimp to process images and generate base64 data
  debugImg(`transformImgPathToBase64 start: ${inputPath}`);
  const Jimp = await getJimp();
  const image = await Jimp.read(inputPath);
  const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);
  const res = buffer.toString('base64');
  debugImg(`transformImgPathToBase64 done: ${inputPath}`);
  return res;
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

  image.resize(newSize.width, newSize.height, Jimp.RESIZE_NEAREST_NEIGHBOR);
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

/**
 * Trims an image and returns the trimming information, including the offset from the left and top edges, and the trimmed width and height
 *
 * @param image - The image to be trimmed. This can be a file path or a Buffer object containing the image data
 * @returns A Promise that resolves to an object containing the trimming information. If the image does not need to be trimmed, this object will be null
 */
export async function trimImage(image: string | Buffer): Promise<{
  trimOffsetLeft: number; // attention: trimOffsetLeft is a negative number
  trimOffsetTop: number; // so as trimOffsetTop
  width: number;
  height: number;
} | null> {
  const Jimp = await getJimp();
  const jimpImage = await Jimp.read(
    Buffer.isBuffer(image) ? image : Buffer.from(image),
  );
  const { width, height } = jimpImage.bitmap;

  if (width <= 3 || height <= 3) {
    return null;
  }

  const trimmedImage = jimpImage.autocrop();
  const { width: trimmedWidth, height: trimmedHeight } = trimmedImage.bitmap;

  const trimOffsetLeft = (width - trimmedWidth) / 2;
  const trimOffsetTop = (height - trimmedHeight) / 2;

  if (trimOffsetLeft === 0 && trimOffsetTop === 0) {
    return null;
  }

  return {
    trimOffsetLeft: -trimOffsetLeft,
    trimOffsetTop: -trimOffsetTop,
    width: trimmedWidth,
    height: trimmedHeight,
  };
}

export function prependBase64Header(base64: string, mimeType = 'image/png') {
  return `data:${mimeType};base64,${base64}`;
}

export async function paddingToMatchBlock(imageBase64: string, blockSize = 28) {
  debugImg('paddingToMatchBlock start');
  const Jimp = await getJimp();
  const imageBuffer = await bufferFromBase64(imageBase64);
  const image = await Jimp.read(imageBuffer);
  const { width, height } = image.bitmap;

  const targetWidth = Math.ceil(width / blockSize) * blockSize;
  const targetHeight = Math.ceil(height / blockSize) * blockSize;

  if (targetWidth === width && targetHeight === height) {
    return imageBase64;
  }

  const paddedImage = new Jimp(targetWidth, targetHeight, 0xffffffff);

  // Composite the original image onto the new canvas
  paddedImage.composite(image, 0, 0);

  const base64 = await paddedImage.getBase64Async(Jimp.MIME_JPEG);
  debugImg('paddingToMatchBlock done');
  return base64;
}
