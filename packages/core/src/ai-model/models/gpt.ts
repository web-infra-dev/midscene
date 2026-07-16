import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ImageDetail,
  ModelAdapterDefinition,
} from '../model-adapter/types';
import { isLocateIntent } from './utils/intent';

const originalImageDetailForDefaultIntent = (
  input: ChatCompletionCallContext,
): ImageDetail | undefined =>
  isLocateIntent(input.intent) || input.requiresOriginalImageDetail
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

  // OpenAI Chat Completions JSON mode:
  // https://platform.openai.com/docs/guides/structured-outputs?api-mode=chat#json-mode
  if (
    input.userConfig.responseFormat !== 'none' &&
    input.expectedJsonObjectResponse
  ) {
    commonOverrideConfig.response_format = { type: 'json_object' };
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
