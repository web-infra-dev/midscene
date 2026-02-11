import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { agentFromAdbDevice } from '@midscene/android';
import { agentFromComputer } from '@midscene/computer';
import { agentFromWebDriverAgent } from '@midscene/ios';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { loadEnv } from './cli-utils';

export const VALID_PLATFORMS = ['computer', 'web', 'android', 'ios'] as const;
export type Platform = (typeof VALID_PLATFORMS)[number];

type Command =
  | 'act'
  | 'query'
  | 'assert'
  | 'screenshot'
  | 'navigate'
  | 'close'
  | 'connect';

interface CommandOptions {
  bridge?: boolean;
  url?: string;
  device?: string;
  display?: string;
}

interface SkillResult {
  success: boolean;
  message?: string;
  result?: unknown;
  screenshot?: string;
  error?: string;
}

// --- Puppeteer Browser Manager ---

const puppeteerBrowserManager = {
  endpointFile: join(tmpdir(), 'midscene-puppeteer-endpoint'),
  activeBrowser: null as Browser | null,

  async getOrLaunch(): Promise<{ browser: Browser; reused: boolean }> {
    if (existsSync(this.endpointFile)) {
      try {
        const endpoint = (await readFile(this.endpointFile, 'utf-8')).trim();
        const browser = await puppeteer.connect({
          browserWSEndpoint: endpoint,
          defaultViewport: null,
        });
        return { browser, reused: true };
      } catch {
        // Stale endpoint file — remove and launch fresh
        try { await unlink(this.endpointFile); } catch {}
      }
    }

    const wsEndpoint = await this.launchDetachedChrome();
    await writeFile(this.endpointFile, wsEndpoint);

    const browser = await puppeteer.connect({
      browserWSEndpoint: wsEndpoint,
      defaultViewport: null,
    });
    return { browser, reused: false };
  },

  async closeBrowser(): Promise<void> {
    if (!existsSync(this.endpointFile)) return;
    try {
      const endpoint = (await readFile(this.endpointFile, 'utf-8')).trim();
      const browser = await puppeteer.connect({ browserWSEndpoint: endpoint });
      await browser.close();
    } catch {}
    try { await unlink(this.endpointFile); } catch {}
  },

  disconnect(): void {
    if (this.activeBrowser) {
      this.activeBrowser.disconnect();
      this.activeBrowser = null;
    }
  },

  async launchDetachedChrome(): Promise<string> {
    const chromePath = puppeteer.executablePath();
    const args = [
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

    const proc = spawn(chromePath, args, {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
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
      setTimeout(() => reject(new Error('Chrome launch timeout')), 15000);
    });
  },
};

// --- Screenshot Helpers ---

async function saveScreenshot(base64: string): Promise<string> {
  const dir = join(tmpdir(), 'midscene-screenshots');
  await mkdir(dir, { recursive: true });
  const filename = `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const filepath = join(dir, filename);

  const raw = base64.replace(/^data:image\/\w+;base64,/, '');
  await writeFile(filepath, Buffer.from(raw, 'base64'));
  return filepath;
}

async function captureScreenshot(agent: { page?: { screenshotBase64?: () => Promise<string> } }): Promise<string | undefined> {
  const base64 = await agent.page?.screenshotBase64?.();
  return base64 ? saveScreenshot(base64) : undefined;
}

// --- Platform Agent Factory ---

async function createPlatformAgent(platform: Platform, opts: CommandOptions) {
  switch (platform) {
    case 'computer': {
      return agentFromComputer(
        opts.display ? { displayId: opts.display } : undefined,
      );
    }
    case 'web': {
      if (opts.bridge) {
        const agent = new AgentOverChromeBridge({ closeConflictServer: true });
        if (opts.url) {
          await agent.connectNewTabWithUrl(opts.url);
        } else {
          await agent.connectCurrentTab();
        }
        return agent;
      }

      const { browser, reused } = await puppeteerBrowserManager.getOrLaunch();
      puppeteerBrowserManager.activeBrowser = browser;
      const pages = await browser.pages();
      let page: Page;

      if (opts.url) {
        page = await browser.newPage();
        await page.goto(opts.url, { timeout: 30000, waitUntil: 'domcontentloaded' });
      } else {
        const webPages = pages.filter((p) => /^https?:\/\//.test(p.url()));
        page =
          webPages.length > 0
            ? webPages[webPages.length - 1]
            : pages[pages.length - 1] || (await browser.newPage());

        if (reused) {
          await page.bringToFront();
        }
      }

      return new PuppeteerAgent(page);
    }
    case 'android': {
      return agentFromAdbDevice(opts.device);
    }
    case 'ios': {
      return agentFromWebDriverAgent();
    }
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

// --- Command Handler ---

async function handleCommand(
  platform: Platform,
  command: Command,
  args: string | undefined,
  opts: CommandOptions,
): Promise<SkillResult> {
  const agentOpts = {
    ...opts,
    url: command === 'navigate' ? args : opts.url,
  };

  // Puppeteer close: reconnect to existing browser and shut it down
  if (platform === 'web' && !opts.bridge && command === 'close') {
    await puppeteerBrowserManager.closeBrowser();
    return { success: true, message: 'Browser closed' };
  }

  const agent = await createPlatformAgent(platform, agentOpts);

  try {
    switch (command) {
      case 'act': {
        if (!args) throw new Error('act command requires an action description');
        await agent.aiAction(args);
        return {
          success: true,
          message: `Action performed: ${args}`,
          screenshot: await captureScreenshot(agent),
        };
      }

      case 'query': {
        if (!args) throw new Error('query command requires a query string');
        const result = await agent.aiQuery(args);
        return {
          success: true,
          result,
          message: `Query completed: ${args}`,
          screenshot: await captureScreenshot(agent),
        };
      }

      case 'assert': {
        if (!args) throw new Error('assert command requires a condition');
        try {
          await agent.aiAssert(args);
          return { success: true, message: `Assertion passed: ${args}` };
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          return {
            success: false,
            message: `Assertion failed: ${args}`,
            error: message,
          };
        }
      }

      case 'screenshot': {
        const screenshotPath = await captureScreenshot(agent);
        if (!screenshotPath) {
          return { success: false, error: 'Screenshot not available' };
        }
        return {
          success: true,
          message: 'Screenshot captured',
          screenshot: screenshotPath,
        };
      }

      case 'navigate': {
        return {
          success: true,
          message: `Navigated to: ${args}`,
          screenshot: await captureScreenshot(agent),
        };
      }

      case 'close': {
        await agent.destroy();
        return { success: true, message: 'Agent destroyed' };
      }

      case 'connect': {
        return {
          success: true,
          message: `Connected to ${platform}`,
          screenshot: await captureScreenshot(agent),
        };
      }

      default:
        throw new Error(`Unknown command: ${command} for platform: ${platform}`);
    }
  } finally {
    if (command !== 'close') {
      const keepBrowserAlive = platform === 'web' && !opts.bridge;
      if (keepBrowserAlive) {
        puppeteerBrowserManager.disconnect();
      } else {
        try { await agent.destroy(); } catch {}
      }
    }
  }
}

// --- CLI Entry ---

function printUsage() {
  console.log(`
Usage: midscene <platform> <command> [args] [options]

Platforms:
  computer    Desktop automation (macOS)
  web         Browser automation (Puppeteer or Bridge mode)
  android     Android device automation
  ios         iOS device automation

Commands:
  act "<action>"       Perform an action described in natural language
  query "<query>"      Extract information from current screen/page
  assert "<condition>" Verify a condition on current screen/page
  screenshot           Capture screenshot
  navigate "<url>"     Navigate to URL (web only)
  close                Close/destroy the agent
  connect              Connect to device/browser

Options:
  --bridge             Use Chrome Bridge mode instead of Puppeteer (web only)
  --url <url>          Specify URL for web commands (web only, Puppeteer mode)
  --device <id>        Specify device ID (android only)
  --display <id>       Specify display ID (computer only)

Examples:
  midscene computer screenshot
  midscene computer act "press Cmd+Space to open Spotlight"
  midscene web navigate "https://example.com"
  midscene web navigate "https://example.com" --bridge
  midscene web act "click the login button" --url "https://example.com"
  midscene web query "what is the page title?" --url "https://example.com"
  midscene android screenshot
  midscene ios act "tap the search field"
`);
}

function printResult(result: SkillResult) {
  console.log(JSON.stringify(result, null, 2));
}

function parsePlatformArgs(argv: string[]): { args: string | undefined; opts: CommandOptions } {
  const { values, positionals } = parseArgs({
    args: argv.slice(2),
    options: {
      bridge: { type: 'boolean', default: false },
      url: { type: 'string' },
      device: { type: 'string' },
      display: { type: 'string' },
    },
    allowPositionals: true,
  });
  return {
    args: positionals[0],
    opts: {
      bridge: values.bridge,
      url: values.url,
      device: values.device,
      display: values.display,
    },
  };
}

export async function runPlatformCli(argv: string[]) {
  const platform = argv[0] as Platform;
  const command = argv[1] as Command;

  if (!platform || !command) {
    printUsage();
    process.exit(1);
  }

  if (!VALID_PLATFORMS.includes(platform)) {
    console.error(`Invalid platform: ${platform}`);
    printUsage();
    process.exit(1);
  }

  const { args, opts } = parsePlatformArgs(argv);

  loadEnv();

  try {
    const result = await handleCommand(platform, command, args, opts);
    printResult(result);
    if (!result.success) {
      process.exit(1);
    }
    process.exit(0);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    printResult({
      success: false,
      error: message,
    });
    process.exit(1);
  }
}
