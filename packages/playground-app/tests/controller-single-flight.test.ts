import { describe, expect, it, vi } from 'vitest';
import { runSingleFlight } from '../src/controller/single-flight';

describe('runSingleFlight', () => {
  it('reuses the in-flight promise for concurrent calls', async () => {
    const pendingRef: { current: Promise<string> | null } = {
      current: null,
    };
    let resolveTask: ((value: string) => void) | null = null;
    const task = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveTask = resolve;
        }),
    );

    const first = runSingleFlight(pendingRef, task);
    const second = runSingleFlight(pendingRef, task);

    expect(task).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    resolveTask?.('done');

    await expect(first).resolves.toBe('done');
    await expect(second).resolves.toBe('done');
  });

  it('clears the pending promise after settlement', async () => {
    const pendingRef: { current: Promise<string> | null } = {
      current: null,
    };
    const task = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    await expect(runSingleFlight(pendingRef, task)).resolves.toBe('first');
    expect(pendingRef.current).toBeNull();

    await expect(runSingleFlight(pendingRef, task)).resolves.toBe('second');
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('clears the pending promise after rejection so the next call can retry', async () => {
    const pendingRef: { current: Promise<string> | null } = {
      current: null,
    };
    const task = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered');

    await expect(runSingleFlight(pendingRef, task)).rejects.toThrow('boom');
    expect(pendingRef.current).toBeNull();

    await expect(runSingleFlight(pendingRef, task)).resolves.toBe('recovered');
    expect(task).toHaveBeenCalledTimes(2);
  });
});
