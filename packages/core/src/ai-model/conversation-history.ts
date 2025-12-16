import type { ChatCompletionMessageParam } from 'openai/resources/index';

export interface ConversationHistoryOptions {
  maxUserImageMessages?: number;
  initialMessages?: ChatCompletionMessageParam[];
}

const defaultMaxUserImagesCount = 6;

export class ConversationHistory {
  private readonly maxUserImageMessages: number;
  private readonly messages: ChatCompletionMessageParam[] = [];

  constructor(options?: ConversationHistoryOptions) {
    this.maxUserImageMessages =
      options?.maxUserImageMessages ?? defaultMaxUserImagesCount;
    if (options?.initialMessages?.length) {
      this.seed(options.initialMessages);
    }
  }

  append(message: ChatCompletionMessageParam) {
    this.messages.push(message);
  }

  seed(messages: ChatCompletionMessageParam[]) {
    this.reset();
    messages.forEach((message) => {
      this.append(message);
    });
  }

  reset() {
    this.messages.length = 0;
  }

  snapshot(options?: {
    maxImageMessages?: number;
  }): ChatCompletionMessageParam[] {
    const maxImageMessages =
      options?.maxImageMessages ?? this.maxUserImageMessages;

    // Count image_url messages from back to front
    let imageCount = 0;
    const processedMessages = [...this.messages]
      .reverse()
      .map((message): ChatCompletionMessageParam => {
        if (
          typeof message.content !== 'string' &&
          Array.isArray(message.content)
        ) {
          // Also process content items from back to front
          const processedContent = [...message.content]
            .reverse()
            .map((item) => {
              if (item.type === 'image_url') {
                imageCount++;
                if (imageCount > maxImageMessages) {
                  // Replace with text type
                  return {
                    type: 'text' as const,
                    text: '(omitted due to size limit)',
                  };
                }
              }
              return item;
            })
            .reverse();
          return {
            ...message,
            content: processedContent,
          } as ChatCompletionMessageParam;
        }
        return message;
      });

    return processedMessages.reverse();
  }

  get length(): number {
    return this.messages.length;
  }

  [Symbol.iterator](): IterableIterator<ChatCompletionMessageParam> {
    return this.messages[Symbol.iterator]();
  }

  toJSON(): ChatCompletionMessageParam[] {
    return this.snapshot();
  }
}
