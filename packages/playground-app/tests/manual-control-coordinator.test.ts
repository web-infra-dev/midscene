import { describe, expect, it, vi } from 'vitest';
import {
  ManualControlFrozenError,
  createManualControlCoordinator,
} from '../src/manual-control-coordinator';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe('manual control coordinator', () => {
  it('freezes new tasks and drains accepted and batched tasks in order', async () => {
    const coordinator = createManualControlCoordinator();
    const first = createDeferred<void>();
    const calls: string[] = [];
    const firstTask = coordinator.enqueue(async () => {
      calls.push('first-start');
      await first.promise;
      calls.push('first-end');
    });
    const pendingTask = vi.fn(() => async () => {
      calls.push('pending');
    });
    coordinator.registerPendingTaskSource(pendingTask);

    const drain = coordinator.freezeAndDrain();

    await expect(
      coordinator.enqueue(async () => undefined),
    ).rejects.toBeInstanceOf(ManualControlFrozenError);
    expect(pendingTask).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['first-start']);

    first.resolve();
    await Promise.all([firstTask, drain]);
    expect(calls).toEqual(['first-start', 'first-end', 'pending']);

    coordinator.resume();
    await expect(coordinator.enqueue(async () => 'resumed')).resolves.toBe(
      'resumed',
    );
  });

  it('keeps draining after an earlier task rejects', async () => {
    const coordinator = createManualControlCoordinator();
    const second = vi.fn(async () => undefined);

    await expect(
      coordinator.enqueue(async () => {
        throw new Error('failed interaction');
      }),
    ).rejects.toThrow('failed interaction');
    await coordinator.enqueue(second);
    await coordinator.freezeAndDrain();

    expect(second).toHaveBeenCalledTimes(1);
  });
});
