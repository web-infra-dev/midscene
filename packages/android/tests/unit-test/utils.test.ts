import { ADB } from 'appium-adb';
import { describe, expect, it, vi } from 'vitest';
import { getConnectedDevices } from '../../src/utils';

vi.mock('appium-adb', () => {
  const mockAdb = {
    getConnectedDevices: vi.fn(),
  };
  return {
    ADB: {
      createADB: vi.fn(() => Promise.resolve(mockAdb)),
    },
  };
});

describe('Android Utils', () => {
  describe('getConnectedDevices', () => {
    it('should return a list of connected devices', async () => {
      const mockDevices = [{ udid: 'device-1' }, { udid: 'device-2' }];
      const mockAdbInstance = await ADB.createADB();
      (mockAdbInstance.getConnectedDevices as vi.Mock).mockResolvedValue(
        mockDevices,
      );

      const devices = await getConnectedDevices();

      expect(ADB.createADB).toHaveBeenCalled();
      expect(mockAdbInstance.getConnectedDevices).toHaveBeenCalled();
      expect(devices).toEqual(mockDevices);
    });

    it('should throw a formatted error if getting devices fails', async () => {
      const error = new Error('Failed to connect to ADB');
      const mockAdbInstance = await ADB.createADB();
      (mockAdbInstance.getConnectedDevices as vi.Mock).mockRejectedValue(error);

      await expect(getConnectedDevices()).rejects.toThrow(
        `Unable to get connected Android device list, please check https://midscenejs.com/integrate-with-android.html#faq : ${error.message}`,
      );
    });
  });
});
