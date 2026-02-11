import type { CommandModule } from 'yargs';
import type { GlobalOptions, Platform } from '../global-options';
import { type CommandResult, printResult } from '../output';
import { puppeteerBrowserManager } from '../session';
import { resolveTargetProfile } from '../target-config';
import { loadEnv } from '../cli-utils';

interface ConnectOptions extends GlobalOptions {
  bridge?: boolean;
  url?: string;
  device?: string;
  display?: string;
  headed?: boolean;
}

async function handleConnect(opts: ConnectOptions): Promise<CommandResult> {
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
        // Disconnect agent but keep bridge alive
        await agent.destroy();
        return { success: true, message: 'Connected to Chrome Bridge' };
      }

      const headless = !opts.headed;
      const { browser } = await puppeteerBrowserManager.getOrLaunch({ headless });
      puppeteerBrowserManager.activeBrowser = browser;

      if (opts.url) {
        const page = await browser.newPage();
        await page.goto(opts.url, { timeout: opts.timeout ?? 30000, waitUntil: 'domcontentloaded' });
      }

      puppeteerBrowserManager.disconnect();
      return { success: true, message: 'Connected to Puppeteer browser (session kept alive)' };
    }

    case 'computer': {
      const { agentFromComputer } = await import('@midscene/computer');
      const agent = await agentFromComputer(
        opts.display ? { displayId: opts.display } : undefined,
      );
      const screenshotBase64 = await agent.page?.screenshotBase64?.();
      let screenshot: string | undefined;
      if (screenshotBase64) {
        const { mkdir, writeFile } = await import('node:fs/promises');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const dir = join(tmpdir(), 'midscene-screenshots');
        await mkdir(dir, { recursive: true });
        const filename = `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        const filepath = join(dir, filename);
        const raw = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
        await writeFile(filepath, Buffer.from(raw, 'base64'));
        screenshot = filepath;
      }
      try { await agent.destroy(); } catch {}
      return { success: true, message: 'Connected to computer', screenshot };
    }

    case 'android': {
      const { agentFromAdbDevice } = await import('@midscene/android');
      const agent = await agentFromAdbDevice(opts.device);
      try { await agent.destroy(); } catch {}
      return { success: true, message: `Connected to Android${opts.device ? ` (${opts.device})` : ''}` };
    }

    case 'ios': {
      const { agentFromWebDriverAgent } = await import('@midscene/ios');
      const agent = await agentFromWebDriverAgent();
      try { await agent.destroy(); } catch {}
      return { success: true, message: 'Connected to iOS' };
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
        default: false,
        description: 'Run browser in headed mode (web Puppeteer only)',
      })
      .example('$0 connect -p web --headed', 'Start a headed browser session')
      .example('$0 connect -p android --device emulator-5554', 'Connect to Android device');
  },
  handler: async (argv) => {
    loadEnv();

    let targetOverrides: Partial<ConnectOptions> = {};
    if (argv.target) {
      const profile = resolveTargetProfile(argv.target as string);
      targetOverrides = {
        platform: profile.platform,
        url: profile.url,
        bridge: profile.bridge,
        device: profile.device,
        display: profile.display,
      };
    }

    const opts: ConnectOptions = {
      platform: targetOverrides.platform ?? (argv.platform as Platform) ?? 'web',
      target: argv.target as string | undefined,
      timeout: argv.timeout as number | undefined,
      log: argv.log as GlobalOptions['log'],
      json: (argv.json as boolean) ?? false,
      noAutoConnect: false,
      bridge: (argv.bridge as boolean) ?? targetOverrides.bridge ?? false,
      url: (argv.url as string) ?? targetOverrides.url,
      device: (argv.device as string) ?? targetOverrides.device,
      display: (argv.display as string) ?? targetOverrides.display,
      headed: (argv.headed as boolean) ?? false,
    };

    try {
      const result = await handleConnect(opts);
      printResult(result, opts.json);
      process.exit(0);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      printResult({ success: false, error: message }, opts.json);
      process.exit(1);
    }
  },
};
