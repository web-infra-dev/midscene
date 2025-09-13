import { playgroundForAgent } from '@midscene/playground';
import dotenv from 'dotenv';
import { PuppeteerAgent } from '../src/puppeteer';
import { launchPuppeteerPage } from '../src/puppeteer/agent-launcher';

dotenv.config({
  path: '../../.env',
});

async function main() {
  await Promise.resolve(
    (async () => {
      const { page } = await launchPuppeteerPage({
        url: 'https://example.com',
      });
      const agent = new PuppeteerAgent(page, {
        cacheId: 'playground-workflow-test',
      });

      // 👀 launch playground for the agent
      const server = await playgroundForAgent(agent).launch({
        port: 5807,
        openBrowser: true,
        verbose: true,
      });

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
