import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScreenshotItem } from '@midscene/core';
import {
  extractAgentBehaviorInitArgs,
  getAgentInitArgsSignature,
  shouldRebuildAgentForInitArgs,
} from '@midscene/shared/agent-tools/agent-behavior-init-args';
import {
  BaseMidsceneTools,
  type InitArgSpec,
} from '@midscene/shared/agent-tools/base-tools';
import { resolveChromePath } from '@midscene/shared/agent-tools/chrome-path';
import type { ToolDefinition } from '@midscene/shared/agent-tools/types';
import { getDebug } from '@midscene/shared/logger';
import type { Page as PuppeteerPage } from 'puppeteer';
import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';
import {
  type WebAgentInitArgs,
  adaptWebAgentInitArgs,
  webAgentInitArgShape,
} from './agent-init-args';
import {
  type ViewportSize,
  defaultPuppeteerWindowViewportSize,
  defaultStaticPageViewportSize,
} from './common/viewport';
import { PuppeteerAgent } from './puppeteer';
import { StaticPage } from './static';

const ENDPOINT_FILE = join(tmpdir(), 'midscene-puppeteer-endpoint');
const USER_DATA_DIR = join(tmpdir(), 'midscene-puppeteer-profile');
const TARGET_ID_FILE = join(tmpdir(), 'midscene-puppeteer-target-id');
const DETACHED_CHROME_LAUNCH_TIMEOUT_MS = 30_000;
const DETACHED_CHROME_ENDPOINT_POLL_INTERVAL_MS = 25;
const debug = getDebug('agent-tools:puppeteer');

export const PUPPETEER_ENDPOINT_FILE = ENDPOINT_FILE;

export interface PuppeteerPersistenceOptions {
  endpointFile?: string;
  userDataDir?: string;
  targetIdFile?: string;
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

function getTargetId(page: Page): string | undefined {
  return (page.target() as unknown as { _targetId?: string })._targetId;
}

export function waitForDetachedChromeEndpoint(
  proc: ChildProcess,
  stderrFile: string,
  timeoutMs = DETACHED_CHROME_LAUNCH_TIMEOUT_MS,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let output = '';
    let settled = false;
    let exited = false;
    let pollTimer: NodeJS.Timeout | undefined;
    const cleanup = () => {
      clearTimeout(timeout);
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
      proc.removeListener('exit', onExit);
      proc.removeListener('error', onError);
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
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      exited = true;
      void readFile(stderrFile, 'utf-8')
        .catch(() => output)
        .then((latestOutput) => {
          output = latestOutput;
          rejectOnce(
            new Error(
              `Chrome exited with code ${code ?? signal} before DevTools was ready.\nChrome stderr: ${output}\nTip: if running in a container, launch Chrome with sandbox-compatible arguments.`,
            ),
          );
        });
    };
    const onError = (error: Error) => {
      rejectOnce(
        new Error(`Failed to launch Chrome. Stderr log: "${stderrFile}".`, {
          cause: error,
        }),
        true,
      );
    };
    const pollForEndpoint = async (): Promise<void> => {
      if (settled || exited) return;
      try {
        output = await readFile(stderrFile, 'utf-8');
      } catch (error) {
        rejectOnce(
          new Error(`Failed to read Chrome stderr log "${stderrFile}".`, {
            cause: error,
          }),
          true,
        );
        return;
      }

      if (settled || exited) return;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        resolveOnce(match[1]);
        return;
      }
      pollTimer = setTimeout(
        () => void pollForEndpoint(),
        DETACHED_CHROME_ENDPOINT_POLL_INTERVAL_MS,
      );
    };
    const timeout = setTimeout(
      () =>
        rejectOnce(
          new Error(
            `Chrome launch timeout.\nChrome stderr: ${output}\nTip: if running in a container, launch Chrome with sandbox-compatible arguments.`,
          ),
          true,
        ),
      timeoutMs,
    );

