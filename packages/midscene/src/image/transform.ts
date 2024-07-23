import { Buffer } from 'node:buffer';
import Sharp from 'sharp';
import { Rect } from '@/types';

/**
 * Saves a Base64-encoded image to a file
 *
 * @param options - An object containing the Base64-encoded image data and the output file path
 * @param options.base64Data - The Base64-encoded image data
 * @param options.outputPath - The path where the image will be saved
 * @throws Error if there is an error during the saving process
 */
export async function saveBase64Image(options: { base64Data: string; outputPath: string }): Promise<void> {
  const { base64Data, outputPath } = options;
  // Remove the base64 data prefix (if any)
  const base64Image = base64Data.split(';base64,').pop() || base64Data;

  // Converts base64 data to buffer
  const imageBuffer = Buffer.from(base64Image, 'base64');

  // Use sharp to process the image and save it to the specified location
  await Sharp(imageBuffer).toFile(outputPath);

  console.log('Image successfully written to file.');
}

/**
 * Transforms an image path into a base64-encoded string
 * @param inputPath - The path of the image file to be encoded
 * @returns A Promise that resolves to a base64-encoded string representing the image file
 */
export async function transformImgPathToBase64(inputPath: string) {
  // Use sharp to process images and generate base64 data
  return await Sharp(inputPath)
    .toBuffer()
    .then((data) => {
      // Convert image data to base64 encoding
      const base64Data = data.toString('base64');
      return base64Data;
    });
}

/**
 * Resizes an image from a base64-encoded string
 *
 * @param base64Data - A base64-encoded string representing the image
 * @returns A Promise that resolves to a base64-encoded string representing the resized image
 * @throws An error if the width or height cannot be determined from the metadata
 */
export async function resizeImg(base64Data: string) {
  // Remove the base64 data prefix (if any)
  const base64Image = base64Data.split(';base64,').pop() || base64Data;

  // Converts base64 data to buffer
  const imageBuffer = Buffer.from(base64Image, 'base64');

  const metadata = await Sharp(imageBuffer).metadata();
  const { width, height } = metadata;
  if (!width || !height) {
    throw Error('undefined width or height with url');
  }

  const newSize = calculateNewDimensions(width, height);

  return await Sharp(imageBuffer)
    .resize(newSize.width, newSize.height) // Zoom to under 512x512 pixels
    .toBuffer()
    .then((data) => {
      // Convert image data to base64 encoding
      const base64Data = data.toString('base64');
      return base64Data;
    });
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
export function calculateNewDimensions(originalWidth: number, originalHeight: number) {
  // In low mode, the image is scaled to 512x512 pixels and 85 tokens are used to represent the image.
  // In high mode, the model looks at low-resolution images and then creates detailed crop images, using 170 tokens for each 512x512 pixel tile. In practical applications, it is recommended to control the image size within 2048x768 pixels
  const maxWidth = 768; // Maximum width
  const maxHeight = 2048; // Maximum height
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
  const { info } = await Sharp(image).trim().toBuffer({
    resolveWithObject: true,
  });

  if (typeof info.trimOffsetLeft === 'undefined' || typeof info.trimOffsetTop === 'undefined') {
    return null;
  }

  return {
    trimOffsetLeft: info.trimOffsetLeft,
    trimOffsetTop: info.trimOffsetTop,
    width: info.width,
    height: info.height,
  };
}

/**
 * Aligns an image's coordinate system based on trimming information
 *
 * This function takes an image and a center rectangle as input. It first extracts the center
 * rectangle from the image using the Sharp library and converts it to a buffer. Then, it calls
 * the trimImage function to obtain the trimming information of the buffer image. If there is no
 * trimming information, the original center rectangle is returned. If there is trimming information,
 * a new rectangle is created based on the trimming information, with its top-left corner
 * positioned at the negative offset of the trimming from the original center rectangle's top-left
 * corner, and its width and height set to the trimmed image's dimensions.
 *
 * @param image The image file path or buffer to be processed
 * @param center The center rectangle of the image, which is used to extract and align
 * @returns A Promise that resolves to a rectangle object representing the aligned coordinates
 * @throws Error if there is an error during image processing
 */
export async function alignCoordByTrim(image: string | Buffer, center: Rect): Promise<Rect> {
  const img = await Sharp(image).extract(center).toBuffer();
  const trimInfo = await trimImage(img);
  if (!trimInfo) {
    return center;
  }

  return {
    left: center.left - trimInfo.trimOffsetLeft,
    top: center.top - trimInfo.trimOffsetTop,
    width: trimInfo.width,
    height: trimInfo.height,
  };
}
