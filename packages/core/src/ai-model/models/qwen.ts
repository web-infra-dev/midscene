import type { TModelFamily } from '@midscene/shared/env';
import { isOpenRouter } from '../model-adapter/is-openrouter';
import { buildOpenRouterReasoningParams } from '../model-adapter/openrouter-reasoning';
import type {
  ChatCompletionCallContext,
  ChatCompletionDefinition,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../model-adapter/types';
import { type JsonParser, parseModelResponseJson } from '../shared/json';
import {
  type LocateResultValue,
  createLocateResultValue,
  unwrapCoordinateListLikeInput,
} from '../shared/model-locate-result';

const qwen25BboxCoordinatesMeta = {
  shape: 'bbox',
  order: 'xy',
  rounding: 'round',
} as const;
const qwen25PointCoordinatesMeta = {
  shape: 'point',
  order: 'xy',
  rounding: 'round',
} as const;
const qwenNormalizedBboxCoordinatesMeta = {
  shape: 'bbox',
  order: 'xy',
  normalizedBy: 1000,
  rounding: 'round',
} as const;

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

const buildQwen3VlChatCompletionParams = (
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
  }
  if (reasoningEnabled === true) {
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

const buildQwen3ChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { baseURL, provider, midsceneDefaults, userConfig } = input;
  const { reasoningEnabled = false, reasoningBudget } = userConfig;

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

  if (isOpenRouter(baseURL, provider)) {
    Object.assign(
      modelSpecificConfig,
      buildOpenRouterReasoningParams(userConfig),
    );
  } else {
    if (reasoningEnabled !== 'default') {
      modelSpecificConfig.enable_thinking = reasoningEnabled;
    }
    if (reasoningEnabled === true) {
      if (reasoningBudget !== undefined) {
        modelSpecificConfig.thinking_budget = reasoningBudget;
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

const buildQwen4ChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { baseURL, provider, midsceneDefaults, userConfig } = input;
  const {
    reasoningEnabled = false,
    reasoningEffort,
    reasoningBudget,
  } = userConfig;

  const commonOverrideConfig: Record<string, unknown> = {};

  if (userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
  }

  if (
    input.expectedJsonObjectResponse &&
    userConfig.responseFormat !== 'none'
  ) {
    commonOverrideConfig.response_format = { type: 'json_object' };
  }

  const modelSpecificConfig: Record<string, unknown> = {};

  if (isOpenRouter(baseURL, provider)) {
    Object.assign(
      modelSpecificConfig,
      buildOpenRouterReasoningParams(userConfig),
    );
  } else {
    if (reasoningEnabled !== 'default') {
      modelSpecificConfig.enable_thinking = reasoningEnabled;
    }
    if (reasoningEnabled === true) {
      if (reasoningEffort !== undefined) {
        modelSpecificConfig.reasoning_effort = reasoningEffort;
      }
      if (reasoningBudget !== undefined) {
        modelSpecificConfig.thinking_budget = reasoningBudget;
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

// DashScope returns thinking as `reasoning_content`. vLLM is moving to
// `reasoning`: https://github.com/vllm-project/vllm/issues/27755
const qwenMessageExtraction = {
  kind: 'default',
  reasoningContentKeys: ['reasoning_content', 'reasoning'],
} satisfies NonNullable<ChatCompletionDefinition['messageExtraction']>;

const qwenNormalizedBboxLocate = {
  element: {
    resultFormat: {
      resultKey: 'bbox_2d',
      resultKeyAliases: ['bbox'],
      coordinates: qwenNormalizedBboxCoordinatesMeta,
    },
  },
} satisfies NonNullable<ModelAdapterDefinition['locate']>;

const qwen3VlAdapter: ModelAdapterDefinition = {
  chatCompletion: {
    buildChatCompletionParams: buildQwen3VlChatCompletionParams,
    messageExtraction: qwenMessageExtraction,
    useReasoningAsContentFallback: true,
  },
  locate: qwenNormalizedBboxLocate,
};

const parseQwenLocateJson: JsonParser = (raw, context) => {
  const parsed = parseModelResponseJson(raw, context);
  // Qwen3 and Qwen4 can wrap a locate result in a single-item array:
  // [{"bbox_2d":[562,653,574,671],"label":"Approve checkbox"}]
  // [{"point_2d":[568,661],"label":"Approve checkbox"}]
  // Unwrap the object and let the locate protocol validate the coordinate field.
  if (
    (context?.source === 'locate' || context?.source === 'section-locator') &&
    Array.isArray(parsed) &&
    parsed.length === 1
  ) {
    const [entry] = parsed;
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      return entry;
    }
  }
  return parsed;
};

const qwen3Adapter: ModelAdapterDefinition = {
  jsonParser: parseQwenLocateJson,
  chatCompletion: {
    buildChatCompletionParams: buildQwen3ChatCompletionParams,
    messageExtraction: qwenMessageExtraction,
    useReasoningAsContentFallback: true,
  },
  locate: qwenNormalizedBboxLocate,
};

const qwen4Adapter: ModelAdapterDefinition = {
  jsonParser: parseQwenLocateJson,
  chatCompletion: {
    buildChatCompletionParams: buildQwen4ChatCompletionParams,
    messageExtraction: qwenMessageExtraction,
    useReasoningAsContentFallback: true,
  },
  locate: {
    element: {
      resultFormat: {
        resultKey: 'point',
        resultKeyAliases: ['point_2d'],
        coordinates: {
          shape: 'point',
          order: 'xy',
          normalizedBy: 1000,
          rounding: 'round',
        },
      },
    },
  },
};

export const qwenAdapters = {
  'qwen2.5-vl': {
    chatCompletion: {
      buildChatCompletionParams: buildQwen25ChatCompletionParams,
    },
    imagePreprocess: {
      padBlockSize: 28,
    },
    locate: {
      element: {
        resultFormat: {
          resultKey: 'bbox_2d',
          resultKeyAliases: ['bbox'],
          coordinates: qwen25BboxCoordinatesMeta,
          parseRawLocateValue: parseQwen25RawLocateValue,
        },
      },
    },
  },
  'qwen3-vl': qwen3VlAdapter,
  qwen3: qwen3Adapter,
  'qwen3.5': qwen3Adapter,
  'qwen3.6': qwen3Adapter,
  qwen4: qwen4Adapter,
} satisfies Pick<
  Record<TModelFamily, ModelAdapterDefinition>,
  'qwen2.5-vl' | 'qwen3-vl' | 'qwen3' | 'qwen3.5' | 'qwen3.6' | 'qwen4'
>;
