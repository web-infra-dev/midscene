import { Buffer } from 'node:buffer';
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

/** Compare the entire screenshot, ignoring small per-channel color differences. */
export async function imageDifference(before: string, after: string) {
  if (before === after) return { changedPixels: 0, dimensionsChanged: false };
  const [a, b] = await Promise.all([decode(before), decode(after)]);
  if (a.width !== b.width || a.height !== b.height) {
    return { changedPixels: 0, dimensionsChanged: true };
  }
  let changedPixels = 0;
  for (let offset = 0; offset < a.pixels.length; offset += 4) {
    if (
      Math.max(
        Math.abs(a.pixels[offset] - b.pixels[offset]),
        Math.abs(a.pixels[offset + 1] - b.pixels[offset + 1]),
        Math.abs(a.pixels[offset + 2] - b.pixels[offset + 2]),
      ) > 32
    )
      changedPixels++;
  }
  return { changedPixels, dimensionsChanged: false };
}
