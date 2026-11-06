import { Buffer } from 'node:buffer';
import { parseBase64, preProcessImageUrl } from '@midscene/shared/img';
import { assert } from '@midscene/shared/utils';
import { createLocateResultCodec } from '../../shared/model-locate-result';
import type { PixelLocateResult } from '../../shared/model-locate-result';
import { prepareUserPrompt } from '../../shared/multimodal-prompt';

export async function prepareJevImage(url: string) {
  const base64 = await preProcessImageUrl(url, true);
  assert(
    Buffer.from(parseBase64(base64).body, 'base64').length <= 16 * 1024 * 1024,
    'Jev image exceeds 16 MiB',
  );
  return { imageBase64: base64 };
}

const jevBoxCodec = createLocateResultCodec({
  coordinates: {
    shape: 'bbox',
    normalizedBy: 1,
    rounding: 'none',
    boundsType: 'edges',
  },
});

export function mapJevBox(
  box: { left: number; top: number; right: number; bottom: number },
  targetSize: { width: number; height: number },
): PixelLocateResult {
  return jevBoxCodec.toPixelResult([box.left, box.top, box.right, box.bottom], {
    preparedSize: targetSize,
  });
}

export async function prepareReferences(
  prompt: Parameters<typeof prepareUserPrompt>[0],
) {
  const { referenceImages } = await prepareUserPrompt(prompt);
  const prepared = await Promise.all(
    referenceImages.map(async (image, index) => ({
      key: `reference_${index}`,
      name: image.name,
      image: await prepareJevImage(image.url),
    })),
  );
  return {
    references: prepared.map(({ key, name }) => ({
      image: `\`${key}\``,
      name,
    })),
    images: Object.fromEntries(
      prepared.map(({ key, image }) => [key, image.imageBase64]),
    ),
  };
}
