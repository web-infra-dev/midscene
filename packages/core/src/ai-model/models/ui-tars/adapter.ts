import { type TModelFamily, UITarsModelVersion } from '@midscene/shared/env';
import { assert } from '@midscene/shared/utils';
import type { ModelAdapterDefinition } from '../../model-adapter/types';
import { parseModelResponseJson } from '../../service-caller/json';
import {
  type LocateResultValue,
  createLocateResultValue,
  unwrapCoordinateListLikeInput,
} from '../../shared/model-locate-result';
import { createUiTarsPlanner } from './planning';

const defaultVlmUiTarsReplanningCycleLimit = 40;
const uiTarsBboxCoordinatesMeta = {
  shape: 'bbox',
  order: 'xy',
  normalizedBy: 1000,
} as const;
const uiTarsPointCoordinatesMeta = {
  shape: 'point',
  order: 'xy',
  normalizedBy: 1000,
} as const;

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
      return createLocateResultValue(uiTarsBboxCoordinatesMeta, [
        Number(splitted[0]),
        Number(splitted[1]),
        Number(splitted[2]),
        Number(splitted[3]),
      ]);
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
    return createLocateResultValue(uiTarsBboxCoordinatesMeta, [
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
    return createLocateResultValue(uiTarsPointCoordinatesMeta, [
      bboxList[0],
      bboxList[1],
    ]);
  }

  if (bbox.length === 8) {
    return createLocateResultValue(uiTarsBboxCoordinatesMeta, [
      bboxList[0],
      bboxList[1],
      bboxList[4],
      bboxList[5],
    ]);
  }

  const msg = `invalid bbox data for ui-tars mode: ${JSON.stringify(bbox)} `;
  throw new Error(msg);
}

function createUiTarsAdapter(
  uiTarsModelVersion: UITarsModelVersion,
): ModelAdapterDefinition {
  return {
    jsonParser: parseModelResponseJson,
    chatCompletion: {
      unsupportedUserConfig: [
        'reasoningEnabled',
        'reasoningEffort',
        'reasoningBudget',
      ],
      buildChatCompletionParams: ({ midsceneDefaults, userConfig }) => {
        const commonOverrideConfig: Record<string, unknown> = {};

        if (userConfig.temperature !== undefined) {
          commonOverrideConfig.temperature = userConfig.temperature;
        }

        return {
          config: {
            ...midsceneDefaults,
            ...commonOverrideConfig,
          },
        };
      },
    },
    planning: {
      kind: 'custom',
      cacheEnabled: false,
      defaultReplanningCycleLimit: defaultVlmUiTarsReplanningCycleLimit,
      planner: createUiTarsPlanner(uiTarsModelVersion),
    },
    locate: {
      resultAdapter: {
        coordinates: uiTarsBboxCoordinatesMeta,
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
