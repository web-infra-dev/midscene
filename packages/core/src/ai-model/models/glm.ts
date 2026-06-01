import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from './types';

const buildGlmChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const { reasoningEnabled } = userConfig;
  const effectiveReasoningEnabled = reasoningEnabled ?? false;
  const config: Record<string, unknown> = {
    temperature: userConfig.temperature ?? midsceneDefaults.temperature,
    thinking: {
      type: effectiveReasoningEnabled ? 'enabled' : 'disabled',
    },
  };

  return { config };
};

export const glmAdapters = {
  'glm-v': {
    chatCompletion: {
      unsupportedUserConfig: ['reasoningEffort', 'reasoningBudget'],
      buildChatCompletionParams: buildGlmChatCompletionParams,
    },
    locate: {
      resultAdapter: {
        coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'glm-v'>;
