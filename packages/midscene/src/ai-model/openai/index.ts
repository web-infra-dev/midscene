import assert from 'node:assert';
import { AIResponseFormat } from '@/types';
import { wrapOpenAI } from 'langsmith/wrappers';
import OpenAI, { type ClientOptions } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { planSchema } from '../automation/planning';
import { AIActionType } from '../common';
import { findElementSchema } from '../prompt/element_inspector';
import { assertSchema } from '../prompt/util';

export const MIDSCENE_OPENAI_INIT_CONFIG_JSON =
  'MIDSCENE_OPENAI_INIT_CONFIG_JSON';
export const MIDSCENE_MODEL_NAME = 'MIDSCENE_MODEL_NAME';
export const MIDSCENE_LANGSMITH_DEBUG = 'MIDSCENE_LANGSMITH_DEBUG';
export const MIDSCENE_DEBUG_AI_PROFILE = 'MIDSCENE_DEBUG_AI_PROFILE';
export const OPENAI_API_KEY = 'OPENAI_API_KEY';

export function useOpenAIModel(useModel?: 'coze' | 'openAI') {
  if (useModel && useModel !== 'openAI') return false;
  if (process.env[OPENAI_API_KEY]) return true;

  return Boolean(process.env[MIDSCENE_OPENAI_INIT_CONFIG_JSON]);
}

let extraConfig: ClientOptions = {};
if (
  typeof process.env[MIDSCENE_OPENAI_INIT_CONFIG_JSON] === 'string' &&
  process.env[MIDSCENE_OPENAI_INIT_CONFIG_JSON]
) {
  console.log('config for OpenAI loaded');
  extraConfig = JSON.parse(process.env[MIDSCENE_OPENAI_INIT_CONFIG_JSON]);
}

// default model
let model = 'gpt-4o';
if (typeof process.env[MIDSCENE_MODEL_NAME] === 'string') {
  console.log(`model: ${process.env[MIDSCENE_MODEL_NAME]}`);
  model = process.env[MIDSCENE_MODEL_NAME];
}

async function createOpenAI() {
  const openai = new OpenAI(extraConfig);

  if (process.env[MIDSCENE_LANGSMITH_DEBUG]) {
    console.log('DEBUGGING MODE: langsmith wrapper enabled');
    const openai = wrapOpenAI(new OpenAI());
    return openai;
  }

  return openai;
}

export async function call(
  messages: ChatCompletionMessageParam[],
  responseFormat?:
    | OpenAI.ChatCompletionCreateParams['response_format']
    | OpenAI.ResponseFormatJSONObject,
): Promise<string> {
  const openai = await createOpenAI();

  const shouldPrintTiming =
    typeof process.env[MIDSCENE_DEBUG_AI_PROFILE] === 'string';
  shouldPrintTiming && console.time('Midscene - AI call');
  const completion = await openai.chat.completions.create({
    model,
    messages,
    response_format: responseFormat,
    temperature: 0.2,
  });
  shouldPrintTiming && console.timeEnd('Midscene - AI call');
  shouldPrintTiming && console.log('Midscene - AI usage', completion.usage);
  const { content } = completion.choices[0].message;
  assert(content, 'empty content');
  return content;
}

export async function callToGetJSONObject<T>(
  messages: ChatCompletionMessageParam[],
  AIActionTypeValue: AIActionType,
): Promise<T> {
  // gpt-4o-2024-05-13 only supports json_object response format
  let responseFormat:
    | OpenAI.ChatCompletionCreateParams['response_format']
    | OpenAI.ResponseFormatJSONObject = {
    type: AIResponseFormat.JSON,
  };

  if (model === 'gpt-4o-2024-08-06') {
    switch (AIActionTypeValue) {
      case AIActionType.ASSERT:
        responseFormat = assertSchema;
        break;
      case AIActionType.INSPECT_ELEMENT:
        responseFormat = findElementSchema;
        break;
      case AIActionType.EXTRACT_DATA:
        //TODO: Currently the restriction type can only be a json subset of the constraint, and the way the extract api is used needs to be adjusted to limit the user's data to this as well
        // targetResponseFormat = extractDataSchema;
        break;
      case AIActionType.PLAN:
        responseFormat = planSchema;
        break;
    }
  }

  const response = await call(messages, responseFormat);
  assert(response, 'empty response');
  return JSON.parse(response);
}
