import getPhoton from './get-photon';
import { photonFromBase64, photonToBase64, saveBase64Image } from './transform';

export async function drawBoxOnImage(options: {
  inputImgBase64: string;
  rect: { x: number; y: number };
}) {
  const { inputImgBase64, rect } = options;
  const color = { r: 255, g: 0, b: 0, a: 255 }; // Default to red

  const { PhotonImage } = await getPhoton();
  const image = await photonFromBase64(inputImgBase64);

  const width = image.get_width();
  const height = image.get_height();
  const rawPixels = image.get_raw_pixels();

  // Draw a circle dot at the center of the rect
  const centerX = Math.floor(rect.x);
  const centerY = Math.floor(rect.y);
  const radius = 5; // Radius of the dot

  // Scan a square area around the center point and draw circle
  for (let y = centerY - radius; y <= centerY + radius; y++) {
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      // Calculate distance from current pixel to center
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

      // If distance is less than radius and within bounds, color the pixel
      if (distance <= radius && x >= 0 && x < width && y >= 0 && y < height) {
        const idx = (y * width + x) * 4;
        rawPixels[idx + 0] = color.r;
        rawPixels[idx + 1] = color.g;
        rawPixels[idx + 2] = color.b;
        rawPixels[idx + 3] = color.a;
      }
    }
  }

  // Create new image from modified pixels
  const newImage = new PhotonImage(rawPixels, width, height);
  const resultBase64 = await photonToBase64(newImage, 90);

  // Free memory
  image.free();
  newImage.free();

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
