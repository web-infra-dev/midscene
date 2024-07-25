import puppeteer, { Viewport } from 'puppeteer';

const launchPage = async (
  url: string,
  opt?: {
    viewport?: Viewport;
  },
) => {
  const browser = await puppeteer.launch();

  const page = (await browser.pages())[0];
  const viewportConfig = {
    width: opt?.viewport?.pixelWidth || 1920,
    height: opt?.viewport?.pixelHeight || 1080,
    deviceScaleFactor: opt?.viewport?.dpr || 1,
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
        assert(response.status() <= 399, `Page load failed: ${response.status()}`);
      }
    })(),
  ]);
  await sleep(2 * 1000);

  return browser;
};
