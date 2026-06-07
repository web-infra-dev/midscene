import type { AIUsageInfo } from '@/types';
import type { CodeGenerationChunk, StreamingCallback } from '@/types';

// Error class that preserves usage and rawResponse when AI call parsing fails
export class AIResponseParseError extends Error {
  usage?: AIUsageInfo;
  /**
   * Adapter-extracted content used by Midscene for parsing. This is not the
   * full provider response or choices[0].message.
   */
  rawResponse: string;
  rawChoiceMessage?: unknown;

  constructor(
    message: string,
    rawResponse: string,
    usage?: AIUsageInfo,
    rawChoiceMessage?: unknown,
  ) {
    super(message);
    this.name = 'AIResponseParseError';
    this.rawResponse = rawResponse;
    this.usage = usage;
    this.rawChoiceMessage = rawChoiceMessage;
  }
}
import {
  type IModelConfig,
  MIDSCENE_LANGFUSE_DEBUG,
  MIDSCENE_LANGSMITH_DEBUG,
  type TModelFamilyRef,
  globalConfigManager,
} from '@midscene/shared/env';

import { getDebug } from '@midscene/shared/logger';
import { assert, ifInBrowser } from '@midscene/shared/utils';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { Stream } from 'openai/streaming';
import { type ModelRuntime, getModelRuntime } from '../models';
import type { AIArgs } from '../types';
import {
  callAIWithCodexAppServer,
  isCodexAppServerProvider,
} from './codex-app-server';
import type { JsonParserSource } from './json';
import {
  buildRequestAbortSignal,
  isHardTimeoutError,
  resolveEffectiveTimeoutMs,
} from './request-timeout';
export {
  extractJSONFromCodeBlock,
  normalJsonParser,
  safeParseJson,
} from './json';
export type { JsonParser } from './json';

