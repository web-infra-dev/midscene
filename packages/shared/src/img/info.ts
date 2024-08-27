import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import Jimp from 'jimp';

export interface Size {
  width: number;
  height: number;
}

/**
 * Retrieves the dimensions of an image asynchronously
 *
 * @param image - The image data, which can be a string path or a buffer
 * @returns A Promise that resolves to an object containing the width and height of the image
 * @throws Error if the image data is invalid
 */
export async function imageInfo(image: string | Buffer): Promise<Size> {
  let jimpImage: Jimp;
  if (typeof image === 'string') {
    jimpImage = await Jimp.read(image);
  } else if (Buffer.isBuffer(image)) {
    jimpImage = await Jimp.read(image);
  } else {
    throw new Error('Invalid image input: must be a string path or a Buffer');
  }
  const { width, height } = jimpImage.bitmap;
  assert(
    width && height,
    `Invalid image: ${typeof image === 'string' ? image : 'Buffer'}`,
  );
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
  }
  if (image.endsWith('jpg') || image.endsWith('jpeg')) {
    return `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
  }
  throw new Error('unsupported image type');
}
