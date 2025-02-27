import assert from 'node:assert';
import type { AIUsageInfo, Size } from '@/types';

import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources';
import {
  callToGetJSONObject,
  checkAIConfig,
  getModelName,
} from './service-caller';

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

// transform the param of locate from qwen mode
export function fillLocateParam(locate: PlanningLocateParam) {
  if (locate?.bbox_2d && !locate?.bbox) {
    locate.bbox = locate.bbox_2d;
    // biome-ignore lint/performance/noDelete: <explanation>
    delete locate.bbox_2d;
  }

  const defaultBboxSize = 10;
  if (locate?.bbox) {
    locate.bbox[0] = Math.round(locate.bbox[0]);
    locate.bbox[1] = Math.round(locate.bbox[1]);
    locate.bbox[2] =
      typeof locate.bbox[2] === 'number'
        ? Math.round(locate.bbox[2])
        : Math.round(locate.bbox[0] + defaultBboxSize);
    locate.bbox[3] =
      typeof locate.bbox[3] === 'number'
        ? Math.round(locate.bbox[3])
        : Math.round(locate.bbox[1] + defaultBboxSize);
  }

  return locate;
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
