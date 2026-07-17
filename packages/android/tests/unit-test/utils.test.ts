import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getConnectedDevices,
  getConnectedDevicesWithDetails,
} from '../../src/utils';

const mocks = vi.hoisted(() => ({
  adb: {
    executable: {
      path: '/mock/platform-tools/adb',
      defaultArgs: [],
    },
    getConnectedDevices: vi.fn(),
    setDeviceId: vi.fn(),
    shell: vi.fn(),
    getScreenDensity: vi.fn(),
  },
  createAndroidAdb: vi.fn(),
}));

vi.mock('../../src/adb', () => ({
  createAndroidAdb: mocks.createAndroidAdb,
}));

describe('Android Utils', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mockAdbInstance = mocks.adb;
    mocks.createAndroidAdb.mockResolvedValue(mockAdbInstance);
    (mockAdbInstance.setDeviceId as Mock).mockImplementation(() => undefined);
    (mockAdbInstance.shell as Mock).mockReset();
    (mockAdbInstance.getScreenDensity as Mock).mockReset();
    (mockAdbInstance.getConnectedDevices as Mock).mockReset();
  });

  describe('getConnectedDevices', () => {
    it('should return a list of connected devices', async () => {
      const mockDevices = [{ udid: 'device-1' }, { udid: 'device-2' }];
      const mockAdbInstance = mocks.adb;
      (mockAdbInstance.getConnectedDevices as Mock).mockResolvedValue(
        mockDevices,
      );

      const devices = await getConnectedDevices();

      expect(mocks.createAndroidAdb).toHaveBeenCalledWith({
        adbExecTimeout: 60000,
        deviceOptions: undefined,
      });
      expect(mockAdbInstance.getConnectedDevices).toHaveBeenCalled();
      expect(devices).toEqual(mockDevices);
    });

    it('should use the provided ADB options for device discovery', async () => {
      const deviceOptions = {
        androidAdbPath: '/custom/platform-tools/adb',
        remoteAdbHost: 'localhost',
        remoteAdbPort: 5038,
      };
      mocks.adb.getConnectedDevices.mockResolvedValue([]);

      await getConnectedDevices(deviceOptions);

      expect(mocks.createAndroidAdb).toHaveBeenCalledWith({
        adbExecTimeout: 60000,
        deviceOptions,
      });
    });

    it('should throw a formatted error if getting devices fails', async () => {
      const error = new Error('Failed to connect to ADB');
      const mockAdbInstance = mocks.adb;
      (mockAdbInstance.getConnectedDevices as Mock).mockRejectedValue(error);

      await expect(getConnectedDevices()).rejects.toThrow(
        `Unable to get connected Android device list (ADB executable: /mock/platform-tools/adb), please check https://midscenejs.com/integrate-with-android.html#faq : ${error.message}`,
      );
    });
  });

  describe('getConnectedDevicesWithDetails', () => {
    it('should enrich devices with model, resolution, and density when available', async () => {
      const mockDevices = [{ udid: 'device-1', state: 'device' }];
      const mockAdbInstance = mocks.adb;
      (mockAdbInstance.getConnectedDevices as Mock).mockResolvedValue(
        mockDevices,
      );
      (mockAdbInstance.shell as Mock)
        .mockResolvedValueOnce('Pixel 8\n')
        .mockResolvedValueOnce('google\n')
        .mockResolvedValueOnce('Physical size: 1080x2400\n');
      (mockAdbInstance.getScreenDensity as Mock).mockResolvedValue(420);

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
      expect(mocks.createAndroidAdb).toHaveBeenLastCalledWith({
        adbExecTimeout: 8000,
        deviceOptions: undefined,
      });
    });

    it('should use the same ADB options for discovery and detail lookup', async () => {
      const deviceOptions = {
        androidAdbPath: '/custom/platform-tools/adb',
        remoteAdbHost: 'localhost',
        remoteAdbPort: 5038,
      };
      mocks.adb.getConnectedDevices.mockResolvedValue([
        { udid: 'device-1', state: 'device' },
      ]);
      mocks.adb.shell.mockResolvedValue('');
      mocks.adb.getScreenDensity.mockResolvedValue(undefined);

      await getConnectedDevicesWithDetails(deviceOptions);

      expect(mocks.createAndroidAdb).toHaveBeenNthCalledWith(1, {
        adbExecTimeout: 60000,
        deviceOptions,
      });
      expect(mocks.createAndroidAdb).toHaveBeenNthCalledWith(2, {
        adbExecTimeout: 8000,
        deviceOptions,
      });
    });

    it('should silently fall back to the basic device list when detail lookup fails', async () => {
      const mockDevices = [{ udid: 'device-1', state: 'device' }];
      const mockAdbInstance = mocks.adb;
      (mockAdbInstance.getConnectedDevices as Mock).mockResolvedValue(
        mockDevices,
      );
      (mockAdbInstance.setDeviceId as Mock).mockImplementation(() => {
        throw new Error('set device failed');
      });

      const devices = await getConnectedDevicesWithDetails();

      expect(devices).toEqual(mockDevices);
    });

    it('should timeout slow detail lookups and still return the basic device entry', async () => {
      vi.useFakeTimers();

      try {
        const mockDevices = [{ udid: 'device-1', state: 'device' }];
        const mockAdbInstance = mocks.adb;
        (mockAdbInstance.getConnectedDevices as Mock).mockResolvedValue(
          mockDevices,
        );
        (mockAdbInstance.shell as Mock)
          .mockImplementationOnce(() => new Promise(() => {}))
          .mockResolvedValueOnce('google\n')
          .mockResolvedValueOnce('Physical size: 1080x2400\n');
        (mockAdbInstance.getScreenDensity as Mock).mockResolvedValue(420);

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
