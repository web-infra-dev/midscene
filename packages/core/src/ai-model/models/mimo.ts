import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from './types';

const buildMimoChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { intent, midsceneDefaults, userConfig } = input;
  const { reasoningEnabled } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};

  // https://platform.xiaomimimo.com/docs/zh-CN/api/chat/openai-api
  // Observed with thinking disabled: Mimo needs json_object to return JSON.
  commonOverrideConfig.response_format = {
    type: intent === 'default' ? 'json_object' : 'text',
  };

  if (userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
  }

  const modelSpecificConfig: Record<string, unknown> = {
    thinking: {
      type: (reasoningEnabled ?? false) ? 'enabled' : 'disabled',
    },
  };

  return {
    config: {
      ...midsceneDefaults,
      ...commonOverrideConfig,
      ...modelSpecificConfig,
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
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'xiaomi-mimo'>;
