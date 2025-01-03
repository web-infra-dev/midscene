import {
  ChromePageOverBridgeAgent,
  getBridgePageInCliSide,
} from '@/bridge-mode/agent-cli-side';
import { describe, expect, it } from 'vitest';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
describe.skipIf(process.env.CI)(
  'fully functional agent in server(cli) side',
  () => {
    it('basic', async () => {
      const page = getBridgePageInCliSide();
      expect(page).toBeDefined();

      // server should be destroyed as well
      await page.destroy();
    });

    it(
      'page in cli side',
      async () => {
        const page = getBridgePageInCliSide();

        // make sure the extension bridge is launched before timeout
        await page.connectNewTabWithUrl('https://www.baidu.com');

        // sleep 3s
        await sleep(3000);

        await page.destroy();
      },
      40 * 1000, // longer than the timeout of the bridge io
    );

    it(
      'agent in cli side, new tab',
      async () => {
        const agent = new ChromePageOverBridgeAgent();

        await agent.connectNewTabWithUrl('https://www.bing.com');
        await sleep(3000);

        await agent.ai('type "AI 101" and hit Enter');
        await sleep(3000);

        await agent.aiAssert('there are some search results');
        await agent.destroy();
      },
      60 * 1000,
    );

    it(
      'agent in cli side, current tab',
      async () => {
        const agent = new ChromePageOverBridgeAgent();
        await agent.connectCurrentTab();
        await sleep(3000);
        const answer = await agent.aiQuery(
          'name of the current page? return {name: string}',
        );

        console.log(answer);
        expect(answer.name).toBeTruthy();
        await agent.destroy();
      },
      60 * 1000,
    );
  },
);
