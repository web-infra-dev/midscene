export interface BrowserWebpEncodeInput {
  pixels: ArrayLike<number>;
  width: number;
  height: number;
  /** Encoder quality from 0 to 100. Defaults to 90. */
  quality?: number;
}

/**
 * Encode RGBA pixels with the WebP encoder provided by the browser.
 *
 * Keep this function self-contained so browser contract tests can execute the
 * production implementation in a page or Worker without a test-only copy.
 */
export async function encodeRgbaToWebp({
  pixels,
  width,
  height,
  quality = 90,
}: BrowserWebpEncodeInput): Promise<Uint8Array> {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error('WebP image dimensions must be positive safe integers');
  }

  if (!Number.isFinite(quality) || quality < 0 || quality > 100) {
    throw new Error('WebP quality must be between 0 and 100');
  }

  const expectedPixelCount = width * height * 4;
  if (
    !Number.isSafeInteger(expectedPixelCount) ||
    pixels.length !== expectedPixelCount
  ) {
    throw new Error(
      `WebP RGBA pixel length must be ${expectedPixelCount}, got ${pixels.length}`,
    );
  }

  const normalizedQuality = quality / 100;
  let outputBlob: Blob;

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get an OffscreenCanvas 2d context');
    }

    const imageData = context.createImageData(width, height);
    imageData.data.set(pixels);
    context.putImageData(imageData, 0, 0);
    outputBlob = await canvas.convertToBlob({
      type: 'image/webp',
      quality: normalizedQuality,
    });
  } else if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get an HTMLCanvasElement 2d context');
    }

    const imageData = context.createImageData(width, height);
    imageData.data.set(pixels);
    context.putImageData(imageData, 0, 0);
    outputBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('HTMLCanvasElement failed to encode WebP'));
          }
        },
        'image/webp',
        normalizedQuality,
      );
    });
  } else {
    throw new Error(
      'WebP encoding requires OffscreenCanvas or HTMLCanvasElement',
    );
  }

  if (outputBlob.type.toLowerCase() !== 'image/webp') {
    throw new Error(
      `Browser WebP encoder returned ${outputBlob.type || 'an unknown MIME type'}`,
    );
  }

  const output = new Uint8Array(await outputBlob.arrayBuffer());
  const isWebp =
    output.length >= 12 &&
    output[0] === 0x52 &&
    output[1] === 0x49 &&
    output[2] === 0x46 &&
    output[3] === 0x46 &&
    output[8] === 0x57 &&
    output[9] === 0x45 &&
    output[10] === 0x42 &&
    output[11] === 0x50;
  if (!isWebp) {
    throw new Error('Browser WebP encoder returned invalid WebP bytes');
  }

  return output;
}
