import type { CommandModule } from 'yargs';
import type { Platform } from '../global-options';
import { puppeteerBrowserManager } from '../session';
import { loadEnv } from '../cli-utils';

interface ConnectOptions {
  platform: Platform;
  bridge?: boolean;
  url?: string;
  device?: string;
  display?: string;
  headed?: boolean;
}

async function handleConnect(opts: ConnectOptions): Promise<string> {
  const platform = opts.platform;

  switch (platform) {
    case 'web': {
      if (opts.bridge) {
        const { AgentOverChromeBridge } = await import('@midscene/web/bridge-mode');
        const agent = new AgentOverChromeBridge({ closeConflictServer: true });
        if (opts.url) {
          await agent.connectNewTabWithUrl(opts.url);
        } else {
          await agent.connectCurrentTab();
        }
        await agent.destroy();
        return 'Connected to Chrome Bridge';
      }

      const headless = !opts.headed;
      const { browser } = await puppeteerBrowserManager.getOrLaunch({ headless });
      puppeteerBrowserManager.activeBrowser = browser;

      if (opts.url) {
        const page = await browser.newPage();
        await page.goto(opts.url, { timeout: 30000, waitUntil: 'domcontentloaded' });
      }

      puppeteerBrowserManager.disconnect();
      return 'Connected to Puppeteer browser (session kept alive)';
    }

    case 'computer': {
      const { agentFromComputer } = await import('@midscene/computer');
      const agent = await agentFromComputer(
        opts.display ? { displayId: opts.display } : undefined,
      );
      try { await agent.destroy(); } catch {}
      return 'Connected to computer';
    }

    case 'android': {
      const { agentFromAdbDevice } = await import('@midscene/android');
      const agent = await agentFromAdbDevice(opts.device);
      try { await agent.destroy(); } catch {}
      return `Connected to Android${opts.device ? ` (${opts.device})` : ''}`;
    }

    case 'ios': {
      const { agentFromWebDriverAgent } = await import('@midscene/ios');
      const agent = await agentFromWebDriverAgent();
      try { await agent.destroy(); } catch {}
      return 'Connected to iOS';
    }

    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

export const connectCommand: CommandModule = {
  command: 'connect',
  describe: 'Start or attach to a session (browser/device)',
  builder: (yargs) => {
    return yargs
      .option('bridge', {
        type: 'boolean',
        default: false,
        description: 'Use Chrome Bridge mode (web only)',
      })
      .option('url', {
        type: 'string',
        description: 'URL to navigate after connecting (web only)',
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
        default: true,
        description: 'Run browser in headed mode (web Puppeteer only, default is headed)',
      })
      .example('$0 connect -p web --headed', 'Start a headed browser session')
      .example('$0 connect -p android --device emulator-5554', 'Connect to Android device');
  },
  handler: async (argv) => {
    loadEnv();

    const opts: ConnectOptions = {
      platform: (argv.platform as Platform) ?? 'web',
      bridge: (argv.bridge as boolean) ?? false,
      url: argv.url as string | undefined,
      device: argv.device as string | undefined,
      display: argv.display as string | undefined,
      headed: (argv.headed as boolean) ?? false,
    };

    try {
      const message = await handleConnect(opts);
      console.log(message);
      process.exit(0);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  },
};
