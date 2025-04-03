import path from 'node:path';
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
Promise.all([playgroundServer.launch(5800), scrcpyServer.launch(5700)])
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
