import path from 'node:path';
import { select } from '@inquirer/prompts';
import { PlaygroundServer } from '@midscene/playground';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import { findAvailablePort } from '@midscene/shared/node';
import { HarmonyAgent } from './agent';
import { HarmonyDevice } from './device';
import { getConnectedDevices } from './utils';

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

  const choices = devices.map((d) => ({
    name: d.deviceId,
    value: d.deviceId,
  }));

  return select({
    message: '📱 Multiple devices found. Please select one:',
    choices,
  });
}

const staticDir = path.join(__dirname, '../../static');

const main = async () => {
  const { default: open } = await import('open');

  try {
    const selectedDeviceId = await selectDevice();
    console.log(`✅ Selected device: ${selectedDeviceId}`);

    const playgroundServer = new PlaygroundServer(async () => {
      const device = new HarmonyDevice(selectedDeviceId);
      await device.connect();
      return new HarmonyAgent(device);
    }, staticDir);

    console.log('🚀 Starting server...');

    const availablePort = await findAvailablePort(PLAYGROUND_SERVER_PORT);

    if (availablePort !== PLAYGROUND_SERVER_PORT) {
      console.log(
        `⚠️  Port ${PLAYGROUND_SERVER_PORT} is busy, using port ${availablePort} instead`,
      );
    }

    await playgroundServer.launch(availablePort);

    console.log('');
    console.log('✨ Midscene HarmonyOS Playground is ready!');
    console.log(`🎮 Playground: http://localhost:${playgroundServer.port}`);
    console.log(`📱 Device: ${selectedDeviceId}`);
    console.log(`🔑 Generated Server ID: ${playgroundServer.id}`);
    console.log('');

    open(`http://localhost:${playgroundServer.port}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

main();
