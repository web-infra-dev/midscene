import assert from 'node:assert';
import { AIResponseFormat, type AIUsageInfo } from '@/types';
import { Anthropic } from '@anthropic-ai/sdk';
import {
  DefaultAzureCredential,
  getBearerTokenProvider,
} from '@azure/identity';
import { ifInBrowser } from '@midscene/shared/utils';
import dJSON from 'dirty-json';
import OpenAI, { AzureOpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { SocksProxyAgent } from 'socks-proxy-agent';
import {
  ANTHROPIC_API_KEY,
  MIDSCENE_AZURE_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_AZURE_OPENAI_SCOPE,
  MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG,
  MIDSCENE_DEBUG_AI_PROFILE,
  MIDSCENE_LANGSMITH_DEBUG,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_OPENAI_SOCKS_PROXY,
  MIDSCENE_USE_ANTHROPIC_SDK,
  MIDSCENE_USE_AZURE_OPENAI,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  OPENAI_MAX_TOKENS,
  OPENAI_USE_AZURE,
  allAIConfig,
  getAIConfig,
  getAIConfigInJson,
} from '../../env';
import { AIActionType } from '../common';
import { findElementSchema } from '../prompt/element_inspector';
import { planSchema } from '../prompt/planning';
import { assertSchema } from '../prompt/util';

export function checkAIConfig(preferVendor?: 'coze' | 'openAI') {
  if (preferVendor && preferVendor !== 'openAI') return false;
  if (getAIConfig(OPENAI_API_KEY)) return true;
  if (getAIConfig(MIDSCENE_USE_AZURE_OPENAI)) return true;
  if (getAIConfig(ANTHROPIC_API_KEY)) return true;

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

async function createChatClient(): Promise<{
  completion: OpenAI.Chat.Completions;
  style: 'openai' | 'anthropic';
}> {
  let openai: OpenAI | AzureOpenAI | undefined;
  const extraConfig = getAIConfigInJson(MIDSCENE_OPENAI_INIT_CONFIG_JSON);

  const socksProxy = getAIConfig(MIDSCENE_OPENAI_SOCKS_PROXY);
  const socksAgent = socksProxy ? new SocksProxyAgent(socksProxy) : undefined;

  if (getAIConfig(OPENAI_USE_AZURE)) {
    // this is deprecated
    openai = new AzureOpenAI({
      baseURL: getAIConfig(OPENAI_BASE_URL),
      apiKey: getAIConfig(OPENAI_API_KEY),
      httpAgent: socksAgent,
      ...extraConfig,
      dangerouslyAllowBrowser: true,
    }) as OpenAI;
  } else if (getAIConfig(MIDSCENE_USE_AZURE_OPENAI)) {
    // sample code: https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/openai/openai/samples/cookbook/simpleCompletionsPage/app.js
    const scope = getAIConfig(MIDSCENE_AZURE_OPENAI_SCOPE);

    assert(
      !ifInBrowser,
      'Azure OpenAI is not supported in browser with Midscene.',
    );
    const credential = new DefaultAzureCredential();

    assert(scope, 'MIDSCENE_AZURE_OPENAI_SCOPE is required');
    const tokenProvider = getBearerTokenProvider(credential, scope);

    const extraAzureConfig = getAIConfigInJson(
      MIDSCENE_AZURE_OPENAI_INIT_CONFIG_JSON,
    );
    openai = new AzureOpenAI({
      azureADTokenProvider: tokenProvider,
      ...extraConfig,
      ...extraAzureConfig,
    });
  } else if (!getAIConfig(MIDSCENE_USE_ANTHROPIC_SDK)) {
    openai = new OpenAI({
      baseURL: getAIConfig(OPENAI_BASE_URL),
      apiKey: getAIConfig(OPENAI_API_KEY),
      httpAgent: socksAgent,
      ...extraConfig,
      dangerouslyAllowBrowser: true,
    });
  }

  if (openai && getAIConfig(MIDSCENE_LANGSMITH_DEBUG)) {
    if (ifInBrowser) {
      throw new Error('langsmith is not supported in browser');
    }
    console.log('DEBUGGING MODE: langsmith wrapper enabled');
    const { wrapOpenAI } = await import('langsmith/wrappers');
    openai = wrapOpenAI(openai);
  }

  if (typeof openai !== 'undefined') {
    return {
      completion: openai.chat.completions,
      style: 'openai',
    };
  }

  // Anthropic
  if (getAIConfig(MIDSCENE_USE_ANTHROPIC_SDK)) {
    const apiKey = getAIConfig(ANTHROPIC_API_KEY);
    assert(apiKey, 'ANTHROPIC_API_KEY is required');
    openai = new Anthropic({
      apiKey,
    }) as any;
  }

  if (typeof openai !== 'undefined' && (openai as any).messages) {
    return {
      completion: (openai as any).messages,
      style: 'anthropic',
    };
  }

  throw new Error('Openai SDK or Anthropic SDK is not initialized');
}

export async function call(
  messages: ChatCompletionMessageParam[],
  responseFormat?:
    | OpenAI.ChatCompletionCreateParams['response_format']
    | OpenAI.ResponseFormatJSONObject,
): Promise<{ content: string; usage?: AIUsageInfo }> {
  const { completion, style } = await createChatClient();
  const shouldPrintTiming =
    typeof getAIConfig(MIDSCENE_DEBUG_AI_PROFILE) === 'string';

  const maxTokens = getAIConfig(OPENAI_MAX_TOKENS);

  const startTime = Date.now();
  const model = getModelName();
  let content: string | undefined;
  let usage: OpenAI.CompletionUsage | undefined;
  const commonConfig = {
    temperature: 0.1,
    stream: false,
    max_tokens:
      typeof maxTokens === 'number'
        ? maxTokens
        : Number.parseInt(maxTokens || '2048', 10),
  };
  if (style === 'openai') {
    const result = await completion.create({
      model,
      messages,
      response_format: responseFormat,
      ...commonConfig,
      // betas: ['computer-use-2024-10-22'],
    } as any);
    shouldPrintTiming &&
      console.log(
        'Midscene - AI call',
        model,
        result.usage,
        `${Date.now() - startTime}ms`,
      );
    content = result.choices[0].message.content!;
    assert(content, 'empty content');
    usage = result.usage;
  } else if (style === 'anthropic') {
    const convertImageContent = (content: any) => {
      if (content.type === 'image_url') {
        const imgBase64 = content.image_url.url;
        assert(imgBase64, 'image_url is required');
        return {
          source: {
            type: 'base64',
            media_type: imgBase64.includes('data:image/png;base64,')
              ? 'image/png'
              : 'image/jpeg',
            data: imgBase64.split(',')[1],
          },
          type: 'image',
        };
      }
      return content;
    };

    const result = await completion.create({
      model,
      system: 'You are a versatile professional in software UI automation',
      messages: messages.map((m) => ({
        role: 'user',
        content: Array.isArray(m.content)
          ? (m.content as any).map(convertImageContent)
          : m.content,
      })),
      response_format: responseFormat,
      ...commonConfig,
    } as any);
    content = (result as any).content[0].text as string;
    assert(content, 'empty content');
    usage = result.usage;
  }

  return { content: content || '', usage };
}

export async function callToGetJSONObject<T>(
  messages: ChatCompletionMessageParam[],
  AIActionTypeValue: AIActionType,
): Promise<{ content: T; usage?: AIUsageInfo }> {
  // gpt-4o-2024-05-13 only supports json_object response format
  let responseFormat:
    | OpenAI.ChatCompletionCreateParams['response_format']
    | OpenAI.ResponseFormatJSONObject
    | undefined;

  const model = getModelName();

  if (model.includes('gpt-4o')) {
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
        responseFormat = { type: AIResponseFormat.JSON };
        break;
      case AIActionType.PLAN:
        responseFormat = planSchema;
        break;
    }

    if (model === 'gpt-4o-2024-05-13' || !responseFormat) {
      responseFormat = { type: AIResponseFormat.JSON };
    }
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

  const cleanJsonString = extractJSONFromCodeBlock(response.content);
  try {
    jsonContent = JSON.parse(cleanJsonString);
  } catch {}
  if (jsonContent) return { content: jsonContent, usage: response.usage };

  try {
    jsonContent = dJSON.parse(cleanJsonString);
  } catch {}
  if (jsonContent) return { content: jsonContent, usage: response.usage };

  throw Error(`failed to parse json response: ${response.content}`);
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
