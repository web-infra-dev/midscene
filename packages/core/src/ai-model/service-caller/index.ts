import { AIResponseFormat, type AIUsageInfo } from '@/types';
import type { CodeGenerationChunk, StreamingCallback } from '@/types';
import { Anthropic } from '@anthropic-ai/sdk';
import {
  DefaultAzureCredential,
  getBearerTokenProvider,
} from '@azure/identity';
import {
  type IModelConfig,
  MIDSCENE_API_TYPE,
  MIDSCENE_LANGSMITH_DEBUG,
  OPENAI_MAX_TOKENS,
  MIDSCENE_MODEL_TEMPERATURE,
  type TVlModeTypes,
  type UITarsModelVersion,
  globalConfigManager,
} from '@midscene/shared/env';

import { parseBase64 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import { ifInBrowser } from '@midscene/shared/utils';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { jsonrepair } from 'jsonrepair';
import OpenAI, { AzureOpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { Stream } from 'openai/streaming';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { AIActionType, type AIArgs } from '../common';
import { assertSchema } from '../prompt/assertion';
import { locatorSchema } from '../prompt/llm-locator';
import { planSchema } from '../prompt/llm-planning';

async function createChatClient({
  AIActionTypeValue,
  modelConfig,
}: {
  AIActionTypeValue: AIActionType;
  modelConfig: IModelConfig;
}): Promise<{
  completion: OpenAI.Chat.Completions;
  style: 'openai' | 'anthropic';
  modelName: string;
  modelDescription: string;
  uiTarsVersion?: UITarsModelVersion;
  vlMode: TVlModeTypes | undefined;
}> {
  const {
    socksProxy,
    httpProxy,
    modelName,
    openaiBaseURL,
    openaiApiKey,
    openaiExtraConfig,
    openaiUseAzureDeprecated,
    useAzureOpenai,
    azureOpenaiScope,
    azureOpenaiKey,
    azureOpenaiEndpoint,
    azureOpenaiApiVersion,
    azureOpenaiDeployment,
    azureExtraConfig,
    useAnthropicSdk,
    anthropicApiKey,
    modelDescription,
    uiTarsModelVersion: uiTarsVersion,
    vlMode,
  } = modelConfig;

  let openai: OpenAI | AzureOpenAI | undefined;

  let proxyAgent = undefined;
  const debugProxy = getDebug('ai:call:proxy');
  if (httpProxy) {
    debugProxy('using http proxy', httpProxy);
    proxyAgent = new HttpsProxyAgent(httpProxy);
  } else if (socksProxy) {
    debugProxy('using socks proxy', socksProxy);
    proxyAgent = new SocksProxyAgent(socksProxy);
  }

  if (openaiUseAzureDeprecated) {
    // this is deprecated
    openai = new AzureOpenAI({
      baseURL: openaiBaseURL,
      apiKey: openaiApiKey,
      httpAgent: proxyAgent,
      ...openaiExtraConfig,
      dangerouslyAllowBrowser: true,
    }) as OpenAI;
  } else if (useAzureOpenai) {
    // https://learn.microsoft.com/en-us/azure/ai-services/openai/chatgpt-quickstart?tabs=bash%2Cjavascript-key%2Ctypescript-keyless%2Cpython&pivots=programming-language-javascript#rest-api
    // keyless authentication
    let tokenProvider: any = undefined;
    if (azureOpenaiScope) {
      assert(
        !ifInBrowser,
        'Azure OpenAI is not supported in browser with Midscene.',
      );
      const credential = new DefaultAzureCredential();

      tokenProvider = getBearerTokenProvider(credential, azureOpenaiScope);

      openai = new AzureOpenAI({
        azureADTokenProvider: tokenProvider,
        endpoint: azureOpenaiEndpoint,
        apiVersion: azureOpenaiApiVersion,
        deployment: azureOpenaiDeployment,
        ...openaiExtraConfig,
        ...azureExtraConfig,
      });
    } else {
      // endpoint, apiKey, apiVersion, deployment
      openai = new AzureOpenAI({
        apiKey: azureOpenaiKey,
        endpoint: azureOpenaiEndpoint,
        apiVersion: azureOpenaiApiVersion,
        deployment: azureOpenaiDeployment,
        dangerouslyAllowBrowser: true,
        ...openaiExtraConfig,
        ...azureExtraConfig,
      });
    }
  } else if (!useAnthropicSdk) {
    openai = new OpenAI({
      baseURL: openaiBaseURL,
      apiKey: openaiApiKey,
      httpAgent: proxyAgent,
      ...openaiExtraConfig,
      defaultHeaders: {
        ...(openaiExtraConfig?.defaultHeaders || {}),
        [MIDSCENE_API_TYPE]: AIActionTypeValue.toString(),
      },
      dangerouslyAllowBrowser: true,
    });
  }

  if (
    openai &&
    globalConfigManager.getEnvConfigInBoolean(MIDSCENE_LANGSMITH_DEBUG)
  ) {
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
      modelName,
      modelDescription,
      uiTarsVersion,
      vlMode,
    };
  }

  // Anthropic
  if (useAnthropicSdk) {
    openai = new Anthropic({
      apiKey: anthropicApiKey,
      httpAgent: proxyAgent,
      dangerouslyAllowBrowser: true,
    }) as any;
  }

  if (typeof openai !== 'undefined' && (openai as any).messages) {
    return {
      completion: (openai as any).messages,
      style: 'anthropic',
      modelName,
      modelDescription,
      uiTarsVersion,
      vlMode,
    };
  }

  throw new Error('Openai SDK or Anthropic SDK is not initialized');
}

export async function callAI(
  messages: ChatCompletionMessageParam[],
  AIActionTypeValue: AIActionType,
  modelConfig: IModelConfig,
  options?: {
    stream?: boolean;
    onChunk?: StreamingCallback;
  },
): Promise<{ content: string; usage?: AIUsageInfo; isStreamed: boolean }> {
  const {
    completion,
    style,
    modelName,
    modelDescription,
    uiTarsVersion,
    vlMode,
  } = await createChatClient({
    AIActionTypeValue,
    modelConfig,
  });

  const responseFormat = getResponseFormat(modelName, AIActionTypeValue);

  const maxTokens = globalConfigManager.getEnvConfigValue(OPENAI_MAX_TOKENS);
  const temperatureConfig =
    globalConfigManager.getEnvConfigValue(MIDSCENE_MODEL_TEMPERATURE);
  const debugCall = getDebug('ai:call');
  const debugProfileStats = getDebug('ai:profile:stats');
  const debugProfileDetail = getDebug('ai:profile:detail');

  const startTime = Date.now();

  const isStreaming = options?.stream && options?.onChunk;
  let content: string | undefined;
  let accumulated = '';
  let usage: OpenAI.CompletionUsage | undefined;
  let timeCost: number | undefined;

  const defaultTemperature = vlMode === 'vlm-ui-tars' ? 0.0 : 0.1;
  const parsedTemperature =
    temperatureConfig && temperatureConfig.trim() !== ''
      ? Number.parseFloat(temperatureConfig)
      : undefined;
  const commonConfig = {
    temperature:
      typeof parsedTemperature === 'number' && Number.isFinite(parsedTemperature)
        ? parsedTemperature
        : defaultTemperature,
    stream: !!isStreaming,
    max_tokens:
      typeof maxTokens === 'number'
        ? maxTokens
        : Number.parseInt(maxTokens || '2048', 10),
    ...(vlMode === 'qwen-vl' || vlMode === 'qwen3-vl' // qwen specific config
      ? {
          vl_high_resolution_images: true,
        }
      : {}),
  };

  try {
    if (style === 'openai') {
      debugCall(
        `sending ${isStreaming ? 'streaming ' : ''}request to ${modelName}`,
      );

      if (isStreaming) {
        const stream = (await completion.create(
          {
            model: modelName,
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
                model_name: modelName,
                model_description: modelDescription,
                intent: modelConfig.intent,
              },
            };
            options.onChunk!(finalChunk);
            break;
          }
        }
        content = accumulated;
        debugProfileStats(
          `streaming model, ${modelName}, mode, ${vlMode || 'default'}, cost-ms, ${timeCost}`,
        );
      } else {
        const result = await completion.create({
          model: modelName,
          messages,
          response_format: responseFormat,
          ...commonConfig,
        } as any);
        timeCost = Date.now() - startTime;

        debugProfileStats(
          `model, ${modelName}, mode, ${vlMode || 'default'}, ui-tars-version, ${uiTarsVersion}, prompt-tokens, ${result.usage?.prompt_tokens || ''}, completion-tokens, ${result.usage?.completion_tokens || ''}, total-tokens, ${result.usage?.total_tokens || ''}, cost-ms, ${timeCost}, requestId, ${result._request_id || ''}`,
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
          const { mimeType, body } = parseBase64(content.image_url.url);
          return {
            source: {
              type: 'base64',
              media_type: mimeType,
              data: body,
            },
            type: 'image',
          };
        }
        return content;
      };

      if (isStreaming) {
        const stream = (await completion.create({
          model: modelName,
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
                    model_name: modelName,
                    model_description: modelDescription,
                    intent: modelConfig.intent,
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
          model: modelName,
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
            model_name: modelName,
            model_description: modelDescription,
            intent: modelConfig.intent,
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

export const getResponseFormat = (
  modelName: string,
  AIActionTypeValue: AIActionType,
):
  | OpenAI.ChatCompletionCreateParams['response_format']
  | OpenAI.ResponseFormatJSONObject => {
  let responseFormat:
    | OpenAI.ChatCompletionCreateParams['response_format']
    | OpenAI.ResponseFormatJSONObject
    | undefined;

  if (modelName.includes('gpt-4')) {
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
      case AIActionType.TEXT:
        // No response format for plain text - return as-is
        responseFormat = undefined;
        break;
    }
  }

  // gpt-4o-2024-05-13 only supports json_object response format
  // Skip for plain text to allow string output
  if (
    modelName === 'gpt-4o-2024-05-13' &&
    AIActionTypeValue !== AIActionType.TEXT
  ) {
    responseFormat = { type: AIResponseFormat.JSON };
  }

  return responseFormat;
};

export async function callAIWithObjectResponse<T>(
  messages: ChatCompletionMessageParam[],
  AIActionTypeValue: AIActionType,
  modelConfig: IModelConfig,
): Promise<{ content: T; usage?: AIUsageInfo }> {
  const response = await callAI(messages, AIActionTypeValue, modelConfig);
  assert(response, 'empty response');
  const vlMode = modelConfig.vlMode;
  const jsonContent = safeParseJson(response.content, vlMode);
  return { content: jsonContent, usage: response.usage };
}

export async function callAIWithStringResponse(
  msgs: AIArgs,
  AIActionTypeValue: AIActionType,
  modelConfig: IModelConfig,
): Promise<{ content: string; usage?: AIUsageInfo }> {
  const { content, usage } = await callAI(msgs, AIActionTypeValue, modelConfig);
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

export function safeParseJson(input: string, vlMode: TVlModeTypes | undefined) {
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

  if (vlMode === 'doubao-vision' || vlMode === 'vlm-ui-tars') {
    const jsonString = preprocessDoubaoBboxJson(cleanJsonString);
    return JSON.parse(jsonrepair(jsonString));
  }
  throw Error(`failed to parse json response: ${input}`);
}
