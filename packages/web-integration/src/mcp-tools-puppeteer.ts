import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScreenshotItem, z } from '@midscene/core';
import { BaseMidsceneTools } from '@midscene/shared/mcp/base-tools';
import { resolveChromePath } from '@midscene/shared/mcp/chrome-path';
import type { ToolDefinition } from '@midscene/shared/mcp/types';
import type { Page as PuppeteerPage } from 'puppeteer';
import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';
import {
  type ViewportSize,
  defaultPuppeteerWindowViewportSize,
  defaultStaticPageViewportSize,
} from './common/viewport';
import { PuppeteerAgent } from './puppeteer';
import { StaticPage } from './static';

const ENDPOINT_FILE = join(tmpdir(), 'midscene-puppeteer-endpoint');
const USER_DATA_DIR = join(tmpdir(), 'midscene-puppeteer-profile');
const DETACHED_CHROME_LAUNCH_TIMEOUT_MS = 30_000;

export const PUPPETEER_ENDPOINT_FILE = ENDPOINT_FILE;

export interface PuppeteerPersistenceOptions {
  endpointFile?: string;
  userDataDir?: string;
}

export interface WebPuppeteerMidsceneToolsOptions {
  persistence?: PuppeteerPersistenceOptions;
}

export function buildDetachedChromeArgs(options: {
  userDataDir: string;
  viewport?: ViewportSize;
}): string[] {
  const viewport = options.viewport ?? defaultPuppeteerWindowViewportSize;

  return [
    '--headless=new',
    `--user-data-dir=${options.userDataDir}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-background-networking',
    '--password-store=basic',
    '--use-mock-keychain',
    `--window-size=${viewport.width},${viewport.height}`,
    '--force-color-profile=srgb',
  ];
}

function terminateDetachedChrome(proc: ChildProcess): void {
  if (proc.killed || proc.exitCode !== null || proc.signalCode !== null) {
    return;
  }

  if (process.platform !== 'win32' && proc.pid) {
    try {
      process.kill(-proc.pid, 'SIGKILL');
      return;
    } catch {}
  }

  try {
    proc.kill('SIGKILL');
  } catch {}
}

/**
 * Persistent Puppeteer browser manager.
 * Launches a detached Chrome and persists the WS endpoint across CLI calls.
 */
class PuppeteerBrowserManager {
  activeBrowser: Browser | null = null;

  constructor(private readonly persistence: PuppeteerPersistenceOptions = {}) {}

  private get endpointFile() {
    return this.persistence.endpointFile || ENDPOINT_FILE;
  }

  private get userDataDir() {
    return this.persistence.userDataDir || USER_DATA_DIR;
  }

  async getOrLaunch(
    viewport?: ViewportSize,
  ): Promise<{ browser: Browser; reused: boolean }> {
    const endpointFile = this.endpointFile;
    if (existsSync(endpointFile)) {
      try {
        const endpoint = (await readFile(endpointFile, 'utf-8')).trim();
        const browser = await puppeteer.connect({
          browserWSEndpoint: endpoint,
          defaultViewport: null,
        });
        return { browser, reused: true };
      } catch {
        try {
          await unlink(endpointFile);
        } catch {}
      }
    }

    const wsEndpoint = await this.launchDetachedChrome(viewport);
    await writeFile(endpointFile, wsEndpoint);

    const browser = await puppeteer.connect({
      browserWSEndpoint: wsEndpoint,
      defaultViewport: null,
    });
    return { browser, reused: false };
  }

  async closeBrowser(): Promise<void> {
    const endpointFile = this.endpointFile;
    if (!existsSync(endpointFile)) return;
    try {
      const endpoint = (await readFile(endpointFile, 'utf-8')).trim();
      const browser = await puppeteer.connect({
        browserWSEndpoint: endpoint,
      });
      await browser.close();
    } catch {}
    try {
      await unlink(endpointFile);
    } catch {}
  }

  disconnect(): void {
    if (this.activeBrowser) {
      this.activeBrowser.disconnect();
      this.activeBrowser = null;
    }
  }

  async launchDetachedChrome(viewport?: ViewportSize): Promise<string> {
    const chromePath = resolveChromePath();
    const userDataDir = this.userDataDir;

    await mkdir(userDataDir, { recursive: true });

    const args = buildDetachedChromeArgs({
      userDataDir,
      viewport,
    });

    const proc = spawn(chromePath, args, {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    proc.unref();

    return new Promise<string>((resolve, reject) => {
      let output = '';
      let settled = false;
      const cleanup = () => {
        clearTimeout(timeout);
        proc.stderr!.removeListener('data', onData);
        proc.removeListener('exit', onExit);
      };
      const resolveOnce = (value: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const rejectOnce = (error: Error, terminate = false) => {
        if (settled) return;
        settled = true;
        if (terminate) {
          terminateDetachedChrome(proc);
        }
        cleanup();
        reject(error);
      };
      const onData = (data: Buffer) => {
        output += data.toString();
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          resolveOnce(match[1]);
        }
      };
      proc.stderr!.on('data', onData);

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        rejectOnce(
          new Error(
            `Chrome exited with code ${code ?? signal} before DevTools was ready.\nChrome stderr: ${output}\nTip: try setting MIDSCENE_MCP_NO_SANDBOX=1 if running in a container.`,
          ),
        );
      };
      proc.on('exit', onExit);

      const timeout = setTimeout(
        () =>
          rejectOnce(
            new Error(
              `Chrome launch timeout.\nChrome stderr: ${output}\nTip: try setting MIDSCENE_MCP_NO_SANDBOX=1 if running in a container.`,
            ),
            true,
          ),
        DETACHED_CHROME_LAUNCH_TIMEOUT_MS,
      );
    });
  }
}

const defaultBrowserManager = new PuppeteerBrowserManager();

/**
 * Tools manager for Web Puppeteer-mode MCP.
 * Uses a persistent headless Chrome browser that survives across CLI calls.
 */
export class WebPuppeteerMidsceneTools extends BaseMidsceneTools<PuppeteerAgent> {
  private readonly viewport?: ViewportSize;
  private readonly browserManager: PuppeteerBrowserManager;

  constructor(
    viewport?: ViewportSize,
    options: WebPuppeteerMidsceneToolsOptions = {},
  ) {
    super();
    this.viewport = viewport ? { ...viewport } : undefined;
    this.browserManager = options.persistence
      ? new PuppeteerBrowserManager(options.persistence)
      : defaultBrowserManager;
  }

  protected getCliReportSessionName() {
    return 'midscene-web';
  }

  protected createTemporaryDevice() {
    return new StaticPage({
      screenshot: ScreenshotItem.create('', Date.now()),
      shotSize: this.viewport ?? defaultStaticPageViewportSize,
      shrunkShotToLogicalRatio: 1,
    });
  }

  protected async ensureAgent(navigateToUrl?: string): Promise<PuppeteerAgent> {
    // Re-init if URL provided
    if (this.agent && navigateToUrl) {
      try {
        await this.agent?.destroy?.();
      } catch {}
      this.agent = undefined;
    }

    if (this.agent) return this.agent;

    const { browser, reused } = await this.browserManager.getOrLaunch(
      this.viewport,
    );
    this.browserManager.activeBrowser = browser;

    const pages = await browser.pages();
    let page: Page;

    if (navigateToUrl) {
      page = await browser.newPage();
      if (this.viewport) {
        await page.setViewport(this.viewport);
      }
      await page.goto(navigateToUrl, {
        timeout: 30000,
        waitUntil: 'domcontentloaded',
      });
    } else {
      // Reuse the last web page
      const webPages = pages.filter((p) => /^https?:\/\//.test(p.url()));
      page =
        webPages.length > 0
          ? webPages[webPages.length - 1]
          : pages[pages.length - 1] || (await browser.newPage());

      if (reused) {
        await page.bringToFront();
      }
      if (this.viewport) {
        await page.setViewport(this.viewport);
      }
    }

    const reportOptions = this.readCliReportAgentOptions();
    this.agent = new PuppeteerAgent(page as unknown as PuppeteerPage, {
      ...(reportOptions ?? {}),
    });
    return this.agent;
  }

  public async destroy(): Promise<void> {
    await super.destroy();
    this.browserManager.disconnect();
  }

  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'web_connect',
        description:
          'Connect to a web page. Opens a new tab with the given URL, or reuses the current page.',
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
            } catch {}
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
              { type: 'text', text: `Connected to: ${label}` },
              ...(screenshot ? this.buildScreenshotContent(screenshot) : []),
            ],
          };
        },
      },
      {
        name: 'web_disconnect',
        description:
          'Disconnect from current web page. The browser stays running for future calls.',
        schema: {},
        handler: async () => {
          if (this.agent) {
            try {
              await this.agent.destroy?.();
            } catch {}
            this.agent = undefined;
          }
          this.browserManager.disconnect();
          return this.buildTextResult(
            'Disconnected from web page (browser still running)',
          );
        },
      },
      {
        name: 'web_close',
        description: 'Close the browser completely and release all resources.',
        schema: {},
        handler: async () => {
          if (this.agent) {
            try {
              await this.agent.destroy?.();
            } catch {}
            this.agent = undefined;
          }
          await this.browserManager.closeBrowser();
          return this.buildTextResult('Browser closed');
        },
      },
    ];
  }
}
