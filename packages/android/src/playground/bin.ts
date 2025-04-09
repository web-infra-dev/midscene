import path from 'node:path';
import {
  PLAYGROUND_SERVER_PORT,
  SCRCPY_SERVER_PORT,
} from '@midscene/shared/constants';
import PlaygroundServer from '@midscene/web/midscene-server';
import open from 'open';
import { AndroidAgent, AndroidDevice } from '../';
import ScrcpyServer from './scrcpy-server';

const staticDir = path.join(__dirname, '../../static');
const playgroundServer = new PlaygroundServer(
  AndroidDevice,
  AndroidAgent,
  staticDir,
);
const scrcpyServer = new ScrcpyServer();

// 启动两个服务器
Promise.all([
  playgroundServer.launch(PLAYGROUND_SERVER_PORT),
  scrcpyServer.launch(SCRCPY_SERVER_PORT),
])
  .then(() => {
    console.log(
      `Midscene playground server is running on http://localhost:${playgroundServer.port}`,
    );
    open(`http://localhost:${playgroundServer.port}`);
  })
  .catch((error) => {
    console.error('Failed to start servers:', error);
    process.exit(1);
  });
