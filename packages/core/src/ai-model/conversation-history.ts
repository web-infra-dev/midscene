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
}
