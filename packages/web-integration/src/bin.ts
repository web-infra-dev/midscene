import { PlaygroundServer } from '@midscene/playground';
import cors from 'cors';
import { StaticPage, StaticPageAgent } from './static';
import 'dotenv/config';

// Create page and agent instances
const page = new StaticPage({
  tree: { node: null, children: [] },
  size: { width: 800, height: 600 },
  screenshotBase64: '',
});
const agent = new StaticPageAgent(page);

// Create server
const server = new PlaygroundServer(page, agent);

// Register CORS middleware as the very first middleware
server.app.use(
  cors({
    origin: '*',
    credentials: true,
  }),
);

// Add context update middleware
server.app.use((req, _res, next) => {
  const { context } = req.body || {};
  if (
    context &&
    'updateContext' in page &&
    typeof page.updateContext === 'function'
  ) {
    page.updateContext(context);
  }
  next();
});

Promise.resolve()
  .then(() => server.launch())
  .then(() => {
    console.log(
      `Midscene playground server is running on http://localhost:${server.port}`,
    );
  });
