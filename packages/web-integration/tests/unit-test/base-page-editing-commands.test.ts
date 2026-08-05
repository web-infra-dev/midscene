import { WebPage as PlaywrightWebPage } from '@/playwright/page';
import { PuppeteerWebPage } from '@/puppeteer/page';
import { createWebInputPrimitives } from '@/web-page';
import {
  type Browser as PlaywrightBrowser,
  type Page as PlaywrightPage,
  chromium,
} from 'playwright';
import puppeteer, {
  type Browser as PuppeteerBrowser,
  type Page as PuppeteerPage,
} from 'puppeteer';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const TEST_TIMEOUT_MS = 120_000;

const PAGE_HTML = `
  <!DOCTYPE html>
  <html>
    <body style="padding: 24px;">
      <input id="target" value="value to clear" style="width: 240px; padding: 8px;" />
      <input id="other" value="other value" style="width: 240px; padding: 8px;" />
    </body>
  </html>
`;

async function puppeteerInputCenter(
  page: PuppeteerPage,
): Promise<[number, number]> {
  return page.$eval('#target', (el: HTMLInputElement) => {
    const rect = el.getBoundingClientRect();
    return [rect.left + rect.width / 2, rect.top + rect.height / 2];
  });
}

async function playwrightInputCenter(
  page: PlaywrightPage,
  selector = '#target',
): Promise<[number, number]> {
  return page.locator(selector).evaluate((el: HTMLInputElement) => {
    const rect = el.getBoundingClientRect();
    return [rect.left + rect.width / 2, rect.top + rect.height / 2];
  });
}

async function playwrightInputValue(
  page: PlaywrightPage,
  selector = '#target',
): Promise<string> {
  return page.locator(selector).evaluate((el: HTMLInputElement) => el.value);
}

async function playwrightInputSelection(
  page: PlaywrightPage,
): Promise<[number | null, number | null]> {
  return page
    .locator('#target')
    .evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]);
}

async function installEditingEventRecorder(
  page: PlaywrightPage,
): Promise<void> {
  await page.evaluate(() => {
    const browserWindow = window as typeof window & {
      __midsceneEditingEvents: string[];
    };
    browserWindow.__midsceneEditingEvents = [];
    document.addEventListener('copy', () =>
      browserWindow.__midsceneEditingEvents.push('copy'),
    );
    document.addEventListener('cut', () =>
      browserWindow.__midsceneEditingEvents.push('cut'),
    );
  });
}

async function playwrightEditingEvents(
  page: PlaywrightPage,
): Promise<string[]> {
  return page.evaluate(() => {
    const browserWindow = window as typeof window & {
      __midsceneEditingEvents: string[];
    };
    return browserWindow.__midsceneEditingEvents;
  });
}

async function playwrightBrowserUserAgent(
  page: PlaywrightPage,
): Promise<string> {
  const client = await page.context().newCDPSession(page);
  try {
    const version = await client.send('Browser.getVersion');
    return version.userAgent;
  } finally {
    await client.detach().catch(() => undefined);
  }
}

describe('BasePage editing commands', () => {
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

    test(
      'preserves the selection when the cut shortcut targets the same input',
      async () => {
        const page = await browser.newPage();
        await page.setContent(PAGE_HTML);
        await installEditingEventRecorder(page);

        const input = createWebInputPrimitives(new PlaywrightWebPage(page));
        const center = await playwrightInputCenter(page);
        const target = { center } as any;
        const modifier = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';

        await input.keyboard.keyboardPress(`${modifier}+A`, { target });
        expect(await playwrightInputSelection(page)).toEqual([0, 14]);

        await input.keyboard.keyboardPress(`${modifier}+X`, { target });
        expect(await playwrightInputValue(page)).toBe('');
        expect(await playwrightEditingEvents(page)).toEqual(['cut']);

        await page.close();
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'preserves the selection when the copy shortcut targets the same input',
      async () => {
        const page = await browser.newPage();
        await page.setContent(PAGE_HTML);
        await installEditingEventRecorder(page);

        const input = createWebInputPrimitives(new PlaywrightWebPage(page));
        const center = await playwrightInputCenter(page);
        const target = { center } as any;
        const modifier = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';

        await input.keyboard.keyboardPress(`${modifier}+A`, { target });
        await input.keyboard.keyboardPress(`${modifier}+C`, { target });

        expect(await playwrightInputValue(page)).toBe('value to clear');
        expect(await playwrightInputSelection(page)).toEqual([0, 14]);
        expect(await playwrightEditingEvents(page)).toEqual(['copy']);

        await page.close();
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'focuses a different target before dispatching a cut shortcut',
      async () => {
        const page = await browser.newPage();
        await page.setContent(PAGE_HTML);

        await page.locator('#other').focus();
        await page.locator('#other').selectText();

        const input = createWebInputPrimitives(new PlaywrightWebPage(page));
        const center = await playwrightInputCenter(page);
        const modifier = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';

        await input.keyboard.keyboardPress(`${modifier}+X`, {
          target: { center } as any,
        });

        expect(await playwrightInputValue(page, '#other')).toBe('other value');
        expect(await playwrightInputValue(page)).toBe('value to clear');
        expect(await page.evaluate(() => document.activeElement?.id)).toBe(
          'target',
        );

        await page.close();
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
