import { Buffer } from 'node:buffer';
import type { PhotonImage } from '@silvia-odwyer/photon';
import getPhoton from '../get-photon';
import type {
  BackendImage,
  BackendOperation,
  ImageBackend,
} from '../image-backend';
import type { ImageOutputOptions } from '../image-pipeline';
import {
  type ScreenshotImageEncodeOptions,
  assertWebpBuffer,
  screenshotEncodeOptions,
} from '../screenshot-encoding';
import { encodeRgbaToWebp } from './canvas';

export async function executeImageTransform(
  input: BackendImage,
  operations: readonly BackendOperation[],
  output?: ImageOutputOptions,
): Promise<Uint8Array> {
  const photon = await getPhoton();
  let image = photon.PhotonImage.new_from_byteslice(input.bytes);
  const replace = (next: PhotonImage) => {
    if (next !== image) image.free();
    image = next;
  };
  try {
    for (const op of operations) {
      switch (op.type) {
        case 'crop': {
          const { left, top, width, height } = op.rect;
          replace(photon.crop(image, left, top, left + width, top + height));
          break;
        }
        case 'resize':
          replace(
            photon.resize(
              image,
              op.width,
              op.height,
              op.kernel === 'nearest'
                ? photon.SamplingFilter.Nearest
                : photon.SamplingFilter.CatmullRom,
            ),
          );
          break;
        case 'pad': {
          // Photon takes Rgba by value (__destroy_into_raw in its WASM binding).
          // Each call needs its own color; it must not be reused or freed by JS.
          if (op.right)
            replace(
              photon.padding_right(
                image,
                op.right,
                new photon.Rgba(255, 255, 255, 255),
              ),
            );
          if (op.bottom)
            replace(
              photon.padding_bottom(
                image,
                op.bottom,
                new photon.Rgba(255, 255, 255, 255),
              ),
            );
          break;
        }
        case 'overlay': {
          const overlay = new photon.PhotonImage(
            op.pixels,
            op.width,
            op.height,
          );
          try {
            photon.watermark(image, overlay, 0n, 0n);
          } finally {
            overlay.free();
          }
          break;
        }
      }
    }
    if (output?.format === 'png' || (!output && input.format === 'png'))
      return image.get_bytes();
    return await encodePhotonImage(
      image,
      output ?? screenshotEncodeOptions(input.format as 'jpeg' | 'webp'),
    );
  } finally {
    image.free();
  }
}

export const photonBackend: ImageBackend = {
  async info(bytes) {
    const { PhotonImage } = await getPhoton();
    const image = PhotonImage.new_from_byteslice(bytes);
    try {
      const width = image.get_width();
      const height = image.get_height();
      if (!width || !height)
        throw new Error('Invalid image: cannot get width or height');
      return { width, height };
    } finally {
      image.free();
    }
  },
  transform: executeImageTransform,
};

/** Canvas is a WebP codec dependency of this backend, never an upstream concern. */
export async function encodePhotonImage(
  image: PhotonImage,
  options: ScreenshotImageEncodeOptions,
): Promise<Buffer> {
  if (options.format === 'jpeg')
    return Buffer.from(image.get_bytes_jpeg(options.quality));
  const bytes = Buffer.from(
    await encodeRgbaToWebp({
      pixels: image.get_raw_pixels(),
      width: image.get_width(),
      height: image.get_height(),
      quality: options.quality,
    }),
  );
  assertWebpBuffer(bytes, 'Browser image encoder');
  return bytes;
}
