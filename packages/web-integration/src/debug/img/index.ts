import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import type { NodeType } from '@/extractor/constants';
import sharp from 'sharp';

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
  let svgContent = `<svg width="${imageWidth}" height="${imageHeight}" xmlns="http://www.w3.org/2000/svg">`;

  // Define color array
  const colors = [
    { rect: 'blue', text: 'white' },
    { rect: 'green', text: 'white' },
  ];

  // Define clipping path
  svgContent += '<defs>';
  elements.forEach((element, index) => {
    svgContent += `
      <clipPath id="clip${index}">
        <rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" />
      </clipPath>
    `;
  });
  svgContent += '</defs>';

  elements.forEach((element, index) => {
    // Calculate the width and height of the text
    const textWidth = element.label.length * 8; // Assume that each character is 8px wide
    const textHeight = 12; // Assume that the text height is 20px

    // Calculates the position of the initial color block so that it wraps and centers the text
    const rectWidth = textWidth + 5;
    const rectHeight = textHeight + 4;
    let rectX = element.x - rectWidth;
    let rectY = element.y + element.height / 2 - textHeight / 2 - 2;

    // Initial text position
    let textX = rectX + rectWidth / 2;
    let textY = rectY + rectHeight / 2 + 6;

    // Check to see if it's obscured by the left
    if (rectX < 0) {
      rectX = element.x;
      rectY = element.y - rectHeight;
      textX = rectX + rectWidth / 2;
      textY = rectY + rectHeight / 2 + 6;
    }

    // Choose color
    const color = colors[index % colors.length];

    // Draw boxes and text
    svgContent += `
      <rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" 
            style="fill:none;stroke:${color.rect};stroke-width:4" clip-path="url(#clip${index})" />
      <rect x="${rectX}" y="${rectY}" width="${rectWidth}" height="${rectHeight}" style="fill:${color.rect};" />
      <text x="${textX}" y="${textY}" 
            text-anchor="middle" dominant-baseline="middle" style="fill:${color.text};font-size:12px;font-weight:bold;">
        ${element.label}
      </text>
    `;
  });

  svgContent += '</svg>';
  return Buffer.from(svgContent);
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
  const metadata = await sharp(imageBuffer).metadata();
  const { width, height } = metadata;

  if (width && height) {
    // Create svg overlay
    const svgOverlay = createSvgOverlay(
      options.elementsPositionInfo,
      width,
      height,
    );
    const svgOverlayWithoutText = createSvgOverlay(
      options.elementsPositionInfoWithoutText,
      width,
      height,
    );

    // Composite picture
    const compositeElementInfoImgBase64 = await sharp(imageBuffer)
      // .resize(newDimensions.width, newDimensions.height)
      .composite([{ input: svgOverlay, blend: 'over' }])
      .toBuffer()
      .then((data) => {
        // Convert image data to base64 encoding
        return data.toString('base64');
      })
      .catch((err) => {
        throw err;
      });

    // Composite picture withoutText
    const compositeElementInfoImgWithoutTextBase64 = await sharp(imageBuffer)
      // .resize(newDimensions.width, newDimensions.height)
      .composite([{ input: svgOverlayWithoutText, blend: 'over' }])
      .toBuffer()
      .then((data) => {
        // Convert image data to base64 encoding
        return data.toString('base64');
      })
      .catch((err) => {
        throw err;
      });

    return {
      compositeElementInfoImgBase64,
      compositeElementInfoImgWithoutTextBase64,
    };
  }
  throw Error('Image processing failed because width or height is undefined');
};
