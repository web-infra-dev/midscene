import { getDebug } from '@midscene/shared/logger';
import { assert, uuid } from '@midscene/shared/utils';
import type { ModelRuntime } from '../models';
import { callCodex, prepareCodexCall } from './codex/call-codex';
import { isCodexAppServerProvider } from './codex/codex-app-server';
import {
  isModelCallRecordingEnabled,
  recordModelCallEvent,
} from './model-call-recorder';
import { type PreparedOpenAIInput, callOpenAI } from './openai/call-openai';
import { prepareChatCompletion } from './openai/chat-completion/chat-completion';
import { prepareResponses } from './openai/responses/responses';
import {
  SiwcTokenExpiredError,
  prepareSiwcCall,
  siwcTokenManager,
} from './openai/siwc';
import {
  buildRequestAbortSignal,
  resolveEffectiveTimeoutMs,
  runWithAbortSignal,
  waitForRetry,
} from './request-timeout';
import {
  prepareSystemOne,
  callSystemOne as sendSystemOneRequest,
} from './system-one';
import type { SystemOneRequest } from './system-one/schema';
import type { ModelCallMessages } from './types';
import type {
  AICallResult,
  CallAIOptions,
  ModelCallContext,
  ModelCallResult,
} from './types';
import {
  appendAIRequestFailureSummary,
  buildUsageInfo,
  nextInternalCallId,
  normalizeRetryCount,
  toError,
} from './utils';

const DEFAULT_MODEL_PROTOCOL = 'openai-chat';

export async function callGenerativeAI(
  messages: ModelCallMessages,
  originalModelRuntime: ModelRuntime,
  originalOptions?: CallAIOptions,
): Promise<AICallResult> {
  originalOptions?.abortSignal?.throwIfAborted();
  const isStreaming = originalOptions?.stream === true;
  if (isStreaming) {
    // Explicit streaming is currently used only by recorder code generation.
    // Streaming can also be aggregated without onChunk, but then the caller
    // cannot consume incremental output, which is the purpose of this option.
    // Environment-enabled streaming supports that aggregation-only use case.
    // Once onChunk delivers a chunk, later errors are not retried to avoid
    // delivering duplicate content. Errors before the first chunk can retry.
    assert(
      typeof originalOptions?.onChunk === 'function',
      'onChunk is required when stream: true is explicitly specified',
    );
  }

  // Resolve authentication constraints before protocol selection and validation.
  const { modelRuntime, options } = await prepareSiwcCall(
    originalModelRuntime,
    originalOptions,
  );

  const { config: modelConfig } = modelRuntime;
  return executeModelCall(modelRuntime, options, async () => {
    const input = { messages, modelRuntime, options };
    if (isCodexAppServerProvider(modelConfig.openaiBaseURL)) {
      return { kind: 'codex', input: prepareCodexCall(input) };
    }
    const protocol = modelConfig.protocol ?? DEFAULT_MODEL_PROTOCOL;

    assert(
      modelRuntime.adapter.supportedProtocols.includes(protocol),
      `Model adapter "${modelConfig.modelFamily ?? 'default'}" does not support protocol "${protocol}"`,
    );
    if (protocol === 'openai-responses') {
      return { kind: 'responses', input: await prepareResponses(input) };
    }
    return {
      kind: 'chat-completion',
      input: await prepareChatCompletion(input),
    };
  });
}

export async function callSystemOneAI(
  request: SystemOneRequest,
  modelRuntime: ModelRuntime,
  options?: CallAIOptions,
): Promise<AICallResult> {
  options?.abortSignal?.throwIfAborted();
  assert(!options?.stream, 'Jev does not support streaming output');
  assert(
    modelRuntime.config.modelFamily === 'jev',
    'System One currently only supports the Jev model family in Midscene',
  );
  return executeModelCall(modelRuntime, options, async () => ({
    kind: 'system-one',
    input: await prepareSystemOne(modelRuntime.config, request),
  }));
}

