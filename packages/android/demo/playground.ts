import { playgroundForAgent } from '@midscene/playground';
import dotenv from 'dotenv';
import { agentFromAdbDevice, getConnectedDevices } from '../src';

dotenv.config({
  path: '../../.env',
});

async function main() {
  await Promise.resolve(
    (async () => {
      // Get connected Android devices
      const devices = await getConnectedDevices();
      if (devices.length === 0) {
        throw new Error(
          'No Android devices available. Make sure ADB is installed and devices are connected.',
        );
      }

      console.log(`Found ${devices.length} Android device(s):`);
      devices.forEach((device, index) => {
        console.log(
          `  ${index + 1}. ${device.udid} - ${device.state || 'unknown'}`,
        );
      });

      // Use the first available device
      const targetDevice = devices[0];
      console.log(`Using device: ${targetDevice.udid}`);

      // Create Android agent
      const agent = await agentFromAdbDevice(targetDevice.udid, {
        aiActionContext:
          'If any location, permission, user agreement, cookies popup, click agree or allow. If login page pops up, close it.',
      });

      // 👀 launch playground for the agent
      const server = await playgroundForAgent(agent).launch({
        port: 5809,
        openBrowser: true,
        verbose: true,
      });

      // Log the generated server ID for debugging
      console.log(`🔑 Generated Server ID: ${server.server.id}`);
      console.log('🚀 Android Playground running at http://localhost:5809');
      console.log(`📱 Connected to: ${targetDevice.udid}`);

      // Keep the server running
      console.log('Press Ctrl+C to stop the playground...');

      // Wait indefinitely until user stops the process
      await new Promise(() => {});
    })(),
  );
}

main().catch((err) => {
  console.error('❌ Android Playground failed to start:');
  console.error(err);
  console.error('\n💡 Make sure:');
  console.error('1. Android device is connected via USB or WiFi');
  console.error('2. USB debugging is enabled on the device');
  console.error('3. ADB is installed and working (try: adb devices)');
  console.error('4. Device is unlocked');
  process.exit(1);
});
