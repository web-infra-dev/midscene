import type { TModelFamily } from '@midscene/shared/env';
import { assert } from '@midscene/shared/utils';
import { jsonrepair } from 'jsonrepair';
import { extractJSONFromCodeBlock, safeParseJson } from '../shared/json';
import {
  type Bbox,
  type LocateResultValue,
  mapNormalized01000XyxyToActualPixelBbox,
  unwrapBboxLikeInput,
} from '../shared/model-locate-result';
import type {
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
  ModelCallContext,
} from './types';

const defaultBboxSize = 20;

function normalizeJsonObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeJsonObject(item));
  }

  if (typeof obj === 'object') {
    const normalized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const trimmedKey = key.trim();
      let normalizedValue = normalizeJsonObject(value);
      if (typeof normalizedValue === 'string') {
        normalizedValue = normalizedValue.trim();
      }
      normalized[trimmedKey] = normalizedValue;
    }
    return normalized;
  }

  return typeof obj === 'string' ? obj.trim() : obj;
}

function preprocessDoubaoBboxJson(input: string) {
  if (input.includes('bbox')) {
    while (/\d+\s+\d+/.test(input)) {
      input = input.replace(/(\d+)\s+(\d+)/g, '$1,$2');
    }
  }
  return input;
}

const doubaoJsonParser = (raw: string) => {
  try {
    return safeParseJson(raw);
  } catch (firstError) {
    const jsonString = preprocessDoubaoBboxJson(extractJSONFromCodeBlock(raw));
    try {
      return normalizeJsonObject(JSON.parse(jsonrepair(jsonString)));
    } catch (error) {
      throw Error(
        `failed to parse LLM response into JSON. Error - ${String(
          error ?? firstError ?? 'unknown error',
        )}. Response - \n ${raw}`,
      );
    }
  }
};

function resolveDoubaoLocateResult(input: unknown): LocateResultValue {
  const bbox = unwrapBboxLikeInput(input as any);
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

function normalizeDoubaoResultToPixelBbox(
  result: LocateResultValue,
  { width, height }: { width: number; height: number },
): Bbox {
  assert(
    width > 0 && height > 0,
    'width and height must be greater than 0 in doubao mode',
  );

  if (result.type === 'bbox') {
    return mapNormalized01000XyxyToActualPixelBbox(
      result.coordinates,
      width,
      height,
    );
  }

  const [x, y] = result.coordinates;
  const pixelX = Math.round((x * width) / 1000);
  const pixelY = Math.round((y * height) / 1000);
  return [
    Math.max(0, pixelX - defaultBboxSize / 2),
    Math.max(0, pixelY - defaultBboxSize / 2),
    Math.min(width, pixelX + defaultBboxSize / 2),
    Math.min(height, pixelY + defaultBboxSize / 2),
  ];
}

const buildDoubaoChatCompletionParams = ({
  reasoningEnabled,
  reasoningEffort,
}: ModelCallContext): ChatCompletionParamsResult => {
  const debugMessages: string[] = [];
  const config: Record<string, unknown> = {};

  if (reasoningEnabled !== undefined) {
    config.thinking = {
      type: reasoningEnabled ? 'enabled' : 'disabled',
    };
    debugMessages.push(
      `thinking.type=${reasoningEnabled ? 'enabled' : 'disabled'}`,
    );
  }
  if (reasoningEffort) {
    config.reasoning_effort = reasoningEffort;
    debugMessages.push(`reasoning_effort="${reasoningEffort}"`);
  }

  return { config, debugMessages };
};

const doubaoVisionAdapter: ModelAdapterDefinition = {
  jsonParser: doubaoJsonParser,
  chatCompletion: {
    buildChatCompletionParams: buildDoubaoChatCompletionParams,
  },
  locate: {
    resultAdapter: {
      format: 'bbox-normalized-0-1000-xyxy',
      resolve: resolveDoubaoLocateResult,
      normalize: normalizeDoubaoResultToPixelBbox,
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
