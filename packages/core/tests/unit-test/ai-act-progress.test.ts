import {
  createAiActActionReporter,
  extractProgressAction,
} from '@/agent/progress/ai-act-progress';
import { TaskRunner } from '@/task-runner';
import type { ExecutionTask } from '@/types';
import { describe, expect, it, rs } from '@rstest/core';
import { createFakeContext } from '../utils';

const runner = new TaskRunner('progress', async () => createFakeContext());

const actionTask = (param: unknown, subType = 'Tap') =>
  ({ type: 'Action Space', subType, param }) as ExecutionTask;

describe('aiAct progress coordinates', () => {
  it('preserves the resolved center despite conflicting model coordinates', () => {
    expect(
      extractProgressAction(
        actionTask({
          locate: {
            description: 'submit',
            center: [10.25, 20.75],
            locatedPixelResult: { center: [100, 200] },
            point: [300, 400],
            bbox: [0, 0, 1000, 1000],
          },
        }),
      ),
    ).toMatchObject({ name: 'Tap', target: 'submit', point: [10.25, 20.75] });
  });

  it.each([
    { locatedPixelResult: { center: [10, 20] } },
    { point: [10, 20] },
    { bbox: [0, 0, 100, 100] },
    { rect: { left: 0, top: 0, width: 100, height: 100 } },
    { center: [Number.NaN, 20], point: [10, 20], bbox: [0, 0, 100, 100] },
    { center: [10], locatedPixelResult: { center: [10, 20] } },
  ])('does not publish unresolved locator %j', async (locate) => {
    const task = actionTask({ locate });
    expect(extractProgressAction(task)).toBeUndefined();
    const emit = rs.fn();
    const reporter = createAiActActionReporter(1, 3, emit);
    await reporter({ kind: 'start', task, runner });
    expect(emit).not.toHaveBeenCalled();
  });

  it('publishes resolved action lifecycle events with the same fractional center', async () => {
    const task = actionTask({
      locate: { description: 'submit', center: [10.25, 20.75] },
    });
    const emit = rs.fn();
    const reporter = createAiActActionReporter(1, 3, emit);
    await reporter({ kind: 'start', task, runner });
    await reporter({ kind: 'finish', task, runner });
    expect(emit.mock.calls.map(([phase]) => phase)).toEqual([
      'plan_action',
      'action_running',
      'action_done',
    ]);
    for (const [, data] of emit.mock.calls) {
      expect(data.action).toEqual({
        name: 'Tap',
        target: 'submit',
        point: [10.25, 20.75],
      });
    }
  });

  it('continues reporting actions without locator parameters', () => {
    expect(extractProgressAction(actionTask({ timeMs: 100 }, 'Sleep'))).toEqual(
      { name: 'Sleep', param: { timeMs: 100 } },
    );
  });
});
