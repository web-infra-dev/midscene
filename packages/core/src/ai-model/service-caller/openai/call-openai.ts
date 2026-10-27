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
import { SiwcTokenExpiredError } from './siwc';

export type PreparedOpenAIInput =
  | {
      kind: 'chat-completion';
      input: Awaited<ReturnType<typeof prepareChatCompletion>>;
    }
  | {
      kind: 'responses';
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
  const isStreaming = options?.stream ?? modelConfig.streamMode === 'stream';
  const { openai, openAIRequestContext } = await createClient({
    modelConfig,
    proxyAgent: prepared.input.proxyAgent,
    effectiveTimeoutMs,
    executionId,
    recordEvent,
  });
  const debugCall = getDebug('ai:call');
  debugCall(
    `sending ${isStreaming ? 'streaming ' : ''}request to ${modelName}`,
  );
  const requestOptions = {
    requestSignal,
    openAIRequestContext,
    onChunk: options?.onChunk ?? (() => undefined),
    recordEvent,
  };
  try {
    const startTime = Date.now();
    const response =
      prepared.kind === 'responses'
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
    // Fetch already records non-2xx responses. Preserve successful HTTP
    // responses too when SDK parsing or completion validation fails.
    if (openAIRequestContext.httpResponse?.ok) {
      recordEvent?.({
        type: 'error',
        ...openAIRequestContext.httpResponse,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    getDebug('ai:call', {
      console: true,
      warning: { kind: 'model-request-detail', modelName, error },
    })('call AI error', error);
    if (error instanceof AIResponseParseError) {
      throw error;
    }
    const RequestError =
      modelConfig.authMode === 'siwc' &&
      error.status === 401 &&
      error.code === 'token_expired'
        ? SiwcTokenExpiredError
        : Error;
    throw new RequestError(
      `failed to call ${isStreaming ? 'streaming ' : ''}AI model service (${modelName}): ${error.message}${formatOpenAIAPIErrorDetails(error, openAIRequestContext)}\nTrouble shooting: https://midscenejs.com/model-config#verify-model-connectivity`,
      { cause: error },
    );
  }
}
