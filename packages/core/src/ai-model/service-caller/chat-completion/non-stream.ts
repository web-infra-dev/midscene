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
import { hasUsableText, resolveContentWithReasoningFallback } from './utils';

export const callChatCompletionNonStreaming = async ({
  completion,
  modelName,
  openAIErrorResponseContext,
  modelRuntime,
  messages,
  requestConfig,
  effectiveTimeoutMs,
  abortSignal,
}: ChatCompletionCallOptions): Promise<ChatCompletionCallResult> => {
  const { config: modelConfig, adapter } = modelRuntime;
  const warnCall = getDebug('ai:call', { console: true });
  let content: string | undefined;
  let reasoningContent = '';
  let rawChoiceMessage: unknown;
  let usage: OpenAI.CompletionUsage | undefined;
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

      requestId =
        getLatestSuccessfulResponseRequestId(openAIErrorResponseContext) ??
        result._request_id;

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
      reasoningContent = parsedMessage.reasoning_content;
      usage = result.usage;
      responseModelName = result.model;

      content = resolveContentWithReasoningFallback({
        content,
        reasoningContent,
        useReasoningAsContentFallback:
          adapter.chatCompletion.useReasoningAsContentFallback,
      });

      if (!hasUsableText(content)) {
        throw new AIResponseParseError(
          'empty content from AI model',
          content || '',
          undefined,
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
    reasoningContent,
    rawChoiceMessage,
    rawUsage: usage,
    requestId,
    responseModelName,
  };
};
