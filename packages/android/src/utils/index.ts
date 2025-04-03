import { ADB, type Device } from 'appium-adb';
import { debugPage } from '../page';
export async function getConnectedDevices(): Promise<Device[]> {
  try {
    const adb = await ADB.createADB({
      adbExecTimeout: 60000,
    });
    const devices = await adb.getConnectedDevices();

    debugPage(`Found ${devices.length} connected devices: `, devices);

    return devices;
  } catch (error) {
    console.error('Failed to get device list:', error);
    throw new Error('Unable to get connected Android device list');
  }
}
