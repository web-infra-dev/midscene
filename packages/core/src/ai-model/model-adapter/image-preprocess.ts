import { type EncodedImage, transformImage } from '@midscene/shared/img';

export interface ImagePreprocessPolicy {
  padBlockSize?: number;
}

export interface PreparedModelImage {
  image: EncodedImage;
  imageBase64: string;
  /** Encoded model-input dimensions, including model-specific padding. */
  preparedSize: { width: number; height: number };
  /** Original content bounds, used to clip model coordinates away from padding. */
  contentSize: { width: number; height: number };
}

export interface ModelImageInput {
  image: EncodedImage;
}

/** Model-only extension point. The input image is already in its content coordinate space. */
export async function prepareModelImage({
  image: source,
  policy,
}: ModelImageInput & {
  policy: ImagePreprocessPolicy;
}): Promise<PreparedModelImage> {
  const blockSize = policy.padBlockSize;
  if (
    blockSize !== undefined &&
    (!Number.isSafeInteger(blockSize) || blockSize <= 0)
  ) {
    throw new Error('padBlockSize must be a positive safe integer');
  }
  const contentSize = source.size;
  const { width, height } = contentSize;
  const image =
    blockSize === undefined
      ? source
      : await transformImage(source, {
          operations: [
            {
              type: 'pad',
              right: Math.ceil(width / blockSize) * blockSize - width,
              bottom: Math.ceil(height / blockSize) * blockSize - height,
            },
          ],
        });
  return {
    image,
    get imageBase64() {
      return image.toBase64();
    },
    preparedSize: image.size,
    contentSize,
  };
}
