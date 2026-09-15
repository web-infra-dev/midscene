import type { CodeGenerationChunk } from '@/types';
import { assert } from '@midscene/shared/utils';
import type OpenAI from 'openai';
import type { Stream } from 'openai/streaming';
import type { OpenAIProtocolCallResult } from '../types';
import type { ChatCompletionCallOptions } from './types';
import { resolveContentWithReasoningFallback } from './utils';

export const callChatCompletionStream = async ({
  completion,
  openAIRequestContext,
  modelRuntime,
  messages,
  requestBodyParams,
  requestSignal,
  onChunk,
  recordEvent,
}: ChatCompletionCallOptions): Promise<OpenAIProtocolCallResult> => {
  assert(
    typeof onChunk === 'function',
    'onChunk is required when stream is true',
  );
  const { adapter } = modelRuntime;
  const { modelName } = modelRuntime.config;
  let accumulated = '';
  let accumulatedReasoning = '';
  let usage: OpenAI.CompletionUsage | undefined;
  let responseModelName: string | undefined;
  requestSignal.throwIfAborted();
  const stream = (await completion.create(
    {
      model: modelName,
      messages,
      ...requestBodyParams,
      stream: true,
      stream_options: {
        ...(requestBodyParams.stream_options as
          | Record<string, unknown>
          | undefined),
        include_usage: true,
      },
    },
    {
      stream: true,
      signal: requestSignal,
    },
  )) as Stream<OpenAI.Chat.Completions.ChatCompletionChunk> & {
    _request_id?: string | null;
  };

  const requestId =
    stream._request_id ?? openAIRequestContext.responseRequestId?.requestId;

  let chunkSequence = 0;
  for await (const chunk of stream) {
    requestSignal.throwIfAborted();
    chunkSequence += 1;
    recordEvent?.({
      type: 'chunk',
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
  return {
    content: accumulated,
    reasoningContent: accumulatedReasoning,
    rawChoiceMessage: undefined,
    rawUsage: usage,
    requestId,
    responseModelName,
  };
};
