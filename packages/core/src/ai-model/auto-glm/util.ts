import type { TModelFamily } from '@midscene/shared/env';

/**
 * Check if the modelFamily is auto-glm or auto-glm-multilingual
 * @param modelFamily The model family to check
 * @returns true if modelFamily is auto-glm or auto-glm-multilingual
 */
export function isAutoGLM(modelFamily: TModelFamily | undefined): boolean {
  return modelFamily === 'auto-glm' || modelFamily === 'auto-glm-multilingual';
}

/**
 * Check if the modelFamily is a UI-TARS variant
 * @param modelFamily The model family to check
 * @returns true if modelFamily is any UI-TARS variant
 */
export function isUITars(modelFamily: TModelFamily | undefined): boolean {
  return (
    modelFamily === 'vlm-ui-tars' ||
    modelFamily === 'vlm-ui-tars-doubao' ||
    modelFamily === 'vlm-ui-tars-doubao-1.5'
  );
}
