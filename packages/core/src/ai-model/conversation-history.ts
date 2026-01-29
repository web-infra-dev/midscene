import type { SubGoal } from '@/types';
import type { ChatCompletionMessageParam } from 'openai/resources/index';

export interface ConversationHistoryOptions {
  initialMessages?: ChatCompletionMessageParam[];
}

export class ConversationHistory {
  private readonly messages: ChatCompletionMessageParam[] = [];
  private subGoals: SubGoal[] = [];
  private memories: string[] = [];

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
   * Set all sub-goals, replacing any existing ones.
   * Automatically marks the first pending goal as running.
   */
  setSubGoals(subGoals: SubGoal[]): void {
    this.subGoals = subGoals.map((goal) => ({ ...goal }));
    this.markFirstPendingAsRunning();
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
   * Mark the first pending sub-goal as running
   */
  markFirstPendingAsRunning(): void {
    const firstPending = this.subGoals.find((g) => g.status === 'pending');
    if (firstPending) {
      firstPending.status = 'running';
    }
  }

  /**
   * Mark a sub-goal as finished.
   * Automatically marks the next pending goal as running.
   * @returns true if the sub-goal was found and updated, false otherwise
   */
  markSubGoalFinished(index: number): boolean {
    const result = this.updateSubGoal(index, { status: 'finished' });
    if (result) {
      this.markFirstPendingAsRunning();
    }
    return result;
  }

  /**
   * Mark all sub-goals as finished
   */
  markAllSubGoalsFinished(): void {
    for (const goal of this.subGoals) {
      goal.status = 'finished';
    }
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

    // Running goal takes priority, otherwise show first pending
    const currentGoal =
      this.subGoals.find((goal) => goal.status === 'running') ||
      this.subGoals.find((goal) => goal.status === 'pending');
    const currentGoalText = currentGoal
      ? `\nCurrent sub-goal is: ${currentGoal.description}`
      : '';

    return `Sub-goals:\n${lines.join('\n')}${currentGoalText}`;
  }

  // Memory management methods

  /**
   * Append a memory to the memories list
   */
  appendMemory(memory: string): void {
    if (memory) {
      this.memories.push(memory);
    }
  }

  /**
   * Get all memories
   */
  getMemories(): string[] {
    return [...this.memories];
  }

  /**
   * Convert memories to text representation
   */
  memoriesToText(): string {
    if (this.memories.length === 0) {
      return '';
    }

    return `Memories from previous steps:\n---\n${this.memories.join('\n---\n')}\n`;
  }

  /**
   * Clear all memories
   */
  clearMemories(): void {
    this.memories.length = 0;
  }

  /**
   * Compress the conversation history if it exceeds the threshold.
   * Removes the oldest messages and replaces them with a single placeholder message.
   * @param threshold - The number of messages that triggers compression.
   * @param keepCount - The number of recent messages to keep after compression.
   * @returns true if compression was performed, false otherwise.
   */
  compressHistory(threshold: number, keepCount: number): boolean {
    if (this.messages.length <= threshold) {
      return false;
    }

    const omittedCount = this.messages.length - keepCount;
    const omittedPlaceholder: ChatCompletionMessageParam = {
      role: 'user',
      content: `(${omittedCount} previous conversation messages have been omitted)`,
    };

    // Keep only the last `keepCount` messages
    const recentMessages = this.messages.slice(-keepCount);

    // Reset and rebuild with placeholder + recent messages
    this.messages.length = 0;
    this.messages.push(omittedPlaceholder);
    for (const msg of recentMessages) {
      this.messages.push(msg);
    }

    return true;
  }
}
