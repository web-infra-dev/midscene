import type { TModelFamily } from '@midscene/shared/env';
import { assert } from '@midscene/shared/utils';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../model-adapter/types';
import { parseModelResponseJson } from '../service-caller/json';
import {
  type LocateResultValue,
  unwrapCoordinateListLikeInput,
} from '../shared/model-locate-result';

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
  jsonParser: parseModelResponseJson,
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
