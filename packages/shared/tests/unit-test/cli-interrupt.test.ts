import { EventEmitter } from 'node:events';
import { waitForCliInterrupt } from '@/cli/interrupt';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('waitForCliInterrupt', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves on SIGINT and removes its listener', async () => {
    const source = new EventEmitter();
    const stopped = waitForCliInterrupt(0, source);

    source.emit('SIGINT');

    await expect(stopped).resolves.toBe('sigint');
    expect(source.listenerCount('SIGINT')).toBe(0);
  });

  it('uses the watchdog to finalize a forgotten recording', async () => {
    vi.useFakeTimers();
    const source = new EventEmitter();
    const stopped = waitForCliInterrupt(5000, source);

    await vi.advanceTimersByTimeAsync(5000);

    await expect(stopped).resolves.toBe('watchdog');
    expect(source.listenerCount('SIGINT')).toBe(0);
  });
});
