import type { TModelFamily } from '@midscene/shared/env';
import { isOpenRouter } from '../model-adapter/is-openrouter';
import { buildOpenRouterReasoningParams } from '../model-adapter/openrouter-reasoning';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../model-adapter/types';

const buildStepFunChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { baseURL, midsceneDefaults, userConfig } = input;
  const { reasoningEnabled = false, reasoningEffort } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};

  if (userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
  }
  // https://platform.stepfun.ai/docs/en/api-reference/chat/chat-completion-create
  if (
    userConfig.responseFormat !== 'none' &&
    input.expectedJsonObjectResponse
  ) {
    commonOverrideConfig.response_format = { type: 'json_object' };
  }

  const modelSpecificConfig: Record<string, unknown> = {};
  if (isOpenRouter(baseURL)) {
    Object.assign(
      modelSpecificConfig,
      buildOpenRouterReasoningParams(userConfig, {
        type: 'effort',
        disabledEffort: 'low',
        defaultEnabledEffort: 'medium',
      }),
    );
  } else {
    // Step reasoning models cannot disable thinking; use the lowest effort.
    if (reasoningEnabled !== 'default') {
      modelSpecificConfig.reasoning_effort =
        reasoningEnabled === true ? (reasoningEffort ?? 'medium') : 'low';
    }
  }

  return {
    config: {
      ...midsceneDefaults,
      ...commonOverrideConfig,
      ...modelSpecificConfig,
    },
  };
};

export const stepFunAdapters = {
  step: {
    supportedProtocols: ['openai-chat'],
    chatCompletion: {
      buildChatCompletionParams: buildStepFunChatCompletionParams,
      messageExtraction: {
        kind: 'default',
        reasoningContentKeys: ['reasoning', 'reasoning_content'],
      },
    },
    locate: {
      element: {
        resultFormat: {
          resultKey: 'point_2d',
          resultKeyAliases: ['point'],
          coordinates: {
            shape: 'point',
            order: 'xy',
            normalizedBy: 1000,
          },
        },
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'step'>;
