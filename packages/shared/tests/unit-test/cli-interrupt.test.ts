import { EventEmitter } from 'node:events';
import {
  createCliInterruptWaiter,
  hasActiveCliInterruptWaiter,
  waitForCliInterrupt,
} from '@/cli/interrupt';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

describe('waitForCliInterrupt', () => {
  afterEach(() => {
    rs.useRealTimers();
  });

  it('resolves on SIGINT and removes its listener', async () => {
    const source = new EventEmitter();
    const stopped = waitForCliInterrupt(0, source);

    expect(hasActiveCliInterruptWaiter(source)).toBe(true);
    source.emit('SIGINT');

    await expect(stopped).resolves.toBe('sigint');
    expect(hasActiveCliInterruptWaiter(source)).toBe(false);
    expect(source.listenerCount('SIGINT')).toBe(0);
  });

  it('uses the watchdog to finalize a forgotten recording', async () => {
    rs.useFakeTimers();
    const source = new EventEmitter();
    const stopped = waitForCliInterrupt(5000, source);

    expect(hasActiveCliInterruptWaiter(source)).toBe(true);
    await rs.advanceTimersByTimeAsync(5000);

    await expect(stopped).resolves.toBe('watchdog');
    expect(hasActiveCliInterruptWaiter(source)).toBe(false);
    expect(source.listenerCount('SIGINT')).toBe(0);
  });

  it('keeps termination signals guarded until asynchronous saving finishes', async () => {
    const source = new EventEmitter();
    const waiter = createCliInterruptWaiter(0, { source });

    source.emit('SIGINT');
    await expect(waiter.result).resolves.toBe('sigint');

    expect(hasActiveCliInterruptWaiter(source)).toBe(true);
    expect(source.listenerCount('SIGINT')).toBe(1);
    expect(source.listenerCount('SIGTERM')).toBe(1);
    expect(source.listenerCount('SIGHUP')).toBe(1);

    // Package runners may forward SIGTERM after the terminal's SIGINT and
    // trigger SIGHUP when the parent exits. Both must be absorbed while the
    // recorder is still saving.
    source.emit('SIGTERM');
    source.emit('SIGHUP');
    expect(hasActiveCliInterruptWaiter(source)).toBe(true);

    waiter.dispose();
    expect(hasActiveCliInterruptWaiter(source)).toBe(false);
    expect(source.listenerCount('SIGINT')).toBe(0);
    expect(source.listenerCount('SIGTERM')).toBe(0);
    expect(source.listenerCount('SIGHUP')).toBe(0);
  });

  it('gracefully stops on SIGTERM', async () => {
    const source = new EventEmitter();
    const stopped = waitForCliInterrupt(0, source);

    source.emit('SIGTERM');

    await expect(stopped).resolves.toBe('sigterm');
    expect(hasActiveCliInterruptWaiter(source)).toBe(false);
    expect(source.listenerCount('SIGINT')).toBe(0);
    expect(source.listenerCount('SIGTERM')).toBe(0);
    expect(source.listenerCount('SIGHUP')).toBe(0);
  });

  it('gracefully stops on SIGHUP', async () => {
    const source = new EventEmitter();
    const stopped = waitForCliInterrupt(0, source);

    source.emit('SIGHUP');

    await expect(stopped).resolves.toBe('sighup');
    expect(hasActiveCliInterruptWaiter(source)).toBe(false);
    expect(source.listenerCount('SIGINT')).toBe(0);
    expect(source.listenerCount('SIGTERM')).toBe(0);
    expect(source.listenerCount('SIGHUP')).toBe(0);
  });

  it('captures terminal Ctrl+C as input until saving finishes', async () => {
    const source = new EventEmitter();
    const input = Object.assign(new EventEmitter(), {
      isTTY: true,
      isRaw: false,
      readableFlowing: null as boolean | null,
      setRawMode(enabled: boolean) {
        this.isRaw = enabled;
      },
      pause() {
        this.readableFlowing = false;
      },
    });
    const waiter = createCliInterruptWaiter(0, { source, input });

    expect(input.isRaw).toBe(true);
    input.emit('data', Buffer.from([3]));

    await expect(waiter.result).resolves.toBe('sigint');
    expect(input.isRaw).toBe(true);
    expect(input.listenerCount('data')).toBe(1);

    waiter.dispose();
    expect(input.isRaw).toBe(false);
    expect(input.readableFlowing).toBe(false);
    expect(input.listenerCount('data')).toBe(0);
  });

  it('releases the terminal guard on a second Ctrl+C during finalization', async () => {
    const source = new EventEmitter();
    const forceExit = rs.fn();
    const input = Object.assign(new EventEmitter(), {
      isTTY: true,
      isRaw: false,
      readableFlowing: null as boolean | null,
      setRawMode(enabled: boolean) {
        this.isRaw = enabled;
      },
      pause() {
        this.readableFlowing = false;
      },
    });
    const waiter = createCliInterruptWaiter(0, {
      source,
      input,
      forceExit,
    });

    input.emit('data', Buffer.from([3]));
    await expect(waiter.result).resolves.toBe('sigint');

    input.emit('data', Buffer.from([3]));

    expect(hasActiveCliInterruptWaiter(source)).toBe(false);
    expect(input.isRaw).toBe(false);
    expect(input.readableFlowing).toBe(false);
    expect(input.listenerCount('data')).toBe(0);
    expect(forceExit).toHaveBeenCalledWith(130);
  });

  it('restores the terminal when input listener setup fails', async () => {
    const source = new EventEmitter();
    const input = {
      isTTY: true,
      isRaw: false,
      readableFlowing: null as boolean | null,
      on() {
        throw new Error('input setup failed');
      },
      removeListener: rs.fn(),
      setRawMode(enabled: boolean) {
        this.isRaw = enabled;
      },
      pause() {
        this.readableFlowing = false;
      },
    };
    const waiter = createCliInterruptWaiter(0, { source, input });

    await expect(waiter.result).rejects.toThrow('input setup failed');
    expect(input.isRaw).toBe(false);
    expect(input.readableFlowing).toBe(false);
    expect(hasActiveCliInterruptWaiter(source)).toBe(false);
    expect(source.listenerCount('SIGINT')).toBe(0);
    expect(source.listenerCount('SIGTERM')).toBe(0);
    expect(source.listenerCount('SIGHUP')).toBe(0);
  });

  it('does not treat unrelated SIGINT listeners as CLI waiters', () => {
    const source = new EventEmitter();
    source.on('SIGINT', () => {});

    expect(hasActiveCliInterruptWaiter(source)).toBe(false);
  });
});
