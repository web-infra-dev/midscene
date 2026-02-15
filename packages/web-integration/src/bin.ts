import { PlaygroundServer } from '@midscene/playground';
import cors from 'cors';
import { StaticPage, StaticPageAgent } from './static';
import 'dotenv/config';
import { ScreenshotItem } from '@midscene/core';

async function startServer() {
  // Create page and agent instances with minimal valid data
  // Use screenshotBase64 field for empty screenshot
  const page = new StaticPage({
    shotSize: { width: 800, height: 600 },
    screenshot: ScreenshotItem.create(''),
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
