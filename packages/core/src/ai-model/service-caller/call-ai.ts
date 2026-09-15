import { getDebug } from '@midscene/shared/logger';
import { assert, uuid } from '@midscene/shared/utils';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { ModelRuntime } from '../models';
import { chat } from './chat-completion/chat-completion';
import { callCodex } from './codex/call-codex';
import { isCodexAppServerProvider } from './codex/codex-app-server';
import {
  isModelCallRecordingEnabled,
  recordModelCallEvent,
} from './model-call-recorder';
import {
  buildRequestAbortSignal,
  resolveEffectiveTimeoutMs,
  runWithAbortSignal,
  waitForRetry,
} from './request-timeout';
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

export async function callAI(
  messages: ChatCompletionMessageParam[],
  modelRuntime: ModelRuntime,
  options?: CallAIOptions,
): Promise<AICallResult> {
  options?.abortSignal?.throwIfAborted();
  const isStreaming = options?.stream === true;
  if (isStreaming) {
    assert(
      typeof options?.onChunk === 'function',
      'onChunk is required when stream is true',
    );
  }

  // Low-level callers without a TaskRunner still need a stable ID for the
  // lifetime of this model call (including its network retries).
  const executionId = modelRuntime.executionId ?? `unscoped-${uuid()}`;

  // Stable internal ID for this call, used by the agent to deduplicate usage
  // across the onUsage callback and the task-dump-based collectUsageMetrics()
  // path when the provider does not return a request_id.
  const internalCallId = nextInternalCallId();

  const { config: modelConfig } = modelRuntime;

  const result = await callModelWithRetry({
    messages,
    modelRuntime,
    options,
    executionId,
    internalCallId,
  });

  const { rawUsage, timeCost, requestId, responseModelName, ...response } =
    result;

  const usage = buildUsageInfo({
    usageData: rawUsage,
    timeCost,
    requestId,
    responseModelName,
    modelName: modelConfig.modelName,
    modelDescription: modelConfig.modelDescription,
    slot: modelConfig.slot,
    internalCallId,
  });

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

type ModelCallInput = {
  messages: ChatCompletionMessageParam[];
  modelRuntime: ModelRuntime;
  options?: CallAIOptions;
  executionId: string;
  internalCallId: string;
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
): Promise<ModelCallResult> {
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
      return await callModelOnce(input, attempt);
    } catch (error) {
      options?.abortSignal?.throwIfAborted();
      if (error instanceof NonRetryableModelCallError) {
        throw error.cause;
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
      getDebug('ai:call', { console: true })(
        `AI call failed (attempt ${attempt}/${maxAttempts}), retrying in ${retryInterval}ms... Error: ${lastError.message}`,
      );
    }
    await waitForRetry(retryInterval, options?.abortSignal);
  }
}

async function callModelOnce(
  {
    messages,
    modelRuntime,
    options,
    executionId,
    internalCallId,
  }: ModelCallInput,
  attempt: number,
): Promise<ModelCallResult> {
  const { config: modelConfig } = modelRuntime;
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
    messages,
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
      isCodexAppServerProvider(modelConfig.openaiBaseURL)
        ? callCodex(context)
        : chat(context),
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
