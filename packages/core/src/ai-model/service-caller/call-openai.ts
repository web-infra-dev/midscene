import { getDebug } from '@midscene/shared/logger';
import {
  callChatCompletion,
  type prepareChatCompletion,
} from './chat-completion/chat-completion';
import { createChatClient } from './openai-client';
import { formatOpenAIAPIErrorDetails } from './openai-request-context';
import type {
  ModelCallContext,
  ModelCallResult,
  OpenAIProtocolCallOptions,
} from './types';
import { AIResponseParseError } from './utils';

export async function callOpenAI(
  {
    modelRuntime,
    options,
    executionId,
    recordEvent,
    requestSignal,
    effectiveTimeoutMs,
  }: ModelCallContext,
  prepared: Awaited<ReturnType<typeof prepareChatCompletion>>,
): Promise<ModelCallResult> {
  const { config: modelConfig } = modelRuntime;
  const { modelName } = modelConfig;
  const { completion, openAIRequestContext } = await createChatClient({
    modelConfig,
    proxyAgent: prepared.proxyAgent,
    effectiveTimeoutMs,
    executionId,
    recordEvent,
  });
  const isStreaming = options?.stream === true;
  const debugCall = getDebug('ai:call');
  debugCall(
    `sending ${isStreaming ? 'streaming ' : ''}request to ${modelName}`,
  );
  const requestOptions: OpenAIProtocolCallOptions = {
    requestSignal,
    openAIRequestContext,
    onChunk: options?.onChunk,
    recordEvent,
  };
  try {
    const startTime = Date.now();
    const response = await callChatCompletion(
      {
        ...requestOptions,
        completion,
        modelRuntime,
        messages: prepared.messages,
        requestBodyParams: prepared.requestParams,
      },
      isStreaming,
    );
    const { reasoningContent, ...result } = response;
    requestSignal.throwIfAborted();
    const timeCost = Date.now() - startTime;
    debugCall(`response reasoning content: ${reasoningContent}`);
    debugCall(`response content: ${result.content}`);
    recordEvent?.({
      type: 'response',
      http: openAIRequestContext.httpResponse,
      final: {
        content: result.content,
        reasoningContent,
        usage: result.rawUsage,
        requestId: result.requestId,
        timeCost,
        responseModelName: result.responseModelName,
      },
    });
    return {
      ...result,
      reasoning_content: reasoningContent,
      isStreamed: isStreaming,
      timeCost,
    };
  } catch (error: any) {
    getDebug('ai:call', { console: true })('call AI error', error);
    if (error instanceof AIResponseParseError) {
      throw error;
    }
    throw new Error(
      `failed to call ${isStreaming ? 'streaming ' : ''}AI model service (${modelName}): ${error.message}${formatOpenAIAPIErrorDetails(error, openAIRequestContext)}\nTrouble shooting: https://midscenejs.com/model-provider.html`,
      { cause: error },
    );
  }
}
