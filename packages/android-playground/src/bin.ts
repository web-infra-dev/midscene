import { exec } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { select } from '@inquirer/prompts';
import { AndroidAgent, AndroidDevice } from '@midscene/android';
import { PlaygroundServer } from '@midscene/playground';
import {
  PLAYGROUND_SERVER_PORT,
  SCRCPY_SERVER_PORT,
} from '@midscene/shared/constants';
import ScrcpyServer from './scrcpy-server';

const promiseExec = promisify(exec);

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.on('error', () => resolve(false));
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  let attempts = 0;
  const maxAttempts = 15;

  while (!(await isPortAvailable(port))) {
    attempts++;
    if (attempts >= maxAttempts) {
      console.error(
        `❌ Unable to find available port after ${maxAttempts} attempts starting from ${startPort}`,
      );
      process.exit(1);
    }
    port++;
  }
  return port;
}

// Function to get available devices
async function getAdbDevices() {
  try {
    // Start ADB server
    await promiseExec('adb start-server');

    // Get device list
    const { stdout } = await promiseExec('adb devices');
    const lines = stdout.trim().split('\n').slice(1); // Skip header

    const devices = lines
      .map((line) => {
        const parts = line.trim().split('\t');
        if (parts.length >= 2) {
          return {
            id: parts[0],
            status: parts[1],
            name: parts[0], // We'll use ID as name for now
          };
        }
        return null;
      })
      .filter(
        (device): device is { id: string; status: string; name: string } =>
          device !== null && device.status === 'device',
      ); // Only online devices

    return devices;
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

    // Create device and agent instances with selected device
    const device = new AndroidDevice(selectedDeviceId);
    const agent = new AndroidAgent(device);

    const playgroundServer = new PlaygroundServer(device, agent, staticDir);
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

    await Promise.all([
      playgroundServer.launch(availablePlaygroundPort),
      scrcpyServer.launch(availableScrcpyPort),
    ]);

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
