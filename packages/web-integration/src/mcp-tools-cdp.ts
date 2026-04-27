import { ScreenshotItem, z } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import { BaseMidsceneTools } from '@midscene/shared/mcp/base-tools';
import type { ToolDefinition } from '@midscene/shared/mcp/types';
import type { Page as PuppeteerPage } from 'puppeteer';
import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';
import { getProxyEndpoint } from './cdp-proxy-manager';
import {
  cleanupTargetIdFile,
  readSavedTargetId,
  saveTargetId,
} from './cdp-target-store';
import { PuppeteerAgent } from './puppeteer';
import { StaticPage } from './static';

const debug = getDebug('mcp:cdp');

/** CDP target discovery may need a brief moment after WebSocket open. */
const CDP_TARGET_DISCOVERY_DELAY_MS = 500;

/**
 * puppeteer-core does not expose a public method for the underlying CDP
 * target id, so we reach into `_targetId`. Centralised here so a future
 * puppeteer release exposing this properly only requires one change.
 * Callers must treat the result as optional.
 */
function getTargetId(page: Page): string | undefined {
  return (page.target() as unknown as { _targetId?: string })._targetId;
}

/**
 * Tools manager for Web CDP-mode MCP.
 * Connects to an existing Chrome browser via CDP (Chrome DevTools Protocol) endpoint.
 * Unlike WebPuppeteerMidsceneTools which launches its own Chrome, this connects
 * to a browser that is already running with remote debugging enabled.
 *
 * Uses a persistent WebSocket proxy to avoid repeated Chrome permission popups
 * when Chrome's settings-based remote debugging is used.
 */
export class WebCdpMidsceneTools extends BaseMidsceneTools<PuppeteerAgent> {
  protected getCliReportSessionName() {
    return 'midscene-web';
  }
  private cdpEndpoint: string;
  private activeBrowser: Browser | null = null;

  constructor(cdpEndpoint: string) {
    super();
    this.cdpEndpoint = cdpEndpoint;
  }

  protected createTemporaryDevice() {
    return new StaticPage({
      screenshot: ScreenshotItem.create('', Date.now()),
      shotSize: { width: 1920, height: 1080 },
      shrunkShotToLogicalRatio: 1,
    });
  }

  protected async ensureAgent(navigateToUrl?: string): Promise<PuppeteerAgent> {
    // Re-init if URL provided
    if (this.agent && navigateToUrl) {
      try {
        await this.agent?.destroy?.();
      } catch (error) {
        console.debug('Failed to destroy agent during re-init:', error);
      }
      this.agent = undefined;
    }

    if (this.agent) return this.agent;

    // Connect via proxy to avoid repeated Chrome permission popups
    if (!this.activeBrowser) {
      const endpoint = await getProxyEndpoint(this.cdpEndpoint);
      this.activeBrowser = await puppeteer.connect({
        browserWSEndpoint: endpoint,
        defaultViewport: null,
      });
    }

    const browser = this.activeBrowser;
    let pages = await browser.pages();

    // If no pages discovered, wait briefly and retry — some CDP targets
    // need a moment to appear after the WebSocket connection is established.
    if (pages.length === 0) {
      await new Promise((r) => setTimeout(r, CDP_TARGET_DISCOVERY_DELAY_MS));
      pages = await browser.pages();
    }

    const webPages = pages.filter((p) => /^https?:\/\//.test(p.url()));
    debug(
      'Found %d page(s), %d web page(s): %o',
      pages.length,
      webPages.length,
      pages.map((p) => p.url()),
    );
    let page: Page;

    if (navigateToUrl) {
      if (webPages.length > 0) {
        // Reuse an existing page and navigate it — avoids creating invisible
        // tabs when Chrome uses settings-based remote debugging (no HTTP
        // discovery endpoints, /devtools/page/* returns 403).
        page = webPages[webPages.length - 1];
        await page.bringToFront();
        await page.goto(navigateToUrl, {
          timeout: 30000,
          waitUntil: 'domcontentloaded',
        });
      } else {
        // No existing web pages — fall back to creating a new tab
        page = await browser.newPage();
        await page.goto(navigateToUrl, {
          timeout: 30000,
          waitUntil: 'domcontentloaded',
        });
      }
    } else {
      // Try to find the exact tab from a previous `connect` command via saved targetId.
      const savedTargetId = readSavedTargetId();
      let matchedPage: Page | undefined;

      if (savedTargetId && pages.length > 0) {
        matchedPage = pages.find((p) => getTargetId(p) === savedTargetId);
        if (matchedPage) {
          debug('Matched saved targetId %s', savedTargetId);
        } else {
          debug(
            'Saved targetId %s not found among %d pages, falling back',
            savedTargetId,
            pages.length,
          );
        }
      }

      if (matchedPage) {
        page = matchedPage;
      } else if (webPages.length > 0) {
        page = webPages[webPages.length - 1];
      } else if (pages.length > 0) {
        page = pages[pages.length - 1];
      } else {
        page = await browser.newPage();
      }

      await page.bringToFront();
    }

    // Persist the targetId so subsequent CLI commands can find this exact tab
    const targetId = getTargetId(page);
    if (targetId) {
      saveTargetId(targetId);
    } else {
      // If puppeteer ever drops the private _targetId field, this branch
      // makes the regression visible instead of silently disabling the
      // cross-command tab reuse path.
      debug(
        'No targetId on page.target(); cross-command tab reuse disabled until puppeteer integration is updated.',
      );
    }

    const reportFileName = this.readCliReportFileName();
    this.agent = new PuppeteerAgent(page as unknown as PuppeteerPage, {
      ...(reportFileName ? { reportFileName } : {}),
    });
    return this.agent;
  }

  public async destroy(): Promise<void> {
    await super.destroy();
    if (this.activeBrowser) {
      this.activeBrowser.disconnect();
      this.activeBrowser = null;
    }
  }

  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'web_connect',
        description:
          'Connect to a web page via CDP. Opens a new tab with the given URL, or reuses the current page.',
        schema: {
          url: z
            .string()
            .url()
            .optional()
            .describe('URL to open in new tab (omit to use current page)'),
        },
        handler: async (args) => {
          const { url } = args as { url?: string };

          // Destroy existing agent
          if (this.agent) {
            try {
              await this.agent.destroy?.();
            } catch (e) {
              console.debug('Failed to destroy agent during connect:', e);
            }
            this.agent = undefined;
          }

          const reportSession = this.createNewCliReportSession(
            url ?? 'current-page',
          );
          this.commitCliReportSession(reportSession);
          this.agent = await this.ensureAgent(url);

          const screenshot = await this.agent.page?.screenshotBase64();
          const label = url ?? 'current page';

          return {
            content: [
              { type: 'text', text: `Connected via CDP to: ${label}` },
              ...(screenshot ? this.buildScreenshotContent(screenshot) : []),
            ],
          };
        },
      },
      {
        name: 'web_disconnect',
        description:
          'Disconnect from current web page. The browser stays running (managed externally).',
        schema: {},
        handler: async () => {
          if (this.agent) {
            try {
              await this.agent.destroy?.();
            } catch (e) {
              console.debug('Failed to destroy agent during disconnect:', e);
            }
            this.agent = undefined;
          }
          if (this.activeBrowser) {
            this.activeBrowser.disconnect();
            this.activeBrowser = null;
          }
          cleanupTargetIdFile();
          return this.buildTextResult(
            'Disconnected from web page (browser still running externally)',
          );
        },
      },
    ];
  }
}
