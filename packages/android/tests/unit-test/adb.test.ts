import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adbConstructor: vi.fn(),
  createADB: vi.fn(),
  getEnvConfigValue: vi.fn(),
  getSdkRootFromEnv: vi.fn(),
  warnAdb: vi.fn(),
}));

vi.mock('@midscene/shared/env', () => ({
  MIDSCENE_ADB_PATH: 'MIDSCENE_ADB_PATH',
  MIDSCENE_ADB_REMOTE_HOST: 'MIDSCENE_ADB_REMOTE_HOST',
  MIDSCENE_ADB_REMOTE_PORT: 'MIDSCENE_ADB_REMOTE_PORT',
  globalConfigManager: {
    getEnvConfigValue: mocks.getEnvConfigValue,
  },
}));

vi.mock('@midscene/shared/logger', () => ({
  getDebug: vi.fn(() => mocks.warnAdb),
}));

vi.mock('appium-adb', () => {
  class MockADB {
    static createADB = mocks.createADB;

    constructor(options: unknown) {
      mocks.adbConstructor(options);
    }
  }

  return {
    ADB: MockADB,
    getSdkRootFromEnv: mocks.getSdkRootFromEnv,
  };
});

import { createAndroidAdb } from '../../src/adb';

describe('createAndroidAdb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEnvConfigValue.mockReturnValue(undefined);
    mocks.getSdkRootFromEnv.mockReturnValue('/android/sdk');
  });

  it('uses the explicit executable and remote server for the ADB client', async () => {
    await createAndroidAdb({
      adbExecTimeout: 8000,
      deviceId: 'device-1',
      deviceOptions: {
        androidAdbPath: '/custom/platform-tools/adb',
        remoteAdbHost: '192.168.1.10',
        remoteAdbPort: 5038,
      },
    });

    expect(mocks.adbConstructor).toHaveBeenCalledWith({
      udid: 'device-1',
      adbExecTimeout: 8000,
      executable: {
        path: '/custom/platform-tools/adb',
        defaultArgs: [],
      },
      remoteAdbHost: '192.168.1.10',
      remoteAdbPort: 5038,
    });
    expect(mocks.createADB).not.toHaveBeenCalled();
  });

  it('uses MIDSCENE_ADB settings when device options are absent', async () => {
    mocks.getEnvConfigValue.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        MIDSCENE_ADB_PATH: '/env/platform-tools/adb',
        MIDSCENE_ADB_REMOTE_HOST: 'adb.example.com',
        MIDSCENE_ADB_REMOTE_PORT: '5040',
      };
      return values[key];
    });

    await createAndroidAdb({ adbExecTimeout: 60000 });

    expect(mocks.adbConstructor).toHaveBeenCalledWith({
      udid: undefined,
      adbExecTimeout: 60000,
      executable: {
        path: '/env/platform-tools/adb',
        defaultArgs: [],
      },
      remoteAdbHost: 'adb.example.com',
      remoteAdbPort: 5040,
    });
    expect(mocks.createADB).not.toHaveBeenCalled();
  });

  it('uses Appium SDK resolution when no custom executable is configured', async () => {
    const sdkAdb = { source: 'android-sdk' };
    mocks.createADB.mockResolvedValue(sdkAdb);

    await expect(
      createAndroidAdb({
        adbExecTimeout: 60000,
        deviceId: 'device-2',
      }),
    ).resolves.toBe(sdkAdb);

    expect(mocks.createADB).toHaveBeenCalledWith({
      udid: 'device-2',
      adbExecTimeout: 60000,
      remoteAdbHost: undefined,
      remoteAdbPort: undefined,
    });
    expect(mocks.adbConstructor).not.toHaveBeenCalled();
  });

  it('falls back to PATH when the configured Android SDK cannot resolve adb', async () => {
    mocks.getSdkRootFromEnv.mockReturnValue('/stale/android/sdk');
    mocks.createADB.mockRejectedValue(
      new Error('The Android SDK root folder does not exist'),
    );

    await createAndroidAdb({
      adbExecTimeout: 60000,
      deviceId: 'device-3',
    });

    expect(mocks.createADB).toHaveBeenCalledWith({
      udid: 'device-3',
      adbExecTimeout: 60000,
      remoteAdbHost: undefined,
      remoteAdbPort: undefined,
    });
    expect(mocks.adbConstructor).toHaveBeenCalledWith({
      udid: 'device-3',
      adbExecTimeout: 60000,
      remoteAdbHost: undefined,
      remoteAdbPort: undefined,
    });
    expect(mocks.warnAdb).toHaveBeenCalledWith(
      'Unable to initialize adb from Android SDK at "/stale/android/sdk", falling back to adb from PATH: The Android SDK root folder does not exist',
    );
  });

  it('preserves the PATH fallback when no Android SDK root is configured', async () => {
    mocks.getSdkRootFromEnv.mockReturnValue(undefined);

    await createAndroidAdb({
      adbExecTimeout: 60000,
      deviceId: 'device-3',
    });

    expect(mocks.adbConstructor).toHaveBeenCalledWith({
      udid: 'device-3',
      adbExecTimeout: 60000,
      remoteAdbHost: undefined,
      remoteAdbPort: undefined,
    });
    expect(mocks.createADB).not.toHaveBeenCalled();
  });
});
