import type { TModelFamily } from '@midscene/shared/env';
import { isOpenRouter } from '../model-adapter/is-openrouter';
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
  rounding: 'round',
} as const;
const kimiPixelPointCoordinatesMeta = {
  shape: 'point',
  order: 'xy',
  rounding: 'round',
} as const;

function parseKimiRawLocateValue(input: unknown): LocateResultValue {
  const point = parseCoordinateList(input, 'point');
  if (point.length !== 2) {
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
  const { baseURL, midsceneDefaults, userConfig } = input;
  const { reasoningEnabled = false } = userConfig;
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

  const modelSpecificConfig: Record<string, unknown> = {};
  if (isOpenRouter(baseURL)) {
    // https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
    if (reasoningEnabled !== 'default') {
      modelSpecificConfig.reasoning = { enabled: reasoningEnabled };
    }
  } else {
    if (reasoningEnabled !== 'default') {
      modelSpecificConfig.thinking = {
        type: reasoningEnabled ? 'enabled' : 'disabled',
      };
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

const buildKimi3ChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { baseURL, midsceneDefaults, userConfig } = input;
  const commonOverrideConfig: Record<string, unknown> = {};

  // Kimi disallows custom temperature.
  commonOverrideConfig.temperature = undefined;

  if (
    userConfig.responseFormat !== 'none' &&
    input.expectedJsonObjectResponse
  ) {
    commonOverrideConfig.response_format = { type: 'json_object' };
  }

  const { reasoningEnabled = false, reasoningEffort } = userConfig;
  const reasoningConfig: Record<string, unknown> = {};
  if (isOpenRouter(baseURL)) {
    // OpenRouter supports disabling K3 reasoning and configuring effort.
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
    // Native K3 testing accepted thinking.type="disabled" and returned no
    // reasoning content, despite the documented mandatory reasoning behavior.
    // Follow the observed API behavior and allow the switch here.
    // https://platform.kimi.com/docs/guide/use-thinking-effort
    if (reasoningEnabled !== 'default') {
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
      ...commonOverrideConfig,
      ...reasoningConfig,
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
      element: {
        resultFormat: {
          coordinates: kimiNormalizedPointCoordinatesMeta,
          parseRawLocateValue: parseKimiRawLocateValue,
        },
      },
    },
  },
  kimi3: {
    chatCompletion: {
      unsupportedUserConfig: ['reasoningBudget'],
      buildChatCompletionParams: buildKimi3ChatCompletionParams,
      useReasoningAsContentFallback: true,
      // Kimi K3 multi-turn and tool calls must replay the complete assistant
      // message, including reasoning_content and tool_calls.
      // https://platform.kimi.com/docs/guide/use-thinking-effort
      replayRawAssistantMessage: true,
    },
    locate: {
      element: {
        resultFormat: {
          coordinates: kimiNormalizedPointCoordinatesMeta,
          parseRawLocateValue: parseKimiRawLocateValue,
        },
      },
    },
  },
} satisfies Pick<
  Record<TModelFamily, ModelAdapterDefinition>,
  'kimi' | 'kimi3'
>;
