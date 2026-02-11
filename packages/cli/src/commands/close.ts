import type { CommandModule } from 'yargs';
import type { Platform } from '../global-options';
import { puppeteerBrowserManager } from '../session';
import { loadEnv } from '../cli-utils';

async function handleClose(platform: Platform, bridge: boolean): Promise<string> {
  switch (platform) {
    case 'web': {
      if (bridge) {
        return 'Chrome Bridge sessions are managed by the extension';
      }
      await puppeteerBrowserManager.closeBrowser();
      return 'Browser closed';
    }

    case 'computer':
      return 'Computer session does not require explicit close';

    case 'android':
      return 'Android session does not require explicit close';

    case 'ios':
      return 'iOS session does not require explicit close';

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

    const platform = (argv.platform as Platform) ?? 'web';
    const bridge = (argv.bridge as boolean) ?? false;

    try {
      const message = await handleClose(platform, bridge);
      console.log(message);
      process.exit(0);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  },
};
