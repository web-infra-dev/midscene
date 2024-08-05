import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 90 * 1000,
});

describe('puppeteer integration', () => {
  it('search headphones on ebay', async () => {
    const page = await launchPage('https://www.ebay.com');
    const mid = new PuppeteerAgent(page);

    // perform a search
    await mid.aiAction('type "Headphones" in search box, hit Enter');
    await sleep(5000);

    // find the items
    const items = await mid.aiQuery(
      '{itemTitle: string, price: Number}[], find item in list and corresponding price',
    );
    console.log('headphones in stock', items);
    expect(items.length).toBeGreaterThanOrEqual(2);

    await mid.aiAssert('There is a category filter on the left');
  });

  it('extract the Github service status', async () => {
    const page = await launchPage('https://www.githubstatus.com/');
    const mid = new PuppeteerAgent(page);

    const result = await mid.aiQuery(
      'this is a service status page. Extract all status data with this scheme: {[serviceName]: [statusText]}',
    );
    console.log('Github service status', result);

    await mid.aiAssert('food delivery service is in normal state');
  });
});
