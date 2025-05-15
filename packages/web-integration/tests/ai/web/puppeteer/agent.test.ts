import { platform } from 'node:os';
import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import puppeteer from 'puppeteer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 120 * 1000,
});

describe('puppeteer integration', () => {
  it('input and clear text', async () => {
    const browser = await puppeteer.launch({
      headless: false, // 'true' means we can't see the browser window
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({
      width: 1280,
      height: 768,
      deviceScaleFactor: 2, // this is used to avoid flashing on UI Mode when doing screenshot on Mac
    });

    await page.goto('https://www.ebay.com');
    await sleep(5000);

    // 👀 init Midscene agent
    const agent = new PuppeteerAgent(page, {
      cacheId: 'ebay-headphones',
    });

    // 👀 type keywords, perform a search
    await agent.aiAction('type "Headphones" in search box, hit Enter');

    // 👀 wait for the loading
    await agent.aiWaitFor('there is at least one headphone item on page');
    // or you may use a plain sleep:
    // await sleep(5000);

    // await agent.aiAction('scroll one page down');

    await agent.aiTap('the last item in the list');

    await browser.close();
  });
});
