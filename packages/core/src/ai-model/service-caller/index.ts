import type { AIUsageInfo, DeepThinkOption } from '@/types';
import type { CodeGenerationChunk, StreamingCallback } from '@/types';

// Error class that preserves usage and rawResponse when AI call parsing fails
export class AIResponseParseError extends Error {
  usage?: AIUsageInfo;
  rawResponse: string;

  constructor(message: string, rawResponse: string, usage?: AIUsageInfo) {
    super(message);
    this.name = 'AIResponseParseError';
    this.rawResponse = rawResponse;
    this.usage = usage;
  }
}
import {
  type IModelConfig,
  MIDSCENE_LANGFUSE_DEBUG,
  MIDSCENE_LANGSMITH_DEBUG,
  MIDSCENE_MODEL_MAX_TOKENS,
  OPENAI_MAX_TOKENS,
  type TModelFamily,
  type UITarsModelVersion,
  globalConfigManager,
} from '@midscene/shared/env';

import { getDebug } from '@midscene/shared/logger';
import { assert, ifInBrowser } from '@midscene/shared/utils';
import { jsonrepair } from 'jsonrepair';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { Stream } from 'openai/streaming';
import type { AIArgs } from '../../common';
import { isAutoGLM, isUITars } from '../auto-glm/util';

async function createChatClient({
  modelConfig,
}: {
  modelConfig: IModelConfig;
}): Promise<{
  completion: OpenAI.Chat.Completions;
  modelName: string;
  modelDescription: string;
  uiTarsModelVersion?: UITarsModelVersion;
  modelFamily: TModelFamily | undefined;
}> {
  const {
    socksProxy,
    httpProxy,
    modelName,
    openaiBaseURL,
    openaiApiKey,
    openaiExtraConfig,
    modelDescription,
    uiTarsModelVersion,
    modelFamily,
    createOpenAIClient,
    timeout,
  } = modelConfig;

  let proxyAgent: any = undefined;
  const warnClient = getDebug('ai:call', { console: true });
  const debugProxy = getDebug('ai:call:proxy');
  const warnProxy = getDebug('ai:call:proxy', { console: true });

  // Helper function to sanitize proxy URL for logging (remove credentials)
  // Uses URL API instead of regex to avoid ReDoS vulnerabilities
  const sanitizeProxyUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      if (parsed.username) {
        // Keep username for debugging, hide password for security
        parsed.password = '****';
        return parsed.href;
      }
      return url;
    } catch {
      // If URL parsing fails, return original URL (will be caught later)
      return url;
    }
  };

  if (httpProxy) {
    debugProxy('using http proxy', sanitizeProxyUrl(httpProxy));
    if (ifInBrowser) {
      warnProxy(
        'HTTP proxy is configured but not supported in browser environment',
      );
    } else {
      // Dynamic import with variable to avoid bundler static analysis
      const moduleName = 'undici';
      const { ProxyAgent } = await import(moduleName);
      proxyAgent = new ProxyAgent({
        uri: httpProxy,
        // Note: authentication is handled via the URI (e.g., http://user:pass@proxy.com:8080)
      });
    }
  } else if (socksProxy) {
    debugProxy('using socks proxy', sanitizeProxyUrl(socksProxy));
    if (ifInBrowser) {
      warnProxy(
        'SOCKS proxy is configured but not supported in browser environment',
      );
    } else {
      try {
        // Dynamic import with variable to avoid bundler static analysis
        const moduleName = 'fetch-socks';
        const { socksDispatcher } = await import(moduleName);
        // Parse SOCKS proxy URL (e.g., socks5://127.0.0.1:1080)
        const proxyUrl = new URL(socksProxy);

        // Validate hostname
        if (!proxyUrl.hostname) {
          throw new Error('SOCKS proxy URL must include a valid hostname');
        }

        // Validate and parse port
        const port = Number.parseInt(proxyUrl.port, 10);
        if (!proxyUrl.port || Number.isNaN(port)) {
          throw new Error('SOCKS proxy URL must include a valid port');
        }

        // Parse SOCKS version from protocol
        const protocol = proxyUrl.protocol.replace(':', '');
        const socksType =
          protocol === 'socks4' ? 4 : protocol === 'socks5' ? 5 : 5;

        proxyAgent = socksDispatcher({
          type: socksType,
          host: proxyUrl.hostname,
          port,
          ...(proxyUrl.username
            ? {
                userId: decodeURIComponent(proxyUrl.username),
                password: decodeURIComponent(proxyUrl.password || ''),
              }
            : {}),
        });
        debugProxy('socks proxy configured successfully', {
          type: socksType,
          host: proxyUrl.hostname,
          port: port,
        });
      } catch (error) {
        warnProxy('Failed to configure SOCKS proxy:', error);
        throw new Error(
          `Invalid SOCKS proxy URL: ${socksProxy}. Expected format: socks4://host:port, socks5://host:port, or with authentication: socks5://user:pass@host:port`,
        );
      }
    }
  }

  const openAIOptions = {
    baseURL: openaiBaseURL,
    apiKey: openaiApiKey,
    // Use fetchOptions.dispatcher for fetch-based SDK instead of httpAgent
    // Note: Type assertion needed due to undici version mismatch between dependencies
    ...(proxyAgent ? { fetchOptions: { dispatcher: proxyAgent as any } } : {}),
    ...openaiExtraConfig,
    ...(typeof timeout === 'number' ? { timeout } : {}),
    dangerouslyAllowBrowser: true,
  };

  const baseOpenAI = new OpenAI(openAIOptions);

  let openai: OpenAI = baseOpenAI;

  // LangSmith wrapper
  if (
    openai &&
    globalConfigManager.getEnvConfigInBoolean(MIDSCENE_LANGSMITH_DEBUG)
  ) {
    if (ifInBrowser) {
      throw new Error('langsmith is not supported in browser');
    }
    warnClient('DEBUGGING MODE: langsmith wrapper enabled');
    // Use variable to prevent static analysis by bundlers
    const langsmithModule = 'langsmith/wrappers';
    const { wrapOpenAI } = await import(langsmithModule);
    openai = wrapOpenAI(openai);
  }

  // Langfuse wrapper
  if (
    openai &&
    globalConfigManager.getEnvConfigInBoolean(MIDSCENE_LANGFUSE_DEBUG)
  ) {
    if (ifInBrowser) {
      throw new Error('langfuse is not supported in browser');
    }
    warnClient('DEBUGGING MODE: langfuse wrapper enabled');
    // Use variable to prevent static analysis by bundlers
    const langfuseModule = '@langfuse/openai';
    const { observeOpenAI } = await import(langfuseModule);
    openai = observeOpenAI(openai);
  }

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
    uiTarsModelVersion,
    modelFamily,
  };
}

