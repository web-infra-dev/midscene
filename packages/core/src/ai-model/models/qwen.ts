import type { TModelFamily } from '@midscene/shared/env';
import {
  type LocateResultValue,
  type PixelBbox,
  unwrapCoordinateListLikeInput,
} from '../shared/model-locate-result';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from './types';

const defaultBboxSize = 20;

function topLeftPointToPixelBbox(x: number, y: number): PixelBbox {
  return [
    Math.round(x),
    Math.round(y),
    Math.round(x + defaultBboxSize),
    Math.round(y + defaultBboxSize),
  ];
}

function parseQwen25RawLocateValue(input: unknown): LocateResultValue {
  const bbox = unwrapCoordinateListLikeInput(input as any) as number[];
  if (bbox.length < 2) {
    const msg = `invalid bbox data for qwen-vl mode: ${JSON.stringify(bbox)} `;
    throw new Error(msg);
  }

  if (typeof bbox[2] === 'number' && typeof bbox[3] === 'number') {
    return {
      type: 'bbox',
      coordinates: [bbox[0], bbox[1], bbox[2], bbox[3]],
    };
  }

  return { type: 'point', coordinates: [bbox[0], bbox[1]] };
}

function normalizeQwen25ResultToPixelBbox(
  result: LocateResultValue,
): PixelBbox {
  if (result.type === 'bbox') {
    return [
      Math.round(result.coordinates[0]),
      Math.round(result.coordinates[1]),
      Math.round(result.coordinates[2]),
      Math.round(result.coordinates[3]),
    ];
  }

  return topLeftPointToPixelBbox(result.coordinates[0], result.coordinates[1]);
}

const buildQwenChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const { reasoningEnabled, reasoningBudget } = userConfig;

  const commonOverrideConfig: Record<string, unknown> = {};

  if (userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
  }

  const modelSpecificConfig: Record<string, unknown> = {};

  if (reasoningEnabled !== 'default') {
    modelSpecificConfig.enable_thinking = reasoningEnabled ?? false;
    if (reasoningBudget !== undefined) {
      modelSpecificConfig.thinking_budget = reasoningBudget;
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

const buildQwen25ChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const commonOverrideConfig: Record<string, unknown> = {};

  if (userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
  }

  return {
    config: {
      ...midsceneDefaults,
      ...commonOverrideConfig,
      vl_high_resolution_images: true,
    },
  };
};

const qwen3Adapter: ModelAdapterDefinition = {
  chatCompletion: {
    unsupportedUserConfig: ['reasoningEffort'],
    buildChatCompletionParams: buildQwenChatCompletionParams,
  },
  locate: {
    resultAdapter: {
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    },
  },
};

export const qwenAdapters = {
  'qwen2.5-vl': {
    chatCompletion: {
      unsupportedUserConfig: [
        'reasoningEnabled',
        'reasoningEffort',
        'reasoningBudget',
      ],
      buildChatCompletionParams: buildQwen25ChatCompletionParams,
    },
    imagePreprocess: {
      padBlockSize: 28,
    },
    locate: {
      resultAdapter: {
        coordinates: { shape: 'bbox', order: 'xy' },
        parseRawLocateValue: parseQwen25RawLocateValue,
        mapLocateResultToPixelBbox: normalizeQwen25ResultToPixelBbox,
      },
    },
  },
  'qwen3-vl': qwen3Adapter,
  qwen3: qwen3Adapter,
  'qwen3.5': qwen3Adapter,
  'qwen3.6': qwen3Adapter,
} satisfies Pick<
  Record<TModelFamily, ModelAdapterDefinition>,
  'qwen2.5-vl' | 'qwen3-vl' | 'qwen3' | 'qwen3.5' | 'qwen3.6'
>;
