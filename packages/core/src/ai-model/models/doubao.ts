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

function parseNumbersFromBboxString(input: string): number[] {
  return (input.match(/\d+/g) ?? []).map(Number).filter(Number.isFinite);
}

function parseLeadingNumberFromString(input: string): number | undefined {
  const match = input.match(/^\s*(\d+)/);
  return match ? Number(match[1]) : undefined;
}

/**
 * Clean coordinate strings can contain multiple positive integers, e.g.
 * - "123 100"
 * - "123,100"
 * - "277; 664 291;"
 * Dirty strings like "345<" are handled by taking the leading number and
 * dropping the remaining array items.
 */
function isCleanCoordinateString(input: string): boolean {
  return /^\s*\d+(?:[\s,;]+\d+)*\s*[,;]?\s*$/.test(input);
}

function parseNumbersFromBboxArray(input: unknown[]): number[] {
  const numbers: number[] = [];

  for (const item of input) {
    if (typeof item === 'number') {
      numbers.push(item);
      continue;
    }

    if (typeof item === 'string') {
      if (isCleanCoordinateString(item)) {
        numbers.push(...parseNumbersFromBboxString(item));
        continue;
      } else {
        const leadingNumber = parseLeadingNumberFromString(item);
        if (leadingNumber !== undefined) {
          numbers.push(leadingNumber);
        }
        // Once a dirty string appears, the remaining array items usually belong
        // to broken JSON repair output, e.g. [410, 295, 885, "345<", "/bbox>..."].
        break;
      }
    }

    break;
  }

  return numbers.filter(Number.isFinite);
}

export function parseDoubaoRawLocateValue(input: unknown): LocateResultValue {
  const bbox = unwrapCoordinateListLikeInput(input as any);
  let bboxList: number[] = [];

  if (typeof bbox === 'string') {
    /**
     * Some models return bbox as a string, e.g.
     * - { "bbox": "[336, 163, 717, 200]" }.
     * - { "bbox": "336, 163, 717, 200" }.
     * - { "bbox": "336 163 717 200" }.
     */
    bboxList = parseNumbersFromBboxString(bbox);
    if (bboxList.length !== 4) {
      throw new Error(
        `invalid bbox data string for doubao-vision mode: ${bbox}`,
      );
    }
  } else if (Array.isArray(bbox)) {
    bboxList = parseNumbersFromBboxArray(bbox);
  } else {
    bboxList = bbox as number[];
  }

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
