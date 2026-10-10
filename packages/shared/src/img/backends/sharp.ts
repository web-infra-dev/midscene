import { Buffer } from 'node:buffer';
import type { Sharp } from 'sharp';
import getSharp from '../get-sharp';
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

export async function executeImageTransform(
  input: BackendImage,
  operations: readonly BackendOperation[],
  output?: ImageOutputOptions,
): Promise<Uint8Array> {
  const sharp = await getSharp();
  let image = sharp(input.bytes);
  for (let index = 0; index < operations.length; index++) {
    const op = operations[index];
    switch (op.type) {
      case 'crop':
        image = image.extract(op.rect);
        break;
      case 'resize':
        image = image.resize(op.width, op.height, {
          fit: op.fit ?? 'fill',
          kernel: op.kernel ?? 'lanczos3',
        });
        break;
      case 'pad':
        image = image.extend({
          right: op.right,
          bottom: op.bottom,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        });
        break;
      case 'overlay':
        image = image.composite([
          {
            input: Buffer.from(op.pixels),
            raw: { width: op.width, height: op.height, channels: 4 },
          },
        ]);
        break;
    }
    // Sharp can reorder operations and ignores earlier resize calls. Materialize
    // only raw pixels between steps to honor arbitrary operation order losslessly.
    if (index < operations.length - 1) {
      const { data, info } = await image
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      image = sharp(data, {
        raw: { width: info.width, height: info.height, channels: 4 },
      });
    }
  }
  if (output?.format === 'png' || (!output && input.format === 'png'))
    return image.png().toBuffer();
  return encodeSharpImage(
    image,
    output ?? screenshotEncodeOptions(input.format as 'jpeg' | 'webp'),
    'Image pipeline',
  );
}

export const sharpBackend: ImageBackend = {
  async info(bytes) {
    const sharp = await getSharp();
    const { width, height } = await sharp(bytes).metadata();
    if (!width || !height)
      throw new Error('Invalid image: cannot get width or height');
    return { width, height };
  },
  transform: executeImageTransform,
};

export async function encodeSharpImage(
  image: Sharp,
  options: ScreenshotImageEncodeOptions,
  label: string,
): Promise<Buffer> {
  const output = await (options.format === 'jpeg'
    ? image.jpeg({
        quality: options.quality,
        chromaSubsampling: options.chromaSubsampling,
      })
    : image.webp({ quality: options.quality, effort: options.effort })
  ).toBuffer();
  if (options.format === 'webp') {
    assertWebpBuffer(output, label);
  }
  return output;
}
