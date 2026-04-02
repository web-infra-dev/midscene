import path from 'node:path';
import { launchPreparedPlaygroundPlatform } from '@midscene/playground';
import { harmonyPlaygroundPlatform } from './platform';

const staticDir = path.join(__dirname, '../../static');

const main = async () => {
  const { default: open } = await import('open');

  try {
    const prepared = await harmonyPlaygroundPlatform.prepare({
      staticDir,
    });
    const selectedDeviceId = prepared.metadata?.deviceId;
    if (typeof selectedDeviceId !== 'string' || !selectedDeviceId) {
      throw new Error(
        'Harmony playground prepared metadata is missing a deviceId',
      );
    }
    console.log(`✅ Selected device: ${selectedDeviceId}`);

    console.log('🚀 Starting server...');
    const { server: playgroundServer } =
      await launchPreparedPlaygroundPlatform(prepared);

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
