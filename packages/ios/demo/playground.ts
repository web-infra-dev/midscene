import { playgroundForAgent } from '@midscene/playground';
import dotenv from 'dotenv';
import {
  agentFromIOSDevice,
  checkIOSEnvironment,
  getConnectedDevices,
} from '../src';

dotenv.config({
  path: '../../.env',
});

async function main() {
  await Promise.resolve(
    (async () => {
      // Check if iOS environment is available
      const envCheck = await checkIOSEnvironment();
      if (!envCheck.available) {
        throw new Error(`iOS environment check failed: ${envCheck.error}`);
      }

      // Get connected devices
      const devices = await getConnectedDevices();
      if (devices.length === 0) {
        throw new Error('No iOS devices available');
      }

      console.log(`Found ${devices.length} iOS device(s):`);
      devices.forEach((device, index) => {
        console.log(`  ${index + 1}. ${device.name} (${device.udid})`);
      });

      // Use the first available device
      const targetDevice = devices[0];
      console.log(`Using device: ${targetDevice.name} (${targetDevice.udid})`);

      // Create iOS agent
      const agent = await agentFromIOSDevice(targetDevice.udid, {
        wdaPort: 8100,
        wdaHost: 'localhost', // Assumes iproxy is running for real devices
        aiActionContext:
          'If any location, permission, user agreement, cookies popup, click agree or allow. If login page pops up, close it.',
      });

      // 👀 launch playground for the agent
      const server = await playgroundForAgent(agent).launch({
        port: 5808,
        openBrowser: true,
        verbose: true,
      });

      // Log the generated server ID for debugging
      console.log(`🔑 Generated Server ID: ${server.server.id}`);
      console.log('🚀 iOS Playground running at http://localhost:5808');
      console.log(`📱 Connected to: ${targetDevice.name}`);

      // Keep the server running
      console.log('Press Ctrl+C to stop the playground...');

      // Wait indefinitely until user stops the process
      await new Promise(() => {});
    })(),
  );
}

main().catch((err) => {
  console.error('❌ iOS Playground failed to start:');
  console.error(err);
  console.error('\n💡 Make sure:');
  console.error('1. WebDriverAgent is running on your iOS device');
  console.error('2. Port forwarding is set up (iproxy -u <UDID> 8100:8100)');
  console.error('3. Device is unlocked and trusted');
  process.exit(1);
});
