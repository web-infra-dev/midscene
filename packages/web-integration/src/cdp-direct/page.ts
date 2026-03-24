import type { WebPageOpt } from '@/web-element';
import type { Page as PuppeteerPageType } from 'puppeteer';
import type {
  Browser,
  Page as PuppeteerCorePageType,
  Target,
} from 'puppeteer-core';
import { PuppeteerWebPage } from '../puppeteer/page';

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  currentActiveTab: boolean;
}

/**
 * puppeteer-core and puppeteer export structurally identical Page types
 * but they are declared separately. This helper casts between them.
 */
function asPuppeteerPage(page: PuppeteerCorePageType): PuppeteerPageType {
  return page as unknown as PuppeteerPageType;
}

function asCorePages(
  pages: Awaited<ReturnType<Browser['pages']>>,
): PuppeteerCorePageType[] {
  return pages;
}

/**
 * Filter to only include normal web pages (http/https/file, not about:blank or chrome://).
 */
function isWebPage(page: PuppeteerCorePageType): boolean {
  const url = page.url();
  return (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('file://')
  );
}

/**
 * Get the CDP target ID of a page as a stable identity.
 * Throws if no stable ID can be determined.
 */
function getPageId(page: PuppeteerCorePageType): string {
  const target: Target = page.target();
  // Puppeteer Target exposes _targetId internally; fall back to url
  const targetId = (target as unknown as Record<string, unknown>)._targetId;
  if (typeof targetId === 'string' && targetId) return targetId;
  const url = target.url();
  if (url) return url;
  throw new Error('Cannot determine stable ID for page target');
}

export class CDPDirectPage extends PuppeteerWebPage {
  private browser: Browser;

  constructor(
    browser: Browser,
    page: PuppeteerCorePageType,
    opts?: WebPageOpt,
  ) {
    super(asPuppeteerPage(page), opts);
    this.browser = browser;
  }

  private async getAllPages(): Promise<PuppeteerCorePageType[]> {
    return asCorePages(await this.browser.pages());
  }

  /**
   * Get a list of all open tabs in the browser.
   * Uses CDP target ID as stable tab identity.
   */
  async getBrowserTabList(): Promise<TabInfo[]> {
    const pages = await this.getAllPages();
    const currentPageId = getPageId(
      this.underlyingPage as unknown as PuppeteerCorePageType,
    );

    const tabs: TabInfo[] = [];
    for (const page of pages) {
      tabs.push({
        id: getPageId(page),
        title: await page.title().catch(() => ''),
        url: page.url(),
        currentActiveTab: getPageId(page) === currentPageId,
      });
    }
    return tabs;
  }

  /**
   * Switch to a tab by its ID (from getBrowserTabList).
   * Falls back to numeric index for backwards compatibility.
   */
  async switchToTab(tabId: string): Promise<void> {
    const pages = await this.getAllPages();
    let targetPage = pages.find((p) => getPageId(p) === tabId);

    if (!targetPage) {
      // Fall back to treating tabId as a numeric index
      const index = Number.parseInt(tabId, 10);
      if (!Number.isNaN(index) && index >= 0 && index < pages.length) {
        targetPage = pages[index];
      }
    }

    if (!targetPage) {
      throw new Error(`No tab found with id "${tabId}"`);
    }

    await targetPage.bringToFront();
    this.underlyingPage = asPuppeteerPage(targetPage);
    this.resetCachedState();
  }

  /**
   * Open a new tab with the given URL and switch to it.
   */
  async connectNewTabWithUrl(url: string): Promise<void> {
    const newPage = await this.browser.newPage();
    await newPage.goto(url, { waitUntil: 'domcontentloaded' });
    this.underlyingPage = asPuppeteerPage(newPage);
    this.resetCachedState();
  }

  /**
   * Connect to the most recently active web tab.
   * Prefers the last http/https/file page, falls back to the last page.
   */
  async connectCurrentTab(): Promise<void> {
    const pages = await this.getAllPages();
    if (pages.length === 0) {
      throw new Error('No pages found in browser');
    }

    const webPages = pages.filter(isWebPage);
    const activePage =
      webPages.length > 0
        ? webPages[webPages.length - 1]
        : pages[pages.length - 1];

    await activePage.bringToFront();
    this.underlyingPage = asPuppeteerPage(activePage);
    this.resetCachedState();
  }
}
