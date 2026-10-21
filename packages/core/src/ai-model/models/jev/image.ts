import { Buffer } from 'node:buffer';
import {
  imageInfoOfBase64,
  padBase64ImageToMinimumSize,
  parseBase64,
  preProcessImageUrl,
  resizeBase64ImageToJpeg,
} from '@midscene/shared/img';
import { assert } from '@midscene/shared/utils';
import type { PixelLocateResult } from '../../shared/model-locate-result';

export async function prepareJevImage(url: string) {
  const base64 = await preProcessImageUrl(url, true);
  const source = await imageInfoOfBase64(base64);
  const scale = Math.min(1, 1568 / source.width, 1568 / source.height);
  const contentSize = {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
  const resized = await resizeBase64ImageToJpeg(base64, {
    targetSize: contentSize,
  });
  const prepared = await padBase64ImageToMinimumSize(resized, 280);
  assert(
    Buffer.from(parseBase64(prepared.imageBase64).body, 'base64').length <=
      16 * 1024 * 1024,
    'Jev image exceeds 16 MiB',
  );
  return {
    ...prepared,
    contentSize,
    sourceSize: { width: source.width, height: source.height },
  };
}

export function mapJevBox(
  box: { left: number; top: number; right: number; bottom: number },
  image: Awaited<ReturnType<typeof prepareJevImage>>,
  targetSize: { width: number; height: number },
): PixelLocateResult {
  // Jev returns fractions of the padded image. Undo padding and scale before
  // the grounding workflow maps a DeepLocate crop back to the full screenshot.
  const left =
    (box.left * image.width * targetSize.width) / image.contentSize.width;
  const top =
    (box.top * image.height * targetSize.height) / image.contentSize.height;
  const right =
    (box.right * image.width * targetSize.width) / image.contentSize.width;
  const bottom =
    (box.bottom * image.height * targetSize.height) / image.contentSize.height;
  const center: [number, number] = [(left + right) / 2, (top + bottom) / 2];
  assert(
    center[0] >= 0 &&
      center[0] < targetSize.width &&
      center[1] >= 0 &&
      center[1] < targetSize.height,
    'Jev returned a target in image padding, outside the screenshot',
  );
  return {
    center,
    rect: { left, top, width: right - left, height: bottom - top },
  };
}
