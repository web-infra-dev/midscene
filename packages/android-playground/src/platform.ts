import path from 'node:path';
import { select } from '@inquirer/prompts';
import {
  AndroidAgent,
  AndroidDevice,
  getConnectedDevices,
} from '@midscene/android';
import {
  createScrcpyPreviewDescriptor,
  definePlaygroundPlatform,
} from '@midscene/playground';
import {
  PLAYGROUND_SERVER_PORT,
  SCRCPY_SERVER_PORT,
} from '@midscene/shared/constants';
import { findAvailablePort } from '@midscene/shared/node';

export interface AndroidPlatformOptions {
  deviceId?: string;
  staticDir?: string;
}

// Function to get available devices
async function getAdbDevices() {
  try {
    const devices = await getConnectedDevices();
    return devices
      .filter((device) => device.state === 'device')
      .map((device) => ({
        id: device.udid,
        status: device.state,
        name: device.udid,
      }));
  } catch (error) {
    console.error('Error getting ADB devices:', error);
    return [];
  }
}

async function selectDevice() {
  console.log('🔍 Scanning for Android devices...');

  const devices = await getAdbDevices();

  if (devices.length === 0) {
    console.error('❌ No Android devices found!');
    console.log('📱 Please ensure:');
    console.log('  • Your device is connected via USB');
    console.log('  • USB debugging is enabled');
    console.log('  • Device is authorized for debugging');
    process.exit(1);
  }

  if (devices.length === 1) {
    console.log(`📱 Found device: ${devices[0].name} (${devices[0].id})`);
    return devices[0].id;
  }

  const selectedDevice = await select({
    message: '📱 Multiple devices found. Please select one:',
    choices: devices.map((device) => ({
      name: `${device.name} (${device.id})`,
      value: device.id,
    })),
  });

  return selectedDevice;
}

export const androidPlaygroundPlatform = definePlaygroundPlatform<
  AndroidPlatformOptions | undefined
>({
  id: 'android',
  title: 'Midscene Android Playground',
  description: 'Android playground platform descriptor',
  async prepare(options) {
    const selectedDeviceId = options?.deviceId || (await selectDevice());
    const staticDir =
      options?.staticDir || path.join(__dirname, '../../static');
    const [playgroundPort, scrcpyPort] = await Promise.all([
      findAvailablePort(PLAYGROUND_SERVER_PORT),
      findAvailablePort(SCRCPY_SERVER_PORT),
    ]);

    if (playgroundPort !== PLAYGROUND_SERVER_PORT) {
      console.log(
        `⚠️  Port ${PLAYGROUND_SERVER_PORT} is busy, using port ${playgroundPort} instead`,
      );
    }
    if (scrcpyPort !== SCRCPY_SERVER_PORT) {
      console.log(
        `⚠️  Port ${SCRCPY_SERVER_PORT} is busy, using port ${scrcpyPort} instead`,
      );
    }

    return {
      platformId: 'android',
      title: 'Midscene Android Playground',
      agentFactory: async () => {
        const device = new AndroidDevice(selectedDeviceId);
        await device.connect();
        return new AndroidAgent(device);
      },
      launchOptions: {
        port: playgroundPort,
        openBrowser: false,
        verbose: false,
        staticPath: staticDir,
        configureServer(server) {
          server.scrcpyPort = scrcpyPort;
        },
      },
      preview: createScrcpyPreviewDescriptor({
        scrcpyPort,
      }),
      metadata: {
        deviceId: selectedDeviceId,
        scrcpyPort,
      },
    };
  },
});
