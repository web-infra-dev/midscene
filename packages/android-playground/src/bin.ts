import { exec } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { AndroidAgent, AndroidDevice } from '@midscene/android';
import { PlaygroundServer } from '@midscene/playground';
import {
  PLAYGROUND_SERVER_PORT,
  SCRCPY_SERVER_PORT,
} from '@midscene/shared/constants';
import inquirer from 'inquirer';
import ScrcpyServer from './scrcpy-server';

const promiseExec = promisify(exec);

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

  const { selectedDevice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedDevice',
      message: '📱 Multiple devices found. Please select one:',
      choices,
    },
  ]);

  return selectedDevice;
}

const staticDir = path.join(__dirname, '../../static');

const main = async () => {
  const { default: open } = await import('open');

  try {
    // First, let user select device
    const selectedDeviceId = await selectDevice();
    console.log(`\u2705 Selected device: ${selectedDeviceId}`);

    // Create device and agent instances with selected device
    const device = new AndroidDevice(selectedDeviceId);
    const agent = new AndroidAgent(device);

    const playgroundServer = new PlaygroundServer(device, agent, staticDir);
    const scrcpyServer = new ScrcpyServer();

    // Set the selected device in scrcpy server
    scrcpyServer.currentDeviceId = selectedDeviceId;

    console.log('\ud83d\ude80 Starting servers...');

    await Promise.all([
      playgroundServer.launch(PLAYGROUND_SERVER_PORT),
      scrcpyServer.launch(SCRCPY_SERVER_PORT),
    ]);

    console.log('');
    console.log('\u2728 Midscene Android Playground is ready!');
    console.log(
      `\ud83c\udfae Playground: http://localhost:${playgroundServer.port}`,
    );
    console.log(`\ud83d\udcf1 Device: ${selectedDeviceId}`);
    console.log('');

    open(`http://localhost:${playgroundServer.port}`);
  } catch (error) {
    console.error('Failed to start servers:', error);
    process.exit(1);
  }
};

main();
