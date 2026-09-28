import { EncodedImage, transformImage } from '@midscene/shared/img';

export interface ConstrainBase64ImageToMaxSizeOptions {
  /** Maximum allowed width or height in positive integer pixels. */
  maxSize: number;
}

/** Android capture boundary: preserve bounded inputs; resize oversized captures to JPEG. */
export async function constrainBase64ImageToMaxSize(
  inputBase64: string,
  options: ConstrainBase64ImageToMaxSizeOptions,
): Promise<string> {
  if (!Number.isSafeInteger(options.maxSize) || options.maxSize <= 0) {
    throw new Error('maxSize must be a positive safe integer');
  }
  const image = EncodedImage.fromBase64(inputBase64);
  const { width, height } = image.size;
  const largestDimension = Math.max(width, height);
  if (largestDimension <= options.maxSize) return inputBase64;
  const scale = options.maxSize / largestDimension;
  return (
    await transformImage(image, {
      operations: [
        {
          type: 'resize',
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
        },
      ],
      output: { format: 'jpeg', quality: 90 },
    })
  ).toBase64();
}
