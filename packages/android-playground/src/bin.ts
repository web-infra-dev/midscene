import path from 'node:path';
import { launchPreparedPlaygroundPlatform } from '@midscene/playground';
import { androidPlaygroundPlatform } from './platform';
import ScrcpyServer from './scrcpy-server';

const staticDir = path.join(__dirname, '../../static');

const main = async () => {
  const { default: open } = await import('open');

  try {
    const prepared = await androidPlaygroundPlatform.prepare({
      staticDir,
    });
    const selectedDeviceId = String(prepared.metadata?.deviceId || '');
    console.log(`✅ Selected device: ${selectedDeviceId}`);

    const scrcpyServer = new ScrcpyServer();

    // Set the selected device in scrcpy server
    scrcpyServer.currentDeviceId = selectedDeviceId;
    const scrcpyPort = Number(prepared.metadata?.scrcpyPort);

    console.log('🚀 Starting servers...');

    const [playgroundResult] = await Promise.all([
      launchPreparedPlaygroundPlatform(prepared),
      scrcpyServer.launch(scrcpyPort),
    ]);

    const playgroundServer = playgroundResult.server;

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
