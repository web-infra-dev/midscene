import path from 'node:path';
import { AndroidAgent, AndroidDevice } from '@midscene/android';
import {
  PLAYGROUND_SERVER_PORT,
  SCRCPY_SERVER_PORT,
} from '@midscene/shared/constants';
import PlaygroundServer from '@midscene/web/midscene-server';
import ScrcpyServer from './scrcpy-server';

const staticDir = path.join(__dirname, '../../static');
const playgroundServer = new PlaygroundServer(
  AndroidDevice,
  AndroidAgent,
  staticDir,
);
const scrcpyServer = new ScrcpyServer();

const main = async () => {
  const { default: open } = await import('open');
  try {
    await Promise.all([
      playgroundServer.launch(PLAYGROUND_SERVER_PORT),
      scrcpyServer.launch(SCRCPY_SERVER_PORT),
    ]);
    console.log(
      `Midscene playground server is running on http://localhost:${playgroundServer.port}`,
    );
    open(`http://localhost:${playgroundServer.port}`);
  } catch (error) {
    console.error('Failed to start servers:', error);
    process.exit(1);
  }
};

main();
