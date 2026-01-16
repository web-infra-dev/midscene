import type { TVlModeTypes } from '@midscene/shared/env';

/**
 * Check if the vlMode is auto-glm or auto-glm-multilingual
 * @param vlMode The VL mode to check
 * @returns true if vlMode is auto-glm or auto-glm-multilingual
 */
export function isAutoGLM(vlMode: TVlModeTypes | undefined): boolean {
  return vlMode === 'auto-glm' || vlMode === 'auto-glm-multilingual';
}
