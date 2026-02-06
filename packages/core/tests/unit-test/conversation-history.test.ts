import { ConversationHistory } from '@/ai-model';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { describe, expect, it } from 'vitest';

const userMessage = (content: string) => ({
  role: 'user' as const,
  content,
});

const assistantMessage = (content: string) => ({
  role: 'assistant' as const,
  content,
});

const userMessageWithImage = (text: string, imageUrl: string) => ({
  role: 'user' as const,
  content: [
    { type: 'text' as const, text },
    { type: 'image_url' as const, image_url: { url: imageUrl } },
  ],
});

const ignoredImagePlaceholder = {
  type: 'text' as const,
  text: '(image ignored due to size optimization)',
};

describe('ConversationHistory', () => {
  it('resets state and seeds new messages', () => {
    const history = new ConversationHistory();
    history.append(assistantMessage('greet'));
    history.append(userMessage('question'));

    history.seed([assistantMessage('seeded'), userMessage('follow-up')]);

    expect(history.snapshot()).toEqual([
      assistantMessage('seeded'),
      userMessage('follow-up'),
    ]);
    expect(history.length).toBe(2);
  });

  it('reset clears messages, memories, and subGoals', () => {
    const history = new ConversationHistory();
    history.append(userMessage('msg1'));
    history.append(assistantMessage('msg2'));
    history.appendMemory('Memory from task 1');
    history.appendMemory('Another memory');
    history.setSubGoals([
      { index: 1, status: 'pending', description: 'Sub-goal 1' },
      { index: 2, status: 'pending', description: 'Sub-goal 2' },
    ]);

    history.appendHistoricalLog('Step 1');
    history.appendHistoricalLog('Step 2');

    history.reset();

    expect(history.length).toBe(0);
    expect(history.snapshot()).toEqual([]);
    expect(history.getMemories()).toEqual([]);
    expect(history.memoriesToText()).toBe('');
    expect(history.subGoalsToText()).toBe('');
    expect(history.historicalLogsToText()).toBe('');
  });

  it('clears pending feedback message only when set', () => {
    const history = new ConversationHistory();

    expect(history.pendingFeedbackMessage).toBe('');

    history.resetPendingFeedbackMessageIfExists();
    expect(history.pendingFeedbackMessage).toBe('');

    history.pendingFeedbackMessage = 'Need a screenshot';
    history.resetPendingFeedbackMessageIfExists();
    expect(history.pendingFeedbackMessage).toBe('');

    history.pendingFeedbackMessage = '';
    history.resetPendingFeedbackMessageIfExists();
    expect(history.pendingFeedbackMessage).toBe('');
  });

  it('returns independent snapshot copies', () => {
    const history = new ConversationHistory();
    history.append(assistantMessage('hello'));
    const snapshot = history.snapshot();
    snapshot.push(userMessage('mutated'));

    expect(history.length).toBe(1);
    expect(history.snapshot()).toEqual([assistantMessage('hello')]);
  });

  it('returns image messages without modification', () => {
    const history = new ConversationHistory();

    const messageWithTwoImages: ChatCompletionMessageParam = {
      role: 'user',
      content: [
        { type: 'text', text: 'Look at these' },
        { type: 'image_url', image_url: { url: 'data:image1' } },
        { type: 'image_url', image_url: { url: 'data:image2' } },
      ],
    };

    history.append(userMessageWithImage('first', 'data:image1'));
    history.append(assistantMessage('ack1'));
    history.append(messageWithTwoImages);

    const snapshot = history.snapshot();

    expect(snapshot[0]).toEqual(userMessageWithImage('first', 'data:image1'));
    expect(snapshot[1]).toEqual(assistantMessage('ack1'));
    expect(snapshot[2]).toEqual(messageWithTwoImages);
  });

  it('replaces older images with text when exceeding the maxImages limit', () => {
    const history = new ConversationHistory();

    const messageWithTwoImages: ChatCompletionMessageParam = {
      role: 'user',
      content: [
        { type: 'text', text: 'More images' },
        { type: 'image_url', image_url: { url: 'data:image2' } },
        { type: 'image_url', image_url: { url: 'data:image3' } },
      ],
    };

    history.append(userMessageWithImage('first', 'data:image1'));
    history.append(assistantMessage('ack'));
    history.append(messageWithTwoImages);

    const snapshotWithLimit = history.snapshot(1);

    expect(snapshotWithLimit[0]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'first' }, ignoredImagePlaceholder],
    });
    expect(snapshotWithLimit[2]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'More images' },
        { type: 'image_url', image_url: { url: 'data:image2' } },
        ignoredImagePlaceholder,
      ],
    });

    // Original history remains unchanged
    const snapshotWithoutLimit = history.snapshot();
    expect(snapshotWithoutLimit[0]).toEqual(
      userMessageWithImage('first', 'data:image1'),
    );
    expect(snapshotWithoutLimit[2]).toEqual(messageWithTwoImages);
  });

  // Sub-goal management tests

  it('initializes with empty sub-goals', () => {
    const history = new ConversationHistory();
    expect(history.subGoalsToText()).toMatchInlineSnapshot(`""`);
  });

  it('sets all sub-goals and marks first pending as running', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'finished', description: 'Done task' },
      { index: 2, status: 'pending', description: 'Todo task' },
    ]);

    // First pending is automatically marked as running
    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. Done task (finished)
      2. Todo task (running)
      Current sub-goal is: Todo task"
    `);
  });

  it('replaces existing sub-goals when setSubGoals is called', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'pending', description: 'Old goal' },
    ]);

    history.setSubGoals([
      { index: 1, status: 'pending', description: 'New goal 1' },
      { index: 2, status: 'pending', description: 'New goal 2' },
    ]);

    // First pending is automatically marked as running
    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. New goal 1 (running)
      2. New goal 2 (pending)
      Current sub-goal is: New goal 1"
    `);
  });

  it('updates a single sub-goal by index', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'pending', description: 'First' },
      { index: 2, status: 'pending', description: 'Second' },
    ]);

    // After setSubGoals, first is running, second is pending
    const result = history.updateSubGoal(1, { status: 'finished' });

    expect(result).toBe(true);
    // updateSubGoal doesn't auto-promote, only markSubGoalFinished does
    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. First (finished)
      2. Second (pending)
      Current sub-goal is: Second"
    `);
  });

  it('updates description of a sub-goal', () => {
    const history = new ConversationHistory();
    history.setSubGoals([{ index: 1, status: 'pending', description: 'Old' }]);

    history.updateSubGoal(1, { description: 'Updated description' });

    // First pending was marked as running by setSubGoals
    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. Updated description (running)
      Current sub-goal is: Updated description"
    `);
  });

  it('returns false when updating non-existent sub-goal', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'pending', description: 'First' },
    ]);

    const result = history.updateSubGoal(99, { status: 'finished' });

    expect(result).toBe(false);
  });

  it('marks a sub-goal as finished and promotes next pending to running', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'pending', description: 'Task 1' },
      { index: 2, status: 'pending', description: 'Task 2' },
    ]);

    // After setSubGoals: Task 1 is running, Task 2 is pending
    const result = history.markSubGoalFinished(1);

    expect(result).toBe(true);
    // After markSubGoalFinished: Task 1 is finished, Task 2 is promoted to running
    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. Task 1 (finished)
      2. Task 2 (running)
      Current sub-goal is: Task 2"
    `);
  });

  it('returns false when marking non-existent sub-goal as finished', () => {
    const history = new ConversationHistory();
    const result = history.markSubGoalFinished(1);
    expect(result).toBe(false);
  });

  it('marks all sub-goals as finished', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'pending', description: 'Task 1' },
      { index: 2, status: 'pending', description: 'Task 2' },
      { index: 3, status: 'pending', description: 'Task 3' },
    ]);

    history.markAllSubGoalsFinished();

    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. Task 1 (finished)
      2. Task 2 (finished)
      3. Task 3 (finished)"
    `);
  });

  it('marks all sub-goals as finished when some are already finished', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'finished', description: 'Task 1' },
      { index: 2, status: 'pending', description: 'Task 2' },
    ]);

    history.markAllSubGoalsFinished();

    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. Task 1 (finished)
      2. Task 2 (finished)"
    `);
  });

  it('handles markAllSubGoalsFinished with empty sub-goals', () => {
    const history = new ConversationHistory();
    history.markAllSubGoalsFinished();
    expect(history.subGoalsToText()).toMatchInlineSnapshot(`""`);
  });

  it('markFirstPendingAsRunning only affects first pending goal', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'finished', description: 'Task 1' },
      { index: 2, status: 'pending', description: 'Task 2' },
      { index: 3, status: 'pending', description: 'Task 3' },
    ]);

    // setSubGoals already called markFirstPendingAsRunning, so Task 2 is running
    // Task 3 should still be pending
    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. Task 1 (finished)
      2. Task 2 (running)
      3. Task 3 (pending)
      Current sub-goal is: Task 2"
    `);
  });

  it('does not change status when no pending goals exist', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'finished', description: 'Task 1' },
      { index: 2, status: 'finished', description: 'Task 2' },
    ]);

    // No pending goals, so no change
    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. Task 1 (finished)
      2. Task 2 (finished)"
    `);
  });

  it('subGoalsToText shows all sub-goals with their status', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'finished', description: 'Log in to the system' },
      { index: 2, status: 'finished', description: 'Complete to-do items' },
      { index: 3, status: 'pending', description: 'Submit the form' },
    ]);

    // First pending is automatically marked as running
    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. Log in to the system (finished)
      2. Complete to-do items (finished)
      3. Submit the form (running)
      Current sub-goal is: Submit the form"
    `);
  });

  // Sub-goal log tracking tests

  it('appends log to the currently running sub-goal', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'pending', description: 'Task 1' },
      { index: 2, status: 'pending', description: 'Task 2' },
    ]);

    // Task 1 is automatically running
    history.appendSubGoalLog('Clicked login button');
    history.appendSubGoalLog('Typed username');

    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. Task 1 (running)
      2. Task 2 (pending)
      Current sub-goal is: Task 1
      Actions performed for current sub-goal:
      - Clicked login button
      - Typed username"
    `);
  });

  it('ignores empty log strings', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'pending', description: 'Task 1' },
    ]);

    history.appendSubGoalLog('');
    history.appendSubGoalLog('Valid log');

    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. Task 1 (running)
      Current sub-goal is: Task 1
      Actions performed for current sub-goal:
      - Valid log"
    `);
  });

  it('does nothing when appending log with no running sub-goal', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'finished', description: 'Task 1' },
      { index: 2, status: 'finished', description: 'Task 2' },
    ]);

    history.appendSubGoalLog('Some log');

    // No running goal, so no logs appear
    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. Task 1 (finished)
      2. Task 2 (finished)"
    `);
  });

  it('clears logs when sub-goal status changes via markSubGoalFinished', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'pending', description: 'Task 1' },
      { index: 2, status: 'pending', description: 'Task 2' },
    ]);

    // Append logs to Task 1 (running)
    history.appendSubGoalLog('Step A');
    history.appendSubGoalLog('Step B');

    // Mark Task 1 finished -> Task 2 becomes running (logs cleared for both)
    history.markSubGoalFinished(1);

    // Task 2 is now running with no logs
    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. Task 1 (finished)
      2. Task 2 (running)
      Current sub-goal is: Task 2"
    `);
  });

  it('clears logs when sub-goal description changes via updateSubGoal', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'pending', description: 'Task 1' },
    ]);

    history.appendSubGoalLog('Did something');

    // Update description -> logs should be cleared
    history.updateSubGoal(1, { description: 'Updated Task 1' });

    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. Updated Task 1 (running)
      Current sub-goal is: Updated Task 1"
    `);
  });

  it('preserves logs when updateSubGoal sets same values', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'pending', description: 'Task 1' },
    ]);

    history.appendSubGoalLog('Did something');

    // Update with same status and description -> no change, logs preserved
    history.updateSubGoal(1, { status: 'running', description: 'Task 1' });

    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. Task 1 (running)
      Current sub-goal is: Task 1
      Actions performed for current sub-goal:
      - Did something"
    `);
  });

  it('clears logs when setSubGoals replaces all sub-goals', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'pending', description: 'Old task' },
    ]);

    history.appendSubGoalLog('Old log');

    // Replace all sub-goals
    history.setSubGoals([
      { index: 1, status: 'pending', description: 'New task' },
    ]);

    // New sub-goals start with no logs
    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. New task (running)
      Current sub-goal is: New task"
    `);
  });

  it('clears logs for non-finished goals when markAllSubGoalsFinished is called', () => {
    const history = new ConversationHistory();
    history.setSubGoals([
      { index: 1, status: 'pending', description: 'Task 1' },
      { index: 2, status: 'pending', description: 'Task 2' },
    ]);

    history.appendSubGoalLog('Some work');
    history.markAllSubGoalsFinished();

    // All finished, no current goal, no logs shown
    expect(history.subGoalsToText()).toMatchInlineSnapshot(`
      "Sub-goals:
      1. Task 1 (finished)
      2. Task 2 (finished)"
    `);
  });

  // Historical log management tests (non-deepThink mode)

  it('initializes with empty historical logs', () => {
    const history = new ConversationHistory();
    expect(history.historicalLogsToText()).toBe('');
  });

  it('appends historical logs', () => {
    const history = new ConversationHistory();
    history.appendHistoricalLog('Clicked the login button');
    history.appendHistoricalLog('Typed username into the input');

    expect(history.historicalLogsToText()).toMatchInlineSnapshot(`
      "Here are the steps that have been executed:
      - Clicked the login button
      - Typed username into the input"
    `);
  });

  it('ignores empty historical log strings', () => {
    const history = new ConversationHistory();
    history.appendHistoricalLog('');
    history.appendHistoricalLog('Valid step');
    history.appendHistoricalLog('');

    expect(history.historicalLogsToText()).toMatchInlineSnapshot(`
      "Here are the steps that have been executed:
      - Valid step"
    `);
  });

  it('accumulates historical logs across multiple rounds', () => {
    const history = new ConversationHistory();
    history.appendHistoricalLog('Step 1: Navigated to page');
    history.appendHistoricalLog('Step 2: Clicked search button');
    history.appendHistoricalLog('Step 3: Entered search query');

    expect(history.historicalLogsToText()).toMatchInlineSnapshot(`
      "Here are the steps that have been executed:
      - Step 1: Navigated to page
      - Step 2: Clicked search button
      - Step 3: Entered search query"
    `);
  });

  it('historical logs are independent from sub-goal logs', () => {
    const history = new ConversationHistory();

    // Set up sub-goals (deepThink mode scenario)
    history.setSubGoals([
      { index: 1, status: 'pending', description: 'Task 1' },
    ]);
    history.appendSubGoalLog('Sub-goal log entry');

    // Also add historical logs (non-deepThink mode scenario)
    history.appendHistoricalLog('Historical log entry');

    // Both should be independently tracked
    expect(history.subGoalsToText()).toContain('Sub-goal log entry');
    expect(history.historicalLogsToText()).toContain('Historical log entry');
    expect(history.historicalLogsToText()).not.toContain('Sub-goal log entry');
    expect(history.subGoalsToText()).not.toContain('Historical log entry');
  });

  // Memory management tests

  it('initializes with empty memories', () => {
    const history = new ConversationHistory();
    expect(history.getMemories()).toEqual([]);
    expect(history.memoriesToText()).toMatchInlineSnapshot(`""`);
  });

  it('appends memories to the list', () => {
    const history = new ConversationHistory();
    history.appendMemory('First memory');
    history.appendMemory('Second memory');

    expect(history.getMemories()).toEqual(['First memory', 'Second memory']);
  });

  it('ignores empty memories when appending', () => {
    const history = new ConversationHistory();
    history.appendMemory('Valid memory');
    history.appendMemory('');
    history.appendMemory('Another valid memory');

    expect(history.getMemories()).toEqual([
      'Valid memory',
      'Another valid memory',
    ]);
  });

  it('converts memories to text representation', () => {
    const history = new ConversationHistory();
    history.appendMemory('User logged in successfully');
    history.appendMemory('Found 3 items in the cart');

    expect(history.memoriesToText()).toMatchInlineSnapshot(`
      "Memories from previous steps:
      ---
      User logged in successfully
      ---
      Found 3 items in the cart
      "
    `);
  });

  it('clears all memories', () => {
    const history = new ConversationHistory();
    history.appendMemory('Memory 1');
    history.appendMemory('Memory 2');

    history.clearMemories();

    expect(history.getMemories()).toEqual([]);
    expect(history.memoriesToText()).toMatchInlineSnapshot(`""`);
  });

  it('returns independent copy of memories array', () => {
    const history = new ConversationHistory();
    history.appendMemory('Original memory');

    const memories = history.getMemories();
    memories.push('Mutated memory');

    expect(history.getMemories()).toEqual(['Original memory']);
  });

  // Compress history tests

  it('does not compress when message count is below threshold', () => {
    const history = new ConversationHistory();
    history.append(userMessage('msg1'));
    history.append(userMessage('msg2'));
    history.append(userMessage('msg3'));

    const result = history.compressHistory(5, 2);

    expect(result).toBe(false);
    expect(history.length).toBe(3);
    expect(history.snapshot()).toEqual([
      userMessage('msg1'),
      userMessage('msg2'),
      userMessage('msg3'),
    ]);
  });

  it('does not compress when message count equals threshold', () => {
    const history = new ConversationHistory();
    history.append(userMessage('msg1'));
    history.append(userMessage('msg2'));
    history.append(userMessage('msg3'));

    const result = history.compressHistory(3, 2);

    expect(result).toBe(false);
    expect(history.length).toBe(3);
  });

  it('compresses history when message count exceeds threshold', () => {
    const history = new ConversationHistory();
    for (let i = 1; i <= 25; i++) {
      history.append(userMessage(`msg${i}`));
    }

    const result = history.compressHistory(20, 10);

    expect(result).toBe(true);
    // 10 kept messages + 1 placeholder
    expect(history.length).toBe(11);
  });

  it('keeps the most recent messages after compression', () => {
    const history = new ConversationHistory();
    for (let i = 1; i <= 25; i++) {
      history.append(userMessage(`msg${i}`));
    }

    history.compressHistory(20, 10);

    const snapshot = history.snapshot();
    // First message should be the placeholder
    expect(snapshot[0]).toEqual({
      role: 'user',
      content: '(15 previous conversation messages have been omitted)',
    });
    // Remaining messages should be the last 10 (msg16 to msg25)
    for (let i = 1; i <= 10; i++) {
      expect(snapshot[i]).toEqual(userMessage(`msg${15 + i}`));
    }
  });

  it('preserves message order after compression', () => {
    const history = new ConversationHistory();
    history.append(userMessage('old1'));
    history.append(assistantMessage('old2'));
    history.append(userMessage('old3'));
    history.append(assistantMessage('keep1'));
    history.append(userMessage('keep2'));

    history.compressHistory(4, 2);

    const snapshot = history.snapshot();
    expect(snapshot).toEqual([
      {
        role: 'user',
        content: '(3 previous conversation messages have been omitted)',
      },
      assistantMessage('keep1'),
      userMessage('keep2'),
    ]);
  });

  it('handles compression with image messages', () => {
    const history = new ConversationHistory();
    history.append(userMessageWithImage('old', 'data:old-image'));
    history.append(assistantMessage('old response'));
    history.append(userMessageWithImage('new', 'data:new-image'));

    history.compressHistory(2, 1);

    const snapshot = history.snapshot();
    expect(snapshot.length).toBe(2);
    expect(snapshot[0]).toEqual({
      role: 'user',
      content: '(2 previous conversation messages have been omitted)',
    });
    expect(snapshot[1]).toEqual(userMessageWithImage('new', 'data:new-image'));
  });
});
