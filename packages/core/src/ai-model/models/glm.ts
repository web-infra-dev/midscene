import type { TModelFamily } from '@midscene/shared/env';
import { isOpenRouter } from '../model-adapter/is-openrouter';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../model-adapter/types';

const buildGlmChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { baseURL, midsceneDefaults, userConfig } = input;
  const { reasoningEnabled = false } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};

  if (userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
  }

  // Zhipu structured output JSON mode:
  // https://docs.bigmodel.cn/cn/guide/capabilities/struct-output
  if (
    userConfig.responseFormat !== 'none' &&
    input.expectedJsonObjectResponse
  ) {
    commonOverrideConfig.response_format = { type: 'json_object' };
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

export const glmAdapters = {
  'glm-v': {
    chatCompletion: {
      buildChatCompletionParams: buildGlmChatCompletionParams,
      useReasoningAsContentFallback: true,
    },
    locate: {
      element: {
        resultFormat: {
          coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
        },
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'glm-v'>;
