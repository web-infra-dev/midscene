import type { ResolveImageDetail } from '../../model-adapter/types';
import type { ModelCallContext, ModelCallResult } from '../types';
import {
  type CodexAppServerRecordEvent,
  callAIWithCodexAppServer,
} from './codex-app-server';

export const prepareCodexCall = ({
  messages,
  modelRuntime,
  options,
}: Pick<ModelCallContext, 'messages' | 'modelRuntime' | 'options'>) => {
  const { config: modelConfig, adapter } = modelRuntime;
  const { config } = adapter.buildCodexAppServerParams({
    intent: modelConfig.intent,
    userConfig: {
      reasoningEnabled: modelConfig.reasoningEnabled,
      reasoningEffort: modelConfig.reasoningEffort,
      reasoningBudget: modelConfig.reasoningBudget,
    },
    requiresOriginalImageDetail: options?.requiresOriginalImageDetail,
  });
  const resolveImageDetail: ResolveImageDetail = ({ imageDetail }) =>
    adapter.resolveImageDetail({
      imageDetail,
      intent: modelConfig.intent,
      requiresOriginalImageDetail: options?.requiresOriginalImageDetail,
    });
  return { messages, resolveImageDetail, requestParams: config };
};

export const callCodex = async (
  { modelRuntime, options, recordEvent, requestSignal }: ModelCallContext,
  {
    messages,
    resolveImageDetail,
    requestParams,
  }: ReturnType<typeof prepareCodexCall>,
): Promise<ModelCallResult> => {
  const { config: modelConfig } = modelRuntime;
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
    const codexResult = await callAIWithCodexAppServer(messages, modelConfig, {
      stream: options?.stream,
      onChunk: options?.onChunk,
      params: requestParams,
      resolveImageDetail,
      abortSignal: requestSignal,
      onRecordEvent: recordCodexEvent,
    });
    requestSignal.throwIfAborted();
    const { protocolMetadata, usage: rawUsage, ...response } = codexResult;
    const timeCost = Date.now() - codexStartTime;
    recordEvent?.({
      type: 'response',
      attempt: 1,
      provider: 'codex-app-server',
      final: {
        content: response.content,
        reasoningContent: response.reasoning_content,
        usage: rawUsage,
        timeCost,
        protocol: protocolMetadata,
      },
    });
    return {
      ...response,
      rawUsage,
      timeCost,
      requestId: protocolMetadata.turnId,
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
