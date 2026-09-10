import type { InitialPageReadyContext } from '@/agent';
import { InitialPageReady } from '@/agent/initial-page-ready';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

describe('InitialPageReady', () => {
  afterEach(() => {
    rs.useRealTimers();
    rs.restoreAllMocks();
  });

  it.each([null, true, [], async () => {}].map((options) => ({ options })))(
    'rejects invalid configuration $options',
    ({ options }) => {
      expect(() => new InitialPageReady(options as any)).toThrow(
        'waitForInitialPageReady must be an object',
      );
    },
  );

  it.each([{}, { timeoutMs: 10 }, { handler: true }])(
    'requires a handler in %s',
    (options) => {
      expect(() => new InitialPageReady(options as any)).toThrow(
        'waitForInitialPageReady.handler must be a function',
      );
    },
  );

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    'rejects invalid timeout %s',
    (timeoutMs) => {
      expect(
        () => new InitialPageReady({ handler: async () => {}, timeoutMs }),
      ).toThrow('waitForInitialPageReady.timeoutMs must be a positive integer');
    },
  );

  it('is lazy and shares one promise through concurrent and later calls', async () => {
    rs.useFakeTimers();
    let resolve!: () => void;
    const handler = rs.fn(
      () =>
        new Promise<void>((res) => {
          resolve = res;
        }),
    );
    const ready = new InitialPageReady({ handler });
    expect(handler).not.toHaveBeenCalled();
    const first = ready.wait();
    const second = ready.wait();
    expect(second).toBe(first);
    await Promise.resolve();
    expect(handler).toHaveBeenCalledOnce();
    resolve();
    await first;
    expect(ready.wait()).toBe(first);
    await ready.wait();
    expect(handler).toHaveBeenCalledOnce();
    expect(rs.getTimerCount()).toBe(0);
  });

  it.each([undefined, 50])(
    'bounds the handler with timeout %s and retains failure',
    async (timeoutMs) => {
      rs.useFakeTimers();
      let context!: InitialPageReadyContext;
      let reject!: (error: Error) => void;
      const handler = rs.fn((ctx: InitialPageReadyContext) => {
        context = ctx;
        return new Promise<void>((_resolve, rej) => {
          reject = rej;
        });
      });
      const ready = new InitialPageReady({ handler, timeoutMs });
      const pending = ready.wait();
      const effectiveTimeout = timeoutMs ?? 10_000;
      const assertion = expect(pending).rejects.toThrow(
        `Timed out after ${effectiveTimeout}ms`,
      );
      await rs.advanceTimersByTimeAsync(effectiveTimeout - 1);
      expect(context.signal.aborted).toBe(false);
      await rs.advanceTimersByTimeAsync(1);
      await assertion;
      expect(context.signal.aborted).toBe(true);
      expect(ready.wait()).toBe(pending);
      reject(new Error('late failure'));
      await Promise.resolve();
      expect(handler).toHaveBeenCalledOnce();
      expect(rs.getTimerCount()).toBe(0);
    },
  );

  it('preserves a synchronous failure without retrying', async () => {
    const cause = new Error('bootstrap failed');
    const handler = rs.fn(() => {
      throw cause;
    });
    const ready = new InitialPageReady({ handler });
    const first = ready.wait();
    await expect(first).rejects.toMatchObject({ cause });
    expect(ready.wait()).toBe(first);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('aborts pending work and removes the abort listener', async () => {
    rs.useFakeTimers();
    let signal!: AbortSignal;
    const ready = new InitialPageReady({
      handler: async (ctx) => {
        signal = ctx.signal;
        await new Promise(() => {});
      },
    });
    const pending = ready.wait();
    const assertion = expect(pending).rejects.toThrow('Agent destroyed');
    await Promise.resolve();
    const removeListener = rs.spyOn(signal, 'removeEventListener');
    ready.abort();
    await assertion;
    expect(signal.aborted).toBe(true);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(rs.getTimerCount()).toBe(0);
  });

  it('does not start work after destruction', async () => {
    const handler = rs.fn(async () => {});
    const ready = new InitialPageReady({ handler });
    ready.abort();
    await expect(ready.wait()).rejects.toThrow('Agent destroyed');
    expect(handler).not.toHaveBeenCalled();
  });
});
