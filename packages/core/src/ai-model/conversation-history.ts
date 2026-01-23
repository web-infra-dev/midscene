import type { SubGoal } from '@/types';
import type { ChatCompletionMessageParam } from 'openai/resources/index';

export interface ConversationHistoryOptions {
  initialMessages?: ChatCompletionMessageParam[];
}

export class ConversationHistory {
  private readonly messages: ChatCompletionMessageParam[] = [];
  private subGoals: SubGoal[] = [];

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

  // Sub-goal management methods

  /**
   * Set all sub-goals, replacing any existing ones
   */
  setSubGoals(subGoals: SubGoal[]): void {
    this.subGoals = subGoals.map((goal) => ({ ...goal }));
  }

  /**
   * Update a single sub-goal by index
   * @returns true if the sub-goal was found and updated, false otherwise
   */
  updateSubGoal(
    index: number,
    updates: Partial<Omit<SubGoal, 'index'>>,
  ): boolean {
    const goal = this.subGoals.find((g) => g.index === index);
    if (!goal) {
      return false;
    }

    if (updates.status !== undefined) {
      goal.status = updates.status;
    }
    if (updates.description !== undefined) {
      goal.description = updates.description;
    }

    return true;
  }

  /**
   * Mark a sub-goal as finished
   * @returns true if the sub-goal was found and updated, false otherwise
   */
  markSubGoalFinished(index: number): boolean {
    return this.updateSubGoal(index, { status: 'finished' });
  }

  /**
   * Convert sub-goals to text representation
   */
  subGoalsToText(): string {
    if (this.subGoals.length === 0) {
      return '';
    }

    const lines = this.subGoals.map((goal) => {
      return `${goal.index}. ${goal.description} (${goal.status})`;
    });

    const currentGoal = this.subGoals.find((goal) => goal.status === 'pending');
    const currentGoalText = currentGoal
      ? `\nCurrent sub-goal is: ${currentGoal.description}`
      : '';

    return `Sub-goals:\n${lines.join('\n')}${currentGoalText}`;
  }
}
