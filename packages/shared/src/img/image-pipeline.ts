import type { Rect, Size } from '../types';
import { EncodedImage } from './encoded-image';
import { getImageBackend } from './image-backend';
import {
  type ScreenshotImageEncodeOptions,
  assertValidJpegQuality,
  resolveWebpScreenshotEncodeOptions,
  screenshotEncodeOptions,
} from './screenshot-encoding';

export type ImageOperation =
  | { type: 'crop'; rect: Rect }
  | {
      type: 'resize';
      width: number;
      height: number;
      kernel?: 'nearest' | 'lanczos3';
    }
  | { type: 'pad'; right: number; bottom: number }
  | { type: 'overlay'; pixels: Uint8Array; width: number; height: number };

export type ImageOutputOptions =
  | ScreenshotImageEncodeOptions
  | { format: 'png' };

export interface ImageTransformOptions {
  /** Operations execute in this order; coordinates refer to the preceding result. */
  operations?: readonly ImageOperation[];
  /** Omit to preserve the input format. Quality only applies when encoding occurs. */
  output?: ImageOutputOptions;
}

function assertSize(size: Size) {
  if (
    ![size.width, size.height].every((n) => Number.isSafeInteger(n) && n > 0)
  ) {
    throw new Error('Image dimensions must be positive safe integers');
  }
}

/** Validate once, before either backend allocates pixel resources. */
function prepareOperations(
  image: EncodedImage,
  operations: readonly ImageOperation[],
) {
  let size = image.size;
  const prepared: ImageOperation[] = [];
  for (const op of operations) {
    switch (op.type) {
      case 'crop': {
        const { left, top, width, height } = op.rect;
        assertSize({ width, height });
        if (
          ![left, top].every((n) => Number.isSafeInteger(n) && n >= 0) ||
          left + width > size.width ||
          top + height > size.height
        ) {
          throw new Error('Crop rectangle must be inside the image');
        }
        if (left || top || width !== size.width || height !== size.height)
          prepared.push(op);
        size = { width, height };
        break;
      }
      case 'resize':
        assertSize(op);
        if (op.width !== size.width || op.height !== size.height)
          prepared.push(op);
        size = { width: op.width, height: op.height };
        break;
      case 'pad':
        if (
          ![op.right, op.bottom].every((n) => Number.isSafeInteger(n) && n >= 0)
        ) {
          throw new Error('Padding must be non-negative safe integers');
        }
        size = {
          width: size.width + op.right,
          height: size.height + op.bottom,
        };
        assertSize(size);
        if (op.right || op.bottom) prepared.push(op);
        break;
      case 'overlay':
        if (
          op.width !== size.width ||
          op.height !== size.height ||
          op.pixels.length !== size.width * size.height * 4
        ) {
          throw new Error(
            'Overlay must match the current image RGBA dimensions',
          );
        }
        prepared.push(op);
        break;
      default:
        throw new Error('Unsupported image operation');
    }
  }
  return prepared;
}

/**
 * Runs ordered pixel operations with one final file encoding and no intermediate
 * lossy encoding. No operations + accepted format returns the original object.
 * Backend objects and their resource ownership never escape this boundary.
 */
export async function transformImage(
  image: EncodedImage,
  options: ImageTransformOptions = {},
): Promise<EncodedImage> {
  const { output } = options;
  if (output?.format === 'jpeg') assertValidJpegQuality(output.quality);
  if (output?.format === 'webp') {
    resolveWebpScreenshotEncodeOptions({
      webpQuality: output.quality,
      webpEffort: output.effort,
    });
  }
  const operations = options.operations?.length
    ? prepareOperations(image, options.operations)
    : [];
  if (!operations.length && (!output || output.format === image.format))
    return image;

  const backend = await getImageBackend();
  return EncodedImage.fromBytes(
    await backend.transform(
      image,
      operations,
      output ??
        (image.format === 'png'
          ? { format: 'png' }
          : screenshotEncodeOptions(image.format)),
    ),
    output?.format ?? image.format,
  );
}
