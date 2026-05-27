import type { TModelFamily } from '@midscene/shared/env';

export function bboxDescription(modelFamily: TModelFamily | undefined) {
  if (modelFamily === 'gemini') {
    return 'box_2d bounding box for the target element as [ymin, xmin, ymax, xmax] normalized to 0-1000 relative to the screenshot. Do NOT use pixel coordinates or screenshot width/height.';
  }

  if (modelFamily === 'qwen2.5-vl' || modelFamily === 'gpt-5') {
    return '2d bounding box as [xmin, ymin, xmax, ymax] in pixel coordinates relative to the screenshot.';
  }

  return '2d bounding box as [xmin, ymin, xmax, ymax] normalized to 0-1000 relative to the screenshot. Do NOT use pixel coordinates or screenshot width/height.';
}
