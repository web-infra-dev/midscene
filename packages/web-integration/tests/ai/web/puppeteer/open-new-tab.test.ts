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
    const { originPage, reset } = await launchPage(
      'https://www.saucedemo.com/',
    );
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage, {
      cacheId: 'puppeteer-open-new-tab',
    });
    await sleep(5000);
    await agent.aiAssert('the page is not about "midscene" project');
    await agent.freezePageContext();
    await agent.aiBoolean('The search result link for "midscene" project');
    const result = await Promise.all([
      agent.aiLocate('login button'),
      agent.aiLocate('username input'),
      agent.aiLocate('password input'),
    ]);
    await agent.unfreezePageContext();
    await agent.aiTap('login button');
  });
});
