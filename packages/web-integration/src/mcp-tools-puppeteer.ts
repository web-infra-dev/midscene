import { spawn } from 'node:child_process';
import { existsSync, lstatSync, readlinkSync, unlinkSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScreenshotItem, z } from '@midscene/core';
import { BaseMidsceneTools, type ToolDefinition } from '@midscene/shared/mcp';
import type { Page as PuppeteerPage } from 'puppeteer';
import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';
import { PuppeteerAgent } from './puppeteer';
import { StaticPage } from './static';

const ENDPOINT_FILE = join(tmpdir(), 'midscene-puppeteer-endpoint');
const USER_DATA_DIR = join(tmpdir(), 'midscene-puppeteer-profile');

/**
 * Remove a stale Chrome SingletonLock if the owning process is dead.
 * On Linux, SingletonLock is a symlink whose target is "hostname-pid".
 */
function removeStaleSingletonLock(lockPath: string): void {
  try {
    const stat = lstatSync(lockPath);
    if (!stat.isSymbolicLink()) {
      // Not the expected symlink format, skip
      return;
    }
    const target = readlinkSync(lockPath);
    const match = target.match(/^(.+)-(\d+)$/);
    if (!match) return;

    const [, lockHostname, pidStr] = match;
    if (lockHostname !== hostname()) return; // Lock from a different host

    const pid = Number.parseInt(pidStr, 10);
    try {
      // signal 0 just checks if the process exists
      process.kill(pid, 0);
      // Process is alive — lock is valid, don't remove
    } catch {
      // Process is dead — safe to remove stale lock
      try {
        unlinkSync(lockPath);
      } catch {}
    }
  } catch {
    // Lock doesn't exist or can't be read, nothing to do
  }
}

function getSystemChromePath(): string | undefined {
  const platform = process.platform;

  const chromePaths: Record<string, string[]> = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `C:\\Users\\${process.env.USERNAME ?? process.env.USER}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium',
      '/opt/google/chrome/chrome',
      '/opt/google/chrome/google-chrome',
    ],
  };

  const paths = chromePaths[platform] ?? [];
  return paths.find((p) => existsSync(p));
}

function resolveChromePath(): string {
  const envPath = process.env.MIDSCENE_MCP_CHROME_PATH;
  if (envPath && envPath !== 'auto' && existsSync(envPath)) {
    return envPath;
  }
  const systemPath = getSystemChromePath();
  if (systemPath) return systemPath;

  throw new Error(
    'Chrome not found. Install Google Chrome or set MIDSCENE_MCP_CHROME_PATH environment variable.',
  );
}

/**
 * Persistent Puppeteer browser manager.
 * Launches a detached Chrome and persists the WS endpoint across CLI calls.
 */
const browserManager = {
  activeBrowser: null as Browser | null,

  async getOrLaunch(): Promise<{ browser: Browser; reused: boolean }> {
    if (existsSync(ENDPOINT_FILE)) {
      try {
        const endpoint = (await readFile(ENDPOINT_FILE, 'utf-8')).trim();
        const browser = await puppeteer.connect({
          browserWSEndpoint: endpoint,
          defaultViewport: null,
        });
        return { browser, reused: true };
      } catch {
        try {
          await unlink(ENDPOINT_FILE);
        } catch {}
      }
    }

    const wsEndpoint = await this.launchDetachedChrome();
    await writeFile(ENDPOINT_FILE, wsEndpoint);

    const browser = await puppeteer.connect({
      browserWSEndpoint: wsEndpoint,
      defaultViewport: null,
    });
    return { browser, reused: false };
  },

  async closeBrowser(): Promise<void> {
    if (!existsSync(ENDPOINT_FILE)) return;
    try {
      const endpoint = (await readFile(ENDPOINT_FILE, 'utf-8')).trim();
      const browser = await puppeteer.connect({
        browserWSEndpoint: endpoint,
      });
      await browser.close();
    } catch {}
    try {
      await unlink(ENDPOINT_FILE);
    } catch {}
  },

  disconnect(): void {
    if (this.activeBrowser) {
      this.activeBrowser.disconnect();
      this.activeBrowser = null;
    }
  },

  async launchDetachedChrome(): Promise<string> {
    const chromePath = resolveChromePath();

    // Ensure user-data-dir exists and clean up stale SingletonLock
    await mkdir(USER_DATA_DIR, { recursive: true });
    removeStaleSingletonLock(join(USER_DATA_DIR, 'SingletonLock'));

    const args = [
      '--headless=new',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-background-networking',
      '--password-store=basic',
      '--use-mock-keychain',
      '--window-size=1280,800',
      '--force-color-profile=srgb',
    ];

    // Auto-add --no-sandbox in containerized / CI environments or when running as root
    if (
      process.getuid?.() === 0 ||
      process.env.MIDSCENE_MCP_NO_SANDBOX === '1' ||
      existsSync('/.dockerenv') ||
      process.env.container
    ) {
      args.push('--no-sandbox', '--disable-setuid-sandbox');
    }

    // On Linux, override HOME so Chrome uses our USER_DATA_DIR instead of
    // the default ~/.config/google-chrome/ profile. This avoids SingletonLock
    // conflicts when wrapper scripts (e.g. /usr/bin/google-chrome) ignore
    // the --user-data-dir flag.
    const spawnEnv =
      process.platform === 'linux'
        ? { ...process.env, HOME: USER_DATA_DIR }
        : process.env;

    const proc = spawn(chromePath, args, {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: spawnEnv,
    });
    proc.unref();

    return new Promise<string>((resolve, reject) => {
      let output = '';
      const onData = (data: Buffer) => {
        output += data.toString();
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          proc.stderr!.removeListener('data', onData);
          resolve(match[1]);
        }
      };
      proc.stderr!.on('data', onData);

      proc.on('exit', (code) => {
        proc.stderr!.removeListener('data', onData);
        reject(
          new Error(
            `Chrome exited with code ${code} before DevTools was ready.\nChrome stderr: ${output}\nTip: try setting MIDSCENE_MCP_NO_SANDBOX=1 if running in a container.`,
          ),
        );
      });

      setTimeout(
        () =>
          reject(
            new Error(
              `Chrome launch timeout.\nChrome stderr: ${output}\nTip: try setting MIDSCENE_MCP_NO_SANDBOX=1 if running in a container.`,
            ),
          ),
        15000,
      );
    });
  },
};

/**
 * Tools manager for Web Puppeteer-mode MCP.
 * Uses a persistent headless Chrome browser that survives across CLI calls.
 */
export class WebPuppeteerMidsceneTools extends BaseMidsceneTools<PuppeteerAgent> {
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
      } catch {}
      this.agent = undefined;
    }

    if (this.agent) return this.agent;

    const { browser, reused } = await browserManager.getOrLaunch();
    browserManager.activeBrowser = browser;

    const pages = await browser.pages();
    let page: Page;

    if (navigateToUrl) {
      page = await browser.newPage();
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
    }

    this.agent = new PuppeteerAgent(page as unknown as PuppeteerPage);
    return this.agent;
  }

  public async destroy(): Promise<void> {
    await super.destroy();
    browserManager.disconnect();
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
          browserManager.disconnect();
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
          await browserManager.closeBrowser();
          return this.buildTextResult('Browser closed');
        },
      },
    ];
  }
}
