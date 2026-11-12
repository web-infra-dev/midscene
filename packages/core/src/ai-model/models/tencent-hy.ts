import type { TModelFamily } from '@midscene/shared/env';
import { isOpenRouter } from '../model-adapter/is-openrouter';
import { buildOpenRouterReasoningParams } from '../model-adapter/openrouter-reasoning';
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
    Object.assign(reasoningConfig, buildOpenRouterReasoningParams(userConfig));
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
