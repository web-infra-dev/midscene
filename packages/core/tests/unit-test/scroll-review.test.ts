import {
  compareScrollStates,
  findScrollToReview,
  nativeScrollReview,
  scrollPlanningFeedback,
} from '@/ai-model/workflows/planning/scroll-review';
import type { ActionScrollParam, ExecutionTask, ScrollState } from '@/types';
import { expect, it } from '@rstest/core';

const view = {
  shotSize: { width: 800, height: 600 },
  shrunkShotToLogicalRatio: 1,
};

const state = (targetId = 'list', scrollTop = 0): ScrollState => ({
  targetId,
  scrollTop,
  scrollLeft: 0,
  maxScrollLeft: 100,
  maxScrollTop: 0,
  rect: { left: 0, top: 0, width: 100, height: 100 },
});
const scroll = (id: string): ExecutionTask => ({
  type: 'Action Space',
  subType: 'Scroll',
  taskId: id,
  status: 'finished',
  param: { direction: 'down' },
  scrollProgress: { before: state(), after: state(), status: 'unchanged' },
  executor: async () => ({}),
});

it('reviews only after three measured stalls, without requiring screenshots', () => {
  const tasks = Array.from({ length: 7 }, (_, i) => scroll(String(i)));
  expect(findScrollToReview(tasks.slice(0, 2))).toBeUndefined();
  expect(findScrollToReview(tasks.slice(0, 3))).toBe(tasks[2]);
  expect(findScrollToReview(tasks.slice(0, 4))).toBe(tasks[3]);
  expect(
    findScrollToReview(tasks.slice(0, 4), tasks[3].taskId),
  ).toBeUndefined();
  expect(
    findScrollToReview(tasks.slice(0, 6), tasks[3].taskId),
  ).toBeUndefined();
  expect(findScrollToReview(tasks, tasks[3].taskId)).toBe(tasks[6]);
});

it.each([
  'moved',
  'uncertain',
  'missing',
  'replacement',
  'failed',
  'action',
  'direction',
])('starts a new measured streak after %s', (change) => {
  const tasks = [scroll('a'), scroll('b'), scroll('c')];
  const middle = tasks[1];
  if (change === 'moved' || change === 'uncertain')
    middle.scrollProgress!.status = change;
  if (change === 'missing') middle.scrollProgress = undefined;
  if (change === 'replacement') middle.scrollProgress!.after = state('other');
  if (change === 'failed') middle.status = 'failed';
  if (change === 'action') middle.subType = 'Tap';
  if (change === 'direction') middle.param.direction = 'left';
  expect(findScrollToReview(tasks)).toBeUndefined();
  tasks.push(scroll('d'), scroll('e'));
  expect(findScrollToReview(tasks)).toBe(tasks[4]);
});

it('uses container identity across coordinate jitter and ignores planning tasks', () => {
  const tasks = [scroll('a'), scroll('b'), scroll('c')];
  tasks.forEach((t, i) => {
    t.param.locate = { center: [10 + i, 20] };
  });
  tasks.splice(2, 0, { ...scroll('plan'), type: 'Planning' });
  expect(findScrollToReview(tasks)).toBe(tasks[3]);
  tasks[1].scrollProgress!.before = state('other');
  tasks[1].scrollProgress!.after = state('other');
  expect(findScrollToReview(tasks)).toBeUndefined();
});

it('normalizes boundary scroll types when counting direction', () => {
  const tasks = [scroll('a'), scroll('b'), scroll('c')];
  tasks[1].param = { scrollType: 'scrollToBottom' };
  expect(findScrollToReview(tasks)).toBe(tasks[2]);
  tasks[1].param = { scrollType: 'scrollToRight' };
  expect(findScrollToReview(tasks)).toBeUndefined();
});

it('keeps native direction advice unknown when ranges or identity are unreliable', () => {
  const task = scroll('a');
  expect(nativeScrollReview(task)?.nextSearchDirection).toBe('right');
  task.scrollProgress!.after!.maxScrollLeft = undefined;
  expect(nativeScrollReview(task)).toBeUndefined();
  task.scrollProgress!.after = state('other');
  expect(nativeScrollReview(task)).toBeUndefined();
});

it('measures only progress along the requested direction on the same target', () => {
  const param = { direction: 'down' } as ActionScrollParam;
  expect(compareScrollStates(state(), state('list', 20), param)).toBe('moved');
  expect(compareScrollStates(state(), state('list', -20), param)).toBe(
    'uncertain',
  );
  expect(compareScrollStates(state(), state('other', 20), param)).toBe(
    'uncertain',
  );
  expect(compareScrollStates(undefined, state(), param)).toBe('uncertain');
  expect(
    compareScrollStates(state(), { ...state(), scrollLeft: 20 }, param),
  ).toBe('unchanged');
});

it('suggests overlapping views on a supported search path and leaves ambiguous stalls open', () => {
  const task = scroll('search');
  const after = task.scrollProgress!.after!;
  after.maxScrollLeft = 900;
  expect(scrollPlanningFeedback(task, true, view)).toContain(
    'Scroll right inside this container, distance 75',
  );
  after.scrollLeft = 300;
  expect(scrollPlanningFeedback(task, true, view)).toContain(
    'horizontal 300 of 900',
  );
  expect(scrollPlanningFeedback(task, true, view)).not.toContain(
    'next search step',
  );
  task.param.direction = 'left';
  task.scrollProgress!.status = 'moved';
  expect(scrollPlanningFeedback(task, true, view)).toContain(
    'Scroll left inside this container, distance 75',
  );
  expect(scrollPlanningFeedback(task, false, view)).not.toContain(
    'next search step',
  );
});

it('sizes overlapping steps in model-image pixels and clips the span to the screen', () => {
  const task = scroll('document');
  const after = task.scrollProgress!.after!;
  after.maxScrollTop = 2000;
  after.maxScrollLeft = 0;
  after.rect = { left: 0, top: -400, width: 100, height: 1500 };
  const scaled = { ...view, shrunkShotToLogicalRatio: 2 };
  expect(scrollPlanningFeedback(task, true, scaled)).toContain(
    'Scroll down inside this container, distance 450',
  );
  after.rect = { ...after.rect, top: 200, height: 60 };
  expect(scrollPlanningFeedback(task, true, scaled)).toContain('distance 90');
  after.rect.top = 400;
  expect(scrollPlanningFeedback(task, true, scaled)).not.toContain(
    'next search step',
  );
});
