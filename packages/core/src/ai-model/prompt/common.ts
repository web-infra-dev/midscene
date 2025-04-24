import type { vlLocateMode } from '@midscene/shared/env';
export function bboxDescription(vlMode: ReturnType<typeof vlLocateMode>) {
  if (vlMode === 'gemini') {
    return '2d bounding box as [ymin, xmin, ymax, xmax]';
  }
  return '2d bounding box as [xmin, ymin, xmax, ymax]';
}
