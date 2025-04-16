import type { AIUsageInfo, Rect, Size } from '@/types';
import { assert } from '@midscene/shared/utils';

import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources';
import {
  callToGetJSONObject,
  checkAIConfig,
  getModelName,
} from './service-caller/index';

import { vlLocateMode } from '@/env';
import type { PlanningLocateParam } from '@/types';
import { getDebug } from '@midscene/shared/logger';

export type AIArgs = [
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
];

export enum AIActionType {
  ASSERT = 0,
  INSPECT_ELEMENT = 1,
  EXTRACT_DATA = 2,
  PLAN = 3,
}

export async function callAiFn<T>(
  msgs: AIArgs,
  AIActionTypeValue: AIActionType,
): Promise<{ content: T; usage?: AIUsageInfo }> {
  assert(
    checkAIConfig(),
    'Cannot find config for AI model service. If you are using a self-hosted model without validating the API key, please set `OPENAI_API_KEY` to any non-null value. https://midscenejs.com/model-provider.html',
  );

  const { content, usage } = await callToGetJSONObject<T>(
    msgs,
    AIActionTypeValue,
  );
  return { content, usage };
}

const defaultBboxSize = 20; // must be even number
const debugInspectUtils = getDebug('ai:common');

// transform the param of locate from qwen mode
export function fillLocateParam(
  locate: PlanningLocateParam,
  width: number,
  height: number,
  errorMsg?: string,
) {
  // The Qwen model might have hallucinations of naming bbox as bbox_2d.
  if ((locate as any).bbox_2d && !locate?.bbox) {
    locate.bbox = (locate as any).bbox_2d;
    // biome-ignore lint/performance/noDelete: <explanation>
    delete (locate as any).bbox_2d;
  }

  if (locate?.bbox) {
    locate.bbox = adaptBbox(locate.bbox, width, height, errorMsg);
  }

  return locate;
}

export function adaptQwenBbox(
  bbox: number[],
  errorMsg?: string,
): [number, number, number, number] {
  if (bbox.length < 2) {
    const msg =
      errorMsg ||
      `invalid bbox data for qwen-vl mode: ${JSON.stringify(bbox)} `;
    throw new Error(msg);
  }

  const result: [number, number, number, number] = [
    Math.round(bbox[0]),
    Math.round(bbox[1]),
    typeof bbox[2] === 'number'
      ? Math.round(bbox[2])
      : Math.round(bbox[0] + defaultBboxSize),
    typeof bbox[3] === 'number'
      ? Math.round(bbox[3])
      : Math.round(bbox[1] + defaultBboxSize),
  ];
  return result;
}

export function adaptDoubaoBbox(
  bbox: number[] | string,
  width: number,
  height: number,
  errorMsg?: string,
): [number, number, number, number] {
  assert(
    width > 0 && height > 0,
    'width and height must be greater than 0 in doubao mode',
  );

  if (typeof bbox === 'string') {
    assert(
      /^(\d+)\s(\d+)\s(\d+)\s(\d+)$/.test(bbox.trim()),
      `invalid bbox data string for doubao-vision mode: ${bbox}`,
    );
    const splitted = bbox.split(' ');
    if (splitted.length === 4) {
      return [
        Math.round((Number(splitted[0]) * width) / 1000),
        Math.round((Number(splitted[1]) * height) / 1000),
        Math.round((Number(splitted[2]) * width) / 1000),
        Math.round((Number(splitted[3]) * height) / 1000),
      ];
    }
    throw new Error(`invalid bbox data string for doubao-vision mode: ${bbox}`);
  }

  if (bbox.length === 4 || bbox.length === 5) {
    return [
      Math.round((bbox[0] * width) / 1000),
      Math.round((bbox[1] * height) / 1000),
      Math.round((bbox[2] * width) / 1000),
      Math.round((bbox[3] * height) / 1000),
    ];
  }

  // treat the bbox as a center point
  if (
    bbox.length === 6 ||
    bbox.length === 2 ||
    bbox.length === 3 ||
    bbox.length === 7
  ) {
    return [
      Math.max(0, Math.round((bbox[0] * width) / 1000) - defaultBboxSize / 2),
      Math.max(0, Math.round((bbox[1] * height) / 1000) - defaultBboxSize / 2),
      Math.min(
        width,
        Math.round((bbox[0] * width) / 1000) + defaultBboxSize / 2,
      ),
      Math.min(
        height,
        Math.round((bbox[1] * height) / 1000) + defaultBboxSize / 2,
      ),
    ];
  }

  if (bbox.length === 8) {
    return [
      Math.round((bbox[0] * width) / 1000),
      Math.round((bbox[1] * height) / 1000),
      Math.round((bbox[4] * width) / 1000),
      Math.round((bbox[5] * height) / 1000),
    ];
  }

  const msg =
    errorMsg ||
    `invalid bbox data for doubao-vision mode: ${JSON.stringify(bbox)} `;
  throw new Error(msg);
}

