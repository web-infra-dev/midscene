import { Buffer } from 'node:buffer';
import type { Rect } from '../types';
import { ifInNode } from '../utils';
import getPhoton from './get-photon';
import getSharp from './get-sharp';
import { parseBase64 } from './transform';

async function decode(base64: string) {
  const { body } = parseBase64(base64);
  if (ifInNode) {
    const sharp = await getSharp();
    const { data, info } = await sharp(Buffer.from(body, 'base64'))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { pixels: data, width: info.width, height: info.height };
  }
  const photon = await getPhoton();
  const image = photon.PhotonImage.new_from_base64(body);
  try {
    return {
      pixels: image.get_raw_pixels(),
      width: image.get_width(),
      height: image.get_height(),
    };
  } finally {
    image.free();
  }
}

/** Compare target pixels, tolerating small encoding/color noise. Rect is in image pixels. */
export async function imageRegionDifference(
  before: string,
  after: string,
  rect: Rect,
): Promise<number> {
  if (
    ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new Error('Screenshot comparison requires a finite, positive region');
  }
  if (before === after) return 0;
  const [a, b] = await Promise.all([decode(before), decode(after)]);
  if (a.width !== b.width || a.height !== b.height) return 1;
  const left = Math.max(0, Math.floor(rect.left));
  const top = Math.max(0, Math.floor(rect.top));
  const right = Math.min(a.width, Math.ceil(rect.left + rect.width));
  const bottom = Math.min(a.height, Math.ceil(rect.top + rect.height));
  if (right <= left || bottom <= top) {
    throw new Error('Cannot compare an empty screenshot region');
  }
  let changed = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const offset = (y * a.width + x) * 4;
      if (
        Math.max(
          Math.abs(a.pixels[offset] - b.pixels[offset]),
          Math.abs(a.pixels[offset + 1] - b.pixels[offset + 1]),
          Math.abs(a.pixels[offset + 2] - b.pixels[offset + 2]),
        ) > 32
      )
        changed++;
    }
  }
  return changed / ((right - left) * (bottom - top));
}