export async function callAI(
  messages: ChatCompletionMessageParam[],
  modelConfig: IModelConfig,
  options?: {
    stream?: boolean;
    onChunk?: StreamingCallback;
    deepThink?: DeepThinkOption;
  },
): Promise<{
  content: string;
  reasoning_content?: string;
  usage?: AIUsageInfo;
  isStreamed: boolean;
}> {
  const {
    completion,
    modelName,
    modelDescription,
    uiTarsModelVersion,
    modelFamily,
  } = await createChatClient({
    modelConfig,
  });

  const maxTokens =
    globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_MODEL_MAX_TOKENS) ??
    globalConfigManager.getEnvConfigValueAsNumber(OPENAI_MAX_TOKENS);
  const debugCall = getDebug('ai:call');
  const warnCall = getDebug('ai:call', { console: true });
  const debugProfileStats = getDebug('ai:profile:stats');
  const debugProfileDetail = getDebug('ai:profile:detail');

  const startTime = Date.now();
  const temperature = modelConfig.temperature ?? 0;

  const isStreaming = options?.stream && options?.onChunk;
  let content: string | undefined;
  let accumulated = '';
  let accumulatedReasoning = '';
  let usage: OpenAI.CompletionUsage | undefined;
  let timeCost: number | undefined;
  let requestId: string | null | undefined;

  const buildUsageInfo = (
    usageData?: OpenAI.CompletionUsage,
    requestId?: string | null,
  ) => {
    if (!usageData) return undefined;

    const cachedInputTokens = (
      usageData as { prompt_tokens_details?: { cached_tokens?: number } }
    )?.prompt_tokens_details?.cached_tokens;

    return {
      prompt_tokens: usageData.prompt_tokens ?? 0,
      completion_tokens: usageData.completion_tokens ?? 0,
      total_tokens: usageData.total_tokens ?? 0,
      cached_input: cachedInputTokens ?? 0,
      time_cost: timeCost ?? 0,
      model_name: modelName,
      model_description: modelDescription,
      intent: modelConfig.intent,
      request_id: requestId ?? undefined,
    } satisfies AIUsageInfo;
  };

  const commonConfig = {
    temperature,
    stream: !!isStreaming,
    max_tokens: maxTokens,
    ...(modelFamily === 'qwen2.5-vl' // qwen vl v2 specific config
      ? {
          vl_high_resolution_images: true,
        }
      : {}),
    ...(modelFamily === 'doubao-vision' && modelConfig.reasoningEffort
      ? {
          reasoning_effort: modelConfig.reasoningEffort as
            | 'minimal'
            | 'low'
            | 'medium'
            | 'high',
        }
      : {}),
  };

  if (isAutoGLM(modelFamily)) {
    (commonConfig as unknown as Record<string, number>).top_p = 0.85;
    (commonConfig as unknown as Record<string, number>).frequency_penalty = 0.2;
  }

  const {
    config: deepThinkConfig,
    debugMessage,
    warningMessage,
  } = resolveDeepThinkConfig({
    deepThink: options?.deepThink,
    modelFamily,
  });
  if (debugMessage) {
    debugCall(debugMessage);
  }
  if (warningMessage) {
    warnCall(warningMessage);
  }

  try {
    debugCall(
      `sending ${isStreaming ? 'streaming ' : ''}request to ${modelName}`,
    );

    if (isStreaming) {
      const stream = (await completion.create(
        {
          model: modelName,
          messages,
          ...commonConfig,
          ...deepThinkConfig,
        },
        {
          stream: true,
        },
      )) as Stream<OpenAI.Chat.Completions.ChatCompletionChunk> & {
        _request_id?: string | null;
      };

      requestId = stream._request_id;

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
          accumulatedReasoning += reasoning_content;
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
            usage: buildUsageInfo(usage, requestId),
          };
          options.onChunk!(finalChunk);
          break;
        }
      }
      content = accumulated;
      debugProfileStats(
        `streaming model, ${modelName}, mode, ${modelFamily || 'default'}, cost-ms, ${timeCost}, temperature, ${temperature ?? ''}`,
      );
    } else {
      // Non-streaming with retry logic
      const retryCount = modelConfig.retryCount ?? 1;
      const retryInterval = modelConfig.retryInterval ?? 2000;
      const maxAttempts = retryCount + 1; // retryCount=1 means 2 total attempts (1 initial + 1 retry)

      let lastError: Error | undefined;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await completion.create({
            model: modelName,
            messages,
            ...commonConfig,
            ...deepThinkConfig,
          } as any);

          timeCost = Date.now() - startTime;

          debugProfileStats(
            `model, ${modelName}, mode, ${modelFamily || 'default'}, ui-tars-version, ${uiTarsModelVersion}, prompt-tokens, ${result.usage?.prompt_tokens || ''}, completion-tokens, ${result.usage?.completion_tokens || ''}, total-tokens, ${result.usage?.total_tokens || ''}, cost-ms, ${timeCost}, requestId, ${result._request_id || ''}, temperature, ${temperature ?? ''}`,
          );

          debugProfileDetail(
            `model usage detail: ${JSON.stringify(result.usage)}`,
          );

          if (!result.choices) {
            throw new Error(
              `invalid response from LLM service: ${JSON.stringify(result)}`,
            );
          }

          content = result.choices[0].message.content!;
          accumulatedReasoning =
            (result.choices[0].message as any)?.reasoning_content || '';
          usage = result.usage;
          requestId = result._request_id;

          if (
            !content &&
            accumulatedReasoning &&
            modelFamily === 'doubao-vision'
          ) {
            warnCall('empty content from AI model, using reasoning content');
            content = accumulatedReasoning;
          }

          if (!content) {
            throw new Error('empty content from AI model');
          }

          break; // Success, exit retry loop
        } catch (error) {
          lastError = error as Error;
          if (attempt < maxAttempts) {
            warnCall(
              `AI call failed (attempt ${attempt}/${maxAttempts}), retrying in ${retryInterval}ms... Error: ${lastError.message}`,
            );
            await new Promise((resolve) => setTimeout(resolve, retryInterval));
          }
        }
      }

      if (!content) {
        throw lastError;
      }
    }

    debugCall(`response reasoning content: ${accumulatedReasoning}`);
    debugCall(`response content: ${content}`);

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
      } as OpenAI.CompletionUsage;
    }

    return {
      content: content || '',
      reasoning_content: accumulatedReasoning || undefined,
      usage: buildUsageInfo(usage, requestId),
      isStreamed: !!isStreaming,
    };
  } catch (e: any) {
    warnCall('call AI error', e);
    const newError = new Error(
      `failed to call ${isStreaming ? 'streaming ' : ''}AI model service (${modelName}): ${e.message}\nTrouble shooting: https://midscenejs.com/model-provider.html`,
      {
        cause: e,
      },
    );
    throw newError;
  }
}

