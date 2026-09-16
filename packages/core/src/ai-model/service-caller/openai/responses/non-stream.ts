import type { OpenAIProtocolCallResult } from '../../types';
import { AIResponseParseError, hasUsableText } from '../../utils';
import type { ResponsesCallOptions } from './types';
import { parseResponse } from './utils';

export async function callResponsesNonStreaming({
  responses,
  requestBodyParams,
  requestSignal,
  openAIRequestContext,
}: ResponsesCallOptions): Promise<OpenAIProtocolCallResult> {
  requestSignal.throwIfAborted();
  const response = await responses.create(
    { ...requestBodyParams, stream: false },
    { signal: requestSignal },
  );
  requestSignal.throwIfAborted();
  const result = parseResponse(response);
  if (!hasUsableText(result.content)) {
    throw new AIResponseParseError(
      'empty content from AI model',
      result.content,
      undefined,
      result.rawChoiceMessage,
    );
  }
  return {
    ...result,
    requestId:
      response._request_id ?? openAIRequestContext.responseRequestId?.requestId,
  };
}
