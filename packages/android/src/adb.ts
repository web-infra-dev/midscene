import type { AndroidDeviceOpt } from '@midscene/core/device';
import {
  MIDSCENE_ADB_PATH,
  MIDSCENE_ADB_REMOTE_HOST,
  MIDSCENE_ADB_REMOTE_PORT,
  globalConfigManager,
} from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { ADB, type ADBOptions, getSdkRootFromEnv } from 'appium-adb';

const warnAdb = getDebug('android:adb', { console: true });

export interface CreateAndroidAdbOptions {
  adbExecTimeout: number;
  deviceId?: string;
  deviceOptions?: AndroidDeviceOpt;
}

export async function createAndroidAdb({
  adbExecTimeout,
  deviceId,
  deviceOptions,
}: CreateAndroidAdbOptions): Promise<ADB> {
  const androidAdbPath =
    deviceOptions?.androidAdbPath ||
    globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH);
  const remoteAdbHost =
    deviceOptions?.remoteAdbHost ||
    globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_REMOTE_HOST);
  const remoteAdbPort =
    deviceOptions?.remoteAdbPort ||
    globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_REMOTE_PORT);

  const adbOptions: ADBOptions = {
    udid: deviceId,
    adbExecTimeout,
    remoteAdbHost: remoteAdbHost || undefined,
    remoteAdbPort: remoteAdbPort ? Number(remoteAdbPort) : undefined,
  };

  if (androidAdbPath) {
    return new ADB({
      ...adbOptions,
      executable: { path: androidAdbPath, defaultArgs: [] },
    });
  }

  const sdkRoot = getSdkRootFromEnv();
  if (sdkRoot) {
    try {
      return await ADB.createADB(adbOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnAdb(
        `Unable to initialize adb from Android SDK at "${sdkRoot}", falling back to adb from PATH: ${message}`,
      );
    }
  }

  return new ADB(adbOptions);
}
