import type {
  ExecutionTask,
  ExecutionTaskPlanningLocate,
  ExecutionTaskPlanningParam,
} from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import {
  getExtraActionSourceInfo,
  hasDeepLocateFlag,
  hasDeepThinkFlag,
  hasObserverAssertionFlag,
} from '../src/utils/report-task-tags';

describe('report task tag flags', () => {
  it('shows DeepThink for deepThink effort in aiAct planning task dump params', () => {
    const task = {
      type: 'Planning',
      taskId: 'plan-deep-think',
      status: 'finished',
      param: {
        effort: 'deepThink',
      },
    } satisfies Pick<ExecutionTask, 'type' | 'taskId' | 'status'> & {
      param: Pick<ExecutionTaskPlanningParam, 'effort'>;
    };

    expect(hasDeepThinkFlag(task as ExecutionTask)).toBe(true);
  });

  it.each(['balance', 'fast'] as const)(
    'does not show DeepThink for %s effort',
    (effort) => {
      const task = {
        type: 'Planning',
        taskId: `plan-${effort}`,
        status: 'finished',
        param: { effort },
      } satisfies Pick<ExecutionTask, 'type' | 'taskId' | 'status'> & {
        param: Pick<ExecutionTaskPlanningParam, 'effort'>;
      };

      expect(hasDeepThinkFlag(task as ExecutionTask)).toBe(false);
    },
  );

  it('does not read the legacy planning deepThink dump field', () => {
    const task = {
      type: 'Planning',
      taskId: 'plan-legacy-deep-think',
      status: 'finished',
      param: { deepThink: true },
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

  it('describes an action selected from the extra action space', () => {
    const task = {
      type: 'Action',
      subType: 'Tap',
      taskId: 'extra-action',
      status: 'finished',
      hitBy: {
        from: 'Extra Action',
        context: {
          extraActionName: 'Click the confirm button',
          extraActionAlias: 'MidsceneExtraAction_1',
        },
      },
    } as unknown as ExecutionTask;

    expect(getExtraActionSourceInfo(task)).toEqual({
      source: 'Extra Action',
      label: 'Extra Action',
      name: 'Click the confirm button',
      alias: 'MidsceneExtraAction_1',
    });
  });

  it('describes target resolution triggered by an extra action', () => {
    const target = {
      strategy: 'xpath',
      selector: '//button[@id="confirm"]',
    };
    const task = {
      type: 'Planning',
      subType: 'Locate',
      taskId: 'extra-target',
      status: 'finished',
      hitBy: {
        from: 'Extra Action target',
        context: {
          extraActionName: 'Click the confirm button',
          extraActionAlias: 'MidsceneExtraAction_1',
          target,
        },
      },
    } as unknown as ExecutionTask;

    expect(getExtraActionSourceInfo(task)).toEqual({
      source: 'Extra Action target',
      label: 'Extra Target',
      name: 'Click the confirm button',
      alias: 'MidsceneExtraAction_1',
      target,
    });
  });

  it('does not mark unrelated hit sources as extra actions', () => {
    const task = {
      type: 'Planning',
      subType: 'Locate',
      taskId: 'cached-target',
      status: 'finished',
      hitBy: {
        from: 'Cache',
        context: {},
      },
    } as unknown as ExecutionTask;

    expect(getExtraActionSourceInfo(task)).toBeUndefined();
  });
});