export function adaptBbox(
  bbox: number[],
  width: number,
  height: number,
  errorMsg?: string,
): [number, number, number, number] {
  if (vlLocateMode() === 'doubao-vision' || vlLocateMode() === 'vlm-ui-tars') {
    return adaptDoubaoBbox(bbox, width, height, errorMsg);
  }

  return adaptQwenBbox(bbox, errorMsg);
}

export function adaptBboxToRect(
  bbox: number[],
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0,
  errorMsg?: string,
): Rect {
  debugInspectUtils(
    'adaptBboxToRect',
    bbox,
    width,
    height,
    offsetX,
    offsetY,
    errorMsg || '',
  );
  const [left, top, right, bottom] = adaptBbox(bbox, width, height, errorMsg);
  return {
    left: left + offsetX,
    top: top + offsetY,
    width: right - left,
    height: bottom - top,
  };
}

let warned = false;
export function warnGPT4oSizeLimit(size: Size) {
  if (warned) return;
  if (getModelName()?.toLowerCase().includes('gpt-4o')) {
    const warningMsg = `GPT-4o has a maximum image input size of 2000x768 or 768x2000, but got ${size.width}x${size.height}. Please set your page to a smaller resolution. Otherwise, the result may be inaccurate.`;

    if (
      Math.max(size.width, size.height) > 2000 ||
      Math.min(size.width, size.height) > 768
    ) {
      console.warn(warningMsg);
      warned = true;
    }
  }
}

export function mergeRects(rects: Rect[]) {
  const minLeft = Math.min(...rects.map((r) => r.left));
  const minTop = Math.min(...rects.map((r) => r.top));
  const maxRight = Math.max(...rects.map((r) => r.left + r.width));
  const maxBottom = Math.max(...rects.map((r) => r.top + r.height));
  return {
    left: minLeft,
    top: minTop,
    width: maxRight - minLeft,
    height: maxBottom - minTop,
  };
}

// expand the search area to at least 300 x 300, or add a default padding
export function expandSearchArea(rect: Rect, screenSize: Size) {
  const minEdgeSize = 300;
  const defaultPadding = 160;

  const paddingSizeHorizontal =
    rect.width < minEdgeSize
      ? Math.ceil((minEdgeSize - rect.width) / 2)
      : defaultPadding;
  const paddingSizeVertical =
    rect.height < minEdgeSize
      ? Math.ceil((minEdgeSize - rect.height) / 2)
      : defaultPadding;
  rect.left = Math.max(0, rect.left - paddingSizeHorizontal);
  rect.width = Math.min(
    rect.width + paddingSizeHorizontal * 2,
    screenSize.width - rect.left,
  );
  rect.top = Math.max(0, rect.top - paddingSizeVertical);
  rect.height = Math.min(
    rect.height + paddingSizeVertical * 2,
    screenSize.height - rect.top,
  );
  return rect;
}
