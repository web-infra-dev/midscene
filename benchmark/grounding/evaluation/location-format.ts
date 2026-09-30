import type { BBox } from './task-types.js';

export type ModelFamily = string;

function extractNumbers(content: string): number[] {
  const matches = content.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) {
    return [];
  }
  return matches
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

export function parseBboxFromResponse(content: string): BBox | null {
  const numbers = extractNumbers(content);
  if (numbers.length < 4) {
    return null;
  }

  const [xMin, yMin, xMax, yMax] = numbers;
  return { xMin, yMin, xMax, yMax };
}