async function executeModelCall(
  modelRuntime: ModelRuntime,
  options: CallAIOptions | undefined,
  prepare: () => Promise<PreparedModelInput>,
): Promise<AICallResult> {
  // Keep identifiers stable across all request attempts.
  const executionId = modelRuntime.executionId ?? `unscoped-${uuid()}`;
  const internalCallId = nextInternalCallId();
  const { config: modelConfig } = modelRuntime;

  const prepared = options?.abortSignal
    ? await runWithAbortSignal(options.abortSignal, prepare)
    : await prepare();

  const result = await callModelWithRetry({
    modelRuntime,
    options,
    executionId,
    internalCallId,
    prepared,
  });

  const {
    rawUsage,
    timeCost,
    totalTimeCost,
    retryCount,
    requestId,
    responseModelName,
    ...response
  } = result;

  const rawUsageInfo = buildUsageInfo({
    requestKind: prepared.kind,
    stream: response.isStreamed,
    usageData: rawUsage,
    timeCost,
    totalTimeCost,
    retryCount,
    requestId,
    responseModelName,
    modelName: modelConfig.modelName,
    modelDescription: modelConfig.modelDescription,
    slot: modelConfig.slot,
    internalCallId,
  });

  const usage = rawUsageInfo
    ? { ...rawUsageInfo, modelFallback: modelRuntime.modelFallback }
    : undefined;

  const debugProfileStats = getDebug('ai:profile:stats');
  const debugProfileDetail = getDebug('ai:profile:detail');
  debugProfileStats(
    `model, ${modelConfig.modelName}, mode, ${modelConfig.modelFamily || 'default'}, streaming, ${response.isStreamed}, prompt-tokens, ${usage?.prompt_tokens ?? ''}, completion-tokens, ${usage?.completion_tokens ?? ''}, total-tokens, ${usage?.total_tokens ?? ''}, cached-input, ${usage?.cached_input ?? ''}, cost-ms, ${timeCost ?? ''}, requestId, ${requestId ?? ''}, slot, ${modelConfig.slot}, configured-temperature, ${modelConfig.temperature ?? ''}`,
  );
  debugProfileDetail(`model usage detail: ${JSON.stringify(usage)}`);

  if (usage && modelRuntime.onUsage) {
    modelRuntime.onUsage(usage);
  }
  return { ...response, usage };
}

type PreparedModelInput =
  | {
      kind: 'system-one';
      input: Awaited<ReturnType<typeof prepareSystemOne>>;
    }
  | { kind: 'codex'; input: ReturnType<typeof prepareCodexCall> }
  | PreparedOpenAIInput;

type ModelCallInput = {
  modelRuntime: ModelRuntime;
  options?: CallAIOptions;
  executionId: string;
  internalCallId: string;
  prepared: PreparedModelInput;
};

/** Carries the original failure across the retry boundary without replaying output. */
class NonRetryableModelCallError extends Error {
  readonly cause: Error;

  constructor(cause: Error) {
    super(cause.message, { cause });
    this.cause = cause;
  }
}

