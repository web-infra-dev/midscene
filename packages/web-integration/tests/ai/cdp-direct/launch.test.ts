import { CDPDirectAgent } from '@/cdp-direct';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 60 * 1000,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * CDP Direct Launch Mode Tests
 *
 * These tests launch a new Chrome instance (no manual Chrome setup needed).
 * Requires Chrome/Chromium installed on the system.
 *
 * Run:
 *   CDP_LAUNCH=1 npx vitest run tests/ai/cdp-direct/launch.test.ts
 */
const describeIf = process.env.CDP_LAUNCH ? describe : describe.skip;

describeIf(
  'CDP Direct Agent - Launch Mode',
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

    it('launch Chrome and navigate', async () => {
      agent = await CDPDirectAgent.launch({
        headless: true,
      });

      await agent.connectNewTabWithUrl('https://www.example.com');
      await sleep(2000);

      await agent.aiAssert('the page contains "Example Domain"');
    });

    it('launch Chrome and perform search', async () => {
      agent = await CDPDirectAgent.launch({
        headless: true,
      });

      await agent.connectNewTabWithUrl('https://www.bing.com');
      await sleep(3000);

      await agent.ai('type "Midscene" and hit Enter');
      await sleep(3000);

      await agent.aiAssert('there are some search results');
    });

    it('tab management in launched Chrome', async () => {
      agent = await CDPDirectAgent.launch({
        headless: true,
      });

      await agent.connectNewTabWithUrl('https://www.example.com');
      await sleep(1000);

      const tabs = await agent.getBrowserTabList();
      expect(tabs.length).toBeGreaterThanOrEqual(1);

      const exampleTab = tabs.find(
        (t) => new URL(t.url).hostname === 'www.example.com',
      );
      expect(exampleTab).toBeDefined();
    });
  },
);
