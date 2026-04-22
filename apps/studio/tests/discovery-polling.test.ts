import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DISCOVERY_POLL_INTERVAL_MS,
  scheduleDiscoveryPolling,
} from '../src/renderer/playground/discovery-polling';

describe('scheduleDiscoveryPolling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays the first refresh until after the initial polling interval', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);

    const cleanup = scheduleDiscoveryPolling({ refresh });

    await vi.advanceTimersByTimeAsync(DISCOVERY_POLL_INTERVAL_MS - 1);
    expect(refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(DISCOVERY_POLL_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(2);

    cleanup();
  });

  it('cancels both the delayed first refresh and the repeating interval', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);

    const cleanup = scheduleDiscoveryPolling({ refresh });
    cleanup();

    await vi.advanceTimersByTimeAsync(DISCOVERY_POLL_INTERVAL_MS * 3);
    expect(refresh).not.toHaveBeenCalled();
  });
});
