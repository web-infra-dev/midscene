import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PlaywrightWebPage } from '@/playwright';
import { expect, test } from '@playwright/test';

test.describe('playwright screenshot CDP fallback', () => {
  test.setTimeout(30 * 1000);

  let slowServer: ReturnType<typeof createServer>;
  let slowServerUrl: string;

  test.beforeAll(async () => {
    slowServer = createServer((req, res) => {
      // Respond after 30 seconds — long enough to trigger Playwright screenshot timeout
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'font/woff2' });
        res.end();
      }, 30_000);
    });

    await new Promise<void>((resolve) => {
      slowServer.listen(0, '127.0.0.1', () => {
        const addr = slowServer.address() as AddressInfo;
        slowServerUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  test.afterAll(async () => {
    slowServer?.close();
  });

  test('should fall back to CDP when a hanging web font blocks screenshot', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://www.example.com', {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });

    // Inject a @font-face pointing to the local slow server,
    // causing Playwright's screenshot to hang on "waiting for fonts to load"
    const fontUrl = `${slowServerUrl}/hanging-font.woff2`;
    await page.evaluate((url: string) => {
      const style = document.createElement('style');
      style.textContent = `
        @font-face {
          font-family: 'HangingFont';
          src: url('${url}') format('woff2');
          font-display: block;
        }
        .use-hanging-font { font-family: 'HangingFont', sans-serif; }
      `;
      document.head.appendChild(style);
      const el = document.createElement('div');
      el.className = 'use-hanging-font';
      el.textContent = 'trigger font load';
      document.body.appendChild(el);
    }, fontUrl);

    const webPage = new PlaywrightWebPage(page);
    const screenshotBase64 = await webPage.screenshotBase64();

    expect(screenshotBase64).toContain('data:image/jpeg;base64,');
    expect(screenshotBase64.length).toBeGreaterThan(1_000);
  });
});
