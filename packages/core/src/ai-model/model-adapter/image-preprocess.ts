import { paddingToMatchBlockByBase64 } from '@midscene/shared/img';

export interface ImagePreprocessPolicy {
  padBlockSize?: number;
}

export interface PreparedModelImage {
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

export async function prepareModelImage(options: {
  imageBase64: string;
  width: number;
  height: number;
  policy: ImagePreprocessPolicy;
}): Promise<PreparedModelImage> {
  const { imageBase64, width, height, policy } = options;
  let preparedImageBase64 = imageBase64;
  let modelWidth = width;
  let modelHeight = height;

  if (policy.padBlockSize !== undefined) {
    const paddedResult = await paddingToMatchBlockByBase64(
      imageBase64,
      policy.padBlockSize,
    );
    preparedImageBase64 = paddedResult.imageBase64;
    modelWidth = paddedResult.width;
    modelHeight = paddedResult.height;
  }

  return {
    imageBase64: preparedImageBase64,
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
