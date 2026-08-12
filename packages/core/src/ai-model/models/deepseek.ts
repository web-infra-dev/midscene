import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../model-adapter/types';

const buildDeepseekChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const { reasoningEnabled } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};

  // DeepSeek disallows custom temperature when thinking is enabled.
  // https://api-docs.deepseek.com/zh-cn/guides/structured-output
  if (!reasoningEnabled && userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
  }

  if (
    userConfig.responseFormat !== 'none' &&
    input.expectedJsonObjectResponse
  ) {
    commonOverrideConfig.response_format = { type: 'json_object' };
  }

  const modelSpecificConfig: Record<string, unknown> = {
    thinking: {
      type: (reasoningEnabled ?? false) ? 'enabled' : 'disabled',
    },
  };

  return {
    config: {
      ...midsceneDefaults,
      ...commonOverrideConfig,
      ...modelSpecificConfig,
    },
  };
};

export const deepseekAdapters = {
  deepseek: {
    chatCompletion: {
      unsupportedUserConfig: ['reasoningEffort', 'reasoningBudget'],
      buildChatCompletionParams: buildDeepseekChatCompletionParams,
      useReasoningAsContentFallback: true,
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'deepseek'>;
