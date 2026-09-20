import type {
  ExecutionTask,
  ExecutionTaskPlanningLocate,
  ExecutionTaskPlanningParam,
} from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import {
  hasDeepLocateFlag,
  hasObserverAssertionFlag,
  hasSubGoalsFlag,
} from '../src/utils/report-task-tags';

describe('report task tag flags', () => {
  it.each([true, false])(
    'reads the sub-goals component from the planning dump: %s',
    (enabled) => {
      const task = {
        type: 'Planning',
        taskId: 'plan-components',
        status: 'finished',
        param: { includeSubGoals: enabled },
      } satisfies Pick<ExecutionTask, 'type' | 'taskId' | 'status'> & {
        param: Pick<ExecutionTaskPlanningParam, 'includeSubGoals'>;
      };
      expect(hasSubGoalsFlag(task as ExecutionTask)).toBe(enabled);
      expect(
        hasSubGoalsFlag({ ...task, subType: 'Locate' } as ExecutionTask),
      ).toBe(false);
    },
  );

  it('consumes deepLocate from locate task dump params', () => {
    const task = {
      type: 'Planning',
      subType: 'Locate',
      taskId: 'locate-deep',
      status: 'finished',
      param: {
        prompt: 'target button',
        deepLocate: true,
      },
    } satisfies Pick<
      ExecutionTaskPlanningLocate,
      'type' | 'subType' | 'taskId' | 'status' | 'param'
    >;

    expect(hasDeepLocateFlag(task as ExecutionTask)).toBe(true);
  });

  it('marks tasks with observed-frame recorder items', () => {
    const task = {
      type: 'Insight',
      subType: 'Assert',
      taskId: 'assert-observed',
      status: 'finished',
      recorder: [
        {
          type: 'screenshot',
          ts: 1000,
          timing: 'observed-frame',
          screenshot: { base64: 'fake' },
        },
      ],
    } as unknown as ExecutionTask;

    expect(hasObserverAssertionFlag(task)).toBe(true);
  });

  it('does not mark tasks without observed-frame recorder items', () => {
    const task = {
      type: 'Insight',
      subType: 'Assert',
      taskId: 'assert-normal',
      status: 'finished',
      recorder: [
        {
          type: 'screenshot',
          ts: 1000,
          timing: 'after-calling',
          screenshot: { base64: 'fake' },
        },
      ],
    } as unknown as ExecutionTask;

    expect(hasObserverAssertionFlag(task)).toBe(false);
  });

  it('does not mark tasks with no recorder at all', () => {
    const task = {
      type: 'Insight',
      subType: 'Boolean',
      taskId: 'boolean-bare',
      status: 'finished',
    } as unknown as ExecutionTask;

    expect(hasObserverAssertionFlag(task)).toBe(false);
  });
});
