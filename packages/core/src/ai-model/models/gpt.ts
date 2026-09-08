import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  CodexAppServerCallInput,
  CodexAppServerParamsResult,
  ImageDetail,
  ModelAdapterDefinition,
  ReasoningInput,
} from '../model-adapter/types';
import { isLocateIntent } from './utils/intent';

const originalImageDetailForDefaultIntent = (
  input: Pick<
    CodexAppServerCallInput,
    'intent' | 'requiresOriginalImageDetail'
  >,
): ImageDetail | undefined =>
  isLocateIntent(input.intent) || input.requiresOriginalImageDetail
    ? 'original'
    : undefined;

const resolveGpt5ReasoningEffort = ({
  reasoningEnabled,
  reasoningEffort,
}: ReasoningInput): string | undefined => {
  if (reasoningEnabled === 'default') return undefined;
  return reasoningEnabled === true ? (reasoningEffort ?? 'medium') : 'none';
};

// Astra cannot disable reasoning; use its lowest effort when disabled.
const resolveGpt6ReasoningEffort = ({
  reasoningEnabled,
  reasoningEffort,
}: ReasoningInput): string | undefined => {
  if (reasoningEnabled === 'default') return undefined;
  return reasoningEnabled === true ? (reasoningEffort ?? 'medium') : 'low';
};

const buildGpt5CodexAppServerParams = (
  input: CodexAppServerCallInput,
): CodexAppServerParamsResult => ({
  config: { effort: resolveGpt5ReasoningEffort(input.userConfig ?? {}) },
  imageDetail: originalImageDetailForDefaultIntent(input),
});

const buildGpt6CodexAppServerParams = (
  input: CodexAppServerCallInput,
): CodexAppServerParamsResult => ({
  config: { effort: resolveGpt6ReasoningEffort(input.userConfig ?? {}) },
  imageDetail: originalImageDetailForDefaultIntent(input),
});

const buildGpt5ChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
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

  const effectiveReasoningEffort = resolveGpt5ReasoningEffort(userConfig);

  return {
    config: {
      ...midsceneDefaults,
      ...commonOverrideConfig,
      reasoning_effort: effectiveReasoningEffort,
    },
  };
};

const buildGpt6ChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig, expectedJsonObjectResponse } = input;
  const { responseFormat } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};
  // GPT-6 does not support temperature; omit it from the serialized request.
  commonOverrideConfig.temperature = undefined;
  if (responseFormat !== 'none' && expectedJsonObjectResponse) {
    commonOverrideConfig.response_format = { type: 'json_object' };
  }

  const effectiveReasoningEffort = resolveGpt6ReasoningEffort(userConfig);

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
    buildCodexAppServerParams: buildGpt5CodexAppServerParams,
    chatCompletion: {
      unsupportedUserConfig: ['reasoningBudget'],
      buildChatCompletionParams: buildGpt5ChatCompletionParams,
      resolveImageDetail: originalImageDetailForDefaultIntent,
    },
    locate: {
      element: {
        resultFormat: {
          coordinates: { shape: 'bbox', order: 'xy' },
        },
      },
    },
  },
  'gpt-6': {
    buildCodexAppServerParams: buildGpt6CodexAppServerParams,
    chatCompletion: {
      unsupportedUserConfig: ['temperature', 'reasoningBudget'],
      buildChatCompletionParams: buildGpt6ChatCompletionParams,
      resolveImageDetail: originalImageDetailForDefaultIntent,
    },
    locate: {
      element: {
        resultFormat: {
          coordinates: { shape: 'bbox', order: 'xy' },
        },
      },
    },
  },
} satisfies Pick<
  Record<TModelFamily, ModelAdapterDefinition>,
  'gpt-5' | 'gpt-6'
>;
