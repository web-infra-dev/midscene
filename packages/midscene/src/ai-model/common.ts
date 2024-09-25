import type OpenAI from 'openai';
import type {
  ChatCompletionContentPart,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources';
import {
  COZE_AI_ACTION_BOT_ID,
  COZE_AI_ASSERT_BOT_ID,
  COZE_EXTRACT_INFO_BOT_ID,
  COZE_INSPECT_ELEMENT_BOT_ID,
  callCozeAi,
  transfromOpenAiArgsToCoze,
  useCozeModel,
} from './coze';
import {
  MIDSCENE_MODEL_TEXT_ONLY,
  callToGetJSONObject,
  useOpenAIModel,
} from './openai';

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
  useModel?: 'openAI' | 'coze';
}) {
  const { useModel, msgs, AIActionType: AIActionTypeValue } = options;
  if (useOpenAIModel(useModel)) {
    const parseResult = await callToGetJSONObject<T>(msgs, AIActionTypeValue);
    return parseResult;
  }

  if (useCozeModel(useModel)) {
    let botId = '';
    switch (AIActionTypeValue) {
      case AIActionType.ASSERT:
        botId = COZE_AI_ASSERT_BOT_ID;
        break;
      case AIActionType.EXTRACT_DATA:
        botId = COZE_EXTRACT_INFO_BOT_ID;
        break;
      case AIActionType.INSPECT_ELEMENT:
        botId = COZE_INSPECT_ELEMENT_BOT_ID;
        break;
      default:
        botId = COZE_AI_ACTION_BOT_ID;
    }
    const cozeMsg = transfromOpenAiArgsToCoze(msgs[1]);
    const parseResult = await callCozeAi<T>({
      ...cozeMsg,
      botId,
    });
    return parseResult;
  }

  throw Error('Does not contain coze and openai environment variables');
}

export function transformUserMessages(msgs: ChatCompletionContentPart[]) {
  const textOnly = Boolean(process.env[MIDSCENE_MODEL_TEXT_ONLY]);
  if (!textOnly) return msgs;

  return msgs.reduce((res, msg) => {
    if (msg.type === 'text') {
      res += msg.text;
    }
    return res;
  }, '');
}
