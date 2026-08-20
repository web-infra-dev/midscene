import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../../model-adapter/types';
import {
  type LocateResultValue,
  createLocateResultValue,
  parseCoordinateList,
} from '../../shared/model-locate-result';
import { createDoubaoPlanningProtocol } from './planning-protocol';

const doubaoPointCoordinates = {
  shape: 'point',
  order: 'xy',
  normalizedBy: 1000,
} as const;

const parseDoubaoRawLocateValue = (input: unknown): LocateResultValue => {
  const point = parseCoordinateList(input, 'point');
  if (point.length !== 2) {
    throw new Error(`invalid point data: ${JSON.stringify(input)} `);
  }
  return createLocateResultValue(doubaoPointCoordinates, point);
};

const buildDoubaoChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const { reasoningEnabled, reasoningEffort } = userConfig;
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

  if (reasoningEnabled !== 'default') {
    modelSpecificConfig.thinking = {
      type: (reasoningEnabled ?? false) ? 'enabled' : 'disabled',
    };
    if (reasoningEffort) {
      modelSpecificConfig.reasoning_effort = reasoningEffort;
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
    unsupportedUserConfig: ['reasoningBudget'],
    buildChatCompletionParams: buildDoubaoChatCompletionParams,
    useReasoningAsContentFallback: true,
  },
  planning: {
    protocol: createDoubaoPlanningProtocol,
    supportsActionDeepLocate: false,
  },
  locate: {
    resultAdapter: {
      coordinates: doubaoPointCoordinates,
      parseRawLocateValue: parseDoubaoRawLocateValue,
    },
  },
};

export const doubaoAdapters = {
  'doubao-vision': doubaoAdapter,
  'doubao-seed': doubaoAdapter,
} satisfies Pick<
  Record<TModelFamily, ModelAdapterDefinition>,
  'doubao-vision' | 'doubao-seed'
>;
