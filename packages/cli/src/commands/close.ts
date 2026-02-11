import type { CommandModule } from 'yargs';
import type { GlobalOptions, Platform } from '../global-options';
import { type CommandResult, printResult } from '../output';
import { puppeteerBrowserManager } from '../session';
import { resolveTargetProfile } from '../target-config';
import { loadEnv } from '../cli-utils';

async function handleClose(platform: Platform, opts: GlobalOptions & { bridge?: boolean }): Promise<CommandResult> {
  switch (platform) {
    case 'web': {
      if (opts.bridge) {
        return { success: true, message: 'Chrome Bridge sessions are managed by the extension' };
      }
      await puppeteerBrowserManager.closeBrowser();
      return { success: true, message: 'Browser closed' };
    }

    case 'computer': {
      return { success: true, message: 'Computer session does not require explicit close' };
    }

    case 'android': {
      return { success: true, message: 'Android session does not require explicit close' };
    }

    case 'ios': {
      return { success: true, message: 'iOS session does not require explicit close' };
    }

    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

export const closeCommand: CommandModule = {
  command: 'close',
  describe: 'Close current session',
  builder: (yargs) => {
    return yargs
      .option('bridge', {
        type: 'boolean',
        default: false,
        description: 'Close Chrome Bridge session (web only)',
      })
      .example('$0 close -p web', 'Close the Puppeteer browser session');
  },
  handler: async (argv) => {
    loadEnv();

    let targetPlatform = argv.platform as Platform;
    let bridge = (argv.bridge as boolean) ?? false;

    if (argv.target) {
      const profile = resolveTargetProfile(argv.target as string);
      if (profile.platform) targetPlatform = profile.platform;
      if (profile.bridge) bridge = profile.bridge;
    }

    const opts: GlobalOptions & { bridge?: boolean } = {
      platform: targetPlatform ?? 'web',
      target: argv.target as string | undefined,
      timeout: argv.timeout as number | undefined,
      log: argv.log as GlobalOptions['log'],
      json: (argv.json as boolean) ?? false,
      noAutoConnect: false,
      bridge,
    };

    try {
      const result = await handleClose(opts.platform, opts);
      printResult(result, opts.json);
      process.exit(0);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      printResult({ success: false, error: message }, opts.json);
      process.exit(1);
    }
  },
};
