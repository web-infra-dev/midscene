import { ConversationHistory } from '@/ai-model';
import { projectScrollRecoveryHistory } from '@/ai-model/workflows/planning/scroll-recovery-history';
import { findScrollToReview } from '@/ai-model/workflows/planning/scroll-review';
import type { ExecutionTask } from '@/types';
import { describe, expect, it } from '@rstest/core';

const scroll = (direction = 'down', status = 'finished') =>
  ({
    type: 'Action Space',
    subType: 'Scroll',
    status,
    param: { direction },
    uiContext: {},
  }) as ExecutionTask;
describe('scroll review trigger', () => {
  it('reviews every pair, not the first scroll or every subsequent step', () => {
    const tasks = [scroll(), scroll(), scroll(), scroll()];
    expect(findScrollToReview(tasks.slice(0, 1))).toBeUndefined();
    expect(findScrollToReview(tasks.slice(0, 2))).toBe(tasks[1]);
    expect(findScrollToReview(tasks.slice(0, 3))).toBeUndefined();
    expect(findScrollToReview(tasks)).toBe(tasks[3]);
  });
  it('resets on another action, direction, or failed scroll', () => {
    expect(findScrollToReview([scroll(), scroll('right')])).toBeUndefined();
    expect(
      findScrollToReview([scroll(), { ...scroll(), subType: 'Tap' }, scroll()]),
    ).toBeUndefined();
    expect(
      findScrollToReview([scroll(), scroll('down', 'failed')]),
    ).toBeUndefined();
  });
  it('does not count planning tasks or review missing screenshots', () => {
    const last = scroll();
    expect(
      findScrollToReview([scroll(), { ...scroll(), type: 'Planning' }, last]),
    ).toBe(last);
    expect(
      findScrollToReview([scroll(), { ...last, uiContext: undefined }]),
    ).toBeUndefined();
  });
});
it('omits old visual guesses only from the recovery snapshot, retaining actions and stored history', () => {
  const history = new ConversationHistory();
  const content =
    '<planning>Maybe the button is below.</planning><log>Go down</log><action-type>Scroll</action-type><action-param-json>{"direction":"down"}</action-param-json>';
  history.appendModelOutput({
    type: 'chat-completion',
    rawValue: { role: 'assistant', content, refusal: null },
  });
  history.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: content }],
  });
  const recovery = JSON.stringify(
    projectScrollRecoveryHistory(history.snapshot(2)),
  );
  expect(recovery).not.toContain('Maybe');
  expect(recovery).not.toContain('Go down');
  expect(recovery).toContain('action-type');
  expect(recovery).toContain('direction');
  expect(JSON.stringify(history.snapshot())).toContain('Maybe');
});

it('preserves literal narrative tags inside executed input values', () => {
  const history = new ConversationHistory();
  const action =
    '<action-type>Input</action-type><action-param-json>{"value":"<planning>keep this</planning>"}</action-param-json>';
  history.appendMessage({
    role: 'assistant',
    content: `<planning>old guess</planning>${action}`,
  });
  const replay = projectScrollRecoveryHistory(history.snapshot(1));
  expect(replay[0]).toEqual({
    type: 'input-message',
    message: { role: 'assistant', content: action },
  });
});

it('removes stale user-side execution narrative but retains feedback, memories and opaque Responses data', () => {
  const history = new ConversationHistory();
  history.appendMemory('Preserve selected account');
  history.appendMessage({
    role: 'user',
    content: [
      {
        type: 'text',
        text: '<execution_history>Keep going down to find Next</execution_history>Latest execution feedback: action succeeded',
      },
      { type: 'image', url: 'before' },
    ],
  });
  history.appendModelOutput({
    type: 'responses',
    rawValue: [
      {
        type: 'reasoning',
        id: 'reasoning-id',
        summary: [],
        encrypted_content: 'opaque',
      },
    ],
  });
  history.appendMessage({
    role: 'user',
    content: [
      { type: 'text', text: history.memoriesToText() },
      { type: 'image', url: 'after' },
    ],
  });
  const snapshot = projectScrollRecoveryHistory(history.snapshot(2));
  expect(JSON.stringify(snapshot)).not.toContain('Keep going down');
  expect(JSON.stringify(snapshot)).toContain('action succeeded');
  expect(JSON.stringify(snapshot)).toContain('Preserve selected account');
  expect(JSON.stringify(snapshot)).toContain('opaque');
  expect(JSON.stringify(history.snapshot())).toContain('Keep going down');
});
