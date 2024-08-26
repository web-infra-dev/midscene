import { Buffer } from 'node:buffer';
import { getTmpFile } from '@/utils';
import Jimp from 'jimp';
import type { Color, UIContext, UISection } from '..';
import { imageInfo } from './info';

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
  const canvasWidth = Math.floor(width * ratio);
  const canvasHeight = Math.floor(height * ratio);

  const sectionNameColorMap: Record<string, Color> = {};
  const image = new Jimp(canvasWidth, canvasHeight, 0xffffffff);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const { left, top, width, height } = section.rect;
    const color = colors[i % colors.length];
    sectionNameColorMap[section.name] = color;

    const rectLeft = Math.floor(left * ratio);
    const rectTop = Math.floor(top * ratio);
    const rectWidth = Math.floor(width * ratio);
    const rectHeight = Math.floor(height * ratio);

    image.scan(rectLeft, rectTop, rectWidth, rectHeight, function (x, y, idx) {
      this.bitmap.data[idx + 0] = Number.parseInt(color.hex.slice(1, 3), 16);
      this.bitmap.data[idx + 1] = Number.parseInt(color.hex.slice(3, 5), 16);
      this.bitmap.data[idx + 2] = Number.parseInt(color.hex.slice(5, 7), 16);
      this.bitmap.data[idx + 3] = 255;
    });

    const font = await Jimp.loadFont(Jimp.FONT_SANS_12_BLACK);
    image.print(font, rectLeft, rectTop, section.name);
  }

  const file = getTmpFile('png');
  await image.writeAsync(file);

  return {
    file,
    sectionNameColorMap,
  };
}
