import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from './types';

const buildMimoChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const effectiveReasoningEnabled = userConfig.reasoningEnabled ?? true;

  return {
    config: {
      temperature: userConfig.temperature ?? midsceneDefaults.temperature,
      thinking: {
        type: effectiveReasoningEnabled ? 'enabled' : 'disabled',
      },
    },
  };
};

export const mimoAdapters = {
  'xiaomi-mimo': {
    chatCompletion: {
      unsupportedUserConfig: ['reasoningEffort', 'reasoningBudget'],
      buildChatCompletionParams: buildMimoChatCompletionParams,
    },
  },
} satisfies Pick<
  Record<TModelFamily, ModelAdapterDefinition>,
  'xiaomi-mimo'
>;
