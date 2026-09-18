import type { OpenAIProtocolCallResult } from '../../types';
import { AIResponseParseError, hasUsableText } from '../../utils';
import type { ChatCompletionCallOptions } from './types';
import { resolveContentWithReasoningFallback } from './utils';

export const callChatCompletionNonStreaming = async ({
  completion,
  openAIRequestContext,
  extractContentAndReasoning,
  useReasoningAsContentFallback,
  requestBodyParams,
  requestSignal,
}: ChatCompletionCallOptions): Promise<OpenAIProtocolCallResult> => {
  requestSignal.throwIfAborted();
  const result = await completion.create(
    {
      ...requestBodyParams,
      stream: false,
    },
    { signal: requestSignal },
  );

  requestSignal.throwIfAborted();

  const requestId =
    result._request_id ?? openAIRequestContext.responseRequestId?.requestId;

  if (!result.choices) {
    throw new Error(
      `invalid response from LLM service: ${JSON.stringify(result)}`,
    );
  }

  const rawAssistantOutput = result.choices[0].message;
  const parsedMessage = extractContentAndReasoning(result.choices[0].message);
  const reasoningContent = parsedMessage.reasoning_content;
  const content = resolveContentWithReasoningFallback({
    content: parsedMessage.content,
    reasoningContent,
    useReasoningAsContentFallback,
  });

  if (!hasUsableText(content)) {
    throw new AIResponseParseError(
      'empty content from AI model',
      content || '',
      undefined,
      rawAssistantOutput,
    );
  }

  return {
    content,
    reasoningContent,
    rawAssistantOutput,
    rawUsage: result.usage,
    requestId,
    responseModelName: result.model,
  };
};
