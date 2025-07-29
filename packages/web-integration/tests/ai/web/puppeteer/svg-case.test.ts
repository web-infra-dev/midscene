import { PuppeteerAgent } from '@/puppeteer';
import { afterEach, describe, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 1200 * 1000,
});

describe('svg case', () => {
  let resetFn: () => Promise<void>;
  afterEach(async () => {
    if (resetFn) {
      await resetFn();
    }
  });

  it('svg', async () => {
    const { originPage, reset } = await launchPage('https://midscenejs.com');
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage, {
      cacheId: 'svg-case',
      waitForNavigationTimeout: 0,
      waitForNetworkIdleTimeout: 0,
    });
    await agent.aiTap('the github icon on the top right');
  });
});
