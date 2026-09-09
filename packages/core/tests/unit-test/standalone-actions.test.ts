import { Agent } from '@/agent';
import { TaskBuilder } from '@/agent/task-builder';
import { getMidsceneLocationSchema } from '@/common';
import type { AbstractInterface } from '@/device';
import type Service from '@/service';
import type { DeviceAction } from '@/types';
import { describe, expect, it, rs } from '@rstest/core';
import { z } from 'zod';

function createAgent(action: DeviceAction) {
  const screenshotBase64 = rs.fn(async () => {
    throw new Error('Standalone actions must not capture screenshots');
  });
  const beforeInvokeAction = rs.fn();
  const afterInvokeAction = rs.fn();
  const agent = new Agent(
    {
      interfaceType: 'mock',
      actionSpace: () => [action],
      screenshotBase64,
      beforeInvokeAction,
      afterInvokeAction,
    } as unknown as AbstractInterface,
    { generateReport: false },
  );
  return { agent, screenshotBase64, beforeInvokeAction, afterInvokeAction };
}

describe('standalone actions', () => {
  it('uses schema defaults and records output through the normal runner without device dependencies', async () => {
    const call = rs.fn(async (param: { count: number }) => param.count * 2);
    const { agent, screenshotBase64, beforeInvokeAction, afterInvokeAction } =
      createAgent({
        name: 'Calculate',
        executionMode: 'standalone',
        paramSchema: z.object({ count: z.number().default(3) }),
        call,
      });
    try {
      expect(await agent.callActionInActionSpace('Calculate', {})).toBe(6);
      expect(call.mock.calls[0][0]).toEqual({ count: 3 });
      const task = JSON.parse(agent.dumpDataString()).executions[0].tasks[0];
      expect(task).toMatchObject({
        status: 'finished',
        subType: 'Calculate',
        output: 6,
      });
      expect(task.uiContext).toBeUndefined();
      expect(screenshotBase64).not.toHaveBeenCalled();
      expect(beforeInvokeAction).not.toHaveBeenCalled();
      expect(afterInvokeAction).not.toHaveBeenCalled();
    } finally {
      await agent.destroy();
    }
  });

  it.each(['invalid parameters', 'executor failure'])(
    'records %s as a failed task',
    async (failure) => {
      const call = rs.fn(async () => {
        throw new Error('executor failed');
      });
      const { agent, screenshotBase64 } = createAgent({
        name: 'Fail',
        executionMode: 'standalone',
        paramSchema: z.object({ count: z.number() }),
        call,
      });
      try {
        await expect(
          agent.callActionInActionSpace('Fail', {
            count: failure === 'invalid parameters' ? 'invalid' : 1,
          }),
        ).rejects.toThrow();
        const task = JSON.parse(agent.dumpDataString()).executions[0].tasks[0];
        expect(task.status).toBe('failed');
        expect(task.errorMessage).toContain(
          failure === 'invalid parameters' ? 'number' : 'executor failed',
        );
        expect(screenshotBase64).not.toHaveBeenCalled();
        expect(call).toHaveBeenCalledTimes(
          failure === 'invalid parameters' ? 0 : 1,
        );
      } finally {
        await agent.destroy();
      }
    },
  );

  it('rejects locator fields on standalone actions before resolving a model', async () => {
    const model = rs.fn(() => {
      throw new Error('Model must stay lazy');
    });
    const builder = new TaskBuilder({
      interfaceInstance: {} as AbstractInterface,
      service: {} as Service,
      actionSpace: [
        {
          name: 'Invalid',
          executionMode: 'standalone',
          paramSchema: z.object({ locate: getMidsceneLocationSchema() }),
          call: rs.fn(),
        },
      ],
    });
    await expect(
      builder.build(
        [{ type: 'Invalid', param: {}, thought: '' }],
        model,
        model,
      ),
    ).rejects.toThrow(
      'Standalone action Invalid cannot declare locator fields',
    );
    expect(model).not.toHaveBeenCalled();
  });
});
