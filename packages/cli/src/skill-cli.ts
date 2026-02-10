import { existsSync } from 'node:fs';
import { writeFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { agentFromComputer } from '@midscene/computer';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import { agentFromAdbDevice } from '@midscene/android';
import { agentFromWebDriverAgent } from '@midscene/ios';

const PUPPETEER_ENDPOINT_FILE = join(
  tmpdir(),
  'midscene-puppeteer-endpoint',
);

// Module-level reference for browser disconnect in cleanup
let _puppeteerBrowser: Browser | null = null;

type Platform = 'computer' | 'web' | 'android' | 'ios';
type Command =
  | 'act'
  | 'query'
  | 'assert'
  | 'screenshot'
  | 'navigate'
  | 'close'
  | 'connect';

interface SkillResult {
  success: boolean;
  message?: string;
  result?: unknown;
  screenshot?: string;
  error?: string;
}

function printResult(result: SkillResult) {
  console.log(JSON.stringify(result, null, 2));
}

async function saveScreenshot(base64: string): Promise<string> {
  const dir = join(tmpdir(), 'midscene-screenshots');
  await mkdir(dir, { recursive: true });
  const filename = `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const filepath = join(dir, filename);

  // base64 may have data URI prefix
  const raw = base64.replace(/^data:image\/\w+;base64,/, '');
  await writeFile(filepath, Buffer.from(raw, 'base64'));
  return filepath;
}

async function launchDetachedChrome(): Promise<string> {
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

  // Read WebSocket URL from Chrome's stderr
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
    setTimeout(
      () => reject(new Error('Chrome launch timeout')),
      15000,
    );
  });
}

async function getOrLaunchPuppeteerBrowser(): Promise<{
  browser: Browser;
  reused: boolean;
}> {
  // Try reconnecting to an existing browser
  if (existsSync(PUPPETEER_ENDPOINT_FILE)) {
    try {
      const endpoint = (
        await readFile(PUPPETEER_ENDPOINT_FILE, 'utf-8')
      ).trim();
      const browser = await puppeteer.connect({
        browserWSEndpoint: endpoint,
        defaultViewport: null,
      });
      return { browser, reused: true };
    } catch {
      try {
        await unlink(PUPPETEER_ENDPOINT_FILE);
      } catch {}
    }
  }

  // Launch Chrome as a detached process (survives Node exit)
  const wsEndpoint = await launchDetachedChrome();
  await writeFile(PUPPETEER_ENDPOINT_FILE, wsEndpoint);

  // Connect via puppeteer.connect (not launch) — no exit handler registered
  const browser = await puppeteer.connect({
    browserWSEndpoint: wsEndpoint,
    defaultViewport: null,
  });
  return { browser, reused: false };
}

async function createPlatformAgent(
  platform: Platform,
  opts: {
    bridge?: boolean;
    url?: string;
    device?: string;
    display?: string;
  },
) {
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

      // Puppeteer mode with browser session persistence
      const { browser, reused } = await getOrLaunchPuppeteerBrowser();
      _puppeteerBrowser = browser;
      const pages = await browser.pages();
      let page: Page;

      if (opts.url) {
        page = await browser.newPage();
        await page
          .goto(opts.url, { timeout: 30000, waitUntil: 'networkidle2' })
          .catch(() => {});
      } else {
        const webPages = pages.filter((p) =>
          /^https?:\/\//.test(p.url()),
        );
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

async function handleSkillCommand(
  platform: Platform,
  command: Command,
  args: string | undefined,
  opts: {
    bridge?: boolean;
    url?: string;
    device?: string;
    display?: string;
  },
): Promise<SkillResult> {
  // For navigate, use args as URL; otherwise use --url option
  const agentOpts = {
    ...opts,
    url: command === 'navigate' ? args : opts.url,
  };

  // Puppeteer close: connect to existing browser and close it
  if (platform === 'web' && !opts.bridge && command === 'close') {
    if (existsSync(PUPPETEER_ENDPOINT_FILE)) {
      try {
        const endpoint = (
          await readFile(PUPPETEER_ENDPOINT_FILE, 'utf-8')
        ).trim();
        const browser = await puppeteer.connect({
          browserWSEndpoint: endpoint,
        });
        await browser.close();
      } catch {}
      try {
        await unlink(PUPPETEER_ENDPOINT_FILE);
      } catch {}
    }
    return { success: true, message: 'Browser closed' };
  }

  const agent = await createPlatformAgent(platform, agentOpts);

  try {
    switch (command) {
      case 'act': {
        if (!args) throw new Error('act command requires an action description');
        await agent.aiAction(args);
        const screenshot = await agent.page?.screenshotBase64?.();
        const screenshotPath = screenshot
          ? await saveScreenshot(screenshot)
          : undefined;
        return {
          success: true,
          message: `Action performed: ${args}`,
          screenshot: screenshotPath,
        };
      }

      case 'query': {
        if (!args) throw new Error('query command requires a query string');
        const result = await agent.aiQuery(args);
        const screenshot = await agent.page?.screenshotBase64?.();
        const screenshotPath = screenshot
          ? await saveScreenshot(screenshot)
          : undefined;
        return {
          success: true,
          result,
          message: `Query completed: ${args}`,
          screenshot: screenshotPath,
        };
      }

      case 'assert': {
        if (!args) throw new Error('assert command requires a condition');
        try {
          await agent.aiAssert(args);
          return { success: true, message: `Assertion passed: ${args}` };
        } catch (e: any) {
          return {
            success: false,
            message: `Assertion failed: ${args}`,
            error: e.message,
          };
        }
      }

      case 'screenshot': {
        const screenshot = await agent.page?.screenshotBase64?.();
        if (!screenshot) {
          return { success: false, error: 'Screenshot not available' };
        }
        const screenshotPath = await saveScreenshot(screenshot);
        return {
          success: true,
          message: 'Screenshot captured',
          screenshot: screenshotPath,
        };
      }

      case 'navigate': {
        const screenshot = await agent.page?.screenshotBase64?.();
        const screenshotPath = screenshot
          ? await saveScreenshot(screenshot)
          : undefined;
        return {
          success: true,
          message: `Navigated to: ${args}`,
          screenshot: screenshotPath,
        };
      }

      case 'close': {
        await agent.destroy();
        return { success: true, message: 'Agent destroyed' };
      }

      case 'connect': {
        const screenshot = await agent.page?.screenshotBase64?.();
        const screenshotPath = screenshot
          ? await saveScreenshot(screenshot)
          : undefined;
        return {
          success: true,
          message: `Connected to ${platform}`,
          screenshot: screenshotPath,
        };
      }

      default:
        throw new Error(
          `Unknown command: ${command} for platform: ${platform}`,
        );
    }
  } finally {
    // Destroy agent after command, but keep browser alive for web Puppeteer mode
    if (command !== 'close') {
      const keepAlive = platform === 'web' && !opts.bridge;
      if (keepAlive) {
        // Disconnect from browser without closing it
        if (_puppeteerBrowser) {
          _puppeteerBrowser.disconnect();
          _puppeteerBrowser = null;
        }
      } else {
        try {
          await agent.destroy();
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }
}

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

export async function runSkillCli(argv: string[]) {
  // Load .env if present
  const dotEnvFile = join(process.cwd(), '.env');
  if (existsSync(dotEnvFile)) {
    dotenv.config({ path: dotEnvFile });
  }

  // Parse: skill <platform> <command> [args] [--options]
  // argv comes as everything after "skill"
  const platform = argv[0] as Platform;
  const command = argv[1] as Command;

  if (!platform || !command) {
    printUsage();
    process.exit(1);
  }

  const validPlatforms: Platform[] = ['computer', 'web', 'android', 'ios'];
  if (!validPlatforms.includes(platform)) {
    console.error(`Invalid platform: ${platform}`);
    printUsage();
    process.exit(1);
  }

  // Collect args and options
  let args: string | undefined;
  const opts: { bridge?: boolean; url?: string; device?: string; display?: string } = {};
  let i = 2;
  while (i < argv.length) {
    const token = argv[i];
    if (token === '--bridge') {
      opts.bridge = true;
    } else if (token === '--url' && argv[i + 1]) {
      opts.url = argv[++i];
    } else if (token === '--device' && argv[i + 1]) {
      opts.device = argv[++i];
    } else if (token === '--display' && argv[i + 1]) {
      opts.display = argv[++i];
    } else if (!token.startsWith('--')) {
      args = token;
    }
    i++;
  }

  try {
    const result = await handleSkillCommand(platform, command, args, opts);
    printResult(result);
    if (!result.success) {
      process.exit(1);
    }
    process.exit(0);
  } catch (e: any) {
    printResult({
      success: false,
      error: e.message || String(e),
    });
    process.exit(1);
  }
}
