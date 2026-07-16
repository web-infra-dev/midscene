import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../model-adapter/types';
import { parseModelResponseJson } from '../service-caller/json';
import {
  type LocateResultValue,
  createLocateResultValue,
  unwrapCoordinateListLikeInput,
} from '../shared/model-locate-result';

const doubaoBboxCoordinatesMeta = {
  shape: 'bbox',
  order: 'xy',
  normalizedBy: 1000,
} as const;
const doubaoPointCoordinatesMeta = {
  shape: 'point',
  order: 'xy',
  normalizedBy: 1000,
} as const;

/**
 * Finds a sequence of numbers separated by punctuation or whitespace in a
 * string. Separators cannot be letters, which prevents extracting the `2` in
 * a mixed alphanumeric token such as `bbox_2d` as a coordinate.
 */
const coordinateSequencePattern =
  /(?:^|[^a-zA-Z0-9])(\d+(?:[^a-zA-Z0-9]+\d+)+)(?=$|[^a-zA-Z0-9])/g;

function isFourFiniteNumberArray(input: unknown): input is number[] {
  return (
    Array.isArray(input) &&
    input.length === 4 &&
    input.every((value) => typeof value === 'number' && Number.isFinite(value))
  );
}

function parseNumbersFromUnexpectedBboxStructure(input: unknown): number[] {
  const serialized = JSON.stringify(input);
  if (!serialized) {
    return [];
  }

  const sequences = Array.from(
    serialized.matchAll(coordinateSequencePattern),
    (match) => match[1].match(/\d+/g)?.map(Number) ?? [],
  );
  const longestLength = Math.max(
    0,
    ...sequences.map((sequence) => sequence.length),
  );
  const longestSequences = sequences.filter(
    (sequence) => sequence.length === longestLength,
  );

  if (longestSequences.length !== 1) {
    return [];
  }

  return longestSequences[0];
}

export function parseDoubaoRawLocateValue(input: unknown): LocateResultValue {
  const bbox = unwrapCoordinateListLikeInput(input as any);
  const bboxList = isFourFiniteNumberArray(bbox)
    ? bbox
    : parseNumbersFromUnexpectedBboxStructure(bbox);

  if (bboxList.length === 4 || bboxList.length === 5) {
    return createLocateResultValue(doubaoBboxCoordinatesMeta, [
      bboxList[0],
      bboxList[1],
      bboxList[2],
      bboxList[3],
    ]);
  }

  if (
    bboxList.length === 6 ||
    bboxList.length === 2 ||
    bboxList.length === 3 ||
    bboxList.length === 7
  ) {
    return createLocateResultValue(doubaoPointCoordinatesMeta, [
      bboxList[0],
      bboxList[1],
    ]);
  }

  if (bboxList.length === 8) {
    return createLocateResultValue(doubaoBboxCoordinatesMeta, [
      bboxList[0],
      bboxList[1],
      bboxList[4],
      bboxList[5],
    ]);
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

const doubaoVisionAdapter: ModelAdapterDefinition = {
  jsonParser: parseModelResponseJson,
  chatCompletion: {
    unsupportedUserConfig: ['reasoningBudget'],
    buildChatCompletionParams: buildDoubaoChatCompletionParams,
    useReasoningAsContentFallback: true,
  },
  locate: {
    resultAdapter: {
      coordinates: doubaoBboxCoordinatesMeta,
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
