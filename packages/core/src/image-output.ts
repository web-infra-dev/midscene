import {
  type EncodedImage,
  type ImageOperation,
  transformImage,
} from '@midscene/shared/img';
import type { UIContext } from './types';

/** Consumer encoding policy: preserve JPEG/WebP, prefer WebP for PNG. */
export function prepareImageOutput(
  image: EncodedImage,
  operations: readonly ImageOperation[] = [],
) {
  return transformImage(image, {
    operations,
    output:
      image.format === 'jpeg'
        ? { format: 'jpeg', quality: 90, chromaSubsampling: '4:4:4' }
        : { format: 'webp', quality: 90, effort: 1 },
  });
}

/** Context coordinates refer to shotSize, not necessarily the captured pixel size. */
export function prepareContextImage(
  context: Pick<UIContext, 'screenshot' | 'shotSize'>,
  operations: readonly ImageOperation[] = [],
) {
  return prepareImageOutput(context.screenshot.image, [
    { type: 'resize', ...context.shotSize },
    ...operations,
  ]);
}
