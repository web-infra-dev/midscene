import { launchPreparedPlaygroundPlatform } from '@midscene/playground';
import dotenv from 'dotenv';
import { webPlaygroundPlatform } from '../src/platform';
import { PuppeteerAgent } from '../src/puppeteer';
import { launchPuppeteerPage } from '../src/puppeteer/agent-launcher';

dotenv.config({
  path: '../../.env',
});

async function main() {
  await Promise.resolve(
    (async () => {
      const { page } = await launchPuppeteerPage({
        url: 'https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/contacts3.html',
      });
      await page.setViewport({
        width: 1280,
        height: 768,
      });

      const agent = new PuppeteerAgent(page, {
        cacheId: 'playground-workflow-test',
      });

      const prepared = await webPlaygroundPlatform.prepare({
        agent,
        launchOptions: {
          port: 5807,
          openBrowser: true,
          verbose: true,
        },
      });
      const server = await launchPreparedPlaygroundPlatform(prepared);

      // Log the generated server ID for debugging
      console.log(`🔑 Generated Server ID: ${server.server.id}`);

      // Wait for server to start and close
      await new Promise((resolve) => setTimeout(resolve, 2000));
    })(),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
