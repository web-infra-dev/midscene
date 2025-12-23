import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BenchDevice } from './base';
import { PIXEL6_AVD_NAME } from '../../../const';

const execAsync = promisify(exec);

/**
 * Pixel 6 Device Implementation
 */
export class Pixel6Device extends BenchDevice {
  private deviceId: string | undefined;
  constructor() {
    super();
  }

  async setup(): Promise<boolean> {
    const avdName = PIXEL6_AVD_NAME;

    try {
      await this.envCheck();
      this.logger.debug(
        `Setting up Pixel 6 device. Looking for existing instance of ${avdName}...`,
      );
      const { stdout: devicesOut } = await execAsync('adb devices');
      const lines = devicesOut.split('\n');
      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length > 0 && parts[0].startsWith('emulator-')) {
          const id = parts[0];
          try {
            const { stdout: nameOut } = await execAsync(
              `adb -s ${id} emu avd name`,
              { timeout: 5000 },
            );
            if (nameOut.includes(avdName)) {
              this.deviceId = id;
              this.logger.info(
                `Found existing ${avdName} at ${this.deviceId}.`,
              );
              await this.waitForBoot();
              return true;
            }
          } catch (ignored) {
            // Ignore errors
          }
        }
      }
    } catch (e) {
      this.logger.error('Failed to list adb devices', e);
      return false;
    }

    this.logger.info(
      `No existing ${avdName} found. Preparing to start new one...`,
    );

    try {
      const { stdout: avdList } = await execAsync('emulator -list-avds');
      if (!avdList.includes(avdName)) {
        this.logger.info(`AVD ${avdName} not found. Creating...`);
        // Attempt to create AVD using a standard image
        await this.spawnAsync(
          `avdmanager create avd -n ${avdName} -k "system-images;android-33;google_apis;arm64-v8a" --device "pixel_6" --force --sdk_root ${this.getAndroidSdkRoot()}`,
        );

        this.logger.info(`AVD ${avdName} created.`);
      }
    } catch (e) {
      this.logger.error(
        `Failed to manage AVD ${avdName}. Ensure 'avdmanager' and 'emulator' are in PATH.`,
        e,
      );
      throw e;
    }

    let port = 5554;
    try {
      const { stdout: devicesOut } = await execAsync('adb devices');
      while (devicesOut.includes(`emulator-${port}`)) {
        port += 2;
        if (port > 5600) throw new Error('No free emulator ports found.');
      }
    } catch (e) {
      this.logger.warn('Error checking ports, defaulting to 5554', e);
    }

    this.deviceId = `emulator-${port}`;
    this.logger.info(
      `Starting emulator ${avdName} on port ${port} (ID: ${this.deviceId})...`,
    );

    const subprocess = spawn(
      'emulator',
      ['-avd', avdName, '-port', port.toString()],
      {
        detached: true,
        stdio: 'ignore',
      },
    );
    subprocess.unref();

    await this.waitForBoot();
    this.logger.info(`Pixel 6 device ${this.deviceId} is ready.`);
    return true;
  }

  getDeviceId(): string {
    if (!this.deviceId) {
      throw new Error('Device not initialized. Call setup function first.');
    }
    return this.deviceId;
  }

  async terminate(): Promise<boolean> {
    this.logger.debug(`Terminating Pixel 6 device: ${this.deviceId}`);
    try {
      await execAsync(`adb -s ${this.deviceId} emu kill`);
      return true;
    } catch (e) {
      this.logger.warn(`Failed to kill emulator ${this.deviceId}`, e);
      return false;
    }
  }

  private async waitForBoot() {
    this.logger.info('Waiting for device to be online...');
    await execAsync(`adb -s ${this.deviceId} wait-for-device`);

    this.logger.info('Waiting for boot completion...');
    const maxRetries = 60;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const { stdout } = await execAsync(
          `adb -s ${this.deviceId} shell getprop sys.boot_completed`,
        );
        if (stdout.trim() === '1') {
          return;
        }
      } catch (e) {
        // ignore errors during boot
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(`Device ${this.deviceId} failed to boot.`);
  }

  private async envCheck() {
    this.logger.info('Checking environment...');
    try {
      await this.spawnAsync('adb version');
      this.logger.info('✅ adb');
      await this.spawnAsync('emulator -version');
      this.logger.info('✅ emulator');
      await this.spawnAsync('avdmanager -version');
      this.logger.info('✅ avdmanager');
      await this.spawnAsync('sdkmanager --help');
      this.logger.info('✅ sdkmanager');
      this.logger.info('Environment check passed.');
    } catch (e) {
      this.logger.error(
        'Environment check failed. Ensure Android SDK tools are in PATH.',
        e,
      );
      throw e;
    }
  }

  private spawnAsync(cmd: string, args: string[] = []) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: 'ignore', shell: true });
      child.on('exit', (code) => resolve(code));
      child.on('error', (err) => reject(err));
    });
  }

  private getAndroidSdkRoot(): string {
    if (
      process.env.ANDROID_SDK_ROOT &&
      fs.existsSync(process.env.ANDROID_SDK_ROOT)
    ) {
      return process.env.ANDROID_SDK_ROOT;
    }

    const home = os.homedir();
    const platform = os.platform();
    let defaultPaths: string[] = [];

    if (platform === 'darwin') {
      defaultPaths = [path.join(home, 'Library/Android/sdk')];
    } else if (platform === 'win32') {
      defaultPaths = [path.join(home, 'AppData', 'Local', 'Android', 'Sdk')];
    } else if (platform === 'linux') {
      defaultPaths = [
        path.join(home, 'Android/Sdk'),
        '/usr/local/share/android-sdk',
        '/opt/android-sdk',
      ];
    }

    for (const p of defaultPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    throw new Error(
      'Android SDK root not found. Please set ANDROID_SDK_ROOT environment variable',
    );
  }
}
