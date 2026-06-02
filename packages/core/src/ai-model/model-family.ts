import type { TModelFamily } from '@midscene/shared/env';

/**
 * Check if the modelFamily is a Qwen3 variant.
 * @param modelFamily The model family to check
 * @returns true if modelFamily is any Qwen3 variant
 */
export function isQwen3(
  modelFamily: TModelFamily | undefined,
): modelFamily is 'qwen3' | 'qwen3.5' | 'qwen3.6' {
  return (
    modelFamily === 'qwen3' ||
    modelFamily === 'qwen3.5' ||
    modelFamily === 'qwen3.6'
  );
}
