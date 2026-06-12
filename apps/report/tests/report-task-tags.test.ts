import type {
  ExecutionTask,
  ExecutionTaskPlanningLocate,
  ExecutionTaskPlanningParam,
} from '@midscene/core';
import { describe, expect, it } from 'vitest';
import {
  hasDeepLocateFlag,
  hasDeepThinkFlag,
} from '../src/utils/report-task-tags';

describe('report task tag flags', () => {
  it('consumes deepThink from aiAct planning task dump params', () => {
    const task = {
      type: 'Planning',
      taskId: 'plan-deep-think',
      status: 'finished',
      param: {
        deepThink: true,
      },
    } satisfies Pick<ExecutionTask, 'type' | 'taskId' | 'status'> & {
      param: Pick<ExecutionTaskPlanningParam, 'deepThink'>;
    };

    expect(hasDeepThinkFlag(task as ExecutionTask)).toBe(true);
  });

  it('does not mark planning tasks without deepThink', () => {
    const task = {
      type: 'Planning',
      taskId: 'plan-normal',
      status: 'finished',
      param: {},
    } satisfies Pick<ExecutionTask, 'type' | 'taskId' | 'status'> & {
      param: Pick<ExecutionTaskPlanningParam, 'deepThink'>;
    };

    expect(hasDeepThinkFlag(task as ExecutionTask)).toBe(false);
  });

  it('does not treat deprecated locate deepThink as aiAct deepThink', () => {
    const task = {
      type: 'Planning',
      subType: 'Locate',
      taskId: 'locate-old-alias',
      status: 'finished',
      param: {
        prompt: 'target button',
        deepThink: true,
      },
    };

    expect(hasDeepThinkFlag(task as ExecutionTask)).toBe(false);
  });

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
});
