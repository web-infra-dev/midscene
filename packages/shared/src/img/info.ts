import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import type Jimp from 'jimp';
import type { Size } from '../types';
import getJimp from './get-jimp';

export interface ImageInfo extends Size {
  jimpImage: Jimp;
}

/**
 * Retrieves the dimensions of an image asynchronously
 *
 * @param image - The image data, which can be a string path or a buffer
 * @returns A Promise that resolves to an object containing the width and height of the image
 * @throws Error if the image data is invalid
 */
export async function imageInfo(
  image: string | Buffer | Jimp,
): Promise<ImageInfo> {
  const Jimp = await getJimp();
  let jimpImage: Jimp;
  if (typeof image === 'string') {
    jimpImage = await Jimp.read(image);
  } else if (Buffer.isBuffer(image)) {
    jimpImage = await Jimp.read(image);
  } else if (image instanceof Jimp) {
    jimpImage = image;
  } else {
    throw new Error('Invalid image input: must be a string path or a Buffer');
  }
  const { width, height } = jimpImage.bitmap;
  assert(
    width && height,
    `Invalid image: ${typeof image === 'string' ? image : 'Buffer'}`,
  );
  return { width, height, jimpImage };
}

/**
 * Retrieves the dimensions of an image from a base64-encoded string
 *
 * @param imageBase64 - The base64-encoded image data
 * @returns A Promise that resolves to an object containing the width and height of the image
 * @throws Error if the image data is invalid
 */
export async function imageInfoOfBase64(
  imageBase64: string,
): Promise<ImageInfo> {
  // const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  // Call the imageInfo function to get the dimensions of the image
  const buffer = await bufferFromBase64(imageBase64);
  return imageInfo(buffer);
}

export async function bufferFromBase64(imageBase64: string): Promise<Buffer> {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(base64Data, 'base64');
}

/**
 * Check if the Buffer is a valid PNG image
 * @param buffer The Buffer to check
 * @returns true if the Buffer is a valid PNG image, otherwise false
 */
export function isValidPNGImageBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 8) {
    return false;
  }

  // Check if the Buffer is a valid PNG image (signature: 89 50 4E 47...)
  const isPNG =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;

  return isPNG;
}
