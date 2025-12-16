import type { ChatCompletionMessageParam } from 'openai/resources/index';

export interface ConversationHistoryOptions {
  initialMessages?: ChatCompletionMessageParam[];
}

export class ConversationHistory {
  private readonly messages: ChatCompletionMessageParam[] = [];

  public pendingFeedbackMessage: string;

  constructor(options?: ConversationHistoryOptions) {
    if (options?.initialMessages?.length) {
      this.seed(options.initialMessages);
    }
    this.pendingFeedbackMessage = '';
  }

  resetPendingFeedbackMessageIfExists() {
    if (this.pendingFeedbackMessage) {
      this.pendingFeedbackMessage = '';
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

  /**
   * Snapshot the conversation history, and replace the images with text if the number of images exceeds the limit.
   * @param maxImages - The maximum number of images to include in the snapshot. Undefined means no limit.
   * @returns The snapshot of the conversation history.
   */
  snapshot(maxImages?: number): ChatCompletionMessageParam[] {
    if (maxImages === undefined) {
      return [...this.messages];
    }

    const clonedMessages = structuredClone(this.messages);
    let imageCount = 0;

    // Traverse from the end to the beginning
    for (let i = clonedMessages.length - 1; i >= 0; i--) {
      const message = clonedMessages[i];
      const content = message.content;

      // Only process if content is an array
      if (Array.isArray(content)) {
        for (let j = 0; j < content.length; j++) {
          const item = content[j];

          // Check if this is an image
          if (item.type === 'image_url') {
            imageCount++;

            // If we've exceeded the limit, replace with text
            if (imageCount > maxImages) {
              content[j] = {
                type: 'text',
                text: '(image ignored due to size optimization)',
              };
            }
          }
        }
      }
    }

    return clonedMessages;
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
