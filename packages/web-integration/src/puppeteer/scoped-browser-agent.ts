import type {
  Browser as PuppeteerBrowser,
  Page as PuppeteerPage,
} from 'puppeteer';
import {
  PuppeteerBrowserAgent,
  type PuppeteerBrowserAgentOpt,
} from './browser-agent';
import type { PuppeteerPageOwnership } from './page-ownership';

export function createScopedPuppeteerBrowserAgent(
  browser: PuppeteerBrowser,
  initialPage: PuppeteerPage,
  opts: PuppeteerBrowserAgentOpt | undefined,
  pageOwnership: PuppeteerPageOwnership,
): PuppeteerBrowserAgent {
  return new PuppeteerBrowserAgent(browser, initialPage, opts, pageOwnership);
}
