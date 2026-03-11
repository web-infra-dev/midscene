import { playgroundForAgent } from '@midscene/playground';
import { StaticPage, StaticPageAgent } from './static';
import 'dotenv/config';
import { ScreenshotItem } from '@midscene/core';

async function startServer() {
  // Create page and agent instances with minimal valid data
  // Use screenshotBase64 field for empty screenshot
  const page = new StaticPage({
    shotSize: { width: 800, height: 600 },
    screenshot: ScreenshotItem.create('', Date.now()),
    shrunkShotToLogicalRatio: 1,
  });
  const agent = new StaticPageAgent(page);

  const { server } = await playgroundForAgent(agent).launch({
    openBrowser: false,
    verbose: false,
    enableCors: true,
    corsOptions: {
      origin: '*',
      credentials: true,
    },
  });
  console.log(
    `Midscene playground server is running on http://localhost:${server.port}`,
  );
}

startServer().catch(console.error);
