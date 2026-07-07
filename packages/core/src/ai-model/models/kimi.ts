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
import { isLocateIntent } from './utils/intent';

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
      useReasoningAsContentFallback: true,
    },
    locate: {
      resultAdapter: {
        coordinates: kimiNormalizedPointCoordinatesMeta,
        parseRawLocateValue: parseKimiRawLocateValue,
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'kimi'>;
