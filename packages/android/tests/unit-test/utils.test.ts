import { ADB } from 'appium-adb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getConnectedDevices,
  getConnectedDevicesWithDetails,
} from '../../src/utils';

vi.mock('appium-adb', () => {
  const mockAdb = {
    getConnectedDevices: vi.fn(),
    setDeviceId: vi.fn(),
    shell: vi.fn(),
    getScreenDensity: vi.fn(),
  };
  return {
    ADB: {
      createADB: vi.fn(() => Promise.resolve(mockAdb)),
    },
  };
});

describe('Android Utils', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mockAdbInstance = await ADB.createADB();
    (mockAdbInstance.setDeviceId as vi.Mock).mockImplementation(
      () => undefined,
    );
    (mockAdbInstance.shell as vi.Mock).mockReset();
    (mockAdbInstance.getScreenDensity as vi.Mock).mockReset();
    (mockAdbInstance.getConnectedDevices as vi.Mock).mockReset();
  });

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

  describe('getConnectedDevicesWithDetails', () => {
    it('should enrich devices with model, resolution, and density when available', async () => {
      const mockDevices = [{ udid: 'device-1', state: 'device' }];
      const mockAdbInstance = await ADB.createADB();
      (mockAdbInstance.getConnectedDevices as vi.Mock).mockResolvedValue(
        mockDevices,
      );
      (mockAdbInstance.shell as vi.Mock)
        .mockResolvedValueOnce('Pixel 8\n')
        .mockResolvedValueOnce('google\n')
        .mockResolvedValueOnce('Physical size: 1080x2400\n');
      (mockAdbInstance.getScreenDensity as vi.Mock).mockResolvedValue(420);

      const devices = await getConnectedDevicesWithDetails();

      expect(mockAdbInstance.setDeviceId).toHaveBeenCalledWith('device-1');
      expect(devices).toEqual([
        {
          udid: 'device-1',
          state: 'device',
          model: 'Pixel 8',
          brand: 'google',
          resolution: '1080x2400',
          density: 420,
        },
      ]);
      expect(ADB.createADB).toHaveBeenLastCalledWith({
        adbExecTimeout: 8000,
      });
    });

    it('should silently fall back to the basic device list when detail lookup fails', async () => {
      const mockDevices = [{ udid: 'device-1', state: 'device' }];
      const mockAdbInstance = await ADB.createADB();
      (mockAdbInstance.getConnectedDevices as vi.Mock).mockResolvedValue(
        mockDevices,
      );
      (mockAdbInstance.setDeviceId as vi.Mock).mockImplementation(() => {
        throw new Error('set device failed');
      });

      const devices = await getConnectedDevicesWithDetails();

      expect(devices).toEqual(mockDevices);
    });

    it('should timeout slow detail lookups and still return the basic device entry', async () => {
      vi.useFakeTimers();

      try {
        const mockDevices = [{ udid: 'device-1', state: 'device' }];
        const mockAdbInstance = await ADB.createADB();
        (mockAdbInstance.getConnectedDevices as vi.Mock).mockResolvedValue(
          mockDevices,
        );
        (mockAdbInstance.shell as vi.Mock)
          .mockImplementationOnce(() => new Promise(() => {}))
          .mockResolvedValueOnce('google\n')
          .mockResolvedValueOnce('Physical size: 1080x2400\n');
        (mockAdbInstance.getScreenDensity as vi.Mock).mockResolvedValue(420);

        const devicesPromise = getConnectedDevicesWithDetails();
        await vi.advanceTimersByTimeAsync(2500);
        const devices = await devicesPromise;

        expect(devices).toEqual([
          {
            udid: 'device-1',
            state: 'device',
            brand: 'google',
            resolution: '1080x2400',
            density: 420,
          },
        ]);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
