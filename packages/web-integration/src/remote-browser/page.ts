/**
 * Remote Browser Page
 * Wraps a Puppeteer or Playwright Page connected via CDP to GEM Browser
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
import type { FaaSInstanceManager } from './instance-manager';
import type { BrowserEngine, IRemoteBrowserPage, VncOptions } from './types';
import { CdpConnectionError } from './types';

/**
 * Remote Browser Page implementation
 * Uses CDP to connect to GEM Browser and wraps with Puppeteer/Playwright page
 */
export class RemoteBrowserPage implements IRemoteBrowserPage {
  private sandboxId: string;
  private cdpWsUrl: string;
  private engine: BrowserEngine;
  private instanceManager: FaaSInstanceManager;
  private browser: PuppeteerBrowser | PlaywrightBrowser | null = null;
  private page: PuppeteerPage | PlaywrightPage | null = null;
  private webPage: PuppeteerWebPage | PlaywrightWebPage | null = null;
  private isConnected_ = false;

  constructor(
    sandboxId: string,
    cdpWsUrl: string,
    engine: BrowserEngine,
    instanceManager: FaaSInstanceManager,
  ) {
    this.sandboxId = sandboxId;
    this.cdpWsUrl = cdpWsUrl;
    this.engine = engine;
    this.instanceManager = instanceManager;
  }

  /**
   * Connect to the remote browser via CDP
   */
  async connect(
    opts?: WebPageOpt,
  ): Promise<PuppeteerWebPage | PlaywrightWebPage> {
    if (this.isConnected_) {
      if (!this.webPage) {
        throw new CdpConnectionError('Already connected but webPage is null');
      }
      return this.webPage;
    }

    try {
      if (this.engine === 'puppeteer') {
        await this.connectPuppeteer(opts);
      } else {
        await this.connectPlaywright(opts);
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
  private async connectPuppeteer(opts?: WebPageOpt): Promise<void> {
    // Dynamic import to avoid requiring puppeteer if not used
    const puppeteer = await import('puppeteer');

    // Connect to CDP endpoint
    this.browser = (await puppeteer.connect({
      browserWSEndpoint: this.cdpWsUrl,
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
  private async connectPlaywright(opts?: WebPageOpt): Promise<void> {
    // Dynamic import to avoid requiring playwright if not used
    const { chromium } = await import('playwright');

    // Connect to CDP endpoint
    this.browser = (await chromium.connectOverCDP(
      this.cdpWsUrl,
    )) as PlaywrightBrowser;

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
   * Get the sandbox ID
   */
  getSandboxId(): string {
    return this.sandboxId;
  }

  /**
   * Get the CDP WebSocket URL
   */
  getCdpWsUrl(): string {
    return this.cdpWsUrl;
  }

  /**
   * Get the VNC URL for remote viewing
   */
  getVncUrl(options?: VncOptions): string {
    const autoconnect = options?.autoconnect ?? true;
    let url = this.instanceManager.getVncUrl(this.sandboxId, autoconnect);

    // Add additional query parameters if provided
    if (options?.query && Object.keys(options.query).length > 0) {
      const params = new URLSearchParams(options.query);
      url += (url.includes('?') ? '&' : '?') + params.toString();
    }

    return url;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.isConnected_;
  }

  /**
   * Cleanup and close connections
   */
  async cleanup(): Promise<void> {
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
