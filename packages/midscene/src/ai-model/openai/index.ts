import assert from 'node:assert';
import { AIResponseFormat, type AIUsageInfo } from '@/types';
import { ifInBrowser } from '@midscene/shared/utils';
import OpenAI, { AzureOpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { SocksProxyAgent } from 'socks-proxy-agent';
import {
  MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG,
  MIDSCENE_DEBUG_AI_PROFILE,
  MIDSCENE_LANGSMITH_DEBUG,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_OPENAI_SOCKS_PROXY,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  OPENAI_USE_AZURE,
  allAIConfig,
  getAIConfig,
  getAIConfigInJson,
} from '../../env';
import { AIActionType } from '../common';
import { findElementSchema } from '../prompt/element_inspector';
import { planSchema } from '../prompt/planning';
import { assertSchema } from '../prompt/util';

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
  const extraConfig = getAIConfigInJson(MIDSCENE_OPENAI_INIT_CONFIG_JSON);

  const socksProxy = getAIConfig(MIDSCENE_OPENAI_SOCKS_PROXY);
  const socksAgent = socksProxy ? new SocksProxyAgent(socksProxy) : undefined;
  if (getAIConfig(OPENAI_USE_AZURE)) {
    openai = new AzureOpenAI({
      baseURL: getAIConfig(OPENAI_BASE_URL),
      apiKey: getAIConfig(OPENAI_API_KEY),
      httpAgent: socksAgent,
      ...extraConfig,
      dangerouslyAllowBrowser: true,
    });
  } else {
    openai = new OpenAI({
      baseURL: getAIConfig(OPENAI_BASE_URL),
      apiKey: getAIConfig(OPENAI_API_KEY),
      httpAgent: socksAgent,
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
): Promise<{ content: string; usage?: AIUsageInfo }> {
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
  return { content, usage: completion.usage };
}

export async function callToGetJSONObject<T>(
  messages: ChatCompletionMessageParam[],
  AIActionTypeValue: AIActionType,
): Promise<{ content: T; usage?: AIUsageInfo }> {
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

  const safeJsonParse = (input: string) => {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  };
  const response = await call(messages, responseFormat);
  assert(response, 'empty response');
  let jsonContent = safeJsonParse(response.content);
  if (jsonContent) return { content: jsonContent, usage: response.usage };

  jsonContent = extractJSONFromCodeBlock(response.content);
  try {
    return { content: JSON.parse(jsonContent), usage: response.usage };
  } catch {
    throw Error(`parse json error: ${response.content}`);
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
