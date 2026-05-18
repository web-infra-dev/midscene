import { paddingToMatchBlockByBase64 } from '@midscene/shared/img';

export interface ImagePreprocessPolicy {
  padBlockSize?: number;
}

export interface PreparedModelImage {
  imageBase64: string;
  preparedSize: {
    width: number;
    height: number;
  };
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
