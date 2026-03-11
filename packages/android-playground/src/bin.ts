import { exec } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { select } from '@inquirer/prompts';
import {
  AndroidAgent,
  AndroidDevice,
  getConnectedDevices,
} from '@midscene/android';
import { playgroundForAgentFactory } from '@midscene/playground';
import {
  PLAYGROUND_SERVER_PORT,
  SCRCPY_SERVER_PORT,
} from '@midscene/shared/constants';
import { findAvailablePort } from '@midscene/shared/node';
import ScrcpyServer from './scrcpy-server';

const promiseExec = promisify(exec);

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

// Function to prompt user for device selection
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

  // Multiple devices found, prompt user to choose
  const choices = devices.map((device) => ({
    name: `${device.name} (${device.id})`,
    value: device.id,
  }));

  const selectedDevice = await select({
    message: '📱 Multiple devices found. Please select one:',
    choices,
  });

  return selectedDevice;
}

const staticDir = path.join(__dirname, '../../static');

const main = async () => {
  const { default: open } = await import('open');

  try {
    // First, let user select device
    const selectedDeviceId = await selectDevice();
    console.log(`✅ Selected device: ${selectedDeviceId}`);

    const scrcpyServer = new ScrcpyServer();

    // Set the selected device in scrcpy server
    scrcpyServer.currentDeviceId = selectedDeviceId;

    console.log('🚀 Starting servers...');

    // Find available ports
    const availablePlaygroundPort = await findAvailablePort(
      PLAYGROUND_SERVER_PORT,
    );
    const availableScrcpyPort = await findAvailablePort(SCRCPY_SERVER_PORT);

    if (availablePlaygroundPort !== PLAYGROUND_SERVER_PORT) {
      console.log(
        `⚠️  Port ${PLAYGROUND_SERVER_PORT} is busy, using port ${availablePlaygroundPort} instead`,
      );
    }
    if (availableScrcpyPort !== SCRCPY_SERVER_PORT) {
      console.log(
        `⚠️  Port ${SCRCPY_SERVER_PORT} is busy, using port ${availableScrcpyPort} instead`,
      );
    }

    const [playgroundResult] = await Promise.all([
      playgroundForAgentFactory(async () => {
        const device = new AndroidDevice(selectedDeviceId);
        await device.connect();
        return new AndroidAgent(device);
      }).launch({
        port: availablePlaygroundPort,
        openBrowser: false,
        verbose: false,
        staticPath: staticDir,
        enableCors: true,
        corsOptions: {
          origin: true,
          credentials: true,
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        },
      }),
      scrcpyServer.launch(availableScrcpyPort),
    ]);

    const playgroundServer = playgroundResult.server;

    // Store scrcpy server port in global for playground server to access
    (global as any).scrcpyServerPort = availableScrcpyPort;

    console.log('');
    console.log('✨ Midscene Android Playground is ready!');
    console.log(`🎮 Playground: http://localhost:${playgroundServer.port}`);
    console.log(`📱 Device: ${selectedDeviceId}`);
    console.log(`🔑 Generated Server ID: ${playgroundServer.id}`);
    console.log('');

    open(`http://localhost:${playgroundServer.port}`);
  } catch (error) {
    console.error('Failed to start servers:', error);
    process.exit(1);
  }
};

main();
