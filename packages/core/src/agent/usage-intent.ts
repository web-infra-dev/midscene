import type { AIUsageInfo } from '@/types';
import type { TIntent } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';

const warnUsageIntent = getDebug('agent:usage-intent', { console: true });

export function withUsageIntent(
  usage: AIUsageInfo | undefined,
  intent: TIntent,
): AIUsageInfo | undefined {
  if (!usage) {
    return undefined;
  }

  if (usage.intent) {
    warnUsageIntent(
      `intent is already set to "${usage.intent}", skipping overwrite to "${intent}"`,
    );
    return usage;
  }

  return {
    ...usage,
    intent,
  };
}
