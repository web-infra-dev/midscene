import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from './types';

const buildGeminiChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const { reasoningEffort } = userConfig;
  const config: Record<string, unknown> = {
    temperature: userConfig.temperature ?? midsceneDefaults.temperature,
    // Gemini 3.x cannot fully disable native thinking, so use the lowest
    // supported effort unless the user explicitly requests another level.
    reasoning_effort: reasoningEffort || 'minimal',
  };
  return { config };
};

export const geminiAdapters = {
  gemini: {
    chatCompletion: {
      unsupportedUserConfig: ['reasoningEnabled', 'reasoningBudget'],
      buildChatCompletionParams: buildGeminiChatCompletionParams,
    },
    locate: {
      resultAdapter: {
        coordinates: { shape: 'bbox', order: 'yx', normalizedBy: 1000 },
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'gemini'>;
