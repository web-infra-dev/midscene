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
  const { reasoningEnabled, reasoningEffort } = userConfig;
  const enabled = reasoningEnabled ?? false;
  const reasoningConfig: Record<string, unknown> = {};

  if (isOpenRouter(baseURL)) {
    // https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
    const reasoning: Record<string, unknown> = {};
    if (enabled !== 'default') {
      reasoning.enabled = enabled;
    }
    if (enabled !== false) {
      if (reasoningEffort !== undefined) {
        reasoning.effort = reasoningEffort;
      }
    }
    if (Object.keys(reasoning).length > 0) {
      reasoningConfig.reasoning = reasoning;
    }
  } else {
    if (enabled !== 'default') {
      // https://cloud.tencent.com/document/product/1823/131208
      reasoningConfig.thinking = {
        type: enabled ? 'enabled' : 'disabled',
      };
    }
    if (enabled !== false) {
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
