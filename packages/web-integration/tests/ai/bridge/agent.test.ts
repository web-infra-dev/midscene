import {
  AgentOverChromeBridge,
  getBridgePageInCliSide,
} from '@/bridge-mode/agent-cli-side';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 60 * 1000,
});
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!process.env.BRIDGE_MODE)(
  'fully functional agent in server(cli) side',
  () => {
    it('basic', async () => {
      const page = getBridgePageInCliSide();
      expect(page).toBeDefined();

      // server should be destroyed as well
      await page.destroy();
    });

    it('page in cli side', async () => {
      const page = getBridgePageInCliSide();

      // make sure the extension bridge is launched before timeout
      await page.connectNewTabWithUrl('https://www.baidu.com');

      // sleep 3s
      await sleep(3000);

      await page.destroy();
    });

    it('agent in cli side, new tab', async () => {
      const agent = new AgentOverChromeBridge();

      await agent.connectNewTabWithUrl('https://www.bing.com');
      await sleep(3000);

      await agent.ai('type "AI 101" and hit Enter and scroll down');
      await sleep(3000);

      await agent.aiAssert('there are some search results');
      await agent.destroy();
    });

    it('agent in cli side, current tab', async () => {
      const agent = new AgentOverChromeBridge();
      await agent.connectCurrentTab();
      await sleep(3000);
      const answer = await agent.aiQuery(
        'name of the current page? return {name: string}',
      );

      console.log(answer);
      expect(answer.name).toBeTruthy();
      await agent.destroy();
    });

    it('agent in cli side, current tab, tracking active tab', async () => {
      const agent = new AgentOverChromeBridge();
      await agent.connectCurrentTab({ trackingActiveTab: true });

      await agent.ai('click "文库"，sleep 1500ms，type "AI 101" and hit Enter');
      await sleep(3000);
      await agent.destroy();
    });
  },
  {
    timeout: 3 * 60 * 10,
  },
);
