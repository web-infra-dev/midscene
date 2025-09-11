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

      // // 👀 assert by AI
      // await agent.aiAssert('This is an example website');

      // // 👀 query data
      // const queryResult = await agent.aiQuery(
      //   'What is the main heading text on this page?',
      // );

      // // 👀 perform action based on the action space
      // await agent.aiAction('scroll down to see more content if available');

      // 👀 launch playground for the agent
      const server = await playgroundForAgent(agent).launch({
        port: 5807,
        openBrowser: true,
        verbose: true, // Reduce verbosity for tests
      });

      // setTimeout(() => {
      //   console.log('closing playground');
      //   server.close();
      // }, 1000); // Reduce wait time

      // Wait for server to start and close
      await new Promise((resolve) => setTimeout(resolve, 2000));
    })(),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
