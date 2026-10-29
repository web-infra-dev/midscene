import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../../model-adapter/types';

const buildMiniMaxChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const { reasoningEnabled } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};
  // MiniMax ignores temperature and always uses 1.
  // https://platform.minimax.io/docs/api-reference/text-openai-api
  commonOverrideConfig.temperature = undefined;

  const modelSpecificConfig: Record<string, unknown> = {
    reasoning_split: true,
  };
  if (reasoningEnabled !== 'default') {
    modelSpecificConfig.thinking = {
      type: (reasoningEnabled ?? false) ? 'adaptive' : 'disabled',
    };
  }

  return {
    config: {
      ...midsceneDefaults,
      ...commonOverrideConfig,
      ...modelSpecificConfig,
    },
  };
};

const buildMiniMax31ChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const commonOverrideConfig: Record<string, unknown> = {};
  // M3.1 Flash also ignores temperature and always uses 1.
  commonOverrideConfig.temperature = undefined;

  return {
    config: {
      ...midsceneDefaults,
      ...commonOverrideConfig,
      reasoning_split: true,
      reasoning_effort: userConfig.reasoningEffort ?? 'low',
    },
  };
};

const sharedMiniMaxConfig = {
  supportedProtocols: ['openai-chat'],
  includeImageDimensions: true,
  locate: {
    element: {
      resultFormat: {
        coordinates: { shape: 'point', order: 'xy' },
      },
    },
    searchArea: {
      resultFormat: {
        coordinates: { shape: 'bbox', order: 'xy' },
      },
    },
  },
} satisfies ModelAdapterDefinition;

export const minimaxAdapters = {
  minimax: {
    ...sharedMiniMaxConfig,
    chatCompletion: {
      unsupportedUserConfig: [
        'temperature',
        'responseFormat',
        'reasoningEffort',
        'reasoningBudget',
      ],
      buildChatCompletionParams: buildMiniMaxChatCompletionParams,
    },
  },
  'minimax-3.1': {
    ...sharedMiniMaxConfig,
    chatCompletion: {
      unsupportedUserConfig: [
        'temperature',
        'responseFormat',
        'reasoningEnabled',
        'reasoningBudget',
      ],
      buildChatCompletionParams: buildMiniMax31ChatCompletionParams,
    },
  },
} satisfies Pick<
  Record<TModelFamily, ModelAdapterDefinition>,
  'minimax' | 'minimax-3.1'
>;
