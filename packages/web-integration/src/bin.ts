import { ScreenshotItem } from '@midscene/core';
import { PlaygroundServer } from '@midscene/playground';
import cors from 'cors';
import { StaticPage, StaticPageAgent } from './static';
import 'dotenv/config';

async function startServer() {
  // Create page and agent instances with minimal valid data
  const screenshot = await ScreenshotItem.create('');
  const page = new StaticPage({
    size: { width: 800, height: 600 },
    screenshot,
  });
  const agent = new StaticPageAgent(page);

  // Create server with agent only
  const server = new PlaygroundServer(agent);

  // Register CORS middleware
  server.app.use(
    cors({
      origin: '*',
      credentials: true,
    }),
  );

  await server.launch();
  console.log(
    `Midscene playground server is running on http://localhost:${server.port}`,
  );
}

startServer().catch(console.error);
