import { Buffer } from 'node:buffer';
import type { TMultimodalPrompt } from '@/common';
import {
  constrainBase64ImageToMaxSize,
  imageInfoOfBase64,
  padBase64ImageToMinimumSize,
  parseBase64,
  preProcessImageUrl,
} from '@midscene/shared/img';
import { assert } from '@midscene/shared/utils';
import { createLocateResultCodec } from '../../shared/model-locate-result';
import type { PixelLocateResult } from '../../shared/model-locate-result';
import { prepareReferenceImages } from '../../shared/multimodal-prompt';

export async function prepareJevImage(url: string) {
  // https://docs.typesafe.ai/images#limits (Jev 1.14): each side 280..1568,
  // PNG/JPEG, <=16 MiB. Keep content intact; pad small images rather than crop.
  // Preserve network failures from remote references. Decode and validation
  // failures below describe invalid image input.
  const remote =
    typeof url === 'string' && /^https?:\/\//.test(url)
      ? await preProcessImageUrl(url, true)
      : undefined;
  try {
    const original = remote ?? (await preProcessImageUrl(url, true));
    const originalSize = await imageInfoOfBase64(original);
    const resized = await constrainBase64ImageToMaxSize(original, {
      maxSize: 1568,
    });
    const contentSize = await imageInfoOfBase64(resized);
    const padded = await padBase64ImageToMinimumSize(resized, 280);
    assert(
      Buffer.from(parseBase64(padded.imageBase64).body, 'base64').length <=
        16 * 1024 * 1024,
      'Jev image exceeds 16 MiB after preparation',
    );
    return {
      imageBase64: padded.imageBase64,
      preparation: {
        originalSize,
        contentSize,
        preparedSize: { width: padded.width, height: padded.height },
      },
    };
  } catch (cause) {
    throw Object.assign(
      new Error(
        `JEV_IMAGE_INVALID: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      ),
      {
        code: 'JEV_IMAGE_INVALID',
        category: 'invalid-input',
        next: 'Provide a readable PNG or JPEG image within the supported dimensions and size.',
      },
    );
  }
}

const jevBoxCodec = createLocateResultCodec({
  coordinates: {
    shape: 'bbox',
    normalizedBy: 1,
    rounding: 'none',
    boundsType: 'left-closed-right-open',
  },
});

export function mapJevBox(
  box: { left: number; top: number; right: number; bottom: number },
  targetSize: { width: number; height: number },
  preparation?: Awaited<ReturnType<typeof prepareJevImage>>['preparation'],
): PixelLocateResult {
  const scaleX = preparation
    ? preparation.preparedSize.width / preparation.contentSize.width
    : 1;
  const scaleY = preparation
    ? preparation.preparedSize.height / preparation.contentSize.height
    : 1;
  assert(
    (scaleX === 1 || ((box.left + box.right) / 2) * scaleX < 1) &&
      (scaleY === 1 || ((box.top + box.bottom) / 2) * scaleY < 1),
    'Jev target is in image padding, outside the original content',
  );
  return jevBoxCodec.toPixelResult([box.left, box.top, box.right, box.bottom], {
    preparedSize: {
      width: targetSize.width * scaleX,
      height: targetSize.height * scaleY,
    },
    contentSize: targetSize,
  });
}

export async function prepareJevReferences(prompt?: TMultimodalPrompt) {
  const referenceImages = await prepareReferenceImages(prompt);
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
