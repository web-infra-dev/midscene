import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../../model-adapter/types';

const buildAntLingChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const { reasoningEnabled } = userConfig;

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
      ...(reasoningEnabled !== 'default'
        ? {
            thinking: {
              type: (reasoningEnabled ?? false) ? 'enabled' : 'disabled',
            },
          }
        : {}),
    },
  };
};

export const antLingAdapters = {
  'ant-ling': {
    supportedProtocols: ['openai-chat'],
    chatCompletion: {
      unsupportedUserConfig: ['reasoningEffort', 'reasoningBudget'],
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
