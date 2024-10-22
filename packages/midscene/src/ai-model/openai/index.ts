import assert from 'node:assert';
import { AIResponseFormat } from '@/types';
import { ifInBrowser } from '@midscene/shared/.';
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
export const OPENAI_API_KEY = 'OPENAI_API_KEY';
export const OPENAI_BASE_URL = 'OPENAI_BASE_URL';
export const MIDSCENE_MODEL_TEXT_ONLY = 'MIDSCENE_MODEL_TEXT_ONLY';
export const OPENAI_USE_AZURE = 'OPENAI_USE_AZURE';
export const MIDSCENE_CACHE = 'MIDSCENE_CACHE';

let config: Record<string, string | undefined> = {
  [OPENAI_API_KEY]: process.env[OPENAI_API_KEY] || undefined,
  [MIDSCENE_OPENAI_INIT_CONFIG_JSON]:
    process.env[MIDSCENE_OPENAI_INIT_CONFIG_JSON] || undefined,
  [OPENAI_BASE_URL]: process.env[OPENAI_BASE_URL] || undefined,
  [OPENAI_USE_AZURE]: process.env[OPENAI_USE_AZURE] || undefined,
  [MIDSCENE_MODEL_TEXT_ONLY]:
    process.env[MIDSCENE_MODEL_TEXT_ONLY] || undefined,
  [MIDSCENE_CACHE]: process.env[MIDSCENE_CACHE] || undefined,
};

export const getAIConfig = (
  configKey: keyof typeof config,
): string | undefined => {
  return config[configKey];
};

export const allAIConfig = () => {
  return config;
};

export const overrideAIConfig = (
  newConfig: Record<string, string | undefined>,
) => {
  config = { ...config, ...newConfig };
};

export function preferOpenAIModel(preferVendor?: 'coze' | 'openAI') {
  if (preferVendor && preferVendor !== 'openAI') return false;
  if (getAIConfig(OPENAI_API_KEY)) return true;

  return Boolean(getAIConfig(MIDSCENE_OPENAI_INIT_CONFIG_JSON));
}

// default model
const defaultModel = 'gpt-4o';
export function getModelName() {
  let modelName = defaultModel;
  const nameInConfig = getAIConfig(MIDSCENE_MODEL_NAME);
  if (nameInConfig) {
    console.log(`model: ${nameInConfig}`);
    modelName = nameInConfig;
  }
  return modelName;
}

const defaultExtraConfig: ClientOptions = {};
function getExtraConfig() {
  let extraConfig = defaultExtraConfig;
  const configInEnv = getAIConfig(MIDSCENE_OPENAI_INIT_CONFIG_JSON);
  if (configInEnv) {
    console.log('config for OpenAI loaded');
    extraConfig = JSON.parse(configInEnv);
  }
  return extraConfig;
}

async function createOpenAI() {
  let openai: OpenAI | AzureOpenAI;
  const extraConfig = getExtraConfig();
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
  const startTime = Date.now();
  const completion = await openai.chat.completions.create({
    model: getModelName(),
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
