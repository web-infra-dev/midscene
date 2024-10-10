import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import type { Rect } from '@/types';
import Jimp from 'jimp';
import type { NodeType } from '../constants';

// Define picture path
type ElementType = {
  locator: string;

  rect: Rect;

  center: [number, number];

  id: string;

  indexId: number;

  attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };
};

const createSvgOverlay = (
  elements: Array<ElementType>,
  imageWidth: number,
  imageHeight: number,
) => {
  const createPngOverlay = async (
    elements: Array<ElementType>,
    imageWidth: number,
    imageHeight: number,
  ) => {
    const image = new Jimp(imageWidth, imageHeight, 0x00000000);

    // Define color array
    const colors = [
      { rect: 0x0000ffff, text: 0xffffffff }, // blue, white
      { rect: 0x8b4513ff, text: 0xffffffff }, // brown, white
    ];

    for (let index = 0; index < elements.length; index++) {
      const element = elements[index];
      const color = colors[index % colors.length];

      // Draw rectangle
      image.scan(
        element.rect.left,
        element.rect.top,
        element.rect.width,
        element.rect.height,
        function (x, y, idx) {
          if (
            x === element.rect.left ||
            x === element.rect.left + element.rect.width - 1 ||
            y === element.rect.top ||
            y === element.rect.top + element.rect.height - 1
          ) {
            this.bitmap.data[idx + 0] = (color.rect >> 24) & 0xff; // R
            this.bitmap.data[idx + 1] = (color.rect >> 16) & 0xff; // G
            this.bitmap.data[idx + 2] = (color.rect >> 8) & 0xff; // B
            this.bitmap.data[idx + 3] = color.rect & 0xff; // A
          }
        },
      );

      // Calculate text position
      const textWidth = element.indexId.toString().length * 8;
      const textHeight = 12;
      const rectWidth = textWidth + 5;
      const rectHeight = textHeight + 4;
      let rectX = element.rect.left - rectWidth;
      let rectY =
        element.rect.top + element.rect.height / 2 - textHeight / 2 - 2;

      // Check if obscured by the left
      if (rectX < 0) {
        rectX = element.rect.left;
        rectY = element.rect.top - rectHeight;
      }

      // Draw text background
      image.scan(rectX, rectY, rectWidth, rectHeight, function (x, y, idx) {
        this.bitmap.data[idx + 0] = (color.rect >> 24) & 0xff; // R
        this.bitmap.data[idx + 1] = (color.rect >> 16) & 0xff; // G
        this.bitmap.data[idx + 2] = (color.rect >> 8) & 0xff; // B
        this.bitmap.data[idx + 3] = color.rect & 0xff; // A
      });
      // Draw text (simplified, as Jimp doesn't have built-in text drawing)
      const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
      image.print(
        font,
        rectX,
        rectY,
        {
          text: element.indexId.toString(),
          alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
          alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
        },
        rectWidth,
        rectHeight,
      );
    }

    return image.getBufferAsync(Jimp.MIME_PNG);
  };

  return createPngOverlay(elements, imageWidth, imageHeight);
};

export const compositeElementInfoImg = async (options: {
  inputImgBase64: string;
  elementsPositionInfo: Array<ElementType>;
}) => {
  const { inputImgBase64, elementsPositionInfo } = options;
  const imageBuffer = Buffer.from(inputImgBase64, 'base64');
  const image = await Jimp.read(imageBuffer);
  const { width, height } = image.bitmap;

  if (!width || !height) {
    throw Error('Image processing failed because width or height is undefined');
  }

  // Create svg overlay
  const svgOverlay = await createSvgOverlay(
    elementsPositionInfo,
    width,
    height,
  );

  return await Jimp.read(imageBuffer)
    .then(async (image: Jimp) => {
      const svgImage = await Jimp.read(svgOverlay);
      return image.composite(svgImage, 0, 0, {
        mode: Jimp.BLEND_SOURCE_OVER,
        opacitySource: 1,
        opacityDest: 1,
      });
    })
    .then((compositeImage: Jimp) => {
      return compositeImage.getBufferAsync(Jimp.MIME_PNG);
    })
    .then((buffer: Buffer) => {
      return buffer.toString('base64');
    })
    .catch((error: unknown) => {
      throw error;
    });
};

export const processImageElementInfo = async (options: {
  inputImgBase64: string;
  elementsPositionInfo: Array<ElementType>;
  elementsPositionInfoWithoutText: Array<ElementType>;
}) => {
  // Get the size of the original image
  const base64Image = options.inputImgBase64.split(';base64,').pop();
  assert(base64Image, 'base64Image is undefined');

  const [
    compositeElementInfoImgBase64,
    compositeElementInfoImgWithoutTextBase64,
  ] = await Promise.all([
    compositeElementInfoImg({
      inputImgBase64: options.inputImgBase64,
      elementsPositionInfo: options.elementsPositionInfo,
    }),
    compositeElementInfoImg({
      inputImgBase64: options.inputImgBase64,
      elementsPositionInfo: options.elementsPositionInfoWithoutText,
    }),
  ]);

  return {
    compositeElementInfoImgBase64,
    compositeElementInfoImgWithoutTextBase64,
  };
};
