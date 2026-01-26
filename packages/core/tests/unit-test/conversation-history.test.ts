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

  // Notes management tests

  it('initializes with empty notes', () => {
    const history = new ConversationHistory();
    expect(history.getNotes()).toEqual([]);
    expect(history.notesToText()).toMatchInlineSnapshot(`""`);
  });

  it('appends notes to the list', () => {
    const history = new ConversationHistory();
    history.appendNote('First note');
    history.appendNote('Second note');

    expect(history.getNotes()).toEqual(['First note', 'Second note']);
  });

  it('ignores empty notes when appending', () => {
    const history = new ConversationHistory();
    history.appendNote('Valid note');
    history.appendNote('');
    history.appendNote('Another valid note');

    expect(history.getNotes()).toEqual(['Valid note', 'Another valid note']);
  });

  it('converts notes to text representation', () => {
    const history = new ConversationHistory();
    history.appendNote('User logged in successfully');
    history.appendNote('Found 3 items in the cart');

    expect(history.notesToText()).toMatchInlineSnapshot(`
      "Notes from previous steps:
      ---
      User logged in successfully
      ---
      Found 3 items in the cart
      ---"
    `);
  });

  it('clears all notes', () => {
    const history = new ConversationHistory();
    history.appendNote('Note 1');
    history.appendNote('Note 2');

    history.clearNotes();

    expect(history.getNotes()).toEqual([]);
    expect(history.notesToText()).toMatchInlineSnapshot(`""`);
  });

  it('returns independent copy of notes array', () => {
    const history = new ConversationHistory();
    history.appendNote('Original note');

    const notes = history.getNotes();
    notes.push('Mutated note');

    expect(history.getNotes()).toEqual(['Original note']);
  });
});
