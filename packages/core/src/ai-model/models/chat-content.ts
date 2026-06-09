import type { ChatCompletionContentSource, ContentAndReasoning } from './types';

export function defaultExtractContentAndReasoning(
  message: ChatCompletionContentSource | undefined,
): ContentAndReasoning {
  if (!message) {
    return {
      content: '',
      reasoning_content: '',
    };
  }

  const messageReasoning =
    typeof message.reasoning_content === 'string'
      ? message.reasoning_content
      : '';

  return {
    content: typeof message.content === 'string' ? message.content : '',
    reasoning_content: messageReasoning,
  };
}
