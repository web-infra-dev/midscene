import { TaskBuilder } from '@/agent/task-builder';
import { getMidsceneLocationSchema } from '@/ai-model';
import { AbstractInterface, defineActionSleep } from '@/device';
import type Service from '@/insight';
import type { DeviceAction, PlanningAction } from '@/types';
import { describe, expect, it, vi } from 'vitest';
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
    expect(tasks.every((task) => task.subTask === undefined)).toBe(true);
  });

  it('marks tasks as subTask when build receives subTask option', async () => {
    const actionSchema = z.object({
      locate: getMidsceneLocationSchema().describe('element to locate'),
    });

    const mockAction: DeviceAction = {
      name: 'Tap',
      description: 'mock tap action',
      paramSchema: actionSchema,
      call: vi.fn(),
    };

    const mockInterface = new MockInterface([mockAction]);

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
        type: 'Tap',
        thought: 'tap element',
        param: { locate: { prompt: 'button' } },
      },
    ];

    const { tasks } = await taskBuilder.build(plans, {} as any, {} as any, {
      subTask: true,
    });

    expect(tasks.every((task) => task.subTask === true)).toBe(true);
  });
});
