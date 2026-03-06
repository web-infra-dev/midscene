import assert from 'node:assert';
import type { Size } from '../types';
import getPhoton from './get-photon';

export interface ImageInfo extends Size {}

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
  const { PhotonImage } = await getPhoton();
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  // Support both sync (Photon) and async (Canvas fallback) versions
  const result = PhotonImage.new_from_base64(base64Data);
  const image = result instanceof Promise ? await result : result;
  const width = image.get_width();
  const height = image.get_height();
  image.free();
  assert(width && height, 'Invalid image: cannot get width or height');
  return { width, height };
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

  // Check PNG signature (8 bytes): 89 50 4E 47 0D 0A 1A 0A
  // This is more robust than just checking the first 4 bytes
  const isPNG =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  return isPNG;
}

/**
 * Check if the Buffer is a valid JPEG image
 * @param buffer The Buffer to check
 * @returns true if the Buffer is a valid JPEG image, otherwise false
 */
export function isValidJPEGImageBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 3) {
    return false;
  }

  // Check JPEG signature (3 bytes): FF D8 FF
  return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

/**
 * Check if the Buffer is a valid image (PNG or JPEG)
 * @param buffer The Buffer to check
 * @returns true if the Buffer is a valid PNG or JPEG image, otherwise false
 */
export function isValidImageBuffer(buffer: Buffer): boolean {
  return isValidPNGImageBuffer(buffer) || isValidJPEGImageBuffer(buffer);
}
