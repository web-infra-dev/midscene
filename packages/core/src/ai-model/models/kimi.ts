import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../model-adapter/types';
import {
  type LocateResultValue,
  createLocateResultValue,
  parseCoordinateList,
} from '../shared/model-locate-result';

const kimiNormalizedPointCoordinatesMeta = {
  shape: 'point',
  order: 'xy',
  normalizedBy: 1,
} as const;
const kimiPixelPointCoordinatesMeta = {
  shape: 'point',
  order: 'xy',
} as const;

function parseKimiRawLocateValue(input: unknown): LocateResultValue {
  const point = parseCoordinateList(input, 'point');
  if (point.length < 2) {
    throw new Error(`invalid point data: ${JSON.stringify(input)} `);
  }
  const [x, y] = point;
  // Keep this compatible with OSWorld's Kimi adapter: values <= 1 are
  // normalized coordinates, otherwise they are treated as screenshot pixels.
  const coordinatesMeta =
    x <= 1 && y <= 1
      ? kimiNormalizedPointCoordinatesMeta
      : kimiPixelPointCoordinatesMeta;
  return createLocateResultValue(coordinatesMeta, [x, y]);
}

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
  if (
    userConfig.responseFormat !== 'none' &&
    input.expectedJsonObjectResponse
  ) {
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

const buildKimi3ChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const commonOverrideConfig: Record<string, unknown> = {};

  // Kimi disallows custom temperature.
  commonOverrideConfig.temperature = undefined;

  if (
    userConfig.responseFormat !== 'none' &&
    input.expectedJsonObjectResponse
  ) {
    commonOverrideConfig.response_format = { type: 'json_object' };
  }

  // Kimi K3 currently only supports reasoning_effort="max"; its docs say
  // additional effort levels will be available later.
  const reasoningEffort = userConfig.reasoningEffort;

  return {
    config: {
      ...midsceneDefaults,
      ...commonOverrideConfig,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    },
  };
};

export const kimiAdapters = {
  kimi: {
    chatCompletion: {
      unsupportedUserConfig: ['reasoningEffort', 'reasoningBudget'],
      buildChatCompletionParams: buildKimiChatCompletionParams,
      useReasoningAsContentFallback: true,
    },
    locate: {
      resultAdapter: {
        coordinates: kimiNormalizedPointCoordinatesMeta,
        parseRawLocateValue: parseKimiRawLocateValue,
      },
    },
  },
  kimi3: {
    chatCompletion: {
      unsupportedUserConfig: ['reasoningEnabled', 'reasoningBudget'],
      buildChatCompletionParams: buildKimi3ChatCompletionParams,
      useReasoningAsContentFallback: true,
      // Kimi K3 multi-turn and tool calls must replay the complete assistant
      // message, including reasoning_content and tool_calls.
      // https://platform.kimi.com/docs/guide/use-thinking-effort
      replayRawAssistantMessage: true,
    },
    locate: {
      resultAdapter: {
        coordinates: kimiNormalizedPointCoordinatesMeta,
        parseRawLocateValue: parseKimiRawLocateValue,
      },
    },
  },
} satisfies Pick<
  Record<TModelFamily, ModelAdapterDefinition>,
  'kimi' | 'kimi3'
>;
