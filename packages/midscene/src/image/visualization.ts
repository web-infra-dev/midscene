import { Buffer } from 'buffer';
import Sharp from 'sharp';
import { Color, UIContext, UISection } from '..';
import { imageInfo } from './info';
import { getTmpFile } from '@/utils';

const colors: Color[] = [
  {
    name: 'Red',
    hex: '#FF0000',
  },
  {
    name: 'Green',
    hex: '#00FF00',
  },
  {
    name: 'Blue',
    hex: '#0000FF',
  },
  {
    name: 'Yellow',
    hex: '#FFFF00',
  },
  {
    name: 'Cyan',
    hex: '#00FFFF',
  },
  {
    name: 'Magenta',
    hex: '#FF00FF',
  },
  {
    name: 'Orange',
    hex: '#FFA500',
  },
  {
    name: 'Purple',
    hex: '#800080',
  },
  {
    name: 'Brown',
    hex: '#A52A2A',
  },
  {
    name: 'Pink',
    hex: '#FFC0CB',
  },
  {
    name: 'Light Blue',
    hex: '#ADD8E6',
  },
  {
    name: 'Lime',
    hex: '#00FF00',
  },
  {
    name: 'Violet',
    hex: '#EE82EE',
  },
  {
    name: 'Gold',
    hex: '#FFD700',
  },
  {
    name: 'Teal',
    hex: '#008080',
  },
];

const sizeLimit = 512;
const textFontSize = 12;

/**
 * Composes a section diagram based on the given sections and context
 * It creates an SVG representation of the sections and converts it to a PNG image file
 *
 * @param sections - An array of UISection objects representing the sections to be included in the diagram
 * @param context - The UIContext object containing the size information for the diagram
 * @returns {Promise<{ file: string; sectionNameColorMap: Record<string, Color>; }>}
 */
export async function composeSectionDiagram(
  sections: UISection[],
  context: UIContext,
): Promise<{
  file: string;
  sectionNameColorMap: Record<string, Color>;
}> {
  const { width, height } = await imageInfo(context.screenshotBase64);
  const ratio = Math.min(sizeLimit / width, sizeLimit / height, 1);
  const canvasWidth = width * ratio;
  const canvasHeight = height * ratio;

  const sectionNameColorMap: Record<string, Color> = {};
  const rects = sections.map((section, index) => {
    const { left, top, width, height } = section.rect;
    const color = colors[index % colors.length];
    sectionNameColorMap[section.name] = color;
    return `
            <rect x="${left * ratio}" y="${top * ratio}" width="${width * ratio}" height="${
      height * ratio
    }" fill="${color.hex}" />
            <text x="${left * ratio}" y="${
      top * ratio + textFontSize
    }" font-family="Arial" font-size="${textFontSize}" fill="black">
                ${section.name}
            </text>
        `;
  });

  const rectangles = `
        <svg width="${canvasWidth}" height="${canvasHeight}">
        ${rects.join('\n')}
        </svg>
    `;
  const svgBuffer = Buffer.from(rectangles);

  const file = getTmpFile('png');
  await Sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: svgBuffer }])
    .png()
    .toFile(file);

  return {
    file,
    sectionNameColorMap,
  };
}
