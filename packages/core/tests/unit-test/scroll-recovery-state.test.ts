import type { ExecutionSession } from '@/agent/execution-session';
import { ScrollRecovery } from '@/agent/scroll-recovery';
import { getModelRuntime } from '@/ai-model/models';
import type { ExecutionTask, ExecutorContext } from '@/types';
import { expect, it } from '@rstest/core';

const runtime = getModelRuntime({
  modelName: 'test',
  modelDescription: 'test',
  slot: 'planning',
  intent: 'planning',
});
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
  const tasks = [scroll('list'), { ...scroll('list'), taskId: 'second' }];
  const session = {
    getRunner: () => ({ tasks }),
    appendAndRun: async (task: ExecutionTask) =>
      task.executor({ task, uiContext: {} } as ExecutorContext),
  } as unknown as ExecutionSession;
  return { tasks, recovery: new ScrollRecovery(session, runtime, 2) };
}
it('updates remaining distance on each plan only after recovery has engaged', async () => {
  const { tasks, recovery } = setup();
  expect(recovery.planningFeedback()).toBeUndefined();
  await recovery.review(async () => {});
  expect(recovery.planningFeedback()).toContain('"left":100');
  const advancing = scroll('list', 70);
  advancing.param.direction = 'left';
  advancing.scrollProgress!.status = 'moved';
  advancing.scrollProgress!.before!.scrollLeft = 100;
  tasks.push(advancing);
  expect(recovery.planningFeedback()).toContain('"left":70');
  expect(recovery.planningFeedback()).toContain(
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
    expect(recovery.planningFeedback()).toBeUndefined();
    tasks.push(scroll('list'));
    expect(recovery.planningFeedback()).toBeUndefined();
  },
);
