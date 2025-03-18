import type { AIUsageInfo, Size } from '@/types';
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

const defaultBboxSize = 20;

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
  bbox: number[],
  width: number,
  height: number,
  errorMsg?: string,
): [number, number, number, number] {
  assert(
    width > 0 && height > 0,
    'width and height must be greater than 0 in doubao mode',
  );
  if (bbox.length === 4 || bbox.length === 5) {
    return [
      Math.round((bbox[0] * width) / 1000),
      Math.round((bbox[1] * height) / 1000),
      Math.round((bbox[2] * width) / 1000),
      Math.round((bbox[3] * height) / 1000),
    ];
  }

  if (bbox.length === 6 || bbox.length === 2) {
    return [
      Math.round((bbox[0] * width) / 1000),
      Math.round((bbox[1] * height) / 1000),
      Math.round((bbox[0] * width) / 1000) + defaultBboxSize,
      Math.round((bbox[1] * height) / 1000) + defaultBboxSize,
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
  if (vlLocateMode() === 'doubao-vision') {
    return adaptDoubaoBbox(bbox, width, height, errorMsg);
  }

  return adaptQwenBbox(bbox, errorMsg);
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
