import { assert, uuid } from '@midscene/shared/utils';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { ModelRuntime } from '../models';
import { chat } from './chat-completion/call';
import { callCodex } from './codex/call-codex';
import { isCodexAppServerProvider } from './codex/codex-app-server';
import {
  isModelCallRecordingEnabled,
  recordModelCallEvent,
} from './model-call-recorder';
import type { AICallResult, CallAIOptions, ModelCallContext } from './types';
import { nextInternalCallId } from './utils';

export async function callAI(
  messages: ChatCompletionMessageParam[],
  modelRuntime: ModelRuntime,
  options?: CallAIOptions,
): Promise<AICallResult> {
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

  const context: ModelCallContext = {
    messages,
    modelRuntime,
    modelCallInput: {
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
    },
    options,
    executionId,
    internalCallId,
    recordEvent,
  };

  return isCodexAppServerProvider(modelConfig.openaiBaseURL)
    ? callCodex(context)
    : chat(context);
}
