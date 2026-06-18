import { WebPage as PlaywrightWebPage } from '@/playwright/page';
import { PuppeteerWebPage } from '@/puppeteer/page';
import { type Browser as PlaywrightBrowser, chromium } from 'playwright';
import puppeteer, { type Browser as PuppeteerBrowser } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const TEST_TIMEOUT_MS = 120_000;

const PAGE_HTML = `
  <!DOCTYPE html>
  <html>
    <body style="padding: 24px;">
      <input id="target" value="value to clear" style="width: 240px; padding: 8px;" />
    </body>
  </html>
`;

async function puppeteerInputCenter(page: any): Promise<[number, number]> {
  return page.$eval('#target', (el: HTMLInputElement) => {
    const rect = el.getBoundingClientRect();
    return [rect.left + rect.width / 2, rect.top + rect.height / 2];
  });
}

async function playwrightInputCenter(page: any): Promise<[number, number]> {
  return page.locator('#target').evaluate((el: HTMLInputElement) => {
    const rect = el.getBoundingClientRect();
    return [rect.left + rect.width / 2, rect.top + rect.height / 2];
  });
}

describe('BasePage clearInput CDP selectAll', () => {
  describe('Puppeteer', () => {
    let browser: PuppeteerBrowser;

    beforeAll(async () => {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }, TEST_TIMEOUT_MS);

    afterAll(async () => {
      await browser?.close();
    }, TEST_TIMEOUT_MS);

    test(
      'clears the focused input',
      async () => {
        const page = await browser.newPage();
        await page.setContent(PAGE_HTML);

        const webPage = new PuppeteerWebPage(page);
        const center = await puppeteerInputCenter(page);

        await webPage.clearInput({ center } as any);

        const value = await page.$eval(
          '#target',
          (el) => (el as HTMLInputElement).value,
        );
        await page.close();

        expect(value).toBe('');
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('Playwright', () => {
    let browser: PlaywrightBrowser;

    beforeAll(async () => {
      browser = await chromium.launch({
        headless: true,
        // CI installs Puppeteer's Chrome cache, but not Playwright's browser
        // bundle because dependencies are installed with --ignore-scripts.
        executablePath: puppeteer.executablePath(),
      });
    }, TEST_TIMEOUT_MS);

    afterAll(async () => {
      await browser?.close();
    }, TEST_TIMEOUT_MS);

    test(
      'clears the focused input',
      async () => {
        const page = await browser.newPage();
        await page.setContent(PAGE_HTML);

        const webPage = new PlaywrightWebPage(page);
        const center = await playwrightInputCenter(page);

        await webPage.clearInput({ center } as any);

        const value = await page.locator('#target').evaluate((el) => {
          return (el as HTMLInputElement).value;
        });
        await page.close();

        expect(value).toBe('');
      },
      TEST_TIMEOUT_MS,
    );
  });
});
