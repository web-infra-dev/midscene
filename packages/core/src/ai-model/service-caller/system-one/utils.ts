import { assert, uuid } from '@midscene/shared/utils';
import type { SystemOneRequest } from './schema';

export function encodeSystemOneImages(
  images: SystemOneRequest['images'],
  isOpenRouter: boolean,
) {
  const assets: Record<string, unknown> = {};
  const imageState = Object.fromEntries(
    Object.entries(images ?? {}).map(([name, dataURL]) => {
      if (isOpenRouter) {
        return [name, { type: 'image_url', image_url: { url: dataURL } }];
      }
      const reference = uuid();
      const match = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(dataURL);
      assert(match, 'System One images must be prepared PNG or JPEG data URLs');
      assets[reference] = {
        type: 'image',
        format: match[1] === 'png' ? 'png' : 'jpg',
        data_base64: match[2],
      };
      return [name, reference];
    }),
  );
  return { imageState, assets };
}
