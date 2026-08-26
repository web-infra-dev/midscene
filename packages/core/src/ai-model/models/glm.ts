import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../model-adapter/types';

const ALWAYS_THINKING_GLM_MODEL_PATTERN = /^glm-5\.3-flash\b/;

const buildGlmChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig, modelName } = input;
  const { reasoningEnabled } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};

  // GLM models that cannot turn thinking off. GLM-5.3-Flash rejects
  // `thinking.type: 'disabled'` with error 1210 ("该模型始终思考，不支持关闭
  // 思考"), so for these models the adapter keeps thinking enabled and steers
  // its depth with `reasoning_effort` instead. Field-tested against the
  // Zhipu Coding Plan endpoint in KSL-49 (2026-08-26).
  const alwaysThinking = ALWAYS_THINKING_GLM_MODEL_PATTERN.test(
    modelName ?? '',
  );

  if (alwaysThinking) {
    // Officially recommended sampling parameters for GLM-5.3-Flash
    // (https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash), and the
    // values its vision integration was field-tested with.
    commonOverrideConfig.temperature = userConfig.temperature ?? 1;
    commonOverrideConfig.top_p = 0.95;
  } else if (userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
  }

  // Zhipu structured output JSON mode:
  // https://docs.bigmodel.cn/cn/guide/capabilities/struct-output
  if (
    userConfig.responseFormat !== 'none' &&
    input.expectedJsonObjectResponse
  ) {
    commonOverrideConfig.response_format = { type: 'json_object' };
  }

  const modelSpecificConfig: Record<string, unknown> = {};

  if (alwaysThinking) {
    if (reasoningEnabled !== 'default') {
      modelSpecificConfig.thinking = {
        type: 'enabled',
        clear_thinking: false,
      };
      // Thinking cannot be disabled, so a "no reasoning" intent maps to the
      // cheapest effort level. `low` was sufficient for the KSL-49 vision
      // probes; users can raise it via the reasoning-effort config.
      modelSpecificConfig.reasoning_effort =
        userConfig.reasoningEffort ?? 'low';
    } else if (userConfig.reasoningEffort) {
      modelSpecificConfig.reasoning_effort = userConfig.reasoningEffort;
    }
  } else if (reasoningEnabled !== 'default') {
    modelSpecificConfig.thinking = {
      type: (reasoningEnabled ?? false) ? 'enabled' : 'disabled',
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

export const glmAdapters = {
  'glm-v': {
    chatCompletion: {
      // reasoningEffort is honored only by the always-thinking GLM models
      // (see above); reasoningBudget is not supported by the family at all.
      unsupportedUserConfig: ['reasoningEffort', 'reasoningBudget'],
      buildChatCompletionParams: buildGlmChatCompletionParams,
      useReasoningAsContentFallback: true,
    },
    locate: {
      element: {
        resultFormat: {
          coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
        },
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'glm-v'>;
