import type {
  AIUsageInfo,
  CodeGenerationChunk,
  StreamingCallback,
} from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert, uuid } from '@midscene/shared/utils';
import type OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { Stream } from 'openai/streaming';
import type { ModelRuntime } from '../models';
import {
  type CodexAppServerRecordEvent,
  callAIWithCodexAppServer,
  isCodexAppServerProvider,
} from './codex-app-server';
import {
  isModelCallRecordingEnabled,
  recordModelCallEvent,
} from './model-call-recorder';
import { createChatClient } from './openai-client';
import { formatOpenAIAPIErrorDetails } from './openai-error';
import {
  buildRequestAbortSignal,
  isHardTimeoutError,
  resolveEffectiveTimeoutMs,
  restoreHardTimeoutError,
} from './request-timeout';
import {
  AIResponseParseError,
  INTERNAL_CALL_ID_FIELD,
  appendAIRequestFailureSummary,
  getLatestResponseAttempt,
  getLatestSuccessfulResponseRequestId,
  nextInternalCallId,
  normalizeRetryCount,
  stringifyForDebug,
  toError,
} from './utils';

export interface CallAIOptions {
  stream?: boolean;
  onChunk?: StreamingCallback;
  abortSignal?: AbortSignal;
  requiresOriginalImageDetail?: boolean;
  expectedJsonObjectResponse?: boolean;
  /**
   * Number of preceding semantic parsing failures for this request.
   * Network retries are intentionally excluded.
   */
  semanticRetryAttempt?: number;
}

