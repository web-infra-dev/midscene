import assert from 'node:assert';
import type { PhotonImage as PhotonImageType } from '@silvia-odwyer/photon-node';
import { NodeType } from '../constants';
import type { BaseElement, Rect } from '../types';
import getPhoton from './get-photon';
import { photonFromBase64, photonToBase64 } from './transform';

// Simple 5x7 bitmap font for digits 0-9
const DIGIT_FONT: Record<string, number[][]> = {
  '0': [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  '1': [
    [0, 0, 1, 0, 0],
    [0, 1, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 1, 1, 0],
  ],
  '2': [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 1, 1, 0],
    [0, 1, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
  ],
  '3': [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 1, 1, 0],
    [0, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  '4': [
    [0, 0, 0, 1, 0],
    [0, 0, 1, 1, 0],
    [0, 1, 0, 1, 0],
    [1, 0, 0, 1, 0],
    [1, 1, 1, 1, 1],
    [0, 0, 0, 1, 0],
    [0, 0, 0, 1, 0],
  ],
  '5': [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 0],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  '6': [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  '7': [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
  ],
  '8': [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  '9': [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
};

const FONT_WIDTH = 5;
const FONT_HEIGHT = 7;
const FONT_SCALE = 2; // Scale up for better visibility

interface ElementForOverlay {
  rect: Rect;
  indexId?: number;
}

function drawDigit(
  pixels: Uint8Array,
  width: number,
  height: number,
  digit: string,
  startX: number,
  startY: number,
  color: { r: number; g: number; b: number; a: number },
) {
  const bitmap = DIGIT_FONT[digit];
  if (!bitmap) return;

  for (let row = 0; row < FONT_HEIGHT; row++) {
    for (let col = 0; col < FONT_WIDTH; col++) {
      if (bitmap[row][col] === 1) {
        // Scale the pixel
        for (let sy = 0; sy < FONT_SCALE; sy++) {
          for (let sx = 0; sx < FONT_SCALE; sx++) {
            const x = startX + col * FONT_SCALE + sx;
            const y = startY + row * FONT_SCALE + sy;
            if (x >= 0 && x < width && y >= 0 && y < height) {
              const idx = (y * width + x) * 4;
              pixels[idx + 0] = color.r;
              pixels[idx + 1] = color.g;
              pixels[idx + 2] = color.b;
              pixels[idx + 3] = color.a;
            }
          }
        }
      }
    }
  }
}

function drawNumber(
  pixels: Uint8Array,
  width: number,
  height: number,
  num: number,
  startX: number,
  startY: number,
  color: { r: number; g: number; b: number; a: number },
) {
  const str = num.toString();
  let x = startX;
  for (const digit of str) {
    drawDigit(pixels, width, height, digit, x, startY, color);
    x += FONT_WIDTH * FONT_SCALE + 1; // 1px spacing between digits
  }
}

function getNumberWidth(num: number): number {
  return num.toString().length * (FONT_WIDTH * FONT_SCALE + 1) - 1;
}

function drawRect(
  pixels: Uint8Array,
  width: number,
  height: number,
  rect: { x: number; y: number; w: number; h: number },
  color: { r: number; g: number; b: number; a: number },
  thickness: number,
) {
  const { x, y, w, h } = rect;

  for (let py = y; py < y + h && py < height; py++) {
    for (let px = x; px < x + w && px < width; px++) {
      if (px < 0 || py < 0) continue;

      // Check if this pixel is on the border
      const isLeftBorder = px >= x && px < x + thickness;
      const isRightBorder = px <= x + w - 1 && px > x + w - thickness - 1;
      const isTopBorder = py >= y && py < y + thickness;
      const isBottomBorder = py <= y + h - 1 && py > y + h - thickness - 1;

      if (isLeftBorder || isRightBorder || isTopBorder || isBottomBorder) {
        const idx = (py * width + px) * 4;
        pixels[idx + 0] = color.r;
        pixels[idx + 1] = color.g;
        pixels[idx + 2] = color.b;
        pixels[idx + 3] = color.a;
      }
    }
  }
}

function fillRect(
  pixels: Uint8Array,
  width: number,
  height: number,
  rect: { x: number; y: number; w: number; h: number },
  color: { r: number; g: number; b: number; a: number },
) {
  const { x, y, w, h } = rect;

  for (let py = y; py < y + h && py < height; py++) {
    for (let px = x; px < x + w && px < width; px++) {
      if (px < 0 || py < 0) continue;
      const idx = (py * width + px) * 4;
      pixels[idx + 0] = color.r;
      pixels[idx + 1] = color.g;
      pixels[idx + 2] = color.b;
      pixels[idx + 3] = color.a;
    }
  }
}

function blendPixels(
  basePixels: Uint8Array,
  overlayPixels: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const result = new Uint8Array(basePixels.length);
  for (let i = 0; i < basePixels.length; i += 4) {
    const overlayAlpha = overlayPixels[i + 3] / 255;
    const baseAlpha = basePixels[i + 3] / 255;

    if (overlayAlpha === 0) {
      result[i + 0] = basePixels[i + 0];
      result[i + 1] = basePixels[i + 1];
      result[i + 2] = basePixels[i + 2];
      result[i + 3] = basePixels[i + 3];
    } else {
      const outAlpha = overlayAlpha + baseAlpha * (1 - overlayAlpha);
      result[i + 0] = Math.round(
        (overlayPixels[i + 0] * overlayAlpha +
          basePixels[i + 0] * baseAlpha * (1 - overlayAlpha)) /
          outAlpha,
      );
      result[i + 1] = Math.round(
        (overlayPixels[i + 1] * overlayAlpha +
          basePixels[i + 1] * baseAlpha * (1 - overlayAlpha)) /
          outAlpha,
      );
      result[i + 2] = Math.round(
        (overlayPixels[i + 2] * overlayAlpha +
          basePixels[i + 2] * baseAlpha * (1 - overlayAlpha)) /
          outAlpha,
      );
      result[i + 3] = Math.round(outAlpha * 255);
    }
  }
  return result;
}

const createSvgOverlay = async (
  elements: Array<ElementForOverlay>,
  imageWidth: number,
  imageHeight: number,
  boxPadding = 5,
  borderThickness = 2,
  prompt?: string,
): Promise<Uint8Array> => {
  // Create transparent overlay
  const overlayPixels = new Uint8Array(imageWidth * imageHeight * 4);

  // Define color array
  const colors = [
    {
      rect: { r: 0xc6, g: 0x23, b: 0x00, a: 0xff },
      text: { r: 0xff, g: 0xff, b: 0xff, a: 0xff },
    }, // red, white
    {
      rect: { r: 0x00, g: 0x00, b: 0xff, a: 0xff },
      text: { r: 0xff, g: 0xff, b: 0xff, a: 0xff },
    }, // blue, white
    {
      rect: { r: 0x8b, g: 0x45, b: 0x13, a: 0xff },
      text: { r: 0xff, g: 0xff, b: 0xff, a: 0xff },
    }, // brown, white
    {
      rect: { r: 0x3e, g: 0x7b, b: 0x27, a: 0xff },
      text: { r: 0xff, g: 0xff, b: 0xff, a: 0xff },
    }, // green, white
    {
      rect: { r: 0x50, g: 0x00, b: 0x73, a: 0xff },
      text: { r: 0xff, g: 0xff, b: 0xff, a: 0xff },
    }, // purple, white
  ];

  // Draw prompt text if provided
  if (prompt) {
    const promptPadding = 10;
    const promptMargin = 20;
    const promptHeight = 30;
    const promptY = imageHeight - promptHeight - promptMargin;

    // Draw prompt background (semi-transparent black)
    fillRect(
      overlayPixels,
      imageWidth,
      imageHeight,
      {
        x: 0,
        y: promptY,
        w: imageWidth,
        h: promptHeight,
      },
      { r: 0x00, g: 0x00, b: 0x00, a: 0xcc },
    );

    // Note: We skip drawing prompt text since we only have digit font
    // The prompt feature was mostly for debugging anyway
  }

  for (let index = 0; index < elements.length; index++) {
    const element = elements[index];
    const color = colors[index % colors.length];

    // Add padding to the rect
    const paddedLeft = Math.max(0, element.rect.left - boxPadding);
    const paddedTop = Math.max(0, element.rect.top - boxPadding);
    const paddedWidth = Math.min(
      imageWidth - paddedLeft,
      element.rect.width + boxPadding * 2,
    );
    const paddedHeight = Math.min(
      imageHeight - paddedTop,
      element.rect.height + boxPadding * 2,
    );
    const paddedRect = {
      x: paddedLeft,
      y: paddedTop,
      w: paddedWidth,
      h: paddedHeight,
    };

    // Draw rectangle border
    drawRect(
      overlayPixels,
      imageWidth,
      imageHeight,
      paddedRect,
      color.rect,
      borderThickness,
    );

    // Calculate text position
    const indexId = element.indexId;
    if (typeof indexId !== 'number') {
      continue;
    }

    const textWidth = getNumberWidth(indexId);
    const textHeight = FONT_HEIGHT * FONT_SCALE;
    const rectWidth = textWidth + 5;
    const rectHeight = textHeight + 4;
    let rectX = paddedLeft - rectWidth;
    let rectY =
      paddedTop + Math.floor(paddedHeight / 2) - Math.floor(textHeight / 2) - 2;

    // Check if this new position overlaps with any existing boxes
    const checkOverlap = (x: number, y: number) => {
      return elements.slice(0, index).some((otherElement) => {
        return (
          x < otherElement.rect.left + otherElement.rect.width &&
          x + rectWidth > otherElement.rect.left &&
          y < otherElement.rect.top + otherElement.rect.height &&
          y + rectHeight > otherElement.rect.top
        );
      });
    };

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
      // Check top position
      if (
        !checkOverlap(paddedLeft, paddedTop - rectHeight - 2) &&
        isWithinBounds(paddedLeft, paddedTop - rectHeight - 2)
      ) {
        rectX = paddedLeft;
        rectY = paddedTop - rectHeight - 2;
      }
      // Check bottom position
      else if (
        !checkOverlap(paddedLeft, paddedTop + paddedHeight + 2) &&
        isWithinBounds(paddedLeft, paddedTop + paddedHeight + 2)
      ) {
        rectX = paddedLeft;
        rectY = paddedTop + paddedHeight + 2;
      }
      // Check right position
      else if (
        !checkOverlap(paddedLeft + paddedWidth + 2, paddedTop) &&
        isWithinBounds(paddedLeft + paddedWidth + 2, paddedTop)
      ) {
        rectX = paddedLeft + paddedWidth + 2;
        rectY = paddedTop;
      }
      // If all sides are overlapped or out of bounds, place it inside the box at the top
      else {
        rectX = paddedLeft;
        rectY = paddedTop + 2;
      }
    }

    // Draw text background
    fillRect(
      overlayPixels,
      imageWidth,
      imageHeight,
      {
        x: rectX,
        y: rectY,
        w: rectWidth,
        h: rectHeight,
      },
      color.rect,
    );

    // Draw text (centered in the background rect)
    const textX = rectX + Math.floor((rectWidth - textWidth) / 2);
    const textY = rectY + Math.floor((rectHeight - textHeight) / 2);
    drawNumber(
      overlayPixels,
      imageWidth,
      imageHeight,
      indexId,
      textX,
      textY,
      color.text,
    );
  }

  return overlayPixels;
};

export const compositeElementInfoImg = async (options: {
  inputImgBase64: string;
  elementsPositionInfo: Array<ElementForOverlay>;
  size?: { width: number; height: number };
  annotationPadding?: number;
  borderThickness?: number;
  prompt?: string;
}) => {
  assert(options.inputImgBase64, 'inputImgBase64 is required');
  const { PhotonImage, SamplingFilter, resize } = await getPhoton();

  let width = 0;
  let height = 0;

  if (options.size) {
    width = options.size.width;
    height = options.size.height;
  }

  let photonImage = await photonFromBase64(options.inputImgBase64);

  if (!width || !height) {
    width = photonImage.get_width();
    height = photonImage.get_height();
  } else {
    const imageWidth = photonImage.get_width();
    const imageHeight = photonImage.get_height();
    // Resize the image to the specified width and height if it's not already the same
    if (imageWidth !== width || imageHeight !== height) {
      const resized = resize(
        photonImage,
        width,
        height,
        SamplingFilter.Nearest,
      );
      photonImage.free();
      photonImage = resized;
    }
  }

  if (!width || !height) {
    photonImage.free();
    throw Error('Image processing failed because width or height is undefined');
  }

  const { elementsPositionInfo, prompt } = options;

  try {
    // Get base image pixels
    const basePixels = photonImage.get_raw_pixels();

    // Create overlay with annotations
    const overlayPixels = await createSvgOverlay(
      elementsPositionInfo,
      width,
      height,
      options.annotationPadding,
      options.borderThickness,
      prompt,
    );

    // Blend overlay onto base image
    const blendedPixels = blendPixels(basePixels, overlayPixels, width, height);

    // Create result image
    const resultImage = new PhotonImage(blendedPixels, width, height);
    const base64 = await photonToBase64(resultImage, 90);

    resultImage.free();
    return base64;
  } finally {
    photonImage.free();
  }
};

export const processImageElementInfo = async (options: {
  inputImgBase64: string;
  elementsPositionInfo: Array<BaseElement>;
  elementsPositionInfoWithoutText: Array<BaseElement>;
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

export async function annotateRects(
  imgBase64: string,
  rects: Rect[],
  prompt?: string,
) {
  const markedImage = await compositeElementInfoImg({
    inputImgBase64: imgBase64,
    elementsPositionInfo: rects.map((rect, index) => {
      return {
        id: `rect-${index}`,
        rect,
        indexId: index + 1,
        attributes: { nodeType: NodeType.CONTAINER },
        content: '',
        center: [rect.left + rect.width / 2, rect.top + rect.height / 2],
      };
    }),
    annotationPadding: 0,
    prompt,
  });
  return markedImage;
}
