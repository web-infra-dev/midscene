import type { TModelFamily } from '@midscene/shared/env';
import { isOpenRouter } from '../model-adapter/is-openrouter';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../model-adapter/types';

const buildTencentHyChatCompletionParams = ({
  baseURL,
  midsceneDefaults,
  userConfig,
}: ChatCompletionCallContext): ChatCompletionParamsResult => {
  const { reasoningEnabled = false, reasoningEffort } = userConfig;
  const reasoningConfig: Record<string, unknown> = {};

  if (isOpenRouter(baseURL)) {
    // https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
    const reasoning: Record<string, unknown> = {};
    if (reasoningEnabled !== 'default') {
      reasoning.enabled = reasoningEnabled;
    }
    if (reasoningEnabled === true) {
      if (reasoningEffort !== undefined) {
        reasoning.effort = reasoningEffort;
      }
    }
    if (Object.keys(reasoning).length > 0) {
      reasoningConfig.reasoning = reasoning;
    }
  } else {
    if (reasoningEnabled !== 'default') {
      // https://cloud.tencent.com/document/product/1823/131208
      reasoningConfig.thinking = {
        type: reasoningEnabled ? 'enabled' : 'disabled',
      };
    }
    if (reasoningEnabled === true) {
      if (reasoningEffort !== undefined) {
        reasoningConfig.reasoning_effort = reasoningEffort;
      }
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
