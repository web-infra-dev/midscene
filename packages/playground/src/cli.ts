import path from 'node:path';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import PlaygroundServer from './server';

const staticDir = path.join(__dirname, '..', '..', 'static');
const playgroundServer = new PlaygroundServer(
  class GenericPage {} as any,
  class GenericAgent {} as any,
  staticDir,
);

const main = async () => {
  const { default: open } = await import('open');
  try {
    await playgroundServer.launch(PLAYGROUND_SERVER_PORT);
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
