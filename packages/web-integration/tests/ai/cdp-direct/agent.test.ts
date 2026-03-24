import { CDPDirectAgent } from '@/cdp-direct';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 60 * 1000,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * CDP Direct Mode Tests
 *
 * Prerequisites:
 *   1. Start Chrome with remote debugging:
 *      /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 *
 *   2. Or enable remote debugging via chrome://inspect/#remote-debugging
 *
 * Run:
 *   CDP_PORT=9222 npx vitest run tests/ai/cdp-direct/agent.test.ts
 */
const describeIf = process.env.CDP_PORT ? describe : describe.skip;

describeIf(
  'CDP Direct Agent',
  {
    timeout: 3 * 60 * 1000,
  },
  () => {
    let agent: CDPDirectAgent | null = null;

    afterEach(async () => {
      if (agent) {
        try {
          await agent.destroy();
        } catch (e) {
          console.warn('agent destroy error:', e);
        }
        agent = null;
      }
    });

    it('connect to Chrome and list tabs', async () => {
      agent = await CDPDirectAgent.connect({
        port: Number(process.env.CDP_PORT),
      });

      const tabs = await agent.getBrowserTabList();
      expect(tabs.length).toBeGreaterThan(0);
      expect(tabs[0].url).toBeTruthy();
    });

    it('connect current tab and query page info', async () => {
      agent = await CDPDirectAgent.connect({
        port: Number(process.env.CDP_PORT),
      });
      await agent.connectCurrentTab();
      await sleep(1000);

      const answer = await agent.aiQuery(
        'name or title of the current page? return {name: string}',
      );
      expect(answer.name).toBeTruthy();
    });

    it('open new tab and navigate', async () => {
      agent = await CDPDirectAgent.connect({
        port: Number(process.env.CDP_PORT),
      });

      await agent.connectNewTabWithUrl('https://www.example.com');
      await sleep(2000);

      await agent.aiAssert('the page contains "Example Domain"');
    });

    it('search on Bing', async () => {
      agent = await CDPDirectAgent.connect({
        port: Number(process.env.CDP_PORT),
      });

      await agent.connectNewTabWithUrl('https://www.bing.com');
      await sleep(3000);

      await agent.ai('type "AI 101" and hit Enter');
      await sleep(3000);

      await agent.aiAssert('there are some search results');
    });

    it('switch between tabs', async () => {
      agent = await CDPDirectAgent.connect({
        port: Number(process.env.CDP_PORT),
      });

      await agent.connectNewTabWithUrl('https://www.example.com');
      await sleep(1000);

      await agent.connectNewTabWithUrl('https://www.bing.com');
      await sleep(1000);

      const tabs = await agent.getBrowserTabList();
      expect(tabs.length).toBeGreaterThanOrEqual(2);

      const exampleTab = tabs.find((t) => t.url.includes('example.com'));
      expect(exampleTab).toBeDefined();
      if (exampleTab) {
        await agent.switchToTab(exampleTab.id);
        await sleep(1000);
        await agent.aiAssert('the page contains "Example Domain"');
      }
    });
  },
);
