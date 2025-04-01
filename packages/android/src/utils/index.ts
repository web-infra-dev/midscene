import type { WebPage } from '@midscene/web/.';
import { ADB, type Device } from 'appium-adb';
import { AndroidAgent } from '../agent';
import { AndroidDevice } from '../page';

export async function agentFromDeviceId(deviceId: string) {
  const page = new AndroidDevice(deviceId);

  await page.connect();

  return new AndroidAgent(page as unknown as WebPage);
}

export async function getConnectedDevices(): Promise<Device[]> {
  try {
    const adb = await ADB.createADB({
      adbExecTimeout: 60000,
    });
    const devices = adb.getConnectedDevices();

    return devices;
  } catch (error) {
    console.error('Failed to get device list:', error);
    throw new Error('Unable to get connected Android device list');
  }
}
