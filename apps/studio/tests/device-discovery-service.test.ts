import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEVICE_DISCOVERY_POLL_INTERVAL_MS,
  createDeviceDiscoveryService,
} from '../src/main/playground/device-discovery';

describe('createDeviceDiscoveryService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes immediately and publishes changed snapshots to listeners', async () => {
    vi.useFakeTimers();

    const discoverDevices = vi
      .fn()
      .mockResolvedValueOnce([
        {
          platformId: 'android',
          id: 'device-1',
          label: 'Pixel 9',
          status: 'device',
        },
      ])
      .mockResolvedValueOnce([
        {
          platformId: 'android',
          id: 'device-2',
          label: 'Pixel 10',
          status: 'device',
        },
      ]);

    const service = createDeviceDiscoveryService({
      discoverDevices,
      intervalMs: DEVICE_DISCOVERY_POLL_INTERVAL_MS,
    });
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);

    await service.getSnapshot();

    expect(discoverDevices).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith([
      {
        platformId: 'android',
        id: 'device-1',
        label: 'Pixel 9',
        status: 'device',
      },
    ]);

    await vi.advanceTimersByTimeAsync(DEVICE_DISCOVERY_POLL_INTERVAL_MS);

    expect(discoverDevices).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith([
      {
        platformId: 'android',
        id: 'device-2',
        label: 'Pixel 10',
        status: 'device',
      },
    ]);

    unsubscribe();
    service.close();
  });

  it('pauses background polling while still allowing forced refreshes', async () => {
    vi.useFakeTimers();

    const discoverDevices = vi.fn().mockResolvedValue([
      {
        platformId: 'android',
        id: 'device-1',
        label: 'Pixel 9',
        status: 'device',
      },
    ]);

    const service = createDeviceDiscoveryService({
      discoverDevices,
      intervalMs: DEVICE_DISCOVERY_POLL_INTERVAL_MS,
    });

    await service.getSnapshot();
    expect(discoverDevices).toHaveBeenCalledTimes(1);

    service.setPollingPaused(true);
    await vi.advanceTimersByTimeAsync(DEVICE_DISCOVERY_POLL_INTERVAL_MS * 2);
    expect(discoverDevices).toHaveBeenCalledTimes(1);

    await service.getSnapshot({ forceRefresh: true });
    expect(discoverDevices).toHaveBeenCalledTimes(2);

    service.setPollingPaused(false);
    await vi.advanceTimersByTimeAsync(DEVICE_DISCOVERY_POLL_INTERVAL_MS);
    expect(discoverDevices).toHaveBeenCalledTimes(4);

    service.close();
  });
});
