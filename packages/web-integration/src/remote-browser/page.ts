/**
 * Remote Browser Page
 * Wraps a Puppeteer or Playwright Page connected via CDP (Chrome DevTools Protocol)
 */

import type {
  Browser as PlaywrightBrowser,
  Page as PlaywrightPage,
} from 'playwright';
import type {
  Browser as PuppeteerBrowser,
  Page as PuppeteerPage,
} from 'puppeteer';
import { WebPage as PlaywrightWebPage } from '../playwright/page';
import { PuppeteerWebPage } from '../puppeteer/page';
import type { WebPageOpt } from '../web-element';
import type { BrowserEngine } from './types';
import { CdpConnectionError } from './types';

/**
 * Remote Browser Page implementation
 * Connects to any CDP-compatible browser via WebSocket URL
 */
export class RemoteBrowserPage {
  private cdpWsUrl: string;
  private engine: BrowserEngine;
  private browser: PuppeteerBrowser | PlaywrightBrowser | null = null;
  private page: PuppeteerPage | PlaywrightPage | null = null;
  private webPage: PuppeteerWebPage | PlaywrightWebPage | null = null;
  private isConnected_ = false;

  constructor(cdpWsUrl: string, engine: BrowserEngine) {
    this.cdpWsUrl = cdpWsUrl;
    this.engine = engine;
  }

  /**
   * Connect to the remote browser via CDP
   */
  async connect(options?: {
    connectionTimeout?: number;
    webPageOpts?: WebPageOpt;
  }): Promise<PuppeteerWebPage | PlaywrightWebPage> {
    if (this.isConnected_) {
      if (!this.webPage) {
        throw new CdpConnectionError('Already connected but webPage is null');
      }
      return this.webPage;
    }

    try {
      if (this.engine === 'puppeteer') {
        await this.connectPuppeteer(
          options?.connectionTimeout,
          options?.webPageOpts,
        );
      } else {
        await this.connectPlaywright(
          options?.connectionTimeout,
          options?.webPageOpts,
        );
      }

      this.isConnected_ = true;
      return this.webPage!;
    } catch (error: any) {
      throw new CdpConnectionError(
        `Failed to connect to remote browser: ${error.message}`,
        'CDP_CONNECTION_FAILED',
        error,
      );
    }
  }

  /**
   * Connect using Puppeteer
   */
  private async connectPuppeteer(
    connectionTimeout?: number,
    opts?: WebPageOpt,
  ): Promise<void> {
    // Dynamic import to avoid requiring puppeteer if not used
    const puppeteer = await import('puppeteer');

    // Connect to CDP endpoint
    this.browser = (await puppeteer.connect({
      browserWSEndpoint: this.cdpWsUrl,
      ...(connectionTimeout ? { timeout: connectionTimeout } : {}),
    })) as PuppeteerBrowser;

    // Get the default context and first page
    const pages = await this.browser.pages();
    if (pages.length === 0) {
      // Create a new page if none exists
      this.page = (await this.browser.newPage()) as PuppeteerPage;
    } else {
      // Use the first existing page
      this.page = pages[0] as PuppeteerPage;
    }

    // Wrap with PuppeteerWebPage
    this.webPage = new PuppeteerWebPage(this.page, opts);
  }

  /**
   * Connect using Playwright
   */
  private async connectPlaywright(
    connectionTimeout?: number,
    opts?: WebPageOpt,
  ): Promise<void> {
    // Dynamic import to avoid requiring playwright if not used
    const { chromium } = await import('playwright');

    // Connect to CDP endpoint
    this.browser = (await chromium.connectOverCDP(this.cdpWsUrl, {
      ...(connectionTimeout ? { timeout: connectionTimeout } : {}),
    })) as PlaywrightBrowser;

    // Get the default context
    const contexts = this.browser.contexts();
    if (contexts.length === 0) {
      throw new CdpConnectionError(
        'No browser context found after connecting',
        'NO_CONTEXT',
      );
    }

    const context = contexts[0];
    const pages = context.pages();

    if (pages.length === 0) {
      // Create a new page if none exists
      this.page = (await context.newPage()) as PlaywrightPage;
    } else {
      // Use the first existing page
      this.page = pages[0] as PlaywrightPage;
    }

    // Wrap with PlaywrightWebPage
    this.webPage = new PlaywrightWebPage(this.page, opts);
  }

  /**
   * Get the wrapped web page
   */
  getWebPage(): PuppeteerWebPage | PlaywrightWebPage {
    if (!this.webPage) {
      throw new CdpConnectionError('Not connected. Call connect() first.');
    }
    return this.webPage;
  }

  /**
   * Get the underlying browser instance
   */
  getBrowser(): PuppeteerBrowser | PlaywrightBrowser {
    if (!this.browser) {
      throw new CdpConnectionError('Not connected. Call connect() first.');
    }
    return this.browser;
  }

  /**
   * Get the underlying page instance
   */
  getPage(): PuppeteerPage | PlaywrightPage {
    if (!this.page) {
      throw new CdpConnectionError('Not connected. Call connect() first.');
    }
    return this.page;
  }

  /**
   * Get the CDP WebSocket URL
   */
  getCdpWsUrl(): string {
    return this.cdpWsUrl;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.isConnected_;
  }

  /**
   * Destroy and close connections
   * Called by Agent.destroy() through WebPage.destroy()
   */
  async destroy(): Promise<void> {
    if (this.browser) {
      try {
        if (this.engine === 'puppeteer') {
          await (this.browser as PuppeteerBrowser).disconnect();
        } else {
          await (this.browser as PlaywrightBrowser).close();
        }
      } catch (error) {
        console.warn('Error closing browser connection:', error);
      }
      this.browser = null;
    }

    this.page = null;
    this.webPage = null;
    this.isConnected_ = false;
  }
}
