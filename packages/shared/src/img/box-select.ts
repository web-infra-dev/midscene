import assert from 'node:assert';
import type { Buffer } from 'node:buffer';
import type { Rect } from '@/types';
import type Jimp from 'jimp';
import type { NodeType } from '../constants';
import getJimp from './get-jimp';
import { bufferFromBase64, imageInfo, imageInfoOfBase64 } from './index';

// Define picture path
type ElementType = {
  locator?: string;

  rect: Rect;

  center?: [number, number];

  id?: string;

  indexId: number;

  attributes?: {
    nodeType: NodeType;
    [key: string]: string;
  };
};

let cachedFont: any = null;

const createSvgOverlay = async (
  elements: Array<ElementType>,
  imageWidth: number,
  imageHeight: number,
): Promise<Jimp> => {
  const Jimp = await getJimp();
  const image = new Jimp(imageWidth, imageHeight, 0x00000000);
  //@ts-ignore
  // image.color([{ apply: 'xor', params: ['#00ff00'] }]);

  // Define color array
  const colors = [
    { rect: 0xffff00ff, text: 0xffffffff }, // yellow, white
    // { rect: 0x0000ffff, text: 0xffffffff }, // blue, white
    // { rect: 0x8b4513ff, text: 0xffffffff }, // brown, white
  ];

  //@ts-ignore
  image.color([{ apply: 'xor', params: ['#ffffff'] }]);
  const boxPadding = 2; // Reduced from 5 to 2
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index];
    const color = colors[index % colors.length];

    // Add 2px padding to the rect
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
    // Calculate text position with smaller dimensions
    const textWidth = element.indexId.toString().length * 7; // Adjusted from 6 to 7
    const textHeight = 14; // Adjusted from 8 to 14
    const rectWidth = textWidth + 4; // Reduced padding
    const rectHeight = textHeight + 4; // Reduced padding
    let rectX = paddedRect.left - rectWidth;
    let rectY = paddedRect.top + paddedRect.height / 2 - textHeight / 2 - 1;

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
        !checkOverlap(paddedRect.left, paddedRect.top - rectHeight - 1) &&
        isWithinBounds(paddedRect.left, paddedRect.top - rectHeight - 1)
      ) {
        rectX = paddedRect.left;
        rectY = paddedRect.top - rectHeight - 1;
      }
      // Check bottom position
      else if (
        !checkOverlap(
          paddedRect.left,
          paddedRect.top + paddedRect.height + 1,
        ) &&
        isWithinBounds(paddedRect.left, paddedRect.top + paddedRect.height + 1)
      ) {
        rectX = paddedRect.left;
        rectY = paddedRect.top + paddedRect.height + 1;
      }
      // Check right position
      else if (
        !checkOverlap(paddedRect.left + paddedRect.width + 1, paddedRect.top) &&
        isWithinBounds(paddedRect.left + paddedRect.width + 1, paddedRect.top)
      ) {
        rectX = paddedRect.left + paddedRect.width + 1;
        rectY = paddedRect.top;
      }
      // If all sides are overlapped or out of bounds, place it inside the box at the top
      else {
        rectX = paddedRect.left;
        rectY = paddedRect.top + 1;
      }
    }
    // Note: If the original left position doesn't overlap and is within bounds, we keep it as is
    // Draw text background with yellow color
    image.scan(rectX, rectY, rectWidth, rectHeight, function (x, y, idx) {
      this.bitmap.data[idx + 0] = 255; // R
      this.bitmap.data[idx + 1] = 255; // G
      this.bitmap.data[idx + 2] = 0; // B
      this.bitmap.data[idx + 3] = 255; // A
    });
    // Draw text (simplified, as Jimp doesn't have built-in text drawing)
    try {
      cachedFont = cachedFont || (await Jimp.loadFont(Jimp.FONT_SANS_14_BLACK)); // Changed from 12 to 14
    } catch (error) {
      console.error('Error loading font', error);
    }
    image.print(
      cachedFont,
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

  return image;
};

export const compositeElementInfoImg = async (options: {
  inputImgBase64: string;
  elementsPositionInfo: Array<ElementType>;
  size?: { width: number; height: number };
}) => {
  assert(options.inputImgBase64, 'inputImgBase64 is required');
  let width = 0;
  let height = 0;
  let jimpImage: Jimp;

  const Jimp = await getJimp();

  if (options.size) {
    width = options.size.width;
    height = options.size.height;
  }

  if (!width || !height) {
    const info = await imageInfoOfBase64(options.inputImgBase64);
    width = info.width;
    height = info.height;
    jimpImage = info.jimpImage;
  } else {
    const imageBuffer = await bufferFromBase64(options.inputImgBase64);
    jimpImage = await Jimp.read(imageBuffer);
    const imageBitmap = jimpImage.bitmap;
    // Resize the image to the specified width and height if it's not already the same. It usually happens when dpr is not 1
    if (imageBitmap.width !== width || imageBitmap.height !== height) {
      jimpImage.resize(width, height, Jimp.RESIZE_NEAREST_NEIGHBOR);
    }
  }

  if (!width || !height) {
    throw Error('Image processing failed because width or height is undefined');
  }

  const { elementsPositionInfo } = options;

  const result = await Promise.resolve(jimpImage)
    .then(async (image: Jimp) => {
      // Create svg overlay
      const svgOverlay = await createSvgOverlay(
        elementsPositionInfo,
        width,
        height,
      );
      const svgImage = await Jimp.read(svgOverlay);
      const compositeImage = await image.composite(svgImage, 0, 0, {
        mode: Jimp.BLEND_SOURCE_OVER,
        opacitySource: 1,
        opacityDest: 1,
      });
      return compositeImage;
    })
    .then(async (compositeImage: Jimp) => {
      const base64 = await compositeImage.getBase64Async(Jimp.MIME_PNG);
      return base64;
    })
    .catch((error: unknown) => {
      throw error;
    });

  return result;
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
