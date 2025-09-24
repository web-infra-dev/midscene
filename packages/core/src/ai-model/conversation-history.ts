import type { ChatCompletionMessageParam } from 'openai/resources/index';

export interface ConversationHistoryOptions {
  maxUserImageMessages?: number;
  initialMessages?: ChatCompletionMessageParam[];
}

export class ConversationHistory {
  private readonly maxUserImageMessages: number;
  private readonly messages: ChatCompletionMessageParam[] = [];

  constructor(options?: ConversationHistoryOptions) {
    this.maxUserImageMessages = options?.maxUserImageMessages ?? 4;
    if (options?.initialMessages?.length) {
      this.seed(options.initialMessages);
    }
  }

  append(message: ChatCompletionMessageParam) {
    if (message.role === 'user') {
      this.pruneOldestUserMessageIfNecessary();
    }

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

  snapshot(): ChatCompletionMessageParam[] {
    return [...this.messages];
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

  private pruneOldestUserMessageIfNecessary() {
    const userMessages = this.messages.filter((item) => item.role === 'user');
    if (userMessages.length < this.maxUserImageMessages) {
      return;
    }

    const firstUserMessageIndex = this.messages.findIndex(
      (item) => item.role === 'user',
    );

    if (firstUserMessageIndex >= 0) {
      this.messages.splice(firstUserMessageIndex, 1);
    }
  }
}