function stringifyForDebug(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

export async function createChatClient({
  modelConfig,
}: {
  modelConfig: IModelConfig;
}): Promise<{
  completion: OpenAI.Chat.Completions;
  modelName: string;
  modelDescription: string;
  modelFamily: TModelFamilyRef | undefined;
}> {
  const {
    socksProxy,
    httpProxy,
    modelName,
    openaiBaseURL,
    openaiApiKey,
    openaiExtraConfig,
    modelDescription,
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

  const effectiveTimeoutMs = resolveEffectiveTimeoutMs({ timeout });
  const openAIOptions = {
    baseURL: openaiBaseURL,
    apiKey: openaiApiKey,
    // Use fetchOptions.dispatcher for fetch-based SDK instead of httpAgent
    // Note: Type assertion needed due to undici version mismatch between dependencies
    ...(proxyAgent ? { fetchOptions: { dispatcher: proxyAgent as any } } : {}),
    ...openaiExtraConfig,
    // Midscene already handles retries in callAI(), so disable SDK-level retries
    // to avoid duplicate attempts and duplicated backoff latency.
    maxRetries: 0,
    // When disabled (timeoutMs === null) fall through to the SDK default so
    // only the caller-provided abortSignal can cancel the request.
    ...(effectiveTimeoutMs !== null ? { timeout: effectiveTimeoutMs } : {}),
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
    modelFamily,
  };
}

export async function callAI(
  messages: ChatCompletionMessageParam[],
  modelRuntime: ModelRuntime,
  options?: {
    stream?: boolean;
    onChunk?: StreamingCallback;
    abortSignal?: AbortSignal;
    requiresOriginalImageDetail?: boolean;
  },
): Promise<{
  content: string;
  reasoning_content?: string;
  rawChoiceMessage?: unknown;
  usage?: AIUsageInfo;
  isStreamed: boolean;
}> {
  const { config: modelConfig, adapter } = modelRuntime;

  if (isCodexAppServerProvider(modelConfig.openaiBaseURL)) {
    return callAIWithCodexAppServer(messages, modelConfig, {
      stream: options?.stream,
      onChunk: options?.onChunk,
      reasoningEnabled: modelConfig.reasoningEnabled,
      abortSignal: options?.abortSignal,
    });
  }

  const { completion, modelName, modelDescription, modelFamily } =
    await createChatClient({
      modelConfig,
    });
  const effectiveTimeoutMs = resolveEffectiveTimeoutMs(modelConfig);

  const extraBody = modelConfig.extraBody;

  const debugCall = getDebug('ai:call');
  const warnCall = getDebug('ai:call', { console: true });
  const debugProfileStats = getDebug('ai:profile:stats');
  const debugProfileDetail = getDebug('ai:profile:detail');

  const startTime = Date.now();

  const isStreaming = options?.stream && options?.onChunk;
  const chatCompletionInput = {
    intent: modelConfig.intent,
    userConfig: {
      temperature: modelConfig.temperature,
      reasoningEnabled: modelConfig.reasoningEnabled,
      reasoningEffort: modelConfig.reasoningEffort,
      reasoningBudget: modelConfig.reasoningBudget,
    },
    requiresOriginalImageDetail: options?.requiresOriginalImageDetail,
  };
  const { config: adapterChatCompletionParams } =
    adapter.chatCompletion.buildChatCompletionParams(chatCompletionInput);
  debugCall(
    `adapter chat completion params: ${stringifyForDebug({
      config: adapterChatCompletionParams,
    })}`,
  );
  let content: string | undefined;
  let accumulated = '';
  let accumulatedReasoning = '';
  let rawChoiceMessage: unknown;
  let usage: OpenAI.CompletionUsage | undefined;
  let timeCost: number | undefined;
  let requestId: string | null | undefined;
  let responseModelName: string | undefined;

  const hasUsableText = (value: string | null | undefined): value is string =>
    typeof value === 'string' && value.trim().length > 0;

  const buildUsageInfo = (
    usageData?: OpenAI.CompletionUsage,
    requestId?: string | null,
  ) => {
    if (!usageData) return undefined;

    const cachedInputTokens = (
      usageData as { prompt_tokens_details?: { cached_tokens?: number } }
    )?.prompt_tokens_details?.cached_tokens;

    return {
      ...usageData,
      prompt_tokens: usageData.prompt_tokens ?? 0,
      completion_tokens: usageData.completion_tokens ?? 0,
      total_tokens: usageData.total_tokens ?? 0,
      cached_input: cachedInputTokens ?? 0,
      time_cost: timeCost ?? 0,
      model_name: modelName,
      model_description: modelDescription,
      response_model_name: responseModelName,
      slot: modelConfig.slot,
      // Agent task layers fill semantic intent after the raw model call.
      intent: undefined,
      request_id: requestId ?? undefined,
    } satisfies AIUsageInfo;
  };

  const requestConfig = {
    ...adapterChatCompletionParams,
    ...(extraBody ?? {}),
  };
  const temperature = requestConfig.temperature;

  const imageDetail =
    adapter.chatCompletion.resolveImageDetail(chatCompletionInput);

  // Some adapters request original image detail to preserve screenshot
  // resolution for localization-sensitive tasks.
  const messagesWithImageDetail: ChatCompletionMessageParam[] = (() => {
    if (!imageDetail) {
      return messages;
    }

    return messages.map((msg) => {
      if (!Array.isArray(msg.content)) {
        return msg;
      }

      const content = msg.content.map((part) => {
        if (part && part.type === 'image_url' && part.image_url?.url) {
          return {
            ...part,
            image_url: {
              ...part.image_url,
              detail: imageDetail,
            },
          };
        }
        return part;
      });

      return {
        ...msg,
        content,
      } as ChatCompletionMessageParam;
    });
  })();

  try {
    debugCall(
      `sending ${isStreaming ? 'streaming ' : ''}request to ${modelName}`,
    );

    if (isStreaming) {
      const { signal: streamSignal, cleanup: cleanupStreamSignal } =
        buildRequestAbortSignal(effectiveTimeoutMs, options?.abortSignal);
      try {
        const stream = (await completion.create(
          {
            model: modelName,
            messages: messagesWithImageDetail,
            ...requestConfig,
            stream: true,
          },
          {
            stream: true,
            signal: streamSignal,
          },
        )) as Stream<OpenAI.Chat.Completions.ChatCompletionChunk> & {
          _request_id?: string | null;
        };

        requestId = stream._request_id;

        for await (const chunk of stream) {
          const parsedChunk = adapter.chatCompletion.extractContentAndReasoning(
            chunk.choices?.[0]?.delta,
          );
          const content = parsedChunk.content || '';
          const reasoning_content = parsedChunk.reasoning_content || '';

          // Check for usage info in any chunk (OpenAI provides usage in separate chunks)
          if (chunk.usage) {
            usage = chunk.usage;
          }
          if (chunk.model) {
            responseModelName = chunk.model;
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
      } finally {
        cleanupStreamSignal();
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
        const { signal: attemptSignal, cleanup: cleanupAttemptSignal } =
          buildRequestAbortSignal(effectiveTimeoutMs, options?.abortSignal);
        try {
          const result = await completion.create(
            {
              model: modelName,
              messages: messagesWithImageDetail,
              ...requestConfig,
              stream: false,
            } as any,
            { signal: attemptSignal },
          );

          timeCost = Date.now() - startTime;

          debugProfileStats(
            `model, ${modelName}, mode, ${modelFamily || 'default'}, prompt-tokens, ${result.usage?.prompt_tokens || ''}, completion-tokens, ${result.usage?.completion_tokens || ''}, total-tokens, ${result.usage?.total_tokens || ''}, cost-ms, ${timeCost}, requestId, ${result._request_id || ''}, temperature, ${temperature ?? ''}`,
          );

          debugProfileDetail(
            `model usage detail: ${JSON.stringify(result.usage)}`,
          );

          if (!result.choices) {
            throw new Error(
              `invalid response from LLM service: ${JSON.stringify(result)}`,
            );
          }

          rawChoiceMessage = result.choices[0].message;
          const parsedMessage =
            adapter.chatCompletion.extractContentAndReasoning(
              result.choices[0].message,
            );
          content = parsedMessage.content;
          accumulatedReasoning = parsedMessage.reasoning_content;
          usage = result.usage;
          requestId = result._request_id;
          responseModelName = result.model;

          if (!hasUsableText(content) && hasUsableText(accumulatedReasoning)) {
            warnCall('empty content from AI model, using reasoning content');
            content = accumulatedReasoning;
          }

          if (!hasUsableText(content)) {
            throw new AIResponseParseError(
              'empty content from AI model',
              JSON.stringify(result),
              buildUsageInfo(usage, requestId),
              rawChoiceMessage,
            );
          }

          break; // Success, exit retry loop
        } catch (error) {
          lastError = error as Error;
          const wasHardTimeout = isHardTimeoutError(lastError);
          if (wasHardTimeout) {
            warnCall(
              `AI call hit hard timeout (${effectiveTimeoutMs}ms, attempt ${attempt}/${maxAttempts}, model ${modelName}, slot ${modelConfig.slot})`,
            );
          }
          // Do not retry if the request was aborted by the caller
          if (options?.abortSignal?.aborted) {
            break;
          }
          if (attempt < maxAttempts) {
            warnCall(
              `AI call failed (attempt ${attempt}/${maxAttempts}), retrying in ${retryInterval}ms... Error: ${lastError.message}`,
            );
            await new Promise((resolve) => setTimeout(resolve, retryInterval));
          }
        } finally {
          cleanupAttemptSignal();
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
      rawChoiceMessage,
      usage: buildUsageInfo(usage, requestId),
      isStreamed: !!isStreaming,
    };
  } catch (e: any) {
    warnCall('call AI error', e);

    if (e instanceof AIResponseParseError) {
      throw e;
    }

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
  // Keep IModelConfig compatibility for midscene-example/connectivity-test/tests/connectivity.test.ts; internal workflow callers should pass ModelRuntime instead.
  model: IModelConfig | ModelRuntime,
  options?: {
    abortSignal?: AbortSignal;
    jsonParserSource?: JsonParserSource;
  },
): Promise<{
  // TODO: `content` is a misleading name here because this is already the parsed object response. Consider renaming it to `object` or `data`.
  content: T;
  contentString: string;
  usage?: AIUsageInfo;
  reasoning_content?: string;
  rawChoiceMessage?: unknown;
}> {
  const modelRuntime = resolveCompatibleModelRuntime(model);
  const { config: modelConfig, adapter } = modelRuntime;
  const response = await callAI(messages, modelRuntime, {
    abortSignal: options?.abortSignal,
  });
  assert(response, 'empty response');
  let jsonContent: unknown;
  try {
    jsonContent = adapter.jsonParser(response.content, {
      source: options?.jsonParserSource ?? 'generic-object',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new AIResponseParseError(
      errorMessage,
      response.content,
      response.usage,
    );
  }
  if (typeof jsonContent !== 'object') {
    throw new AIResponseParseError(
      `failed to parse json response from model (${modelConfig.modelName}): ${response.content}`,
      response.content,
      response.usage,
      response.rawChoiceMessage,
    );
  }
  return {
    content: jsonContent as T,
    contentString: response.content,
    usage: response.usage,
    reasoning_content: response.reasoning_content,
    rawChoiceMessage: response.rawChoiceMessage,
  };
}

function resolveCompatibleModelRuntime(
  model: IModelConfig | ModelRuntime,
): ModelRuntime {
  if ('config' in model && 'adapter' in model) {
    return model;
  }

  return getModelRuntime(model);
}

export async function callAIWithStringResponse(
  msgs: AIArgs,
  modelRuntime: ModelRuntime,
  options?: {
    abortSignal?: AbortSignal;
  },
): Promise<{
  content: string;
  usage?: AIUsageInfo;
  rawChoiceMessage?: unknown;
}> {
  const { content, usage, rawChoiceMessage } = await callAI(
    msgs,
    modelRuntime,
    {
      abortSignal: options?.abortSignal,
    },
  );
  return { content, usage, rawChoiceMessage };
}
