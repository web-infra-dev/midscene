import { PlaygroundServer } from '@midscene/playground';
import { StaticPage, StaticPageAgent } from './static';

const server = new PlaygroundServer(StaticPage, StaticPageAgent);
Promise.resolve()
  .then(() => server.launch())
  .then(() => {
    console.log(
      `Midscene playground server is running on http://localhost:${server.port}`,
    );
  });
