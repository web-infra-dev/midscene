import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type OpenAI from 'openai';
import {
  buildRequestAbortSignal,
  isHardTimeoutError,
  restoreHardTimeoutError,
} from '../request-timeout';
import {
  AIResponseParseError,
  appendAIRequestFailureSummary,
  getLatestSuccessfulResponseRequestId,
  normalizeRetryCount,
  toError,
} from '../utils';
import type {
  ChatCompletionCallOptions,
  ChatCompletionCallResult,
} from './types';
import {
  buildUsageInfo,
  hasUsableText,
  resolveContentWithReasoningFallback,
} from './utils';

export const callChatCompletionNonStreaming = async ({
  client,
  modelRuntime,
  messages,
  requestConfig,
  effectiveTimeoutMs,
  abortSignal,
  startTime,
  internalCallId,
}: ChatCompletionCallOptions): Promise<ChatCompletionCallResult> => {
  const { config: modelConfig, adapter } = modelRuntime;
  const {
    completion,
    modelName,
    modelDescription,
    modelFamily,
    openAIErrorResponseContext,
  } = client;
  const warnCall = getDebug('ai:call', { console: true });
  const debugProfileStats = getDebug('ai:profile:stats');
  const debugProfileDetail = getDebug('ai:profile:detail');
  const temperature = requestConfig.temperature;
  let content: string | undefined;
  let accumulatedReasoning = '';
  let rawChoiceMessage: unknown;
  let usage: OpenAI.CompletionUsage | undefined;
  let timeCost: number | undefined;
  let requestId: string | null | undefined;
  let responseModelName: string | undefined;

  // Non-streaming with retry logic
  const retryCount = normalizeRetryCount(modelConfig.retryCount);
  const retryInterval = modelConfig.retryInterval ?? 2000;
  const maxAttempts = retryCount + 1; // retryCount=1 means 2 total attempts (1 initial + 1 retry)

  let lastError: Error | undefined;
  const attemptErrors: Array<{ attempt: number; error: unknown }> = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { signal: attemptSignal, cleanup: cleanupAttemptSignal } =
      buildRequestAbortSignal(effectiveTimeoutMs, abortSignal);
    try {
      const result = await completion.create(
        {
          model: modelName,
          messages,
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

      debugProfileDetail(`model usage detail: ${JSON.stringify(result.usage)}`);

      if (!result.choices) {
        throw new Error(
          `invalid response from LLM service: ${JSON.stringify(result)}`,
        );
      }

      rawChoiceMessage = result.choices[0].message;
      const parsedMessage = adapter.chatCompletion.extractContentAndReasoning(
        result.choices[0].message,
      );
      content = parsedMessage.content;
      accumulatedReasoning = parsedMessage.reasoning_content;
      usage = result.usage;
      responseModelName = result.model;

      content = resolveContentWithReasoningFallback({
        content,
        reasoningContent: accumulatedReasoning,
        useReasoningAsContentFallback:
          adapter.chatCompletion.useReasoningAsContentFallback,
      });

      if (!hasUsableText(content)) {
        const errorUsage = buildUsageInfo({
          usageData: usage,
          requestId,
          timeCost,
          modelName,
          modelDescription,
          responseModelName,
          slot: modelConfig.slot,
          internalCallId,
        });
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
      if (abortSignal?.aborted) {
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
    throw appendAIRequestFailureSummary(lastError, attemptErrors, maxAttempts);
  }
  return {
    content,
    accumulatedReasoning,
    rawChoiceMessage,
    usage,
    timeCost,
    requestId,
    responseModelName,
    usageReported: false,
  };
};
