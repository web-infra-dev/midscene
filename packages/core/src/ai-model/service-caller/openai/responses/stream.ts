import { assert } from '@midscene/shared/utils';
import type { Response } from 'openai/resources/responses/responses';
import type { OpenAIProtocolCallResult } from '../../types';
import { AIResponseParseError, hasUsableText } from '../../utils';
import type { ResponsesCallOptions } from './types';
import { parseResponse } from './utils';

export async function callResponsesStream({
  responses,
  requestBodyParams,
  requestSignal,
  openAIRequestContext,
  onChunk,
  recordEvent,
}: ResponsesCallOptions): Promise<OpenAIProtocolCallResult> {
  assert(
    typeof onChunk === 'function',
    'onChunk is required when stream is true',
  );
  requestSignal.throwIfAborted();
  const { data: stream, request_id: requestId } = await responses
    .create({ ...requestBodyParams, stream: true }, { signal: requestSignal })
    .withResponse();
  let accumulated = '';
  let finalResponse: Response | undefined;
  let sequence = 0;
  for await (const event of stream) {
    requestSignal.throwIfAborted();
    recordEvent?.({ type: 'chunk', sequence: ++sequence, chunk: event });
    if (event.type === 'error') {
      throw new Error(event.message);
    }
    if (
      event.type === 'response.failed' ||
      event.type === 'response.incomplete'
    ) {
      parseResponse(event.response);
    }
    if (event.type === 'response.completed') {
      finalResponse = event.response;
    }
    const content =
      event.type === 'response.output_text.delta' ? event.delta : '';
    const reasoningContent =
      event.type === 'response.reasoning_summary_text.delta' ||
      event.type === 'response.reasoning_text.delta'
        ? event.delta
        : '';
    if (content || reasoningContent) {
      accumulated += content;
      onChunk({
        content,
        reasoning_content: reasoningContent,
        accumulated,
        isComplete: false,
      });
    }
  }
  requestSignal.throwIfAborted();
  assert(finalResponse, 'Responses stream ended without a completed response');
  const result = parseResponse(finalResponse);
  if (!hasUsableText(result.content)) {
    throw new AIResponseParseError(
      'empty content from AI model',
      result.content,
      undefined,
      result.rawAssistantOutput,
    );
  }
  onChunk({
    content: '',
    reasoning_content: '',
    accumulated: result.content,
    isComplete: true,
    usage: result.rawUsage,
  });
  return {
    ...result,
    requestId: requestId ?? openAIRequestContext.responseRequestId?.requestId,
  };
}
