import { getDebug } from '@midscene/shared/logger';
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
  openAIRequestContext,
  modelRuntime,
  messages,
  requestBodyParams,
  effectiveTimeoutMs,
  abortSignal,
}: ChatCompletionCallOptions): Promise<ChatCompletionCallResult> => {
  const { config: modelConfig, adapter } = modelRuntime;
  const { modelName } = modelConfig;
  const warnCall = getDebug('ai:call', { console: true });
  // Non-streaming with retry logic
  const retryCount = normalizeRetryCount(modelConfig.retryCount);
  const retryInterval = modelConfig.retryInterval ?? 2000;
  const maxAttempts = retryCount + 1; // retryCount=1 means 2 total attempts (1 initial + 1 retry)

  const attemptErrors: Array<{ attempt: number; error: unknown }> = [];

  for (let attempt = 1; ; attempt++) {
    const { signal: attemptSignal, cleanup: cleanupAttemptSignal } =
      buildRequestAbortSignal(effectiveTimeoutMs, abortSignal);
    try {
      const result = await completion.create(
        {
          model: modelName,
          messages,
          ...requestBodyParams,
          stream: false,
        },
        { signal: attemptSignal },
      );

      const requestId =
        getLatestSuccessfulResponseRequestId(openAIRequestContext) ??
        result._request_id;

      if (!result.choices) {
        throw new Error(
          `invalid response from LLM service: ${JSON.stringify(result)}`,
        );
      }

      const rawChoiceMessage = result.choices[0].message;
      const parsedMessage = adapter.chatCompletion.extractContentAndReasoning(
        result.choices[0].message,
      );
      const reasoningContent = parsedMessage.reasoning_content;
      const content = resolveContentWithReasoningFallback({
        content: parsedMessage.content,
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

      return {
        content,
        reasoningContent,
        rawChoiceMessage,
        rawUsage: result.usage,
        requestId,
        responseModelName: result.model,
      };
    } catch (error) {
      const lastError = restoreHardTimeoutError(toError(error), attemptSignal);
      attemptErrors.push({ attempt, error: lastError });
      const wasHardTimeout = isHardTimeoutError(lastError);
      if (wasHardTimeout) {
        warnCall(
          `AI call hit hard timeout (${effectiveTimeoutMs}ms, attempt ${attempt}/${maxAttempts}, model ${modelName}, slot ${modelConfig.slot})`,
        );
      }
      if (abortSignal?.aborted || attempt === maxAttempts) {
        throw appendAIRequestFailureSummary(
          lastError,
          attemptErrors,
          maxAttempts,
        );
      }
      warnCall(
        `AI call failed (attempt ${attempt}/${maxAttempts}), retrying in ${retryInterval}ms... Error: ${lastError.message}`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryInterval));
    } finally {
      cleanupAttemptSignal();
    }
  }
};
