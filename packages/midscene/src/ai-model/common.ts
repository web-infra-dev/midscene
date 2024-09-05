import type OpenAI from 'openai';
import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources';
import { planSchema } from './automation/planning';
import {
  COZE_AI_ACTION_BOT_ID,
  COZE_AI_ASSERT_BOT_ID,
  COZE_EXTRACT_INFO_BOT_ID,
  COZE_INSPECT_ELEMENT_BOT_ID,
  callCozeAi,
  transfromOpenAiArgsToCoze,
  useCozeModel,
} from './coze';
import { callToGetJSONObject, useOpenAIModel } from './openai';
import { findElementSchema } from './prompt/element_inspector';
import { assertSchema, extractDataSchema } from './prompt/util';

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
    let responseFormat:
      | OpenAI.ChatCompletionCreateParams['response_format']
      | undefined;

    switch (AIActionTypeValue) {
      case AIActionType.ASSERT:
        responseFormat = assertSchema;
        break;
      case AIActionType.INSPECT_ELEMENT:
        responseFormat = findElementSchema;
        break;
      case AIActionType.EXTRACT_DATA:
        responseFormat = extractDataSchema;
        break;
      case AIActionType.PLAN:
        responseFormat = planSchema;
        break;
      default:
        responseFormat = undefined;
    }
    const parseResult = await callToGetJSONObject<T>(msgs, responseFormat);
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
