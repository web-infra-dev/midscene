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
    args: [
      '--no-sandbox',
      '--disable-features=PasswordLeakDetection',
      '--disable-save-password-bubble',
    ],
  });
  const originPage = (await browser.pages())[0];
  const viewportConfig = {
    width: opt?.viewport?.width || 1920,
    height: opt?.viewport?.height || 1080,
    deviceScaleFactor: opt?.viewport?.deviceScaleFactor || 1,
  };
  await originPage.setViewport(viewportConfig);
  await originPage.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  );
  const response = await originPage.goto(url);
  await originPage.waitForNetworkIdle();
  if (response?.status) {
    assert(response.status() <= 399, `Page load failed: ${response.status()}`);
  }
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
