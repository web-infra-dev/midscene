import { PuppeteerWebPage } from '@/puppeteer';
import { launchPuppeteerPage } from '@/puppeteer/agent-launcher';
import type { MidsceneYamlScriptWebEnv } from '@midscene/core';
import type { Viewport } from 'puppeteer';

export async function launchPage(
  url: string,
  opt?: {
    viewport?: Viewport;
    headless?: boolean;
    /**
     * Additional preferences passed to puppeteer launcher
     * Keep backward-compatible: `headless` still works
     */
    preference?: {
      headed?: boolean;
      keepWindow?: boolean;
    };
    /**
     * Extra fields to override the launch target, e.g. userAgent, waitForNetworkIdle, etc.
     */
    targetOverrides?: Partial<MidsceneYamlScriptWebEnv>;
  },
) {
  const { page, freeFn } = await launchPuppeteerPage(
    {
      url,
      viewportWidth: opt?.viewport?.width,
      viewportHeight: opt?.viewport?.height,
      viewportScale: opt?.viewport?.deviceScaleFactor,
      ...(opt?.targetOverrides || {}),
    },
    {
      headed:
        typeof opt?.preference?.headed === 'boolean'
          ? opt.preference.headed
          : typeof opt?.headless === 'boolean'
            ? !opt.headless
            : false,
      keepWindow: opt?.preference?.keepWindow,
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
