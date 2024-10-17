import assert from 'node:assert';
import { AIResponseFormat } from '@/types';
import { wrapOpenAI } from 'langsmith/wrappers';
import OpenAI, { type ClientOptions, AzureOpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { AIActionType } from '../common';
import { findElementSchema } from '../prompt/element_inspector';
import { planSchema } from '../prompt/planning';
import { assertSchema } from '../prompt/util';

export const MIDSCENE_OPENAI_INIT_CONFIG_JSON =
  'MIDSCENE_OPENAI_INIT_CONFIG_JSON';
export const MIDSCENE_MODEL_NAME = 'MIDSCENE_MODEL_NAME';
export const MIDSCENE_LANGSMITH_DEBUG = 'MIDSCENE_LANGSMITH_DEBUG';
export const MIDSCENE_DEBUG_AI_PROFILE = 'MIDSCENE_DEBUG_AI_PROFILE';
export const OPENAI_API_KEY = 'OPENAI_API_KEY';
export const MIDSCENE_MODEL_TEXT_ONLY = 'MIDSCENE_MODEL_TEXT_ONLY';

const OPENAI_USE_AZURE = 'OPENAI_USE_AZURE';

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
  let openai: OpenAI | AzureOpenAI;
  if (process.env[OPENAI_USE_AZURE]) {
    openai = new AzureOpenAI(extraConfig);
  } else {
    openai = new OpenAI(extraConfig);
  }

  if (process.env[MIDSCENE_LANGSMITH_DEBUG]) {
    console.log('DEBUGGING MODE: langsmith wrapper enabled');
    const openai = wrapOpenAI(new OpenAI(extraConfig));
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
  const startTime = Date.now();
  const completion = await openai.chat.completions.create({
    model,
    messages,
    response_format: responseFormat,
    temperature: 0.1,
    stream: false,
  });
  shouldPrintTiming &&
    console.log(
      'Midscene - AI call',
      completion.usage,
      `${Date.now() - startTime}ms`,
    );
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

  if (model.startsWith('gemini')) {
    responseFormat = { type: AIResponseFormat.TEXT };
  }

  const response = await call(messages, responseFormat);
  assert(response, 'empty response');
  const jsonContent = extractJSONFromCodeBlock(response);
  return JSON.parse(jsonContent);
}

export function extractJSONFromCodeBlock(response: string) {
  // First, try to match a JSON object directly in the response
  const jsonMatch = response.match(/^\s*(\{[\s\S]*\})\s*$/);
  if (jsonMatch) {
    return jsonMatch[1];
  }

  // If no direct JSON object is found, try to extract JSON from a code block
  const codeBlockMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1];
  }

  // If no code block is found, try to find a JSON-like structure in the text
  const jsonLikeMatch = response.match(/\{[\s\S]*\}/);
  if (jsonLikeMatch) {
    return jsonLikeMatch[0];
  }

  // If no JSON-like structure is found, return the original response
  return response;
}
