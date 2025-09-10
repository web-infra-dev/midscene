import { PlaygroundServer } from '@midscene/playground';
import cors from 'cors';
import { StaticPage, StaticPageAgent } from './static';

const server = new PlaygroundServer(StaticPage, StaticPageAgent);

// Register CORS middleware before launching the server
server.app.use(
  cors({
    origin: '*',
    credentials: true,
  }),
);

Promise.resolve()
  .then(() => server.launch())
  .then(() => {
    console.log(
      `Midscene playground server is running on http://localhost:${server.port}`,
    );
  });
