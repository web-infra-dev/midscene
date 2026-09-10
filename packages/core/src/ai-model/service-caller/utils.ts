import type { AIUsageInfo } from '@/types';
import type OpenAI from 'openai';
import type { ModelRuntime } from '../models';
import type { OpenAIErrorResponseContext } from './openai-error';

// Error class that preserves usage and rawResponse when AI call parsing fails
export class AIResponseParseError extends Error {
  usage?: AIUsageInfo;
  /**
   * Adapter-extracted content used by Midscene for parsing. This is not the
   * full provider response or choices[0].message.
   */
  rawResponse: string;
  rawChoiceMessage?: unknown;
  reasoningContent?: string;

  constructor(
    message: string,
    rawResponse: string,
    usage?: AIUsageInfo,
    rawChoiceMessage?: unknown,
    reasoningContent?: string,
  ) {
    super(message);
    this.name = 'AIResponseParseError';
    this.rawResponse = rawResponse;
    this.usage = usage;
    this.rawChoiceMessage = rawChoiceMessage;
    this.reasoningContent = reasoningContent;
  }
}

/**
 * Internal field name stamped onto every AIUsageInfo shaped by callAI().
 * Used for cross-path dedup when the provider does not return a request_id.
 */
export const INTERNAL_CALL_ID_FIELD = '_midscene_call_id';

let internalCallIdCounter = 0;
export function nextInternalCallId(): string {
  internalCallIdCounter += 1;
  return `call_${internalCallIdCounter}`;
}

export function stringifyForDebug(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

export function getLatestSuccessfulResponseRequestId(
  context: OpenAIErrorResponseContext,
): string | undefined {
  return context.responseRequestIds?.reduce<string | undefined>(
    (latestRequestId, response) =>
      response.ok ? response.requestId : latestRequestId,
    undefined,
  );
}

export function getLatestResponseAttempt(context: OpenAIErrorResponseContext) {
  return context.httpResponses?.at(-1)?.attempt ?? 1;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function normalizeRetryCount(retryCount: unknown): number {
  if (typeof retryCount !== 'number' || !Number.isFinite(retryCount)) {
    return 1;
  }

  return Math.max(0, Math.floor(retryCount));
}

export function appendAIRequestFailureSummary<T extends Error>(
  error: T,
  attemptErrors: Array<{ attempt: number; error: unknown }>,
  maxAttempts: number,
): T {
  const failedAttempts = attemptErrors.length;
  const retries = Math.max(0, failedAttempts - 1);
  const retryLabel = retries === 1 ? 'retry' : 'retries';
  const originalMessage = error.message;
  const previousAttemptErrors = attemptErrors.slice(0, -1);

  error.message = `AI model request failed after ${retries} ${retryLabel} (${failedAttempts}/${maxAttempts} attempts). Last error: ${originalMessage}`;

  if (previousAttemptErrors.length === 0) {
    return error;
  }

  const details = previousAttemptErrors
    .map(
      ({ attempt, error }) => `Attempt ${attempt}: ${getErrorMessage(error)}`,
    )
    .join('\n');

  error.message = `${error.message}\nPrevious AI call attempt errors:\n${details}`;
  return error;
}

export const buildUsageInfo = ({
  usageData,
  requestId,
  timeCost,
  modelName,
  modelDescription,
  responseModelName,
  slot,
  internalCallId,
}: {
  usageData?: OpenAI.CompletionUsage;
  requestId?: string | null;
  timeCost?: number;
  modelName: string;
  modelDescription: string;
  responseModelName?: string;
  slot: ModelRuntime['config']['slot'];
  internalCallId: string;
}): AIUsageInfo | undefined => {
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
    slot,
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
