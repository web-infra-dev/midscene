import { getDebug } from '@midscene/shared/logger';
import { HdcClient } from './hdc';

const debugUtils = getDebug('harmony:utils');

export interface HarmonyDeviceInfo {
  deviceId: string;
}

export async function getConnectedDevices(
  hdcPath?: string,
): Promise<HarmonyDeviceInfo[]> {
  try {
    const hdc = new HdcClient({ hdcPath });
    const targets = await hdc.listTargets();

    const devices = targets.map((deviceId) => ({ deviceId }));
    debugUtils(`Found ${devices.length} connected devices: `, devices);

    return devices;
  } catch (error: any) {
    console.error('Failed to get device list:', error);
    throw new Error(
      `Unable to get connected HarmonyOS device list, please ensure HDC is properly configured: ${error.message}`,
      { cause: error },
    );
  }
}
