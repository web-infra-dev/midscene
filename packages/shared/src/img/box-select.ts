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
      { rect: 0xff0000ff, text: 0xffffffff }, // red, white
      // { rect: 0x0000ffff, text: 0xffffffff }, // blue, white
      // { rect: 0x8b4513ff, text: 0xffffffff }, // brown, white
    ];

    const boxPadding = 5;
    for (let index = 0; index < elements.length; index++) {
      const element = elements[index];
      const color = colors[index % colors.length];

      // Add 5px padding to the rect
      const paddedRect = {
        left: Math.max(0, element.rect.left - boxPadding),
        top: Math.max(0, element.rect.top - boxPadding),
        width: Math.min(
          imageWidth - element.rect.left,
          element.rect.width + boxPadding * 2,
        ),
        height: Math.min(
          imageHeight - element.rect.top,
          element.rect.height + boxPadding * 2,
        ),
      };

      // Draw rectangle
      image.scan(
        paddedRect.left,
        paddedRect.top,
        paddedRect.width,
        paddedRect.height,
        function (x, y, idx) {
          if (
            x === paddedRect.left ||
            x === paddedRect.left + paddedRect.width - 1 ||
            y === paddedRect.top ||
            y === paddedRect.top + paddedRect.height - 1
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
      let rectX = paddedRect.left - rectWidth;
      let rectY = paddedRect.top + paddedRect.height / 2 - textHeight / 2 - 2;

      // Check if this new position overlaps with any existing boxes
      // Function to check if a given position overlaps with any existing boxes
      const checkOverlap = (x: number, y: number) => {
        // Check against all previously processed elements
        return elements.slice(0, index).some((otherElement) => {
          // Check if the rectangles overlap
          return (
            x < otherElement.rect.left + otherElement.rect.width &&
            x + rectWidth > otherElement.rect.left &&
            y < otherElement.rect.top + otherElement.rect.height &&
            y + rectHeight > otherElement.rect.top
          );
        });
      };

      // Function to check if a given position is within the image bounds
      const isWithinBounds = (x: number, y: number) => {
        return (
          x >= 0 &&
          x + rectWidth <= imageWidth &&
          y >= 0 &&
          y + rectHeight <= imageHeight
        );
      };

      // Check left side (original position)
      if (checkOverlap(rectX, rectY) || !isWithinBounds(rectX, rectY)) {
        // If the original position overlaps or is out of bounds, try alternative positions

        // Check top position
        if (
          !checkOverlap(paddedRect.left, paddedRect.top - rectHeight - 2) &&
          isWithinBounds(paddedRect.left, paddedRect.top - rectHeight - 2)
        ) {
          rectX = paddedRect.left;
          rectY = paddedRect.top - rectHeight - 2;
        }
        // Check bottom position
        else if (
          !checkOverlap(
            paddedRect.left,
            paddedRect.top + paddedRect.height + 2,
          ) &&
          isWithinBounds(
            paddedRect.left,
            paddedRect.top + paddedRect.height + 2,
          )
        ) {
          rectX = paddedRect.left;
          rectY = paddedRect.top + paddedRect.height + 2;
        }
        // Check right position
        else if (
          !checkOverlap(
            paddedRect.left + paddedRect.width + 2,
            paddedRect.top,
          ) &&
          isWithinBounds(paddedRect.left + paddedRect.width + 2, paddedRect.top)
        ) {
          rectX = paddedRect.left + paddedRect.width + 2;
          rectY = paddedRect.top;
        }
        // If all sides are overlapped or out of bounds, place it inside the box at the top
        else {
          rectX = paddedRect.left;
          rectY = paddedRect.top + 2;
        }
      }
      // Note: If the original left position doesn't overlap and is within bounds, we keep it as is

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
