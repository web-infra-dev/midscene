import { describe, expect, it } from 'vitest';
import { bucketDiscoveredDevices } from '../src/renderer/playground/selectors';

describe('bucketDiscoveredDevices', () => {
  it('returns empty buckets for every platform when no devices are discovered', () => {
    expect(bucketDiscoveredDevices([])).toEqual({
      android: [],
      ios: [],
      computer: [],
      harmony: [],
      web: [],
    });
  });

  it('groups devices by their platformId tag', () => {
    const result = bucketDiscoveredDevices([
      { platformId: 'android', id: 'a1', label: 'Pixel' },
      {
        platformId: 'ios',
        id: 'localhost:8100',
        label: 'iOS via WDA',
        sessionValues: {
          host: 'localhost',
          port: 8100,
        },
      },
      { platformId: 'android', id: 'a2', label: 'Galaxy' },
      { platformId: 'computer', id: 'c1', label: 'Display 1' },
    ]);

    expect(result.android.map((d) => d.id)).toEqual(['a1', 'a2']);
    expect(result.ios).toEqual([
      {
        platformId: 'ios',
        id: 'localhost:8100',
        label: 'iOS via WDA',
        sessionValues: {
          host: 'localhost',
          port: 8100,
        },
      },
    ]);
    expect(result.computer.map((d) => d.id)).toEqual(['c1']);
    expect(result.harmony).toEqual([]);
    expect(result.web).toEqual([]);
  });
});
