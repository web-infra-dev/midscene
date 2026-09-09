import type { CodeGenerationChunk } from '@/types';
import type OpenAI from 'openai';
import type { Stream } from 'openai/streaming';
import {
  buildRequestAbortSignal,
  restoreHardTimeoutError,
} from '../request-timeout';
import {
  getLatestResponseAttempt,
  getLatestSuccessfulResponseRequestId,
  toError,
} from '../utils';
import type {
  ChatCompletionCallResult,
  StreamingChatCompletionCallOptions,
} from './types';
import { resolveContentWithReasoningFallback } from './utils';

export const callChatCompletionStream = async ({
  completion,
  modelName,
  openAIErrorResponseContext,
  modelRuntime,
  messages,
  requestConfig,
  effectiveTimeoutMs,
  abortSignal,
  onChunk,
  recordEvent,
}: StreamingChatCompletionCallOptions): Promise<ChatCompletionCallResult> => {
  const { adapter } = modelRuntime;
  let accumulated = '';
  let accumulatedReasoning = '';
  let usage: OpenAI.CompletionUsage | undefined;
  let requestId: string | null | undefined;
  let responseModelName: string | undefined;
  const { signal: streamSignal, cleanup: cleanupStreamSignal } =
    buildRequestAbortSignal(effectiveTimeoutMs, abortSignal);
  try {
    const stream = (await completion.create(
      {
        model: modelName,
        messages,
        ...requestConfig,
        stream: true,
        stream_options: {
          ...(requestConfig.stream_options as
            | Record<string, unknown>
            | undefined),
          include_usage: true,
        },
      },
      {
        stream: true,
        signal: streamSignal,
      },
    )) as Stream<OpenAI.Chat.Completions.ChatCompletionChunk> & {
      _request_id?: string | null;
    };

    requestId =
      getLatestSuccessfulResponseRequestId(openAIErrorResponseContext) ??
      stream._request_id;
    const streamAttempt = getLatestResponseAttempt(openAIErrorResponseContext);

    let chunkSequence = 0;
    for await (const chunk of stream) {
      chunkSequence += 1;
      recordEvent?.({
        type: 'chunk',
        attempt: streamAttempt,
        sequence: chunkSequence,
        chunk,
      });
      const parsedChunk = adapter.chatCompletion.extractContentAndReasoning(
        chunk.choices?.[0]?.delta,
      );
      const content = parsedChunk.content || '';
      const reasoning_content = parsedChunk.reasoning_content || '';

      // Check for usage info in any chunk (OpenAI provides usage in separate chunks)
      if (chunk.usage) {
        usage = chunk.usage;
      }
      if (chunk.model) {
        responseModelName = chunk.model;
      }

      if (content || reasoning_content) {
        accumulated += content;
        accumulatedReasoning += reasoning_content;
        const chunkData: CodeGenerationChunk = {
          content,
          reasoning_content,
          accumulated,
          isComplete: false,
          usage: undefined,
        };
        onChunk(chunkData);
      }
    }

    const finalAccumulated = resolveContentWithReasoningFallback({
      content: accumulated,
      reasoningContent: accumulatedReasoning,
      useReasoningAsContentFallback:
        adapter.chatCompletion.useReasoningAsContentFallback,
    });
    accumulated = finalAccumulated || '';

    // Send final chunk
    const finalChunk: CodeGenerationChunk = {
      content: '',
      accumulated,
      reasoning_content: '',
      isComplete: true,
      usage,
    };
    onChunk(finalChunk);
  } catch (error) {
    throw restoreHardTimeoutError(toError(error), streamSignal);
  } finally {
    cleanupStreamSignal();
  }
  return {
    content: accumulated,
    accumulatedReasoning,
    rawChoiceMessage: undefined,
    usage,
    requestId,
    responseModelName,
  };
};
