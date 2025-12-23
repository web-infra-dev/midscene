import { chromium } from 'playwright';
import type { Browser, BrowserServer } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Playwright Browser Server', {
  timeout: 30000,
}, () => {
  let browserServer: BrowserServer;
  let wsEndpoint: string;

  beforeAll(async () => {
    browserServer = await chromium.launchServer({
      headless: false,
    });
    wsEndpoint = browserServer.wsEndpoint();
  });

  afterAll(async () => {
    if (browserServer) {
      await browserServer.close();
    }
  });

  it('should launch server and retrieve WebSocket endpoint', () => {
    expect(wsEndpoint).toBeDefined();
    expect(wsEndpoint).toMatch(/^wss?:\/\//);
  });

  it('should connect to browser server and open Google', async () => {
    let browser: Browser | null = null;

    try {
      // Connect to the browser server using WebSocket endpoint
      browser = await chromium.connect(wsEndpoint);
      expect(browser).toBeDefined();
      expect(browser.isConnected()).toBe(true);

      // Create a new page and navigate to Google
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('https://www.google.com', {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      // Verify the page loaded successfully
      const title = await page.title();
      expect(title).toContain('Google');

      // Verify the page URL
      const url = page.url();
      expect(url).toMatch(/google\.com/);

      // Clean up
      await page.close();
      await context.close();
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  });

  it('should support multiple browser connections', async () => {
    const browser1 = await chromium.connect(wsEndpoint);
    const browser2 = await chromium.connect(wsEndpoint);

    try {
      expect(browser1.isConnected()).toBe(true);
      expect(browser2.isConnected()).toBe(true);

      // Verify both connections work independently
      const context1 = await browser1.newContext();
      const context2 = await browser2.newContext();

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      await Promise.all([
        page1.goto('https://www.google.com', { waitUntil: 'domcontentloaded' }),
        page2.goto('https://www.google.com', { waitUntil: 'domcontentloaded' }),
      ]);

      expect(await page1.title()).toContain('Google');
      expect(await page2.title()).toContain('Google');

      await page1.close();
      await page2.close();
      await context1.close();
      await context2.close();
    } finally {
      await browser1.close();
      await browser2.close();
    }
  });
});
