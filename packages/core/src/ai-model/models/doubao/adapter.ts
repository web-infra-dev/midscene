import type { TModelFamily } from '@midscene/shared/env';
import { isOpenRouter } from '../../model-adapter/is-openrouter';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../../model-adapter/types';
import {
  type LocateResultValue,
  createLocateResultValue,
} from '../../shared/model-locate-result';
import { doubaoSearchAreaProtocol } from './area-protocol';
import { doubaoElementProtocol } from './element-protocol';
import { createDoubaoInsightProtocol } from './insight-protocol';
import { createDoubaoPlanningProtocol } from './planning-protocol';

const doubaoPointCoordinates = {
  shape: 'point',
  order: 'xy',
  normalizedBy: 1000,
  rounding: 'round',
} as const;

const parseDoubaoRawLocateValue = (input: unknown): LocateResultValue => {
  if (typeof input !== 'string') {
    throw new Error(`invalid point data: ${JSON.stringify(input)} `);
  }

  const pointMatch =
    input.match(/<point>\s*(\d+)\s+(\d+)\s*<\/point>/i) ??
    input.match(/(\d+)\s+(\d+)/);
  if (!pointMatch) {
    throw new Error(`invalid point data: ${JSON.stringify(input)} `);
  }

  return createLocateResultValue(doubaoPointCoordinates, [
    Number(pointMatch[1]),
    Number(pointMatch[2]),
  ]);
};

const buildDoubaoChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { baseURL, midsceneDefaults, userConfig } = input;
  const {
    reasoningEnabled = false,
    reasoningEffort,
    reasoningBudget,
  } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};

  if (userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
  }

  // Doubao Chat Completions JSON mode:
  // https://docs.volcengine.com/docs/82379/1568221?lang=zh
  if (
    userConfig.responseFormat !== 'none' &&
    input.expectedJsonObjectResponse
  ) {
    commonOverrideConfig.response_format = { type: 'json_object' };
  }

  const modelSpecificConfig: Record<string, unknown> = {};

  if (isOpenRouter(baseURL)) {
    // This family targets Seed 2.1 Turbo on OpenRouter, which only declares
    // support for the reasoning switch, not effort. Seed 2.0 Lite
    // supports effort, but this family-level mapping does not forward it.
    // https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
    if (reasoningEnabled !== 'default') {
      const reasoning: Record<string, unknown> = { enabled: reasoningEnabled };
      if (reasoningEnabled === true && reasoningBudget !== undefined) {
        reasoning.max_tokens = reasoningBudget;
      }
      modelSpecificConfig.reasoning = reasoning;
    }
  } else {
    if (reasoningEnabled !== 'default') {
      modelSpecificConfig.thinking = {
        type: reasoningEnabled ? 'enabled' : 'disabled',
      };
    }
    if (reasoningEnabled === true) {
      if (reasoningEffort !== undefined) {
        modelSpecificConfig.reasoning_effort = reasoningEffort;
      }
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

const doubaoAdapter: ModelAdapterDefinition = {
  chatCompletion: {
    buildChatCompletionParams: buildDoubaoChatCompletionParams,
    useReasoningAsContentFallback: true,
  },
  insight: {
    protocol: createDoubaoInsightProtocol,
  },
  locate: {
    element: {
      protocol: doubaoElementProtocol,
      resultFormat: {
        coordinates: doubaoPointCoordinates,
        parseRawLocateValue: parseDoubaoRawLocateValue,
      },
    },
    searchArea: {
      protocol: doubaoSearchAreaProtocol,
    },
  },
  planning: {
    protocol: createDoubaoPlanningProtocol,
  },
};

export const doubaoAdapters = {
  'doubao-vision': doubaoAdapter,
  'doubao-seed': doubaoAdapter,
} satisfies Pick<
  Record<TModelFamily, ModelAdapterDefinition>,
  'doubao-vision' | 'doubao-seed'
>;
