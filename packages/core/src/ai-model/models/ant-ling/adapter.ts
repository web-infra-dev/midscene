import type { TModelFamily } from '@midscene/shared/env';
import { isOpenRouter } from '../../model-adapter/is-openrouter';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../../model-adapter/types';

const buildAntLingChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { baseURL, midsceneDefaults, userConfig } = input;
  const { reasoningEnabled = false, reasoningBudget } = userConfig;
  const reasoningConfig: Record<string, unknown> = {};

  if (isOpenRouter(baseURL)) {
    // https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
    if (reasoningEnabled !== 'default') {
      const reasoning: Record<string, unknown> = { enabled: reasoningEnabled };
      if (reasoningEnabled === true && reasoningBudget !== undefined) {
        reasoning.max_tokens = reasoningBudget;
      }
      reasoningConfig.reasoning = reasoning;
    }
  } else {
    if (reasoningEnabled !== 'default') {
      reasoningConfig.thinking = {
        type: reasoningEnabled ? 'enabled' : 'disabled',
      };
    }
  }

  return {
    config: {
      ...midsceneDefaults,
      ...(userConfig.temperature !== undefined
        ? { temperature: userConfig.temperature }
        : {}),
      // https://developer.ant-ling.com/en/docs/tutorials/structured-outputs/
      ...(userConfig.responseFormat !== 'none' &&
      input.expectedJsonObjectResponse
        ? { response_format: { type: 'json_object' } }
        : {}),
      ...reasoningConfig,
    },
  };
};

export const antLingAdapters = {
  'ant-ling': {
    supportedProtocols: ['openai-chat'],
    chatCompletion: {
      buildChatCompletionParams: buildAntLingChatCompletionParams,
    },
    locate: {
      element: {
        resultFormat: {
          resultKey: 'point',
          coordinates: {
            shape: 'point',
            order: 'xy',
            normalizedBy: 1000,
          },
        },
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'ant-ling'>;
