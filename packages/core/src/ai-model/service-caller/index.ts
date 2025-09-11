import { AIResponseFormat, type AIUsageInfo } from '@/types';
import type { CodeGenerationChunk, StreamingCallback } from '@/types';
import {
  type IModelConfig,
  OPENAI_MAX_TOKENS,
  type TVlModeTypes,
  type UITarsModelVersion,
  globalConfigManager,
} from '@midscene/shared/env';

import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { jsonrepair } from 'jsonrepair';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { Stream } from 'openai/streaming';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { AIActionType, type AIArgs } from '../common';
import { assertSchema } from '../prompt/assertion';
import { planSchema } from '../prompt/llm-planning';

async function createChatClient({
  AIActionTypeValue,
  modelConfig,
}: {
  AIActionTypeValue: AIActionType;
  modelConfig: IModelConfig;
}): Promise<{
  completion: OpenAI.Chat.Completions;
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
    modelDescription,
    uiTarsModelVersion: uiTarsVersion,
    vlMode,
    createOpenAIClient,
  } = modelConfig;

  let proxyAgent = undefined;
  const debugProxy = getDebug('ai:call:proxy');
  if (httpProxy) {
    debugProxy('using http proxy', httpProxy);
    proxyAgent = new HttpsProxyAgent(httpProxy);
  } else if (socksProxy) {
    debugProxy('using socks proxy', socksProxy);
    proxyAgent = new SocksProxyAgent(socksProxy);
  }

  const openAIOptions = {
    baseURL: openaiBaseURL,
    apiKey: openaiApiKey,
    ...(proxyAgent ? { httpAgent: proxyAgent as any } : {}),
    ...openaiExtraConfig,
    dangerouslyAllowBrowser: true,
  };

  const baseOpenAI = new OpenAI(openAIOptions);

  let openai: OpenAI = baseOpenAI;

  if (createOpenAIClient) {
    const wrappedClient = await createOpenAIClient(baseOpenAI, openAIOptions);

    if (wrappedClient) {
      openai = wrappedClient as OpenAI;
    }
  }

  return {
    completion: openai.chat.completions,
    modelName,
    modelDescription,
    uiTarsVersion,
    vlMode,
  };
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
  const { completion, modelName, modelDescription, uiTarsVersion, vlMode } =
    await createChatClient({
      AIActionTypeValue,
      modelConfig,
    });

  const responseFormat = getResponseFormat(modelName, AIActionTypeValue);

  const maxTokens = globalConfigManager.getEnvConfigValue(OPENAI_MAX_TOKENS);
  const debugCall = getDebug('ai:call');
  const debugProfileStats = getDebug('ai:profile:stats');
  const debugProfileDetail = getDebug('ai:profile:detail');

  const startTime = Date.now();

  const isStreaming = options?.stream && options?.onChunk;
  let content: string | undefined;
  let accumulated = '';
  let usage: OpenAI.CompletionUsage | undefined;
  let timeCost: number | undefined;

  // Check if model is GPT-5 series (needs to use Responses API)
  const isGPT5Model = modelName.toLowerCase().includes('gpt-5');

  const maxTokensValue = typeof maxTokens === 'number'
    ? maxTokens
    : Number.parseInt(maxTokens || '2048', 10);

  if (isGPT5Model) {
    debugCall(`GPT-5 mode detected for model: ${modelName}, will use Responses API with max_completion_tokens`);
    debugCall(`Using max_completion_tokens: ${maxTokensValue}`);
  }

  const commonConfig = {
    temperature: vlMode === 'vlm-ui-tars' ? 0.0 : 0.1,
    stream: !!isStreaming,
    max_tokens: maxTokensValue,
    ...(vlMode === 'qwen-vl' // qwen vl v2 specific config
      ? {
          vl_high_resolution_images: true,
        }
      : {}),
  };

  try {
    debugCall(
      `sending ${isStreaming ? 'streaming ' : ''}request to ${modelName}`,
    );

    if (isStreaming) {
      // Prepare config based on whether it's GPT-5 (uses max_completion_tokens) or not
      const requestConfig = isGPT5Model
        ? {
            model: modelName,
            messages,
            response_format: responseFormat,
            // GPT-5 only supports default temperature (1)
            stream: true,
            max_completion_tokens: maxTokensValue, // GPT-5 uses max_completion_tokens
          }
        : {
            model: modelName,
            messages,
            response_format: responseFormat,
            ...commonConfig,
          };

      const stream = (await completion.create(
        requestConfig,
        {
          stream: true,
        },
      )) as Stream<OpenAI.Chat.Completions.ChatCompletionChunk> & {
        _request_id?: string | null;
      };

      for await (const chunk of stream) {
        let content = '';
        let reasoning_content = '';

        // Handle GPT-5 streaming format if it's different
        if (isGPT5Model && (chunk as any).output) {
          const outputMessage = (chunk as any).output?.[0];
          if (outputMessage?.content?.[0]?.text) {
            content = outputMessage.content[0].text;
          } else if (outputMessage?.content?.[0]?.output_text) {
            content = outputMessage.content[0].output_text.text;
          }
        } else {
          // Standard format
          content = chunk.choices?.[0]?.delta?.content || '';
          reasoning_content = (chunk.choices?.[0]?.delta as any)?.reasoning_content || '';
        }

        // Check for usage info in any chunk
        if (chunk.usage) {
          if (isGPT5Model) {
            // Map GPT-5 usage format
            usage = {
              prompt_tokens: (chunk.usage as any).input_tokens || 0,
              completion_tokens: (chunk.usage as any).output_tokens || 0,
              total_tokens: (chunk.usage as any).total_tokens || 0,
            };
          } else {
            usage = chunk.usage;
          }
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
        const isComplete = isGPT5Model
          ? ((chunk as any).status === 'completed' || (chunk as any).object === 'response')
          : chunk.choices?.[0]?.finish_reason;

        if (isComplete) {
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
      // Prepare config based on whether it's GPT-5 (uses max_completion_tokens) or not
      const requestConfig = isGPT5Model
        ? {
            model: modelName,
            messages,
            response_format: responseFormat,
            // GPT-5 only supports default temperature (1)
            max_completion_tokens: maxTokensValue, // GPT-5 uses max_completion_tokens
          }
        : {
            model: modelName,
            messages,
            response_format: responseFormat,
            ...commonConfig,
          };

      const result = await completion.create(requestConfig as any);
      timeCost = Date.now() - startTime;

      if (isGPT5Model) {
        debugCall(`GPT-5 raw response: ${JSON.stringify(result).substring(0, 500)}`);
      }

      // Handle GPT-5 Responses API response format
      if (isGPT5Model && (result as any).output) {
        // GPT-5 Responses API has a different structure
        debugCall(`GPT-5 Responses API response received`);

        const outputMessage = (result as any).output?.[0];
        if (outputMessage?.content?.[0]?.text) {
          content = outputMessage.content[0].text;
        } else if (outputMessage?.content?.[0]?.output_text) {
          content = outputMessage.content[0].output_text.text;
        }

        // Map usage from Responses API format
        if ((result as any).usage) {
          usage = {
            prompt_tokens: (result as any).usage.input_tokens || 0,
            completion_tokens: (result as any).usage.output_tokens || 0,
            total_tokens: (result as any).usage.total_tokens || 0,
          };
        }

        debugCall(`GPT-5 content extracted: ${content?.substring(0, 100)}...`);
      } else {
        // Standard OpenAI completions API response
        debugCall(`Standard response received, choices: ${result.choices?.length}`);

        assert(
          result.choices,
          `invalid response from LLM service: ${JSON.stringify(result)}`,
        );
        content = result.choices[0].message.content || result.choices[0].message?.function_call?.arguments || '';
        usage = result.usage;
      }

      debugProfileStats(
        `model, ${modelName}, mode, ${vlMode || 'default'}, ui-tars-version, ${uiTarsVersion}, prompt-tokens, ${usage?.prompt_tokens || ''}, completion-tokens, ${usage?.completion_tokens || ''}, total-tokens, ${usage?.total_tokens || ''}, cost-ms, ${timeCost}, requestId, ${result.id || result._request_id || ''}`,
      );

      debugProfileDetail(
        `model usage detail: ${JSON.stringify(usage)}`,
      );
    }

    debugCall(`response: ${content}`);
    assert(content, 'empty content');

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

  // Check for GPT-4 or GPT-5 models
  if (modelName.includes('gpt-4') || modelName.includes('gpt-5')) {
    switch (AIActionTypeValue) {
      case AIActionType.ASSERT:
        responseFormat = assertSchema;
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
