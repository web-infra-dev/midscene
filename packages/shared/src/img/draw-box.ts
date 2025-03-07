import type { Rect } from '../types';
import getJimp from './get-jimp';
import { bufferFromBase64 } from './info';
import { saveBase64Image } from './transform';

export async function drawBoxOnImage(options: {
  inputImgBase64: string;
  rect: { x: number; y: number };
}) {
  const { inputImgBase64, rect } = options;
  const color = { r: 255, g: 0, b: 0, a: 255 }; // Default to red

  const Jimp = await getJimp();
  const imageBuffer = await bufferFromBase64(inputImgBase64);
  const image = await Jimp.read(imageBuffer);

  // Draw a circle dot at the center of the rect
  const centerX = rect.x;
  const centerY = rect.y;
  const radius = 5; // Radius of the dot

  // Scan a square area around the center point
  image.scan(
    Math.floor(centerX - radius),
    Math.floor(centerY - radius),
    radius * 2,
    radius * 2,
    (x: number, y: number, idx: number) => {
      // Calculate distance from current pixel to center
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

      // If distance is less than radius, color the pixel
      if (distance <= radius) {
        image.bitmap.data[idx + 0] = color.r;
        image.bitmap.data[idx + 1] = color.g;
        image.bitmap.data[idx + 2] = color.b;
        image.bitmap.data[idx + 3] = color.a;
      }
    },
  );

  // Convert back to base64
  image.quality(90);
  const resultBase64 = await image.getBase64Async(Jimp.MIME_JPEG);
  return resultBase64;
}

export async function savePositionImg(options: {
  inputImgBase64: string;
  rect: { x: number; y: number };
  outputPath: string;
}) {
  const { inputImgBase64, rect, outputPath } = options;
  const imgBase64 = await drawBoxOnImage({ inputImgBase64, rect });
  //   console.log('outputPath', outputPath);
  await saveBase64Image({
    base64Data: imgBase64,
    outputPath,
  });
}
