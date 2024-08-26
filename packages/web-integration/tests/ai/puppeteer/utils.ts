import assert from 'node:assert';
import puppeteer, { type Viewport } from 'puppeteer';

export async function launchPage(
  url: string,
  opt?: {
    viewport?: Viewport;
    headless?: boolean;
  },
) {
  const browser = await puppeteer.launch({
    headless: typeof opt?.headless === 'boolean' ? opt.headless : true,
  });

  const page = (await browser.pages())[0];
  const viewportConfig = {
    width: opt?.viewport?.width || 1920,
    height: opt?.viewport?.height || 1080,
    deviceScaleFactor: opt?.viewport?.deviceScaleFactor || 1,
  };
  await page.setViewport(viewportConfig);
  await Promise.all([
    page.waitForNavigation({
      timeout: 20 * 1000,
      waitUntil: 'networkidle0',
    }),
    (async () => {
      const response = await page.goto(url);
      if (response?.status) {
        assert(
          response.status() <= 399,
          `Page load failed: ${response.status()}`,
        );
      }
    })(),
  ]);

  return {
    page,
    reset: async () => {
      await browser.close();
    },
  };
}
