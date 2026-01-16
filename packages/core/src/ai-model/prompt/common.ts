import type { TModelFamily } from '@midscene/shared/env';
export function bboxDescription(modelFamily: TModelFamily | undefined) {
  if (modelFamily === 'gemini') {
    return 'box_2d bounding box for the target element, should be [ymin, xmin, ymax, xmax] normalized to 0-1000.';
  }
  return '2d bounding box as [xmin, ymin, xmax, ymax]';
}