    proc.on('exit', onExit);
    proc.on('error', onError);
    void pollForEndpoint();
  });
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

  private get targetIdFile() {
    return this.persistence.targetIdFile || TARGET_ID_FILE;
  }

  private get chromeStderrFile() {
    return join(this.userDataDir, 'chrome-stderr.log');
  }

  async readSavedTargetId(): Promise<string | null> {
    let content: string;
    try {
      content = await readFile(this.targetIdFile, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new Error(
        `Failed to read Puppeteer targetId from "${this.targetIdFile}".`,
        { cause: error },
      );
    }

    const targetId = content.trim();
    if (!targetId) {
      throw new Error(
        `Puppeteer targetId file "${this.targetIdFile}" is empty.`,
      );
    }
    return targetId;
  }

  async saveTargetId(targetId: string): Promise<void> {
    try {
      await writeFile(this.targetIdFile, targetId, 'utf-8');
      debug('Saved Puppeteer targetId: %s', targetId);
    } catch (error) {
      throw new Error(
        `Failed to save Puppeteer targetId to "${this.targetIdFile}".`,
        { cause: error },
      );
    }
  }

  async cleanupTargetIdFile(): Promise<void> {
    try {
      await unlink(this.targetIdFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new Error(
        `Failed to remove Puppeteer targetId file "${this.targetIdFile}".`,
        { cause: error },
      );
    }
  }

  async cleanupChromeStderrFile(): Promise<void> {
    try {
      await unlink(this.chromeStderrFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        debug('Failed to clean Chrome stderr log: %s', error);
      }
    }
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
      } catch (error) {
        debug('Failed to reuse persisted Puppeteer endpoint: %s', error);
        try {
          await unlink(endpointFile);
        } catch {}
        await this.cleanupTargetIdFile();
      }
    }

    await this.cleanupTargetIdFile();
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
    if (existsSync(endpointFile)) {
      try {
        const endpoint = (await readFile(endpointFile, 'utf-8')).trim();
        const browser = await puppeteer.connect({
          browserWSEndpoint: endpoint,
        });
        await browser.close();
      } catch (error) {
        debug('Failed to close persisted Puppeteer browser: %s', error);
      }
    }
    try {
      if (existsSync(endpointFile)) {
        await unlink(endpointFile);
      }
    } catch {}
    await this.cleanupTargetIdFile();
    await this.cleanupChromeStderrFile();
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

    const stderrFile = this.chromeStderrFile;
    const stderrHandle = await open(stderrFile, 'w');
    let proc: ChildProcess;
    try {
      proc = spawn(chromePath, args, {
        detached: true,
        stdio: ['ignore', 'ignore', stderrHandle.fd],
      });
    } catch (error) {
      await stderrHandle.close();
      throw error;
    }
    const endpointPromise = waitForDetachedChromeEndpoint(proc, stderrFile);
    proc.unref();
    try {
      await stderrHandle.close();
    } catch (error) {
      terminateDetachedChrome(proc);
      await endpointPromise.catch(() => undefined);
      throw new Error(`Failed to close Chrome stderr log "${stderrFile}".`, {
        cause: error,
      });
    }

    return endpointPromise;
  }
}

const defaultBrowserManager = new PuppeteerBrowserManager();

/**
 * Tools manager for Web Puppeteer mode.
 * Uses a persistent headless Chrome browser that survives across CLI calls.
 */
export class WebPuppeteerMidsceneTools extends BaseMidsceneTools<
  PuppeteerAgent,
  WebAgentInitArgs
> {
  private readonly viewport?: ViewportSize;
  private readonly browserManager: PuppeteerBrowserManager;
  private lastInitArgsSignature?: string;

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

  protected readonly initArgSpec: InitArgSpec<WebAgentInitArgs> = {
    namespace: 'web',
    shape: webAgentInitArgShape,
    cli: {
      preferBareKeys: true,
    },
    adapt: adaptWebAgentInitArgs,
  };

  protected createTemporaryDevice() {
    return new StaticPage({
      screenshot: ScreenshotItem.create('', Date.now()),
      shotSize: this.viewport ?? defaultStaticPageViewportSize,
      shrunkShotToLogicalRatio: 1,
    });
  }

  protected async ensureAgent(
    initArgs?: WebAgentInitArgs,
  ): Promise<PuppeteerAgent> {
    const navigateToUrl = initArgs?.url;
    const nextSignature = getAgentInitArgsSignature(initArgs);
    const shouldOpenUrl = typeof navigateToUrl === 'string';

    if (
      this.agent &&
      (shouldOpenUrl ||
        shouldRebuildAgentForInitArgs(
          this.lastInitArgsSignature,
          nextSignature,
        ))
    ) {
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
      const savedTargetId = await this.browserManager.readSavedTargetId();
      const matchedPage = savedTargetId
        ? pages.find((candidate) => getTargetId(candidate) === savedTargetId)
        : undefined;
      const webPages = pages.filter((p) => /^https?:\/\//.test(p.url()));
      page =
        matchedPage ??
        (webPages.length > 0
          ? webPages[webPages.length - 1]
          : pages[pages.length - 1] || (await browser.newPage()));

      if (reused) {
        await page.bringToFront();
      }
      if (this.viewport) {
        await page.setViewport(this.viewport);
      }
    }

    const targetId = getTargetId(page);
    if (!targetId) {
      throw new Error(
        'Failed to persist Puppeteer page session because Puppeteer did not expose a Chrome targetId.',
      );
    }
    await this.browserManager.saveTargetId(targetId);

    const reportOptions = this.readCliReportAgentOptions();
    this.agent = new PuppeteerAgent(page as unknown as PuppeteerPage, {
      ...(extractAgentBehaviorInitArgs(initArgs) ?? {}),
      ...(reportOptions ?? {}),
    });
    this.lastInitArgsSignature = nextSignature;
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
        schema: this.getAgentInitArgSchema(),
        cli: this.getAgentInitArgCliMetadata(),
        handler: async (args) => {
          const initArgs = this.extractAgentInitParam(args);
          const url = initArgs?.url;

          // Explicit connect always starts a fresh page session.
          if (this.agent) {
            try {
              await this.agent.destroy?.();
            } catch {}
            this.agent = undefined;
            this.lastInitArgsSignature = undefined;
          }

          const reportSession = this.createNewCliReportSession(
            url ?? 'current-page',
          );
          this.commitCliReportSession(reportSession);
          this.agent = await this.ensureAgent(initArgs);

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
            this.lastInitArgsSignature = undefined;
          }
          this.browserManager.disconnect();
          await this.browserManager.cleanupTargetIdFile();
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
            this.lastInitArgsSignature = undefined;
          }
          await this.browserManager.closeBrowser();
          return this.buildTextResult('Browser closed');
        },
      },
    ];
  }
}
