import {
  ActionReadiness,
  isActionReadinessError,
} from '@/agent/action-readiness';
import type { ActionReadyPlan } from '@/types';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

const action = { id: 'action-1', name: 'Tap', param: {} };
const run = (readiness: ActionReadiness, signal?: AbortSignal) =>
  readiness.run(action, signal, (scope) => scope.wait());

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('ActionReadiness', () => {
  afterEach(() => {
    rs.useRealTimers();
  });

  it.each([null, false, [], 'ready'])(
    'rejects invalid configuration %j',
    (options) => {
      expect(() => new ActionReadiness(options as any)).toThrow(
        'must be an object',
      );
    },
  );

  it('requires a factory and a valid timeout', () => {
    expect(() => new ActionReadiness({} as any)).toThrow(
      'createWaiter must be a function',
    );
    for (const timeoutMs of [
      0,
      -1,
      0.1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2_147_483_648,
    ]) {
      expect(
        () => new ActionReadiness({ createWaiter: () => 'skip', timeoutMs }),
      ).toThrow('positive integer');
    }
  });

  it.each([
    undefined,
    null,
    true,
    {},
    { wait: true },
    { wait: async () => {}, dispose: true },
  ])(
    'rejects invalid factory result %j before executing the action',
    async (plan) => {
      const execute = rs.fn();
      const readiness = new ActionReadiness({
        createWaiter: () => plan as any,
      });
      await expect(readiness.run(action, undefined, execute)).rejects.toThrow(
        'createWaiter must return',
      );
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it('observes an event emitted during the action, then waits and disposes', async () => {
    const events: string[] = [];
    const ready = deferred();
    const readiness = new ActionReadiness({
      createWaiter: () => {
        events.push('subscribe');
        return {
          wait: async () => {
            events.push('wait');
            await ready.promise;
          },
          dispose: () => {
            events.push('dispose');
          },
        };
      },
    });
    await readiness.run(action, undefined, async (scope) => {
      events.push('action');
      ready.resolve();
      await scope.wait();
      events.push('next');
    });
    expect(events).toEqual(['subscribe', 'action', 'wait', 'next', 'dispose']);
  });

  it('waits for asynchronous subscription setup before running the action', async () => {
    const subscribed = deferred();
    const started = deferred();
    const execute = rs.fn(async () => {});
    const readiness = new ActionReadiness({
      createWaiter: async () => {
        started.resolve();
        await subscribed.promise;
        return 'skip' as const;
      },
    });
    const pending = readiness.run(action, undefined, execute);
    await started.promise;
    expect(execute).not.toHaveBeenCalled();
    subscribed.resolve();
    await pending;
    expect(execute).toHaveBeenCalledOnce();
  });

  it.each(['createWaiter', 'wait'] as const)(
    'bounds %s and aborts the action signal',
    async (phase) => {
      rs.useFakeTimers();
      const started = deferred();
      let signal!: AbortSignal;
      const never = () => new Promise<void>(() => {});
      const readiness = new ActionReadiness({
        timeoutMs: 30,
        createWaiter: (ctx) => {
          signal = ctx.signal;
          if (phase === 'createWaiter') {
            started.resolve();
            return new Promise<ActionReadyPlan>(() => {});
          }
          return {
            wait: () => {
              started.resolve();
              return never();
            },
          };
        },
      });
      const assertion = expect(run(readiness)).rejects.toThrow(
        'Timed out after 30ms',
      );
      await started.promise;
      await rs.advanceTimersByTimeAsync(30);
      await assertion;
      expect(signal.aborted).toBe(true);
    },
  );

  it('disposes a factory result that arrives after timeout', async () => {
    rs.useFakeTimers();
    const factory = deferred<ActionReadyPlan>();
    const dispose = rs.fn();
    const readiness = new ActionReadiness({
      timeoutMs: 20,
      createWaiter: () => factory.promise,
    });
    const assertion = expect(run(readiness)).rejects.toThrow('Timed out');
    await rs.advanceTimersByTimeAsync(20);
    await assertion;
    factory.resolve({ wait: async () => {}, dispose });
    await rs.advanceTimersByTimeAsync(0);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('cleans up invalid waiters and preserves factory validation errors', async () => {
    const dispose = rs.fn();
    const readiness = new ActionReadiness({
      createWaiter: () => ({ dispose }) as any,
    });
    await expect(run(readiness)).rejects.toThrow('createWaiter must return');
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('does not mask action failures with disposal failures', async () => {
    const wait = rs.fn();
    const readiness = new ActionReadiness({
      createWaiter: () => ({
        wait,
        dispose: () => {
          throw new Error('cleanup failed');
        },
      }),
    });
    await expect(
      readiness.run(action, undefined, async () => {
        throw new Error('action failed');
      }),
    ).rejects.toThrow('action failed');
    expect(wait).not.toHaveBeenCalled();
  });

  it('bounds cleanup and makes cleanup failure terminal', async () => {
    rs.useFakeTimers();
    const started = deferred();
    const readiness = new ActionReadiness({
      timeoutMs: 20,
      createWaiter: () => ({
        wait: async () => {},
        dispose: () => {
          started.resolve();
          return new Promise<void>(() => {});
        },
      }),
    });
    const assertion = expect(run(readiness)).rejects.toThrow('dispose failed');
    await started.promise;
    await rs.advanceTimersByTimeAsync(20);
    await assertion;
  });

  it.each(['cancel', 'destroy'] as const)(
    'cleans up on %s while waiting',
    async (kind) => {
      const started = deferred();
      const controller = new AbortController();
      const dispose = rs.fn();
      const readiness = new ActionReadiness({
        createWaiter: () => ({
          wait: () => {
            started.resolve();
            return new Promise<void>(() => {});
          },
          dispose,
        }),
      });
      const assertion = expect(
        run(readiness, controller.signal),
      ).rejects.toThrow(kind === 'destroy' ? 'Agent destroyed' : 'cancelled');
      await started.promise;
      if (kind === 'destroy') await readiness.destroy();
      else controller.abort(new Error('cancelled'));
      await assertion;
      expect(dispose).toHaveBeenCalledOnce();
    },
  );

  it('gives subsequent actions a fresh waiter after failure', async () => {
    const createWaiter = rs
      .fn<() => ActionReadyPlan>()
      .mockReturnValueOnce({
        wait: async () => {
          throw new Error('first failed');
        },
      })
      .mockReturnValueOnce('skip');
    const readiness = new ActionReadiness({ createWaiter });
    await expect(run(readiness)).rejects.toThrow('first failed');
    await run(readiness);
    expect(createWaiter).toHaveBeenCalledTimes(2);
  });

  it('recognizes serialized readiness failures without message matching', () => {
    expect(
      isActionReadinessError({
        code: 'TASK_EXECUTION_FAILED',
        cause: { code: 'ACTION_READINESS_FAILED' },
      }),
    ).toBe(true);
    expect(isActionReadinessError(new Error('ACTION_READINESS_FAILED'))).toBe(
      false,
    );
  });
});
