import { MIDSCENE_MODEL_TEXT_ONLY, getAIConfig } from '@/env';
import type { AIUsageInfo } from '@/types';
import type {
  ChatCompletionContentPart,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources';
import { callToGetJSONObject, preferOpenAIModel } from './openai';

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

export async function callAiFn<T>(options: {
  msgs: AIArgs;
  AIActionType: AIActionType;
}): Promise<{ content: T; usage?: AIUsageInfo }> {
  const { msgs, AIActionType: AIActionTypeValue } = options;
  if (preferOpenAIModel('openAI')) {
    const { content, usage } = await callToGetJSONObject<T>(
      msgs,
      AIActionTypeValue,
    );
    return { content, usage };
  }

  throw Error(
    'Cannot find OpenAI config. You should set it before using. https://midscenejs.com/model-provider.html',
  );
}

export function transformUserMessages(msgs: ChatCompletionContentPart[]) {
  const textOnly = Boolean(getAIConfig(MIDSCENE_MODEL_TEXT_ONLY));
  if (!textOnly) return msgs;

  return msgs.reduce((res, msg) => {
    if (msg.type === 'text') {
      res += msg.text;
    }
    return res;
  }, '');
}
