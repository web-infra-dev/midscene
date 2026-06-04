import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ImageDetail,
  ModelAdapterDefinition,
} from './types';

const originalImageDetailForDefaultIntent = (
  input: ChatCompletionCallContext,
): ImageDetail | undefined =>
  input.intent === 'default' || input.requiresOriginalImageDetail
    ? 'original'
    : undefined;

const buildGpt5ChatCompletionParams = (): ChatCompletionParamsResult => {
  return {
    config: {
      // GPT-5 Chat Completions does not support temperature control.
      temperature: undefined,
    },
  };
};

export const gptAdapters = {
  'gpt-5': {
    chatCompletion: {
      unsupportedUserConfig: [
        'temperature',
        'reasoningEnabled',
        'reasoningEffort',
        'reasoningBudget',
      ],
      buildChatCompletionParams: buildGpt5ChatCompletionParams,
      resolveImageDetail: originalImageDetailForDefaultIntent,
    },
    locate: {
      resultAdapter: {
        coordinates: { shape: 'bbox', order: 'xy' },
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'gpt-5'>;
