import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import type { Size } from '../types';
import { ifInNode } from '../utils';
import getPhoton from './get-photon';
import getSharp from './get-sharp';

export interface ImageInfo extends Size {}

const isJpegStartOfFrameMarker = (marker: number): boolean =>
  marker >= 0xc0 &&
  marker <= 0xcf &&
  marker !== 0xc4 &&
  marker !== 0xc8 &&
  marker !== 0xcc;

function jpegInfoFromBuffer(imageBuffer: Buffer): ImageInfo {
  let offset = 2;
  while (offset < imageBuffer.length) {
    if (imageBuffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < imageBuffer.length && imageBuffer[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= imageBuffer.length) break;

    const marker = imageBuffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (
      marker === 0x01 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (offset + 2 > imageBuffer.length) break;

    const segmentLength = imageBuffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > imageBuffer.length) break;
    if (isJpegStartOfFrameMarker(marker)) {
      if (segmentLength < 7) break;
      const height = imageBuffer.readUInt16BE(offset + 3);
      const width = imageBuffer.readUInt16BE(offset + 5);
      assert(width && height, 'Invalid image: cannot get width or height');
      return { width, height };
    }
    offset += segmentLength;
  }

  throw new Error('Invalid image: cannot get JPEG width or height');
}

/**
 * Reads PNG/JPEG dimensions from the encoded header without decoding pixels.
 * This is intended for validating already-decoded dimension hints before an
 * image transform; full image validation remains the decoder's responsibility.
 */
export function encodedImageInfoOfBuffer(imageBuffer: Buffer): ImageInfo {
  if (isValidPNGImageBuffer(imageBuffer)) {
    const width = imageBuffer.readUInt32BE(16);
    const height = imageBuffer.readUInt32BE(20);
    assert(width && height, 'Invalid image: cannot get width or height');
    return { width, height };
  }
  if (isValidJPEGImageBuffer(imageBuffer)) {
    return jpegInfoFromBuffer(imageBuffer);
  }
  throw new Error('Invalid image: unsupported format');
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
  const base64Data = imageBase64
    .replace(/^data:image\/\w+;base64,/, '')
    .replace(/\s/g, '');
  assert(base64Data, 'Invalid image: empty base64 data');
  assert(
    /^[A-Za-z0-9+/]+={0,2}$/.test(base64Data) && base64Data.length % 4 !== 1,
    'Invalid image: malformed base64 data',
  );
  const imageBuffer = Buffer.from(base64Data, 'base64');
  assert(isValidImageBuffer(imageBuffer), 'Invalid image: unsupported format');
  if (ifInNode) {
    let metadata;
    try {
      const Sharp = await getSharp();
      metadata = await Sharp(imageBuffer).metadata();
    } catch (error) {
      throw new Error(
        `Invalid image: failed to decode base64 data (${error instanceof Error ? error.message : String(error)})`,
        { cause: error },
      );
    }
    assert(
      metadata.width && metadata.height,
      'Invalid image: cannot get width or height',
    );
    return { width: metadata.width, height: metadata.height };
  }

  const { PhotonImage } = await getPhoton();
  // Support both sync (Photon) and async (Canvas fallback) versions
  let result: ReturnType<typeof PhotonImage.new_from_base64>;
  try {
    result = PhotonImage.new_from_base64(base64Data);
  } catch (error) {
    throw new Error(
      `Invalid image: failed to decode base64 data (${error instanceof Error ? error.message : String(error)})`,
      { cause: error },
    );
  }
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
  // A PNG consists of the 8-byte signature followed by chunks and must end
  // with the 12-byte IEND chunk. Checking only the signature lets truncated
  // screenshots through, which then fail when sent to an image model.
  if (!buffer || buffer.length < 20) {
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

  if (!isPNG) {
    return false;
  }

  // IEND has a zero-length payload and a fixed CRC (AE 42 60 82). It must be
  // the final chunk in a conforming PNG.
  const pngIendChunk = Buffer.from([
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  return buffer
    .subarray(buffer.length - pngIendChunk.length)
    .equals(pngIendChunk);
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

export interface ValidateScreenshotBufferOptions {
  label: string;
  minBufferSize?: number;
}

export function validateScreenshotBuffer(
  screenshotBuffer: Buffer | undefined,
  { label, minBufferSize = 0 }: ValidateScreenshotBufferOptions,
): asserts screenshotBuffer is Buffer {
  const bufferSize = screenshotBuffer?.length ?? 0;
  if (!screenshotBuffer || bufferSize === 0) {
    throw new Error(
      `${label} validation failed: buffer size ${bufferSize} bytes`,
    );
  }

  if (!isValidImageBuffer(screenshotBuffer)) {
    throw new Error(`${label} buffer has invalid image format`);
  }

  if (minBufferSize > 0 && bufferSize < minBufferSize) {
    throw new Error(
      `${label} validation failed: buffer size ${bufferSize} bytes (minimum: ${minBufferSize})`,
    );
  }
}
