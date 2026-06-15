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

const buildGpt5ChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const { reasoningEnabled, reasoningEffort } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};

  if (userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
  }

  const effectiveReasoningEffort =
    reasoningEnabled === true ? (reasoningEffort ?? 'medium') : 'none';

  return {
    config: {
      ...midsceneDefaults,
      ...commonOverrideConfig,
      reasoning_effort: effectiveReasoningEffort,
    },
  };
};

export const gptAdapters = {
  'gpt-5': {
    chatCompletion: {
      unsupportedUserConfig: ['reasoningBudget'],
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
