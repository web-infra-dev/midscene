import type {
  ExecutionTask,
  ExecutionTaskPlanningLocate,
  ExecutionTaskPlanningParam,
} from '@midscene/core';
import { describe, expect, it } from 'vitest';
import {
  getCacheActionVerificationDisplay,
  hasDeepLocateFlag,
  hasDeepThinkFlag,
  hasObserverAssertionFlag,
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

  it.each([
    ['passed', 'Passed', 'success'],
    ['failed', 'Failed', 'error'],
    ['uncertain', 'Uncertain', 'warning'],
  ] as const)(
    'maps cache action verification %s to report display metadata',
    (status, statusLabel, color) => {
      const task = {
        type: 'Action Space',
        subType: 'Tap',
        taskId: `tap-${status}`,
        status: status === 'passed' ? 'finished' : 'failed',
        cacheActionVerification: {
          status,
          reason: `${status} reason`,
          request: {
            actionName: 'Tap',
            targetDescription: 'search input',
            logicalModelRequestCount: 1,
            screenshotCount: 2,
            modelInputImageCount: 1,
            verificationMode: 'focused-comparison',
            dataDemand: {
              status: 'status demand',
              reason: 'reason demand',
            },
          },
        },
      } as ExecutionTask;

      expect(getCacheActionVerificationDisplay(task)).toEqual({
        status,
        statusLabel,
        label: `AI Verify: ${statusLabel}`,
        color,
        reason: `${status} reason`,
        request: {
          actionName: 'Tap',
          targetDescription: 'search input',
          logicalModelRequestCount: 1,
          screenshotCount: 2,
          modelInputImageCount: 1,
          verificationMode: 'focused-comparison',
          dataDemand: JSON.stringify(
            {
              status: 'status demand',
              reason: 'reason demand',
            },
            null,
            2,
          ),
        },
      });
    },
  );

  it('does not create AI Verify display metadata for old tasks', () => {
    const task = {
      type: 'Action Space',
      subType: 'Tap',
      taskId: 'tap-without-verification',
      status: 'finished',
    } as ExecutionTask;

    expect(getCacheActionVerificationDisplay(task)).toBeUndefined();
  });
});
