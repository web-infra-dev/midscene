import { ScrollGeometryObserver } from '@/agent/scroll-geometry-observer';
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
  const tasks: ExecutionTask[] = [];
  const context = (image = 'same'): UIContext => ({
    screenshot: ScreenshotItem.create(image, 1000 + tasks.length),
    shotSize: { width: 100, height: 200 },
    shrunkShotToLogicalRatio: 1,
  });
  const capture = rs
    .fn<() => Promise<ScrollGeometry | undefined>>()
    .mockResolvedValue(geometry());
  const search = new ScrollGeometryObserver(capture);
  const plan = (image = 'same') => search.feedback(tasks, context(image));
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
  expect(await step()).toBeUndefined();
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
  await search.feedback(tasks, context());
  expect(capture).not.toHaveBeenCalled();
});
it('samples again when the view moves and skips duplicate observations', async () => {
  const { plan, step, capture } = setup();
  await plan();
  await step();
  await step();
  await step();
  await step();
  expect(capture).toHaveBeenCalledTimes(1);
  capture.mockResolvedValue(geometry(100));
  expect(await step('changed')).toContain('"x":-100');
  expect(await step('changed', 'KeyboardPress')).toBeUndefined();
  expect(capture).toHaveBeenCalledTimes(2);
});
it('falls back after a native query error and does not repeatedly retry the backend', async () => {
  const { plan, step, capture } = setup();
  capture.mockRejectedValue(new Error('geometry query unavailable'));
  await plan();
  await step();
  await step();
  expect(await step()).toBeUndefined();
  await step();
  expect(capture).toHaveBeenCalledTimes(1);
});
