import { it, describe, expect, vi } from 'vitest';
import { sleep } from '@midscene/core/utils';
import { launchPage } from './utils';
import { PuppeteerAgent } from '@/puppeteer';

vi.setConfig({
  testTimeout: 60 * 1000,
});

describe('puppeteer integration', () => {
  it('basic launch', async () => {
    const page = await launchPage('https://www.ebay.com');

    const agent = new PuppeteerAgent(page);

    await agent.aiAction('type "Headphones" in search box, hit Enter');
    await sleep(5000);

    const items = await agent.aiQuery(
      '{itemTitle: string, price: Number}[], find item in list and corresponding price',
    );
    console.log('related search', items);
    expect(items.length).toBeGreaterThanOrEqual(2);
  });
});
