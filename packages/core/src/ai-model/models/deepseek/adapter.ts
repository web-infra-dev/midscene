import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../../model-adapter/types';
import {
  type LocateResultValue,
  createLocateResultValue,
} from '../../shared/model-locate-result';
import {
  deepSeekElementLocateProtocol,
  deepSeekSearchAreaProtocol,
} from './locate-protocol';

const deepSeekPointCoordinates = {
  shape: 'point',
  order: 'xy',
  normalizedBy: 1000,
} as const;

const deepSeekBboxCoordinates = {
  shape: 'bbox',
  order: 'xy',
  normalizedBy: 1000,
} as const;

function parseDeepSeekCoordinateValues(
  input: unknown,
  expectedLength: number,
  label: string,
): number[] {
  const coordinateTexts = String(input).match(/[+-]?\d+/g);
  const coordinates = coordinateTexts?.map(Number);
  if (
    coordinates?.length !== expectedLength ||
    !coordinates.every((coordinate) => coordinate >= 0)
  ) {
    throw new Error(
      `DeepSeek ${label} locate result must contain exactly ${expectedLength} positive integers, got ${coordinateTexts?.length ?? 0}`,
    );
  }

  return coordinates;
}

function parseDeepSeekPointLocateValue(input: unknown): LocateResultValue {
  return createLocateResultValue(
    deepSeekPointCoordinates,
    parseDeepSeekCoordinateValues(input, 2, 'point'),
  );
}

function parseDeepSeekBboxLocateValue(input: unknown): LocateResultValue {
  return createLocateResultValue(
    deepSeekBboxCoordinates,
    parseDeepSeekCoordinateValues(input, 4, 'bbox'),
  );
}

const buildDeepSeekChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const { reasoningEnabled, reasoningEffort } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};
  const isThinkingMode =
    reasoningEnabled === true || reasoningEnabled === 'default';

  // DeepSeek thinking mode does not support temperature. For compatibility,
  // DeepSeek ignores this parameter instead of rejecting the request, so omit
  // the ineffective setting. `default` also uses thinking mode because
  // DeepSeek enables it by default.
  // https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
  if (isThinkingMode) {
    commonOverrideConfig.temperature = undefined;
  } else if (userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
  }

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

export const deepSeekAdapters = {
  deepseek: {
    chatCompletion: {
      unsupportedUserConfig: ['reasoningBudget'],
      buildChatCompletionParams: buildDeepSeekChatCompletionParams,
      useReasoningAsContentFallback: true,
      // DeepSeek only requires reasoning_content to be replayed after tool
      // calls. Midscene planning does not use tool calls, so it is unnecessary.
      replayRawAssistantMessage: false,
    },
    locate: {
      element: {
        protocol: deepSeekElementLocateProtocol,
        resultFormat: {
          coordinates: deepSeekPointCoordinates,
          parseRawLocateValue: parseDeepSeekPointLocateValue,
        },
      },
      searchArea: {
        protocol: deepSeekSearchAreaProtocol,
        resultFormat: {
          coordinates: deepSeekBboxCoordinates,
          parseRawLocateValue: parseDeepSeekBboxLocateValue,
        },
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'deepseek'>;
