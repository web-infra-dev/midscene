import { MobileScrollSearch } from '@/agent/mobile-scroll-search';
import type { ScrollGeometry } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type { ExecutionTask, UIContext } from '@/types';
import { expect, it, rs } from '@rstest/core';
const geometry = (x = 0): ScrollGeometry => ({
  targetId: 'view',
  viewport: { x: 0, y: 0, width: 100, height: 200 },
  offscreenDirections: ['left'],
  anchors: {
    a: { x: 20 + x, y: 30, width: 30, height: 20 },
    b: { x: 50 + x, y: 60, width: 30, height: 20 },
  },
});
function setup() {
  const search = new MobileScrollSearch();
  const tasks: ExecutionTask[] = [];
  const context = (image = 'same'): UIContext => ({
    screenshot: ScreenshotItem.create(image, 1000 + tasks.length),
    shotSize: { width: 100, height: 200 },
    shrunkShotToLogicalRatio: 1,
  });
  const capture = rs
    .fn<() => Promise<ScrollGeometry | undefined>>()
    .mockResolvedValue(geometry());
  const plan = (image = 'same') =>
    search.planningFeedbackWithGeometry(tasks, context(image), capture);
  const step = (image = 'same', subType = 'Scroll') => {
    tasks.push({
      taskId: String(tasks.length),
      type: 'Action Space',
      subType,
      status: 'finished',
      timing: { start: 0, callActionEnd: 1000 },
      param: { direction: 'down' },
      executor: async () => ({}),
    });
    return plan(image);
  };
  return { search, tasks, capture, plan, step, context };
}
it('starts after three actual gestures even if the first touch changes system chrome', async () => {
  const { plan, step, capture } = setup();
  await plan('before-touch');
  await step();
  await step();
  expect(capture).not.toHaveBeenCalled();
  expect(await step()).toContain('Fresh native scroll-view geometry');
  expect(capture).toHaveBeenCalledTimes(1);
});
it('does not query normal moving views', async () => {
  const { plan, step, capture } = setup();
  await plan();
  for (let i = 0; i < 6; i++) await step(`frame-${i}`);
  expect(capture).not.toHaveBeenCalled();
});
it('does not count a tap as the third scrolling gesture', async () => {
  const { plan, step, capture } = setup();
  await plan();
  await step('same', 'Tap');
  await step();
  await step();
  expect(capture).not.toHaveBeenCalled();
});
it('falls back when multiple/unsupported native views return no geometry', async () => {
  const { plan, step, capture } = setup();
  capture.mockResolvedValue(undefined);
  await plan();
  await step();
  await step();
  await step();
  expect(await step()).toContain('exactly identical');
});
it('does not reacquire geometry for a stale screenshot or unchanged action list', async () => {
  const { search, tasks, plan, step, capture, context } = setup();
  await plan();
  await step();
  await step();
  await step();
  capture.mockClear();
  await plan();
  expect(capture).not.toHaveBeenCalled();
  const task = {
    ...tasks.at(-1)!,
    taskId: 'next',
    timing: { start: 0, callActionEnd: 999999 },
  };
  tasks.push(task);
  await search.planningFeedbackWithGeometry(tasks, context(), capture);
  expect(capture).not.toHaveBeenCalled();
});
it('bounds blind geometry probes and renews the budget only when child geometry moves', async () => {
  const { plan, step, capture } = setup();
  await plan();
  await step();
  await step();
  await step();
  capture.mockResolvedValue(geometry(100));
  expect(await step('changed')).toContain('"x":-100');
  await step('changed');
  await step('changed');
  expect(await step('changed')).toContain('three further probes');
  const count = capture.mock.calls.length;
  await step('changed');
  expect(capture).toHaveBeenCalledTimes(count);
});

it('continues fresh geometry observations through ambiguous swipes and navigation attempts', async () => {
  const { plan, step, capture } = setup();
  await plan();
  await step();
  await step();
  await step();
  expect(await step('same', 'KeyboardPress')).toContain(
    'Fresh native scroll-view geometry',
  );
  expect(capture).toHaveBeenCalledTimes(2);
});

it('falls back after a native query error and does not repeatedly retry the backend', async () => {
  const { plan, step, capture } = setup();
  capture.mockRejectedValue(new Error('geometry query unavailable'));
  await plan();
  await step();
  await step();
  expect(await step()).toContain('exactly identical');
  await step();
  expect(capture).toHaveBeenCalledTimes(1);
});
