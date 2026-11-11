import type { TModelFamily } from '@midscene/shared/env';
import { isOpenRouter } from '../model-adapter/is-openrouter';
import type {
  BuildResponsesParams,
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
  ReasoningInput,
  ResolveImageDetail,
} from '../model-adapter/types';
import { isLocateIntent } from './utils/intent';

const originalImageDetailForLocateIntent: ResolveImageDetail = (input) =>
  isLocateIntent(input.intent) || input.requiresOriginalImageDetail
    ? 'original'
    : (input.imageDetail ?? 'high');

// GPT-5 disables reasoning with none; GPT-6 keeps low, including variants
// that can disable reasoning, because Astra requires this fallback.
const resolveGptReasoningEffort = (
  { reasoningEnabled = false, reasoningEffort }: ReasoningInput,
  disabledEffort: 'none' | 'low',
): string | undefined => {
  if (reasoningEnabled === 'default') {
    return undefined;
  }
  return reasoningEnabled === true
    ? (reasoningEffort ?? 'medium')
    : disabledEffort;
};

const buildGpt5ResponsesParams: BuildResponsesParams = (input) => {
  const { baseURL, midsceneDefaults, userConfig, expectedJsonObjectResponse } =
    input;
  const commonOverrideConfig: Record<string, unknown> = {};

  if (userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
  }

  if (userConfig.responseFormat !== 'none' && expectedJsonObjectResponse) {
    commonOverrideConfig.text = { format: { type: 'json_object' } };
  }

  const reasoningConfig: Record<string, unknown> = {};
  const effectiveReasoningEffort = resolveGptReasoningEffort(
    userConfig,
    'none',
  );
  if (isOpenRouter(baseURL)) {
    if (effectiveReasoningEffort !== undefined) {
      reasoningConfig.reasoning = { effort: effectiveReasoningEffort };
    }
  } else {
    // Use current-turn reasoning only. Switching to all_turns requires
    // responses.replayRawAssistantOutput to preserve reasoning history.
    if (effectiveReasoningEffort !== undefined) {
      reasoningConfig.reasoning = {
        effort: effectiveReasoningEffort,
        context: 'current_turn',
      };
    }
  }

  return {
    config: {
      ...midsceneDefaults,
      ...commonOverrideConfig,
      ...reasoningConfig,
    },
  };
};

const buildGpt6ResponsesParams: BuildResponsesParams = (input) => {
  const { baseURL, midsceneDefaults, userConfig, expectedJsonObjectResponse } =
    input;
  const { responseFormat } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};
  // GPT-6 does not support temperature; omit it from the serialized request.
  commonOverrideConfig.temperature = undefined;
  if (responseFormat !== 'none' && expectedJsonObjectResponse) {
    commonOverrideConfig.text = { format: { type: 'json_object' } };
  }

  const reasoningConfig: Record<string, unknown> = {};
  const effectiveReasoningEffort = resolveGptReasoningEffort(userConfig, 'low');
  if (isOpenRouter(baseURL)) {
    if (effectiveReasoningEffort !== undefined) {
      reasoningConfig.reasoning = { effort: effectiveReasoningEffort };
    }
  } else {
    // Use current-turn reasoning only. Switching to all_turns requires
    // responses.replayRawAssistantOutput to preserve reasoning history.
    if (effectiveReasoningEffort !== undefined) {
      reasoningConfig.reasoning = {
        effort: effectiveReasoningEffort,
        context: 'current_turn',
      };
    }
  }

  return {
    config: {
      ...midsceneDefaults,
      ...commonOverrideConfig,
      ...reasoningConfig,
    },
  };
};

const buildGpt5ChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { baseURL, midsceneDefaults, userConfig } = input;
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

  const reasoningConfig: Record<string, unknown> = {};
  const effectiveReasoningEffort = resolveGptReasoningEffort(
    userConfig,
    'none',
  );
  if (isOpenRouter(baseURL)) {
    if (effectiveReasoningEffort !== undefined) {
      reasoningConfig.reasoning = { effort: effectiveReasoningEffort };
    }
  } else {
    reasoningConfig.reasoning_effort = effectiveReasoningEffort;
  }

  return {
    config: {
      ...midsceneDefaults,
      ...commonOverrideConfig,
      ...reasoningConfig,
    },
  };
};

const buildGpt6ChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { baseURL, midsceneDefaults, userConfig, expectedJsonObjectResponse } =
    input;
  const { responseFormat } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};
  // GPT-6 does not support temperature; omit it from the serialized request.
  commonOverrideConfig.temperature = undefined;
  if (responseFormat !== 'none' && expectedJsonObjectResponse) {
    commonOverrideConfig.response_format = { type: 'json_object' };
  }

  const reasoningConfig: Record<string, unknown> = {};
  const effectiveReasoningEffort = resolveGptReasoningEffort(userConfig, 'low');
  if (isOpenRouter(baseURL)) {
    if (effectiveReasoningEffort !== undefined) {
      reasoningConfig.reasoning = { effort: effectiveReasoningEffort };
    }
  } else {
    reasoningConfig.reasoning_effort = effectiveReasoningEffort;
  }

  return {
    config: {
      ...midsceneDefaults,
      ...commonOverrideConfig,
      ...reasoningConfig,
    },
  };
};

export const gptAdapters = {
  'gpt-5': {
    supportedProtocols: ['openai-chat', 'openai-responses'],
    resolveImageDetail: originalImageDetailForLocateIntent,
    responses: {
      replayRawAssistantOutput: false,
      buildResponsesParams: buildGpt5ResponsesParams,
    },
    buildCodexAppServerParams: (input) => ({
      config: {
        effort: resolveGptReasoningEffort(input.userConfig ?? {}, 'none'),
      },
    }),
    chatCompletion: {
      buildChatCompletionParams: buildGpt5ChatCompletionParams,
    },
    locate: {
      element: {
        resultFormat: {
          // GPT can return image width/height as bbox endpoints (issue #3351).
          // Accept image-edge coordinates without assuming all variants do so.
          coordinates: {
            shape: 'bbox',
            order: 'xy',
            boundsType: 'left-closed-right-open',
          },
        },
      },
    },
  },
  'gpt-6': {
    supportedProtocols: ['openai-chat', 'openai-responses'],
    resolveImageDetail: originalImageDetailForLocateIntent,
    responses: {
      replayRawAssistantOutput: false,
      buildResponsesParams: buildGpt6ResponsesParams,
    },
    buildCodexAppServerParams: (input) => ({
      config: {
        effort: resolveGptReasoningEffort(input.userConfig ?? {}, 'low'),
      },
    }),
    chatCompletion: {
      buildChatCompletionParams: buildGpt6ChatCompletionParams,
    },
    locate: {
      element: {
        resultFormat: {
          // GPT can return image width/height as bbox endpoints (issue #3351).
          // Accept image-edge coordinates without assuming all variants do so.
          coordinates: {
            shape: 'bbox',
            order: 'xy',
            boundsType: 'left-closed-right-open',
          },
        },
      },
    },
  },
} satisfies Pick<
  Record<TModelFamily, ModelAdapterDefinition>,
  'gpt-5' | 'gpt-6'
>;