export async function callAI(
  messages: ChatCompletionMessageParam[],
  modelRuntime: ModelRuntime,
  options?: CallAIOptions,
): Promise<{
  content: string;
  reasoning_content?: string;
  rawChoiceMessage?: unknown;
  usage?: AIUsageInfo;
  isStreamed: boolean;
}> {
  const { config: modelConfig, adapter } = modelRuntime;
  // Low-level callers without a TaskRunner still need a stable ID for the
  // lifetime of this model call (including its network retries).
  const executionId = modelRuntime.executionId ?? `unscoped-${uuid()}`;

  // Stable internal ID for this call, used by the agent to deduplicate usage
  // across the onUsage callback and the task-dump-based collectUsageMetrics()
  // path when the provider does not return a request_id.
  const internalCallId = nextInternalCallId();
  const recordEvent = isModelCallRecordingEnabled()
    ? (event: Record<string, unknown>) => {
        void recordModelCallEvent({
          executionId,
          callId: internalCallId,
          semanticRetryAttempt: options?.semanticRetryAttempt,
          slot: modelConfig.slot,
          intent: modelConfig.intent,
          modelFamily: modelConfig.modelFamily,
          ...event,
        });
      }
    : undefined;
  const modelCallInput = {
    intent: modelConfig.intent,
    userConfig: {
      temperature: modelConfig.temperature,
      reasoningEnabled: modelConfig.reasoningEnabled,
      reasoningEffort: modelConfig.reasoningEffort,
      reasoningBudget: modelConfig.reasoningBudget,
      responseFormat: modelConfig.responseFormat,
    },
    semanticRetryAttempt: options?.semanticRetryAttempt,
    requiresOriginalImageDetail: options?.requiresOriginalImageDetail,
    expectedJsonObjectResponse: options?.expectedJsonObjectResponse,
  };
  if (isCodexAppServerProvider(modelConfig.openaiBaseURL)) {
    let protocolChunkSequence = 0;
    const codexStartTime = Date.now();
    const recordCodexEvent = recordEvent
      ? (event: CodexAppServerRecordEvent) => {
          if (event.type === 'chunk') {
            protocolChunkSequence += 1;
            recordEvent({
              ...event,
              attempt: 1,
              sequence: protocolChunkSequence,
              provider: 'codex-app-server',
            });
            return;
          }

          recordEvent({
            ...event,
            attempt: 1,
            provider: 'codex-app-server',
          });
        }
      : undefined;

    try {
      const { config, imageDetail } =
        adapter.buildCodexAppServerParams(modelCallInput);
      const codexResult = await callAIWithCodexAppServer(
        messages,
        modelConfig,
        {
          stream: options?.stream,
          onChunk: options?.onChunk,
          params: config,
          abortSignal: options?.abortSignal,
          imageDetail,
          onRecordEvent: recordCodexEvent,
        },
      );
      const { protocolMetadata, ...response } = codexResult;
      recordEvent?.({
        type: 'response',
        attempt: 1,
        provider: 'codex-app-server',
        final: {
          content: response.content,
          reasoningContent: response.reasoning_content,
          usage: response.usage,
          timeCost: Date.now() - codexStartTime,
          protocol: protocolMetadata,
        },
      });
      if (response.usage) {
        (response.usage as any)[INTERNAL_CALL_ID_FIELD] = internalCallId;
        if (modelRuntime.onUsage) {
          modelRuntime.onUsage(response.usage);
        }
      }
      return {
        ...response,
      };
    } catch (error) {
      recordEvent?.({
        type: 'error',
        attempt: 1,
        provider: 'codex-app-server',
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : String(error),
      });
      throw error;
    }
  }

  const imageDetail = adapter.chatCompletion.resolveImageDetail(modelCallInput);

  const {
    completion,
    modelName,
    modelDescription,
    modelFamily,
    openAIErrorResponseContext,
  } = await createChatClient({
    modelConfig,
    executionId,
    recordEvent,
  });
  const effectiveTimeoutMs = resolveEffectiveTimeoutMs(modelConfig);

  const extraBody = modelConfig.extraBody;

  const debugCall = getDebug('ai:call');
  const warnCall = getDebug('ai:call', { console: true });
  const debugProfileStats = getDebug('ai:profile:stats');
  const debugProfileDetail = getDebug('ai:profile:detail');

  const startTime = Date.now();

  const isStreaming = options?.stream && options?.onChunk;
  const { config: adapterChatCompletionParams } =
    adapter.chatCompletion.buildChatCompletionParams(modelCallInput);
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
  // Tracks whether onUsage has already been fired for this call (e.g. from
  // the streaming final-chunk handler), so the final return does not double-fire.
  let usageReported = false;

  const hasUsableText = (value: string | null | undefined): value is string =>
    typeof value === 'string' && value.trim().length > 0;

  const resolveContentWithReasoningFallback = (
    contentValue: string | undefined,
    reasoningContent: string,
  ) => {
    if (
      !hasUsableText(contentValue) &&
      adapter.chatCompletion.useReasoningAsContentFallback &&
      hasUsableText(reasoningContent)
    ) {
      warnCall('empty content from AI model, using reasoning content');
      return reasoningContent;
    }

    return contentValue;
  };

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
      // Left undefined at the raw call layer. The agent's onUsage callback
      // fills it from modelConfig.slot for metrics collection, and task
      // layers use withUsageIntent() to stamp a more specific semantic
      // intent (e.g. 'planning', 'insight') when attaching usage to tasks.
      intent: undefined,
      request_id: requestId ?? undefined,
      // Internal stable ID for cross-path dedup when request_id is absent.
      [INTERNAL_CALL_ID_FIELD]: internalCallId,
    } satisfies AIUsageInfo;
  };

  const requestConfig = {
    ...adapterChatCompletionParams,
    ...(extraBody ?? {}),
  };
  const temperature = requestConfig.temperature;

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
            stream_options: {
              ...(requestConfig.stream_options as
                | Record<string, unknown>
                | undefined),
              include_usage: true,
            },
          },
          {
            stream: true,
            signal: streamSignal,
          },
        )) as Stream<OpenAI.Chat.Completions.ChatCompletionChunk> & {
          _request_id?: string | null;
        };

        requestId =
          getLatestSuccessfulResponseRequestId(openAIErrorResponseContext) ??
          stream._request_id;
        const streamAttempt = getLatestResponseAttempt(
          openAIErrorResponseContext,
        );

        let chunkSequence = 0;
        for await (const chunk of stream) {
          chunkSequence += 1;
          recordEvent?.({
            type: 'chunk',
            attempt: streamAttempt,
            sequence: chunkSequence,
            chunk,
          });
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
        }

        timeCost = Date.now() - startTime;

        const finalAccumulated = resolveContentWithReasoningFallback(
          accumulated,
          accumulatedReasoning,
        );
        accumulated = finalAccumulated || '';

        // Send final chunk
        const finalUsage = buildUsageInfo(usage, requestId);
        if (finalUsage && modelRuntime.onUsage) {
          modelRuntime.onUsage(finalUsage);
          usageReported = true;
        }
        const finalChunk: CodeGenerationChunk = {
          content: '',
          accumulated,
          reasoning_content: '',
          isComplete: true,
          usage: finalUsage,
        };
        options.onChunk!(finalChunk);
      } catch (error) {
        throw restoreHardTimeoutError(toError(error), streamSignal);
      } finally {
        cleanupStreamSignal();
      }
      content = accumulated;
      debugProfileStats(
        `streaming model, ${modelName}, mode, ${modelFamily || 'default'}, cost-ms, ${timeCost}, temperature, ${temperature ?? ''}`,
      );
    } else {
      // Non-streaming with retry logic
      const retryCount = normalizeRetryCount(modelConfig.retryCount);
      const retryInterval = modelConfig.retryInterval ?? 2000;
      const maxAttempts = retryCount + 1; // retryCount=1 means 2 total attempts (1 initial + 1 retry)

      let lastError: Error | undefined;
      const attemptErrors: Array<{ attempt: number; error: unknown }> = [];

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
          requestId =
            getLatestSuccessfulResponseRequestId(openAIErrorResponseContext) ??
            result._request_id;

          debugProfileStats(
            `model, ${modelName}, mode, ${modelFamily || 'default'}, prompt-tokens, ${result.usage?.prompt_tokens || ''}, completion-tokens, ${result.usage?.completion_tokens || ''}, total-tokens, ${result.usage?.total_tokens || ''}, cost-ms, ${timeCost}, requestId, ${requestId || ''}, temperature, ${temperature ?? ''}`,
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
          responseModelName = result.model;

          content = resolveContentWithReasoningFallback(
            content,
            accumulatedReasoning,
          );

          if (!hasUsableText(content)) {
            const errorUsage = buildUsageInfo(usage, requestId);
            if (errorUsage && modelRuntime.onUsage) {
              modelRuntime.onUsage(errorUsage);
            }
            throw new AIResponseParseError(
              'empty content from AI model',
              content || '',
              errorUsage,
              rawChoiceMessage,
            );
          }

          break; // Success, exit retry loop
        } catch (error) {
          lastError = restoreHardTimeoutError(toError(error), attemptSignal);
          attemptErrors.push({ attempt, error: lastError });
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
        assert(
          lastError,
          'AI model request failed without recording an attempt error',
        );
        throw appendAIRequestFailureSummary(
          lastError,
          attemptErrors,
          maxAttempts,
        );
      }
    }

    debugCall(`response reasoning content: ${accumulatedReasoning}`);
    debugCall(`response content: ${content}`);

    const finalUsage = buildUsageInfo(usage, requestId);
    // Report usage to the runtime-level collector if not already reported
    // (e.g. from the streaming final-chunk handler).
    if (!usageReported && finalUsage && modelRuntime.onUsage) {
      modelRuntime.onUsage(finalUsage);
    }

    const response = {
      content: content || '',
      reasoning_content: accumulatedReasoning || undefined,
      rawChoiceMessage,
      usage: finalUsage,
      isStreamed: !!isStreaming,
    };
    recordEvent?.({
      type: 'response',
      attempt: getLatestResponseAttempt(openAIErrorResponseContext),
      http: openAIErrorResponseContext.httpResponses?.at(-1),
      final: {
        content: response.content,
        reasoningContent: response.reasoning_content,
        usage: response.usage,
        requestId,
        timeCost,
        responseModelName,
      },
    });
    return response;
  } catch (e: any) {
    warnCall('call AI error', e);

    if (e instanceof AIResponseParseError) {
      throw e;
    }

    const newError = new Error(
      `failed to call ${isStreaming ? 'streaming ' : ''}AI model service (${modelName}): ${e.message}${formatOpenAIAPIErrorDetails(e, openAIErrorResponseContext)}\nTrouble shooting: https://midscenejs.com/model-provider.html`,
      {
        cause: e,
      },
    );
    throw newError;
  }
}
