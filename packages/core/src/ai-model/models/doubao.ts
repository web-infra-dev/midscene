import type { TModelFamily } from '@midscene/shared/env';
import { assert } from '@midscene/shared/utils';
import { jsonrepair } from 'jsonrepair';
import {
  extractJSONFromCodeBlock,
  safeParseJson,
} from '../service-caller/json';
import {
  type LocateResultValue,
  unwrapCoordinateListLikeInput,
} from '../shared/model-locate-result';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  JsonParserContext,
  JsonParserSource,
  ModelAdapterDefinition,
} from './types';

export function normalizeDoubaoJsonObject(
  obj: any,
  context: Pick<JsonParserContext, 'preserveStringValueKeys'> = {},
): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeDoubaoJsonObject(item, context));
  }

  if (typeof obj === 'object') {
    const normalized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const trimmedKey = key.trim();
      const preserveStringValue =
        context.preserveStringValueKeys?.includes(trimmedKey) ?? false;
      const normalizedValue =
        typeof value === 'string'
          ? preserveStringValue
            ? value
            : value.trim()
          : normalizeDoubaoJsonObject(value, context);
      normalized[trimmedKey] = normalizedValue;
    }
    return normalized;
  }

  return typeof obj === 'string' ? obj.trim() : obj;
}

export function shouldRepairDoubaoLocateJson(source: JsonParserSource) {
  return (
    source === 'locate' ||
    source === 'section-locator' ||
    source === 'planning-action-param'
  );
}

export function preprocessDoubaoLocateJson(input: string) {
  if (input.includes('bbox')) {
    while (/\d+\s+\d+/.test(input)) {
      input = input.replace(/(\d+)\s+(\d+)/g, '$1,$2');
    }
  }
  return input;
}

const doubaoJsonParser: ModelAdapterDefinition['jsonParser'] = (
  raw,
  context = { source: 'generic-object' },
) => {
  const { source } = context;
  try {
    return safeParseJson(raw, context);
  } catch (firstError) {
    if (!shouldRepairDoubaoLocateJson(source)) {
      throw firstError;
    }

    const jsonString = preprocessDoubaoLocateJson(
      extractJSONFromCodeBlock(raw),
    );
    try {
      return normalizeDoubaoJsonObject(
        JSON.parse(jsonrepair(jsonString)),
        context,
      );
    } catch (error) {
      throw Error(
        `failed to parse LLM response into JSON. Error - ${String(
          error ?? firstError ?? 'unknown error',
        )}. Response - \n ${raw}`,
      );
    }
  }
};

export function parseDoubaoRawLocateValue(input: unknown): LocateResultValue {
  const bbox = unwrapCoordinateListLikeInput(input as any);
  if (typeof bbox === 'string') {
    assert(
      /^(\d+)\s(\d+)\s(\d+)\s(\d+)$/.test(bbox.trim()),
      `invalid bbox data string for doubao-vision mode: ${bbox}`,
    );
    const splitted = bbox.split(' ');
    if (splitted.length === 4) {
      return {
        type: 'bbox',
        coordinates: [
          Number(splitted[0]),
          Number(splitted[1]),
          Number(splitted[2]),
          Number(splitted[3]),
        ],
      };
    }
    throw new Error(`invalid bbox data string for doubao-vision mode: ${bbox}`);
  }

  let bboxList: number[] = [];
  if (Array.isArray(bbox) && typeof bbox[0] === 'string') {
    bbox.forEach((item) => {
      if (typeof item === 'string' && item.includes(',')) {
        const [x, y] = item.split(',');
        bboxList.push(Number(x.trim()), Number(y.trim()));
      } else if (typeof item === 'string' && item.includes(' ')) {
        const [x, y] = item.split(' ');
        bboxList.push(Number(x.trim()), Number(y.trim()));
      } else {
        bboxList.push(Number(item));
      }
    });
  } else {
    bboxList = bbox as number[];
  }

  if (bboxList.length === 4 || bboxList.length === 5) {
    return {
      type: 'bbox',
      coordinates: [bboxList[0], bboxList[1], bboxList[2], bboxList[3]],
    };
  }

  if (
    bboxList.length === 6 ||
    bboxList.length === 2 ||
    bboxList.length === 3 ||
    bboxList.length === 7
  ) {
    return { type: 'point', coordinates: [bboxList[0], bboxList[1]] };
  }

  if (bbox.length === 8) {
    return {
      type: 'bbox',
      coordinates: [bboxList[0], bboxList[1], bboxList[4], bboxList[5]],
    };
  }

  const msg = `invalid bbox data for doubao-vision mode: ${JSON.stringify(bbox)} `;
  throw new Error(msg);
}

const buildDoubaoChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const { reasoningEnabled, reasoningEffort } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};

  if (userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
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

const doubaoVisionAdapter: ModelAdapterDefinition = {
  jsonParser: doubaoJsonParser,
  chatCompletion: {
    unsupportedUserConfig: ['reasoningBudget'],
    buildChatCompletionParams: buildDoubaoChatCompletionParams,
  },
  locate: {
    resultAdapter: {
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
      parseRawLocateValue: parseDoubaoRawLocateValue,
    },
  },
};

export const doubaoAdapters = {
  'doubao-vision': doubaoVisionAdapter,
  'doubao-seed': doubaoVisionAdapter,
} satisfies Pick<
  Record<TModelFamily, ModelAdapterDefinition>,
  'doubao-vision' | 'doubao-seed'
>;
