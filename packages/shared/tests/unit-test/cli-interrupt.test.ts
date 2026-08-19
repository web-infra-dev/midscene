import { EventEmitter } from 'node:events';
import {
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

  it('does not treat unrelated SIGINT listeners as CLI waiters', () => {
    const source = new EventEmitter();
    source.on('SIGINT', () => {});

    expect(hasActiveCliInterruptWaiter(source)).toBe(false);
  });
});
