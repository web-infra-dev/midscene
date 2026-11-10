import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../model-adapter/types';

const buildTencentHyChatCompletionParams = ({
  midsceneDefaults,
  userConfig,
}: ChatCompletionCallContext): ChatCompletionParamsResult => {
  const { reasoningEnabled, reasoningEffort } = userConfig;
  const reasoningConfig: Record<string, unknown> = {};

  if (reasoningEnabled !== 'default') {
    const enabled = reasoningEnabled ?? false;
    // https://cloud.tencent.com/document/product/1823/131208
    reasoningConfig.thinking = {
      type: enabled ? 'enabled' : 'disabled',
    };

    if (enabled && reasoningEffort) {
      reasoningConfig.reasoning_effort = reasoningEffort;
    }
  }

  return {
    config: {
      ...midsceneDefaults,
      temperature: userConfig.temperature ?? midsceneDefaults.temperature,
      ...reasoningConfig,
    },
  };
};

export const tencentHyAdapters = {
  'tencent-hy': {
    chatCompletion: {
      unsupportedUserConfig: ['reasoningBudget'],
      buildChatCompletionParams: buildTencentHyChatCompletionParams,
    },
    locate: {
      element: {
        resultFormat: {
          resultKey: 'box_2d',
          coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
        },
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'tencent-hy'>;
