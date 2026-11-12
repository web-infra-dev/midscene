import {
  compareScrollStates,
  findScrollToReview,
} from '@/ai-model/workflows/planning/scroll-review';
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
  it.each([2, 3, 4])(
    'reviews at interval %s without reviewing intervening scrolls',
    (interval) => {
      const tasks = Array.from({ length: 12 }, (_, i) => ({
        ...scroll(),
        taskId: `scroll-${i}`,
      }));
      let reviewedTaskId: string | undefined;
      for (let count = 1; count <= tasks.length; count++) {
        const candidate = findScrollToReview(
          tasks.slice(0, count),
          interval,
          reviewedTaskId,
        );
        expect(candidate).toBe(
          count % interval === 0 ? tasks[count - 1] : undefined,
        );
        if (candidate) reviewedTaskId = candidate.taskId;
      }
    },
  );
  it('reviews batches crossing the threshold and counts anew after the last review', () => {
    const tasks = Array.from({ length: 7 }, (_, i) => ({
      ...scroll(),
      taskId: `scroll-${i}`,
    }));
    expect(findScrollToReview(tasks.slice(0, 4), 3)).toBe(tasks[3]);
    expect(
      findScrollToReview(tasks.slice(0, 4), 3, tasks[3].taskId),
    ).toBeUndefined();
    expect(
      findScrollToReview(tasks.slice(0, 6), 3, tasks[3].taskId),
    ).toBeUndefined();
    expect(findScrollToReview(tasks, 3, tasks[3].taskId)).toBe(tasks[6]);
  });
  it('starts a new streak when the dispatched target changes', () => {
    const target = (x: number, description = 'list') =>
      ({
        ...scroll(),
        param: { direction: 'down', locate: { center: [x, 50], description } },
      }) as ExecutionTask;
    const last = target(80);
    expect(findScrollToReview([target(20), target(20), last])).toBeUndefined();
    expect(findScrollToReview([target(80), target(80), last])).toBe(last);
    expect(
      findScrollToReview([target(80, 'outer'), target(80), last]),
    ).toBeUndefined();
    expect(findScrollToReview([scroll(), target(80), last])).toBeUndefined();
    expect(
      findScrollToReview([target(80), scroll(), scroll()]),
    ).toBeUndefined();
  });
  it('does not merge unresolved explicit targets into one streak', () => {
    const unresolved = () =>
      ({
        ...scroll(),
        param: { locate: { description: 'list' } },
      }) as ExecutionTask;
    expect(
      findScrollToReview([unresolved(), unresolved(), unresolved()]),
    ).toBeUndefined();
  });
  it('defaults to three scrolls', () => {
    const tasks = [scroll(), scroll(), scroll()];
    expect(findScrollToReview(tasks.slice(0, 2))).toBeUndefined();
    expect(findScrollToReview(tasks)).toBe(tasks[2]);
  });
  it('resets on another action, direction, or failed scroll', () => {
    expect(
      findScrollToReview([scroll(), scroll(), scroll('right')]),
    ).toBeUndefined();
    expect(
      findScrollToReview([
        scroll(),
        scroll(),
        { ...scroll(), subType: 'Tap' },
        scroll(),
      ]),
    ).toBeUndefined();
    expect(
      findScrollToReview([scroll(), scroll(), scroll('down', 'failed')]),
    ).toBeUndefined();
  });
  it('does not count planning tasks or review missing screenshots', () => {
    const last = scroll();
    expect(
      findScrollToReview([
        scroll(),
        scroll(),
        { ...scroll(), type: 'Planning' },
        last,
      ]),
    ).toBe(last);
    expect(
      findScrollToReview([
        scroll(),
        scroll(),
        { ...last, uiContext: undefined },
      ]),
    ).toBeUndefined();
  });
});

it('uses container identity across jitter and resets after progress or replacement', () => {
  const state = (targetId: string, scrollTop = 0) => ({
    targetId,
    scrollTop,
    scrollLeft: 0,
    rect: { left: 0, top: 0, width: 100, height: 100 },
  });
  const measured = (id: string, x: number) =>
    ({
      ...scroll(),
      param: { direction: 'down', locate: { center: [x, 50] } },
      scrollProgress: {
        before: state(id),
        after: state(id),
        status: 'unchanged',
      },
    }) as ExecutionTask;
  const tasks = [measured('a', 10), measured('a', 11), measured('a', 12)];
  expect(findScrollToReview(tasks)).toBe(tasks[2]);
  tasks[1].scrollProgress!.status = 'moved';
  expect(findScrollToReview(tasks)).toBeUndefined();
  tasks[1].scrollProgress!.status = 'unchanged';
  tasks[1].scrollProgress!.after = state('b');
  expect(findScrollToReview(tasks)).toBeUndefined();
  expect(
    compareScrollStates(state('a'), state('a', 20), {
      direction: 'down',
    } as any),
  ).toBe('moved');
  expect(
    compareScrollStates(state('a'), state('a', -20), {
      direction: 'down',
    } as any),
  ).toBe('uncertain');
  expect(
    compareScrollStates(state('a'), state('b', 20), {
      direction: 'down',
    } as any),
  ).toBe('uncertain');
  expect(compareScrollStates(undefined, state('a'), {} as any)).toBe(
    'uncertain',
  );
  expect(
    compareScrollStates(state('a'), { ...state('a'), scrollLeft: 20 }, {
      direction: 'down',
    } as any),
  ).toBe('unchanged');
});
