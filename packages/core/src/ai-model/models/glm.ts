import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
  ModelCallContext,
} from './types';

const buildGlmChatCompletionParams = ({
  reasoningEnabled,
}: ModelCallContext): ChatCompletionParamsResult => {
  const debugMessages: string[] = [];
  const config: Record<string, unknown> = {};

  if (reasoningEnabled !== undefined) {
    config.thinking = {
      type: reasoningEnabled ? 'enabled' : 'disabled',
    };
    debugMessages.push(
      `thinking.type=${reasoningEnabled ? 'enabled' : 'disabled'}`,
    );
  }

  return { config, debugMessages };
};

export const glmAdapters = {
  'glm-v': {
    chatCompletion: {
      buildChatCompletionParams: buildGlmChatCompletionParams,
    },
    locate: {
      resultAdapter: {
        format: 'bbox-normalized-0-1000-xyxy',
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'glm-v'>;
