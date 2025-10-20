import { TaskBuilder } from '@/agent/task-builder';
import { getMidsceneLocationSchema } from '@/ai-model';
import { AbstractInterface } from '@/device';
import type Insight from '@/insight';
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

  async actionSpace(): Promise<DeviceAction[]> {
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

    const mockInterface = new MockInterface([mockAction]);

    const insight = {
      contextRetrieverFn: vi.fn(),
      locate: vi.fn(),
    } as unknown as Insight;

    const taskBuilder = new TaskBuilder({
      interfaceInstance: mockInterface,
      insight,
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

    const { tasks } = await taskBuilder.build(plans, {} as any);

    expect(tasks.map((task) => [task.type, task.subType])).toEqual([
      ['Insight', 'Locate'],
      ['Action', 'Finished'],
      ['Action', 'Sleep'],
      ['Insight', 'Locate'],
      ['Action', 'Tap'],
    ]);
  });
});
