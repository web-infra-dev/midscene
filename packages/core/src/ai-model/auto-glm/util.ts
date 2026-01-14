import type { TVlModeTypes } from '@midscene/shared/env';

/**
 * Auto-GLM coordinate system range: [0, AUTO_GLM_COORDINATE_MAX]
 */
export const AUTO_GLM_COORDINATE_MAX = 1000;

/**
 * Check if the vlMode is auto-glm or auto-glm-multilingual
 * @param vlMode The VL mode to check
 * @returns true if vlMode is auto-glm or auto-glm-multilingual
 */
export function isAutoGLM(vlMode: TVlModeTypes | undefined): boolean {
  return vlMode === 'auto-glm' || vlMode === 'auto-glm-multilingual';
}

/**
 * Convert auto-glm coordinate [0,999] to bbox
 * Auto-glm uses [0,999] coordinate system, maps to image size, and creates a 10x10 bbox around the point
 */
export function autoGLMCoordinateToBbox(
  x: number,
  y: number,
  width: number,
  height: number,
): [number, number, number, number] {
  const bboxSize = 10;

  // Map from [0,AUTO_GLM_COORDINATE_MAX] to pixel coordinates
  const pixelX = Math.round((x * width) / AUTO_GLM_COORDINATE_MAX);
  const pixelY = Math.round((y * height) / AUTO_GLM_COORDINATE_MAX);

  // Create bbox around the point
  const x1 = Math.round(Math.max(pixelX - bboxSize / 2, 0));
  const y1 = Math.round(Math.max(pixelY - bboxSize / 2, 0));
  const x2 = Math.round(Math.min(pixelX + bboxSize / 2, width));
  const y2 = Math.round(Math.min(pixelY + bboxSize / 2, height));

  return [x1, y1, x2, y2];
}
