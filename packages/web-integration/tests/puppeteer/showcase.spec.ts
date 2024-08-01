import { it, describe, expect, vi } from 'vitest';
import { sleep } from '@midscene/core/utils';
import { launchPage } from './utils';
import { PuppeteerAgent } from '@/puppeteer';

vi.setConfig({
  testTimeout: 60 * 1000,
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
  });

  it('extract the Github service status', async () => {
    const page = await launchPage('https://www.githubstatus.com/');
    const mid = new PuppeteerAgent(page);

    const result = await mid.aiQuery(
      'this is a service status page. Extract all status data with this scheme: {[serviceName]: [statusText]}',
    );
    console.log('Github service status', result);
  });
});