export async function callAIWithObjectResponse<T>(
  messages: ChatCompletionMessageParam[],
  modelConfig: IModelConfig,
  options?: {
    deepThink?: DeepThinkOption;
  },
): Promise<{
  content: T;
  contentString: string;
  usage?: AIUsageInfo;
  reasoning_content?: string;
}> {
  const response = await callAI(messages, modelConfig, {
    deepThink: options?.deepThink,
  });
  assert(response, 'empty response');
  const modelFamily = modelConfig.modelFamily;
  const jsonContent = safeParseJson(response.content, modelFamily);
  if (typeof jsonContent !== 'object') {
    throw new AIResponseParseError(
      `failed to parse json response from model (${modelConfig.modelName}): ${response.content}`,
      response.content,
      response.usage,
    );
  }
  return {
    content: jsonContent,
    contentString: response.content,
    usage: response.usage,
    reasoning_content: response.reasoning_content,
  };
}

export async function callAIWithStringResponse(
  msgs: AIArgs,
  modelConfig: IModelConfig,
): Promise<{ content: string; usage?: AIUsageInfo }> {
  const { content, usage } = await callAI(msgs, modelConfig);
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

export function resolveDeepThinkConfig({
  deepThink,
  modelFamily,
}: {
  deepThink?: DeepThinkOption;
  modelFamily?: TModelFamily;
}): {
  config: Record<string, unknown>;
  debugMessage?: string;
  warningMessage?: string;
} {
  const normalizedDeepThink = deepThink === 'unset' ? undefined : deepThink;

  if (normalizedDeepThink === undefined) {
    return { config: {}, debugMessage: undefined };
  }

  if (modelFamily === 'qwen3-vl') {
    return {
      config: { enable_thinking: normalizedDeepThink },
      debugMessage: `deepThink mapped to enable_thinking=${normalizedDeepThink} for qwen3-vl`,
    };
  }

  if (modelFamily === 'doubao-vision') {
    return {
      config: {
        thinking: { type: normalizedDeepThink ? 'enabled' : 'disabled' },
      },
      debugMessage: `deepThink mapped to thinking.type=${normalizedDeepThink ? 'enabled' : 'disabled'} for doubao-vision`,
    };
  }

  if (modelFamily === 'glm-v') {
    return {
      config: {
        thinking: { type: normalizedDeepThink ? 'enabled' : 'disabled' },
      },
      debugMessage: `deepThink mapped to thinking.type=${normalizedDeepThink ? 'enabled' : 'disabled'} for glm-v`,
    };
  }

  if (modelFamily === 'gpt-5') {
    return {
      config: normalizedDeepThink
        ? {
            reasoning: { effort: 'high' },
          }
        : {
            reasoning: { effort: 'low' },
          },
      debugMessage: normalizedDeepThink
        ? 'deepThink mapped to reasoning.effort=high for gpt-5'
        : 'deepThink disabled for gpt-5',
    };
  }

  return {
    config: {},
    debugMessage: `deepThink ignored: unsupported model_family "${modelFamily ?? 'default'}"`,
    warningMessage: `The "deepThink" option is not supported for model_family "${modelFamily ?? 'default'}".`,
  };
}

/**
 * Normalize a parsed JSON object by trimming whitespace from:
 * 1. All object keys (e.g., " prompt " -> "prompt")
 * 2. All string values (e.g., " Tap " -> "Tap")
 * This handles LLM output that may include leading/trailing spaces.
 */
function normalizeJsonObject(obj: any): any {
  // Handle null and undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays - recursively normalize each element
  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeJsonObject(item));
  }

  // Handle objects
  if (typeof obj === 'object') {
    const normalized: any = {};

    for (const [key, value] of Object.entries(obj)) {
      // Trim the key to remove leading/trailing spaces
      const trimmedKey = key.trim();

      // Recursively normalize the value
      let normalizedValue = normalizeJsonObject(value);

      // Trim all string values
      if (typeof normalizedValue === 'string') {
        normalizedValue = normalizedValue.trim();
      }

      normalized[trimmedKey] = normalizedValue;
    }

    return normalized;
  }

  // Handle primitive strings
  if (typeof obj === 'string') {
    return obj.trim();
  }

  // Return other primitives as-is
  return obj;
}

export function safeParseJson(
  input: string,
  modelFamily: TModelFamily | undefined,
) {
  const cleanJsonString = extractJSONFromCodeBlock(input);
  // match the point
  if (cleanJsonString?.match(/\((\d+),(\d+)\)/)) {
    return cleanJsonString
      .match(/\((\d+),(\d+)\)/)
      ?.slice(1)
      .map(Number);
  }

  let parsed: any;
  let lastError: unknown;
  try {
    parsed = JSON.parse(cleanJsonString);
    return normalizeJsonObject(parsed);
  } catch (error) {
    lastError = error;
  }
  try {
    parsed = JSON.parse(jsonrepair(cleanJsonString));
    return normalizeJsonObject(parsed);
  } catch (error) {
    lastError = error;
  }

  if (modelFamily === 'doubao-vision' || isUITars(modelFamily)) {
    const jsonString = preprocessDoubaoBboxJson(cleanJsonString);
    try {
      parsed = JSON.parse(jsonrepair(jsonString));
      return normalizeJsonObject(parsed);
    } catch (error) {
      lastError = error;
    }
  }
  throw Error(
    `failed to parse LLM response into JSON. Error - ${String(
      lastError ?? 'unknown error',
    )}. Response - \n ${input}`,
  );
}
