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

async function playwrightInputValue(page: any): Promise<string> {
  return page.locator('#target').evaluate((el: HTMLInputElement) => el.value);
}

async function playwrightBrowserUserAgent(page: any): Promise<string> {
  const client = await page.context().newCDPSession(page);
  try {
    const version = await client.send('Browser.getVersion');
    return version.userAgent;
  } finally {
    await client.detach().catch(() => undefined);
  }
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

        const webPage = new PlaywrightWebPage(page);
        const center = await playwrightInputCenter(page);

        await webPage.clearInput({ center } as any);

        const value = await playwrightInputValue(page);
        await page.close();

        expect(value).toBe('');
      },
      TEST_TIMEOUT_MS,
    );

    describe('with spoofed browser-level user agent', () => {
      const linuxUserAgent =
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.31 Safari/537.36';
      const macUserAgent =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.31 Safari/537.36';
      const spoofedUserAgent =
        process.platform === 'darwin' ? linuxUserAgent : macUserAgent;
      const spoofedUserAgentMarker =
        process.platform === 'darwin' ? 'X11; Linux x86_64' : 'Macintosh';
      const localSelectAllModifier =
        process.platform === 'darwin' ? 'Meta' : 'Control';

      let spoofedBrowser: PlaywrightBrowser;

      beforeAll(async () => {
        spoofedBrowser = await chromium.launch({
          headless: true,
          executablePath: puppeteer.executablePath(),
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--user-agent=${spoofedUserAgent}`,
          ],
        });
      }, TEST_TIMEOUT_MS);

      afterAll(async () => {
        await spoofedBrowser?.close();
      }, TEST_TIMEOUT_MS);

      test(
        'clears input with CDP selectAll when browser platform is changed by UA',
        async () => {
          const page = await spoofedBrowser.newPage();
          await page.setContent(PAGE_HTML);

          const browserUserAgent = await playwrightBrowserUserAgent(page);
          expect(browserUserAgent).toContain(spoofedUserAgentMarker);

          const webPage = new PlaywrightWebPage(page);
          const center = await playwrightInputCenter(page);

          await webPage.clearInput({ center } as any);

          const value = await playwrightInputValue(page);
          await page.close();

          expect(value).toBe('');
        },
        TEST_TIMEOUT_MS,
      );

      test(
        'does not clear input with local-platform modifier+A when browser platform is changed by UA',
        async () => {
          const page = await spoofedBrowser.newPage();
          await page.setContent(PAGE_HTML);

          const browserUserAgent = await playwrightBrowserUserAgent(page);
          expect(browserUserAgent).toContain(spoofedUserAgentMarker);

          const center = await playwrightInputCenter(page);
          await page.mouse.click(center[0], center[1]);
          await page.keyboard.down(localSelectAllModifier);
          await page.keyboard.press('a');
          await page.keyboard.up(localSelectAllModifier);
          await page.keyboard.press('Backspace');

          const value = await playwrightInputValue(page);
          await page.close();

          expect(value).not.toBe('');
        },
        TEST_TIMEOUT_MS,
      );
    });
  });
});
