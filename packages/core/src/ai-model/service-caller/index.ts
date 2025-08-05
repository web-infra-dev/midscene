import { AIResponseFormat, type AIUsageInfo } from '@/types';
import type { CodeGenerationChunk, StreamingCallback } from '@/types';
import { Anthropic } from '@anthropic-ai/sdk';
import {
  DefaultAzureCredential,
  getBearerTokenProvider,
} from '@azure/identity';
import {
  ANTHROPIC_API_KEY,
  AZURE_OPENAI_API_VERSION,
  AZURE_OPENAI_DEPLOYMENT,
  AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_KEY,
  MIDSCENE_API_TYPE,
  MIDSCENE_AZURE_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_AZURE_OPENAI_SCOPE,
  MIDSCENE_DEBUG_AI_PROFILE,
  MIDSCENE_DEBUG_AI_RESPONSE,
  MIDSCENE_LANGSMITH_DEBUG,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_OPENAI_HTTP_PROXY,
  MIDSCENE_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_OPENAI_SOCKS_PROXY,
  MIDSCENE_USE_ANTHROPIC_SDK,
  MIDSCENE_USE_AZURE_OPENAI,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  OPENAI_MAX_TOKENS,
  OPENAI_USE_AZURE,
  getAIConfig,
  getAIConfigInBoolean,
  getAIConfigInJson,
  uiTarsModelVersion,
  vlLocateMode,
} from '@midscene/shared/env';
import { enableDebug, getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import { ifInBrowser } from '@midscene/shared/utils';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { jsonrepair } from 'jsonrepair';
import OpenAI, { AzureOpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources';
import type { Stream } from 'openai/streaming';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { AIActionType, type AIArgs } from '../common';
import { assertSchema } from '../prompt/assertion';
import { locatorSchema } from '../prompt/llm-locator';
import { planSchema } from '../prompt/llm-planning';

export function checkAIConfig() {
  const openaiKey = getAIConfig(OPENAI_API_KEY);
  const azureConfig = getAIConfig(MIDSCENE_USE_AZURE_OPENAI);
  const anthropicKey = getAIConfig(ANTHROPIC_API_KEY);
  const initConfigJson = getAIConfig(MIDSCENE_OPENAI_INIT_CONFIG_JSON);

  if (openaiKey) return true;
  if (azureConfig) return true;
  if (anthropicKey) return true;

  return Boolean(initConfigJson);
}

// if debug config is initialized
let debugConfigInitialized = false;

function initDebugConfig() {
  // if debug config is initialized, return
  if (debugConfigInitialized) return;

  const shouldPrintTiming = getAIConfigInBoolean(MIDSCENE_DEBUG_AI_PROFILE);
  let debugConfig = '';
  if (shouldPrintTiming) {
    console.warn(
      'MIDSCENE_DEBUG_AI_PROFILE is deprecated, use DEBUG=midscene:ai:profile instead',
    );
    debugConfig = 'ai:profile';
  }
  const shouldPrintAIResponse = getAIConfigInBoolean(
    MIDSCENE_DEBUG_AI_RESPONSE,
  );
  if (shouldPrintAIResponse) {
    console.warn(
      'MIDSCENE_DEBUG_AI_RESPONSE is deprecated, use DEBUG=midscene:ai:response instead',
    );
    if (debugConfig) {
      debugConfig = 'ai:*';
    } else {
      debugConfig = 'ai:call';
    }
  }
  if (debugConfig) {
    enableDebug(debugConfig);
  }

  // mark as initialized
  debugConfigInitialized = true;
}

// default model
const defaultModel = 'gpt-4o';
export function getModelName() {
  let modelName = defaultModel;
  const nameInConfig = getAIConfig(MIDSCENE_MODEL_NAME);
  if (nameInConfig) {
    modelName = nameInConfig;
  }
  return modelName;
}

async function createChatClient({
  AIActionTypeValue,
}: {
  AIActionTypeValue: AIActionType;
}): Promise<{
  completion: OpenAI.Chat.Completions;
  style: 'openai' | 'anthropic';
}> {
  initDebugConfig();
  let openai: OpenAI | AzureOpenAI | undefined;
  const extraConfig = getAIConfigInJson(MIDSCENE_OPENAI_INIT_CONFIG_JSON);

  const socksProxy = getAIConfig(MIDSCENE_OPENAI_SOCKS_PROXY);
  const httpProxy = getAIConfig(MIDSCENE_OPENAI_HTTP_PROXY);

  let proxyAgent = undefined;
  const debugProxy = getDebug('ai:call:proxy');
  if (httpProxy) {
    debugProxy('using http proxy', httpProxy);
    proxyAgent = new HttpsProxyAgent(httpProxy);
  } else if (socksProxy) {
    debugProxy('using socks proxy', socksProxy);
    proxyAgent = new SocksProxyAgent(socksProxy);
  }

  if (getAIConfig(OPENAI_USE_AZURE)) {
    // this is deprecated
    openai = new AzureOpenAI({
      baseURL: getAIConfig(OPENAI_BASE_URL),
      apiKey: getAIConfig(OPENAI_API_KEY),
      httpAgent: proxyAgent,
      ...extraConfig,
      dangerouslyAllowBrowser: true,
    }) as OpenAI;
  } else if (getAIConfig(MIDSCENE_USE_AZURE_OPENAI)) {
    const extraAzureConfig = getAIConfigInJson(
      MIDSCENE_AZURE_OPENAI_INIT_CONFIG_JSON,
    );

    // https://learn.microsoft.com/en-us/azure/ai-services/openai/chatgpt-quickstart?tabs=bash%2Cjavascript-key%2Ctypescript-keyless%2Cpython&pivots=programming-language-javascript#rest-api
    // keyless authentication
    const scope = getAIConfig(MIDSCENE_AZURE_OPENAI_SCOPE);
    let tokenProvider: any = undefined;
    if (scope) {
      assert(
        !ifInBrowser,
        'Azure OpenAI is not supported in browser with Midscene.',
      );
      const credential = new DefaultAzureCredential();

      assert(scope, 'MIDSCENE_AZURE_OPENAI_SCOPE is required');
      tokenProvider = getBearerTokenProvider(credential, scope);

      openai = new AzureOpenAI({
        azureADTokenProvider: tokenProvider,
        endpoint: getAIConfig(AZURE_OPENAI_ENDPOINT),
        apiVersion: getAIConfig(AZURE_OPENAI_API_VERSION),
        deployment: getAIConfig(AZURE_OPENAI_DEPLOYMENT),
        ...extraConfig,
        ...extraAzureConfig,
      });
    } else {
      // endpoint, apiKey, apiVersion, deployment
      openai = new AzureOpenAI({
        apiKey: getAIConfig(AZURE_OPENAI_KEY),
        endpoint: getAIConfig(AZURE_OPENAI_ENDPOINT),
        apiVersion: getAIConfig(AZURE_OPENAI_API_VERSION),
        deployment: getAIConfig(AZURE_OPENAI_DEPLOYMENT),
        dangerouslyAllowBrowser: true,
        ...extraConfig,
        ...extraAzureConfig,
      });
    }
  } else if (!getAIConfig(MIDSCENE_USE_ANTHROPIC_SDK)) {
    const baseURL = getAIConfig(OPENAI_BASE_URL);
    if (typeof baseURL === 'string') {
      if (!/^https?:\/\//.test(baseURL)) {
        throw new Error(
          `OPENAI_BASE_URL must be a valid URL starting with http:// or https://, but got: ${baseURL}\nPlease check your config.`,
        );
      }
    }

    openai = new OpenAI({
      baseURL: getAIConfig(OPENAI_BASE_URL),
      apiKey: getAIConfig(OPENAI_API_KEY),
      httpAgent: proxyAgent,
      ...extraConfig,
      defaultHeaders: {
        ...(extraConfig?.defaultHeaders || {}),
        [MIDSCENE_API_TYPE]: AIActionTypeValue.toString(),
      },
      dangerouslyAllowBrowser: true,
    });
  }

  if (openai && getAIConfigInBoolean(MIDSCENE_LANGSMITH_DEBUG)) {
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
      httpAgent: proxyAgent,
      dangerouslyAllowBrowser: true,
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
  AIActionTypeValue: AIActionType,
  responseFormat?:
    | OpenAI.ChatCompletionCreateParams['response_format']
    | OpenAI.ResponseFormatJSONObject,
  options?: {
    stream?: boolean;
    onChunk?: StreamingCallback;
  },
): Promise<{ content: string; usage?: AIUsageInfo; isStreamed: boolean }> {
  assert(
    checkAIConfig(),
    'Cannot find config for AI model service. If you are using a self-hosted model without validating the API key, please set `OPENAI_API_KEY` to any non-null value. https://midscenejs.com/model-provider.html',
  );

  const { completion, style } = await createChatClient({
    AIActionTypeValue,
  });

  const maxTokens = getAIConfig(OPENAI_MAX_TOKENS);
  const debugCall = getDebug('ai:call');
  const debugProfileStats = getDebug('ai:profile:stats');
  const debugProfileDetail = getDebug('ai:profile:detail');

  const startTime = Date.now();
  const model = getModelName();
  const isStreaming = options?.stream && options?.onChunk;
  let content: string | undefined;
  let accumulated = '';
  let usage: OpenAI.CompletionUsage | undefined;
  let timeCost: number | undefined;

  const commonConfig = {
    temperature: vlLocateMode() === 'vlm-ui-tars' ? 0.0 : 0.1,
    stream: !!isStreaming,
    max_tokens:
      typeof maxTokens === 'number'
        ? maxTokens
        : Number.parseInt(maxTokens || '2048', 10),
    ...(vlLocateMode() === 'qwen-vl' // qwen specific config
      ? {
          vl_high_resolution_images: true,
        }
      : {}),
  };

  try {
    if (style === 'openai') {
      debugCall(
        `sending ${isStreaming ? 'streaming ' : ''}request to ${model}`,
      );

      if (isStreaming) {
        const stream = (await completion.create(
          {
            model,
            messages,
            response_format: responseFormat,
            ...commonConfig,
          },
          {
            stream: true,
          },
        )) as Stream<OpenAI.Chat.Completions.ChatCompletionChunk> & {
          _request_id?: string | null;
        };

        for await (const chunk of stream) {
          const content = chunk.choices?.[0]?.delta?.content || '';
          const reasoning_content =
            (chunk.choices?.[0]?.delta as any)?.reasoning_content || '';

          // Check for usage info in any chunk (OpenAI provides usage in separate chunks)
          if (chunk.usage) {
            usage = chunk.usage;
          }

          if (content || reasoning_content) {
            accumulated += content;
            const chunkData: CodeGenerationChunk = {
              content,
              reasoning_content,
              accumulated,
              isComplete: false,
              usage: undefined,
            };
            options.onChunk!(chunkData);
          }

          // Check if stream is complete
          if (chunk.choices?.[0]?.finish_reason) {
            timeCost = Date.now() - startTime;

            // If usage is not available from the stream, provide a basic usage info
            if (!usage) {
              // Estimate token counts based on content length (rough approximation)
              const estimatedTokens = Math.max(
                1,
                Math.floor(accumulated.length / 4),
              );
              usage = {
                prompt_tokens: estimatedTokens,
                completion_tokens: estimatedTokens,
                total_tokens: estimatedTokens * 2,
              };
            }

            // Send final chunk
            const finalChunk: CodeGenerationChunk = {
              content: '',
              accumulated,
              reasoning_content: '',
              isComplete: true,
              usage: {
                prompt_tokens: usage.prompt_tokens ?? 0,
                completion_tokens: usage.completion_tokens ?? 0,
                total_tokens: usage.total_tokens ?? 0,
                time_cost: timeCost ?? 0,
              },
            };
            options.onChunk!(finalChunk);
            break;
          }
        }
        content = accumulated;
        debugProfileStats(
          `streaming model, ${model}, mode, ${vlLocateMode() || 'default'}, cost-ms, ${timeCost}`,
        );
      } else {
        const result = await completion.create({
          model,
          messages,
          response_format: responseFormat,
          ...commonConfig,
        } as any);
        timeCost = Date.now() - startTime;

        debugProfileStats(
          `model, ${model}, mode, ${vlLocateMode() || 'default'}, ui-tars-version, ${uiTarsModelVersion()}, prompt-tokens, ${result.usage?.prompt_tokens || ''}, completion-tokens, ${result.usage?.completion_tokens || ''}, total-tokens, ${result.usage?.total_tokens || ''}, cost-ms, ${timeCost}, requestId, ${result._request_id || ''}`,
        );

        debugProfileDetail(
          `model usage detail: ${JSON.stringify(result.usage)}`,
        );

        assert(
          result.choices,
          `invalid response from LLM service: ${JSON.stringify(result)}`,
        );
        content = result.choices[0].message.content!;
        usage = result.usage;
      }

      debugCall(`response: ${content}`);
      assert(content, 'empty content');
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

      if (isStreaming) {
        const stream = (await completion.create({
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
        } as any)) as any;

        for await (const chunk of stream) {
          const content = chunk.delta?.text || '';
          if (content) {
            accumulated += content;
            const chunkData: CodeGenerationChunk = {
              content,
              accumulated,
              reasoning_content: '',
              isComplete: false,
              usage: undefined,
            };
            options.onChunk!(chunkData);
          }

          // Check if stream is complete
          if (chunk.type === 'message_stop') {
            timeCost = Date.now() - startTime;
            const anthropicUsage = chunk.usage;

            // Send final chunk
            const finalChunk: CodeGenerationChunk = {
              content: '',
              accumulated,
              reasoning_content: '',
              isComplete: true,
              usage: anthropicUsage
                ? {
                    prompt_tokens: anthropicUsage.input_tokens ?? 0,
                    completion_tokens: anthropicUsage.output_tokens ?? 0,
                    total_tokens:
                      (anthropicUsage.input_tokens ?? 0) +
                      (anthropicUsage.output_tokens ?? 0),
                    time_cost: timeCost ?? 0,
                  }
                : undefined,
            };
            options.onChunk!(finalChunk);
            break;
          }
        }
        content = accumulated;
      } else {
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
        timeCost = Date.now() - startTime;
        content = (result as any).content[0].text as string;
        usage = result.usage;
      }

      assert(content, 'empty content');
    }
    // Ensure we always have usage info for streaming responses
    if (isStreaming && !usage) {
      // Estimate token counts based on content length (rough approximation)
      const estimatedTokens = Math.max(
        1,
        Math.floor((content || '').length / 4),
      );
      usage = {
        prompt_tokens: estimatedTokens,
        completion_tokens: estimatedTokens,
        total_tokens: estimatedTokens * 2,
      };
    }

    return {
      content: content || '',
      usage: usage
        ? {
            prompt_tokens: usage.prompt_tokens ?? 0,
            completion_tokens: usage.completion_tokens ?? 0,
            total_tokens: usage.total_tokens ?? 0,
            time_cost: timeCost ?? 0,
          }
        : undefined,
      isStreamed: !!isStreaming,
    };
  } catch (e: any) {
    console.error(' call AI error', e);
    const newError = new Error(
      `failed to call ${isStreaming ? 'streaming ' : ''}AI model service: ${e.message}. Trouble shooting: https://midscenejs.com/model-provider.html`,
      {
        cause: e,
      },
    );
    throw newError;
  }
}

export async function callToGetJSONObject<T>(
  messages: ChatCompletionMessageParam[],
  AIActionTypeValue: AIActionType,
): Promise<{ content: T; usage?: AIUsageInfo }> {
  let responseFormat:
    | OpenAI.ChatCompletionCreateParams['response_format']
    | OpenAI.ResponseFormatJSONObject
    | undefined;

  const model = getModelName();

  if (model.includes('gpt-4')) {
    switch (AIActionTypeValue) {
      case AIActionType.ASSERT:
        responseFormat = assertSchema;
        break;
      case AIActionType.INSPECT_ELEMENT:
        responseFormat = locatorSchema;
        break;
      case AIActionType.PLAN:
        responseFormat = planSchema;
        break;
      case AIActionType.EXTRACT_DATA:
      case AIActionType.DESCRIBE_ELEMENT:
        responseFormat = { type: AIResponseFormat.JSON };
        break;
    }
  }

  // gpt-4o-2024-05-13 only supports json_object response format
  if (model === 'gpt-4o-2024-05-13') {
    responseFormat = { type: AIResponseFormat.JSON };
  }

  const response = await call(messages, AIActionTypeValue, responseFormat);
  assert(response, 'empty response');
  const jsonContent = safeParseJson(response.content);
  return { content: jsonContent, usage: response.usage };
}

export async function callAiFnWithStringResponse<T>(
  msgs: AIArgs,
  AIActionTypeValue: AIActionType,
): Promise<{ content: string; usage?: AIUsageInfo }> {
  const { content, usage } = await call(msgs, AIActionTypeValue);
  return { content, usage };
}

export function extractJSONFromCodeBlock(response: string) {
  try {
    // First, try to match a JSON object directly in the response
    const jsonMatch = response.match(/^\s*(\{[\s\S]*\})\s*$/);
    if (jsonMatch) {
      return jsonMatch[1];
    }

    // If no direct JSON object is found, try to extract JSON from a code block
    const codeBlockMatch = response.match(
      /```(?:json)?\s*(\{[\s\S]*?\})\s*```/,
    );
    if (codeBlockMatch) {
      return codeBlockMatch[1];
    }

    // If no code block is found, try to find a JSON-like structure in the text
    const jsonLikeMatch = response.match(/\{[\s\S]*\}/);
    if (jsonLikeMatch) {
      return jsonLikeMatch[0];
    }
  } catch {}
  // If no JSON-like structure is found, return the original response
  return response;
}

export function preprocessDoubaoBboxJson(input: string) {
  if (input.includes('bbox')) {
    // when its values like 940 445 969 490, replace all /\d+\s+\d+/g with /$1,$2/g
    while (/\d+\s+\d+/.test(input)) {
      input = input.replace(/(\d+)\s+(\d+)/g, '$1,$2');
    }
  }
  return input;
}

export function safeParseJson(input: string) {
  const cleanJsonString = extractJSONFromCodeBlock(input);
  // match the point
  if (cleanJsonString?.match(/\((\d+),(\d+)\)/)) {
    return cleanJsonString
      .match(/\((\d+),(\d+)\)/)
      ?.slice(1)
      .map(Number);
  }
  try {
    return JSON.parse(cleanJsonString);
  } catch {}
  try {
    return JSON.parse(jsonrepair(cleanJsonString));
  } catch (e) {}

  if (vlLocateMode() === 'doubao-vision' || vlLocateMode() === 'vlm-ui-tars') {
    const jsonString = preprocessDoubaoBboxJson(cleanJsonString);
    return JSON.parse(jsonrepair(jsonString));
  }
  throw Error(`failed to parse json response: ${input}`);
}
