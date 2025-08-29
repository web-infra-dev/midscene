import {
  PlaygroundServer,
  StaticPage,
  StaticPageAgent,
} from '@midscene/playground';

const server = new PlaygroundServer(StaticPage, StaticPageAgent);
Promise.resolve()
  .then(() => server.launch())
  .then(() => {
    console.log(
      `Midscene playground server is running on http://localhost:${server.port}`,
    );
  });
