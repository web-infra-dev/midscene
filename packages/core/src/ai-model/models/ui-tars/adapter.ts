import { type TModelFamily, UITarsModelVersion } from '@midscene/shared/env';
import { assert } from '@midscene/shared/utils';
import { jsonrepair } from 'jsonrepair';
import {
  extractJSONFromCodeBlock,
  safeParseJson,
} from '../../service-caller/json';
import {
  type LocateResultValue,
  unwrapCoordinateListLikeInput,
} from '../../shared/model-locate-result';
import type { JsonParserSource, ModelAdapterDefinition } from '../types';
import { uiTarsPlanning } from './planning';

const defaultVlmUiTarsReplanningCycleLimit = 40;

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

function shouldRepairUiTarsLocateJson(source: JsonParserSource) {
  return (
    source === 'locate' ||
    source === 'section-locator' ||
    source === 'planning-action-param'
  );
}

function preprocessUiTarsLocateJson(input: string) {
  if (input.includes('bbox')) {
    while (/\d+\s+\d+/.test(input)) {
      input = input.replace(/(\d+)\s+(\d+)/g, '$1,$2');
    }
  }
  return input;
}

const uiTarsJsonParser: ModelAdapterDefinition['jsonParser'] = (
  raw,
  { source } = { source: 'generic-object' },
) => {
  try {
    return safeParseJson(raw);
  } catch (firstError) {
    if (!shouldRepairUiTarsLocateJson(source)) {
      throw firstError;
    }

    const jsonString = preprocessUiTarsLocateJson(
      extractJSONFromCodeBlock(raw),
    );
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

// UI-TARS has not received active updates for a long time, so this parser is
// intentionally kept separate from Doubao even though the current logic is the
// same. This avoids coupling UI-TARS behavior to future Doubao adapter changes.
function parseUiTarsRawLocateValue(input: unknown): LocateResultValue {
  const bbox = unwrapCoordinateListLikeInput(input as any);
  if (typeof bbox === 'string') {
    assert(
      /^(\d+)\s(\d+)\s(\d+)\s(\d+)$/.test(bbox.trim()),
      `invalid bbox data string for ui-tars mode: ${bbox}`,
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
    throw new Error(`invalid bbox data string for ui-tars mode: ${bbox}`);
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

  const msg = `invalid bbox data for ui-tars mode: ${JSON.stringify(bbox)} `;
  throw new Error(msg);
}

function createUiTarsAdapter(
  uiTarsModelVersion: UITarsModelVersion,
): ModelAdapterDefinition {
  return {
    jsonParser: uiTarsJsonParser,
    chatCompletion: {
      unsupportedUserConfig: [
        'reasoningEnabled',
        'reasoningEffort',
        'reasoningBudget',
      ],
      buildChatCompletionParams: ({ midsceneDefaults, userConfig }) => ({
        config: {
          temperature: userConfig.temperature ?? midsceneDefaults.temperature,
        },
      }),
    },
    planning: {
      kind: 'custom',
      cacheEnabled: false,
      defaultReplanningCycleLimit: defaultVlmUiTarsReplanningCycleLimit,
      planFn: (userInstruction, options) =>
        uiTarsPlanning(userInstruction, options, uiTarsModelVersion),
    },
    locate: {
      resultAdapter: {
        coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
        parseRawLocateValue: parseUiTarsRawLocateValue,
      },
    },
  };
}

const uiTarsDoubao15Adapter = createUiTarsAdapter(
  UITarsModelVersion.DOUBAO_1_5_20B,
);

export const uiTarsAdapters = {
  'vlm-ui-tars': createUiTarsAdapter(UITarsModelVersion.V1_0),
  'vlm-ui-tars-doubao': uiTarsDoubao15Adapter,
  'vlm-ui-tars-doubao-1.5': uiTarsDoubao15Adapter,
} satisfies Pick<
  Record<TModelFamily, ModelAdapterDefinition>,
  'vlm-ui-tars' | 'vlm-ui-tars-doubao' | 'vlm-ui-tars-doubao-1.5'
>;
