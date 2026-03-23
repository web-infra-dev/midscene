import path from 'node:path';
import { select } from '@inquirer/prompts';
import {
  createScreenshotPreviewDescriptor,
  definePlaygroundPlatform,
} from '@midscene/playground';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import { findAvailablePort } from '@midscene/shared/node';
import { HarmonyAgent } from './agent';
import { HarmonyDevice } from './device';
import { getConnectedDevices } from './utils';

export interface HarmonyPlatformOptions {
  deviceId?: string;
  staticDir?: string;
}

async function selectDevice(): Promise<string> {
  console.log('🔍 Scanning for HarmonyOS devices...');
  const devices = await getConnectedDevices();

  if (devices.length === 0) {
    console.error('❌ No HarmonyOS devices found!');
    console.log('📱 Please ensure:');
    console.log('  • Your device is connected via USB');
    console.log('  • HDC is properly configured');
    console.log('  • Run `hdc list targets` to verify');
    process.exit(1);
  }

  if (devices.length === 1) {
    console.log(`📱 Found device: ${devices[0].deviceId}`);
    return devices[0].deviceId;
  }

  return select({
    message: '📱 Multiple devices found. Please select one:',
    choices: devices.map((device) => ({
      name: device.deviceId,
      value: device.deviceId,
    })),
  });
}

export const harmonyPlaygroundPlatform = definePlaygroundPlatform<
  HarmonyPlatformOptions | undefined
>({
  id: 'harmony',
  title: 'Midscene HarmonyOS Playground',
  description: 'HarmonyOS playground platform descriptor',
  async prepare(options) {
    const selectedDeviceId = options?.deviceId || (await selectDevice());
    const staticDir =
      options?.staticDir || path.join(__dirname, '../../static');
    const availablePort = await findAvailablePort(PLAYGROUND_SERVER_PORT);

    if (availablePort !== PLAYGROUND_SERVER_PORT) {
      console.log(
        `⚠️  Port ${PLAYGROUND_SERVER_PORT} is busy, using port ${availablePort} instead`,
      );
    }

    return {
      platformId: 'harmony',
      title: 'Midscene HarmonyOS Playground',
      agentFactory: async () => {
        const device = new HarmonyDevice(selectedDeviceId);
        await device.connect();
        return new HarmonyAgent(device);
      },
      launchOptions: {
        port: availablePort,
        openBrowser: false,
        verbose: false,
        staticPath: staticDir,
      },
      preview: createScreenshotPreviewDescriptor({
        title: 'HarmonyOS device preview',
      }),
      metadata: {
        deviceId: selectedDeviceId,
      },
    };
  },
});
