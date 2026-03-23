import path from 'node:path';
import { launchPreparedPlaygroundPlatform } from '@midscene/playground';
import { iosPlaygroundPlatform } from './platform';

const staticDir = path.join(__dirname, '../../static');

const main = async () => {
  const { default: open } = await import('open');

  try {
    console.log('🚀 Starting server...');
    const prepared = await iosPlaygroundPlatform.prepare({
      staticDir,
    });
    const { server: playgroundServer } =
      await launchPreparedPlaygroundPlatform(prepared);
    const wdaHost = String(prepared.metadata?.wdaHost || 'localhost');
    const wdaPort = String(prepared.metadata?.wdaPort || '');

    console.log('');
    console.log('✨ Midscene iOS Playground is ready!');
    console.log(`🎮 Playground: http://localhost:${playgroundServer.port}`);
    console.log('📱 Device: WebDriverAgent Connected');
    console.log(`🔧 WebDriverAgent: ${wdaHost}:${wdaPort}`);
    console.log(`🔑 Generated Server ID: ${playgroundServer.id}`);
    console.log('');

    open(`http://localhost:${playgroundServer.port}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

main();
