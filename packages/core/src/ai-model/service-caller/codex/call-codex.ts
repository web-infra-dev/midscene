import type { AICallResult, ModelCallContext } from '../types';
import { INTERNAL_CALL_ID_FIELD } from '../utils';
import {
  type CodexAppServerRecordEvent,
  callAIWithCodexAppServer,
} from './codex-app-server';

export const callCodex = async ({
  messages,
  modelRuntime,
  options,
  internalCallId,
  recordEvent,
}: ModelCallContext): Promise<AICallResult> => {
  const { config: modelConfig, adapter } = modelRuntime;
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
    const { config, imageDetail } = adapter.buildCodexAppServerParams({
      intent: modelConfig.intent,
      userConfig: {
        reasoningEnabled: modelConfig.reasoningEnabled,
        reasoningEffort: modelConfig.reasoningEffort,
        reasoningBudget: modelConfig.reasoningBudget,
      },
      requiresOriginalImageDetail: options?.requiresOriginalImageDetail,
    });
    const codexResult = await callAIWithCodexAppServer(messages, modelConfig, {
      stream: options?.stream,
      onChunk: options?.onChunk,
      params: config,
      abortSignal: options?.abortSignal,
      imageDetail,
      onRecordEvent: recordCodexEvent,
    });
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
};
