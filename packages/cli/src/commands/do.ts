import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CommandModule } from 'yargs';
import type { GlobalOptions, Platform } from '../global-options';
import { type CommandResult, printResult } from '../output';
import { puppeteerBrowserManager } from '../session';
import { resolveTargetProfile } from '../target-config';
import { loadEnv } from '../cli-utils';

type DoCommand = 'act' | 'query' | 'assert' | 'screenshot' | 'navigate';

interface DoOptions extends GlobalOptions {
  bridge?: boolean;
  url?: string;
  device?: string;
  display?: string;
  headed?: boolean;
}

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

async function createPlatformAgent(platform: Platform, opts: DoOptions) {
  switch (platform) {
    case 'computer': {
      const { agentFromComputer } = await import('@midscene/computer');
      return agentFromComputer(
        opts.display ? { displayId: opts.display } : undefined,
      );
    }
    case 'web': {
      if (opts.bridge) {
        const { AgentOverChromeBridge } = await import('@midscene/web/bridge-mode');
        const agent = new AgentOverChromeBridge({ closeConflictServer: true });
        if (opts.url) {
          await agent.connectNewTabWithUrl(opts.url);
        } else {
          await agent.connectCurrentTab();
        }
        return agent;
      }

      const headless = !opts.headed;
      const { browser, reused } = await puppeteerBrowserManager.getOrLaunch({
        noAutoConnect: opts.noAutoConnect,
        headless,
      });
      puppeteerBrowserManager.activeBrowser = browser;
      const pages = await browser.pages();

      const { PuppeteerAgent } = await import('@midscene/web/puppeteer');
      let page: import('puppeteer').Page;

      if (opts.url) {
        page = await browser.newPage();
        await page.goto(opts.url, { timeout: opts.timeout ?? 30000, waitUntil: 'domcontentloaded' });
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
      const { agentFromAdbDevice } = await import('@midscene/android');
      return agentFromAdbDevice(opts.device);
    }
    case 'ios': {
      const { agentFromWebDriverAgent } = await import('@midscene/ios');
      return agentFromWebDriverAgent();
    }
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

async function handleDoCommand(
  command: DoCommand,
  args: string | undefined,
  opts: DoOptions,
): Promise<CommandResult> {
  const platform = opts.platform;
  const agentOpts: DoOptions = {
    ...opts,
    url: command === 'navigate' ? args : opts.url,
  };

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

      default:
        throw new Error(`Unknown do command: ${command}`);
    }
  } finally {
    const keepBrowserAlive = platform === 'web' && !opts.bridge;
    if (keepBrowserAlive) {
      puppeteerBrowserManager.disconnect();
    } else {
      try { await agent.destroy(); } catch {}
    }
  }
}

function resolveDoOptions(argv: Record<string, unknown>): DoOptions {
  // Apply target profile overrides
  let targetOverrides: Partial<DoOptions> = {};
  if (argv.target) {
    const profile = resolveTargetProfile(argv.target as string);
    targetOverrides = {
      platform: profile.platform ?? (argv.platform as Platform),
      url: profile.url,
      bridge: profile.bridge,
      device: profile.device,
      display: profile.display,
    };
  }

  return {
    platform: targetOverrides.platform ?? (argv.platform as Platform) ?? 'web',
    target: argv.target as string | undefined,
    timeout: argv.timeout as number | undefined,
    log: argv.log as GlobalOptions['log'],
    json: (argv.json as boolean) ?? false,
    noAutoConnect: (argv.noAutoConnect as boolean) ?? false,
    bridge: (argv.bridge as boolean) ?? targetOverrides.bridge ?? false,
    url: (argv.url as string) ?? targetOverrides.url,
    device: (argv.device as string) ?? targetOverrides.device,
    display: (argv.display as string) ?? targetOverrides.display,
    headed: (argv.headed as boolean) ?? false,
  };
}

export const doCommand: CommandModule = {
  command: 'do <command> [args]',
  describe: 'Execute a single atomic operation',
  builder: (yargs) => {
    return yargs
      .positional('command', {
        describe: 'Operation to perform',
        choices: ['act', 'query', 'assert', 'screenshot', 'navigate'] as const,
        demandOption: true,
      })
      .positional('args', {
        describe: 'Arguments for the command (e.g., action text, query, URL)',
        type: 'string',
      })
      .option('bridge', {
        type: 'boolean',
        default: false,
        description: 'Use Chrome Bridge mode (web only)',
      })
      .option('url', {
        type: 'string',
        description: 'URL to navigate or connect to (web only)',
      })
      .option('device', {
        type: 'string',
        description: 'Device ID (android only)',
      })
      .option('display', {
        type: 'string',
        description: 'Display ID (computer only)',
      })
      .option('headed', {
        type: 'boolean',
        default: false,
        description: 'Run browser in headed mode (web Puppeteer only, default is headless)',
      })
      .example('$0 do act "click the login button"', 'Perform an action')
      .example('$0 do screenshot -p computer', 'Take a desktop screenshot')
      .example('$0 do query "what is the page title?"', 'Query page content')
      .example('$0 do navigate "https://example.com"', 'Navigate to URL')
      .example('$0 do navigate "https://example.com" --headed', 'Navigate with visible browser');
  },
  handler: async (argv) => {
    loadEnv();

    const command = argv.command as DoCommand;
    const args = argv.args as string | undefined;
    const opts = resolveDoOptions(argv as Record<string, unknown>);

    try {
      const result = await handleDoCommand(command, args, opts);
      printResult(result, opts.json);
      if (!result.success) {
        process.exit(1);
      }
      process.exit(0);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      printResult({ success: false, error: message }, opts.json);
      process.exit(1);
    }
  },
};
