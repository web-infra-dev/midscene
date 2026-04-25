import type { AIUsageInfo } from '@/types';
import type { TIntent } from '@midscene/shared/env';

export function withSemanticUsageIntent(
  usage: AIUsageInfo | undefined,
  semanticIntent: TIntent,
): AIUsageInfo | undefined {
  if (!usage) {
    return undefined;
  }

  if (usage.semantic_intent) {
    console.warn(
      `semantic_intent is already set to "${usage.semantic_intent}", skipping overwrite to "${semanticIntent}"`,
    );
    return usage;
  }

  return {
    ...usage,
    semantic_intent: semanticIntent,
  };
}
