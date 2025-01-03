import assert from 'node:assert';
import { MIDSCENE_MODEL_TEXT_ONLY, getAIConfig } from '@/env';
import type { AIUsageInfo } from '@/types';

import type {
  ChatCompletionContentPart,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources';
import { callToGetJSONObject, checkAIConfig } from './openai';

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
    'Cannot find config for AI model service. You should set it before using. https://midscenejs.com/model-provider.html',
  );

  const { content, usage } = await callToGetJSONObject<T>(
    msgs,
    AIActionTypeValue,
  );
  return { content, usage };
}
