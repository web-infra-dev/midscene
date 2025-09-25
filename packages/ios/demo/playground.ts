import { playgroundForAgent } from '@midscene/playground';
import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import dotenv from 'dotenv';
import { agentFromWebDriverAgent } from '../src';

dotenv.config({
  path: '../../.env',
});

async function main() {
  await Promise.resolve(
    (async () => {
      console.log(
        `🔌 Connecting to WebDriverAgent at localhost:${DEFAULT_WDA_PORT}...`,
      );

      // Create iOS agent (will auto-detect connected device)
      const agent = await agentFromWebDriverAgent({
        wdaPort: DEFAULT_WDA_PORT,
        wdaHost: 'localhost', // Assumes iproxy is running for real devices
        aiActionContext:
          'If any location, permission, user agreement, cookies popup, click agree or allow. If login page pops up, close it.',
      });

      console.log('✅ Connected to iOS device via WebDriverAgent');

      // 👀 launch playground for the agent
      const server = await playgroundForAgent(agent).launch({
        port: 5808,
        openBrowser: true,
        verbose: true,
      });

      // Log the generated server ID for debugging
      console.log(`🔑 Generated Server ID: ${server.server.id}`);
      console.log('🚀 iOS Playground running at http://localhost:5808');
      console.log('📱 Connected to iOS device via WebDriverAgent');

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
  console.error(
    `2. Port forwarding is set up (iproxy -u <UDID> ${DEFAULT_WDA_PORT}:${DEFAULT_WDA_PORT})`,
  );
  console.error('3. Device is unlocked and trusted');
  process.exit(1);
});
