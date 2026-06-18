import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../model-adapter/types';
import {
  type LocateResultValue,
  type PixelBbox,
  createLocateResultValue,
  isBboxLocateResultValue,
  unwrapCoordinateListLikeInput,
} from '../shared/model-locate-result';

const defaultBboxSize = 20;
const qwen25BboxCoordinatesMeta = {
  shape: 'bbox',
  order: 'xy',
} as const;
const qwen25PointCoordinatesMeta = {
  shape: 'point',
  order: 'xy',
} as const;
const qwen3BboxCoordinatesMeta = {
  shape: 'bbox',
  order: 'xy',
  normalizedBy: 1000,
} as const;

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
    return createLocateResultValue(qwen25BboxCoordinatesMeta, [
      bbox[0],
      bbox[1],
      bbox[2],
      bbox[3],
    ]);
  }

  return createLocateResultValue(qwen25PointCoordinatesMeta, [
    bbox[0],
    bbox[1],
  ]);
}

function normalizeQwen25ResultToPixelBbox(
  result: LocateResultValue,
): PixelBbox {
  if (isBboxLocateResultValue(result)) {
    const { coordinates } = result;
    return [
      Math.round(coordinates[0]),
      Math.round(coordinates[1]),
      Math.round(coordinates[2]),
      Math.round(coordinates[3]),
    ];
  }

  const { coordinates } = result;
  return topLeftPointToPixelBbox(coordinates[0], coordinates[1]);
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

  // Alibaba Cloud Model Studio JSON mode:
  // https://help.aliyun.com/zh/model-studio/json-mode
  // Observed in qwen3.6 grounding runs: enabling this can make the model
  // return only ["bbox_2d"] without coordinates.
  // if (isLocateIntent(input.intent)) {
  //   commonOverrideConfig.response_format = { type: 'json_object' };
  // }

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
    messageExtraction: {
      kind: 'default',
      // DashScope returns Qwen thinking as `reasoning_content`. vLLM's
      // OpenAI-compatible server is migrating the recommended field to
      // `reasoning`, so Qwen adapters accept both serving conventions:
      // https://github.com/vllm-project/vllm/issues/27755
      reasoningContentKeys: ['reasoning_content', 'reasoning'],
    },
    useReasoningAsContentFallback: true,
  },
  locate: {
    resultAdapter: {
      coordinates: qwen3BboxCoordinatesMeta,
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
        coordinates: qwen25BboxCoordinatesMeta,
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
