import { StaticPage, StaticPageAgent } from './';
import PlaygroundServer from './server';

const server = new PlaygroundServer(StaticPage, StaticPageAgent);
Promise.resolve()
  .then(() => server.launch())
  .then(() => {
    console.log(
      `Midscene playground server is running on http://localhost:${server.port}`,
    );
  });
