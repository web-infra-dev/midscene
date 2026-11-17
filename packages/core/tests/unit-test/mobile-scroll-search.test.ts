import { MobileScrollSearch } from '@/agent/mobile-scroll-search';
import { ScreenshotItem } from '@/screenshot-item';
import type { ExecutionTask, UIContext } from '@/types';
import { expect, it } from '@rstest/core';

const context = (image = 'same', width = 100): UIContext => ({
  screenshot: ScreenshotItem.create(image, Date.now()),
  shotSize: { width, height: 200 },
  shrunkShotToLogicalRatio: 1,
});
function setup() {
  const search = new MobileScrollSearch();
  const tasks: ExecutionTask[] = [];
  search.planningFeedback(tasks, context());
  return {
    tasks,
    search,
    step(direction = 'down', image = 'same') {
      tasks.push({
        taskId: String(tasks.length),
        type: 'Action Space',
        subType: 'Scroll',
        status: 'finished',
        timing: { start: 0, callActionEnd: 0 },
        param: { direction },
        executor: async () => ({}),
      });
      return search.planningFeedback(tasks, context(image));
    },
  };
}

it('waits for three identical completed scroll frames then explores the other axis', () => {
  const { step } = setup();
  expect(step()).toBeUndefined();
  expect(step()).toBeUndefined();
  const feedback = step();
  expect(feedback).toContain('Candidate directions in order: right, left, up');
  expect(feedback).toContain('Scroll with direction "right"');
  expect(feedback).toContain('platform-default distance');
  expect(step('right')).toContain('Candidate directions in order: left, up');
  expect(step('left')).toContain('Candidate directions in order: up');
  expect(step('up')).toContain('three-probe search budget is exhausted');
});

it('bounds exploration even when the planner repeats a failed direction', () => {
  const { step } = setup();
  step();
  step();
  step();
  step();
  step();
  expect(step()).toContain('budget is exhausted');
});

it('retires failed-direction advice when content changes', () => {
  const { step } = setup();
  step();
  step();
  step();
  expect(step('right', 'moved')).toContain('consider continuing right');
  expect(step('right', 'moved')).toBeUndefined();
  expect(step('right', 'moved')).toBeUndefined();
  expect(step('right', 'moved')).toContain(
    'Candidate directions in order: down, up, left',
  );
});

it('keeps a changing direction across an inert tap, and retires it when a tap changes the UI', () => {
  const { step, search, tasks } = setup();
  step();
  step();
  step();
  expect(step('right', 'page-2')).toContain('consider continuing right');
  expect(step('right', 'page-3')).toContain('consider continuing right');
  tasks.push({ ...tasks[0], taskId: 'tap', subType: 'Tap' });
  expect(search.planningFeedback(tasks, context('page-3'))).toContain(
    'consider continuing right',
  );
  tasks.push({ ...tasks[0], taskId: 'navigate', subType: 'Tap' });
  expect(search.planningFeedback(tasks, context('new-screen'))).toBeUndefined();
});

it('preserves a changing direction across an ineffective detour, with a finite budget', () => {
  const { step } = setup();
  step();
  step();
  step();
  step('left', 'page-2');
  expect(step('up', 'page-2')).toContain('consider continuing left');
  expect(step('left', 'page-3')).toContain('consider continuing left');
  expect(step('up', 'page-3')).toContain('Subsequent scrolls in up');
  step('up', 'page-3');
  expect(step('up', 'page-3')).toContain('budget is exhausted');
});

it('tracks a single relative Swipe using content search direction instead of finger motion', () => {
  const { step, tasks, search } = setup();
  step();
  step();
  step();
  tasks.push({
    ...tasks[0],
    taskId: 'swipe',
    subType: 'Swipe',
    param: { direction: 'right', distance: 200 },
  });
  expect(search.planningFeedback(tasks, context('page-2'))).toContain(
    'consider continuing left',
  );
  expect(step('up', 'page-2')).toContain('consider continuing left');
});

it('tracks an axis-aligned endpoint Swipe with explicit start and end', () => {
  const { step, tasks, search } = setup();
  step();
  step();
  step();
  tasks.push({
    ...tasks[0],
    taskId: 'endpoint',
    subType: 'Swipe',
    param: { start: { center: [20, 80] }, end: { center: [80, 80] } },
  });
  expect(search.planningFeedback(tasks, context('page-2'))).toContain(
    'consider continuing left',
  );
});

it.each([{ end: { center: [10, 20] } }, { repeat: 0 }, { repeat: 2 }])(
  'does not infer a search direction from an ambiguous or repeated Swipe: %j',
  (param) => {
    const { step, tasks, search } = setup();
    step();
    step();
    tasks.push({
      ...tasks[0],
      taskId: 'swipe',
      subType: 'Swipe',
      param: { direction: 'left', ...param },
    });
    expect(search.planningFeedback(tasks, context())).toBeUndefined();
  },
);

it('does not interpret moving scrolls as a stall', () => {
  const { step } = setup();
  for (let i = 0; i < 6; i++) expect(step('down', String(i))).toBeUndefined();
});

it('remembers ineffective reversals instead of getting stuck on the same axis', () => {
  const { step } = setup();
  step('down');
  step('up');
  expect(step('down')).toContain('Candidate directions in order: right, left');
});

it.each(['failed', 'other-action', 'batch', 'resize', 'stale-frame'] as const)(
  'resets when evidence is invalidated by %s',
  (reason) => {
    const { step, tasks, search } = setup();
    step();
    step();
    const last = { ...tasks[0], taskId: 'new' };
    if (reason === 'failed') last.status = 'failed';
    if (reason === 'other-action') last.subType = 'Tap';
    if (reason === 'stale-frame')
      last.timing = { start: 0, callActionEnd: Number.POSITIVE_INFINITY };
    if (reason === 'batch') tasks.push({ ...last, taskId: 'batch' });
    tasks.push(last);
    expect(
      search.planningFeedback(
        tasks,
        context('same', reason === 'resize' ? 200 : 100),
      ),
    ).toBeUndefined();
    expect(step()).toBeUndefined();
  },
);

it('does not count repeated planning without another executed action', () => {
  const { step, tasks, search } = setup();
  step();
  for (let i = 0; i < 3; i++)
    expect(search.planningFeedback(tasks, context())).toBeUndefined();
  expect(step()).toBeUndefined();
  expect(step()).toContain('Explicit user directions');
});
