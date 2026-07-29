import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../model-adapter/types';

const stepCoordinatesMeta = {
  shape: 'bbox',
  order: 'xy',
  normalizedBy: 1000,
} as const;

const buildStepChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;

  return {
    config: {
      ...midsceneDefaults,
      ...(userConfig.temperature === undefined
        ? {}
        : { temperature: userConfig.temperature }),
    },
  };
};

/**
 * Step 3.7 Flash follows Midscene's standard VLM prompt and grounding flow.
 * Its OpenAI-compatible API returns reasoning in `reasoning` (and may return
 * `reasoning_content` when configured for a DeepSeek-style response).
 */
export const stepAdapters = {
  step: {
    chatCompletion: {
      unsupportedUserConfig: [
        'reasoningEnabled',
        'reasoningEffort',
        'reasoningBudget',
      ],
      buildChatCompletionParams: buildStepChatCompletionParams,
      messageExtraction: {
        kind: 'default',
        reasoningContentKeys: ['reasoning', 'reasoning_content'],
      },
      useReasoningAsContentFallback: true,
    },
    locate: {
      resultAdapter: {
        coordinates: stepCoordinatesMeta,
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'step'>;
