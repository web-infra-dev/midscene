import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../../model-adapter/types';

const buildMiniMaxChatCompletionParams = ({
  userConfig,
}: ChatCompletionCallContext): ChatCompletionParamsResult => ({
  config: {
    // Separate reasoning from the final answer on both M3 and M3.1 Flash.
    // https://platform.minimax.io/docs/api-reference/text-openai-api
    reasoning_split: true,
    // Only M3.1 Flash honors effort; M3 uses its default thinking behavior.
    reasoning_effort: userConfig.reasoningEffort ?? 'low',
  },
});

export const minimaxAdapters = {
  minimax: {
    supportedProtocols: ['openai-chat'],
    includeImageDimensions: true,
    chatCompletion: {
      unsupportedUserConfig: [
        'temperature',
        'responseFormat',
        'reasoningEnabled',
        'reasoningBudget',
      ],
      buildChatCompletionParams: buildMiniMaxChatCompletionParams,
    },
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
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'minimax'>;
