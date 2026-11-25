import type { ExecutionSession } from '@/agent/execution-session';
import { ScrollRecovery } from '@/agent/scroll-recovery';
import type { ExecutionTask, ExecutorContext } from '@/types';
import { expect, it } from '@rstest/core';

const view = {
  shotSize: { width: 800, height: 600 },
  shrunkShotToLogicalRatio: 1,
};

const scroll = (id: string, left = 100): ExecutionTask => ({
  type: 'Action Space',
  subType: 'Scroll',
  taskId: `${id}-${left}`,
  status: 'finished',
  param: { direction: 'down' },
  uiContext: {} as ExecutionTask['uiContext'],
  scrollProgress: {
    status: 'unchanged',
    before: {
      targetId: id,
      scrollLeft: left,
      scrollTop: 0,
      maxScrollLeft: 100,
      maxScrollTop: 0,
      rect: { left: 0, top: 0, width: 100, height: 100 },
    },
    after: {
      targetId: id,
      scrollLeft: left,
      scrollTop: 0,
      maxScrollLeft: 100,
      maxScrollTop: 0,
      rect: { left: 0, top: 0, width: 100, height: 100 },
    },
  },
  executor: async () => ({}),
});
function setup() {
  const tasks = [
    scroll('list'),
    { ...scroll('list'), taskId: 'second' },
    { ...scroll('list'), taskId: 'third' },
  ];
  const session = {
    getRunner: () => ({ tasks }),
    appendAndRun: async (task: ExecutionTask) =>
      task.executor({ task, uiContext: {} } as ExecutorContext),
  } as unknown as ExecutionSession;
  return {
    tasks,
    recovery: new ScrollRecovery(session),
  };
}
it('updates available directions on each plan only after recovery has engaged', async () => {
  const { tasks, recovery } = setup();
  expect(recovery.planningFeedback(view)).toBeUndefined();
  await recovery.review(async () => {});
  expect(recovery.planningFeedback(view)).toContain(
    'Directions with remaining range: left.',
  );
  const advancing = scroll('list', 70);
  advancing.param.direction = 'left';
  advancing.scrollProgress!.status = 'moved';
  advancing.scrollProgress!.before!.scrollLeft = 100;
  tasks.push(advancing);
  expect(recovery.planningFeedback(view)).toContain(
    'Directions with remaining range: left, right.',
  );
  expect(recovery.planningFeedback(view)).toContain(
    'latest executed scroll was left',
  );
});
it.each(['action', 'target', 'unknown'] as const)(
  'retires recovery context after %s changes and never resurrects it',
  async (change) => {
    const { tasks, recovery } = setup();
    await recovery.review(async () => {});
    const next = scroll('list');
    if (change === 'action') next.subType = 'Tap';
    if (change === 'target') {
      next.scrollProgress!.before!.targetId = 'other';
      next.scrollProgress!.after!.targetId = 'other';
    }
    if (change === 'unknown') next.scrollProgress = undefined;
    tasks.push(next);
    expect(recovery.planningFeedback(view)).toBeUndefined();
    tasks.push(scroll('list'));
    expect(recovery.planningFeedback(view)).toBeUndefined();
  },
);

it('default native mode skips incomplete measurements without invoking visual fallback', async () => {
  const { tasks, recovery } = setup();
  for (const task of tasks) {
    task.scrollProgress!.before!.maxScrollLeft = undefined;
    task.scrollProgress!.after!.maxScrollLeft = undefined;
  }
  let started = false;
  expect(
    await recovery.review(async () => {
      started = true;
    }),
  ).toBeUndefined();
  expect(started).toBe(false);
  expect(recovery.planningFeedback(view)).toBeUndefined();
});

it('keeps an ambiguous recovery qualitative after the next scroll moves', async () => {
  const { tasks, recovery } = setup();
  for (const task of tasks) {
    task.scrollProgress!.before!.scrollLeft = 50;
    task.scrollProgress!.after!.scrollLeft = 50;
  }
  const observation = await recovery.review(async () => {});
  expect(observation?.nextSearchDirection).toBeNull();
  const step = scroll('list', 70);
  step.param.direction = 'right';
  step.scrollProgress!.before!.scrollLeft = 50;
  step.scrollProgress!.status = 'moved';
  tasks.push(step);
  const feedback = recovery.planningFeedback(view);
  expect(feedback).toContain('left, right');
  expect(feedback).not.toContain('next search step');
  expect(feedback).not.toContain('Current scroll position');
});
