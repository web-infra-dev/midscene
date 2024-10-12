import assert from 'node:assert';
import { PuppeteerWebPage } from '@/puppeteer';
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
    args: ['--no-sandbox'],
  });
  const originPage = (await browser.pages())[0];
  const viewportConfig = {
    width: opt?.viewport?.width || 1920,
    height: opt?.viewport?.height || 1080,
    deviceScaleFactor: opt?.viewport?.deviceScaleFactor || 1,
  };
  await originPage.setViewport(viewportConfig);
  await Promise.all([
    originPage.waitForNavigation({
      timeout: 40 * 1000,
      waitUntil: 'networkidle0',
    }),
    (async () => {
      const response = await originPage.goto(url);
      if (response?.status) {
        assert(
          response.status() <= 399,
          `Page load failed: ${response.status()}`,
        );
      }
    })(),
  ]);
  const page = new PuppeteerWebPage(originPage);

  return {
    page,
    originPage,
    reset: async () => {
      const pages = await browser.pages();
      await Promise.all(pages.map((page) => page.close()));
      await browser.close();
    },
  };
}
