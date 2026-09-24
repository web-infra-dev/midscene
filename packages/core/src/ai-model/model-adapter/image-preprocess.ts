import { prepareImageOutput } from '@/image-output';
import { EncodedImage, type ImageOperation } from '@midscene/shared/img';

export interface ImagePreprocessPolicy {
  padBlockSize?: number;
}

export interface PreparedModelImage {
  image: EncodedImage;
  imageBase64: string;
  /**
   * Size of the image sent to the model after preprocessing. This can be larger
   * than the original screenshot when padding is applied to satisfy model block
   * size requirements.
   */
  preparedSize: {
    width: number;
    height: number;
  };
  /**
   * Size of the real screenshot content inside the prepared image. Pixel bboxes
   * are parsed against `preparedSize`, then clipped to `contentSize` so padding
   * added for the model is not treated as valid UI content.
   */
  contentSize: {
    width: number;
    height: number;
  };
}

export type ModelImageInput = {
  width: number;
  height: number;
  operations?: readonly ImageOperation[];
} & (
  | { image: EncodedImage; imageBase64?: never }
  | { imageBase64: string; image?: never }
);

export async function prepareModelImage(
  options: ModelImageInput & { policy: ImagePreprocessPolicy },
): Promise<PreparedModelImage> {
  const { width, height, policy } = options;
  if (
    ![width, height].every((value) => Number.isSafeInteger(value) && value > 0)
  ) {
    throw new Error('Model image dimensions must be positive safe integers');
  }
  const operations: ImageOperation[] = options.operations
    ? [...options.operations]
    : [{ type: 'resize', width, height }];
  let modelWidth = width;
  let modelHeight = height;

  const padBlockSize = policy.padBlockSize;
  if (
    padBlockSize !== undefined &&
    (!Number.isSafeInteger(padBlockSize) || padBlockSize <= 0)
  ) {
    throw new Error('padBlockSize must be a positive safe integer');
  }
  const source = options.image ?? EncodedImage.fromBase64(options.imageBase64);
  const requiresPadding =
    padBlockSize !== undefined &&
    (width % padBlockSize !== 0 || height % padBlockSize !== 0);
  if (requiresPadding) {
    modelWidth = Math.ceil(width / padBlockSize!) * padBlockSize!;
    modelHeight = Math.ceil(height / padBlockSize!) * padBlockSize!;
    operations.push({
      type: 'pad',
      right: modelWidth - width,
      bottom: modelHeight - height,
    });
  }
  const image = await prepareImageOutput(source, operations);
  if (image.size.width !== modelWidth || image.size.height !== modelHeight) {
    throw new Error(
      'Model image operations do not produce the declared prepared dimensions',
    );
  }

  return {
    image,
    get imageBase64() {
      return image.toBase64();
    },
    preparedSize: {
      width: modelWidth,
      height: modelHeight,
    },
    contentSize: {
      width,
      height,
    },
  };
}
