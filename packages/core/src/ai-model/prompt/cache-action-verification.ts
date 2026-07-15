import type { CacheActionVerificationDataDemand } from '@/types';

export interface CacheActionVerificationDemandInput {
  actionName: string;
  targetDescription: string;
  mode: 'focused-comparison' | 'full-frame';
}

export function buildCacheActionVerificationDemand({
  actionName,
  targetDescription,
  mode,
}: CacheActionVerificationDemandInput): CacheActionVerificationDataDemand {
  const imageContext =
    mode === 'focused-comparison'
      ? 'The single image shows the same target area before (left) and after (right).'
      : 'Compare the two full screenshots in chronological order (before, then after).';

  return {
    status: `Exactly "passed", "failed", or "uncertain". ${imageContext} Action: "${actionName}". Target: "${targetDescription}". Judge the action's expected effect, not whether the target stays visible. For delete/remove controls, the item disappearing is success. For checkboxes, toggled checked state is success. For filters, selected styling or filtered content is success. For an input, require activation evidence such as focus styling, caret, or keyboard. Use failed when the expected effect is clearly absent or contradicted; use uncertain when visual evidence is insufficient. Keep all analysis concise.`,
    reason: 'Visible evidence only, at most 8 words.',
  };
}
