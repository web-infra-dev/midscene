import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 120 * 1000,
});

describe('agent with forceSameTabNavigation', () => {
  let resetFn: () => Promise<void>;
  afterEach(async () => {
    if (resetFn) {
      await resetFn();
    }
  });

  it('open new tab', async () => {
    const { originPage, reset } = await launchPage('https://www.bing.com/');
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage, {
      cacheId: 'puppeteer-open-new-tab',
    });
    await agent.aiAction('search "midscene github" and open the first result');
    await sleep(5000);
    await agent.aiAssert('the page is about "midscene" project');
  });
});
