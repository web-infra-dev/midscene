import type { TModelFamily } from '@midscene/shared/env';
import { isOpenRouter } from '../model-adapter/is-openrouter';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../model-adapter/types';

const buildMimoChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { baseURL, midsceneDefaults, userConfig } = input;
  const { reasoningEnabled = false } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};

  // https://platform.xiaomimimo.com/docs/zh-CN/api/chat/openai-api
  // Observed with thinking disabled: Mimo needs json_object to return JSON.
  if (
    userConfig.responseFormat !== 'none' &&
    input.expectedJsonObjectResponse
  ) {
    commonOverrideConfig.response_format = { type: 'json_object' };
  }

  if (userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
  }

  const modelSpecificConfig: Record<string, unknown> = {};
  if (isOpenRouter(baseURL)) {
    // https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
    if (reasoningEnabled !== 'default') {
      modelSpecificConfig.reasoning = { enabled: reasoningEnabled };
    }
  } else {
    if (reasoningEnabled !== 'default') {
      modelSpecificConfig.thinking = {
        type: reasoningEnabled ? 'enabled' : 'disabled',
      };
    }
  }

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
      buildChatCompletionParams: buildMimoChatCompletionParams,
      useReasoningAsContentFallback: true,
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'xiaomi-mimo'>;
