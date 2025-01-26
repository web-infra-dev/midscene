import { PuppeteerWebPage } from '@/puppeteer';
import { launchPuppeteerPage } from '@/puppeteer/agent-launcher';
import type { Viewport } from 'puppeteer';

export async function launchPage(
  url: string,
  opt?: {
    viewport?: Viewport;
    headless?: boolean;
  },
) {
  const { page, freeFn } = await launchPuppeteerPage(
    {
      url,
      viewportWidth: opt?.viewport?.width,
      viewportHeight: opt?.viewport?.height,
      viewportScale: opt?.viewport?.deviceScaleFactor,
    },
    {
      headed: typeof opt?.headless === 'boolean' ? !opt.headless : false,
    },
  );

  const originPage = page;
  const midscenePage = new PuppeteerWebPage(originPage);

  return {
    page: midscenePage,
    originPage,
    reset: async () => {
      for (const fn of freeFn) {
        await fn.fn();
      }
    },
  };
}
