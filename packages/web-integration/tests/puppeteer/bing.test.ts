import { it, describe, expect, vi } from 'vitest';
import { sleep } from '@midscene/core/utils';
import { launchPage } from './utils';
import { PuppeteerAgent } from '@/puppeteer';

vi.setConfig({
  testTimeout: 60 * 1000,
});

describe('puppeteer integration', () => {
  it('basic launch', async () => {
    const page = await launchPage('https://www.bing.com');

    const agent = new PuppeteerAgent(page);

    await agent.aiAction('type "how much is the ferry ticket in Shanghai" in search box, hit Enter');
    await sleep(5000);

    const relatedSearch = await agent.aiQuery('string[], related search keywords on the right');
    console.log('related search', relatedSearch);
    expect(relatedSearch.length).toBeGreaterThan(3);
  });
});
