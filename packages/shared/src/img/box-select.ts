import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import Jimp from 'jimp';
import type { NodeType } from '../constants';

// Define picture path
type ElementType = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  attributes: {
    [key: string]: string;
    nodeType: NodeType;
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
        element.x,
        element.y,
        element.width,
        element.height,
        function (x, y, idx) {
          if (
            x === element.x ||
            x === element.x + element.width - 1 ||
            y === element.y ||
            y === element.y + element.height - 1
          ) {
            this.bitmap.data[idx + 0] = (color.rect >> 24) & 0xff; // R
            this.bitmap.data[idx + 1] = (color.rect >> 16) & 0xff; // G
            this.bitmap.data[idx + 2] = (color.rect >> 8) & 0xff; // B
            this.bitmap.data[idx + 3] = color.rect & 0xff; // A
          }
        },
      );

      // Calculate text position
      const textWidth = element.label.length * 8;
      const textHeight = 12;
      const rectWidth = textWidth + 5;
      const rectHeight = textHeight + 4;
      let rectX = element.x - rectWidth;
      let rectY = element.y + element.height / 2 - textHeight / 2 - 2;

      // Check if obscured by the left
      if (rectX < 0) {
        rectX = element.x;
        rectY = element.y - rectHeight;
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
          text: element.label,
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

export const processImageElementInfo = async (options: {
  inputImgBase64: string;
  elementsPositionInfo: Array<ElementType>;
  elementsPositionInfoWithoutText: Array<ElementType>;
}) => {
  // Get the size of the original image
  const base64Image = options.inputImgBase64.split(';base64,').pop();
  assert(base64Image, 'base64Image is undefined');

  const imageBuffer = Buffer.from(base64Image, 'base64');
  const image = await Jimp.read(imageBuffer);
  const { width, height } = image.bitmap;

  if (width && height) {
    // Create svg overlay
    const svgOverlay = await createSvgOverlay(
      options.elementsPositionInfo,
      width,
      height,
    );
    const svgOverlayWithoutText = await createSvgOverlay(
      options.elementsPositionInfoWithoutText,
      width,
      height,
    );

    // Composite picture
    const compositeElementInfoImgBase64 = await Jimp.read(imageBuffer)
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

    // Composite picture withoutText
    const compositeElementInfoImgWithoutTextBase64 = await Jimp.read(
      imageBuffer,
    )
      .then(async (image: Jimp) => {
        const svgImage = await Jimp.read(svgOverlayWithoutText);
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

    return {
      compositeElementInfoImgBase64,
      compositeElementInfoImgWithoutTextBase64,
    };
  }
  throw Error('Image processing failed because width or height is undefined');
};
