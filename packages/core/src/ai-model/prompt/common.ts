import type { TVlModeTypes } from '@midscene/shared/env';
export function bboxDescription(vlMode: TVlModeTypes | undefined) {
  if (vlMode === 'gemini') {
    return '2d bounding box as [ymin, xmin, ymax, xmax]';
  }
  return '2d bounding box as [xmin, ymin, xmax, ymax]';
}
