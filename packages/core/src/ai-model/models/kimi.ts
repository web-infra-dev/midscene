import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../model-adapter/types';
import { isLocateIntent } from './utils/intent';

const buildKimiChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const { reasoningEnabled } = userConfig;
  const effectiveReasoningEnabled = reasoningEnabled ?? false;
  const commonOverrideConfig: Record<string, unknown> = {};

  // kimi disallow custom temperature
  commonOverrideConfig.temperature = undefined;

  // Kimi Chat Completions response_format:
  // https://platform.kimi.com/docs/api/chat
  if (isLocateIntent(input.intent)) {
    commonOverrideConfig.response_format = { type: 'json_object' };
  }

  const modelSpecificConfig: Record<string, unknown> = {
    thinking: {
      type: effectiveReasoningEnabled ? 'enabled' : 'disabled',
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

export const kimiAdapters = {
  kimi: {
    chatCompletion: {
      unsupportedUserConfig: ['reasoningEffort', 'reasoningBudget'],
      buildChatCompletionParams: buildKimiChatCompletionParams,
    },
    locate: {
      resultAdapter: {
        coordinates: { shape: 'point', order: 'xy', normalizedBy: 1 },
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'kimi'>;
