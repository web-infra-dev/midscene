import { AIResponseParseError } from '../utils';
import type {
  ChatCompletionCallOptions,
  ChatCompletionCallResult,
} from './types';
import { hasUsableText, resolveContentWithReasoningFallback } from './utils';

export const callChatCompletionNonStreaming = async ({
  completion,
  openAIRequestContext,
  modelRuntime,
  messages,
  requestBodyParams,
  requestSignal,
}: ChatCompletionCallOptions): Promise<ChatCompletionCallResult> => {
  const {
    config: { modelName },
    adapter,
  } = modelRuntime;
  requestSignal.throwIfAborted();
  const result = await completion.create(
    {
      model: modelName,
      messages,
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

  const rawChoiceMessage = result.choices[0].message;
  const parsedMessage = adapter.chatCompletion.extractContentAndReasoning(
    result.choices[0].message,
  );
  const reasoningContent = parsedMessage.reasoning_content;
  const content = resolveContentWithReasoningFallback({
    content: parsedMessage.content,
    reasoningContent,
    useReasoningAsContentFallback:
      adapter.chatCompletion.useReasoningAsContentFallback,
  });

  if (!hasUsableText(content)) {
    throw new AIResponseParseError(
      'empty content from AI model',
      content || '',
      undefined,
      rawChoiceMessage,
    );
  }

  return {
    content,
    reasoningContent,
    rawChoiceMessage,
    rawUsage: result.usage,
    requestId,
    responseModelName: result.model,
  };
};
