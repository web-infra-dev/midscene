import { getDebug } from '@midscene/shared/logger';
import type { ModelCallContext, ModelCallResult } from '../types';
import { AIResponseParseError } from '../utils';
import {
  callChatCompletion,
  type prepareChatCompletion,
} from './chat-completion/chat-completion';
import { createClient } from './openai-client';
import { formatOpenAIAPIErrorDetails } from './openai-request-context';
import { callResponses, type prepareResponses } from './responses/responses';

export type PreparedOpenAIInput =
  | {
      protocol: 'chat-completion';
      input: Awaited<ReturnType<typeof prepareChatCompletion>>;
    }
  | {
      protocol: 'responses';
      input: Awaited<ReturnType<typeof prepareResponses>>;
    };

export async function callOpenAI(
  {
    modelRuntime,
    options,
    executionId,
    recordEvent,
    requestSignal,
    effectiveTimeoutMs,
  }: ModelCallContext,
  prepared: PreparedOpenAIInput,
): Promise<ModelCallResult> {
  const { config: modelConfig } = modelRuntime;
  const { modelName } = modelConfig;
  const { openai, openAIRequestContext } = await createClient({
    modelConfig,
    proxyAgent: prepared.input.proxyAgent,
    effectiveTimeoutMs,
    executionId,
    recordEvent,
  });
  const isStreaming = options?.stream === true;
  const debugCall = getDebug('ai:call');
  debugCall(
    `sending ${isStreaming ? 'streaming ' : ''}request to ${modelName}`,
  );
  const requestOptions = {
    requestSignal,
    openAIRequestContext,
    onChunk: options?.onChunk,
    recordEvent,
  };
  try {
    const startTime = Date.now();
    const response =
      prepared.protocol === 'responses'
        ? await callResponses(
            {
              ...requestOptions,
              responses: openai.responses,
              requestBodyParams: prepared.input.requestParams,
            },
            isStreaming,
          )
        : await callChatCompletion(
            {
              ...requestOptions,
              completion: openai.chat.completions,
              requestBodyParams: prepared.input.requestParams,
              extractContentAndReasoning:
                prepared.input.extractContentAndReasoning,
              useReasoningAsContentFallback:
                prepared.input.useReasoningAsContentFallback,
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
