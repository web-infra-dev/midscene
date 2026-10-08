import { TaskExecutor } from '@/agent/tasks';
import { getModelRuntime } from '@/ai-model/models';
import { type AbstractInterface, defineActionSleep } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type Service from '@/service';
import { TaskRunner } from '@/task-runner';
import type { ExecutorContext, UIContext } from '@/types';
import { describe, expect, it, rs } from '@rstest/core';

const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const context = (): UIContext =>
  ({
    screenshot: ScreenshotItem.create('', Date.now()),
    tree: { node: null, children: [] },
    shotSize: { width: 1, height: 1 },
    shrunkShotToLogicalRatio: 1,
  }) as unknown as UIContext;

describe('task cancellation boundaries', () => {
  it('cancels a queued task before dispatch without inventing a start time', async () => {
    const controller = new AbortController();
    const action = rs.fn();
    const runner = new TaskRunner('queued', async () => context(), {
      abortSignal: controller.signal,
      tasks: [{ type: 'Action Space', executor: action }],
    });
    controller.abort(new Error('queued cancellation'));
    await expect(runner.flush()).rejects.toThrow('queued cancellation');
    expect(action).not.toHaveBeenCalled();
    expect(runner.tasks[0].status).toBe('cancelled');
    expect(runner.tasks[0].timing).toBeUndefined();
  });
  it('stops a batch after the current non-cooperative executor actually settles', async () => {
    const controller = new AbortController();
    const entered = gate();
    const pending = gate();
    const second = rs.fn();
    const screenshots = rs.fn(async () => context());
    const runner = new TaskRunner('batch', screenshots, {
      abortSignal: controller.signal,
    });
    const execution = runner.appendAndFlush([
      {
        type: 'Action Space',
        executor: async (ctx) => {
          expect(ctx.signal).toBe(controller.signal);
          entered.resolve();
          await pending.promise;
        },
      },
      { type: 'Action Space', executor: second },
    ]);
    let settled = false;
    const outcome = execution.catch((error) => {
      settled = true;
      return error;
    });
    await entered.promise;
    controller.abort(new Error('stop batch'));
    await Promise.resolve();
    expect(settled).toBe(false);
    pending.resolve();
    expect((await outcome).message).toContain('stop batch');
    expect(second).not.toHaveBeenCalled();
    expect(screenshots).toHaveBeenCalledTimes(1);
    expect(runner.tasks.map((task) => task.status)).toEqual([
      'failed',
      'cancelled',
    ]);
  });

  it('checks cancellation after the task hook and before screenshots or execution', async () => {
    const controller = new AbortController();
    const action = rs.fn();
    const screenshots = rs.fn(async () => context());
    const runner = new TaskRunner('hook', screenshots, {
      abortSignal: controller.signal,
      onTaskStart: (_task, signal) => {
        expect(signal).toBe(controller.signal);
        controller.abort(new Error('hook stopped'));
      },
    });
    await expect(
      runner.appendAndFlush({ type: 'Action Space', executor: action }),
    ).rejects.toThrow('hook stopped');
    expect(action).not.toHaveBeenCalled();
    expect(screenshots).not.toHaveBeenCalled();
  });

  it('forwards cancellation to the context provider and rechecks before dispatch', async () => {
    const controller = new AbortController();
    const action = rs.fn();
    const runner = new TaskRunner(
      'context',
      async (signal) => {
        expect(signal).toBe(controller.signal);
        controller.abort(new Error('capture stopped'));
        return context();
      },
      { abortSignal: controller.signal },
    );
    await expect(
      runner.appendAndFlush({ type: 'Action Space', executor: action }),
    ).rejects.toThrow('capture stopped');
    expect(action).not.toHaveBeenCalled();
  });

  it('lets device Sleep consume the executor signal', async () => {
    const controller = new AbortController();
    const sleeping = defineActionSleep().call({ timeMs: 60_000 }, {
      signal: controller.signal,
    } as ExecutorContext);
    controller.abort(new Error('sleep stopped'));
    await expect(sleeping).rejects.toThrow('sleep stopped');
  });

  it('forwards implicit execution signals to actions, hooks, waits and model requests', async () => {
    const controller = new AbortController();
    const action = rs.fn(async (_param, ctx: ExecutorContext) => {
      expect(ctx.signal).toBe(controller.signal);
    });
    const before = rs.fn();
    const after = rs.fn();
    const wait = rs.fn();
    const service = {
      contextRetrieverFn: rs.fn(async () => context()),
      extract: rs.fn(async (...args: any[]) => {
        expect(args.at(-1).abortSignal).toBe(controller.signal);
        return { data: { result: true }, dump: {} };
      }),
    } as unknown as Service;
    const executor = new TaskExecutor(
      {
        interfaceType: 'mock',
        beforeInvokeAction: before,
        afterInvokeAction: after,
        defaultActionWait: wait,
      } as unknown as AbstractInterface,
      service,
      {
        actionSpace: [
          {
            name: 'Noop',
            description: '',
            delayBeforeRunner: 0,
            delayAfterRunner: 0,
            call: action,
          },
        ],
        getAbortSignal: () => controller.signal,
      },
    );
    const model = getModelRuntime({
      modelName: 'mock',
      modelDescription: '',
      intent: 'default',
      slot: 'default',
    });
    await executor.runPlans(
      'action',
      [{ type: 'Noop', param: {} }],
      model,
      model,
    );
    expect(action).toHaveBeenCalledTimes(1);
    expect(before).toHaveBeenCalledWith('Noop', {}, controller.signal);
    expect(wait).toHaveBeenCalledWith('Noop', {}, controller.signal);
    expect(after).toHaveBeenCalledWith('Noop', {}, controller.signal);
    await executor.createTypeQueryExecution('Query', 'result', model);
    expect(service.extract).toHaveBeenCalledTimes(1);
  });

  it('does not release a non-cooperative hook when the parallel delay is cancelled', async () => {
    const controller = new AbortController();
    const entered = gate();
    const pending = gate();
    const action = rs.fn();
    const executor = new TaskExecutor(
      {
        interfaceType: 'mock',
        beforeInvokeAction: async () => {
          entered.resolve();
          await pending.promise;
        },
      } as unknown as AbstractInterface,
      { contextRetrieverFn: async () => context() } as unknown as Service,
      {
        actionSpace: [
          {
            name: 'Noop',
            description: '',
            delayBeforeRunner: 60_000,
            call: action,
          },
        ],
      },
    );
    const model = getModelRuntime({
      modelName: 'mock',
      modelDescription: '',
      intent: 'default',
      slot: 'default',
    });
    const execution = executor.runPlans(
      'hook',
      [{ type: 'Noop', param: {} }],
      model,
      model,
      { abortSignal: controller.signal },
    );
    let settled = false;
    const outcome = execution.catch((error) => {
      settled = true;
      return error;
    });
    await entered.promise;
    controller.abort(new Error('stop hook'));
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    pending.resolve();
    expect((await outcome).message).toContain('stop hook');
    expect(action).not.toHaveBeenCalled();
  });
});
