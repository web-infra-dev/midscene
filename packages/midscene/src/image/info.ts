import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import Sharp from 'sharp';
import { Size } from '..';
/**
 * Retrieves the dimensions of an image asynchronously
 *
 * @param image - The image data, which can be a string path or a buffer
 * @returns A Promise that resolves to an object containing the width and height of the image
 * @throws Error if the image data is invalid
 */
export async function imageInfo(image: string | Buffer): Promise<Size> {
  const { width, height } = await Sharp(image).metadata();
  assert(width && height, `invalid image: ${image}`);
  return { width, height };
}

/**
 * Retrieves the dimensions of an image from a base64-encoded string
 *
 * @param imageBase64 - The base64-encoded image data
 * @returns A Promise that resolves to an object containing the width and height of the image
 * @throws Error if the image data is invalid
 */
export async function imageInfoOfBase64(imageBase64: string): Promise<Size> {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  // Call the imageInfo function to get the dimensions of the image
  return imageInfo(Buffer.from(base64Data, 'base64'));
}

/**
 * Encodes an image file to a base64 encoded string
 *
 * @param image The path of the image file
 * @param withHeader Determine whether to return data including the file header information, the default is true
 *
 * @returns The base64 encoded string of the image file, which may or may not include header information depending on the withHeader parameter
 *
 * @throws When the image type is not supported, an error will be thrown
 */
export function base64Encoded(image: string, withHeader = true) {
  // get base64 encoded image
  const imageBuffer = readFileSync(image);
  if (!withHeader) {
    return imageBuffer.toString('base64');
  }
  if (image.endsWith('png')) {
    return `data:image/png;base64,${imageBuffer.toString('base64')}`;
  } else if (image.endsWith('jpg') || image.endsWith('jpeg')) {
    return `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
  }
  throw new Error('unsupported image type');
}
