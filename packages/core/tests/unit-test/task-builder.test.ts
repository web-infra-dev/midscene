import { TaskBuilder } from '@/agent/task-builder';
import { getMidsceneLocationSchema } from '@/ai-model';
import { AbstractInterface, defineActionSleep } from '@/device';
import type Service from '@/insight';
import type { DeviceAction, PlanningAction } from '@/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

class MockInterface extends AbstractInterface {
  interfaceType = 'mock';

  constructor(private readonly actions: DeviceAction[]) {
    super();
  }

  async screenshotBase64(): Promise<string> {
    return 'mock';
  }

  async size(): Promise<{ width: number; height: number }> {
    return { width: 0, height: 0 };
  }

  actionSpace(): DeviceAction[] {
    return this.actions;
  }
}

describe('TaskBuilder', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches plans using handler registry', async () => {
    const actionSchema = z.object({
      locate: getMidsceneLocationSchema().describe('element to locate'),
    });

    const mockAction: DeviceAction = {
      name: 'Tap',
      description: 'mock tap action',
      paramSchema: actionSchema,
      call: vi.fn(),
    };

    const mockInterface = new MockInterface([mockAction, defineActionSleep()]);

    const insightService = {
      contextRetrieverFn: vi.fn(),
      locate: vi.fn(),
    } as unknown as Service;

    const taskBuilder = new TaskBuilder({
      interfaceInstance: mockInterface,
      service: insightService,
      actionSpace: mockInterface.actionSpace(),
    });

    const plans: PlanningAction[] = [
      {
        type: 'Locate',
        thought: 'find element',
        param: { prompt: 'first' },
        locate: { prompt: 'first' },
      },
      {
        type: 'Finished',
        thought: 'all done',
        param: null,
      },
      {
        type: 'Sleep',
        thought: 'take a break',
        param: { timeMs: 100 },
      },
      {
        type: 'Tap',
        thought: 'tap element',
        param: { locate: { prompt: 'button' } },
      },
    ];

    const { tasks } = await taskBuilder.build(plans, {} as any, {} as any);

    expect(tasks.map((task) => [task.type, task.subType])).toEqual([
      ['Planning', 'Locate'],
      ['Action Space', 'Finished'],
      ['Action Space', 'Sleep'],
      ['Planning', 'Locate'],
      ['Action Space', 'Tap'],
    ]);
  });

  it('supports fast-path action delays for system actions', async () => {
    vi.useFakeTimers();

    const defaultBeforeHook = vi.fn(async () => undefined);
    const defaultAfterHook = vi.fn(async () => undefined);
    const defaultActionCall = vi.fn(async () => undefined);
    const defaultAction: DeviceAction = {
      name: 'DefaultExit',
      description: 'default exit action',
      call: defaultActionCall,
    };

    const defaultInterface = new MockInterface([defaultAction]);
    defaultInterface.beforeInvokeAction = defaultBeforeHook;
    defaultInterface.afterInvokeAction = defaultAfterHook;

    const fastBeforeHook = vi.fn(async () => undefined);
    const fastAfterHook = vi.fn(async () => undefined);
    const fastActionCall = vi.fn(async () => undefined);
    const fastAction: DeviceAction = {
      name: 'FastExit',
      description: 'fast exit action',
      delayBeforeRunner: 0,
      delayAfterRunner: 0,
      call: fastActionCall,
    };

    const fastInterface = new MockInterface([fastAction]);
    fastInterface.beforeInvokeAction = fastBeforeHook;
    fastInterface.afterInvokeAction = fastAfterHook;

    const insightService = {
      contextRetrieverFn: vi.fn(),
      locate: vi.fn(),
    } as unknown as Service;

    const defaultTaskBuilder = new TaskBuilder({
      interfaceInstance: defaultInterface,
      service: insightService,
      actionSpace: defaultInterface.actionSpace(),
    });

    const fastTaskBuilder = new TaskBuilder({
      interfaceInstance: fastInterface,
      service: insightService,
      actionSpace: fastInterface.actionSpace(),
    });

    const { tasks: defaultTasks } = await defaultTaskBuilder.build(
      [{ type: 'DefaultExit', thought: '', param: {} }],
      {} as any,
      {} as any,
    );
    const { tasks: fastTasks } = await fastTaskBuilder.build(
      [{ type: 'FastExit', thought: '', param: {} }],
      {} as any,
      {} as any,
    );

    const defaultTask = defaultTasks[0];
    const fastTask = fastTasks[0];
    const taskContext = {
      task: { timing: {} },
      uiContext: { shrunkShotToLogicalRatio: 1 },
    } as any;

    const defaultPromise = defaultTask.executor(defaultTask.param, taskContext);

    await vi.advanceTimersByTimeAsync(199);
    expect(defaultBeforeHook).toHaveBeenCalledTimes(1);
    expect(defaultActionCall).not.toHaveBeenCalled();
    expect(defaultAfterHook).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(defaultActionCall).toHaveBeenCalledTimes(1);
    expect(defaultAfterHook).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(299);
    expect(defaultAfterHook).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(defaultPromise).resolves.toEqual({ output: undefined });
    expect(defaultAfterHook).toHaveBeenCalledTimes(1);

    const fastPromise = fastTask.executor(fastTask.param, taskContext);
    await expect(fastPromise).resolves.toEqual({ output: undefined });
    expect(fastBeforeHook).toHaveBeenCalledTimes(1);
    expect(fastActionCall).toHaveBeenCalledTimes(1);
    expect(fastAfterHook).toHaveBeenCalledTimes(1);
  });
});
