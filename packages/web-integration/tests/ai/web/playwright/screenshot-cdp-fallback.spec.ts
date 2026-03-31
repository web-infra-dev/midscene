import { PlaywrightWebPage } from '@/playwright';
import { expect, test } from '@playwright/test';

test.describe('playwright screenshot CDP fallback', () => {
  test.setTimeout(30 * 1000);

  test('should fall back to CDP when a hanging web font blocks screenshot', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://www.example.com', {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });

    // Inject a @font-face that will never finish loading,
    // causing Playwright's screenshot to hang on "waiting for fonts to load"
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = `
        @font-face {
          font-family: 'HangingFont';
          src: url('https://httpbin.org/delay/30') format('woff2');
          font-display: block;
        }
        .use-hanging-font { font-family: 'HangingFont', sans-serif; }
      `;
      document.head.appendChild(style);
      const el = document.createElement('div');
      el.className = 'use-hanging-font';
      el.textContent = 'trigger font load';
      document.body.appendChild(el);
    });

    const webPage = new PlaywrightWebPage(page);
    const screenshotBase64 = await webPage.screenshotBase64();

    expect(screenshotBase64).toContain('data:image/jpeg;base64,');
    expect(screenshotBase64.length).toBeGreaterThan(1_000);
  });
});
