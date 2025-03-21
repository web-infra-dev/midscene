import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { AndroidPage } from '../../../../src/android';

const execPromise = promisify(exec);

interface LaunchOptions {
  deviceId?: string;
}

/**
 * Get all connected Android device IDs
 * @returns List of device IDs
 * @throws Error when unable to retrieve device list
 */
export async function getConnectedDevices(): Promise<string[]> {
  try {
    const { stdout } = await execPromise('adb devices');
    const devices = stdout
      .split('\n')
      .slice(1) // Skip the first line "List of devices attached"
      .map((line) => {
        const [id, status] = line.split('\t');
        return { id, status };
      })
      .filter(({ id, status }) => id && status && status.trim() === 'device')
      .map(({ id }) => id);

    return devices;
  } catch (error) {
    console.error('Failed to get device list:', error);
    throw new Error('Unable to get connected Android device list');
  }
}

/**
 * Verify if the device is accessible
 * @param deviceId Device ID
 * @returns true if the device is accessible, false otherwise
 */
export async function isDeviceAccessible(deviceId: string): Promise<boolean> {
  try {
    await execPromise(`adb -s ${deviceId} shell echo "Device is ready"`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Launch Android page
 * @param opt Launch options
 * @returns AndroidPage instance
 * @throws Error when no available device is found
 */
export async function launchPage(opt: LaunchOptions): Promise<AndroidPage> {
  // If device ID is provided, use it directly
  let deviceId = opt.deviceId;

  if (!deviceId) {
    // Get all connected devices
    const devices = await getConnectedDevices();

    if (devices.length === 0) {
      throw new Error('No available Android devices found');
    }

    if (devices.length > 1) {
      console.warn(
        `Multiple devices detected: ${devices.join(', ')}. Using the first device: ${devices[0]}`,
      );
    }

    // Use the first available device
    deviceId = devices[0];
  }

  // Verify if the device is accessible
  const isAccessible = await isDeviceAccessible(deviceId);
  if (!isAccessible) {
    throw new Error(
      `Device ${deviceId} is not accessible, please check the connection status`,
    );
  }

  return new AndroidPage(deviceId);
}