async function callModelWithRetry(
  input: ModelCallInput,
): Promise<ModelCallResult & { totalTimeCost: number; retryCount: number }> {
  const startTime = Date.now();
  const {
    modelRuntime: { config },
    options,
  } = input;
  const maxAttempts = normalizeRetryCount(config.retryCount) + 1;
  const retryInterval = config.retryInterval ?? 2000;
  const attemptErrors: Array<{ attempt: number; error: unknown }> = [];

  for (let attempt = 1; ; attempt++) {
    options?.abortSignal?.throwIfAborted();
    try {
      const result = await callModelOnce(input, attempt);
      return {
        ...result,
        totalTimeCost: Date.now() - startTime,
        retryCount: attempt - 1,
      };
    } catch (error) {
      options?.abortSignal?.throwIfAborted();
      if (error instanceof NonRetryableModelCallError) {
        throw error.cause;
      }
      // A rejected SIWC token gets one authentication retry, independently of
      // normal retryCount. Delivered chunks are rejected above before refreshing.
      if (error instanceof SiwcTokenExpiredError) {
        const refresh = async () => {
          assert(config.openaiApiKey, 'Missing rejected SIWC access token');
          await siwcTokenManager.refreshAccessToken(config.openaiApiKey);
          return prepareSiwcCall(input.modelRuntime, options);
        };
        // Cancel only this caller's wait; other callers may share the refresh.
        const refreshed = options?.abortSignal
          ? await runWithAbortSignal(options.abortSignal, refresh)
          : await refresh();
        options?.abortSignal?.throwIfAborted();
        try {
          const result = await callModelOnce(
            { ...input, ...refreshed },
            attempt + 1,
          );
          return {
            ...result,
            totalTimeCost: Date.now() - startTime,
            retryCount: attempt,
          };
        } catch (retryError) {
          // Do not re-enter either retry path after the refreshed request fails.
          throw retryError instanceof NonRetryableModelCallError
            ? retryError.cause
            : retryError;
        }
      }
      const lastError = toError(error);
      attemptErrors.push({ attempt, error: lastError });
      if (attempt === maxAttempts) {
        throw appendAIRequestFailureSummary(
          lastError,
          attemptErrors,
          maxAttempts,
        );
      }
      getDebug('ai:call', {
        console: true,
        warning: {
          kind: 'model-request-retry',
          modelName: config.modelName,
          error: lastError,
          callId: input.internalCallId,
          attempt,
          maxAttempts,
          delayMs: retryInterval,
        },
      })(
        `AI call failed (attempt ${attempt}/${maxAttempts}), retrying in ${retryInterval}ms... Error: ${lastError.message}`,
      );
    }
    await waitForRetry(retryInterval, options?.abortSignal);
  }
}

async function callModelOnce(
  {
    modelRuntime,
    options,
    executionId,
    internalCallId,
    prepared,
  }: ModelCallInput,
  attempt: number,
): Promise<ModelCallResult> {
  const { config: modelConfig } = modelRuntime;
  const recordingEnabled = isModelCallRecordingEnabled();
  const recordEvent =
    recordingEnabled || modelRuntime.onRequest
      ? (event: Record<string, unknown>) => {
          if (event.type === 'request') {
            const request = event.request as { url?: string } | undefined;
            modelRuntime.onRequest?.(request?.url);
          }
          if (!recordingEnabled) return;
          void recordModelCallEvent({
            executionId,
            callId: internalCallId,
            semanticRetryAttempt: options?.semanticRetryAttempt,
            slot: modelConfig.slot,
            intent: modelConfig.intent,
            modelFamily: modelConfig.modelFamily,
            modelFallback: modelRuntime.modelFallback,
            ...event,
            attempt,
          });
        }
      : undefined;
  const effectiveTimeoutMs = resolveEffectiveTimeoutMs(modelConfig.timeout);
  const { signal: requestSignal, cleanup } = buildRequestAbortSignal(
    effectiveTimeoutMs,
    options?.abortSignal,
  );
  let deliveredChunk = false;
  const onChunk = options?.onChunk;
  const context: ModelCallContext = {
    modelRuntime,
    executionId,
    recordEvent,
    requestSignal,
    effectiveTimeoutMs,
    options: onChunk
      ? {
          ...options,
          onChunk: (chunk) => {
            requestSignal.throwIfAborted();
            deliveredChunk = true;
            onChunk(chunk);
          },
        }
      : options,
  };
  try {
    return await runWithAbortSignal(requestSignal, () =>
      prepared.kind === 'system-one'
        ? sendSystemOneRequest(context, prepared.input)
        : prepared.kind === 'codex'
          ? callCodex(context, prepared.input)
          : callOpenAI(context, prepared),
    );
  } catch (error) {
    options?.abortSignal?.throwIfAborted();
    const lastError = toError(error);
    if (deliveredChunk) {
      throw new NonRetryableModelCallError(lastError);
    }
    throw lastError;
  } finally {
    cleanup();
  }
}
