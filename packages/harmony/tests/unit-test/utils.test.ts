import { describe, expect, it, vi } from 'vitest';
import { HdcClient } from '../../src/hdc';
import { getConnectedDevices } from '../../src/utils';

vi.mock('../../src/hdc', () => {
  const mockListTargets = vi.fn();
  return {
    HdcClient: vi.fn(() => ({
      listTargets: mockListTargets,
    })),
    __mockListTargets: mockListTargets,
  };
});

describe('Harmony Utils', () => {
  describe('getConnectedDevices', () => {
    it('should return a list of connected devices', async () => {
      const mockTargets = ['device-1', 'device-2'];
      const { __mockListTargets } = (await import('../../src/hdc')) as any;
      __mockListTargets.mockResolvedValue(mockTargets);

      const devices = await getConnectedDevices();

      expect(HdcClient).toHaveBeenCalled();
      expect(devices).toEqual([
        { deviceId: 'device-1' },
        { deviceId: 'device-2' },
      ]);
    });

    it('should throw a formatted error if getting devices fails', async () => {
      const error = new Error('Failed to connect to HDC');
      const { __mockListTargets } = (await import('../../src/hdc')) as any;
      __mockListTargets.mockRejectedValue(error);

      await expect(getConnectedDevices()).rejects.toThrow(
        'Unable to get connected HarmonyOS device list',
      );
    });
  });
});
