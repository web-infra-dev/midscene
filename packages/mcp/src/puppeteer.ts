// fork from https://github.com/modelcontextprotocol/servers/blob/f93737dbb098f8c078365c63c94908598f7db157/src/puppeteer/index.ts

import { PuppeteerAgent } from '@midscene/web/puppeteer';
import type { Browser, LaunchOptions } from 'puppeteer-core';
import type { Page } from 'puppeteer-core';
import puppeteer from 'puppeteer-core';
import { deepMerge, getChromePathFromEnv } from './utils';

// Global state
let browser: Browser | null;
let page: Page | null;
const consoleLogs: string[] = [];
let previousLaunchOptions: any = null;

const DANGEROUS_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--single-process',
  '--disable-web-security',
  '--ignore-certificate-errors',
  '--disable-features=IsolateOrigins',
  '--disable-site-isolation-trials',
  '--allow-running-insecure-content',
];

function getBrowserLaunchOptions(
  launchOptions: LaunchOptions | undefined,
  allowDangerous: boolean | undefined,
): LaunchOptions {
  // Parse environment config safely
  let envConfig = {};
  try {
    envConfig = JSON.parse(process.env.PUPPETEER_LAUNCH_OPTIONS || '{}');
  } catch (error: any) {
    console.warn(
      'Failed to parse PUPPETEER_LAUNCH_OPTIONS:',
      error?.message || error,
    );
  }

  // Deep merge environment config with user-provided options
  const mergedConfig = deepMerge(envConfig, launchOptions || {});

  // Security validation for merged config
  if (mergedConfig?.args) {
    const dangerousArgs = mergedConfig.args?.filter?.((arg: string) =>
      DANGEROUS_ARGS.some((dangerousArg: string) =>
        arg.startsWith(dangerousArg),
      ),
    );
    if (
      dangerousArgs?.length > 0 &&
      !(allowDangerous || process.env.ALLOW_DANGEROUS === 'true')
    ) {
      throw new Error(
        `Dangerous browser arguments detected: ${dangerousArgs.join(', ')}. Found from environment variable and tool call argument. Set allowDangerous: true in the tool call arguments to override.`,
      );
    }
  }

  const systemChromePath = getChromePathFromEnv();
  const npx_args = {
    headless: false,
    defaultViewport: null,
    args: ['--window-size=1920,1080'],
    ...(systemChromePath && { executablePath: systemChromePath }),
  };
  const docker_args = {
    headless: true,
    args: ['--no-sandbox', '--single-process', '--no-zygote'],
    ...(systemChromePath && { executablePath: systemChromePath }),
  };

  return deepMerge(
    process.env.DOCKER_CONTAINER === 'true' ? docker_args : npx_args,
    mergedConfig,
  );
}

async function ensureBrowser({ launchOptions, allowDangerous }: any) {
  const currentLaunchOptions = getBrowserLaunchOptions(
    launchOptions,
    allowDangerous,
  );

  try {
    if (
      (browser && !browser.connected) ||
      JSON.stringify(currentLaunchOptions) !==
        JSON.stringify(previousLaunchOptions)
    ) {
      await browser?.close();
      browser = null;
    }
  } catch (error) {
    console.warn('Error checking or closing existing browser:', error);
    browser = null;
  }

  if (!browser) {
    previousLaunchOptions = currentLaunchOptions;
    browser = await puppeteer.launch(currentLaunchOptions);
    const pages = await browser.pages();
    page = pages[0];
    consoleLogs.length = 0; // Clear logs for new browser session

    return {
      browser,
      pages,
    };
  }
  const pages = await browser.pages();
  return {
    browser,
    pages,
  };
}

export { ensureBrowser };

// Class to encapsulate Puppeteer browser operations
export class PuppeteerBrowserAgent extends PuppeteerAgent {
  private browser: Browser;

  constructor(browser: Browser, page: Page) {
    // @ts-expect-error The `Page` type in Puppeteer and Puppeteer-core is the same, but it is in different files. They all have a `#private` declare, which causes a TypeScript error.
    super(page);
    this.browser = browser;
  }

  async connectNewTabWithUrl(url: string): Promise<void> {
    await this.page.navigate(url);
  }

  /**
   * In headful mode, find the uniquely visible Page in the current window.
   * In headless mode, all pages are considered visible and cannot be distinguished.
   */
  async getActivePage(timeout = 2000): Promise<Page> {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const pages = await this.browser.pages();
      const visible = [];

      for (const p of pages) {
        // @ts-ignore
        const state = await p.evaluate(() => document.visibilityState);
        if (state === 'visible') visible.push(p);
      }
      if (visible.length === 1) return visible[0]; // Typically returns only one
      await new Promise((r) => setTimeout(r, 100)); // Wait a bit before trying again
    }
    throw new Error('Unable to determine the currently active tab');
  }

  /**
   * Obtain all TAB page information through puppeteer
   * @returns {Promise<Array<{url: string, title: string, id: string, active: boolean}>>}
   */
  async getBrowserTabList(): Promise<
    { url: string; title: string; id: string; currentActiveTab: boolean }[]
  > {
    const pages = await this.browser.pages();
    // Ensure getActivePage is called correctly within the class context
    const activePage = await this.getActivePage();
    const tabsInfo = await Promise.all(
      pages.map(async (page: Page) => ({
        url: page.url(),
        title: await page.title(),
        id: `${(page.mainFrame() as any)._id}`,
        currentActiveTab:
          activePage &&
          (page.mainFrame() as any)._id === (activePage.mainFrame() as any)._id,
      })),
    );

    // Filter out tabs where essential info might be missing (e.g., about:blank initially)
    return tabsInfo.filter((tab) => tab.url && tab.title && tab.id);
  }

  /**
   * Sets the specified tab as the active tab in the browser window.
   * Uses page.bringToFront() for activation.
   * @param tabId The ID of the tab to activate (obtained from getTabsWithPuppeteer).
   * @returns {Promise<boolean>} True if the tab was found and activated, false otherwise.
   */
  async setActiveTabId(tabId: string): Promise<boolean> {
    const pages = await this.browser.pages();
    for (const page of pages) {
      const currentPageId = `${(page.mainFrame() as any)._id}`;
      if (currentPageId === tabId) {
        try {
          await page.bringToFront();
          return true; // Tab found and activated
        } catch (error) {
          console.error(`Error bringing tab ${tabId} to front:`, error);
          return false; // Error during activation
        }
      }
    }
    console.warn(`setActiveTab: Tab with ID '${tabId}' not found.`);
    return false; // Tab not found
  }
}
