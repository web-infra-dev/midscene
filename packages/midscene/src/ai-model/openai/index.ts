import assert from 'node:assert';
import { AIResponseFormat } from '@/types';
import { ifInBrowser } from '@midscene/shared/utils';
import OpenAI, { type ClientOptions, AzureOpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { AIActionType } from '../common';
import { findElementSchema } from '../prompt/element_inspector';
import { planSchema } from '../prompt/planning';
import { assertSchema } from '../prompt/util';

// config keys
export const MIDSCENE_OPENAI_INIT_CONFIG_JSON =
  'MIDSCENE_OPENAI_INIT_CONFIG_JSON';
export const MIDSCENE_MODEL_NAME = 'MIDSCENE_MODEL_NAME';
export const MIDSCENE_LANGSMITH_DEBUG = 'MIDSCENE_LANGSMITH_DEBUG';
export const MIDSCENE_DEBUG_AI_PROFILE = 'MIDSCENE_DEBUG_AI_PROFILE';
export const MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG =
  'MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG';
export const OPENAI_API_KEY = 'OPENAI_API_KEY';
export const OPENAI_BASE_URL = 'OPENAI_BASE_URL';
export const MIDSCENE_MODEL_TEXT_ONLY = 'MIDSCENE_MODEL_TEXT_ONLY';
export const OPENAI_USE_AZURE = 'OPENAI_USE_AZURE';
export const MIDSCENE_CACHE = 'MIDSCENE_CACHE';
export const MATCH_BY_POSITION = 'MATCH_BY_POSITION';

const allConfigFromEnv = () => {
  return {
    [MIDSCENE_OPENAI_INIT_CONFIG_JSON]:
      process.env[MIDSCENE_OPENAI_INIT_CONFIG_JSON] || undefined,
    [MIDSCENE_MODEL_NAME]: process.env[MIDSCENE_MODEL_NAME] || undefined,
    [MIDSCENE_LANGSMITH_DEBUG]:
      process.env[MIDSCENE_LANGSMITH_DEBUG] || undefined,
    [MIDSCENE_DEBUG_AI_PROFILE]:
      process.env[MIDSCENE_DEBUG_AI_PROFILE] || undefined,
    [MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG]:
      process.env[MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG] || undefined,
    [OPENAI_API_KEY]: process.env[OPENAI_API_KEY] || undefined,
    [OPENAI_BASE_URL]: process.env[OPENAI_BASE_URL] || undefined,
    [MIDSCENE_MODEL_TEXT_ONLY]:
      process.env[MIDSCENE_MODEL_TEXT_ONLY] || undefined,
    [OPENAI_USE_AZURE]: process.env[OPENAI_USE_AZURE] || undefined,
    [MIDSCENE_CACHE]: process.env[MIDSCENE_CACHE] || undefined,
    [MATCH_BY_POSITION]: process.env[MATCH_BY_POSITION] || undefined,
  };
};

let userConfig: ReturnType<typeof allConfigFromEnv> = {} as any;

export const getAIConfig = (
  configKey: keyof typeof userConfig,
): string | undefined => {
  if (typeof userConfig[configKey] !== 'undefined') {
    return userConfig[configKey];
  }
  return allConfigFromEnv()[configKey];
};

export const allAIConfig = () => {
  return { ...allConfigFromEnv(), ...userConfig };
};

export const overrideAIConfig = (
  newConfig: ReturnType<typeof allConfigFromEnv>,
  extendMode = false,
) => {
  userConfig = extendMode ? { ...userConfig, ...newConfig } : { ...newConfig };
};

export function preferOpenAIModel(preferVendor?: 'coze' | 'openAI') {
  if (preferVendor && preferVendor !== 'openAI') return false;
  if (getAIConfig(OPENAI_API_KEY)) return true;

  return Boolean(getAIConfig(MIDSCENE_OPENAI_INIT_CONFIG_JSON));
}

// default model
const defaultModel = 'gpt-4o-2024-08-06';
export function getModelName() {
  let modelName = defaultModel;
  const nameInConfig = getAIConfig(MIDSCENE_MODEL_NAME);
  if (nameInConfig) {
    modelName = nameInConfig;
  }
  return modelName;
}

async function createOpenAI() {
  let openai: OpenAI | AzureOpenAI;
  const extraConfigString = getAIConfig(MIDSCENE_OPENAI_INIT_CONFIG_JSON);
  const extraConfig = extraConfigString ? JSON.parse(extraConfigString) : {};
  if (getAIConfig(OPENAI_USE_AZURE)) {
    openai = new AzureOpenAI({
      baseURL: getAIConfig(OPENAI_BASE_URL),
      apiKey: getAIConfig(OPENAI_API_KEY),
      ...extraConfig,
      dangerouslyAllowBrowser: true,
    });
  } else {
    openai = new OpenAI({
      baseURL: getAIConfig(OPENAI_BASE_URL),
      apiKey: getAIConfig(OPENAI_API_KEY),
      ...extraConfig,
      dangerouslyAllowBrowser: true,
    });
  }

  if (getAIConfig(MIDSCENE_LANGSMITH_DEBUG)) {
    if (ifInBrowser) {
      throw new Error('langsmith is not supported in browser');
    }
    console.log('DEBUGGING MODE: langsmith wrapper enabled');
    const { wrapOpenAI } = await import('langsmith/wrappers');
    openai = wrapOpenAI(openai);
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
    typeof getAIConfig(MIDSCENE_DEBUG_AI_PROFILE) === 'string';
  if (getAIConfig(MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG)) {
    console.log(allAIConfig());
  }
  const startTime = Date.now();
  const model = getModelName();
  const completion = await openai.chat.completions.create({
    model,
    messages,
    response_format: responseFormat,
    temperature: 0.1,
    stream: false,
    // betas: ['computer-use-2024-10-22'],
  } as any);
  shouldPrintTiming &&
    console.log(
      'Midscene - AI call',
      model,
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

  const model = getModelName();

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
  try {
    return JSON.parse(jsonContent);
  } catch {
    throw Error(`parse json error: ${jsonContent}`);
  }
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
